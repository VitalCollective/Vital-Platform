-- Optional profile images. PREPARED ONLY: do not apply without approval.
-- Reuses profiles.avatar_url; no identity redesign, Auth writes or starter data.
begin;
set local lock_timeout='5s';

create function public.valid_profile_image_reference(image_reference text, profile_id uuid)
returns boolean language sql immutable set search_path=pg_catalog as $$
  select coalesce(image_reference ~ '^profile-images/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9][a-z0-9-]{0,79}[.](jpg|jpeg|png|webp)$'
    and split_part(image_reference,'/',2)=profile_id::text, false);
$$;
revoke all on function public.valid_profile_image_reference(text,uuid) from public, anon;
grant execute on function public.valid_profile_image_reference(text,uuid) to authenticated, service_role;
-- Fail on incompatible existing references; never rewrite member data implicitly.
alter table public.profiles add constraint profiles_avatar_owned_reference
  check (avatar_url is null or public.valid_profile_image_reference(avatar_url,id));

-- A new dedicated private image bucket is necessary: vital-resources is PDFs only.
-- A conflicting bucket causes failure rather than changing existing storage.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-images','profile-images',false,524288,array['image/jpeg','image/png','image/webp']);

create policy "Members read referenced profile images or their own uploads" on storage.objects
for select to authenticated using (
  bucket_id='profile-images' and public.is_authenticated_member() and (
    public.valid_profile_image_reference('profile-images/' || name,auth.uid())
    or exists(select 1 from public.profiles p where p.avatar_url='profile-images/' || name)
  )
);
create policy "Members upload their own profile images" on storage.objects
for insert to authenticated with check (
  bucket_id='profile-images' and public.is_authenticated_member()
  and public.valid_profile_image_reference('profile-images/' || name,auth.uid())
);
create policy "Members replace their own profile images" on storage.objects
for update to authenticated using (
  bucket_id='profile-images' and public.is_authenticated_member()
  and public.valid_profile_image_reference('profile-images/' || name,auth.uid())
) with check (
  bucket_id='profile-images' and public.is_authenticated_member()
  and public.valid_profile_image_reference('profile-images/' || name,auth.uid())
);
create policy "Members remove their own profile images" on storage.objects
for delete to authenticated using (
  bucket_id='profile-images' and public.is_authenticated_member()
  and public.valid_profile_image_reference('profile-images/' || name,auth.uid())
);

-- Same transactional importer; V3 additionally preserves/validates avatar_path.
-- Service-role Storage uploads do not require an Auth identity for a seed UUID.
create or replace function public.import_community_starters(payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  batch text := payload->>'batch_key';
  fingerprint text := md5(payload::text);
  previous public.community_seed_imports%rowtype;
  item jsonb;
  identity_id uuid;
  target_id uuid;
  author_id uuid;
  parent_id uuid;
  stamp timestamptz;
  image_path text;
  counts jsonb;
  expected integer;
begin
  -- EXECUTE is service-role only. Also reject calls carrying a member subject.
  if auth.uid() is not null then raise exception 'Administrative import only'; end if;
  if payload->>'schema_version' is distinct from '3'
    or payload->>'editorial_approved' is distinct from 'true'
    or batch is null or batch !~ '^[a-z0-9][a-z0-9-]{0,79}$'
    or jsonb_typeof(payload->'profiles') is distinct from 'array'
    or jsonb_typeof(payload->'posts') is distinct from 'array'
    or jsonb_typeof(payload->'replies') is distinct from 'array'
    or jsonb_typeof(payload->'reactions') is distinct from 'array' then
    raise exception 'Invalid starter bundle';
  end if;
  if jsonb_array_length(payload->'profiles') <> 30
    or jsonb_array_length(payload->'posts') not between 1 and 100
    or jsonb_array_length(payload->'replies') > 300
    or jsonb_array_length(payload->'reactions') > 300 then
    raise exception 'Starter bundle exceeds V1 bounds';
  end if;
  -- Validate every optional reference and object even on replay. Image uploads are
  -- a separately approved Storage API operation; this RPC never uploads files.
  for item in select value from jsonb_array_elements(payload->'profiles') loop
    identity_id := md5('vital-starter:profile:' || batch || ':' || (item->>'key'))::uuid;
    image_path := item->>'avatar_path';
    if image_path is not null then
      if not public.valid_profile_image_reference('profile-images/' || image_path, identity_id) then
        raise exception 'Invalid starter image reference';
      end if;
      if not exists (select 1 from storage.objects o where o.bucket_id='profile-images' and o.name=image_path
        and o.metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
        and (o.metadata->>'size')::bigint between 1 and 524288) then
        raise exception 'Starter image is missing or outside supported image limits';
      end if;
    end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('vital-community-starters', 0));
  select * into previous from public.community_seed_imports where batch_key = batch;
  if found then
    if previous.payload_hash <> fingerprint then
      raise exception 'This batch already exists with different content; no records were overwritten';
    end if;
    -- Verification is repeated below even for an identical replay.
  else
    for item in select value from jsonb_array_elements(payload->'profiles') loop
      if coalesce(item->>'key','') !~ '^[a-z0-9][a-z0-9-]{0,79}$'
        or char_length(btrim(coalesce(item->>'display_name',''))) not between 1 and 80 then
        raise exception 'Invalid starter profile';
      end if;
      identity_id := md5('vital-starter:profile:' || batch || ':' || (item->>'key'))::uuid;
      stamp := (item->>'created_at')::timestamptz;
      if stamp is null or stamp > now() then raise exception 'Invalid historical timestamp'; end if;
      -- Public community identity only. Generated auth_user_id is NULL. No Auth
      -- API/schema mutation, signup trigger, preferences or account rows.
      insert into public.profiles(id, display_name, is_seeded, seed_key, created_at, updated_at, avatar_url)
      values (identity_id, item->>'display_name', true,
        batch || ':' || (item->>'key'), stamp, stamp, case when item->>'avatar_path' is null then null else 'profile-images/' || (item->>'avatar_path') end);
    end loop;

    for item in select value from jsonb_array_elements(payload->'posts') loop
      identity_id := md5('vital-starter:post:' || batch || ':' || (item->>'key'))::uuid;
      select p.id into author_id from public.profiles p
        where p.seed_key = batch || ':' || (item->>'author_key') and p.is_seeded;
      stamp := (item->>'created_at')::timestamptz;
      if stamp is null or stamp > now() or author_id is null then raise exception 'Invalid starter post author/time'; end if;
      insert into public.community_posts(id, room_id, author_id, post_type, topic, title, body,
        activity_id, tags, is_seeded, seed_key, created_at, updated_at)
      values (identity_id, '10000000-0000-4000-8000-000000000001', author_id,
        item->>'post_type', item->>'topic', item->>'title', item->>'body', item->>'activity_id',
        array(select jsonb_array_elements_text(coalesce(nullif(item->'tags','null'::jsonb),'[]'))),
        true, batch || ':' || (item->>'key'), stamp, stamp);
    end loop;

    -- Root replies before child replies. Existing trigger enforces one level and
    -- same-post parents. Input order within either level is irrelevant.
    for item in select value from jsonb_array_elements(payload->'replies')
      order by case when value->>'parent_key' is null then 0 else 1 end loop
      identity_id := md5('vital-starter:reply:' || batch || ':' || (item->>'key'))::uuid;
      select p.id into author_id from public.profiles p
        where p.seed_key = batch || ':' || (item->>'author_key') and p.is_seeded;
      select p.id into target_id from public.community_posts p
        where p.seed_key = batch || ':' || (item->>'post_key') and p.is_seeded;
      parent_id := case when item->>'parent_key' is not null
        then md5('vital-starter:reply:' || batch || ':' || (item->>'parent_key'))::uuid end;
      stamp := (item->>'created_at')::timestamptz;
      if stamp is null or stamp > now() or author_id is null or target_id is null then
        raise exception 'Invalid starter reply author/post/time';
      end if;
      insert into public.community_comments(id, post_id, author_id, parent_comment_id,
        body, is_seeded, seed_key, created_at, updated_at)
      values (identity_id, target_id, author_id, parent_id, item->>'body', true,
        batch || ':' || (item->>'key'), stamp, stamp);
    end loop;

    for item in select value from jsonb_array_elements(payload->'reactions') loop
      select p.id into author_id from public.profiles p
        where p.seed_key = batch || ':' || (item->>'author_key') and p.is_seeded;
      stamp := (item->>'created_at')::timestamptz;
      if stamp is null or stamp > now() or author_id is null then raise exception 'Invalid starter reaction'; end if;
      if item->>'target_type' = 'post' then
        select p.id into target_id from public.community_posts p
          where p.seed_key = batch || ':' || (item->>'target_key') and p.is_seeded;
        insert into public.community_post_reactions(post_id, profile_id, reaction_type, is_seeded, seed_key, created_at)
        values (target_id, author_id, 'helpful', true, batch || ':' || (item->>'key'), stamp);
      elsif item->>'target_type' = 'reply' then
        select c.id into target_id from public.community_comments c
          where c.seed_key = batch || ':' || (item->>'target_key') and c.is_seeded;
        insert into public.community_comment_reactions(comment_id, profile_id, reaction_type, is_seeded, seed_key, created_at)
        values (target_id, author_id, 'helpful', true, batch || ':' || (item->>'key'), stamp);
      else raise exception 'Invalid starter reaction target';
      end if;
    end loop;
  end if;

  counts := jsonb_build_object(
    'profiles', (select count(*) from public.profiles where is_seeded and seed_key like batch || ':%'),
    'posts', (select count(*) from public.community_posts where is_seeded and seed_key like batch || ':%'),
    'replies', (select count(*) from public.community_comments where is_seeded and seed_key like batch || ':%'),
    'reactions', (select count(*) from public.community_post_reactions where is_seeded and seed_key like batch || ':%') +
      (select count(*) from public.community_comment_reactions where is_seeded and seed_key like batch || ':%')
  );
  for item in select to_jsonb(k) from unnest(array['profiles','posts','replies','reactions']) k loop
    expected := jsonb_array_length(payload->(item #>> '{}'));
    if (counts->>(item #>> '{}'))::integer <> expected then
      raise exception 'Starter verification failed: expected % %', expected, item;
    end if;
  end loop;
  insert into public.community_seed_imports(batch_key, payload_hash, counts)
    values (batch, fingerprint, counts) on conflict (batch_key) do nothing;
  if exists (select 1 from public.profiles p where p.seed_key like batch || ':%'
    and (not p.is_seeded or p.auth_user_id is not null
      or exists (select 1 from auth.users u where u.id = p.id))) then
    raise exception 'Starter identity verification failed';
  end if;
  for item in select value from jsonb_array_elements(payload->'profiles') loop
    if not exists (select 1 from public.profiles p where p.seed_key=batch || ':' || (item->>'key')
      and p.avatar_url is not distinct from (case when item->>'avatar_path' is null then null else 'profile-images/' || (item->>'avatar_path') end)) then
      raise exception 'Starter image-reference verification failed';
    end if;
  end loop;
  return jsonb_build_object('image_references_verified', true, 'verified', true, 'identity_mode', 'non_login_profiles',
    'counts', counts, 'replayed', previous.batch_key is not null);
end;
$$;
revoke all on function public.import_community_starters(jsonb) from public, anon, authenticated;
grant execute on function public.import_community_starters(jsonb) to service_role;


commit;

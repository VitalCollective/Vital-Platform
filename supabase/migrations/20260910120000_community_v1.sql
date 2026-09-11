-- Community V1. Extend the existing community; no private family data is exposed.
-- Prepared only: requires a separate approval before applying to a linked project.
begin;
set local lock_timeout = '5s';

-- The linked preflight found rules V1 and no legacy Community contributions.
-- Hold these tables until commit so the audited assumptions cannot change
-- between checking them and installing provenance. Drift requires a new review.
lock table public.profiles, public.community_rules, public.community_posts,
  public.community_comments, public.community_post_reactions,
  public.community_comment_reactions in access exclusive mode;
do $$
begin
  if auth.uid() is not null then raise exception 'Apply through an administrative migration connection'; end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.profiles'::regclass and c.conname = 'profiles_id_fkey'
      and c.contype = 'f' and c.confrelid = 'auth.users'::regclass
      and c.convalidated and c.confdeltype = 'c'
      and c.conkey = array[(select attnum from pg_catalog.pg_attribute
        where attrelid = 'public.profiles'::regclass and attname = 'id')]
      and c.confkey = array[(select attnum from pg_catalog.pg_attribute
        where attrelid = 'auth.users'::regclass and attname = 'id')]
  ) then raise exception 'Unexpected profile/Auth FK: review before migrating'; end if;
  if exists (select 1 from public.profiles p left join auth.users u on u.id = p.id
    where u.id is null or coalesce(u.raw_app_meta_data->>'is_seeded', 'false') <> 'false'
      or u.raw_app_meta_data->>'seed_key' is not null) then
    raise exception 'Profile/Auth integrity or legacy provenance requires review';
  end if;
  if exists (select 1 from public.community_posts)
    or exists (select 1 from public.community_comments)
    or exists (select 1 from public.community_post_reactions)
    or exists (select 1 from public.community_comment_reactions) then
    raise exception 'Legacy Community contributions require an explicit provenance audit';
  end if;
  if (select count(*) from public.community_rules) <> 1 or not exists (
    select 1 from public.community_rules where version = 1 and is_current
      and title = 'Vital Community Rules' and published_at <= now() and retired_at is null
      and btrim(content_markdown) = btrim($previous_rules$
1. Be kind and respectful. Harassment, bullying, hate, threats, and abuse are not welcome.
2. Keep children safe. Do not sexualise children or share identifying or sensitive information about them.
3. Protect privacy. Do not post another person's private or personal information without permission.
4. Keep content appropriate for a family community and do not post sexual, violent, or exploitative material.
5. Do not spam, scam, impersonate others, or deliberately spread dangerous misinformation.
6. Take care with health, safety, and wellbeing advice. Personal experience is not a substitute for professional help.
7. Report concerning content to the Vital team rather than escalating conflict in the community.
$previous_rules$)
  ) then raise exception 'Unexpected Community rules state: review before migrating'; end if;
end;
$$;

alter table public.profiles
  add column is_seeded boolean not null default false,
  add column seed_key text unique,
  add constraint profiles_seed_identity check (
    is_seeded = (seed_key is not null) and (seed_key is null or btrim(seed_key) <> '')
  );
-- Generated rather than client-writable: backfills existing genuine profiles to
-- id automatically, without UPDATEs or timestamp/notification side effects.
-- The unchanged Auth signup trigger also gets this link automatically.
alter table public.profiles
  add column auth_user_id uuid generated always as
    (case when is_seeded then null::uuid else id end) stored,
  add constraint profiles_auth_user_id_key unique (auth_user_id),
  add constraint profiles_auth_user_id_fkey foreign key (auth_user_id)
    references auth.users(id) on delete cascade;
do $$
begin
  if exists (select 1 from public.profiles
    where is_seeded or auth_user_id is distinct from id or seed_key is not null) then
    raise exception 'Genuine profile backfill did not preserve identity';
  end if;
end;
$$;
-- Only remove the old mandatory FK after the replacement has been validated.
alter table public.profiles drop constraint profiles_id_fkey;

create function public.guard_profile_identity()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE' and (new.id is distinct from old.id
    or new.is_seeded is distinct from old.is_seeded
    or new.seed_key is distinct from old.seed_key) then
    raise exception 'Profile identity and kind are immutable';
  end if;
  -- No seed UUID may alias an existing Auth identity, even during admin imports.
  -- A later Auth signup with a colliding ID fails at the existing profile PK.
  if new.is_seeded and exists (select 1 from auth.users u where u.id = new.id) then
    raise exception 'A starter profile cannot have an Auth identity';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_profile_identity() from public, anon, authenticated;
create trigger profiles_guard_identity before insert or update on public.profiles
  for each row execute function public.guard_profile_identity();

create function public.is_authenticated_member()
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (select 1 from public.profiles p
    where p.id = auth.uid() and p.auth_user_id = auth.uid() and not p.is_seeded);
$$;
revoke all on function public.is_authenticated_member() from public, anon;
grant execute on function public.is_authenticated_member() to authenticated, service_role;

-- Existing ownership/role policies remain the permissive policies. This extra
-- restrictive actor gate is ANDed with them: knowing a seed UUID cannot confer
-- ownership, report/block powers, moderator powers or private-account access.
-- It does not require rules acceptance or unrestricted posting, so genuine
-- restricted members retain safety actions. The definer lookup avoids RLS loops.
do $$
declare target_table text;
begin
  foreach target_table in array array[
    'profiles', 'families', 'family_members', 'user_preferences',
    'notification_preferences', 'newsletter_preferences', 'saved_activities',
    'activity_completions', 'activity_ratings', 'planned_activities',
    'subscription_entitlements', 'admin_roles', 'community_rooms', 'community_rules',
    'community_rule_acceptances', 'community_blocks', 'community_posts',
    'community_comments', 'community_post_reactions', 'community_comment_reactions',
    'saved_community_posts', 'community_reports', 'community_moderation_actions',
    'community_user_restrictions', 'community_content_revisions'
  ] loop
    execute format('create policy authenticated_member_actor on public.%I as restrictive for all to authenticated using (public.is_authenticated_member()) with check (public.is_authenticated_member())', target_table);
  end loop;
end;
$$;
alter table public.community_posts
  add column post_type text not null default 'discussion'
    check (post_type in ('question', 'idea', 'experience', 'tip', 'discussion')),
  add column topic text check (topic in ('Mums', 'Kids', 'Together', 'Life', 'Food')),
  add column activity_id text references public.activities(id) on delete set null,
  add column tags text[] not null default '{}'
    check (cardinality(tags) <= 10),
  add column is_seeded boolean not null default false,
  add column seed_key text unique,
  add constraint community_posts_seed_identity check (is_seeded = (seed_key is not null));
alter table public.community_comments
  add column is_seeded boolean not null default false,
  add column seed_key text unique,
  add constraint community_comments_seed_identity check (is_seeded = (seed_key is not null));
alter table public.community_post_reactions
  add column is_seeded boolean not null default false,
  add column seed_key text unique,
  add constraint community_post_reactions_seed_identity check (is_seeded = (seed_key is not null));
alter table public.community_comment_reactions
  add column is_seeded boolean not null default false,
  add column seed_key text unique,
  add constraint community_comment_reactions_seed_identity check (is_seeded = (seed_key is not null));

-- All rooms remain readable in a single catalogue. New posts use the existing
-- General room; topic is an optional classification, never a new empty room.
alter table public.community_posts add column search_document tsvector
  generated always as (
    setweight(to_tsvector('english'::regconfig, title), 'A') ||
    setweight(to_tsvector('english'::regconfig, post_type || ' ' || coalesce(topic, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, body), 'C')
  ) stored;
alter table public.community_comments add column search_document tsvector
  generated always as (to_tsvector('english'::regconfig, body)) stored;
create index community_posts_search_idx on public.community_posts using gin(search_document);
create index community_comments_search_idx on public.community_comments using gin(search_document);
create index community_posts_topic_type_recent_idx
  on public.community_posts(topic, post_type, created_at desc, id desc)
  where moderation_status = 'visible';
create index community_posts_activity_idx on public.community_posts(activity_id)
  where activity_id is not null;
create index community_posts_seed_idx on public.community_posts(is_seeded, created_at);
create index community_comments_seed_idx on public.community_comments(is_seeded, created_at);

-- Invoker triggers protect provenance even for moderators. Only administrative
-- imports with no member subject can set it. No role is trusted from client input.
create function public.guard_community_provenance()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if auth.uid() is not null or current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.is_seeded or new.seed_key is not null then
        raise exception 'Starter provenance is managed administratively';
      end if;
    elsif new.is_seeded is distinct from old.is_seeded
       or new.seed_key is distinct from old.seed_key then
      raise exception 'Starter provenance cannot be changed by members';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard_provenance before insert or update on public.profiles
  for each row execute function public.guard_community_provenance();
create trigger community_posts_guard_provenance before insert or update on public.community_posts
  for each row execute function public.guard_community_provenance();
create trigger community_comments_guard_provenance before insert or update on public.community_comments
  for each row execute function public.guard_community_provenance();
create trigger community_post_reactions_guard_provenance before insert or update on public.community_post_reactions
  for each row execute function public.guard_community_provenance();
create trigger community_comment_reactions_guard_provenance before insert or update on public.community_comment_reactions
  for each row execute function public.guard_community_provenance();

create or replace function public.can_create_community_content()
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select public.is_authenticated_member()
    and public.has_accepted_current_community_rules()
    and not public.has_active_community_restriction();
$$;

create function public.guard_community_post_classification()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if auth.uid() is not null then
    if tg_op = 'UPDATE' and old.author_id <> auth.uid() and (
      new.post_type is distinct from old.post_type or new.topic is distinct from old.topic
      or new.tags is distinct from old.tags or new.activity_id is distinct from old.activity_id
    ) then
      raise exception 'Moderators cannot rewrite post classification';
    end if;
    -- An activity may be archived after a conversation starts. Validate only a
    -- newly selected link so that unrelated moderation/removal remains possible.
    if new.activity_id is not null
      and (tg_op = 'INSERT' or new.activity_id is distinct from old.activity_id)
      and not exists (
      select 1 from public.activities a where a.id = new.activity_id and a.status = 'published'
    ) then
      raise exception 'Choose an available Vital activity';
    end if;
  end if;
  return new;
end;
$$;
create trigger community_posts_guard_classification before insert or update on public.community_posts
  for each row execute function public.guard_community_post_classification();

-- Existing rule versions/acceptances remain in history; participation requires
-- accepting this new version. Reporting, blocking and deleting own reactions
-- retain their existing policies and remain available while restricted.
do $$
begin
  update public.community_rules set is_current = false, retired_at = now() where is_current;
  insert into public.community_rules(version, title, content_markdown, is_current)
  values (2, 'Vital Community Rules', $rules$
1. Be kind. Different families find different things useful. Disagreement is welcome; judgemental parenting, bullying, hostility, harassment, hate, threats and abuse are not.
2. Keep children safe. Do not sexualise children or share identifying or sensitive information about them.
3. Protect privacy. Do not share someone else's private information without permission.
4. Keep this a family-appropriate space. No sexual, violent or exploitative material.
5. No advertisements, promotional posts, affiliate spam, repeated self-promotion or commercial solicitation. Honest conversation about something you used is welcome; sales pitches, referral codes and business promotion are not.
6. Do not spam, scam, impersonate others or deliberately spread dangerous misinformation. Personal experience is not a substitute for professional health, wellbeing or safety advice.
7. Report concerns to the Vital team rather than escalating conflict. You can also block another member.
8. Share what worked, ask when you are stuck, and leave room for ordinary family life. Ideas, not homework.
$rules$, true);
end;
$$;

-- These views use the caller's privileges/RLS, including blocks. Seed reactions
-- never manufacture Helpful social proof. Reply totals include the actual visible
-- conversation; they are navigation counts, not genuine-member metrics.
create view public.community_post_catalogue with (security_invoker = true) as
select p.id, p.author_id, p.room_id, p.title, left(p.body, 320) as excerpt,
  p.post_type, p.topic, p.tags, p.activity_id, p.is_seeded, p.locked, p.pinned,
  p.created_at, p.updated_at, p.moderation_status,
  pr.display_name as author_name, pr.is_seeded as author_is_seeded,
  a.title as activity_title,
  (select count(*) from public.community_comments c where c.post_id = p.id
     and c.moderation_status = 'visible' and not public.is_community_blocked(c.author_id)) as reply_count,
  (select count(*) from public.community_post_reactions r where r.post_id = p.id
     and r.reaction_type = 'helpful' and not r.is_seeded) as helpful_count,
  exists (select 1 from public.community_post_reactions r where r.post_id = p.id
     and r.profile_id = auth.uid() and r.reaction_type = 'helpful') as viewer_helpful
from public.community_posts p
join public.profiles pr on pr.id = p.author_id
left join public.activities a on a.id = p.activity_id;

create function public.search_community_posts(
  search_text text default '', selected_topic text default null,
  selected_type text default null, ordering text default 'recent',
  page_offset integer default 0, page_size integer default 20,
  provenance text default 'combined'
) returns jsonb language plpgsql stable security invoker set search_path = pg_catalog as $$
declare result jsonb;
begin
  if not public.is_authenticated_member() then raise exception 'Authentication required'; end if;
  if page_size is null or page_offset is null or search_text is null
    or ordering is null or provenance is null
    or page_size not between 1 and 30 or page_offset not between 0 and 10000
    or char_length(search_text) > 200 or ordering not in ('recent', 'helpful', 'relevant')
    or provenance not in ('combined', 'genuine', 'seeded') then
    raise exception 'Invalid community query';
  end if;
  with query as (
    select websearch_to_tsquery('english'::regconfig, btrim(search_text)) as terms
  ), matched as (
    select p.id, p.created_at,
      ts_rank_cd(p.search_document, q.terms) +
      coalesce((select max(ts_rank_cd(c.search_document, q.terms)) * 0.25
        from public.community_comments c where c.post_id = p.id
          and c.moderation_status = 'visible' and not public.is_community_blocked(c.author_id)
          and c.search_document @@ q.terms), 0) as relevance,
      case when ordering = 'helpful' then (select count(*)
        from public.community_post_reactions r where r.post_id = p.id
        and r.reaction_type = 'helpful' and not r.is_seeded) else 0 end as helpful
    from public.community_posts p cross join query q
    where p.moderation_status = 'visible' and public.community_post_is_visible(p.id)
      and (selected_topic is null or p.topic = selected_topic)
      and (selected_type is null or p.post_type = selected_type)
      and (provenance = 'combined' or p.is_seeded = (provenance = 'seeded'))
      and (btrim(search_text) = '' or p.search_document @@ q.terms
        or to_tsvector('english'::regconfig, array_to_string(p.tags, ' ')) @@ q.terms
        or exists (select 1 from public.activities a where a.id = p.activity_id
          and to_tsvector('english'::regconfig, a.title) @@ q.terms)
        or exists (select 1 from public.community_comments c where c.post_id = p.id
          and c.moderation_status = 'visible' and not public.is_community_blocked(c.author_id)
          and c.search_document @@ q.terms))
  ), batch as (
    select *, row_number() over (order by
      case when ordering = 'relevant' and btrim(search_text) <> '' then relevance else 0 end desc,
      helpful desc, created_at desc, id desc) as position
    from matched
    order by position limit page_size + 1 offset page_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(c) order by b.position)
      from batch b join public.community_post_catalogue c on c.id = b.id
      where b.position <= page_offset + page_size), '[]'::jsonb),
    'hasMore', (select count(*) > page_size from batch),
    'nextOffset', page_offset + page_size
  ) into result;
  return result;
end;
$$;

create function public.community_access()
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select jsonb_build_object(
    'canParticipate', public.can_create_community_content(),
    'restricted', public.has_active_community_restriction(),
    'acceptedRules', public.has_accepted_current_community_rules(),
    'isModerator', public.is_authenticated_member() and public.is_community_moderator(),
    'rules', (select to_jsonb(r) from public.community_rules r where r.is_current and r.published_at <= now())
  );
$$;

create function public.community_reply_page(target_post uuid, page_offset integer default 0, page_size integer default 20)
returns jsonb language plpgsql stable security invoker set search_path = pg_catalog as $$
declare result jsonb;
begin
  if page_size is null or page_offset is null
    or page_size not between 1 and 30 or page_offset not between 0 and 10000 then
    raise exception 'Invalid reply page';
  end if;
  with batch as (
    select c.id, c.post_id, c.author_id, c.body, c.created_at, c.is_seeded,
      c.parent_comment_id, pr.display_name as author_name,
      parent_pr.display_name as reply_to_name,
      (select count(*) from public.community_comment_reactions r where r.comment_id = c.id
        and r.reaction_type = 'helpful' and not r.is_seeded) as helpful_count,
      exists (select 1 from public.community_comment_reactions r where r.comment_id = c.id
        and r.profile_id = auth.uid() and r.reaction_type = 'helpful') as viewer_helpful,
      row_number() over (order by c.created_at, c.id) as position
    from public.community_comments c
    join public.profiles pr on pr.id = c.author_id
    left join public.community_comments parent on parent.id = c.parent_comment_id
      and parent.moderation_status = 'visible' and not public.is_community_blocked(parent.author_id)
    left join public.profiles parent_pr on parent_pr.id = parent.author_id
    where c.post_id = target_post and c.moderation_status = 'visible'
      and public.community_post_is_visible(c.post_id) and not public.is_community_blocked(c.author_id)
    order by c.created_at, c.id limit page_size + 1 offset page_offset
  ) select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(b) - 'position' order by b.position)
      from batch b where b.position <= page_offset + page_size), '[]'::jsonb),
    'hasMore', (select count(*) > page_size from batch), 'nextOffset', page_offset + page_size
  ) into result;
  return result;
end;
$$;

revoke all on public.community_post_catalogue from public, anon;
grant select on public.community_post_catalogue to authenticated, service_role;
revoke all on function public.guard_community_provenance() from public, anon, authenticated;
revoke all on function public.guard_community_post_classification() from public, anon, authenticated;
revoke all on function public.search_community_posts(text,text,text,text,integer,integer,text) from public, anon;
revoke all on function public.community_access() from public, anon;
revoke all on function public.community_reply_page(uuid,integer,integer) from public, anon;
grant execute on function public.search_community_posts(text,text,text,text,integer,integer,text) to authenticated;
grant execute on function public.community_access() to authenticated;
grant execute on function public.community_reply_page(uuid,integer,integer) to authenticated;

-- Seed import RPC and service-only ledger follow below. No seed data is installed
-- by this migration itself.

create table public.community_seed_imports (
  batch_key text primary key check (char_length(batch_key) between 1 and 80),
  payload_hash text not null,
  counts jsonb not null,
  imported_at timestamptz not null default now()
);
alter table public.community_seed_imports enable row level security;
revoke all on public.community_seed_imports from public, anon, authenticated;
grant select on public.community_seed_imports to service_role;

create function public.import_community_starters(payload jsonb)
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
  counts jsonb;
  expected integer;
begin
  -- EXECUTE is service-role only. Also reject calls carrying a member subject.
  if auth.uid() is not null then raise exception 'Administrative import only'; end if;
  if payload->>'schema_version' is distinct from '2'
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
      insert into public.profiles(id, display_name, is_seeded, seed_key, created_at, updated_at)
      values (identity_id, item->>'display_name', true,
        batch || ':' || (item->>'key'), stamp, stamp);
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
  return jsonb_build_object('verified', true, 'identity_mode', 'non_login_profiles',
    'counts', counts, 'replayed', previous.batch_key is not null);
end;
$$;
revoke all on function public.import_community_starters(jsonb) from public, anon, authenticated;
grant execute on function public.import_community_starters(jsonb) to service_role;

-- Administrative metrics explicitly exclude all seed participation and seed
-- targets. Member contributions to starter conversations can be measured
-- separately; they are not silently added to the genuine-only figures.
create function public.community_genuine_metrics()
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select jsonb_build_object(
    'members', (select count(*) from public.profiles where not is_seeded),
    'posts', (select count(*) from public.community_posts p join public.profiles a on a.id=p.author_id
      where not p.is_seeded and not a.is_seeded),
    'replies', (select count(*) from public.community_comments c
      join public.community_posts p on p.id=c.post_id join public.profiles a on a.id=c.author_id
      where not c.is_seeded and not p.is_seeded and not a.is_seeded),
    'helpful_reactions', (select count(*) from public.community_post_reactions r
      join public.community_posts p on p.id=r.post_id join public.profiles a on a.id=r.profile_id
      where not r.is_seeded and not p.is_seeded and not a.is_seeded and r.reaction_type='helpful') +
      (select count(*) from public.community_comment_reactions r
      join public.community_comments c on c.id=r.comment_id
      join public.community_posts p on p.id=c.post_id join public.profiles a on a.id=r.profile_id
      where not r.is_seeded and not c.is_seeded and not p.is_seeded and not a.is_seeded and r.reaction_type='helpful')
  );
$$;
revoke all on function public.community_genuine_metrics() from public, anon, authenticated;
grant execute on function public.community_genuine_metrics() to service_role;

commit;

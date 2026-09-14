-- Secure member account deletion. Prepared only; no data is deleted by migration.
begin;
set local lock_timeout = '5s';

lock table public.profiles, public.community_posts, public.community_comments,
  public.community_content_revisions in share row exclusive mode;

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.community_posts') is null
    or to_regclass('public.community_comments') is null
    or to_regclass('public.community_content_revisions') is null
    or not exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid = 'public.profiles'::regclass
        and attname = 'auth_user_id' and not attisdropped
    ) then
    raise exception 'Community V1 identity and content schema is required';
  end if;

  if exists (select 1 from public.community_posts where author_id is null) then
    raise exception 'Existing anonymous Community posts require review';
  end if;
end;
$$;

-- Posts may outlive a departing author only as an exact neutral tombstone when
-- another person's replies need the structural parent. Seed deletion retains
-- the prior cascade behaviour through the profile deletion trigger below.
alter table public.community_posts
  drop constraint community_posts_author_id_fkey,
  alter column author_id drop not null,
  add constraint community_posts_author_id_fkey
    foreign key (author_id) references public.profiles(id) on delete set null,
  add constraint community_posts_deleted_author_shape check (
    author_id is not null
    or (
      not is_seeded
      and seed_key is null
      and title = 'Deleted post'
      and body = 'This post was deleted by its author.'
      and post_type = 'discussion'
      and topic is null
      and cardinality(tags) = 0
      and activity_id is null
      and locked
      and not pinned
    )
  );

-- A short-lived service-only marker joins the Storage API operation to the Auth
-- deletion. It prevents any other administrative Auth deletion path from
-- bypassing avatar cleanup. The row cascades with the profile on success.
create table public.account_deletion_authorizations (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  storage_cleared_at timestamptz not null default clock_timestamp()
);
alter table public.account_deletion_authorizations enable row level security;
revoke all on table public.account_deletion_authorizations from public, anon, authenticated;
grant select, insert, update, delete on table public.account_deletion_authorizations to service_role;

-- Read-only preflight for the authenticated caller. There is deliberately no
-- profile parameter: a client cannot select somebody else for deletion.
create function public.account_deletion_manifest()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  member public.profiles%rowtype;
begin
  select p.* into member
  from public.profiles p
  where p.id = auth.uid()
    and p.auth_user_id = auth.uid()
    and not p.is_seeded;

  if not found then
    raise exception 'ACCOUNT_DELETION_NOT_GENUINE_MEMBER';
  end if;

  -- These private audit relationships use restrictive attribution FKs. A role
  -- transfer/review must happen before deleting a moderation account; otherwise
  -- safety history or the final project owner could be silently damaged.
  if exists (select 1 from public.admin_roles ar where ar.profile_id = member.id)
    or exists (select 1 from public.community_reports r where r.resolved_by = member.id)
    or exists (select 1 from public.community_moderation_actions a where a.moderator_id = member.id)
    or exists (select 1 from public.community_user_restrictions r
      where r.imposed_by = member.id or r.revoked_by = member.id) then
    raise exception 'ACCOUNT_ROLE_REQUIRES_REVIEW';
  end if;

  return jsonb_build_object(
    'profile_id', member.id,
    'avatar_reference', member.avatar_url
  );
end;
$$;

revoke all on function public.account_deletion_manifest()
  from public, anon;
grant execute on function public.account_deletion_manifest()
  to authenticated;

-- Called only by the Edge Function after a successful Storage API list/remove.
-- The profile ID is server-derived and this function is not executable by apps.
create function public.authorize_account_deletion(requested_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null
    or not exists (
      select 1 from public.profiles p
      where p.id = requested_profile_id
        and p.auth_user_id = p.id
        and not p.is_seeded
    ) then
    raise exception 'ACCOUNT_DELETION_AUTHORIZATION_DENIED';
  end if;

  if exists (select 1 from public.admin_roles ar where ar.profile_id = requested_profile_id)
    or exists (select 1 from public.community_reports r where r.resolved_by = requested_profile_id)
    or exists (select 1 from public.community_moderation_actions a where a.moderator_id = requested_profile_id)
    or exists (select 1 from public.community_user_restrictions r
      where r.imposed_by = requested_profile_id or r.revoked_by = requested_profile_id) then
    raise exception 'ACCOUNT_ROLE_REQUIRES_REVIEW';
  end if;

  insert into public.account_deletion_authorizations(profile_id, storage_cleared_at)
  values (requested_profile_id, clock_timestamp())
  on conflict (profile_id) do update
    set storage_cleared_at = excluded.storage_cleared_at;
end;
$$;

revoke all on function public.authorize_account_deletion(uuid)
  from public, anon, authenticated;
grant execute on function public.authorize_account_deletion(uuid)
  to service_role;

-- Runs inside the Auth user's hard-delete transaction via the genuine profile's
-- cascading FK. It deletes authored replies first, which leaves other people's
-- child replies in place because parent_comment_id already uses ON DELETE SET NULL.
create function public.prepare_profile_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.is_seeded then
    -- Preserve the existing administrative seed-delete cascade semantics.
    delete from public.community_posts p where p.author_id = old.id;
    return old;
  end if;

  if old.auth_user_id is distinct from old.id then
    raise exception 'Genuine account deletion requires an Auth-backed profile';
  end if;

  -- Genuine profiles must disappear only as part of the Auth deletion cascade,
  -- never as a direct Data API/profile delete that could leave a live login.
  if auth.uid() is not null or pg_trigger_depth() < 2 then
    raise exception 'Genuine profiles must be deleted through the account deletion service';
  end if;

  if not exists (
    select 1 from public.account_deletion_authorizations a
    where a.profile_id = old.id
      and a.storage_cleared_at >= clock_timestamp() - interval '5 minutes'
  ) then
    raise exception 'Account deletion requires confirmed Storage cleanup';
  end if;

  if exists (select 1 from public.admin_roles ar where ar.profile_id = old.id)
    or exists (select 1 from public.community_reports r where r.resolved_by = old.id)
    or exists (select 1 from public.community_moderation_actions a where a.moderator_id = old.id)
    or exists (select 1 from public.community_user_restrictions r
      where r.imposed_by = old.id or r.revoked_by = old.id) then
    raise exception 'ACCOUNT_ROLE_REQUIRES_REVIEW';
  end if;

  delete from public.community_comments c where c.author_id = old.id;

  -- With the member's own replies gone, posts without anybody else's replies
  -- can be removed completely. Remaining posts are scrubbed, not attributed.
  delete from public.community_posts p
  where p.author_id = old.id
    and not exists (
      select 1 from public.community_comments c where c.post_id = p.id
    );

  update public.community_posts p
  set author_id = null,
      title = 'Deleted post',
      body = 'This post was deleted by its author.',
      post_type = 'discussion',
      topic = null,
      tags = '{}'::text[],
      activity_id = null,
      locked = true,
      pinned = false
  where p.author_id = old.id;

  -- Revision snapshots contain the departed member's original text. They are
  -- not needed once that content is erased. Attribution on revisions of other
  -- people's content is detached without deleting their history.
  delete from public.community_content_revisions r where r.author_id = old.id;
  update public.community_content_revisions r set changed_by = null
  where r.changed_by = old.id;

  return old;
end;
$$;

revoke all on function public.prepare_profile_account_deletion()
  from public, anon, authenticated;
create trigger profiles_prepare_account_deletion
before delete on public.profiles
for each row execute function public.prepare_profile_account_deletion();

-- Keep tombstones in ordinary Community queries without manufacturing a new
-- profile identity. All other catalogue behaviour and caller RLS are unchanged.
create or replace view public.community_post_catalogue
with (security_invoker = true)
as
select p.id, p.author_id, p.room_id, p.title, left(p.body, 320) as excerpt,
  p.post_type, p.topic, p.tags, p.activity_id, p.is_seeded, p.locked, p.pinned,
  p.created_at, p.updated_at, p.moderation_status,
  coalesce(pr.display_name, 'Deleted member') as author_name,
  coalesce(pr.is_seeded, false) as author_is_seeded,
  a.title as activity_title,
  (select count(*) from public.community_comments c where c.post_id = p.id
     and c.moderation_status = 'visible' and not public.is_community_blocked(c.author_id)) as reply_count,
  (select count(*) from public.community_post_reactions r where r.post_id = p.id
     and r.reaction_type = 'helpful' and not r.is_seeded) as helpful_count,
  exists (select 1 from public.community_post_reactions r where r.post_id = p.id
     and r.profile_id = auth.uid() and r.reaction_type = 'helpful') as viewer_helpful
from public.community_posts p
left join public.profiles pr on pr.id = p.author_id
left join public.activities a on a.id = p.activity_id;

commit;

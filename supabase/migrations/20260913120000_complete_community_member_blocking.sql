-- Complete the existing Community block model; no content or Auth rows change.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.community_blocks') is null
    or to_regclass('public.profiles') is null
    or not exists (select 1 from pg_catalog.pg_attribute
      where attrelid = 'public.profiles'::regclass and attname = 'auth_user_id' and not attisdropped)
    or not exists (select 1 from pg_catalog.pg_attribute
      where attrelid = 'public.profiles'::regclass and attname = 'is_seeded' and not attisdropped) then
    raise exception 'Community V1 identity/block schema is required';
  end if;

  if exists (
    select 1 from public.community_blocks b
    join public.profiles blocker on blocker.id = b.blocker_id
    join public.profiles blocked on blocked.id = b.blocked_profile_id
    where blocker.is_seeded or blocker.auth_user_id is distinct from blocker.id
      or blocked.is_seeded or blocked.auth_user_id is distinct from blocked.id
  ) then
    raise exception 'Existing block relationships require identity review';
  end if;
end;
$$;

-- Kept small and SECURITY DEFINER to avoid profiles <-> blocks RLS recursion.
-- It establishes only whether the two IDs are genuine Auth-backed members.
create function public.is_blockable_community_profile(other_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    public.is_authenticated_member()
    and auth.uid() is distinct from other_profile_id
    and exists (
      select 1 from public.profiles p
      where p.id = other_profile_id
        and not p.is_seeded
        and p.auth_user_id = p.id
    );
$$;

revoke all on function public.is_blockable_community_profile(uuid)
  from public, anon;
grant execute on function public.is_blockable_community_profile(uuid)
  to authenticated, service_role;

-- Preserve the invariant even for administrative writes: blocks join two genuine
-- member identities and a signed-in member can create only their own direction.
create function public.guard_community_block_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null and new.blocker_id <> auth.uid() then
    raise exception 'Members can create only their own block relationships';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = new.blocker_id and not p.is_seeded and p.auth_user_id = p.id
  ) or not exists (
    select 1 from public.profiles p
    where p.id = new.blocked_profile_id and not p.is_seeded and p.auth_user_id = p.id
  ) then
    raise exception 'Community blocks require genuine member profiles';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_community_block_write()
  from public, anon, authenticated;
create trigger community_blocks_guard_members
before insert or update on public.community_blocks
for each row execute function public.guard_community_block_write();

drop policy "Members can create own blocks" on public.community_blocks;
create policy "Members can create own blocks"
on public.community_blocks
for insert
to authenticated
with check (
  blocker_id = auth.uid()
  and public.is_blockable_community_profile(blocked_profile_id)
);

-- The original directory policy remains useful for Community author decoration.
-- This restrictive policy adds mutual hiding while retaining moderator visibility
-- for authorised report and content review.
create policy community_profile_block_visibility
on public.profiles
as restrictive
for select
to authenticated
using (
  id = auth.uid()
  or public.is_community_moderator()
  or not public.is_community_blocked(id)
);

-- A member needs a private route back to their own outgoing blocks after normal
-- Community surfaces hide the other profile. It exposes directory fields only;
-- incoming blocks and profile biographies remain private.
create function public.community_blocked_members()
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  blocked_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select b.blocked_profile_id, p.display_name, p.avatar_url, b.created_at
  from public.community_blocks b
  join public.profiles p on p.id = b.blocked_profile_id
  where public.is_authenticated_member()
    and b.blocker_id = auth.uid()
    and not p.is_seeded
    and p.auth_user_id = p.id
  order by b.created_at desc, b.blocked_profile_id;
$$;

revoke all on function public.community_blocked_members()
  from public, anon;
grant execute on function public.community_blocked_members()
  to authenticated;

-- Existing post/comment/reaction policies call is_community_blocked(). Remove the
-- one participation exception that let a moderator reply to a blocked parent;
-- moderation reads and moderation writes remain governed by their own policies.
create or replace function public.validate_community_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  parent_post_id uuid;
  grandparent_comment_id uuid;
  parent_author_id uuid;
  parent_moderation_status text;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select cc.post_id, cc.parent_comment_id, cc.author_id, cc.moderation_status
  into parent_post_id, grandparent_comment_id, parent_author_id, parent_moderation_status
  from public.community_comments cc
  where cc.id = new.parent_comment_id;

  if not found then
    raise exception 'parent community comment does not exist';
  end if;
  if parent_post_id <> new.post_id then
    raise exception 'parent community comment must belong to the same post';
  end if;
  if grandparent_comment_id is not null then
    raise exception 'community comment replies are limited to one reply level';
  end if;
  if auth.uid() is not null and (
    parent_moderation_status <> 'visible'
    or public.is_community_blocked(parent_author_id)
  ) then
    raise exception 'parent community comment is not available';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_community_comment_parent()
  from public, anon, authenticated;

commit;

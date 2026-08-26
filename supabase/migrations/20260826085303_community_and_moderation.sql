-- Vital Collective
-- Community and moderation schema

-- =========================================================
-- COMMUNITY ROOMS AND RULES
-- =========================================================

create table public.community_rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (slug = lower(slug)),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (char_length(btrim(title)) between 1 and 100),
  check (char_length(btrim(description)) between 1 and 500),
  check (sort_order >= 0)
);

create table public.community_rules (
  version integer primary key check (version > 0),
  title text not null,
  content_markdown text not null,
  is_current boolean not null default false,
  published_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),

  check (char_length(btrim(title)) between 1 and 200),
  check (char_length(btrim(content_markdown)) > 0),
  check (not is_current or retired_at is null),
  check (retired_at is null or retired_at >= published_at)
);

create unique index community_rules_one_current_idx
  on public.community_rules (is_current)
  where is_current;

create table public.community_rule_acceptances (
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  rules_version integer not null
    references public.community_rules(version) on delete restrict,
  accepted_at timestamptz not null default now(),

  primary key (profile_id, rules_version)
);


-- =========================================================
-- BLOCKING AND COMMUNITY CONTENT
-- =========================================================

create table public.community_blocks (
  blocker_id uuid not null
    references public.profiles(id) on delete cascade,
  blocked_profile_id uuid not null
    references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_profile_id),
  check (blocker_id <> blocked_profile_id)
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.community_rooms(id) on delete restrict,
  author_id uuid not null
    references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  pinned boolean not null default false,
  locked boolean not null default false,
  moderation_status text not null default 'visible'
    check (
      moderation_status in (
        'visible',
        'removed_by_author',
        'removed_by_moderator'
      )
    ),
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  removal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (char_length(btrim(title)) between 1 and 200),
  check (char_length(btrim(body)) between 1 and 20000),
  check (removal_reason is null or char_length(btrim(removal_reason)) > 0),
  check (
    (
      moderation_status = 'visible'
      and removed_at is null
      and removed_by is null
      and removal_reason is null
    )
    or (
      moderation_status <> 'visible'
      and removed_at is not null
    )
  ),
  check (not pinned or moderation_status = 'visible')
);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null
    references public.community_posts(id) on delete cascade,
  author_id uuid not null
    references public.profiles(id) on delete cascade,
  parent_comment_id uuid
    references public.community_comments(id) on delete set null,
  body text not null,
  moderation_status text not null default 'visible'
    check (
      moderation_status in (
        'visible',
        'removed_by_author',
        'removed_by_moderator'
      )
    ),
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  removal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (parent_comment_id is null or parent_comment_id <> id),
  check (char_length(btrim(body)) between 1 and 10000),
  check (removal_reason is null or char_length(btrim(removal_reason)) > 0),
  check (
    (
      moderation_status = 'visible'
      and removed_at is null
      and removed_by is null
      and removal_reason is null
    )
    or (
      moderation_status <> 'visible'
      and removed_at is not null
    )
  )
);


-- =========================================================
-- REACTIONS AND SAVED POSTS
-- One row per profile and target permits one current reaction.
-- =========================================================

create table public.community_post_reactions (
  post_id uuid not null
    references public.community_posts(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  reaction_type text not null
    check (reaction_type in ('like', 'love', 'support', 'helpful', 'celebrate')),
  created_at timestamptz not null default now(),

  primary key (post_id, profile_id)
);

create table public.community_comment_reactions (
  comment_id uuid not null
    references public.community_comments(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  reaction_type text not null
    check (reaction_type in ('like', 'love', 'support', 'helpful', 'celebrate')),
  created_at timestamptz not null default now(),

  primary key (comment_id, profile_id)
);

create table public.saved_community_posts (
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  post_id uuid not null
    references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (profile_id, post_id)
);


-- =========================================================
-- REPORTS, RESTRICTIONS, AND PERMANENT AUDIT HISTORY
-- Polymorphic target IDs in permanent logs intentionally have no FK: the
-- historical record must survive deletion of the target content or profile.
-- =========================================================

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid
    references public.profiles(id) on delete set null,
  target_type text not null
    check (target_type in ('post', 'comment', 'profile')),
  target_id uuid not null,
  reason_category text not null
    check (
      reason_category in (
        'harassment_bullying',
        'hate_abuse',
        'sexual_inappropriate_content',
        'child_safety_concern',
        'threat_violence',
        'spam_scam',
        'privacy_personal_information',
        'misinformation_dangerous_advice',
        'other'
      )
    ),
  details text,
  status text not null default 'open'
    check (status in ('open', 'under_review', 'resolved', 'dismissed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (details is null or char_length(btrim(details)) between 1 and 4000),
  check (
    resolution_note is null
    or char_length(btrim(resolution_note)) between 1 and 4000
  ),
  check (
    (
      status in ('open', 'under_review')
      and resolved_at is null
      and resolved_by is null
    )
    or (
      status in ('resolved', 'dismissed')
      and resolved_at is not null
      and resolved_by is not null
    )
  )
);

create table public.community_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null
    references public.profiles(id) on delete restrict,
  target_profile_id uuid,
  target_post_id uuid,
  target_comment_id uuid,
  report_id uuid,
  action_type text not null
    check (
      action_type in (
        'warning',
        'post_removal',
        'post_restoration',
        'comment_removal',
        'comment_restoration',
        'post_lock',
        'post_unlock',
        'post_pin',
        'post_unpin',
        'temporary_posting_restriction',
        'suspension',
        'permanent_ban',
        'reinstatement',
        'report_dismissal'
      )
    ),
  reason text not null,
  internal_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  check (char_length(btrim(reason)) between 1 and 2000),
  check (
    internal_note is null
    or char_length(btrim(internal_note)) between 1 and 4000
  ),
  check (jsonb_typeof(metadata) = 'object'),
  check (
    action_type not in (
      'warning',
      'temporary_posting_restriction',
      'suspension',
      'permanent_ban',
      'reinstatement'
    )
    or target_profile_id is not null
  ),
  check (
    action_type not in (
      'post_removal',
      'post_restoration',
      'post_lock',
      'post_unlock',
      'post_pin',
      'post_unpin'
    )
    or target_post_id is not null
  ),
  check (
    action_type not in ('comment_removal', 'comment_restoration')
    or target_comment_id is not null
  ),
  check (action_type <> 'report_dismissal' or report_id is not null)
);

create table public.community_user_restrictions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  restriction_type text not null
    check (
      restriction_type in (
        'posting_restriction',
        'community_suspension',
        'permanent_community_ban'
      )
    ),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  reason text not null,
  imposed_by uuid not null
    references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (profile_id <> imposed_by),
  check (char_length(btrim(reason)) between 1 and 2000),
  check (ends_at is null or ends_at > starts_at),
  check (
    (
      restriction_type in ('posting_restriction', 'community_suspension')
      and ends_at is not null
    )
    or (
      restriction_type = 'permanent_community_ban'
      and ends_at is null
    )
  ),
  check (
    (
      status = 'active'
      and revoked_at is null
      and revoked_by is null
    )
    or (
      status = 'revoked'
      and revoked_at is not null
      and revoked_by is not null
    )
  )
);

create table public.community_content_revisions (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('post', 'comment')),
  content_id uuid not null,
  author_id uuid not null,
  changed_by uuid,
  change_type text not null check (change_type in ('update', 'delete')),
  snapshot jsonb not null,
  recorded_at timestamptz not null default now(),

  check (jsonb_typeof(snapshot) = 'object')
);


-- =========================================================
-- INDEXES
-- =========================================================

create index community_rooms_feed_idx
  on public.community_rooms (status, sort_order, title);

create index community_rule_acceptances_version_idx
  on public.community_rule_acceptances (rules_version, accepted_at desc);

create index community_blocks_blocked_profile_idx
  on public.community_blocks (blocked_profile_id, blocker_id);

create index community_posts_room_feed_idx
  on public.community_posts (room_id, pinned desc, created_at desc)
  where moderation_status = 'visible';

create index community_posts_created_at_idx
  on public.community_posts (created_at desc)
  where moderation_status = 'visible';

create index community_posts_author_created_idx
  on public.community_posts (author_id, created_at desc);

create index community_posts_moderation_idx
  on public.community_posts (moderation_status, updated_at desc)
  where moderation_status <> 'visible';

create index community_comments_post_created_idx
  on public.community_comments (post_id, created_at)
  where moderation_status = 'visible';

create index community_comments_parent_created_idx
  on public.community_comments (parent_comment_id, created_at)
  where parent_comment_id is not null and moderation_status = 'visible';

create index community_comments_author_created_idx
  on public.community_comments (author_id, created_at desc);

create index community_comments_moderation_idx
  on public.community_comments (moderation_status, updated_at desc)
  where moderation_status <> 'visible';

create index community_post_reactions_count_idx
  on public.community_post_reactions (post_id, reaction_type);

create index community_comment_reactions_count_idx
  on public.community_comment_reactions (comment_id, reaction_type);

create index saved_community_posts_recent_idx
  on public.saved_community_posts (profile_id, created_at desc);

create unique index community_reports_open_target_unique_idx
  on public.community_reports (reporter_id, target_type, target_id)
  where reporter_id is not null and status in ('open', 'under_review');

create index community_reports_queue_idx
  on public.community_reports (status, priority, created_at)
  where status in ('open', 'under_review');

create index community_reports_target_idx
  on public.community_reports (target_type, target_id, created_at desc);

create index community_reports_reporter_idx
  on public.community_reports (reporter_id, created_at desc);

create index community_moderation_actions_created_idx
  on public.community_moderation_actions (created_at desc);

create index community_moderation_actions_profile_idx
  on public.community_moderation_actions (target_profile_id, created_at desc)
  where target_profile_id is not null;

create index community_moderation_actions_post_idx
  on public.community_moderation_actions (target_post_id, created_at desc)
  where target_post_id is not null;

create index community_moderation_actions_comment_idx
  on public.community_moderation_actions (target_comment_id, created_at desc)
  where target_comment_id is not null;

create index community_user_restrictions_active_idx
  on public.community_user_restrictions (
    profile_id,
    restriction_type,
    starts_at,
    ends_at
  )
  where status = 'active';

create index community_user_restrictions_queue_idx
  on public.community_user_restrictions (status, ends_at, created_at desc);

create index community_content_revisions_target_idx
  on public.community_content_revisions (
    content_type,
    content_id,
    recorded_at desc
  );


-- =========================================================
-- RLS HELPERS
-- SECURITY DEFINER helpers use only fully-qualified objects and a pg_catalog
-- search path. This avoids both caller-controlled search paths and RLS recursion.
-- =========================================================

create or replace function public.is_community_moderator()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.profile_id = auth.uid()
      and ar.role in ('owner', 'admin', 'moderator')
  );
$$;

create or replace function public.is_community_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.profile_id = auth.uid()
      and ar.role in ('owner', 'admin')
  );
$$;

-- Internal rank lookup. A profile's highest assigned moderation role wins;
-- editor and support remain ordinary community members for moderation purposes.
create or replace function public.community_moderation_rank(
  requested_profile_id uuid
)
returns smallint
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    max(
      case ar.role
        when 'owner' then 3
        when 'admin' then 2
        when 'moderator' then 1
        else 0
      end
    ),
    0
  )::smallint
  from public.admin_roles ar
  where ar.profile_id = requested_profile_id;
$$;

create or replace function public.can_restrict_community_profile(
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    auth.uid() is not null
    and auth.uid() <> target_profile_id
    and public.community_moderation_rank(auth.uid())
      > public.community_moderation_rank(target_profile_id);
$$;

create or replace function public.can_revoke_community_restriction(
  target_profile_id uuid,
  imposing_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    auth.uid() is not null
    and auth.uid() <> target_profile_id
    and public.community_moderation_rank(auth.uid())
      > public.community_moderation_rank(target_profile_id)
    and public.community_moderation_rank(auth.uid())
      >= public.community_moderation_rank(imposing_profile_id);
$$;

create or replace function public.is_community_blocked(
  other_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.community_blocks cb
    where (
      cb.blocker_id = auth.uid()
      and cb.blocked_profile_id = other_profile_id
    )
    or (
      cb.blocker_id = other_profile_id
      and cb.blocked_profile_id = auth.uid()
    )
  );
$$;

create or replace function public.has_accepted_current_community_rules()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.community_rules cr
    join public.community_rule_acceptances cra
      on cra.rules_version = cr.version
    where cr.is_current
      and cr.published_at <= now()
      and cra.profile_id = auth.uid()
  );
$$;

create or replace function public.has_active_community_restriction()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.community_user_restrictions cur
    where cur.profile_id = auth.uid()
      and cur.status = 'active'
      and cur.starts_at <= now()
      and (cur.ends_at is null or cur.ends_at > now())
  );
$$;

create or replace function public.can_create_community_content()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
    )
    and public.has_accepted_current_community_rules()
    and not public.has_active_community_restriction();
$$;

create or replace function public.community_post_is_visible(
  requested_post_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.community_posts cp
    join public.community_rooms cr on cr.id = cp.room_id
    where cp.id = requested_post_id
      and cp.moderation_status = 'visible'
      and cr.status = 'active'
      and not public.is_community_blocked(cp.author_id)
  );
$$;

create or replace function public.community_post_accepts_comments(
  requested_post_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.community_posts cp
    join public.community_rooms cr on cr.id = cp.room_id
    where cp.id = requested_post_id
      and cp.moderation_status = 'visible'
      and not cp.locked
      and cr.status = 'active'
      and not public.is_community_blocked(cp.author_id)
  );
$$;

create or replace function public.is_reportable_community_target(
  requested_target_type text,
  requested_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case requested_target_type
    when 'post' then exists (
      select 1
      from public.community_posts cp
      join public.community_rooms cr on cr.id = cp.room_id
      where cp.id = requested_target_id
        and cp.author_id <> auth.uid()
        and cp.moderation_status = 'visible'
        and cr.status = 'active'
    )
    when 'comment' then exists (
      select 1
      from public.community_comments cc
      join public.community_posts cp on cp.id = cc.post_id
      join public.community_rooms cr on cr.id = cp.room_id
      where cc.id = requested_target_id
        and cc.author_id <> auth.uid()
        and cc.moderation_status = 'visible'
        and cp.moderation_status = 'visible'
        and cr.status = 'active'
    )
    when 'profile' then exists (
      select 1
      from public.profiles p
      where p.id = requested_target_id
        and p.id <> auth.uid()
    )
    else false
  end;
$$;


-- =========================================================
-- WRITE GUARDS AND AUDIT TRIGGERS
-- =========================================================

create or replace function public.enforce_community_post_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  actor_is_moderator boolean := public.is_community_moderator();
  use_moderator_path boolean;
begin
  if tg_op = 'INSERT' then
    if actor_id is not null then
      if new.author_id <> actor_id then
        raise exception 'community posts must be authored by the current profile';
      end if;

      if new.pinned
        or new.locked
        or new.moderation_status <> 'visible'
        or new.removed_at is not null
        or new.removed_by is not null
        or new.removal_reason is not null then
        raise exception 'new community posts cannot set moderation fields';
      end if;

      new.created_at := clock_timestamp();
      new.updated_at := new.created_at;
    end if;

    return new;
  end if;

  if actor_id is null then
    return new;
  end if;

  if new.id <> old.id
    or new.author_id <> old.author_id
    or new.created_at <> old.created_at then
    raise exception 'community post identity fields are immutable';
  end if;

  use_moderator_path := actor_is_moderator and (
    old.author_id <> actor_id
    or new.pinned is distinct from old.pinned
    or new.locked is distinct from old.locked
    or new.moderation_status = 'removed_by_moderator'
    or old.moderation_status = 'removed_by_moderator'
  );

  if use_moderator_path then
    if old.moderation_status = 'removed_by_author' then
      raise exception 'author-removed community posts cannot be restored by moderators';
    end if;

    if new.title is distinct from old.title
      or new.body is distinct from old.body
      or new.room_id is distinct from old.room_id then
      raise exception 'moderators may remove content but may not rewrite it';
    end if;

    if new.moderation_status is distinct from old.moderation_status then
      if new.moderation_status = 'removed_by_author' then
        raise exception 'moderators cannot impersonate an author removal';
      elsif new.moderation_status = 'removed_by_moderator' then
        if new.removal_reason is null
          or char_length(btrim(new.removal_reason)) = 0 then
          raise exception 'moderator removals require a reason';
        end if;
        new.removed_at := clock_timestamp();
        new.removed_by := actor_id;
        new.pinned := false;
      elsif new.moderation_status = 'visible' then
        new.removed_at := null;
        new.removed_by := null;
        new.removal_reason := null;
      end if;
    elsif new.removed_at is distinct from old.removed_at
      or new.removed_by is distinct from old.removed_by
      or new.removal_reason is distinct from old.removal_reason then
      raise exception 'removal details may change only with moderation status';
    end if;
  else
    if public.has_active_community_restriction() then
      raise exception 'restricted profiles cannot edit community posts';
    end if;

    if old.pinned or old.locked then
      raise exception 'pinned or locked posts cannot be edited by their authors';
    end if;

    if old.moderation_status <> 'visible' then
      raise exception 'removed community posts cannot be edited by their authors';
    end if;

    if new.room_id is distinct from old.room_id
      or new.pinned is distinct from old.pinned
      or new.locked is distinct from old.locked then
      raise exception 'community post moderation fields are protected';
    end if;

    if new.moderation_status is distinct from old.moderation_status then
      if new.moderation_status <> 'removed_by_author' then
        raise exception 'authors may only soft-remove their own posts';
      end if;

      if new.title is distinct from old.title
        or new.body is distinct from old.body then
        raise exception 'edit and removal must be separate operations';
      end if;

      new.removed_at := clock_timestamp();
      new.removed_by := actor_id;
      new.removal_reason := null;
    elsif new.removed_at is distinct from old.removed_at
      or new.removed_by is distinct from old.removed_by
      or new.removal_reason is distinct from old.removal_reason then
      raise exception 'community post removal fields are protected';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_community_comment_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  actor_is_moderator boolean := public.is_community_moderator();
  use_moderator_path boolean;
begin
  if tg_op = 'INSERT' then
    if actor_id is not null then
      if new.author_id <> actor_id then
        raise exception 'community comments must be authored by the current profile';
      end if;

      if new.moderation_status <> 'visible'
        or new.removed_at is not null
        or new.removed_by is not null
        or new.removal_reason is not null then
        raise exception 'new community comments cannot set moderation fields';
      end if;

      new.created_at := clock_timestamp();
      new.updated_at := new.created_at;
    end if;

    return new;
  end if;

  if actor_id is null then
    return new;
  end if;

  if new.id <> old.id
    or new.post_id <> old.post_id
    or new.author_id <> old.author_id
    or new.parent_comment_id is distinct from old.parent_comment_id
    or new.created_at <> old.created_at then
    raise exception 'community comment identity fields are immutable';
  end if;

  use_moderator_path := actor_is_moderator and (
    old.author_id <> actor_id
    or new.moderation_status = 'removed_by_moderator'
    or old.moderation_status = 'removed_by_moderator'
  );

  if use_moderator_path then
    if old.moderation_status = 'removed_by_author' then
      raise exception 'author-removed comments cannot be restored by moderators';
    end if;

    if new.body is distinct from old.body then
      raise exception 'moderators may remove comments but may not rewrite them';
    end if;

    if new.moderation_status is distinct from old.moderation_status then
      if new.moderation_status = 'removed_by_author' then
        raise exception 'moderators cannot impersonate an author removal';
      elsif new.moderation_status = 'removed_by_moderator' then
        if new.removal_reason is null
          or char_length(btrim(new.removal_reason)) = 0 then
          raise exception 'moderator removals require a reason';
        end if;
        new.removed_at := clock_timestamp();
        new.removed_by := actor_id;
      elsif new.moderation_status = 'visible' then
        new.removed_at := null;
        new.removed_by := null;
        new.removal_reason := null;
      end if;
    elsif new.removed_at is distinct from old.removed_at
      or new.removed_by is distinct from old.removed_by
      or new.removal_reason is distinct from old.removal_reason then
      raise exception 'removal details may change only with moderation status';
    end if;
  else
    if public.has_active_community_restriction() then
      raise exception 'restricted profiles cannot edit community comments';
    end if;

    if not public.community_post_accepts_comments(old.post_id) then
      raise exception 'comments on locked or unavailable posts cannot be edited';
    end if;

    if old.moderation_status <> 'visible' then
      raise exception 'removed comments cannot be edited by their authors';
    end if;

    if new.moderation_status is distinct from old.moderation_status then
      if new.moderation_status <> 'removed_by_author' then
        raise exception 'authors may only soft-remove their own comments';
      end if;

      if new.body is distinct from old.body then
        raise exception 'edit and removal must be separate operations';
      end if;

      new.removed_at := clock_timestamp();
      new.removed_by := actor_id;
      new.removal_reason := null;
    elsif new.removed_at is distinct from old.removed_at
      or new.removed_by is distinct from old.removed_by
      or new.removal_reason is distinct from old.removal_reason then
      raise exception 'community comment removal fields are protected';
    end if;
  end if;

  return new;
end;
$$;

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

  select
    cc.post_id,
    cc.parent_comment_id,
    cc.author_id,
    cc.moderation_status
  into
    parent_post_id,
    grandparent_comment_id,
    parent_author_id,
    parent_moderation_status
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

  if auth.uid() is not null
    and not public.is_community_moderator()
    and (
      parent_moderation_status <> 'visible'
      or public.is_community_blocked(parent_author_id)
    ) then
    raise exception 'parent community comment is not available';
  end if;

  return new;
end;
$$;

create or replace function public.archive_community_content_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.community_content_revisions (
    content_type,
    content_id,
    author_id,
    changed_by,
    change_type,
    snapshot,
    recorded_at
  )
  values (
    tg_argv[0],
    old.id,
    old.author_id,
    auth.uid(),
    lower(tg_op),
    to_jsonb(old),
    clock_timestamp()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.record_community_content_moderation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  content_kind text := tg_argv[0];
begin
  if actor_id is null or not public.is_community_moderator() then
    return new;
  end if;

  if new.moderation_status is distinct from old.moderation_status
    and (
      new.moderation_status = 'removed_by_moderator'
      or old.moderation_status = 'removed_by_moderator'
    ) then
    if content_kind = 'post' then
      insert into public.community_moderation_actions (
        moderator_id,
        target_profile_id,
        target_post_id,
        action_type,
        reason
      )
      values (
        actor_id,
        new.author_id,
        new.id,
        case
          when new.moderation_status = 'removed_by_moderator'
            then 'post_removal'
          else 'post_restoration'
        end,
        coalesce(new.removal_reason, old.removal_reason, 'Post restored')
      );
    else
      insert into public.community_moderation_actions (
        moderator_id,
        target_profile_id,
        target_comment_id,
        action_type,
        reason
      )
      values (
        actor_id,
        new.author_id,
        new.id,
        case
          when new.moderation_status = 'removed_by_moderator'
            then 'comment_removal'
          else 'comment_restoration'
        end,
        coalesce(new.removal_reason, old.removal_reason, 'Comment restored')
      );
    end if;
  end if;

  -- Keep post-only record fields inside a branch that comment triggers never
  -- enter; NEW is a dynamic trigger record and comments have no locked/pinned.
  if content_kind = 'post' then
    if new.locked is distinct from old.locked then
      insert into public.community_moderation_actions (
        moderator_id,
        target_profile_id,
        target_post_id,
        action_type,
        reason
      )
      values (
        actor_id,
        new.author_id,
        new.id,
        case when new.locked then 'post_lock' else 'post_unlock' end,
        case when new.locked then 'Post locked' else 'Post unlocked' end
      );
    end if;

    if new.pinned is distinct from old.pinned then
      insert into public.community_moderation_actions (
        moderator_id,
        target_profile_id,
        target_post_id,
        action_type,
        reason
      )
      values (
        actor_id,
        new.author_id,
        new.id,
        case when new.pinned then 'post_pin' else 'post_unpin' end,
        case when new.pinned then 'Post pinned' else 'Post unpinned' end
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_community_report_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if actor_id is not null then
      if new.reporter_id <> actor_id then
        raise exception 'community reports must use the current profile';
      end if;

      if new.status <> 'open'
        or new.priority <> 'normal'
        or new.resolution_note is not null
        or new.resolved_at is not null
        or new.resolved_by is not null then
        raise exception 'new community reports cannot set moderation fields';
      end if;

      new.created_at := clock_timestamp();
      new.updated_at := new.created_at;
    end if;

    return new;
  end if;

  if actor_id is not null then
    if new.id <> old.id
      or new.reporter_id is distinct from old.reporter_id
      or new.target_type <> old.target_type
      or new.target_id <> old.target_id
      or new.reason_category <> old.reason_category
      or new.details is distinct from old.details
      or new.created_at <> old.created_at then
      raise exception 'community report source fields are immutable';
    end if;

    if old.status in ('resolved', 'dismissed') then
      raise exception 'resolved community reports are immutable';
    end if;

    if new.status in ('resolved', 'dismissed') then
      new.resolved_at := clock_timestamp();
      new.resolved_by := actor_id;
    else
      new.resolution_note := null;
      new.resolved_at := null;
      new.resolved_by := null;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.record_community_report_dismissal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_profile uuid;
  target_post uuid;
  target_comment uuid;
begin
  if auth.uid() is not null
    and new.status = 'dismissed'
    and old.status <> 'dismissed' then
    target_profile := case when new.target_type = 'profile' then new.target_id end;
    target_post := case when new.target_type = 'post' then new.target_id end;
    target_comment := case when new.target_type = 'comment' then new.target_id end;

    insert into public.community_moderation_actions (
      moderator_id,
      target_profile_id,
      target_post_id,
      target_comment_id,
      report_id,
      action_type,
      reason
    )
    values (
      auth.uid(),
      target_profile,
      target_post,
      target_comment,
      new.id,
      'report_dismissal',
      coalesce(new.resolution_note, 'Report dismissed')
    );
  end if;

  return new;
end;
$$;

create or replace function public.enforce_community_restriction_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if actor_id is not null then
      if not public.can_restrict_community_profile(new.profile_id) then
        raise exception 'moderation hierarchy does not permit this restriction';
      end if;

      if new.imposed_by <> actor_id then
        raise exception 'community restrictions must use the current moderator';
      end if;

      if new.status <> 'active'
        or new.revoked_at is not null
        or new.revoked_by is not null then
        raise exception 'new community restrictions must be active';
      end if;

      new.created_at := clock_timestamp();
      new.updated_at := new.created_at;
    end if;

    return new;
  end if;

  if actor_id is not null then
    if not public.can_revoke_community_restriction(
      old.profile_id,
      old.imposed_by
    ) then
      raise exception 'moderation hierarchy does not permit this revocation';
    end if;

    if new.id <> old.id
      or new.profile_id <> old.profile_id
      or new.restriction_type <> old.restriction_type
      or new.starts_at <> old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.reason <> old.reason
      or new.imposed_by <> old.imposed_by
      or new.created_at <> old.created_at then
      raise exception 'community restriction details are immutable';
    end if;

    if old.status = 'revoked' then
      raise exception 'revoked community restrictions are immutable';
    end if;

    if new.status <> 'revoked' then
      raise exception 'active restrictions may only be revoked';
    end if;

    new.revoked_at := clock_timestamp();
    new.revoked_by := actor_id;
  end if;

  return new;
end;
$$;

create or replace function public.record_community_restriction_action()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.community_moderation_actions (
      moderator_id,
      target_profile_id,
      action_type,
      reason,
      metadata
    )
    values (
      new.imposed_by,
      new.profile_id,
      case new.restriction_type
        when 'posting_restriction' then 'temporary_posting_restriction'
        when 'community_suspension' then 'suspension'
        else 'permanent_ban'
      end,
      new.reason,
      jsonb_build_object(
        'restriction_id', new.id,
        'starts_at', new.starts_at,
        'ends_at', new.ends_at
      )
    );
  elsif new.status = 'revoked' and old.status <> 'revoked' then
    insert into public.community_moderation_actions (
      moderator_id,
      target_profile_id,
      action_type,
      reason,
      metadata
    )
    values (
      new.revoked_by,
      new.profile_id,
      'reinstatement',
      'Community restriction revoked',
      jsonb_build_object('restriction_id', new.id)
    );
  end if;

  return new;
end;
$$;

create or replace function public.enforce_moderation_action_insert()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is not null then
    if not public.is_community_moderator() then
      raise exception 'community moderation actions require a moderator';
    end if;

    if new.moderator_id <> actor_id then
      raise exception 'moderation actions must use the current moderator';
    end if;

    new.created_at := clock_timestamp();
  end if;

  return new;
end;
$$;

create or replace function public.enforce_community_rule_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null then
    if new.version <> old.version
      or new.title <> old.title
      or new.content_markdown <> old.content_markdown
      or new.published_at <> old.published_at
      or new.created_at <> old.created_at then
      raise exception 'published community rule versions are immutable';
    end if;

    if new.is_current then
      new.retired_at := null;
    elsif old.is_current and new.retired_at is null then
      new.retired_at := clock_timestamp();
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.set_community_acceptance_time()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null then
    new.accepted_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create or replace function public.set_community_created_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null then
    new.created_at := clock_timestamp();
  end if;
  return new;
end;
$$;


-- =========================================================
-- TRIGGERS
-- =========================================================

create trigger community_rooms_updated_at
before update on public.community_rooms
for each row execute procedure public.set_updated_at();

create trigger community_posts_archive_revision
before update or delete on public.community_posts
for each row execute procedure public.archive_community_content_revision('post');

create trigger community_posts_enforce_write
before insert or update on public.community_posts
for each row execute procedure public.enforce_community_post_write();

create trigger community_posts_updated_at
before update on public.community_posts
for each row execute procedure public.set_updated_at();

create trigger community_posts_record_moderation
after update on public.community_posts
for each row execute procedure public.record_community_content_moderation('post');

create trigger community_comments_archive_revision
before update or delete on public.community_comments
for each row execute procedure public.archive_community_content_revision('comment');

create trigger community_comments_enforce_write
before insert or update on public.community_comments
for each row execute procedure public.enforce_community_comment_write();

create trigger community_comments_validate_parent
before insert or update of parent_comment_id, post_id
on public.community_comments
for each row execute procedure public.validate_community_comment_parent();

create trigger community_comments_updated_at
before update on public.community_comments
for each row execute procedure public.set_updated_at();

create trigger community_comments_record_moderation
after update on public.community_comments
for each row execute procedure public.record_community_content_moderation('comment');

create trigger community_post_reactions_created_at
before insert on public.community_post_reactions
for each row execute procedure public.set_community_created_at();

create trigger community_comment_reactions_created_at
before insert on public.community_comment_reactions
for each row execute procedure public.set_community_created_at();

create trigger saved_community_posts_created_at
before insert on public.saved_community_posts
for each row execute procedure public.set_community_created_at();

create trigger community_blocks_created_at
before insert on public.community_blocks
for each row execute procedure public.set_community_created_at();

create trigger community_rule_acceptances_accepted_at
before insert on public.community_rule_acceptances
for each row execute procedure public.set_community_acceptance_time();

create trigger community_rules_enforce_update
before update on public.community_rules
for each row execute procedure public.enforce_community_rule_update();

create trigger community_reports_enforce_write
before insert or update on public.community_reports
for each row execute procedure public.enforce_community_report_write();

create trigger community_reports_updated_at
before update on public.community_reports
for each row execute procedure public.set_updated_at();

create trigger community_reports_record_dismissal
after update on public.community_reports
for each row execute procedure public.record_community_report_dismissal();

create trigger community_restrictions_enforce_write
before insert or update on public.community_user_restrictions
for each row execute procedure public.enforce_community_restriction_write();

create trigger community_restrictions_updated_at
before update on public.community_user_restrictions
for each row execute procedure public.set_updated_at();

create trigger community_restrictions_record_action
after insert or update on public.community_user_restrictions
for each row execute procedure public.record_community_restriction_action();

create trigger community_moderation_actions_enforce_insert
before insert on public.community_moderation_actions
for each row execute procedure public.enforce_moderation_action_insert();


-- =========================================================
-- INITIAL RULES AND ROOMS
-- Stable UUIDs allow clients and fixtures to refer to the initial rooms.
-- =========================================================

insert into public.community_rules (
  version,
  title,
  content_markdown,
  is_current
)
values (
  1,
  'Vital Community Rules',
  $rules$
1. Be kind and respectful. Harassment, bullying, hate, threats, and abuse are not welcome.
2. Keep children safe. Do not sexualise children or share identifying or sensitive information about them.
3. Protect privacy. Do not post another person's private or personal information without permission.
4. Keep content appropriate for a family community and do not post sexual, violent, or exploitative material.
5. Do not spam, scam, impersonate others, or deliberately spread dangerous misinformation.
6. Take care with health, safety, and wellbeing advice. Personal experience is not a substitute for professional help.
7. Report concerning content to the Vital team rather than escalating conflict in the community.
  $rules$,
  true
);

insert into public.community_rooms (
  id,
  slug,
  title,
  description,
  sort_order
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'general',
    'General',
    'Everyday conversation and community updates.',
    10
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'vital-mums',
    'Vital Mums',
    'Supportive conversation about motherhood, wellbeing, and life.',
    20
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'kids-and-family-life',
    'Kids & Family Life',
    'Practical ideas and shared experiences for family life.',
    30
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'activities-and-adventures',
    'Activities & Adventures',
    'Things to do, places to explore, and adventures to share.',
    40
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    'food',
    'Food',
    'Family food, recipes, ideas, and everyday mealtime help.',
    50
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    'recommendations',
    'Recommendations',
    'Trusted recommendations from other Vital members.',
    60
  ),
  (
    '10000000-0000-4000-8000-000000000007',
    'wins-and-ideas',
    'Wins & Ideas',
    'Celebrate wins and share ideas worth trying.',
    70
  );


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.community_rooms enable row level security;
alter table public.community_rules enable row level security;
alter table public.community_rule_acceptances enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_post_reactions enable row level security;
alter table public.community_comment_reactions enable row level security;
alter table public.saved_community_posts enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_moderation_actions enable row level security;
alter table public.community_user_restrictions enable row level security;
alter table public.community_content_revisions enable row level security;

-- Adult profiles are community identities. Family-member records remain private.
create policy "Community members can view adult profiles"
on public.profiles
for select
to authenticated
using (true);

create policy "Members can read active community rooms"
on public.community_rooms
for select
to authenticated
using (status = 'active');

create policy "Moderators can read all community rooms"
on public.community_rooms
for select
to authenticated
using (public.is_community_moderator());

create policy "Community admins can create rooms"
on public.community_rooms
for insert
to authenticated
with check (public.is_community_admin());

create policy "Community admins can update rooms"
on public.community_rooms
for update
to authenticated
using (public.is_community_admin())
with check (public.is_community_admin());

create policy "Members can read published community rules"
on public.community_rules
for select
to authenticated
using (published_at <= now());

create policy "Community admins can create rule versions"
on public.community_rules
for insert
to authenticated
with check (public.is_community_admin());

create policy "Community admins can retire rule versions"
on public.community_rules
for update
to authenticated
using (public.is_community_admin())
with check (public.is_community_admin());

create policy "Members can read own rule acceptances"
on public.community_rule_acceptances
for select
to authenticated
using (profile_id = auth.uid());

create policy "Moderators can read rule acceptances"
on public.community_rule_acceptances
for select
to authenticated
using (public.is_community_moderator());

create policy "Members can accept current community rules"
on public.community_rule_acceptances
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.community_rules cr
    where cr.version = rules_version
      and cr.is_current
      and cr.published_at <= now()
  )
);

create policy "Members can read own blocks"
on public.community_blocks
for select
to authenticated
using (blocker_id = auth.uid());

create policy "Members can create own blocks"
on public.community_blocks
for insert
to authenticated
with check (blocker_id = auth.uid());

create policy "Members can delete own blocks"
on public.community_blocks
for delete
to authenticated
using (blocker_id = auth.uid());

create policy "Members can read visible community posts"
on public.community_posts
for select
to authenticated
using (
  moderation_status = 'visible'
  and exists (
    select 1
    from public.community_rooms cr
    where cr.id = room_id
      and cr.status = 'active'
  )
  and not public.is_community_blocked(author_id)
);

create policy "Members can read own author-removed community posts"
on public.community_posts
for select
to authenticated
using (
  author_id = auth.uid()
  and moderation_status = 'removed_by_author'
);

create policy "Moderators can read all community posts"
on public.community_posts
for select
to authenticated
using (public.is_community_moderator());

create policy "Members can create own community posts"
on public.community_posts
for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.can_create_community_content()
  and not pinned
  and not locked
  and moderation_status = 'visible'
  and removed_at is null
  and removed_by is null
  and removal_reason is null
  and exists (
    select 1
    from public.community_rooms cr
    where cr.id = room_id
      and cr.status = 'active'
  )
);

create policy "Members can update own community posts"
on public.community_posts
for update
to authenticated
using (
  author_id = auth.uid()
  and moderation_status = 'visible'
  and not pinned
  and not locked
  and not public.has_active_community_restriction()
)
with check (
  author_id = auth.uid()
  and moderation_status in ('visible', 'removed_by_author')
  and not public.has_active_community_restriction()
);

create policy "Members can delete own community posts"
on public.community_posts
for delete
to authenticated
using (
  author_id = auth.uid()
  and moderation_status in ('visible', 'removed_by_author')
  and not pinned
  and not locked
  and not public.has_active_community_restriction()
);

create policy "Moderators can update community posts"
on public.community_posts
for update
to authenticated
using (public.is_community_moderator())
with check (public.is_community_moderator());

create policy "Members can read visible community comments"
on public.community_comments
for select
to authenticated
using (
  moderation_status = 'visible'
  and public.community_post_is_visible(post_id)
  and not public.is_community_blocked(author_id)
);

create policy "Members can read own author-removed community comments"
on public.community_comments
for select
to authenticated
using (
  author_id = auth.uid()
  and moderation_status = 'removed_by_author'
);

create policy "Moderators can read all community comments"
on public.community_comments
for select
to authenticated
using (public.is_community_moderator());

create policy "Members can create own community comments"
on public.community_comments
for insert
to authenticated
with check (
  author_id = auth.uid()
  and moderation_status = 'visible'
  and removed_at is null
  and removed_by is null
  and removal_reason is null
  and public.can_create_community_content()
  and public.community_post_accepts_comments(post_id)
);

create policy "Members can update own community comments"
on public.community_comments
for update
to authenticated
using (
  author_id = auth.uid()
  and moderation_status = 'visible'
  and public.community_post_accepts_comments(post_id)
  and not public.has_active_community_restriction()
)
with check (
  author_id = auth.uid()
  and moderation_status in ('visible', 'removed_by_author')
  and not public.has_active_community_restriction()
);

create policy "Members can delete own community comments"
on public.community_comments
for delete
to authenticated
using (
  author_id = auth.uid()
  and moderation_status in ('visible', 'removed_by_author')
  and public.community_post_is_visible(post_id)
  and not public.has_active_community_restriction()
);

create policy "Moderators can update community comments"
on public.community_comments
for update
to authenticated
using (public.is_community_moderator())
with check (public.is_community_moderator());

create policy "Members can read reactions on visible posts"
on public.community_post_reactions
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_community_moderator()
  or public.community_post_is_visible(post_id)
);

create policy "Members can add own post reactions"
on public.community_post_reactions
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and public.can_create_community_content()
  and public.community_post_is_visible(post_id)
);

create policy "Members can update own post reactions"
on public.community_post_reactions
for update
to authenticated
using (
  profile_id = auth.uid()
  and public.can_create_community_content()
)
with check (
  profile_id = auth.uid()
  and public.can_create_community_content()
  and public.community_post_is_visible(post_id)
);

create policy "Members can delete own post reactions"
on public.community_post_reactions
for delete
to authenticated
using (profile_id = auth.uid());

create policy "Members can read reactions on visible comments"
on public.community_comment_reactions
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_community_moderator()
  or exists (
    select 1
    from public.community_comments cc
    where cc.id = comment_id
      and cc.moderation_status = 'visible'
      and public.community_post_is_visible(cc.post_id)
      and not public.is_community_blocked(cc.author_id)
  )
);

create policy "Members can add own comment reactions"
on public.community_comment_reactions
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and public.can_create_community_content()
  and exists (
    select 1
    from public.community_comments cc
    where cc.id = comment_id
      and cc.moderation_status = 'visible'
      and public.community_post_is_visible(cc.post_id)
      and not public.is_community_blocked(cc.author_id)
  )
);

create policy "Members can update own comment reactions"
on public.community_comment_reactions
for update
to authenticated
using (
  profile_id = auth.uid()
  and public.can_create_community_content()
)
with check (
  profile_id = auth.uid()
  and public.can_create_community_content()
  and exists (
    select 1
    from public.community_comments cc
    where cc.id = comment_id
      and cc.moderation_status = 'visible'
      and public.community_post_is_visible(cc.post_id)
      and not public.is_community_blocked(cc.author_id)
  )
);

create policy "Members can delete own comment reactions"
on public.community_comment_reactions
for delete
to authenticated
using (profile_id = auth.uid());

create policy "Members can read own saved community posts"
on public.saved_community_posts
for select
to authenticated
using (profile_id = auth.uid());

create policy "Members can save visible community posts"
on public.saved_community_posts
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and public.community_post_is_visible(post_id)
);

create policy "Members can delete own saved community posts"
on public.saved_community_posts
for delete
to authenticated
using (profile_id = auth.uid());

create policy "Members can read own community reports"
on public.community_reports
for select
to authenticated
using (reporter_id = auth.uid());

create policy "Members can submit own community reports"
on public.community_reports
for insert
to authenticated
with check (
  reporter_id = auth.uid()
  and status = 'open'
  and priority = 'normal'
  and resolution_note is null
  and resolved_at is null
  and resolved_by is null
  and public.is_reportable_community_target(target_type, target_id)
);

create policy "Moderators can read all community reports"
on public.community_reports
for select
to authenticated
using (public.is_community_moderator());

create policy "Moderators can update community reports"
on public.community_reports
for update
to authenticated
using (public.is_community_moderator())
with check (public.is_community_moderator());

create policy "Moderators can read moderation actions"
on public.community_moderation_actions
for select
to authenticated
using (public.is_community_moderator());

create policy "Moderators can record moderation actions"
on public.community_moderation_actions
for insert
to authenticated
with check (
  moderator_id = auth.uid()
  and public.is_community_moderator()
);

create policy "Members can read own community restrictions"
on public.community_user_restrictions
for select
to authenticated
using (profile_id = auth.uid());

create policy "Moderators can read community restrictions"
on public.community_user_restrictions
for select
to authenticated
using (public.is_community_moderator());

create policy "Moderators can create community restrictions"
on public.community_user_restrictions
for insert
to authenticated
with check (
  imposed_by = auth.uid()
  and public.is_community_moderator()
  and public.can_restrict_community_profile(profile_id)
  and status = 'active'
  and revoked_at is null
  and revoked_by is null
);

create policy "Moderators can revoke community restrictions"
on public.community_user_restrictions
for update
to authenticated
using (
  public.is_community_moderator()
  and public.can_revoke_community_restriction(profile_id, imposed_by)
)
with check (
  public.is_community_moderator()
  and public.can_revoke_community_restriction(profile_id, imposed_by)
);

create policy "Moderators can read content revision history"
on public.community_content_revisions
for select
to authenticated
using (public.is_community_moderator());


-- =========================================================
-- DATA API PRIVILEGES
-- RLS still decides which rows each authenticated caller may access.
-- =========================================================

revoke all on table public.community_rooms from anon, authenticated;
revoke all on table public.community_rules from anon, authenticated;
revoke all on table public.community_rule_acceptances from anon, authenticated;
revoke all on table public.community_blocks from anon, authenticated;
revoke all on table public.community_posts from anon, authenticated;
revoke all on table public.community_comments from anon, authenticated;
revoke all on table public.community_post_reactions from anon, authenticated;
revoke all on table public.community_comment_reactions from anon, authenticated;
revoke all on table public.saved_community_posts from anon, authenticated;
revoke all on table public.community_reports from anon, authenticated;
revoke all on table public.community_moderation_actions from anon, authenticated;
revoke all on table public.community_user_restrictions from anon, authenticated;
revoke all on table public.community_content_revisions from anon, authenticated;

grant select, insert, update on table public.community_rooms to authenticated;
grant select, insert, update on table public.community_rules to authenticated;
grant select, insert on table public.community_rule_acceptances to authenticated;
grant select, insert, delete on table public.community_blocks to authenticated;
grant select, insert, update, delete on table public.community_posts to authenticated;
grant select, insert, update, delete on table public.community_comments to authenticated;
grant select, insert, update, delete
  on table public.community_post_reactions to authenticated;
grant select, insert, update, delete
  on table public.community_comment_reactions to authenticated;
grant select, insert, delete on table public.saved_community_posts to authenticated;
grant select, insert, update on table public.community_reports to authenticated;
grant select, insert on table public.community_moderation_actions to authenticated;
grant select, insert, update
  on table public.community_user_restrictions to authenticated;
grant select on table public.community_content_revisions to authenticated;
grant select on table public.profiles to authenticated;

grant all privileges on table public.community_rooms to service_role;
grant all privileges on table public.community_rules to service_role;
grant all privileges on table public.community_rule_acceptances to service_role;
grant all privileges on table public.community_blocks to service_role;
grant all privileges on table public.community_posts to service_role;
grant all privileges on table public.community_comments to service_role;
grant all privileges on table public.community_post_reactions to service_role;
grant all privileges on table public.community_comment_reactions to service_role;
grant all privileges on table public.saved_community_posts to service_role;
grant all privileges on table public.community_reports to service_role;
grant all privileges on table public.community_moderation_actions to service_role;
grant all privileges on table public.community_user_restrictions to service_role;
grant all privileges on table public.community_content_revisions to service_role;

revoke all on function public.is_community_moderator() from public;
revoke all on function public.is_community_admin() from public;
revoke all on function public.community_moderation_rank(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_restrict_community_profile(uuid)
  from public, anon;
revoke all on function public.can_revoke_community_restriction(uuid, uuid)
  from public, anon;
revoke all on function public.is_community_blocked(uuid) from public;
revoke all on function public.has_accepted_current_community_rules() from public;
revoke all on function public.has_active_community_restriction() from public;
revoke all on function public.can_create_community_content() from public;
revoke all on function public.community_post_is_visible(uuid) from public;
revoke all on function public.community_post_accepts_comments(uuid) from public;
revoke all on function public.is_reportable_community_target(text, uuid) from public;

grant execute on function public.is_community_moderator() to authenticated;
grant execute on function public.is_community_admin() to authenticated;
grant execute on function public.can_restrict_community_profile(uuid)
  to authenticated;
grant execute on function public.can_revoke_community_restriction(uuid, uuid)
  to authenticated;
grant execute on function public.is_community_blocked(uuid) to authenticated;
grant execute on function public.has_accepted_current_community_rules()
  to authenticated;
grant execute on function public.has_active_community_restriction()
  to authenticated;
grant execute on function public.can_create_community_content() to authenticated;
grant execute on function public.community_post_is_visible(uuid) to authenticated;
grant execute on function public.community_post_accepts_comments(uuid)
  to authenticated;
grant execute on function public.is_reportable_community_target(text, uuid)
  to authenticated;

grant execute on function public.is_community_moderator() to service_role;
grant execute on function public.is_community_admin() to service_role;
grant execute on function public.can_restrict_community_profile(uuid)
  to service_role;
grant execute on function public.can_revoke_community_restriction(uuid, uuid)
  to service_role;
grant execute on function public.is_community_blocked(uuid) to service_role;
grant execute on function public.has_accepted_current_community_rules()
  to service_role;
grant execute on function public.has_active_community_restriction()
  to service_role;
grant execute on function public.can_create_community_content() to service_role;
grant execute on function public.community_post_is_visible(uuid) to service_role;
grant execute on function public.community_post_accepts_comments(uuid)
  to service_role;
grant execute on function public.is_reportable_community_target(text, uuid)
  to service_role;

revoke all on function public.enforce_community_post_write() from public;
revoke all on function public.enforce_community_comment_write() from public;
revoke all on function public.validate_community_comment_parent() from public;
revoke all on function public.archive_community_content_revision() from public;
revoke all on function public.record_community_content_moderation() from public;
revoke all on function public.enforce_community_report_write() from public;
revoke all on function public.record_community_report_dismissal() from public;
revoke all on function public.enforce_community_restriction_write() from public;
revoke all on function public.record_community_restriction_action() from public;
revoke all on function public.enforce_moderation_action_insert() from public;
revoke all on function public.enforce_community_rule_update() from public;
revoke all on function public.set_community_acceptance_time() from public;
revoke all on function public.set_community_created_at() from public;

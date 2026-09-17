-- RevenueCat subscription foundation. Prepared only: do not apply without a
-- separate release approval and configured RevenueCat/store environments.
begin;
set local lock_timeout = '5s';

alter table public.subscription_entitlements
  drop constraint subscription_entitlements_status_check,
  add column store text,
  add column platform text,
  add column environment text,
  add column revenuecat_customer_id uuid,
  add column offering_id text,
  add column plan_kind text,
  add column grace_period_ends_at timestamptz,
  add column cancelled_at timestamptz,
  add column billing_issue_at timestamptz,
  add column trial_started_at timestamptz,
  add column trial_ends_at timestamptz,
  add column refunded_at timestamptz,
  add column revoked_at timestamptz,
  add column provider_updated_at timestamptz,
  add column provider_verified_at timestamptz,
  add column source_event_id text,
  add constraint subscription_entitlements_status_check check (
    status in (
      'trial', 'active', 'cancelled', 'grace_period', 'billing_issue',
      'expired', 'refunded', 'revoked'
    )
  ),
  add constraint subscription_entitlements_provider_check
    check (provider = 'revenuecat'),
  add constraint subscription_entitlements_store_check
    check (store is null or store in ('app_store', 'play_store', 'promotional', 'unknown')),
  add constraint subscription_entitlements_platform_check
    check (platform is null or platform in ('ios', 'android', 'unknown')),
  add constraint subscription_entitlements_environment_check
    check (environment is null or environment in ('sandbox', 'production')),
  add constraint subscription_entitlements_plan_kind_check check (
    plan_kind is null or plan_kind in (
      'standard_monthly', 'standard_annual',
      'partner_monthly', 'partner_annual', 'unknown'
    )
  ),
  add constraint subscription_entitlements_customer_matches_profile check (
    revenuecat_customer_id is null or revenuecat_customer_id = profile_id
  );

create index subscription_entitlements_access_idx
  on public.subscription_entitlements(profile_id, entitlement_id, status, expires_at);

comment on table public.subscription_entitlements is
  'Server-verified RevenueCat entitlement projection used by Vital access controls. Clients cannot write it.';
comment on column public.subscription_entitlements.auto_renewing is
  'Renewal intent only. False does not remove access before the verified entitlement end.';

create table public.subscription_provider_events (
  event_id text primary key check (btrim(event_id) <> ''),
  provider text not null default 'revenuecat' check (provider = 'revenuecat'),
  event_type text not null check (btrim(event_type) <> ''),
  environment text not null check (environment in ('sandbox', 'production')),
  customer_id_hash text not null check (customer_id_hash ~ '^[0-9a-f]{64}$'),
  profile_id uuid references public.profiles(id) on delete set null,
  processing_status text not null default 'processing'
    check (processing_status in ('processing', 'processed', 'ignored', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  received_at timestamptz not null default clock_timestamp(),
  processing_started_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 100)
);

comment on table public.subscription_provider_events is
  'Minimal idempotency ledger. It stores no webhook payload, email or family/Community data; profile deletion leaves only a one-way customer hash.';

alter table public.subscription_provider_events enable row level security;
revoke all on table public.subscription_provider_events from public, anon, authenticated;
grant select, insert, update on table public.subscription_provider_events to service_role;

create function public.has_valid_vital_membership()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles p
    join public.subscription_entitlements e on e.profile_id = p.id
    where p.id = auth.uid()
      and p.auth_user_id = auth.uid()
      and not p.is_seeded
      and e.entitlement_id = 'vital_membership'
      and e.provider = 'revenuecat'
      and e.revenuecat_customer_id = auth.uid()
      and e.environment in ('sandbox', 'production')
      and e.provider_verified_at is not null
      and (
        (e.status in ('trial', 'active', 'cancelled') and e.expires_at > statement_timestamp())
        or (
          e.status = 'grace_period'
          and coalesce(e.grace_period_ends_at, e.expires_at) > statement_timestamp()
        )
      )
      and e.refunded_at is null
      and e.revoked_at is null
  );
$$;

revoke all on function public.has_valid_vital_membership() from public, anon;
grant execute on function public.has_valid_vital_membership() to authenticated, service_role;

create function public.current_vital_membership()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  membership public.subscription_entitlements%rowtype;
  has_access boolean := false;
  exposed_state text := 'no_entitlement';
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.auth_user_id = auth.uid() and not p.is_seeded
  ) then
    raise exception 'Authenticated Vital member required';
  end if;

  select e.* into membership
  from public.subscription_entitlements e
  where e.profile_id = auth.uid() and e.entitlement_id = 'vital_membership'
  order by e.updated_at desc
  limit 1;

  if not found then
    return jsonb_build_object('state', exposed_state, 'has_access', false);
  end if;

  has_access := membership.provider = 'revenuecat'
    and membership.revenuecat_customer_id = auth.uid()
    and membership.environment in ('sandbox', 'production')
    and membership.provider_verified_at is not null
    and (
      (
        membership.status in ('trial', 'active', 'cancelled')
        and membership.expires_at > statement_timestamp()
      ) or (
        membership.status = 'grace_period'
        and coalesce(membership.grace_period_ends_at, membership.expires_at) > statement_timestamp()
      )
    )
    and membership.refunded_at is null
    and membership.revoked_at is null;

  exposed_state := case
    when membership.status = 'trial' and has_access then 'trial_active'
    when membership.status = 'active' and has_access then 'active'
    when membership.status = 'cancelled' and has_access then 'cancelled'
    when membership.status = 'grace_period' and has_access then 'grace_period'
    when membership.status = 'refunded' or membership.refunded_at is not null then 'refunded'
    when membership.status = 'revoked' or membership.revoked_at is not null then 'revoked'
    when membership.status = 'billing_issue' then 'billing_issue'
    else 'expired'
  end;

  return jsonb_strip_nulls(jsonb_build_object(
    'state', exposed_state,
    'has_access', has_access,
    'plan_kind', membership.plan_kind,
    'product_id', membership.product_id,
    'store', membership.store,
    'platform', membership.platform,
    'environment', membership.environment,
    'started_at', membership.started_at,
    'period_ends_at', membership.expires_at,
    'grace_period_ends_at', membership.grace_period_ends_at,
    'trial_ends_at', membership.trial_ends_at,
    'auto_renewing', membership.auto_renewing,
    'billing_issue', membership.billing_issue_at is not null,
    'provider_verified_at', membership.provider_verified_at
  ));
end;
$$;

revoke all on function public.current_vital_membership() from public, anon;
grant execute on function public.current_vital_membership() to authenticated, service_role;

create function public.apply_revenuecat_membership_state(
  requested_profile_id uuid,
  state jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  next_status text := state->>'status';
  next_store text := nullif(state->>'store', '');
  next_platform text := nullif(state->>'platform', '');
  next_environment text := nullif(state->>'environment', '');
  next_plan text := nullif(state->>'plan_kind', '');
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = requested_profile_id
      and p.auth_user_id = requested_profile_id
      and not p.is_seeded
  ) then
    raise exception 'RevenueCat state target is not a genuine member';
  end if;
  if state->>'entitlement_id' is distinct from 'vital_membership'
    or state->>'provider' is distinct from 'revenuecat'
    or (state->>'revenuecat_customer_id')::uuid is distinct from requested_profile_id
    or next_status not in (
      'trial', 'active', 'cancelled', 'grace_period', 'billing_issue',
      'expired', 'refunded', 'revoked'
    )
    or next_store is null or next_store not in ('app_store', 'play_store', 'promotional', 'unknown')
    or next_platform is null or next_platform not in ('ios', 'android', 'unknown')
    or next_environment is null or next_environment not in ('sandbox', 'production')
    or next_plan is null or next_plan not in (
      'standard_monthly', 'standard_annual',
      'partner_monthly', 'partner_annual', 'unknown'
    ) then
    raise exception 'Invalid RevenueCat membership state';
  end if;

  insert into public.subscription_entitlements (
    profile_id, entitlement_id, provider, status, store, platform, environment,
    revenuecat_customer_id, offering_id, product_id, plan_kind, started_at,
    expires_at, grace_period_ends_at, cancelled_at, billing_issue_at,
    trial_started_at, trial_ends_at, refunded_at, revoked_at,
    auto_renewing, provider_updated_at, provider_verified_at, source_event_id
  ) values (
    requested_profile_id, 'vital_membership', 'revenuecat', next_status,
    next_store, next_platform, next_environment, requested_profile_id,
    nullif(state->>'offering_id', ''), nullif(state->>'product_id', ''), next_plan,
    nullif(state->>'started_at', '')::timestamptz,
    nullif(state->>'expires_at', '')::timestamptz,
    nullif(state->>'grace_period_ends_at', '')::timestamptz,
    nullif(state->>'cancelled_at', '')::timestamptz,
    nullif(state->>'billing_issue_at', '')::timestamptz,
    nullif(state->>'trial_started_at', '')::timestamptz,
    nullif(state->>'trial_ends_at', '')::timestamptz,
    nullif(state->>'refunded_at', '')::timestamptz,
    nullif(state->>'revoked_at', '')::timestamptz,
    coalesce((state->>'auto_renewing')::boolean, false),
    nullif(state->>'provider_updated_at', '')::timestamptz,
    clock_timestamp(), nullif(state->>'source_event_id', '')
  )
  on conflict (profile_id, entitlement_id) do update set
    provider = excluded.provider,
    status = excluded.status,
    store = excluded.store,
    platform = excluded.platform,
    environment = excluded.environment,
    revenuecat_customer_id = excluded.revenuecat_customer_id,
    offering_id = excluded.offering_id,
    product_id = excluded.product_id,
    plan_kind = excluded.plan_kind,
    started_at = excluded.started_at,
    expires_at = excluded.expires_at,
    grace_period_ends_at = excluded.grace_period_ends_at,
    cancelled_at = excluded.cancelled_at,
    billing_issue_at = excluded.billing_issue_at,
    trial_started_at = excluded.trial_started_at,
    trial_ends_at = excluded.trial_ends_at,
    refunded_at = excluded.refunded_at,
    revoked_at = excluded.revoked_at,
    auto_renewing = excluded.auto_renewing,
    provider_updated_at = excluded.provider_updated_at,
    provider_verified_at = excluded.provider_verified_at,
    source_event_id = excluded.source_event_id;
end;
$$;

revoke all on function public.apply_revenuecat_membership_state(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_revenuecat_membership_state(uuid, jsonb)
  to service_role;

create function public.clear_revenuecat_membership_state(requested_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = requested_profile_id
      and p.auth_user_id = requested_profile_id
      and not p.is_seeded
  ) then
    raise exception 'RevenueCat state target is not a genuine member';
  end if;
  delete from public.subscription_entitlements e
  where e.profile_id = requested_profile_id
    and e.entitlement_id = 'vital_membership'
    and e.provider = 'revenuecat';
end;
$$;

revoke all on function public.clear_revenuecat_membership_state(uuid)
  from public, anon, authenticated;
grant execute on function public.clear_revenuecat_membership_state(uuid)
  to service_role;

create function public.claim_subscription_provider_event(
  requested_event_id text,
  requested_event_type text,
  requested_environment text,
  requested_customer_id_hash text,
  requested_profile_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  claimed_id text;
  existing_status text;
begin
  if requested_event_id is null or btrim(requested_event_id) = ''
    or requested_event_type is null or btrim(requested_event_type) = ''
    or requested_environment not in ('sandbox', 'production')
    or requested_customer_id_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid subscription event claim';
  end if;

  insert into public.subscription_provider_events (
    event_id, event_type, environment, customer_id_hash, profile_id
  ) values (
    requested_event_id, requested_event_type, requested_environment,
    requested_customer_id_hash, requested_profile_id
  ) on conflict (event_id) do nothing
  returning event_id into claimed_id;

  if claimed_id is not null then return 'claimed'; end if;

  select e.processing_status into existing_status
  from public.subscription_provider_events e
  where e.event_id = requested_event_id;
  if existing_status in ('processed', 'ignored') then return 'duplicate'; end if;

  update public.subscription_provider_events e
  set processing_status = 'processing',
      processing_started_at = clock_timestamp(),
      attempt_count = e.attempt_count + 1,
      last_error_code = null
  where e.event_id = requested_event_id
    and (
      e.processing_status = 'failed'
      or e.processing_started_at < clock_timestamp() - interval '5 minutes'
    )
  returning e.event_id into claimed_id;

  return case when claimed_id is null then 'busy' else 'claimed' end;
end;
$$;

create function public.complete_subscription_provider_event(
  requested_event_id text,
  requested_status text,
  requested_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if requested_status not in ('processed', 'ignored', 'failed')
    or requested_error_code is not null and char_length(requested_error_code) > 100 then
    raise exception 'Invalid subscription event completion';
  end if;
  update public.subscription_provider_events e
  set processing_status = requested_status,
      processed_at = case when requested_status in ('processed', 'ignored')
        then clock_timestamp() else null end,
      last_error_code = requested_error_code
  where e.event_id = requested_event_id and e.processing_status = 'processing';
  if not found then raise exception 'Subscription event is not processing'; end if;
end;
$$;

revoke all on function public.claim_subscription_provider_event(text, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_subscription_provider_event(text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_subscription_provider_event(text, text, text, text, uuid)
  to service_role;
grant execute on function public.complete_subscription_provider_event(text, text, text)
  to service_role;

-- The entitlement projection is available through current_vital_membership().
-- Prevent mobile clients from discovering newly added provider identifiers or
-- ever mutating verified state directly.
revoke all on table public.subscription_entitlements from anon, authenticated;
grant select, insert, update, delete on table public.subscription_entitlements to service_role;

-- This existing SECURITY DEFINER directory endpoint intentionally bypasses
-- profile/block RLS to show a member their own outgoing blocks. Add the paid
-- access check inside the function so it cannot bypass the subscription gate.
create or replace function public.community_blocked_members()
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
  where public.has_valid_vital_membership()
    and public.is_authenticated_member()
    and b.blocker_id = auth.uid()
    and not p.is_seeded
    and p.auth_user_id = p.id
  order by b.created_at desc, b.blocked_profile_id;
$$;

revoke all on function public.community_blocked_members() from public, anon;
grant execute on function public.community_blocked_members() to authenticated;

-- Every substantive member table gains a restrictive entitlement gate. The
-- existing ownership, publication and Community policies remain in force too.
do $$
declare target_table text;
begin
  foreach target_table in array array[
    'families', 'family_members', 'user_preferences', 'notification_preferences',
    'newsletter_preferences', 'activities', 'resources', 'activity_resources',
    'collections', 'collection_activities', 'articles', 'article_activities',
    'newsletter_issues', 'newsletter_issue_activities', 'home_modules',
    'saved_activities', 'activity_completions', 'activity_ratings',
    'planned_activities', 'admin_roles', 'feature_flags', 'community_rooms',
    'community_rules', 'community_rule_acceptances', 'community_blocks',
    'community_posts', 'community_comments', 'community_post_reactions',
    'community_comment_reactions', 'saved_community_posts', 'community_reports',
    'community_moderation_actions', 'community_user_restrictions',
    'community_content_revisions'
  ] loop
    execute format(
      'create policy vital_membership_required on public.%I as restrictive for all to authenticated using (public.has_valid_vital_membership()) with check (public.has_valid_vital_membership())',
      target_table
    );
  end loop;
end;
$$;

-- A signed-in person may still read/update only their own profile for account
-- management. Other Community identities require membership.
create policy vital_membership_or_own_profile
on public.profiles as restrictive for all to authenticated
using (id = auth.uid() or public.has_valid_vital_membership())
with check (id = auth.uid() or public.has_valid_vital_membership());

drop policy if exists "Authenticated members can read Vital resource PDFs"
  on storage.objects;
create policy "Entitled members can read Vital resource PDFs"
on storage.objects
for select
to authenticated
using (bucket_id = 'vital-resources' and public.has_valid_vital_membership());
comment on policy "Entitled members can read Vital resource PDFs"
on storage.objects is
  'Private Vital resource PDFs require a current server-verified vital_membership entitlement.';

commit;

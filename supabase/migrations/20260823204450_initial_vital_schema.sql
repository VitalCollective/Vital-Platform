-- Vital Collective
-- Initial production-grade core schema

-- =========================================================
-- Utility
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =========================================================
-- USERS & FAMILIES
-- =========================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Vital Member',
  username text unique,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Our Family',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  display_name text not null,
  relationship text,
  age_years smallint check (age_years between 0 and 120),
  age_band text,
  interests text[] not null default '{}'::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_sections text[] not null default '{}'::text[],
  interests text[] not null default '{}'::text[],
  default_indoor boolean,
  default_outdoor boolean,
  updated_at timestamptz not null default now()
);

create table public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  community_replies boolean not null default true,
  planned_activity_reminders boolean not null default true,
  recommendations boolean not null default true,
  editorial_updates boolean not null default true,
  product_updates boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.newsletter_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  subscribed boolean not null default true,
  subscribed_at timestamptz,
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now()
);


-- =========================================================
-- VITAL ACTIVITY LIBRARY
-- =========================================================

create table public.activities (
  id text primary key,
  type text not null,
  section text not null check (
    section in (
      'Vital Kids',
      'Vital Together',
      'Vital Life',
      'Vital Food',
      'Vital Mums'
    )
  ),
  title text not null,
  age_min text,
  age_max text,
  summary text,
  instructions text,
  why_children_enjoy_it text,
  physical_benefits text,
  mental_benefits text,
  social_benefits text,
  indoor boolean not null default false,
  outdoor boolean not null default false,
  cost text,
  equipment text,
  prep_time text,
  duration text,
  parent_involvement text,
  difficulty text,
  mess_level text,
  weather text,
  season text,
  country_origin text,
  tags text[] not null default '{}'::text[],
  community_prompt text,
  safety_notes text,
  variations text,
  collection_labels text[] not null default '{}'::text[],
  source text,
  research_batch text,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  search_document tsvector generated always as (
    to_tsvector(
      'english'::regconfig,
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(instructions, '') || ' ' ||
      coalesce(equipment, '')
    )
  ) stored
);

create index activities_section_idx
  on public.activities(section);

create index activities_status_idx
  on public.activities(status);

create index activities_search_idx
  on public.activities using gin(search_document);

create index activities_tags_idx
  on public.activities using gin(tags);


-- =========================================================
-- PRINTABLE / DOWNLOADABLE RESOURCES
-- =========================================================

create table public.resources (
  id text primary key,
  slug text not null unique,
  title text not null,
  section text,
  resource_type text,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'complete', 'published', 'archived')),

  audience text[] not null default '{}'::text[],
  age_ranges text[] not null default '{}'::text[],

  summary text,

  keywords text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  species_covered text[] not null default '{}'::text[],
  search_terms jsonb not null default '{}'::jsonb,

  related_activities text[] not null default '{}'::text[],
  related_resources text[] not null default '{}'::text[],

  pdf_filename text,
  markdown_filename text,
  metadata_filename text,
  storage_path text,

  source_basis text[] not null default '{}'::text[],
  safety_topics text[] not null default '{}'::text[],

  searchable boolean not null default true,
  downloadable boolean not null default true,
  featured_terms text[] not null default '{}'::text[],

  page_count integer check (page_count is null or page_count > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  search_document tsvector generated always as (
    to_tsvector(
      'english'::regconfig,
      coalesce(title, '') || ' ' ||
      coalesce(slug, '') || ' ' ||
      coalesce(summary, '')
    )
  ) stored
);

create index resources_status_idx
  on public.resources(status);

create index resources_search_idx
  on public.resources using gin(search_document);

create index resources_tags_idx
  on public.resources using gin(tags);


create table public.activity_resources (
  activity_id text not null references public.activities(id) on delete cascade,
  resource_id text not null references public.resources(id) on delete cascade,

  use_type text not null check (
    use_type in ('primary', 'reuse', 'optional companion')
  ),

  sort_order integer not null default 0,

  primary key (activity_id, resource_id)
);


-- =========================================================
-- CURATED COLLECTIONS
-- =========================================================

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  section text,
  hero_image_url text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.collection_activities (
  collection_id uuid not null references public.collections(id) on delete cascade,
  activity_id text not null references public.activities(id) on delete cascade,
  sort_order integer not null default 0,

  primary key (collection_id, activity_id)
);


-- =========================================================
-- JOURNAL / EDITORIAL
-- =========================================================

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  content_markdown text not null,
  hero_image_url text,
  author_name text,
  section text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.article_activities (
  article_id uuid not null references public.articles(id) on delete cascade,
  activity_id text not null references public.activities(id) on delete cascade,
  sort_order integer not null default 0,

  primary key (article_id, activity_id)
);


-- =========================================================
-- WEEKLY NEWSLETTER
-- =========================================================

create table public.newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  issue_number integer unique,
  title text not null,
  subject text,
  preview_text text,
  content_markdown text not null,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'archived')),
  scheduled_for timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.newsletter_issue_activities (
  newsletter_issue_id uuid not null
    references public.newsletter_issues(id) on delete cascade,

  activity_id text not null
    references public.activities(id) on delete cascade,

  sort_order integer not null default 0,

  primary key (newsletter_issue_id, activity_id)
);


-- =========================================================
-- DYNAMIC HOME PAGE
-- =========================================================

create table public.home_modules (
  id uuid primary key default gen_random_uuid(),
  module_key text not null unique,
  module_type text not null,
  title text,
  subtitle text,
  payload jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =========================================================
-- SAVED / COMPLETED / PLANNED ACTIVITIES
-- =========================================================

create table public.saved_activities (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_id text not null references public.activities(id) on delete cascade,

  list_type text not null check (
    list_type in ('favourite', 'try_later')
  ),

  created_at timestamptz not null default now(),

  primary key (profile_id, activity_id, list_type)
);


create table public.activity_completions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_id text not null references public.activities(id) on delete cascade,
  completed_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);


create table public.activity_ratings (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_id text not null references public.activities(id) on delete cascade,

  rating text not null check (
    rating in ('loved', 'good', 'not_for_us')
  ),

  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (profile_id, activity_id)
);


create table public.planned_activities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_id text not null references public.activities(id) on delete cascade,
  planned_for date not null,
  reminder_at timestamptz,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =========================================================
-- SUBSCRIPTIONS
-- RevenueCat will update these server-side later.
-- =========================================================

create table public.subscription_entitlements (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null references public.profiles(id) on delete cascade,

  entitlement_id text not null,
  provider text not null default 'revenuecat',

  status text not null check (
    status in ('trial', 'active', 'grace_period', 'expired', 'cancelled')
  ),

  product_id text,
  started_at timestamptz,
  expires_at timestamptz,
  auto_renewing boolean,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (profile_id, entitlement_id)
);


-- =========================================================
-- ADMIN / FEATURE FLAGS
-- =========================================================

create table public.admin_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,

  role text not null check (
    role in ('owner', 'admin', 'moderator', 'editor', 'support')
  ),

  created_at timestamptz not null default now(),

  primary key (profile_id, role)
);


create table public.feature_flags (
  key text primary key,
  description text,
  enabled boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);


-- =========================================================
-- AUTOMATIC PROFILE CREATION
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  insert into public.profiles (
    id,
    display_name
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      'Vital Member'
    )
  );

  insert into public.user_preferences (profile_id)
  values (new.id);

  insert into public.notification_preferences (profile_id)
  values (new.id);

  insert into public.newsletter_preferences (
    profile_id,
    subscribed,
    subscribed_at
  )
  values (
    new.id,
    true,
    now()
  );

  return new;
end;
$$;


create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();


-- =========================================================
-- UPDATED_AT TRIGGERS
-- =========================================================

create trigger profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger families_updated_at
before update on public.families
for each row execute procedure public.set_updated_at();

create trigger family_members_updated_at
before update on public.family_members
for each row execute procedure public.set_updated_at();

create trigger activities_updated_at
before update on public.activities
for each row execute procedure public.set_updated_at();

create trigger resources_updated_at
before update on public.resources
for each row execute procedure public.set_updated_at();

create trigger collections_updated_at
before update on public.collections
for each row execute procedure public.set_updated_at();

create trigger articles_updated_at
before update on public.articles
for each row execute procedure public.set_updated_at();

create trigger newsletter_issues_updated_at
before update on public.newsletter_issues
for each row execute procedure public.set_updated_at();

create trigger home_modules_updated_at
before update on public.home_modules
for each row execute procedure public.set_updated_at();

create trigger activity_ratings_updated_at
before update on public.activity_ratings
for each row execute procedure public.set_updated_at();

create trigger planned_activities_updated_at
before update on public.planned_activities
for each row execute procedure public.set_updated_at();

create trigger subscription_entitlements_updated_at
before update on public.subscription_entitlements
for each row execute procedure public.set_updated_at();


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.user_preferences enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.newsletter_preferences enable row level security;

alter table public.activities enable row level security;
alter table public.resources enable row level security;
alter table public.activity_resources enable row level security;

alter table public.collections enable row level security;
alter table public.collection_activities enable row level security;

alter table public.articles enable row level security;
alter table public.article_activities enable row level security;

alter table public.newsletter_issues enable row level security;
alter table public.newsletter_issue_activities enable row level security;

alter table public.home_modules enable row level security;

alter table public.saved_activities enable row level security;
alter table public.activity_completions enable row level security;
alter table public.activity_ratings enable row level security;
alter table public.planned_activities enable row level security;

alter table public.subscription_entitlements enable row level security;
alter table public.admin_roles enable row level security;
alter table public.feature_flags enable row level security;


-- =========================================================
-- USER DATA POLICIES
-- =========================================================

create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());


create policy "Users can create own families"
on public.families
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can view own families"
on public.families
for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can update own families"
on public.families
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own families"
on public.families
for delete
to authenticated
using (owner_id = auth.uid());


create policy "Users can manage members of own families"
on public.family_members
for all
to authenticated
using (
  exists (
    select 1
    from public.families
    where families.id = family_members.family_id
      and families.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.families
    where families.id = family_members.family_id
      and families.owner_id = auth.uid()
  )
);


create policy "Users can view own preferences"
on public.user_preferences
for select
to authenticated
using (profile_id = auth.uid());

create policy "Users can update own preferences"
on public.user_preferences
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());


create policy "Users can view own notification preferences"
on public.notification_preferences
for select
to authenticated
using (profile_id = auth.uid());

create policy "Users can update own notification preferences"
on public.notification_preferences
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());


create policy "Users can view own newsletter preference"
on public.newsletter_preferences
for select
to authenticated
using (profile_id = auth.uid());

create policy "Users can update own newsletter preference"
on public.newsletter_preferences
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());


-- =========================================================
-- CONTENT READ POLICIES
-- =========================================================

create policy "Members can read published activities"
on public.activities
for select
to authenticated
using (status = 'published');


create policy "Members can read completed resources"
on public.resources
for select
to authenticated
using (status in ('complete', 'published'));


create policy "Members can read activity resource links"
on public.activity_resources
for select
to authenticated
using (
  exists (
    select 1
    from public.activities
    where activities.id = activity_resources.activity_id
      and activities.status = 'published'
  )
);


create policy "Members can read published collections"
on public.collections
for select
to authenticated
using (status = 'published');


create policy "Members can read collection activities"
on public.collection_activities
for select
to authenticated
using (
  exists (
    select 1
    from public.collections
    where collections.id = collection_activities.collection_id
      and collections.status = 'published'
  )
);


create policy "Members can read published articles"
on public.articles
for select
to authenticated
using (status = 'published');


create policy "Members can read article activity links"
on public.article_activities
for select
to authenticated
using (
  exists (
    select 1
    from public.articles
    where articles.id = article_activities.article_id
      and articles.status = 'published'
  )
);


create policy "Members can read published newsletters"
on public.newsletter_issues
for select
to authenticated
using (status = 'published');


create policy "Members can read newsletter activity links"
on public.newsletter_issue_activities
for select
to authenticated
using (
  exists (
    select 1
    from public.newsletter_issues
    where newsletter_issues.id =
      newsletter_issue_activities.newsletter_issue_id
      and newsletter_issues.status = 'published'
  )
);


create policy "Members can read active home modules"
on public.home_modules
for select
to authenticated
using (
  enabled = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
);


create policy "Members can read enabled feature flags"
on public.feature_flags
for select
to authenticated
using (enabled = true);


-- =========================================================
-- PERSONAL ACTIVITY DATA POLICIES
-- =========================================================

create policy "Users manage own saved activities"
on public.saved_activities
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());


create policy "Users manage own activity completions"
on public.activity_completions
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());


create policy "Users manage own activity ratings"
on public.activity_ratings
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());


create policy "Users manage own planned activities"
on public.planned_activities
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());


create policy "Users can view own subscription entitlement"
on public.subscription_entitlements
for select
to authenticated
using (profile_id = auth.uid());


create policy "Users can view own admin roles"
on public.admin_roles
for select
to authenticated
using (profile_id = auth.uid());
begin;
set local lock_timeout = '5s';

alter table public.user_preferences
  add column language_code text
  constraint user_preferences_language_code_check
  check (language_code is null or language_code in ('en', 'cy'));

comment on column public.user_preferences.language_code is
  'Optional member-selected app language. Null retains the English device default.';

create table public.activity_translations (
  activity_id text not null references public.activities(id) on delete cascade,
  locale text not null check (locale = 'cy'),
  type text, title text, summary text, instructions text, why_children_enjoy_it text,
  physical_benefits text, mental_benefits text, social_benefits text,
  cost text, equipment text, prep_time text, duration text, parent_involvement text,
  difficulty text, mess_level text, weather text, season text, country_origin text,
  community_prompt text, safety_notes text, variations text,
  tags text[], collection_labels text[],
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    to_tsvector('simple'::regconfig, coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' ||
      coalesce(instructions, '') || ' ' || coalesce(equipment, ''))
  ) stored,
  primary key (activity_id, locale),
  check (num_nonnulls(type, title, summary, instructions, why_children_enjoy_it, physical_benefits,
    mental_benefits, social_benefits, cost, equipment, prep_time, duration, parent_involvement,
    difficulty, mess_level, weather, season, country_origin, community_prompt, safety_notes,
    variations, tags, collection_labels) > 0)
);
create index activity_translations_search_idx on public.activity_translations using gin(search_document);

create table public.resource_translations (
  resource_id text not null references public.resources(id) on delete cascade,
  locale text not null check (locale = 'cy'),
  title text, summary text, storage_path text, pdf_filename text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    to_tsvector('simple'::regconfig, coalesce(title, '') || ' ' || coalesce(summary, ''))
  ) stored,
  primary key (resource_id, locale),
  check (num_nonnulls(title, summary, storage_path, pdf_filename) > 0)
);
create index resource_translations_search_idx on public.resource_translations using gin(search_document);

create trigger activity_translations_updated_at before update on public.activity_translations
for each row execute procedure public.set_updated_at();
create trigger resource_translations_updated_at before update on public.resource_translations
for each row execute procedure public.set_updated_at();

alter table public.activity_translations enable row level security;
alter table public.resource_translations enable row level security;
revoke all on public.activity_translations, public.resource_translations from public, anon, authenticated;
grant select on public.activity_translations, public.resource_translations to authenticated;
grant all on public.activity_translations, public.resource_translations to service_role;

create policy activity_translations_for_published_content on public.activity_translations
for select to authenticated using (exists (
  select 1 from public.activities activity where activity.id = activity_id and activity.status = 'published'
));
create policy activity_translation_membership_required on public.activity_translations
as restrictive for select to authenticated using (public.has_valid_vital_membership());

create policy resource_translations_for_available_content on public.resource_translations
for select to authenticated using (exists (
  select 1 from public.resources resource where resource.id = resource_id and resource.status in ('complete', 'published')
));
create policy resource_translation_membership_required on public.resource_translations
as restrictive for select to authenticated using (public.has_valid_vital_membership());

comment on table public.activity_translations is
  'Optional localized fields keyed to canonical activity identity. Missing fields fall back to public.activities.';
comment on table public.resource_translations is
  'Optional localized resource metadata and file path keyed to canonical resource identity. Missing fields fall back to public.resources.';

commit;

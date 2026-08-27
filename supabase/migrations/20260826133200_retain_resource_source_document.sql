alter table public.resources
  add column source_document jsonb not null default '{}'::jsonb;

comment on column public.resources.source_document is
  'Canonical complete source object retained from the Vital Collective resources.json import.';

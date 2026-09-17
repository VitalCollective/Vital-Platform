begin;

create table public.member_submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  submission_type text not null
    check (submission_type in ('feedback', 'activity')),
  feedback_kind text
    check (feedback_kind is null or feedback_kind in ('bug', 'suggestion', 'comment', 'other')),
  subject text check (subject is null or char_length(subject) <= 120),
  message text check (message is null or char_length(message) <= 5000),
  activity_name text check (activity_name is null or char_length(activity_name) <= 160),
  vital_section text check (vital_section is null or vital_section in
    ('Vital Mums', 'Vital Kids', 'Vital Together', 'Vital Life', 'Vital Food')),
  suitable_age text check (suitable_age is null or char_length(suitable_age) <= 80),
  description text check (description is null or char_length(description) <= 10000),
  equipment_notes text check (equipment_notes is null or char_length(equipment_notes) <= 2000),
  rights_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint member_submissions_shape check (
    (submission_type = 'feedback'
      and feedback_kind is not null
      and nullif(btrim(message), '') is not null
      and activity_name is null and vital_section is null and suitable_age is null
      and description is null and equipment_notes is null and not rights_confirmed)
    or
    (submission_type = 'activity'
      and feedback_kind is null and subject is null and message is null
      and nullif(btrim(activity_name), '') is not null
      and nullif(btrim(description), '') is not null
      and rights_confirmed)
  )
);

create index member_submissions_created_idx
  on public.member_submissions(created_at desc);
create index member_submissions_profile_idx
  on public.member_submissions(profile_id, created_at desc);

alter table public.member_submissions enable row level security;

create policy "Members can submit private support requests"
on public.member_submissions
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and public.is_authenticated_member()
);

revoke all on table public.member_submissions from public, anon, authenticated;
grant insert on table public.member_submissions to authenticated;
grant all on table public.member_submissions to service_role;

comment on table public.member_submissions is
  'Private member feedback and activity submissions. Not Community content and not readable by members.';

commit;

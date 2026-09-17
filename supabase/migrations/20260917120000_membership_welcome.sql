begin;

alter table public.user_preferences
  add column membership_welcome_seen_at timestamptz;

comment on column public.user_preferences.membership_welcome_seen_at is
  'Recorded once when an entitled genuine member is shown the post-activation welcome.';

create function public.claim_vital_membership_welcome()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not public.has_valid_vital_membership() then
    return false;
  end if;

  update public.user_preferences preferences
  set membership_welcome_seen_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where preferences.profile_id = auth.uid()
    and preferences.membership_welcome_seen_at is null;

  return found;
end;
$$;

revoke all on function public.claim_vital_membership_welcome()
  from public, anon;
grant execute on function public.claim_vital_membership_welcome()
  to authenticated, service_role;

commit;

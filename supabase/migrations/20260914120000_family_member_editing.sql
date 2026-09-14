-- Privacy-minimised family-member editing. Prepared only; does not seed data.
begin;
set local lock_timeout = '5s';

lock table public.families, public.family_members in share row exclusive mode;

do $$
begin
  if to_regclass('public.families') is null
    or to_regclass('public.family_members') is null then
    raise exception 'Existing family schema is required';
  end if;

  if exists (
    select 1 from public.families
    group by owner_id having count(*) > 1
  ) then
    raise exception 'Accounts with multiple family containers require review';
  end if;

  if exists (
    select 1 from public.family_members
    where relationship is null
      or relationship not in ('Child', 'Partner', 'Parent', 'Grandparent', 'Other')
      or age_years is null
  ) then
    raise exception 'Existing family members require relationship/age review';
  end if;

  if exists (
    select 1 from public.family_members
    where age_band is not null
      or cardinality(interests) > 0
      or not active
  ) then
    raise exception 'Legacy family-member metadata requires review before retirement';
  end if;
end;
$$;

alter table public.families
  add constraint families_one_per_owner unique (owner_id);

alter table public.family_members
  add column age_confirmed_at timestamptz;

-- For any compatible pre-existing row, updated_at is the closest truthful
-- existing record of when its age value was last saved.
update public.family_members
set age_confirmed_at = updated_at;

update public.family_members
set display_name = nullif(btrim(display_name), '');

alter table public.family_members
  alter column display_name drop not null,
  alter column relationship set not null,
  alter column age_years set not null,
  alter column age_confirmed_at set not null,
  drop column age_band,
  drop column interests,
  drop column active,
  drop constraint if exists family_members_age_years_check,
  add constraint family_members_display_name_check check (
    display_name is null
    or (display_name = btrim(display_name) and char_length(display_name) between 1 and 60)
  ),
  add constraint family_members_relationship_check check (
    relationship in ('Child', 'Partner', 'Parent', 'Grandparent', 'Other')
  ),
  add constraint family_members_age_years_check check (age_years between 0 and 120);

create function public.set_family_member_age_confirmation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.age_confirmed_at = clock_timestamp();
  elsif new.age_years is distinct from old.age_years then
    new.age_confirmed_at = clock_timestamp();
  else
    new.age_confirmed_at = old.age_confirmed_at;
  end if;
  return new;
end;
$$;

revoke all on function public.set_family_member_age_confirmation()
  from public, anon, authenticated;

create trigger family_members_confirm_age
before insert or update on public.family_members
for each row execute function public.set_family_member_age_confirmation();

commit;

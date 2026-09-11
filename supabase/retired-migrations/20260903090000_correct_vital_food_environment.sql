-- Align confirmed kitchen activities with their intended indoor setting.
-- The importer applies the same correction so future source imports remain stable.

update public.activities
set
  indoor = true,
  outdoor = false,
  updated_at = now()
where id in ('VF-0001', 'VF-0002', 'VF-0003');

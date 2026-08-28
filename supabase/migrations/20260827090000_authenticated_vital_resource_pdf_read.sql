-- Development/V1 access layer for private Vital printable resources.
-- Before production launch, replace this broad authenticated read rule with a
-- subscription_entitlements-aware policy. The bucket remains private and no
-- object write privileges are granted here.

create policy "Authenticated members can read Vital resource PDFs"
on storage.objects
for select
to authenticated
using (bucket_id = 'vital-resources');

comment on policy "Authenticated members can read Vital resource PDFs"
on storage.objects is
  'Development/V1 only: authenticated read access for vital-resources. Make this subscription_entitlements-aware before production launch.';

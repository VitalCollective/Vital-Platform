-- Normalize the systemic repeated outdoor-only flag in the Vital source set.
-- Only explicit source metadata is treated as evidence; unsupported rows use
-- the existing neutral false/false representation pending manual review.

with source_environment_evidence as (
  select
    public.activities.id,
    (
      concat_ws(
        ' ',
        public.activities.title,
        public.activities.summary,
        array_to_string(public.activities.tags, ' '),
        array_to_string(public.activities.collection_labels, ' '),
        public.activities.weather
      ) ~* '(^|[^[:alnum:]_])indoors?([^[:alnum:]_]|$)'
      or coalesce(public.activities.weather, '')
        ~* '(^|;[[:space:]]*)(home|kitchen)([[:space:]]*;|$)'
    ) as indoor_evidence,
    concat_ws(
      ' ',
      public.activities.title,
      public.activities.summary,
      array_to_string(public.activities.tags, ' '),
      array_to_string(public.activities.collection_labels, ' '),
      public.activities.weather
    ) ~* '(^|[^[:alnum:]_])outdoors?([^[:alnum:]_]|$)' as outdoor_evidence
  from public.activities
  where public.activities.id ~ '^(VF|VK|VL|VM|VT)-'
    and public.activities.indoor = false
    and public.activities.outdoor = true
)
update public.activities
set
  indoor = source_environment_evidence.indoor_evidence,
  outdoor = source_environment_evidence.outdoor_evidence,
  updated_at = now()
from source_environment_evidence
where public.activities.id = source_environment_evidence.id;

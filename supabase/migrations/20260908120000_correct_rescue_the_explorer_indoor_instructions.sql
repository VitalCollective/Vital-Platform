-- Keep the imported activity aligned with the corrected canonical source text.
-- This is deliberately limited to the approved indoor wording correction.

update public.activities
set
  instructions = replace(
    instructions,
    'Hide a toy explorer somewhere around a garden or park.',
    'Hide a toy explorer somewhere around the house, garden or park.'
  ),
  updated_at = now()
where id = 'VK-5-7-0018'
  and title = 'Rescue the Explorer'
  and instructions like 'Hide a toy explorer somewhere around a garden or park.%';

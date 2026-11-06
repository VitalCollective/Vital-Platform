-- Keep the imported activity rows aligned with the reviewed canonical source.
-- Food-safety wording follows current UK Food Standards Agency guidance:
-- https://www.food.gov.uk/safety-hygiene/best-before-and-use-by-dates
-- https://www.food.gov.uk/safety-hygiene/cooking-your-food
-- https://www.food.gov.uk/safety-hygiene/home-food-fact-checker
--
-- This migration deliberately updates only the four reviewed activity rows.

do $migration$
declare
  affected integer;
begin
  update public.activities
  set
    safety_notes = $text$Use food by its use-by date; do not rely on smell to judge safety. Best-before dates are about quality, so sensory checks may be appropriate when the pack's storage instructions have been followed. Cool cooked leftovers promptly, refrigerate within two hours, and eat within 48 hours or freeze. Cool cooked rice within one hour, refrigerate for no more than one day, and reheat only once until steaming hot throughout.$text$,
    updated_at = now()
  where id = 'VF-0016'
    and title = 'Eat the Fridge First'
    and safety_notes = 'Check expiry dates, trust your senses where appropriate and follow food safety guidance.';

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one unchanged VF-0016 source row; updated %', affected;
  end if;

  update public.activities
  set
    safety_notes = $text$Cool and cover leftovers promptly, refrigerate within two hours, and eat within 48 hours or freeze. Reheat only once and until steaming hot throughout. For cooked rice, cool within one hour, refrigerate for no more than one day, and reheat only once until steaming hot throughout. Never use food after its use-by date; best-before dates relate to quality.$text$,
    updated_at = now()
  where id = 'VF-0017'
    and title = 'Leftover Reinvention'
    and safety_notes = 'Cool leftovers quickly, store them safely and reheat thoroughly according to food safety guidance.';

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one unchanged VF-0017 source row; updated %', affected;
  end if;

  update public.activities
  set
    safety_notes = $text$Use food by its use-by date, even if it looks or smells fine. Best-before dates relate to quality; follow the pack's storage instructions and use sight or smell only where appropriate for best-before food.$text$,
    updated_at = now()
  where id = 'VF-0043'
    and title = 'The Fridge Challenge'
    and safety_notes = 'Check expiry dates and ensure all ingredients are safe to use before cooking.';

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one unchanged VF-0043 source row; updated %', affected;
  end if;

  update public.activities
  set
    instructions = $text$Give every player or team the same number of paper tokens. Prepare 8–12 short challenges and hide each challenge description in a folded card or envelope, showing only a vague teaser such as 'precision', 'nerve' or 'memory'. Auction each challenge before revealing exactly what it is. The winning bidder attempts it; success earns the stated points, while failure earns nothing. Keep enough tokens back for later rounds. Continue until the chosen lots have been auctioned. Highest total score wins.$text$,
    updated_at = now()
  where id = 'VT-0061'
    and title = 'Blind Auction Challenge'
    and instructions = $text$Give every player or team the same number of paper tokens. Prepare 8–12 short challenges and hide each challenge description in a folded card or envelope, showing only a vague teaser such as 'precision', 'nerve' or 'memory'. Auction each challenge before revealing exactly what it is. The winning bidder attempts it; success earns the stated points, while failure earns nothing. Keep enough tokens back for later rounds and finish with a final open auction where everyone knows the challenge. Highest total score wins.$text$;

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one unchanged VT-0061 source row; updated %', affected;
  end if;
end
$migration$;

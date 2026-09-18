# Approved member legal and support content

The user confirmed `Vital_Collective_Legal_and_FAQ_Working_Pack_v3.zip` as the
approved implementation source on 12 September 2026. Original member documents
are preserved byte-for-byte in `source/`; their WORKING_DRAFT filenames are source
provenance, not text shown to members. The other ZIP documents are internal and
are neither included here nor imported into the application.

| Source under `docs/legal/source/` | Canonical runtime content |
| --- | --- |
| `Vital_Collective_Privacy_Notice_WORKING_DRAFT_v3.docx` | `packages/content/legal/privacy.json` — 16 sections |
| `Vital_Collective_Terms_of_Use_WORKING_DRAFT_v3.docx` | `packages/content/legal/terms.json` — 21 sections |
| `Vital_Collective_FAQ_WORKING_DRAFT_v3.docx` | `packages/content/legal/faq.json` — 30 questions |

These JSON files are the single member-facing sources for mobile and public legal
pages. Mobile's `account-content.ts` imports them; `account-information.tsx`
renders native headings, selectable text, bullets and expandable FAQs. No Markdown
engine, duplicate in-component policies or document download is needed. The
public-site builder mechanically renders the canonical Privacy JSON to
`apps/mobile/public/privacy/index.html`.

## Extraction boundaries

The numbered Privacy/Terms sections and every FAQ are retained. Both substantive
Privacy tables (lawful bases and retention) are rendered as labelled entries so
they remain readable on small screens. Member wording is taken from v3, not newly
written legal advice. Only the following internal material is excluded:

- Front matter, working-draft warnings and the final official-source/reference lists.
- The Terms paragraph beginning “Vital Community must provide practical in-app”:
  this is an implementation instruction, not a member term.
- Explicit before-publication supplier checks, transfer-verification and legal
  review instructions, and bracketed SDK/log/back-up confirmation placeholders.
  The substantive adjoining member text remains intact; no supplier or retention
  period has been invented.
- The FAQ phrase “once the contact route is connected” is removed from the
  suggestion answer because the approved email-composer route is now connected.

No governance pack, DPIA, ROPA, breach procedure, processor template or launch
checklist is bundled or presented. Terms retain their 12 September 2026 preparation
date. The Privacy Notice was updated on 18 September 2026 only to reflect shipped
private submissions, secure account deletion and the public deletion-request route.

## Support and commercial presentation

Send feedback, Report a problem and Suggest an activity use private authenticated
member submissions. They are not Community content and ordinary members cannot
read submissions. `info@vitalcollective.co.uk` remains the external contact route,
including for a deletion request when a member cannot access the app.

`scripts/public-site/build.mjs` produces the crawlable static routes
`/delete-account/` and `/privacy/`, plus robots and sitemap files. The deletion
page does not call the deletion Edge Function or introduce an unauthenticated
backend; it directs signed-in members to the secure app flow and offers a
pre-addressed email request for members who cannot sign in.

The membership screen displays the approved £9.99/month and £59.99/year offers,
standard 7-day trial and cancellation/conversion terms, and possible partner
offers. Recorded entitlement status is read from the existing account service.
Purchase/manage actions are explicitly disabled until store integration exists.
Apple/Google product configuration, actual localized offer/eligibility data,
purchase/restore/manage flows and verified entitlement updates remain to wire.

The approved documents describe the intended launch product. They are not proof
that every described feature has shipped: photo editing, secure account deletion,
store billing and marketing delivery/consent integration must match those terms
before launch. This pass does not implement those systems or silently rewrite
the approved policies to claim otherwise.

## Verification

Focused tests live in `apps/mobile/tests/account-content.test.mjs`,
`account.test.mjs` and `profile.test.mjs`. They cover document structure and contact
details, excluded drafting material, FAQ search, pricing, routing/keyboard wiring,
and canonical profile persistence/readback. The original DOCX files remain
available for reviewing any later approved text changes.

## Files in this implementation pass

Paths below are relative to the repository root. Earlier uncommitted Saved/You
work is preserved; this list identifies only files touched by the legal/support
and profile correction pass.

Created:

- `docs/legal/README.md`
- `docs/legal/source/Vital_Collective_Privacy_Notice_WORKING_DRAFT_v3.docx`
- `docs/legal/source/Vital_Collective_Terms_of_Use_WORKING_DRAFT_v3.docx`
- `docs/legal/source/Vital_Collective_FAQ_WORKING_DRAFT_v3.docx`
- `packages/content/legal/privacy.json`
- `packages/content/legal/terms.json`
- `packages/content/legal/faq.json`
- `apps/mobile/src/features/account/account-content.ts`
- `apps/mobile/src/features/account/account-information.tsx`
- `apps/mobile/src/services/profile-api.ts`
- `apps/mobile/tests/account-content.test.mjs`
- `apps/mobile/tests/profile.test.mjs`

Modified:

- `apps/mobile/README.md`
- `apps/mobile/package.json` (test command only; no dependency changes)
- `apps/mobile/src/components/vital/screen.tsx`
- `apps/mobile/src/features/account/account-model.ts`
- `apps/mobile/src/features/account/account-screen.tsx`
- `apps/mobile/src/features/account/account-ui.tsx`
- `apps/mobile/src/features/community/community-api.ts`
- `apps/mobile/src/features/community/community-detail.tsx`
- `apps/mobile/src/features/community/community-model.ts`
- `apps/mobile/src/features/community/community-moderation.tsx`
- `apps/mobile/src/features/community/community-screen.tsx`
- `apps/mobile/src/features/community/community-ui.tsx`
- `apps/mobile/src/services/profiles.ts`
- `apps/mobile/tests/account.test.mjs`
- `apps/mobile/tests/account-preview.tsx`

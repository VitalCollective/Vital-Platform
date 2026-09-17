# Vital Collective mobile

The Expo SDK 57 app supports signing in, browsing published activities, saving favourites, opening full activity details and private printable PDFs, and participating in Community. The wider account area remains limited.

## Configure the public Supabase client

Copy `.env.example` to `.env` inside `apps/mobile` and set:

```text
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Obtain the project URL and **publishable** key from the Supabase Dashboard project API settings. `EXPO_PUBLIC_` values are compiled into the client bundle, so they must never contain a service-role or secret key. Real `.env` files are ignored by Git; `.env.example` contains placeholders only.

The RevenueCat subscription foundation and SDK 57 development-build profile are
prepared. Test Store purchases use one public `test_...` SDK key on iOS and
Android and are hard-gated to development runtimes; preview and production
profiles keep purchases disabled. Put the local key and development switch in
the ignored `apps/mobile/.env.local` file as documented in
[`docs/billing/README.md`](../../docs/billing/README.md). Never put RevenueCat's
secret REST key or webhook secrets in an `EXPO_PUBLIC_` variable.

The app shows a clear configuration screen when either variable is missing. Supabase Auth uses persisted sessions, token refresh, and auth state listeners. Native sessions use Expo SQLite-backed `localStorage`; web sessions use the browser's persistent `localStorage`. Email/password account creation passes the display name to the existing new-user database trigger. When email confirmation is enabled, the form tells the member to confirm before signing in.

Password recovery uses Supabase Auth's standard recovery email, recovery session, and `updateUser({ password })` flow. The reset callback is `/reset-password`; the app generates its full platform URL at runtime with Expo Linking and removes recovery credentials from the browser address bar after processing them.

In Supabase Dashboard → Authentication → URL Configuration, add every deployed callback URL to **Redirect URLs** before using recovery in that environment. At minimum, this project expects:

- `vital://reset-password` for installed iOS and Android builds
- `http://localhost:8081/reset-password` for the default local web server
- `https://<your-production-web-host>/reset-password` for production web

Use the exact local host and port printed by Expo if it differs. Expo Go development callback URLs are machine-specific and are not stable enough for production auth; use a development build for reliable native recovery testing. If the recovery email template is customized, it must continue to use Supabase's confirmation URL so the link is verified before returning to the app.

## Run the app

From the repository root:

```bash
npm run mobile
```

Or from `apps/mobile`:

```bash
npx expo start
```

Use `w`, `a`, or `i` in the Expo terminal to open web, Android, or iOS as available.

## Brand shell

The authenticated app uses a responsive global shell with a full editorial header from 1024px upward, a compact header and section menu below 1024px, and the existing five-item mobile tab bar for frequent actions. Colours, typography, spacing, radii, shadows, breakpoints and content widths are centralized in `src/theme/tokens.ts`.

DM Serif Display and Inter are loaded through Expo Font using the `@expo-google-fonts` packages. Auth screens use the approved small `assets/brand/vital-mark.png` artwork. Home uses the primary detailed family logo on desktop and the secondary simplified logo on mobile/tablet. The global header keeps its restrained typographic lockup until the secondary logo is separately checked at compact header scale. See `assets/brand/README.md` for the complete approved asset catalogue.

### Web and persisted sessions

Supabase sessions use platform-specific storage: `expo-sqlite/localStorage/install` on Android and iOS, and the browser's built-in `localStorage` on web. Platform-specific modules keep Expo Router's server-rendering graph from importing a browser-only SQLite worker while preserving durable sessions on every platform.

Expo SQLite's SDK 57 web implementation uses WebAssembly and `SharedArrayBuffer`. The app's Metro configuration treats `.wasm` files as assets, while the Expo Router plugin configures these response headers:

- `Cross-Origin-Embedder-Policy: credentialless`
- `Cross-Origin-Opener-Policy: same-origin`

Expo's development server and `expo-server` use the Router header configuration. A different static host must be configured to return the same headers for app documents; copying the exported files alone cannot set HTTP response headers. In a correctly served web build, `globalThis.crossOriginIsolated` is `true`.

After changing Metro configuration, restart with a cleared bundler cache:

```bash
cd apps/mobile
npx expo start --web --clear
```

## Data, search, and private PDFs

Every query uses the public Supabase client plus the authenticated member's JWT, so the existing database RLS policies remain authoritative. Discover performs bounded, server-side queries against published activities. Its default view interleaves stable section and child-age lanes instead of presenting a simple A–Z catalogue; filtered results remain deterministic. Search combines the existing `search_document` full-text index (title, summary, instructions and equipment) with tags, collection labels, section, activity type and weather, then ranks the bounded matches using title, tags, summary, section and activity type. If full-text search is unavailable in a target PostgREST version, it falls back to the same bounded server-side field matching without the indexed document.

On phones, the six section choices and three setting choices wrap without horizontal scrolling. Age and time live in a compact “More filters” sheet: the age bands map to the exact source pairs (`2/3–4`, `5/6–7`, `8–10`, `11–13`, `All–All`, and `Adults/Mums`), while every observed source duration belongs to one of Quick (up to 15 minutes), 15–30 minutes, 30–60 minutes, Longer, or Flexible/ongoing. Discover initially requests 20 results and “Show more” increases that bounded request by 20, preserving the existing prefix and resetting when search or filters change.

Home's “Ideas to try” area uses `fetchIdeasForToday` to load a small published pool from every Vital section, rotate that pool daily, and return up to three activities from different sections when content is available. The selection is deliberately lightweight rather than personalised or AI-generated, while keeping the section-pool boundary available for later preference-aware ranking.

Activity details embed the `activity_resources` to `resources` relationship. A printable resource uses its database `storage_path` to request a signed URL for the private `vital-resources` bucket. The URL lasts ten minutes, is never persisted, and is opened through Expo Linking. The bucket is not public.

Migration `20260827090000_authenticated_vital_resource_pdf_read.sql` adds authenticated, read-only access to objects in that bucket. It grants no insert, update, delete, or anonymous access. This is explicitly a development/V1 policy and **must become `subscription_entitlements`-aware before production release**.

## Activity saving

Every activity-detail page has a Save/Saved toggle, backed by the existing
`public.saved_activities` table with `list_type = 'favourite'`. The authenticated
member's ID and activity ID scope every read, upsert and delete. The existing
ownership and genuine-member RLS policies remain the authority; no schema change,
service-role client, local-only bookmarks or parallel saving system is involved.

The label updates optimistically while the request is pending; rapid repeated taps
are disabled. Failures roll back the optimistic state and show a customer-safe retry.
Retry rechecks the database before another toggle, including when a response may
have been lost after a successful write. Opening/refocusing the activity reloads its
saved state, and switching accounts discards the previous member's screen state.
The separate `try_later` list is not changed by this control.
Reopening during an in-flight save waits for that request before reading the row;
only pending requests are shared, never a second cache of bookmark data.

Saved now lists the member's activity favourites using the approved compact activity
cards, newest save first (activity ID breaks timestamp ties). The query joins
`saved_activities` to published `activities`, with the same member and favourite
filters as the detail toggle. It reads in 100-row pages so server row limits cannot
silently truncate the list; the screen reveals 20 cards at a time without catalogue
filters. Tab focus, pull-to-refresh and the Refresh button reread the database,
waiting for pending saves/unsaves first. Unpublished/unavailable activities are not
listed. Empty Saved explains how to save an activity and links to Discover; errors
show a safe retry state, not a misleading empty list.

The data model already supports activity favourites/Try Later and Community post
bookmarks (`saved_community_posts`), but Community does not yet expose a save control
or Saved listing. There is no resource bookmark table/flow. Activity completion and
planning have their own existing tables and are not toggled by Save.

Focused regression check: `node --test tests/saved-activities.test.mjs tests/activity-detail.test.mjs tests/errors.test.mjs tests/discover.test.mjs`
from `apps/mobile`.
The optional `tests/saved-activities-rls.test.mjs` runs just the save ownership and
list-isolation checks in PGlite. Like the existing database tests, it accepts
`PGLITE_MODULE` pointing to a separate validation runtime; it never contacts the
linked database. `tests/saved-activities-preview.tsx` is a non-route Metro QA entry
using the real detail screen with local-only query stand-ins.

## You / member hub

`/you` contains eight groups: Profile, Your family, Preferences, Vital membership,
Community, Help & feedback, About & legal, and Account. Destinations are allowlisted
`panel` query parameters on the existing You route, keeping the global shell and
bottom tabs intact. Back to You and Android hardware-back return to the hub.
The hub stacks on phones and uses two compact columns from tablet width.

Wired to existing authenticated capabilities:

- Own profile image/initials, name and bio use the shared profile service and image
  resolver. Edit profile updates only `display_name` and `bio`; email comes from
  Auth, not the Community directory. Photo editing is not added in this pass.
- Family reads use `families.owner_id` and the existing private `family_members`
  relation (active members only), including age bands/interests. No family writes.
- Preferences read/update the existing `user_preferences`,
  `notification_preferences` and `newsletter_preferences` rows. Each group saves
  independently; UPDATE-only RLS is respected, missing rows are not fabricated.
  This stores choices, not a new recommendation engine, push registration,
  notification sender or newsletter delivery integration.
- Membership reads own `subscription_entitlements` without inventing a plan or
  exposing billing identifiers. Empty records are distinct from load failures.
- Community reuses `CommunityAbout`, live rule-version/acceptance API and approved
  starter disclosure. Reporting/blocking remain on existing Community content.
- Sign out continues to use the existing Auth provider. About/version is present.

Launch wiring still required (not roadmap copy in the UI): family editing,
subscription/billing management and a secure account-deletion workflow. Their
destinations explain unavailability and cannot pretend to make a change.
Privacy, Terms and the searchable 30-question FAQ use the approved v3 pack through
shared JSON in `packages/content/legal/`. See `docs/legal/README.md` for source
provenance and explicit drafting-note exclusions. The native screens and future
public website must reuse these files. Support, suggestions and problem reports
open the device email composer for `info@vitalcollective.co.uk` with distinct
subjects; no message is sent automatically. Public legal URLs still need publishing.
Membership displays the intended £9.99/month and £59.99/year plans, 7-day trial
and conversion/cancellation terms. Purchase/manage actions remain disabled until
Apple/Google product, transaction, restore and entitlement integration is complete.

Account reads refresh on focus, ignore late results after leaving, and are reset
when the authenticated member changes. Saves confirm success only after the
database response. Profile saves return the acknowledged `profiles.bio` row and
update You immediately, invalidating older in-flight reads. Entering Edit profile
or Community profile re-reads that canonical row. Community author reads include
the same bio; tap an author with an introduction to expand it. No Auth metadata
copy or second bio store is used. Edit profile enables iOS native keyboard insets
and a measured Android keyboard-avoiding viewport; the save action scrolls with
the form. Every child panel uses a leading left chevron and Back to You.
Technical failures use the existing customer-safe error layer.
No directory/private-family permissions or database schemas are changed.

Focused checks: `node --test tests/account.test.mjs tests/account-content.test.mjs tests/profile.test.mjs tests/errors.test.mjs tests/community.test.mjs tests/profile-images.test.mjs`.
`tests/account-preview.tsx` runs the real You route and shell against in-memory
fixtures only, outside production route discovery. It supports normal, empty,
read-error (`state=error`) and write-error (`state=write-error`) checks without
writing to connected Supabase or creating members.

## Validation

```bash
npm run typecheck --workspace=apps/mobile
npx expo-doctor apps/mobile
cd apps/mobile && npx expo export --platform web --output-dir dist --clear
git diff --check
```

The export command can be run with placeholder public environment values; no live database connection is made during compilation.
The starter did not include an ESLint configuration, so lint is not an active validation step yet; `expo lint` will offer to scaffold one when the monorepo's TypeScript toolchain is ready to support it.

## Known limitations

- “Find something” opens Discover; the recommendation engine is not built.
- Ideas for today use a stable three-item published query rather than editorial scheduling.
- You has the member hub, profile/preferences wiring, native legal documents and email/FAQ support. Family editing, store billing, secure account deletion and public legal URL publishing still need integration. Saved currently covers activity favourites only, not Try Later, Community posts or resources.
- Authenticated members can read any Vital resource PDF under the V1 Storage policy; entitlement gating is the next required production security step.
- Search fallback is less linguistically capable than PostgreSQL full-text search.
- Editorial/news publishing and dedicated favicon/app-icon exports remain for later phases.

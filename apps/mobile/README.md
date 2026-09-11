# Vital Collective mobile

The Expo SDK 57 app is the first authenticated Vital vertical slice: sign in or create an account, browse published activities, inspect a full activity, and open its private printable PDF. Community, Saved, and the wider account area are intentionally limited shells.

## Configure the public Supabase client

Copy `.env.example` to `.env` inside `apps/mobile` and set:

```text
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Obtain the project URL and **publishable** key from the Supabase Dashboard project API settings. `EXPO_PUBLIC_` values are compiled into the client bundle, so they must never contain a service-role or secret key. Real `.env` files are ignored by Git; `.env.example` contains placeholders only.

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
- Community, Saved, family onboarding, settings, and subscriptions are not implemented in this slice.
- Authenticated members can read any Vital resource PDF under the V1 Storage policy; entitlement gating is the next required production security step.
- Search fallback is less linguistically capable than PostgreSQL full-text search.
- Editorial/news publishing and dedicated favicon/app-icon exports remain for later phases.

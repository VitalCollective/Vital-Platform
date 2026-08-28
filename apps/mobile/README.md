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

Every query uses the public Supabase client plus the authenticated member's JWT, so the existing database RLS policies remain authoritative. Discover performs bounded, server-side queries against published activities, with full-text search on `search_document`. If that operation is unavailable in a target PostgREST version, it visibly falls back to a server-side title/summary/instructions search.

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

- “What shall we do?” currently opens Discover; the recommendation engine is not built.
- Ideas for today use a stable three-item published query rather than editorial scheduling.
- Community, Saved, family onboarding, settings, and subscriptions are not implemented in this slice.
- Authenticated members can read any Vital resource PDF under the V1 Storage policy; entitlement gating is the next required production security step.
- Search fallback is less linguistically capable than PostgreSQL full-text search.
- Final photography, illustration, icon, and branding assets are still to come; visual choices are centralized in `src/theme/tokens.ts`.

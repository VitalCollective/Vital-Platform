# Community profile images and starter disclosure — preparation report

10 September 2026. Implementation and local validation only. **The image migration is NOT applied. No images were generated/uploaded and no starter content was imported.** Community V1 itself is already applied and has passed the user's iPhone review.

## Existing infrastructure

- `public.profiles.avatar_url text` already existed and was nullable. The directory had one genuine Auth-backed profile and no image references. There was no need for another avatar column or identity table.
- Community authors used fixed 38px initials circles. You used a 54px generic person icon; no profile-photo editor, picker, cropper or upload pipeline existed.
- Supabase Storage contained the private, PDF-only `vital-resources` bucket. It is not suitable for profile photographs and is unchanged.
- `expo-image` was already installed. No dependencies, dependency versions, lockfiles or brand artwork were changed.

## Final architecture

The existing `avatar_url` column stores a durable app-owned reference, not a public/external or expiring URL:

```text
profile-images/<profile-uuid>/<versioned-filename>.webp
```

`NULL` means initials. Both genuine and seeded profiles use the same reference rules, resolver and `ProfileAvatar` component. A seeded profile keeps its existing deterministic UUID and NULL Auth link; it needs no login identity.

Images are read through the authenticated Supabase client. Community fetches author directory fields once per bounded page and signs all valid image paths in one batch. Signed URLs expire after one hour; the in-memory resolver reuses them for up to 55 minutes, caches signing failures for 30 seconds, and caps its cache at 128 references per client. Signed URLs never enter the database. As bearer URLs they remain usable until expiry; signing is not an immediate revocation mechanism.

Rendering uses existing Expo Image memory/disk caching, centred cover cropping and a fixed clipped circle: 38px for Community authors, 54px for You. Initials remain beneath the image until it loads. Missing references, denied signing, network failures and failed image loads retain initials without hiding conversations or changing geometry. A new URL resets the load/error identity. Next-to-name avatars are decorative for assistive technology, with the visible author name carrying identity; the reusable component also supports a standalone accessible label.

Feed cards, full posts, replies, moderator report detail and You share the component. The existing composer and member-restriction controls did not have separate avatar renderers; they were reviewed without redesigning them. You reads only the caller's existing public profile fields. No family, preferences or private-account access was added.

This follows [Supabase private-bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [Storage RLS](https://supabase.com/docs/guides/storage/security/access-control), using the installed [Expo SDK 57 Image component](https://docs.expo.dev/versions/v57.0.0/sdk/image/).

## Pending migration — requires approval

[supabase/migrations/20260910180000_community_profile_images.sql](<C:/Users/clayj/Projects/Vital-Platform/supabase/migrations/20260910180000_community_profile_images.sql>)

The new migration is transactional with a five-second lock timeout. It:

1. Adds an immutable, safe-search-path validator and a constraint on the existing `avatar_url` column. References must belong to that profile's UUID folder. Unsupported pre-existing references make the migration fail; it never silently rewrites them.
2. Creates a **private** `profile-images` bucket allowing JPEG, PNG and WebP only, maximum **524,288 bytes (512 KiB)** per file. An existing conflicting bucket fails rather than being overwritten.
3. Adds four narrowly scoped Storage policies. Genuine authenticated members may read linked profile images and their own uploads, and upload/update/delete only paths in their own UUID folder. Anonymous and forged seeded subjects cannot use these policies. The service role can prepare a starter UUID's image without creating Auth users.
4. Replaces only the service-only seed RPC implementation with format V3 support. It validates each optional image path and corresponding object's MIME/size metadata before import and replay, stores the reference, and verifies it afterwards. It preserves the existing transactional ledger, immutable payload fingerprint, stable seed keys, non-login checks, exact prose/timestamps and genuine metrics.

There are no Auth writes, new avatar columns, real-profile conversions, Community row changes, rule changes, new read RPCs, modified read views, or changed moderation hierarchy/metrics. No applied migration was edited. The new helper revokes PUBLIC/anonymous EXECUTE; the importer remains service-role-only. The Storage policies use the existing non-recursive genuine-member helper and public directory RLS; they do not broaden access to family/account tables.

Before applying later, recheck history, existing avatar references, the absence of a conflicting bucket, and that no seed batches have since been imported. Use a separately approved isolated release. **Do not reapply Community V1:** its original empty-Community guard is intentionally historical, and real conversations now exist.

## Import format and image preparation

The current CLI requires `schema_version: 3`. Each profile still contains `key`, `display_name`, and historical `created_at`, with optional:

```json
{
  "avatar_path": "<deterministic-starter-profile-uuid>/portrait-v1.webp"
}
```

This is a format illustration, not an importable profile. Omit `avatar_path` or use `null` for initials. The bucket prefix is omitted in input and added when storing `avatar_url`.

Use exported `starterProfileId(batch_key, profile_key)` from `seed.mjs` to calculate the folder. It uses the unchanged UUID representation of `md5('vital-starter:profile:' + batch_key + ':' + profile_key)`. The basename must start with a lowercase letter/digit, contain only lowercase letters/digits/hyphens, be at most 80 characters before the extension, and end in `.jpg`, `.jpeg`, `.png` or `.webp`. External URLs, local paths, data URLs, SVG/GIF, query strings, traversal and another profile's folder are rejected.

Prepare modest square, compressed images (512×512 is a practical target), remove unnecessary embedded metadata, and use versioned filenames rather than overwriting cached assets. The migration enforces MIME/byte limits, not pixel dimensions or editorial suitability. Final synthetic portraits must depict adults only, be unrelated to real people or stock photographs, and must not be used as testimonials. Profiles without images remain supported.

Dry-run is credential-free and validates the JSON/reference syntax; it does **not** claim the remote object exists. The existing CLI dry-run test uses 30 clearly labelled fixture identities plus one fixture post, reply and reaction, all local-only. No approved final editorial bundle is supplied or imported.

After separate approvals, execute would read each referenced object's Storage metadata, verify linked published activities, then call the transactional RPC. The RPC checks objects again, including on replay, and returns `image_references_verified: true`, `identity_mode: non_login_profiles` and verified stored counts. The CLI requires all three. Changing an existing batch fails instead of updating it. Versions 1/2 are rejected, and the currently applied V2 RPC rejects V3 before writes; applying the pending image migration is required before using this new importer.

Credentials remain `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from process environment only. There are no Auth Admin calls, key output, dotenv loading, committed credentials, client-side administrative secrets, or image uploads in the importer.

A genuine-member photo picker/editor and a production portrait-upload utility are **not** included. The shared storage/rendering/ownership foundation permits them later; this pass does not imply members can already choose a photo in You.

## Exact About Community copy

### About starter conversations

To help get Community going, Vital created some starter profiles and conversations showing the kinds of questions, ideas and experiences people can share here. As the community grows, conversations from members will naturally take their place.

Some starter profiles use generated profile images.

The public explanation contains no endorsements disclaimer, database/provenance explanation or Helpful-metric implementation detail. Existing internal provenance protections and genuine-only metrics remain unchanged. The explanation is in About Community, not repeated as a warning on every post.

## Validation

- Mobile `npm run typecheck`: passed.
- Mobile `npm test`: **29/29 passed**, including eight image/disclosure tests (ownership/reference syntax, initials/error state, batching/cache/expiry/limits, real/seed parity, optional failure handling, API hydration and exact copy).
- Community/importer/PostgreSQL/RLS tests: **46/46 passed** — 24 existing database regressions, seven migration guards, five new image database tests and ten importer tests, including the actual credential-free CLI dry-run.
- The first local image migration test caught a SQL regex escaping mismatch. It was corrected to a literal `[.]` before any live operation; the full suite then passed.
- Image database tests cover a seeded image with no Auth row, NULL images, exact replay, missing/invalid/oversized images, owned-folder CRUD, linked-image reads, anonymous/forged-seed denials, unchanged real rows/rules, service-only import and genuine metrics. An Auth write tripwire remains active during import.
- Expo Doctor: **21/21 passed**.
- Expo export: Android and iOS Hermes bundles plus web static export, **27 routes**. The sandbox initially blocked Hermes; the same local export succeeded with compiler permission.
- Browser QA via the computer-use skill: **375, 390, 430, 768, 1024px** for feed, full conversation/replies, moderator detail, composer and shared 54px profile-avatar probes. Fixed circle dimensions, image-present/absent/broken fallbacks, long-name wrapping and no horizontal overflow verified. Exact About copy visually checked at 375px. The actual You data-fetch path is typechecked; the 54px rendering was exercised in the isolated fixture without fabricating an authenticated account.
- Browser console: no unexpected errors/warnings in normal/image-failure views. Deliberately injected content failure retained the customer-safe retry panel; only expected development diagnostics were logged.
- UI fixtures used the unchanged existing brand mark as an image-loading probe and an intentional 404. They are not app routes, do not construct a Supabase client and do not create production data.
- Whitespace checks cover tracked changes and the current pass's untracked files. Applied migrations, dependency lockfile and unrelated baseline files are unchanged.

Known local-tooling warnings: Node's existing MODULE_TYPELESS_PACKAGE_JSON warning, conflicting NO_COLOR/FORCE_COLOR settings, and React Native DevTools' local dotslash-directory conflict (Metro used its bundled fallback). No dependency/system repair was made for these unrelated warnings. Local preview processes were stopped and the browser viewport restored.

Physical-device image decoding/cache behaviour, a real photo upload and live Storage API/RLS verification remain post-approval checks. PGlite tests validate PostgreSQL policies and a Storage metadata fixture; they are not a substitute for running the hosted Storage service. No upload was performed merely to test it.

## Live read-only confirmation

The final read-only aggregate check on 10 September found:

| Inventory | Result |
| --- | ---: |
| Activities / resources / links | 463 / 88 / 162 |
| Genuine profiles / seeded profiles | 1 / 0 |
| Profiles with images / profile-image buckets | 0 / 0 |
| Existing Community posts / replies | 1 / 1 |
| Seed import ledger entries | 0 |
| Current rules version | 2 |

Applied versions remain `20260823204450`, `20260826085303`, `20260826133200`, `20260827090000`, `20260903120000`, `20260908120000`, `20260910120000`. The image migration is absent from live history. No live database, Auth or Storage writes were performed by this pass.

## Exact current-pass files

Compared with the starting working-tree hashes, preserving earlier uncommitted work.

### Created (7)

- [apps/mobile/src/components/vital/profile-avatar.tsx](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/src/components/vital/profile-avatar.tsx>)
- [apps/mobile/src/lib/profile-images.ts](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/src/lib/profile-images.ts>)
- [apps/mobile/src/services/profiles.ts](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/src/services/profiles.ts>)
- [apps/mobile/tests/profile-images.test.mjs](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/tests/profile-images.test.mjs>)
- [scripts/community/PROFILE_IMAGES.md](<C:/Users/clayj/Projects/Vital-Platform/scripts/community/PROFILE_IMAGES.md>)
- [scripts/community/profile-images.test.mjs](<C:/Users/clayj/Projects/Vital-Platform/scripts/community/profile-images.test.mjs>)
- [supabase/migrations/20260910180000_community_profile_images.sql](<C:/Users/clayj/Projects/Vital-Platform/supabase/migrations/20260910180000_community_profile_images.sql>)

### Modified (17)

- [apps/mobile/package.json](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/package.json>)
- [apps/mobile/src/app/(tabs)/you.tsx](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/src/app/(tabs)/you.tsx>)
- [apps/mobile/src/features/community/community-actions.tsx](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/src/features/community/community-actions.tsx>)
- [apps/mobile/src/features/community/community-api.ts](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/src/features/community/community-api.ts>)
- [apps/mobile/src/features/community/community-detail.tsx](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/src/features/community/community-detail.tsx>)
- [apps/mobile/src/features/community/community-model.ts](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/src/features/community/community-model.ts>)
- [apps/mobile/src/features/community/community-moderation.tsx](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/src/features/community/community-moderation.tsx>)
- [apps/mobile/src/features/community/community-screen.tsx](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/src/features/community/community-screen.tsx>)
- [apps/mobile/src/features/community/community-ui.tsx](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/src/features/community/community-ui.tsx>)
- [apps/mobile/tests/community-preview.tsx](<C:/Users/clayj/Projects/Vital-Platform/apps/mobile/tests/community-preview.tsx>)
- [package.json](<C:/Users/clayj/Projects/Vital-Platform/package.json>)
- [scripts/community/README.md](<C:/Users/clayj/Projects/Vital-Platform/scripts/community/README.md>)
- [scripts/community/database.test.mjs](<C:/Users/clayj/Projects/Vital-Platform/scripts/community/database.test.mjs>)
- [scripts/community/seed.mjs](<C:/Users/clayj/Projects/Vital-Platform/scripts/community/seed.mjs>)
- [scripts/community/seed.test.mjs](<C:/Users/clayj/Projects/Vital-Platform/scripts/community/seed.test.mjs>)
- [scripts/community/serve-preview.mjs](<C:/Users/clayj/Projects/Vital-Platform/scripts/community/serve-preview.mjs>)
- [scripts/community/test-fixtures.mjs](<C:/Users/clayj/Projects/Vital-Platform/scripts/community/test-fixtures.mjs>)

The package manifest edits only add the new test files to existing test commands. Generated, ignored `apps/mobile/dist` output was refreshed by export; it is not a source/dependency change.

## Required approvals before the next phase

1. Review and explicitly approve the pending image migration, then apply it separately and run hosted Storage/RLS checks.
2. Approve the portrait-generation brief and which of the 30 profiles should have an image. Only synthetic adults, no real-person references/stock/children; initials are valid for the rest.
3. Review the final portraits and approve a scoped Storage upload with the exact versioned object paths. No production upload utility or upload has been run here.
4. Approve the final names/content/image-reference bundle, inspect its dry-run and provenance/metrics separation, then separately authorize import.

**Stopped before migration application, image generation/upload, starter seeding, commit, deployment or GitHub push.**

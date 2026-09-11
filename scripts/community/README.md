# Community V1 implementation and starter import

Community reuses the existing rooms, posts, comments, post/comment reactions, rules and acceptances, reports, restrictions, blocks, moderation actions and revision history. `public.profiles` remains the community identity directory: genuine profiles are Auth-backed and starters are non-login identities. No family/account access policy is broadened. See [profile images and disclosure preparation](PROFILE_IMAGES.md) for the current optional-image architecture and approval gates.

## Migration and rollout

`supabase/migrations/20260910120000_community_v1.sql` was applied after approval on 10 September 2026. It added:

- Optional topic (`Mums`, `Kids`, `Together`, `Life`, `Food`), post type, tags, and a nullable activity FK on existing posts.
- Protected `is_seeded` and unique `seed_key` on profiles, posts, replies and both reaction tables.
- A constrained, generated `profiles.auth_user_id` FK: genuine profiles retain their Auth UUID; starter profiles are explicitly non-login, with no Auth row.
- Stored full-text vectors/indexes on posts/replies, a caller-RLS catalogue view and bounded search/reply RPCs.
- A new current Community Rules version explicitly covering advertisements, promotions, affiliate spam, repeated self-promotion, commercial solicitation and respectful disagreement. Old rules/acceptances remain as history; everyone must accept the new version to participate.
- A service-only transactional seed import, import ledger and genuine-only metrics RPC. It creates no starter content when the migration runs.

The migration is one transaction with a five-second lock timeout. It locks profiles/rules/contribution tables and refuses unexpected original profile/Auth constraints, orphan or legacy-seeded Auth-backed profiles, any pre-existing Community contributions, or anything other than the exact previously reviewed rules version 1. This matches the read-only preflight's empty Community starting state. If new contributions appear before application, STOP and review their provenance; do not remove the guard just to proceed. It retains old acceptances and retires rules 1 only when publishing rules 2 successfully. Any later failure rolls back schema, backfill and rules together.

Rescue and Community V1 were subsequently applied and verified in separate, explicitly approved single-migration releases. Community V1 has now passed the user's real-iPhone test. The new `20260910180000_community_profile_images.sql` is **prepared only, NOT applied**. It must receive separate approval; do not run a database push or import as part of image preparation. Applied migrations are unchanged.

## Mobile behaviour

The existing Community tab renders the feature in `apps/mobile/src/features/community/`. The shell, authentication, bottom navigation and other product screens are unchanged. A post opens within the tab, preserving access to bottom navigation. Android hardware Back returns to the Community list. Linked activities use the existing activity-detail route.

Search, topic and post-type filters run on the server. Search uses `websearch_to_tsquery('english', ...)` and weighted post title/type/topic/body vectors, plus tags, the published linked activity's title, and visible reply text. Title evidence carries the greatest post weight; reply evidence adds a lower deterministic relevance score. Recent and Helpful modes are explicit; Helpful ignores seeded reactions. Ties use created time then ID. No AI, follower graph or opaque engagement ranking is used.

Each page requests 20 records (the server caps requests at 30); one extra row establishes Show More. Replies also use 20-row pages. Activity lookup returns at most 8 results. The moderation queue reads at most 20 reports and batches post/reply hydration, avoiding N+1 requests. Offset pagination is capped at 10,000; a changing live catalogue can shift page boundaries, so the client de-duplicates appended IDs and Refresh restarts the list. There is no automatic infinite loading or realtime firehose. An offset/cursor upgrade and server search tuning may be appropriate at a substantially larger corpus.

Post previews are explicitly excerpts; the conversation shows complete selectable post/reply text. Replies are chronological, with a parent-name cue and a maximum of one reply level enforced by the existing database trigger. The composer has labelled fields, field-level focus borders, validation, optional topic/activity, retained text on failure, draft-discard confirmation, safe-area handling and keyboard avoidance. Posting/replying/adding or changing Helpful requires current rules acceptance and no active restriction. Deleting one's own Helpful reaction, reporting and blocking retain the prior permissive safety paths. Writes are not automatically retried; read retries use only the existing narrowly bounded future-JWT handling.

Members can report posts/replies, block authors and soft-remove their own content subject to existing locks/restrictions. Moderation review supports report triage/resolution/dismissal, removal/restoration, lock/unlock and imposition/revocation of restrictions. Existing triggers record content, restrictions and dismissal history; reports retain reviewer, resolution note and timestamps. Moderation buttons are shown from a server-derived capability, while every action still undergoes RLS/trigger checks. The current Owner > Admin > Moderator > Member hierarchy is preserved. UI role state is never authorization.

## Starter provenance and genuine metrics

Every starter record has `is_seeded=true` and a batch-qualified `seed_key`. These cannot be forged or cleared by members or moderators. Ordinary contributions to a starter post remain ordinary contributions (`is_seeded=false`). The `search_community_posts` RPC supports `provenance = combined | genuine | seeded`; the normal UI uses combined. About Community explains starter conversations using the exact copy in [PROFILE_IMAGES.md](PROFILE_IMAGES.md). A restrained “Vital starter” label remains; optional images use the same renderer as genuine profiles, with initials when absent or unavailable. No portrait has been generated or uploaded in this preparation pass.

`profiles.id` remains the one Community identity UUID; there is no parallel identity table. The applied Community V1 migration replaced its mandatory Auth FK with a nullable, unique `auth_user_id -> auth.users(id) ON DELETE CASCADE`. The link is **GENERATED ALWAYS AS (CASE WHEN is_seeded THEN NULL::uuid ELSE id END) STORED**. Thus genuine profiles necessarily retain `id = auth_user_id = auth.uid()` and a valid Auth row; seeded profiles necessarily have a null link. Existing genuine links populated without an UPDATE, preserving profile timestamps. The original Auth signup trigger remains unchanged and still creates genuine profiles/preferences. Auth deletion still cascades through genuine profiles and their existing dependent rows; existing moderation-audit deletion restrictions are not relaxed.

Protected `is_seeded=true` plus a unique nonblank `seed_key` identifies starters. A guard makes profile ID, identity kind and key immutable and prevents a seed UUID aliasing an existing Auth user. The existing signup trigger/profile primary key rejects a later Auth signup with a seed UUID. Clients cannot write the generated Auth link, detach genuine profiles, convert either identity kind, or insert seed provenance. Administrative imports insert **only `public.profiles`**, then existing Community content tables and the import ledger. There are **zero managed Auth schema writes or Auth Admin API calls**, and no fake preference, newsletter, notification, family, biography or account rows. Starter identities therefore do not inflate raw Auth totals. Raw profile totals still include starters; use explicit provenance for membership metrics.

The small SECURITY DEFINER `is_authenticated_member()` helper checks the caller's profile has a matching non-null Auth link and is not seeded. Its safe `pg_catalog` search path and qualified objects avoid profile-RLS recursion; EXECUTE is limited to authenticated/service roles. An additional restrictive actor policy on all 25 existing profile/ownership/Community tables ANDs this check with existing permissive policies. It cannot grant new access to private families/accounts. Even a forged seed subject cannot own, report, block, moderate or participate. This gate deliberately does not demand rules acceptance or unrestricted posting, so genuine restricted members retain reporting, blocking and own-reaction deletion. Posting/reaction eligibility additionally keeps the existing rules/restriction checks. Moderators can still moderate starter content using existing hierarchy/audit rules.

`community_genuine_metrics()` is service-only. It counts non-seeded member profiles, non-seeded posts by real profiles, replies by real profiles on real posts, and Helpful reactions by real profiles on real posts/replies. The `members` count means registered non-seeded directory profiles, not active Community users. Interactions by real members with starter conversations can be analysed separately; they are intentionally excluded from this strict genuine-only result. Seeded reactions never contribute to public Helpful counts or Helpful ordering. Do not use starter text as testimonials, endorsements or growth evidence.

## Editorial JSON format

No final editorial dataset is included. Test fixtures are explicitly labelled, live only in isolated tests, and are refused by CLI execute mode. Supply a reviewed JSON object containing:

| Field | Meaning |
| --- | --- |
| `schema_version` | `3` (optional images and non-login profiles; versions 1/2 are rejected by this CLI) |
| `batch_key` | Stable lowercase key, maximum 80 characters |
| `editorial_approved` | `true` only after product-owner text approval |
| `profiles` | Exactly 30 entries: `key`, `display_name`, historical `created_at`; optional `avatar_path` (or null) |
| `posts` | Approximately 36: `key`, `author_key`, `post_type`, `title`, `body`, `created_at`; optional `topic`, `activity_id`, `tags` |
| `replies` | Approximately 80: `key`, `author_key`, `post_key`, `body`, `created_at`; optional root `parent_key` |
| `reactions` | Optional/uneven: `key`, `author_key`, `target_type` (`post` or `reply`), `target_key`, `created_at`; Helpful only |

Use the 30 approved public display names exactly once; they are listed in `APPROVED_NAMES` in `seed.mjs`. This enforces the approved 15/6/9 public-name balance without storing a gender attribute. No required equal participation, replies-per-post or reaction distribution exists. Post types are `question`, `experience`, `idea`, `tip`, `discussion`; the last accommodates support/general conversation. Exact 36/80 counts are informational warnings because the brief specifies approximate counts. The V1 safety bounds are 100 posts, 300 replies and 300 reactions per batch.

Every timestamp must explicitly include a timezone and be historical. Profiles must precede their content, replies their post/parent, and reactions their target. The dataset can span the intended 6–8 weeks. Import does not correct spelling, grammar, punctuation, casing or emoji, and does not rewrite prose. Author names/keys must be unique; missing links, cross-post/deep parents, duplicate reactions, overlong/blank content, unsupported profile attributes and unavailable activity links fail validation.

## Commands and safety

From the repository root:

```powershell
npm run community:seed -- --input C:\path\reviewed-community.json --dry-run
npm run community:test
npm run community:test:db
```

The database tests require `@electric-sql/pglite` in a separate validation runtime. Set `PGLITE_MODULE` to its absolute `dist/index.js` path when it is not installed locally. They run the real core/community/new migrations and RLS inside fresh in-memory PostgreSQL databases; Auth is represented by a minimal schema fixture. They never connect to Supabase. Tests cover backfill, signup, ownership, cascades, seed spoofing, coexistence, moderation/metrics and fail-safe rollback. A statement-level Auth tripwire fails on ANY insert/update/delete during isolated seed import; before/after Auth rows are identical. The actual CLI dry-run is also tested without credentials. No new mobile dependency is required.

Only after separate database-migration and final editorial/import approval, the prepared execute command is:

```powershell
npm run community:seed -- --input C:\path\reviewed-community.json --execute --confirm-project https://YOUR_PROJECT.supabase.co
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must exist in process environment only. There is no dotenv loading, no key output, no mobile/admin-key code and no committed env file. Execute first reads metadata for referenced Storage images and verifies published activity IDs, then calls a service-role-only transaction. It does not upload images. The transaction uses stable UUIDs, a lock and an immutable batch fingerprint. An identical replay verifies existing counts, every image reference and corresponding supported Storage object; a changed batch fails without overwriting any conversation. A missing reference rolls back all identities/content in that transaction. It verifies all imported profiles have null Auth links and no corresponding Auth rows, returns `identity_mode: non_login_profiles`, `image_references_verified: true` and verified stored counts, and the CLI requires all of these. Format version 3 prevents the current CLI using the older RPC that cannot retain images; the pending migration must be approved/applied first. Existing batches cannot be silently edited/pruned; future seed editorial amendments need a separately reviewed operation.

For a separately authorized linked read-only preflight, use `supabase migration list --linked` and `supabase db query --linked --file scripts/community/preflight.sql` with the installed CLI. The SQL explicitly starts a read-only transaction and ends with rollback; it returns aggregate identity/provenance checks, current rules, migration history and complete Rescue instructions, not member personal data. Review pending files again immediately before any later approval to apply them. This corrective pass does not authorize any `db push` or seed execution.

## Isolated UI QA

Start Expo on port 8091 in `apps/mobile`, then `node scripts/community/serve-preview.mjs` from the root. Open `http://127.0.0.1:8092`. This loads `apps/mobile/tests/community-preview.tsx` through Metro; it is not an app route and constructs no Supabase client. Query states are `empty`, `error`, `rules`, `restricted`, `moderator`, `avatars`, or the default populated fixture. All fixture actions stay in memory. Image probes serve the unchanged existing brand mark and an intentional 404, never generated portraits. The proxy binds only to loopback and serves the local Metro assets. Stop both development processes after testing.

Community V1 is already live. Avatar-free Community reads continue against the applied schema because `avatar_url` already exists; the optional image-storage/import additions remain pending approval. Real-device image cropping/cache behaviour and live Storage/RLS checks with approved assets remain post-approval rollout checks.

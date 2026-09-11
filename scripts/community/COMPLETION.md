# Community V1 completion report

10 September 2026. Updated for the final pre-migration corrective pass. The connected database has **not** been migrated or seeded. This report covers Community only, not the pre-existing Home, Discover, authentication, branding or content-import changes in the dirty working tree.

## Corrective-pass files and scope

The still-unapplied migration now uses explicitly seeded **non-login public profiles**, not dormant Auth identities. No mobile UI, Auth/session code, dependency/version, historical migration or pending Rescue migration was changed in this corrective pass.

Modified in this corrective pass (8):

- `supabase/migrations/20260910120000_community_v1.sql`
- `scripts/community/seed.mjs`
- `scripts/community/test-fixtures.mjs`
- `scripts/community/database.test.mjs`
- `scripts/community/seed.test.mjs`
- `scripts/community/README.md`
- `scripts/community/COMPLETION.md`
- `package.json` (include the new migration-guard tests in `community:test:db`)

Created in this corrective pass (2):

- `scripts/community/migration-guards.test.mjs`
- `scripts/community/preflight.sql` (explicitly read-only linked audit)

## 1. Existing infrastructure discovered

The existing core and community/moderation migrations already provide community rooms, posts, comments, one-level reply integrity, post/comment reactions, rules/acceptances, saved posts, reports, blocks, restrictions, revisions and moderation audit actions. `public.admin_roles` and protected helpers enforce Owner > Admin > Moderator > Member. `public.profiles` is the authenticated community identity directory, with a mandatory `auth.users` foreign key; private families/family_members remain separately protected.

## 2. Reused versus added

Reused all those tables, the General room, Supabase authenticated client, session handling, customer-safe errors, design tokens, shared controls, shell and existing activity route. Added the Community feature, classification/activity/provenance fields on existing tables, bounded catalogue/search/reply queries, a starter import ledger and administrative import/metrics functions. No parallel membership, moderation, reaction or authentication system was introduced.

## 3. Initial Community build inventory (retained for context)

All paths below are relative to `C:\Users\clayj\Projects\Vital-Platform`.

Created (21):

| Path | Purpose |
| --- | --- |
| `apps/mobile/src/features/community/community-model.ts` | Types, topics, post types, validation and safe participation copy |
| `apps/mobile/src/features/community/community-api.ts` | Bounded authenticated data/mutation API |
| `apps/mobile/src/features/community/community-hooks.ts` | Cancellable pagination, safe errors, narrow read retry |
| `apps/mobile/src/features/community/community-ui.tsx` | Community fields, actions, modal, initials and notices |
| `apps/mobile/src/features/community/community-screen.tsx` | Landing, filters, ordering, list and feature navigation |
| `apps/mobile/src/features/community/community-composer.tsx` | Post composer and optional activity search |
| `apps/mobile/src/features/community/community-detail.tsx` | Complete posts/replies, Helpful and reply composer |
| `apps/mobile/src/features/community/community-actions.tsx` | About/rules, reporting/blocking, restrictions |
| `apps/mobile/src/features/community/community-moderation.tsx` | Report queue and review actions |
| `apps/mobile/src/services/community.ts` | Existing Supabase-client adapter |
| `apps/mobile/tests/community.test.mjs` | Mobile model/API tests |
| `apps/mobile/tests/community-preview.tsx` | Isolated in-memory visual QA entry, not an app route |
| `scripts/community/seed.mjs` | Validated, dry-run-first administrative importer |
| `scripts/community/seed.test.mjs` | Starter validation/import safety tests |
| `scripts/community/test-fixtures.mjs` | Explicitly synthetic automated-test bundle |
| `scripts/community/database.test.mjs` | Real PostgreSQL/RLS tests in an isolated PGlite database |
| `scripts/community/serve-preview.mjs` | Loopback-only visual QA server/proxy |
| `scripts/community/preview.html` | QA host page |
| `scripts/community/README.md` | Architecture, import format, safety and rollout instructions |
| `scripts/community/COMPLETION.md` | This report |
| `supabase/migrations/20260910120000_community_v1.sql` | Prepared schema/functions/rules extension; not applied |

Modified (4):

| Path | Community-specific change |
| --- | --- |
| `apps/mobile/src/app/(tabs)/community.tsx` | Replaces holding content with Community; existing shell/activity route retained |
| `apps/mobile/package.json` | Adds Community tests to the existing mobile test command |
| `apps/mobile/tsconfig.json` | Allows `.ts` import extensions for Node-based TypeScript tests |
| `package.json` | Adds Community seed/unit/database-test commands |

No dependencies or dependency versions were added/changed by this task. `package-lock.json` already had unrelated changes and remained byte-for-byte unchanged during Community work (SHA256 `D0807FBD6F694520ED301E4DF7CEBB01AD367D9410253D7CC044682CF765884B`). The ignored `apps/mobile/dist` directory was regenerated by export. Older migrations and unrelated pending files were not edited.

## 4. Database/schema changes

The new migration adds post type, optional topic, optional activity FK, tags, stored full-text vectors and supporting indexes. Profiles/posts/replies/both reaction tables gain protected `is_seeded` and unique `seed_key`. It adds a security-invoker catalogue view, search/reply/access RPCs, a service-only seed ledger/import and genuine-metrics RPC. It publishes current rules version 2 while preserving previous versions/acceptances. The migration itself creates no starter profiles or conversations.

`profiles.id` remains the Community UUID. A unique generated `auth_user_id` is `id` for genuine profiles and NULL for seeded profiles, with a validated FK to `auth.users(id) ON DELETE CASCADE`. The replacement FK validates before the original mandatory `profiles.id` FK is dropped. Generated backfill preserves real IDs, display names and timestamps without UPDATEs. The original Auth signup trigger/preferences and genuine-user deletion dependencies remain intact, including existing audit-related deletion restrictions. ID, identity kind and seed key are immutable; seed keys are nonblank/unique and true provenance requires a key. Seed UUID/Auth collisions are rejected. There is no parallel membership system or new exposure of private account/family fields.

One transaction and a five-second lock timeout protect the change. Explicit guards reject unexpected/unvalidated/non-cascading original FKs, orphan profiles, legacy Auth seed markers, unexpected rules history/body/current state, and any pre-existing Community contributions. The last condition matches the linked empty-Community audit; drift requires review instead of silently assigning genuine provenance. A tested late failure rolls back schema, generated links and rules retirement together.

### Final approved rules version 2

Only rules 1 and 6 changed from the reviewed eight-rule draft: **bullying** is explicit again, and advice covers **health, wellbeing or safety**. The other six rules are unchanged. Relative to the existing seven-rule version 1, version 2 also has the approved explicit commercial-promotion prohibition and more practical family/community guidance. Old acceptance records remain attached to version 1; everyone must accept version 2 before participation. Reporting, blocking and deleting one's own reactions remain available while restricted or awaiting acceptance.

1. Be kind. Different families find different things useful. Disagreement is welcome; judgemental parenting, bullying, hostility, harassment, hate, threats and abuse are not.
2. Keep children safe. Do not sexualise children or share identifying or sensitive information about them.
3. Protect privacy. Do not share someone else's private information without permission.
4. Keep this a family-appropriate space. No sexual, violent or exploitative material.
5. No advertisements, promotional posts, affiliate spam, repeated self-promotion or commercial solicitation. Honest conversation about something you used is welcome; sales pitches, referral codes and business promotion are not.
6. Do not spam, scam, impersonate others or deliberately spread dangerous misinformation. Personal experience is not a substitute for professional health, wellbeing or safety advice.
7. Report concerns to the Vital team rather than escalating conflict. You can also block another member.
8. Share what worked, ask when you are stuck, and leave room for ordinary family life. Ideas, not homework.

## 5. RLS/policy changes and review

Existing permissive policies and moderation hierarchy remain intact. A restrictive `authenticated_member_actor` policy is ANDed with them on 25 existing profile, ownership and Community tables. The `is_authenticated_member()` helper requires a genuine profile with a matching non-null Auth link; it prevents a forged seed subject from acting, owning, reporting, blocking or moderating. It does not require unrestricted posting/rules acceptance, preserving real members' safety actions. `can_create_community_content()` additionally requires current rules acceptance and no active restriction. Provenance triggers reject member/moderator spoofing or erasure. A classification guard prevents moderators rewriting another author's added fields and validates newly selected activities without blocking moderation when an old linked activity is later archived.

New reads use caller RLS, explicit `pg_catalog` search paths and qualified application objects. The small identity guard/member helper, eligibility helper and service-only import use SECURITY DEFINER; the member lookup bypasses profile RLS to avoid recursion. Trigger-function EXECUTE is revoked from clients; the member helper is authenticated/service-only. Anonymous EXECUTE/SELECT is revoked; administrative import/metrics are not callable by authenticated members. Null/oversized pagination requests cannot bypass limits. The additional family/account actor policies only narrow access and retain all existing ownership predicates. Real PostgreSQL tests exercised recursion-sensitive reads, privilege escalation, private-family isolation, role hierarchy, blocks, hidden content, provenance and all restriction/reaction variants successfully.

## 6. Community landing

The tab now presents “Made to be useful, not noisy.”, restrained explanatory copy, prominent search, All/Mums/Kids/Together/Life/Food filters, four obvious posting routes, finite conversation cards, explicit order controls and About/rules. Empty, zero-result, loading and customer-safe retry states are implemented. Existing header, bottom navigation, Home, Discover, Saved, You and branding were not redesigned.

## 7. Search

Server-side English PostgreSQL full-text search covers title, body, post type, topic, tags, linked published activity title and visible/unblocked reply text. Post-title evidence has the strongest weight and reply relevance is down-weighted. No AI/external search dependency. Input is capped at 200 characters and debounced on the client. Search and all filtering happen before server pagination.

## 8. Filtering/ordering

Topic and post-type filters combine with search. Explicit Recent, Helpful and Relevant modes use deterministic timestamp/ID tie-breaks. Helpful ordering ignores seeded reactions. Posts/replies load 20 at a time, server-capped at 30; an extra record determines Show More. Appended IDs are de-duplicated. No infinite-scroll loading, member popularity rankings or follower mechanics.

## 9. Posts/replies/composer

Question, Idea, Experience and Tip are primary routes; Conversation supports general/support discussion. Title/body are required, topic/activity optional. Inputs are labelled, have focus styles and understandable limits, keep drafts on failure and confirm discarding. Full detail/reply text is selectable and not line-clamped; only feed previews are excerpts. Replies are chronological with one-level parent context. Own soft-removal confirms before acting and respects existing restrictions/locks. Successful creation, reply, validation and Helpful interactions were exercised with local-only UI fixtures and database tests.

## 10. Helpful

Uses the existing post/comment reaction tables with `helpful`, one reaction per member/target. Writes require current rules acceptance and no active posting restriction, suspension or permanent ban. Restricted members can still DELETE their existing reactions. Public Helpful counts and ordering exclude seeded reactions. Both UI states and database enforcement were checked; role/eligibility claims never come from client input.

## 11. Reporting/moderation

Post/reply reporting includes an explicit advertising/promotion/spam reason, optional detail and separate block confirmation. These safety actions remain available while restricted. Moderators have a bounded oldest-first review queue, full reported content, review notes, resolve/dismiss/under-review, remove/restore, lock/unlock and restriction/revocation controls. Existing triggers/audit records remain authoritative. Moderator-only display does not replace server authorization. Tests confirm lower/equal/self restriction prohibitions and protection against undoing higher-authority restrictions.

## 12. Linked activity

Posts can link a published existing Vital activity, using an 8-result title lookup and nullable FK. Detail/list links route to the existing activity screen. The relationship/index prepares later “What families discovered” integration without changing activity-detail UI now.

## 13. Seed provenance

Profiles, posts, replies and both reaction types have explicit provenance and batch-qualified stable keys. About explains starter conversations; avatars use initials and a restrained “Vital starter” identifier. No fake photographs, biographies, hidden gender attributes, testimonials or final editorial conversations were produced. Ordinary member contributions to starter conversations retain their genuine row provenance.

## 14. Import mechanism

The importer defaults to validation/dry-run. It enforces exactly the 30 approved display names, preserving the requested 15/6/9 public-name balance without gender storage. Approximately 36 posts/80 replies are informational expectations, not equal-engagement requirements. Historical, timezone-qualified timestamps and author/post/parent/reaction chronology are validated. Prose, spelling, emoji and casing are preserved.

Execute requires environment-only `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, explicit project confirmation and editorial approval; test fixture batch names are refused. A service-only transaction uses stable IDs, a lock, immutable payload fingerprint and stored-count verification. Identical replay verifies; changed content fails without overwriting. Reference failure rolls back. An uncertain response is reported as unconfirmed, not falsely claimed rolled back. No real importer execution occurred.

The importer now inserts starter identities solely into `public.profiles`, with generated NULL Auth links. There are **zero direct managed Auth writes and zero Auth Admin API calls**; no fake preferences/notifications/newsletters/families are created. An isolated Auth INSERT/UPDATE/DELETE tripwire and complete before/after Auth-row comparison prove the SQL import stays outside managed Auth. An API mock fails on any Auth API access. Bundle format version 2 rejects the obsolete Auth-writing version-1 path; CLI verification requires `identity_mode: non_login_profiles`, verified stored counts and a transaction-side no-Auth-identity check. Signup/collision/deletion tests exercise the actual existing SQL triggers, but do not claim to run the live GoTrue service.

## 15. Genuine versus starter data/metrics

Search supports combined/genuine/seeded provenance. The service-only genuine metrics query excludes seeded identities and contributions/targets from member, post, reply and Helpful metrics. Public Helpful ignores seeded reactions. Starters no longer inflate raw Auth totals; raw profile totals still include starters and must be filtered. Registered-profile metrics are not active-community-user metrics. Real replies/reactions retain genuine row provenance inside starter threads but are excluded from the strict genuine-target metric. Starter material must not become testimonials/social proof.

## 16. Migrations prepared, not executed

Final read-only linked history/preflight succeeded at **2026-09-10 13:47:42 UTC** (14:47 BST), after the corrective tests and all-platform export passed. Applied migrations are:

| Version | Name |
| --- | --- |
| `20260823204450` | `initial_vital_schema` |
| `20260826085303` | `community_and_moderation` |
| `20260826133200` | `retain_resource_source_document` |
| `20260827090000` | `authenticated_vital_resource_pdf_read` |
| `20260903120000` | `normalize_activity_environment_metadata` |

Exactly two local migrations are pending:

1. `20260908120000_correct_rescue_the_explorer_indoor_instructions.sql` — pre-existing, unrelated.
2. `20260910120000_community_v1.sql` — prepared by this task.

An ordinary `db push` would not be Community-only. Neither file was applied, retired or otherwise processed. No migration push, deployment, commit, GitHub push or real seed/account/content/storage write occurred. Only isolated in-memory test databases and local QA fixtures were mutated.

### Fresh linked preflight results

- Rules: exactly one row, current version **1**, title `Vital Community Rules`, published `2026-08-26T14:46:26.041414+00:00`, no retirement. Exact seven-rule content matches the migration's rules guard. Zero existing acceptance rows.
- Profiles: **1**, with **0 missing Auth users**. Original validated FK is `FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE`; the existing `on_auth_user_created` trigger is present. No new Auth-link column is installed yet.
- Provenance indicators: **0** existing Auth seed markers, known starter display names or explicit test-name matches. These name checks are indicators, not proof of a person's real-world identity.
- Community: **0 posts, 0 comments, 0 post reactions, 0 comment reactions**. Also zero revisions, reports, moderation actions and restrictions; no seed ledger. There is no current or retained Community history indicating seed/test contributions. No existing contributions need relabelling as genuine; the migration refuses to silently classify any that appear later.
- Content inventory: **463 activities, 88 resources, 162 activity-resource relationships**. Read-only preflight changed none.
- Rescue: exactly the expected `VK-5-7-0018` / `Rescue the Explorer` row. Its guard matches; the old sentence occurs **once**. Existing `updated_at` is `2026-08-27T10:44:50.79126+00:00`.

Complete current Rescue instructions:

> Hide a toy explorer somewhere around a garden or park. Create several simple obstacles between the start and the explorer, such as stepping stones, crawling under a rope, balancing along a line or carrying a pretend supply bag. Once the explorer is found, carefully carry them back while completing the obstacles again. Encourage teamwork if more than one child is taking part.

The prepared Rescue migration replaces only that opening sentence with “Hide a toy explorer somewhere around the house, garden or park.” The rest remains unchanged. It explicitly updates `instructions` and `updated_at` for the guarded row; the existing generated activity search vector is recomputed from the changed instructions. It does not change environment flags, other rows, resources or relationship data. Rescue SQL was not modified in this pass.

### GO / HOLD

- **Rescue: GO for a separately approved, isolated application.** Complete live text matches the guard and contains exactly one intended replacement. Verify the affected row and unchanged inventory immediately afterwards.
- **Community: GO for a separately approved, isolated application after Rescue verification.** The corrected non-login architecture passes the local SQL/RLS, lifecycle, importer and rollback tests, and the fresh linked state matches the guards. No remaining issue found that requires a pre-migration design correction. Run the read-only preflight again if the state changes or application is delayed. Connected PostgREST/genuine Auth and physical-device smoke tests remain post-application rollout checks, not claims made by the local fixture tests.
- **Execution remains on hold in this task:** neither GO assessment is execution authority. Both migrations remain pending. Final editorial content/import approval is separately outstanding.

## 17. Validation results

| Check | Result |
| --- | --- |
| Mobile `npm run typecheck` | PASS |
| Mobile `npm test` | PASS: 21/21, including 6 new Community tests and existing regression tests |
| PostgreSQL/RLS + importer tests | PASS: 39/39 (24 database, 7 migration-guard, 8 importer tests) |
| Actual starter CLI dry-run without credentials | PASS: 30 profiles, 1 test post, 1 test reply, 1 test reaction; expected informational 36/80 warnings; no DB access |
| Content importer TypeScript/build and regression tests | PASS: 16/16, including resource-source preservation, verification and PDF storage logic; no live import/upload |
| Expo Doctor | PASS: 21/21 |
| `npx expo export --platform all --output-dir dist` | PASS: iOS/Android Hermes bundles and web export, 27 static routes |
| Browser Community/complete-text QA (initial build, not rerun in this database-only correction) | PASS at 375/390/430/768/1024px; no horizontal overflow; complete content fits |
| Browser composer/interactions/console (initial build) | PASS at 375/390/430/768px; search/filter/Show More, full detail, Helpful/report/rules, empty/error/restricted/moderator states; no errors/warnings on final normal landing/detail/composer session |
| Customer-safe failure | Initial browser injection plus current mobile safe-error tests PASS; no UI changes in this corrective pass |
| Linked migration history | PASS, read-only; two pending files explicitly identified above |
| `git diff --check` and new-file whitespace inspection | PASS |
| Dependencies/lockfile and old-migration inspection | PASS: no Community dependency/version/old-migration change |

The first all-platform export was denied access to the bundled Hermes executable by the sandbox; the same local export with execution permission passed. Non-failing Node module-type and terminal-colour warnings remain tooling messages, not app console errors. Browser QA found and fixed a web-only BackHandler call and an empty-string React Native text-child warning before the clean final pass.

Browser QA uses the real Community components with an injected in-memory API outside production routes. It is not a live PostgREST, physical iPhone/Android or on-screen native-keyboard test. The local servers/tabs were stopped after testing. No actual native installation/build signing was attempted.

## 18. Decisions/approval needed

Approve Rescue and Community as separate later migration operations, verifying Rescue before Community. Recheck the exact pending set immediately before each operation; an ordinary unscoped push would include both today. Review the corrected schema and version-2 rules requiring renewed acceptance. Supply/approve the final editorial bundle and separately authorize its import. No final 36-post/80-reply text has been generated. Nothing in this report authorizes applying or seeding.

## 19. Remaining risks/next phase

The connected app cannot use the new Community RPCs until the migration is approved/applied; it shows a safe unavailable state meanwhile. Live PostgREST/Auth integration, physical-device keyboard/safe-area behaviour and signed/native application smoke tests remain rollout validation. The direct managed-Auth seed path has been removed; PGlite still tests SQL/RLS rather than live GoTrue. Existing genuine profiles backfill automatically without timestamp churn, but future migration-time drift deliberately causes HOLD. Offset paging can shift when content changes (Refresh restarts and append de-duplicates); query-plan/load tuning and cursor pagination may be appropriate at larger scale. Seed amendment/deletion semantics, unblock-management UI, richer moderation operations, realtime notifications and activity-page community discovery are deliberately not added in V1.

Stopped here: no database migration, seeding or deployment was executed.

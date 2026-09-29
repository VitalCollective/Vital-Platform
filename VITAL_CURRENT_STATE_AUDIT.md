# Vital Collective — Current-State Audit

Audit date: **29 September 2026**  
Repository audited: `C:\Users\clayj\Projects\Vital-Platform`  
Linked Supabase project: `jvbtvtcxkaumcrbijatv`

This report describes the checked-out working tree, not only the last commit. Evidence came from source/configuration inspection, read-only Supabase CLI inspection, read-only EAS queries, live public-site HTTP checks, and the validation runs listed in section I. External dashboards are marked **CANNOT VERIFY** where they were not directly available.

Status meanings used below:

- **COMPLETE** — implemented and supported by current code/configuration and relevant validation.
- **PARTIAL** — a real implementation exists, but a material part is absent, intentionally disabled, or not production-operational.
- **NOT IMPLEMENTED** — schema or intent may exist, but there is no usable app flow.
- **CANNOT VERIFY** — the state is outside the repository/accessible services or would require a destructive/live transaction.

## A. CURRENT REPOSITORY STATE

- Branch: `main`.
- HEAD: `bdee7511dde3b5d99a6cbed82e2e222f72456ecc` — `feat: add English and Welsh localisation`.
- Remote relationship before this report was created: `main...origin/main` with no ahead/behind indication; HEAD matched `origin/main`.
- Working tree before creating this requested report: **not clean**.
- Untracked files before this report: none.
- The only pre-existing changes were 19 modified mobile files from the ongoing bilingual UX polish pass: Home language switch, Welsh translations/copy coverage, language preference synchronisation, and localisation tests. Diff size: 365 insertions / 59 deletions.
- Modified files:
  - `apps/mobile/src/app/(auth)/forgot-password.tsx`
  - `apps/mobile/src/app/(auth)/index.tsx`
  - `apps/mobile/src/app/(tabs)/discover.tsx`
  - `apps/mobile/src/app/(tabs)/index.tsx`
  - `apps/mobile/src/app/reset-password.tsx`
  - `apps/mobile/src/components/vital/auth-shell.tsx`
  - `apps/mobile/src/components/vital/profile-avatar.tsx`
  - `apps/mobile/src/features/account/account-content.ts`
  - `apps/mobile/src/features/account/account-information.tsx`
  - `apps/mobile/src/features/account/account-screen.tsx`
  - `apps/mobile/src/features/billing/billing-model.ts`
  - `apps/mobile/src/features/community/community-actions.tsx`
  - `apps/mobile/src/features/community/community-detail.tsx`
  - `apps/mobile/src/features/community/community-moderation.tsx`
  - `apps/mobile/src/features/community/community-screen.tsx`
  - `apps/mobile/src/features/community/community-ui.tsx`
  - `apps/mobile/src/features/localization/language-preference-sync.tsx`
  - `apps/mobile/src/features/localization/translations.ts`
  - `apps/mobile/tests/localization.test.mjs`
- `git diff --check`: passed; only Windows LF→CRLF notices were emitted.
- Important recent commits:
  - `bdee751` bilingual English/Cymraeg localisation foundation.
  - `3124d32` iOS sandbox configuration.
  - `bc5961c` public launch website.
  - `40695e2` public privacy and account-deletion pages.
  - `2c56ac7` mobile release configuration.
  - `32b2d5c` release-candidate UX polish.
  - `970c269` mobile lifecycle/offline recovery.
  - `0c59a57` account support/private submissions.
- This audit file is the only new file intentionally created by the audit.

## B. APP FEATURES — CURRENT IMPLEMENTATION

| Feature | Status | Current evidence/state |
|---|---|---|
| Authentication: signup/login/logout | **COMPLETE** | Supabase email/password auth, persisted SQLite-backed session storage, restored-session validation, foreground token refresh, account-switch clearing, email-confirmation handling and customer-safe errors are implemented in `auth-provider.tsx`. |
| Password reset | **COMPLETE** | Forgot-password request, `vital://` recovery deep link, PKCE/code/token-hash/session handling, reset/confirm-password screen, invalid/expired-link handling and URL cleanup exist. Supabase redirect allow-list state is external and **CANNOT VERIFY**. |
| Home | **COMPLETE** | Branded responsive hero, five Vital areas, Discover entry, real deterministic activity ideas and safe loading/error/retry states. Current working tree adds a compact English/Cymraeg switch. |
| Discover/search/filter | **COMPLETE** | Server-backed published activity search, intent/literal search, section/environment/age/duration filters, stable diversified order, 20-at-a-time pagination and distinct loading/error/empty states. Welsh translated search augments English fallback. |
| Five Vital section catalogues | **COMPLETE** | Mums/Kids/Together/Life/Food reuse the canonical activity loader/card/detail route, diversified ordering, Show more, error/retry states and age filtering where relevant. |
| Activity detail | **COMPLETE** | Canonical ID route, full activity content/metadata/instructions/benefits/safety/variations, resource state and activity Save control. |
| Resource/PDF access | **COMPLETE** | Detail uses private `vital-resources` Storage signed URLs (10-minute lifetime). Live bucket contains 88 objects and all 88 are PDFs. Storage SELECT policy requires a current verified membership. |
| Saved | **COMPLETE** for activities | `saved_activities` favourite records, optimistic save/unsave, reload persistence, Saved tab catalogue, immediate removal and canonical detail navigation are implemented. Resource saving and Community-post saving are not exposed in UI; `saved_community_posts` exists only in the data model. |
| Try Later / planned activities | **NOT IMPLEMENTED** | `planned_activities` table and RLS exist, but there is no app service/control/screen. Live table estimate is 0 rows. |
| Family profiles | **COMPLETE** | Private owner-scoped add/edit/remove flow stores optional nickname, controlled relationship, whole-year age and server-maintained `age_confirmed_at`. Confirmation precedes deletion. |
| Family onboarding/personalisation | **PARTIAL** | Family CRUD exists under You; there is no first-run family onboarding and Home/Discover do not yet consume family ages/relationships for recommendations. |
| Community feed/search/filter | **COMPLETE** | Paginated RPC-backed feed, search/topic/type/order filters, seeded/genuine combined results, block-aware visibility, detail/replies and customer-safe failure states. Live stats show 38 posts and 81 comments. |
| Community posting | **COMPLETE** | Genuine entitled members with current rules acceptance and no active restriction can create typed/topic posts and optionally link an activity. Identity/provenance is server-enforced. |
| Replies/comments | **COMPLETE** | Post detail, bounded reply pagination, parent/reply validation, block checks, locked-thread enforcement and immediate local reply-count update exist. |
| Helpful reactions | **COMPLETE** | Post/comment add/change/delete exists. Rules/restrictions gate inserts/updates server-side; own deletes remain allowed. Blocked pairs cannot react. |
| Reporting | **COMPLETE** | Posts/replies can be reported independently of blocking; reports are private, duplicate open reports are idempotent, restricted members retain reporting access. |
| Blocking | **COMPLETE** | Genuine-member-only block/unblock, confirmation, mutual content hiding, blocked-members management under You → Privacy & safety and DB enforcement against cross-block replies/reactions. |
| Moderation/admin controls | **PARTIAL operationally** | Report queue, resolve/dismiss, content remove/restore, lock/unlock, restrictions/revocation and Owner > Admin > Moderator > Member hierarchy are implemented and server-authorised. Live table statistics currently estimate **0 `admin_roles` rows**, so no operational moderator is evidenced. |
| Community Rules acceptance | **COMPLETE** | Current rules are versioned; server checks current acceptance before posts/replies/reaction writes. Rules can be viewed/accepted in Community and You. |
| Seed/starter Community content | **COMPLETE** | Non-login seeded identities, provenance guards, controlled service-role importer and exact two-paragraph disclosure exist. Live data includes the imported starter set. |
| Profile/account/settings | **COMPLETE** | You hub, profile name/bio, private photo upload/change/remove, avatar cache invalidation, family, preferences, Community identity, privacy/safety, membership, help/legal, sign-out and deletion routes exist. |
| Notifications | **PARTIAL** | Owner-scoped notification preference switches persist. There is no `expo-notifications` dependency, push token registration, scheduling or delivery implementation. |
| Newsletter | **PARTIAL** | Separate opt-in preference persists and legal copy exists. No newsletter sending/provider integration is present. |
| Feedback | **COMPLETE** | Native authenticated private form writes insert-only `member_submissions` rows; member clients cannot SELECT submissions. |
| Suggest an activity | **COMPLETE** for submission | Native private form validates name/description/rights/optional section-age-equipment and stores it privately. The advertised free-month reward has no automated fulfilment code; it requires an external/manual operational process. |
| Account deletion | **COMPLETE implementation; live destructive run CANNOT VERIFY** | Secure in-app confirmation and recent-auth flow invokes deployed `delete-account`; details are in section D. Unit/schema tests exist. This audit correctly did not delete a live account. |
| Paywall/membership screen | **PARTIAL for release** | Full UI states, live product presentation, trials, purchase/restore/manage/retry and legal/account access exist. Production purchasing is intentionally disabled in both config and code. |
| Subscriptions | **PARTIAL for production** | RevenueCat native SDK, webhook/reconcile functions and authoritative Supabase projection are implemented. iOS/Android development flows exist, but no production build exists and Google production key/config is absent. |
| Restore purchases | **COMPLETE implementation; production transaction CANNOT VERIFY** | Native `restorePurchases()`, server reconciliation and safe error states exist. This audit did not run a store transaction. |
| Entitlement enforcement | **COMPLETE** | Root routing waits for auth + membership resolution; substantive tables and Vital PDF reads have restrictive `has_valid_vital_membership()` policies. Expiry boundary timers, foreground reconciliation and safe offline use of only still-current verified entitlement are implemented. |
| English/Cymraeg interface | **PARTIAL / in uncommitted polish** | Foundation and DB migration are applied; English default, device/account persistence, shell translations, Welsh search augmentation and field-by-field English content fallback exist. Current polish passes tests but is not committed. No activity/resource translation rows exist yet, intentionally. |

## C. SUBSCRIPTIONS / REVENUECAT / BILLING

### Implemented architecture

- SDK: `react-native-purchases` `^10.9.1` is installed.
- Integration is the supported standard autolinked SDK. No experimental TurboModule/module-provider bridge, `patch-package`, or RevenueCat fork remains.
- RevenueCat entitlement: `vital_membership`.
- Offering: `default`.
- Consumed packages: `$rc_monthly` and `$rc_annual` only.
- Product IDs referenced:
  - `uk.co.vitalcollective.membership.monthly`
  - `uk.co.vitalcollective.membership.annual`
  - Reserved in the model but not exposed as packages: `uk.co.vitalcollective.partner.monthly` and `uk.co.vitalcollective.partner.annual`.
- RevenueCat is configured with the authenticated Supabase UUID as App User ID. Account switches use `Purchases.logIn(newUuid)`; the app avoids RevenueCat logout-created anonymous identities.
- Store offerings and CustomerInfo are loaded together. Prices/trial text come from the store package. Development may show clearly labelled fallback prices only when products fail to load; production hides those prices.
- Purchase and restore both call the native SDK, then invoke authenticated `reconcile-membership`, then reload `current_vital_membership()`.
- CustomerInfo updates trigger authoritative reconciliation. Webhooks independently verify authorization + HMAC, deduplicate events, fetch current RevenueCat subscriber state and apply/clear the Supabase projection.
- States handled: trial, active, cancelled with remaining access, grace period, billing issue, expired, refunded and revoked.
- Foregrounding refreshes Supabase auth then membership. A timer fires at `periodEndsAt` or grace end. A transient network error retains access only while the last server-verified boundary is still in the future.

### Access control

- App routing does **not** treat authentication alone as content access. Signed-in users without verified access are constrained to the Membership/account/help/legal/deletion surface.
- Database enforcement applies a restrictive membership policy to activities, resources, activity links, collections/editorial tables, family/preferences, saved/completed/rating/planned data, Community data and moderation data.
- `profiles` deliberately remains readable/updatable by its owner for account management without entitlement; viewing other Community profiles requires membership.
- `member_submissions` is authentication/genuine-member gated rather than membership gated, allowing support/activity submissions without exposing any read path.
- `delete-account`, membership reconciliation and account/legal/support operations remain authentication-only by design.

### Environment/build state

- Development EAS environment: Supabase public URL/key present; RevenueCat Test Store public key present; purchases enabled by development profile.
- Preview EAS environment: Supabase public URL/key present; iOS RevenueCat public key present; ordinary preview profile disables purchases. `ios-sandbox` deliberately uses preview plus purchases enabled in a development client.
- Production EAS environment: Supabase public URL/key and iOS RevenueCat public key present; production profile sets purchases disabled.
- No `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` is present in the EAS environment listing.
- `billingConfig.purchasesEnabled` additionally requires `__DEV__`. Therefore a true production/store binary cannot initiate purchases even if the environment flag were changed. This is an intentional pre-release safety gate and a definite store-release blocker until deliberately revised.
- The Test Store key is read only in `__DEV__` and only if it has a `test_` prefix; it is scoped to the EAS development environment, so it cannot leak into preview/production through the recorded EAS configuration.
- Server secrets are confined to deployed Edge Function secret storage. Required names are present: RevenueCat secret API key, webhook authorization, webhook HMAC, Supabase URL/public/service credentials. No values are in mobile source.

### Platform state

- Apple: a successful physical-device internal `ios-sandbox` IPA exists (build `81f67312-edab-421d-a152-290e2652dbc6`, build number 1). The current RevenueCat/App Store Connect product and offer dashboard state and a current production purchase are **CANNOT VERIFY** from this audit.
- Google: successful Android development APKs exist; Test Store development is configured. Real Play Billing public SDK key/products/service credentials and live Play purchase are **not evidenced**.
- No EAS build with the `production` profile exists for either platform.

## D. ACCOUNT DELETION / PRIVACY

### In-app deletion flow

- You → Account → Delete account is implemented and also reachable from the non-entitled Membership surface.
- The member must type `DELETE`; the Edge Function derives identity from the bearer token and requires a sign-in within the previous 15 minutes.
- The deployed `delete-account` function is `ACTIVE`, version 2, JWT verification enabled.
- Before Auth deletion it lists/removes objects in the member's `profile-images/{profileId}/` folder. A five-minute service-only database authorization then permits the Auth cascade. Failure never returns a false success.
- Moderation/owner accounts with safety-history responsibilities are blocked for manual role/history review rather than losing audit integrity.

### Data outcome

- Auth user: hard-deleted through Supabase Admin Auth after identity/recent-auth checks.
- Profile, avatar reference, bio: profile cascades away; actual avatar objects are removed first.
- Family: `families` and `family_members` cascade from profile.
- Preferences: user, notification, newsletter and language/welcome fields cascade.
- Saved/completed/rating/planned data: profile-owned rows cascade.
- Private feedback/activity submissions: cascade.
- Subscription entitlement: cascades. Provider event records may retain provider/audit metadata with `profile_id` set null; raw client access is revoked.
- Blocks, rule acceptances and member reactions: profile foreign-key cleanup applies.
- Community replies authored by the deleted member are deleted. Their child replies survive with parent detached.
- Community posts with no other member replies are deleted. Posts needed to preserve another member's reply become a locked neutral tombstone: `Deleted post` / `This post was deleted by its author.`, no author, topic, tags, activity link or original text.
- Content revisions containing the member's original text are deleted; attribution in other members' revision history is detached.
- Safety/audit relationships that legally use restrictive foreign keys require manual review before deletion rather than silent erasure.

### Privacy/legal/support surfaces

- Public routes are live without sign-in and returned HTTP 200 during this audit:
  - `https://vitalcollective.co.uk/privacy`
  - `https://vitalcollective.co.uk/terms`
  - `https://vitalcollective.co.uk/delete-account`
  - `https://vitalcollective.co.uk/contact`
- The deletion page explains in-app deletion, email fallback via `info@vitalcollective.co.uk`, deleted/limited-retention categories, and that deleting Vital does not cancel an Apple/Google subscription.
- Mobile embeds canonical Privacy, Terms, FAQs/help and contact material from reusable account content.
- Profile/family separation is preserved: `profiles` holds only Community-facing identity; private family data remains in `families`/`family_members` and is not broadened into the Community directory.
- Live end-to-end deletion of a disposable user was not run in this audit: **CANNOT VERIFY** current production execution beyond deployed function/migration state and tests.

## E. COMMUNITY / UGC SAFETY

- **Reports:** post/reply reporting is implemented; report data is private; repeated open reports are deduplicated; reporting is available even when participation is restricted.
- **Blocking:** block without report, report without block, and both are supported. Blocks are genuine-member-only, self-block is forbidden, visibility is mutual, and replies/Helpful writes across a block are denied server-side. Unblock management is available under You → Privacy & safety.
- **Moderator queue/tools:** app includes open/under-review queue, target context, resolve/dismiss, content remove/restore, lock/unlock and user restrictions/revocation.
- **Role hierarchy:** server helpers enforce Owner > Admin > Moderator > ordinary member, no self-restriction, and no lower/equal-rank targeting or improper revocation.
- **Restrictions:** posting restriction, community suspension and permanent community ban are modelled. Restricted members can still read, report, block and remove their own Helpful reactions.
- **Rules:** current-version acceptance gates new posts/replies/reactions. Current rule data is version 2 according to the applied migration; the live table contains two rule versions.
- **Content controls:** author soft-removal, moderator removal, locked threads, content revision records, report-resolution history and safety indexes are implemented.
- **Seed disclosure:** starter identities cannot authenticate or satisfy genuine-member checks; seed provenance is guarded; the app displays the approved disclosure including generated-image disclosure.
- **Deleted users:** original personal content is removed; only neutral locked tombstones remain when needed to preserve other members' replies. UI uses a neutral deleted-profile icon and `Deleted member` rather than initials.
- **Current operational gap:** live stats estimate 0 `admin_roles` rows, so no live owner/admin/moderator assignment is evidenced. Before public UGC launch, a real operational moderation account/role and response procedure must be verified.

## F. BACKEND / SUPABASE

### Project/environments

- Linked project ref: `jvbtvtcxkaumcrbijatv`.
- Local mobile Supabase URL host resolves to the same project ref.
- EAS development, preview and production all contain project-scoped Supabase public URL and publishable-key variables. Values were not printed. Exact equality of the masked EAS values to the linked ref cannot be re-read without exposing the value, but this configuration was previously set and the variable records are present.
- There is one live backend for all three mobile environments; no separate staging Supabase project is configured.

### Migration state

Read-only `supabase migration list --linked` showed every local migration present remotely and no pending entry:

1. `20260823204450_initial_vital_schema.sql`
2. `20260826085303_community_and_moderation.sql`
3. `20260826133200_retain_resource_source_document.sql`
4. `20260827090000_authenticated_vital_resource_pdf_read.sql`
5. `20260903120000_normalize_activity_environment_metadata.sql`
6. `20260908120000_correct_rescue_the_explorer_indoor_instructions.sql`
7. `20260910120000_community_v1.sql`
8. `20260910180000_community_profile_images.sql`
9. `20260913120000_complete_community_member_blocking.sql`
10. `20260913180000_secure_account_deletion.sql`
11. `20260914120000_family_member_editing.sql`
12. `20260914180000_revenuecat_subscription_foundation.sql`
13. `20260917120000_membership_welcome.sql`
14. `20260917180000_private_member_submissions.sql`
15. `20260923120000_bilingual_content_localisation.sql`

### Live inventory evidence

Supabase read-only table statistics currently report these row estimates (small/static tables match the expected canonical totals, but the CLI labels them estimates rather than exact `count(*)`):

- activities 463
- resources 88
- activity/resource relationships 162
- profiles 32
- Community posts 38; comments 81
- families 1; family members 2
- saved activities 3
- subscription entitlements 2; provider events 80
- private member submissions 2
- activity translations 0; resource translations 0
- planned activities 0
- admin roles 0

### Important data/RLS

- Core: profiles, private families/members, preferences, activities/resources/source JSON, relationships, saves/completions/ratings/plans, editorial structures and subscription projection.
- Community: rooms/rules/acceptance/blocks/posts/comments/reactions/saved posts/reports/moderation/restrictions/revisions/seed import tracking.
- Localisation: translations keyed by canonical activity/resource ID + locale; no duplicate canonical records; membership-gated read and service-role write.
- Private submissions: insert-only to authenticated genuine member, identity default/constraint from `auth.uid()`, no ordinary member SELECT, service-role administration.
- RLS is enabled and combined with SECURITY DEFINER helpers using explicit safe search paths for recursion-sensitive identity, membership, blocking and moderation checks.

### Storage and functions

- Live buckets: `vital-resources` and `profile-images`, both designed private.
- `vital-resources`: 88/88 objects are PDFs; signed URL access requires current membership.
- `profile-images`: member-owned UUID paths, MIME/size/path constraints, signed URLs, referenced-image reads and owner upload/replace/delete policies.
- Active Edge Functions:
  - `delete-account` v2 (`verify_jwt: true`)
  - `reconcile-membership` v2 (`verify_jwt: true`)
  - `revenuecat-webhook` v2 (`verify_jwt: false`, protected by its own authorization + HMAC validation)

### Security observations

- No actual service-role/RevenueCat secret was found in tracked source. Secret references are environment lookups/placeholders. EAS/Supabase secret values were not printed.
- Required server secret names are configured in Supabase; their last-update metadata is 15–16 September 2026. Whether any historical credential was exposed and needs revocation is **CANNOT VERIFY** from the current tree.
- `profile-images` read policy requires a genuine authenticated member but, unlike substantive Community tables and Vital PDFs, does not call `has_valid_vital_membership()`. An expired signed-in account that already knows another referenced object path may still be able to request a fresh signed URL. Own-photo management must remain available; non-owner referenced-image access should be explicitly confirmed as intended or tightened before release.

## G. IOS / APPLE RELEASE STATUS

- Display name: `Vital Collective`.
- Bundle ID: `uk.co.vitalcollective.app`.
- Scheme: `vital`.
- Version: `1.0.0`; EAS remote iOS build number: `1`.
- Expo SDK 57 / React Native 0.86.3 / Hermes / New Architecture default.
- iPhone and iPad enabled (`supportsTablet: true`), portrait orientation.
- Installed Expo template indicates iOS deployment target 16.4; no app override exists.
- EAS project: `claytheakston/vital-collective`, project ID `83bf7f7c-7c44-456b-ad07-c3cbc1fd1295`.
- Profiles: development (internal dev client), `ios-sandbox` (preview environment/internal dev client), preview (internal) and production (auto-increment/store environment).
- Signing/provisioning evidence: successful non-simulator internal IPAs for the bundle ID prove EAS-managed signing and a valid registered-device provisioning profile existed at build time. Exact current certificate/profile expiry and device list: **CANNOT VERIFY**.
- Latest successful iOS sandbox build: `81f67312-edab-421d-a152-290e2652dbc6`, internal IPA, app/build `1.0.0 (1)`, source commit `3124d32`.
- Successful clean development build: `c90f4b93-8c7e-4239-8cc5-e355ebf3e857`, source commit `bc5961c`.
- No production-profile EAS build exists. No TestFlight status is visible: **CANNOT VERIFY**.
- Apple RevenueCat public SDK key is present in EAS preview/production. Production purchase initiation remains disabled by profile and `__DEV__` code gate.
- Product IDs referenced: monthly/annual IDs in section C; actual App Store Connect approval/availability/trial/UK storefront status is **CANNOT VERIFY**.
- Deep linking: custom `vital` scheme; reset-password path is implemented. No universal-link associated domains are configured. Supabase redirect allow-list is **CANNOT VERIFY**.
- Branding: square `vital-mark.png` (1254×1254) is the icon/adaptive foreground/splash image; approved main/simple family logos are included. No default Expo image reference remains in config.
- Permissions: photo-library wording only for user-initiated profile-photo selection; camera and microphone explicitly disabled. Encryption declaration says no non-exempt encryption.
- OTA/runtime version: no explicit `runtimeVersion`/updates policy and no explicit `expo-updates` dependency; release relies on embedded binary bundles.
- Current blockers to an iOS production candidate:
  - commit/review current Welsh polish;
  - update/resolve Expo Doctor SDK patch mismatches;
  - deliberately enable production purchases outside `__DEV__` only after store configuration verification;
  - create a production EAS build and complete TestFlight/App Store validation;
  - verify current App Store Connect subscription metadata/review readiness externally.

## H. ANDROID / GOOGLE PLAY RELEASE STATUS

- App name: `Vital Collective`.
- Package/application ID: `uk.co.vitalcollective.app`.
- Version: `1.0.0`; EAS remote Android `versionCode`: `1`.
- Installed Expo SDK 57 native defaults: Android compile SDK 36, target SDK 36, minimum SDK 24; no app override exists.
- Successful Android internal development APK: `8dc893de-1a22-4528-8e43-516c04c4e7f2` (`1.0.0 (1)`), source commit `6aa8492`. An earlier Gradle-failed build exists but was superseded by successful development builds.
- Signing evidence: the successful EAS internal APK proves development signing worked. Current production keystore ownership/Play App Signing linkage: **CANNOT VERIFY**.
- No production-profile EAS build and no AAB exist in EAS history.
- No Play Console app record/release track/Test Store/internal-test status is visible: **CANNOT VERIFY**.
- RevenueCat Test Store development can use the development Test Store key. No Android production RevenueCat public key is present in EAS, and production purchases are disabled.
- Real Google Play subscription products, RevenueCat Play app mapping and service-account credentials are **CANNOT VERIFY** and not evidenced in repo/EAS variable names.
- Deep link scheme: `vital`; no Android App Link intent-filter/domain verification is configured.
- Permissions/config: app blocks `SYSTEM_ALERT_WINDOW` and `VIBRATE`; photo-library picker is configured; camera/microphone are disabled. Final generated release-manifest permission list has not been inspected from a production AAB.
- Adaptive icon uses cream background + approved mark; splash uses the approved mark. No notification library/icon is configured because push notifications are not implemented.
- Current blockers to an Android production candidate:
  - Android RevenueCat public SDK key + Play products/service integration;
  - deliberate production purchase enablement;
  - production AAB/keystore verification;
  - Play Console listing, policy/data-safety/content-rating/target-audience/reviewer-access decisions and internal-track test.

## I. BUILD / QA STATUS

Validation run against the current dirty working tree:

| Check | Result |
|---|---|
| Mobile TypeScript (`npm run typecheck`) | **PASS** |
| Mobile app tests (`npm test`) | **PASS — 113/113** |
| Focused billing/auth/account tests (`npm run billing:test`) | **PASS — 47/47** |
| Community seed tests | **PASS — 10/10** |
| Content importer TypeScript/tests | **PASS — 16/16 tests** |
| Website syntax/tests | **PASS — 8/8** |
| Expo iOS/Android/web export with no `.env.local` | **PASS**; all three bundles and 28 static routes generated to an OS temp directory |
| Expo public config resolution | **PASS** for identity/bundle/package/plugins/assets |
| `git diff --check` | **PASS** (line-ending notices only) |
| Live public site | **PASS** HTTP 200 for Home, Privacy, Terms, Delete Account and Contact; Vital branding/contact email present |
| Linked migrations | **PASS**; 15 local = 15 remote, none pending |
| Edge Function deployment state | **PASS**; all three expected functions active |
| Expo Doctor | **FAIL — 20/21 checks passed**; seven Expo SDK 57 patch versions are one patch behind expected: `@expo/ui`, `expo`, `expo-glass-effect`, `expo-image-manipulator`, `expo-image-picker`, `expo-linking`, `expo-router` |
| Lint | **NOT OPERATIONAL**; no ESLint config/dependencies are present and `expo lint` attempts automatic setup. The sandboxed attempt also hit Expo cache permission before configuration. No lint result is available. |
| SQL/RLS PGlite suites | **FAIL TO START**; `@electric-sql/pglite` is imported by Community/account/billing DB tests but absent from `package.json`/lockfile. This is a test-dependency defect, not an assertion failure. |
| `npm audit` | **44 moderate, 0 high, 0 critical**. Findings are predominantly the Expo toolchain dependency graph; concrete transitive advisories include `decode-uri-component` DoS and `uuid` buffer-bound handling. Several have no direct compatible fix until Expo updates. |

Other warnings:

- Node test runs emit `MODULE_TYPELESS_PACKAGE_JSON` warnings because root/mobile packages are not declared ESM while tests import TypeScript modules as ESM. Tests still pass.
- First unprivileged Expo export failed only because Windows blocked the Hermes executable in the sandbox; the approved rerun outside that restriction passed. This is not an app build failure.
- Current native EAS binaries predate commit `bdee751` and the uncommitted polish. The exact current working tree has passed bundle export, not a fresh physical-device native build.
- EAS shows successful physical-device-capable iOS and Android development builds. Device acceptance history is not stored as machine-verifiable test evidence in the repo, so individual on-device scenarios are not reasserted beyond build state.

## J. KNOWN BUGS / POLISH

Only current, evidenced items:

1. The bilingual UX polish is still uncommitted across 19 files. It passes TypeScript/tests/export, but release cannot be reproduced from `origin/main` until reviewed and checkpointed.
2. Expo Doctor reports seven SDK 57 patch mismatches.
3. Lint is not configured as a reproducible check.
4. SQL/RLS test commands are not reproducible from the current lockfile because `@electric-sql/pglite` is missing.
5. The latest native development binaries do not contain the current bilingual commit/working-tree polish; a new RC build is needed after checkpointing.
6. No live `admin_roles` row is evidenced, so the otherwise-complete moderation UI may have no operational user.
7. Notification/newsletter preference UI exists without delivery infrastructure. This is a partial feature, not a current UI crash.
8. `planned_activities`/Try Later has schema only and no UI.
9. Node's ESM reparsing warnings add test noise but do not currently fail tests.
10. No reproducible runtime bug was found in the audited Home/Discover/sections/detail/Saved/Community/account/billing code paths; current focused tests pass.

## K. PRODUCTION READINESS GAPS

### 1. APP/CODE WORK

- 🟢 **BOTH** — review and commit the 19-file bilingual polish so the release source is clean/reproducible.
- 🟢 **BOTH** — align the seven Expo SDK 57 patch versions, rerun Doctor, TypeScript, tests and export.
- 🟢 **BOTH** — add a deliberate ESLint configuration and restore the missing PGlite test dependency so all declared checks are reproducible from a clean install.
- 🟢 **BOTH** — decide whether non-owner profile-image reads must require active membership; current private Storage policy is genuine-member/auth gated but not entitlement gated.
- 🟢 **BOTH** — perform a fresh RC native build/device regression from the final clean bilingual commit.
- 🟢 **BOTH** — deliberately remove/replace the `__DEV__`-only purchase gate for store builds only when both platform store configurations are ready. Do not simply flip an environment flag: current code still disables release purchases.
- 🔴 **GOOGLE** — configure/use the real Android RevenueCat public SDK key. It is absent from EAS today.

### 2. RELEASE/STORE CONFIGURATION

- 🟢 **BOTH** — assign and verify an operational owner/admin/moderator role and moderation-response process before opening UGC publicly.
- 🟢 **BOTH** — complete final signed production builds; EAS currently has no production build for either platform.
- 🟢 **BOTH** — supply reviewer access that can reach membership-gated content and exercise restore/account deletion safely.
- 🔵 **APPLE** — verify App Store Connect app/subscription/trial/localisation/review metadata, then produce/upload the production IPA and complete TestFlight testing.
- 🔵 **APPLE** — verify Supabase's production reset-password redirect allow-list for the `vital` scheme.
- 🔴 **GOOGLE** — create/verify the Play app record without duplication, Play subscriptions, RevenueCat Play mapping/service account, Play App Signing and an internal-test AAB.
- 🔴 **GOOGLE** — complete Data Safety, content rating, ads, app access, account-deletion URL and adult-account/child-oriented-content target-audience declarations.
- 🔴 **GOOGLE** — prepare/store-listing graphics and screenshots; no Play metadata/assets package is present in the repository.
- 🟢 **BOTH** — document an operational process for private feedback/activity submissions and the advertised accepted-activity membership reward.

### 3. CANNOT VERIFY EXTERNALLY

- 🔵 **APPLE** — current Apple Developer agreements, certificate/profile expiry, App Store Connect app record, subscription group/products/trial approval, UK storefront availability and TestFlight status.
- 🔴 **GOOGLE** — Play Console app record, developer verification, keystore/Play App Signing state, subscriptions, tracks, policies and review status.
- 🟢 **BOTH** — live RevenueCat dashboard offering/product mappings and present CustomerInfo for each test/production account.
- 🟢 **BOTH** — destructive end-to-end account deletion in production; intentionally not run.
- 🟢 **BOTH** — whether any historical credential was exposed outside the current repository and therefore needs rotation. Current tracked source contains no embedded secret.

## L. EXACT CURRENT RELEASE STATUS — SHORT VERSION

### What is definitely finished

- The core member app is real and connected: auth/recovery, entitlement gate, Home, Discover, all five catalogues, activity details/PDFs, activity Saved, family/profile/photo management, Community posting/replies/reactions/report/block/rules/moderation UI, private submissions, legal/help and secure account deletion.
- Supabase schema/RLS/functions are applied with no pending migration; canonical inventory remains 463 activities, 88 resources and 162 links in live table statistics, and all 88 PDFs are present.
- RevenueCat client/webhook/reconciliation/expiry architecture exists, uses Supabase UUID identity and makes Supabase the authoritative access projection.
- Public Privacy/Terms/Delete Account/Contact pages are live over HTTPS.
- Current TypeScript, 113 mobile tests, 47 billing tests, import tests, website tests and an all-platform Expo export pass.

### What definitely remains

- Checkpoint the current uncommitted bilingual polish.
- Resolve Expo patch drift and broken lint/PGlite test setup.
- Establish a live moderation role/operator.
- Intentionally enable production purchases; add Android real-store configuration.
- Produce and test production iOS/Android binaries and complete both stores' release configuration.

### What cannot be verified from the repo/environment

- App Store Connect/TestFlight and Google Play Console product/listing/review state.
- Current RevenueCat dashboard mappings/CustomerInfo beyond the configured code, deployed functions and live projection/event rows.
- Exact current signing credential/profile details and any historical secret exposure.
- A destructive production account-deletion run.

### Next 5 concrete actions, in order

1. Review/checkpoint the bilingual working tree; align Expo SDK 57 patch versions and make lint/PGlite test commands reproducible; rerun the passing validation set.
2. Assign and test a genuine owner/admin moderator in live Supabase, and resolve the profile-image entitlement-policy question with a focused RLS test.
3. Verify Apple App Store Connect + RevenueCat production product state, deliberately enable store-build purchases, create an iOS production candidate and run TestFlight acceptance (purchase, restore, expiry, deletion/legal routes).
4. Configure Google Play Billing + RevenueCat Android key/service mapping, then create a signed production AAB and run Play internal testing with the same acceptance path.
5. Complete reviewer accounts/instructions, store metadata/assets and policy declarations for both stores, then submit only the validated binaries.

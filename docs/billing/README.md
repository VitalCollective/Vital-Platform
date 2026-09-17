# Vital Collective billing setup

The Supabase subscription foundation and Edge Functions are deployed. RevenueCat
Test Store is the development purchase provider; Apple and Google remain future
production integrations. Test purchases are enabled only in a development
runtime with the explicit public development switch.

## Fixed catalogue

- Application ID / bundle ID: `uk.co.vitalcollective.app`
- RevenueCat entitlement: `vital_membership`
- Default offering: `default`
- Standard Apple/Google subscription product IDs:
  - `uk.co.vitalcollective.membership.monthly`
  - `uk.co.vitalcollective.membership.annual`
- RevenueCat packages: `$rc_monthly` and `$rc_annual`
- Standard UK display intent: £9.99 monthly or £59.99 annually, with a 7-day
  introductory trial. The app displays the localized store values once present.
- Reserved partner products:
  - `uk.co.vitalcollective.partner.monthly`
  - `uk.co.vitalcollective.partner.annual`
- Reserved partner UK pricing intent: £4.99 monthly or £29.99 annually while
  the qualifying partner subscription remains active.

Partner products will later use a server-selected partner offering and grant the
same `vital_membership` entitlement. Do not put partner eligibility in mobile.

## 1. RevenueCat

1. Create one project, then iOS and Android apps with the fixed application ID.
2. Import the standard store products.
3. Create `vital_membership`, the `default` offering and the two conventional
   packages.
4. Configure Transfer to new App User ID. Vital always supplies the authenticated
   Supabase UUID and does not start anonymous purchase flows.
5. Add separate sandbox and production webhook integrations pointing to
   `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`.
6. Set a private Authorization header and enable RevenueCat HMAC signing. Retain
   the signing secret when it is shown.
7. Create a secret RevenueCat REST API key for server-side subscriber lookups.

## 2. App Store Connect

1. Create the app for `uk.co.vitalcollective.app` and complete agreements,
   banking and tax setup.
2. Create one Vital Membership subscription group.
3. Create the monthly and annual products above, prices and localizations.
4. Configure a 7-day introductory free trial and the required review metadata.
5. Connect App Store credentials/server notifications to RevenueCat.
6. Add sandbox testers. Do not use production Apple accounts for sandbox QA.

## 3. Google Play Console

1. Create the app for `uk.co.vitalcollective.app`, payments profile and closed
   testing track.
2. Create the two standard subscription products using the fixed monthly and
   annual IDs above. Add an auto-renewing base plan to each (for example,
   `monthly-auto` and `annual-auto`), then add the 7-day new-member offer and
   prices. RevenueCat may show the qualified Android product/base-plan ID; both
   still map to `vital_membership`.
3. Choose grace-period/account-hold settings. Vital grants access during a valid
   grace period, but not during account hold.
4. Configure Play Developer API access, service credentials and RTDN/Pub/Sub via
   RevenueCat.
5. Add license testers.

## 4. Supabase

Apply `20260914180000_revenuecat_subscription_foundation.sql` only after review.
Then deploy only:

- `revenuecat-webhook` (`verify_jwt=false`; RevenueCat Authorization + HMAC are
  verified inside the handler)
- `reconcile-membership` (`verify_jwt=true`)

Set these server-only Edge Function secrets. Never use them in Expo public config:

- `REVENUECAT_SECRET_API_KEY`
- `REVENUECAT_WEBHOOK_AUTHORIZATION`
- `REVENUECAT_WEBHOOK_HMAC_SECRET`

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge
Functions. The service-role key must never enter the app.

The webhook ledger stores no raw payload. It retains an event ID, lifecycle type,
environment and one-way customer hash for idempotency. Profile deletion cascades
the entitlement and detaches the ledger row, so later webhooks cannot recreate a
profile or restore deleted family/Community data.

## 5. Test Store development build and public configuration

Native RevenueCat testing requires a development build; Expo Go is not the real
purchase runtime. The Test Store SDK key is public client configuration, not the
secret RevenueCat REST key used by Supabase.

Create the ignored file `apps/mobile/.env.local` and add:

```dotenv
EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY=test_your_actual_test_store_sdk_key
EXPO_PUBLIC_REVENUECAT_PURCHASES_ENABLED=true
```

Do not replace the Apple/Google placeholders for Test Store testing. The single
Test Store key is used by both native platforms. `.env.local` is ignored by Git;
never place `REVENUECAT_SECRET_API_KEY`, webhook Authorization, webhook HMAC, a
Supabase service-role key, or any other server credential in it.

The EAS `development` profile is an internal development client and selects the
development environment. Its non-secret purchase switch is `true`. The `preview`
and `production` profiles explicitly set that switch to `false`, and application
code additionally requires React Native's development runtime flag before any
purchase can begin. The Test Store key itself is ignored in release runtimes.

Build and install for a registered physical iPhone from `apps/mobile`:

```bash
eas build --platform ios --profile development
```

Open the resulting EAS install link on the registered device. Then start the local
development server from the same directory and select the installed development
client:

```bash
npx expo start --dev-client
```

For Android later, use `eas build --platform android --profile development` and
install the generated APK. Test Store does not require Apple App Store Connect or
Google Play product configuration.

## 6. Required sandbox acceptance

Test monthly and annual purchase sheets, trial start and conversion, user
cancellation with access-until-period-end, renewal, grace period, account hold,
expiry, refund/revocation, explicit restore, new-device sign-in, account switching,
duplicate/delayed webhooks, temporary network failure, management links and
account deletion with an active store subscription.

Deleting Vital does not cancel Apple/Google billing. The deletion UI links to the
store management page when RevenueCat supplies one and requires explicit billing
acknowledgement before permanent account deletion.

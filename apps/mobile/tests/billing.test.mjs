import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBillingApi } from '../src/features/billing/billing-api.ts';
import {
  BILLING_PRODUCTS,
  EMPTY_MEMBERSHIP,
  REVENUECAT_OFFERING_ID,
  VITAL_ENTITLEMENT_ID,
  membershipHeading,
  parseVerifiedMembership,
  currentVerifiedMembership,
  returnedToForeground,
  scheduleVerifiedMembershipBoundaryRefresh,
  verifiedAccessStillCurrent,
  verifiedMembershipBoundary,
} from '../src/features/billing/billing-model.ts';

const future = '2030-01-01T00:00:00.000Z';
const past = '2020-01-01T00:00:00.000Z';

test('fixed catalogue has one entitlement, default offering and reserved standard/partner products', () => {
  assert.equal(VITAL_ENTITLEMENT_ID, 'vital_membership');
  assert.equal(REVENUECAT_OFFERING_ID, 'default');
  assert.deepEqual(BILLING_PRODUCTS, {
    standardMonthly: 'uk.co.vitalcollective.membership.monthly',
    standardAnnual: 'uk.co.vitalcollective.membership.annual',
    partnerMonthly: 'uk.co.vitalcollective.partner.monthly',
    partnerAnnual: 'uk.co.vitalcollective.partner.annual',
  });
});

test('verified states grant access only while a server-confirmed period is current', () => {
  for (const state of ['trial_active', 'active', 'cancelled']) {
    assert.equal(verifiedAccessStillCurrent({ ...EMPTY_MEMBERSHIP, state, hasAccess: true, periodEndsAt: future }, Date.parse('2029-01-01')), true, state);
  }
  assert.equal(verifiedAccessStillCurrent({ ...EMPTY_MEMBERSHIP, state: 'grace_period', hasAccess: true, periodEndsAt: past, gracePeriodEndsAt: future }, Date.parse('2029-01-01')), true);
  for (const state of ['billing_issue', 'expired', 'refunded', 'revoked']) {
    assert.equal(verifiedAccessStillCurrent({ ...EMPTY_MEMBERSHIP, state, hasAccess: true, periodEndsAt: future }, Date.parse('2029-01-01')), false, state);
  }
  assert.equal(verifiedAccessStillCurrent({ ...EMPTY_MEMBERSHIP, state: 'cancelled', hasAccess: true, periodEndsAt: past }, Date.parse('2029-01-01')), false);
  assert.equal(membershipHeading({ ...EMPTY_MEMBERSHIP, state: 'cancelled', hasAccess: true }), 'Your access remains active');
});

test('the verified entitlement boundary uses the period end or applicable grace-period end', () => {
  const periodEnd = Date.parse('2030-01-01T00:00:00.000Z');
  const graceEnd = Date.parse('2030-01-02T00:00:00.000Z');
  assert.equal(verifiedMembershipBoundary({
    ...EMPTY_MEMBERSHIP, state: 'active', hasAccess: true, periodEndsAt: future,
  }), periodEnd);
  assert.equal(verifiedMembershipBoundary({
    ...EMPTY_MEMBERSHIP, state: 'grace_period', hasAccess: true,
    periodEndsAt: future, gracePeriodEndsAt: '2030-01-02T00:00:00.000Z',
  }), graceEnd);
});

test('crossing periodEndsAt invalidates access and expired verification is never retained', () => {
  const membership = {
    ...EMPTY_MEMBERSHIP, state: 'active', hasAccess: true, periodEndsAt: future,
  };
  assert.equal(verifiedAccessStillCurrent(membership, Date.parse('2029-12-31T23:59:59.999Z')), true);
  assert.equal(verifiedAccessStillCurrent(membership, Date.parse(future)), false);
  assert.equal(currentVerifiedMembership(membership, Date.parse(future)), null);
});

test('the boundary timer revalidates as soon as periodEndsAt is crossed', () => {
  let now = Date.parse('2029-12-31T23:59:59.000Z');
  let refreshes = 0;
  const scheduled = [];
  const cancelled = [];
  const stop = scheduleVerifiedMembershipBoundaryRefresh({
    ...EMPTY_MEMBERSHIP, state: 'active', hasAccess: true, periodEndsAt: future,
  }, () => { refreshes += 1; }, {
    now: () => now,
    setTimer: (callback, delay) => {
      const handle = { callback, delay };
      scheduled.push(handle);
      return handle;
    },
    clearTimer: (handle) => cancelled.push(handle),
  });

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 1_000);
  assert.equal(refreshes, 0);
  now = Date.parse(future);
  scheduled[0].callback();
  assert.equal(refreshes, 1);
  stop();
  assert.deepEqual(cancelled, [scheduled[0]]);
});

test('foreground refresh detection ignores ordinary active-state repeats', () => {
  assert.equal(returnedToForeground('background', 'active'), true);
  assert.equal(returnedToForeground('inactive', 'active'), true);
  assert.equal(returnedToForeground('active', 'active'), false);
  assert.equal(returnedToForeground('active', 'background'), false);
});

test('a transient refresh failure preserves only a still-current verified entitlement', () => {
  const active = {
    ...EMPTY_MEMBERSHIP, state: 'active', hasAccess: true, periodEndsAt: future,
  };
  assert.equal(currentVerifiedMembership(active, Date.parse('2029-01-01')), active);
  assert.equal(currentVerifiedMembership(active, Date.parse('2031-01-01')), null);
});

test('a renewed authoritative projection restores verified access', () => {
  const expired = {
    ...EMPTY_MEMBERSHIP, state: 'expired', hasAccess: false, periodEndsAt: past,
  };
  const renewed = {
    ...EMPTY_MEMBERSHIP, state: 'active', hasAccess: true, periodEndsAt: future,
  };
  assert.equal(verifiedAccessStillCurrent(expired, Date.parse('2029-01-01')), false);
  assert.equal(verifiedAccessStillCurrent(renewed, Date.parse('2029-01-01')), true);
});

test('membership response parser accepts only the canonical safe projection', () => {
  const membership = parseVerifiedMembership({
    state: 'active', has_access: true, plan_kind: 'partner_annual',
    product_id: BILLING_PRODUCTS.partnerAnnual, store: 'app_store', platform: 'ios',
    environment: 'sandbox', period_ends_at: future, auto_renewing: true,
  });
  assert.equal(membership.planKind, 'partner_annual');
  assert.equal(membership.periodEndsAt, future);
  assert.throws(() => parseVerifiedMembership({ state: 'internal', has_access: true }), /Invalid membership/);
  assert.throws(() => parseVerifiedMembership({ state: 'active', has_access: 'yes' }), /Invalid membership/);
});

function billingFixture({ sessionId = 'member-a', rpcData = { state: 'no_entitlement', has_access: false }, reconciled = true } = {}) {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: sessionId ? { user: { id: sessionId } } : null }, error: null }) },
    rpc: async (name) => { calls.push(['rpc', name]); return { data: rpcData, error: null }; },
    functions: { invoke: async (name, options) => { calls.push(['function', name, options]); return { data: { reconciled }, error: null }; } },
  };
  return { api: createBillingApi(client), calls };
}

test('canonical mobile service reads its own server projection and uses authenticated reconciliation', async () => {
  const fixture = billingFixture({ rpcData: { state: 'active', has_access: true, period_ends_at: future } });
  assert.equal((await fixture.api.membership('member-a')).state, 'active');
  await fixture.api.reconcile('member-a');
  assert.deepEqual(fixture.calls, [
    ['rpc', 'current_vital_membership'],
    ['function', 'reconcile-membership', { body: {} }],
  ]);
});

for (const sessionId of [null, 'member-b']) test(`billing service rejects session ${sessionId} before any provider-state call`, async () => {
  const fixture = billingFixture({ sessionId });
  await assert.rejects(() => fixture.api.membership('member-a'), /session changed/);
  await assert.rejects(() => fixture.api.reconcile('member-a'), /session changed/);
  assert.deepEqual(fixture.calls, []);
});

test('routing waits for entitlement resolution and exposes only the constrained membership surface without access', () => {
  const layout = readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');
  const membership = readFileSync(new URL('../src/app/membership.tsx', import.meta.url), 'utf8');
  const provider = readFileSync(new URL('../src/features/billing/billing-provider.tsx', import.meta.url), 'utf8');
  assert.match(layout, /session && !isPasswordRecovery && isMembershipResolving/);
  assert.match(layout, /guard=\{Boolean\(session\) && !isPasswordRecovery && !hasAccess\}/);
  assert.match(layout, /guard=\{Boolean\(session\) && !isPasswordRecovery && hasAccess\}/);
  assert.match(provider, /resolvedUserId !== user\.id/);
  assert.match(provider, /setIsResolving\(true\)/);
  assert.match(provider, /AppState\.addEventListener\('change'/);
  assert.match(provider, /returnedToForeground\(previousState, nextState\)[\s\S]*load\(user\.id\)/);
  assert.match(provider, /scheduleVerifiedMembershipBoundaryRefresh\([\s\S]*membership[\s\S]*load\(user\.id\)/);
  assert.match(provider, /purchaseWasCancelled\(cause\)/);
  assert.match(membership, /MembershipAccessScreen/);
});

test('RevenueCat native client never starts anonymously or logs out into a generated anonymous customer', () => {
  const source = readFileSync(new URL('../src/features/billing/revenuecat-client.ts', import.meta.url), 'utf8');
  assert.match(source, /Purchases\.configure\(\{ apiKey, appUserID: userId \}\)/);
  assert.match(source, /Purchases\.logIn\(userId\)/);
  assert.doesNotMatch(source, /Purchases\.logOut|allowSharingAppStoreAccount/);
  assert.match(source, /if \(!billingConfig\.purchasesEnabled\) throw/);
  assert.match(source, /addCustomerInfoUpdateListener\(listener\)/);
  assert.match(source, /removeCustomerInfoUpdateListener\(listener\)/);
  const provider = readFileSync(new URL('../src/features/billing/billing-provider.tsx', import.meta.url), 'utf8');
  assert.match(provider, /observeRevenueCatCustomerInfo[\s\S]*load\(user\.id, \{ refreshProvider: false \}\)/);
});

test('Test Store purchases are development-only and production profiles stay disabled', () => {
  const config = readFileSync(new URL('../src/features/billing/billing-config.ts', import.meta.url), 'utf8');
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  assert.match(config, /typeof __DEV__ !== 'undefined' && __DEV__/);
  assert.match(config, /EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY/);
  assert.match(config, /startsWith\('test_'\)/);
  assert.match(config, /purchasesEnabled: isDevelopmentBuild/);
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.development.environment, 'development');
  assert.equal(eas.build.development.env.EXPO_PUBLIC_REVENUECAT_PURCHASES_ENABLED, 'true');
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_REVENUECAT_PURCHASES_ENABLED, 'false');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_REVENUECAT_PURCHASES_ENABLED, 'false');
});

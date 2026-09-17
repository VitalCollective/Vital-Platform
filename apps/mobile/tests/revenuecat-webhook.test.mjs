import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeRevenueCatSubscriber,
  verifyRevenueCatSignature,
} from '../../../supabase/functions/_shared/revenuecat.ts';
import { createRevenueCatWebhookHandler } from '../../../supabase/functions/revenuecat-webhook/handler.ts';
import { createReconcileMembershipHandler } from '../../../supabase/functions/reconcile-membership/handler.ts';

const member = '80000000-0000-4000-8000-000000000001';
const now = new Date('2026-09-14T12:00:00.000Z');
const future = '2026-10-14T12:00:00.000Z';
const past = '2026-08-14T12:00:00.000Z';
const secret = 'test-hmac-secret';
const authorization = 'Bearer webhook-test-secret';

async function signature(rawBody, timestamp = Math.floor(now.getTime() / 1000)) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const hex = [...new Uint8Array(signed)].map(value => value.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

async function request(payload, options = {}) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return new Request('https://example.invalid/revenuecat-webhook', {
    method: options.method ?? 'POST', body: options.method === 'GET' ? undefined : raw,
    headers: {
      Authorization: options.authorization ?? authorization,
      'X-RevenueCat-Webhook-Signature': options.signature ?? await signature(raw),
    },
  });
}

function event(type = 'INITIAL_PURCHASE', extra = {}) {
  return { event: { id: `event-${type}`, type, app_user_id: member, environment: 'SANDBOX', entitlement_ids: ['vital_membership'], event_timestamp_ms: now.getTime(), ...extra } };
}

function subscriber(extra = {}, subscriptionExtra = {}) {
  const product = extra.product_identifier ?? 'uk.co.vitalcollective.membership.monthly';
  return {
    request_date: now.toISOString(),
    subscriber: {
      entitlements: { vital_membership: { product_identifier: product, purchase_date: now.toISOString(), expires_date: future, ...extra } },
      subscriptions: { [product]: { store: 'app_store', is_sandbox: true, purchase_date: now.toISOString(), original_purchase_date: now.toISOString(), expires_date: future, ...subscriptionExtra } },
    },
  };
}

test('current HMAC verification signs timestamp plus the exact raw body and rejects skew/tampering', async () => {
  const body = JSON.stringify(event());
  const header = await signature(body);
  assert.equal(await verifyRevenueCatSignature(body, header, secret, Math.floor(now.getTime() / 1000)), true);
  assert.equal(await verifyRevenueCatSignature(`${body} `, header, secret, Math.floor(now.getTime() / 1000)), false);
  assert.equal(await verifyRevenueCatSignature(body, header, secret, Math.floor(now.getTime() / 1000) + 301), false);
});

test('subscriber normalization covers the access and terminal lifecycle states', () => {
  assert.equal(normalizeRevenueCatSubscriber(member, subscriber({}, { period_type: 'trial' }), null, now).status, 'trial');
  assert.equal(normalizeRevenueCatSubscriber(member, subscriber(), null, now).status, 'active');
  assert.equal(normalizeRevenueCatSubscriber(member, subscriber({}, { unsubscribe_detected_at: now.toISOString() }), event('CANCELLATION').event, now).status, 'cancelled');
  assert.equal(normalizeRevenueCatSubscriber(member, subscriber({ grace_period_expires_date: future }, { billing_issues_detected_at: now.toISOString() }), event('BILLING_ISSUE').event, now).status, 'grace_period');
  assert.equal(normalizeRevenueCatSubscriber(member, subscriber({}, { billing_issues_detected_at: now.toISOString() }), event('BILLING_ISSUE').event, now).status, 'billing_issue');
  assert.equal(normalizeRevenueCatSubscriber(member, subscriber({ expires_date: past }, { expires_date: past }), event('EXPIRATION').event, now).status, 'expired');
  assert.equal(normalizeRevenueCatSubscriber(member, subscriber({}, { refunded_at: now.toISOString() }), event('REFUND').event, now).status, 'refunded');
  const revoked = subscriber(); delete revoked.subscriber.entitlements.vital_membership;
  assert.equal(normalizeRevenueCatSubscriber(member, revoked, event('REVOKED', { product_id: 'uk.co.vitalcollective.membership.monthly' }).event, now).status, 'revoked');
  assert.equal(normalizeRevenueCatSubscriber(member, subscriber(), event('EXPIRATION').event, now).status, 'active', 'a delayed old event cannot downgrade the current subscriber snapshot');
});

function webhookDependencies(overrides = {}) {
  const calls = [];
  return { calls, value: {
    authorization, hmacSecret: secret, nowSeconds: () => Math.floor(now.getTime() / 1000),
    findGenuineProfiles: async ids => { calls.push(['profiles', ids]); return [member]; },
    claimEvent: async claim => { calls.push(['claim', claim]); return 'claimed'; },
    fetchSubscriber: async id => { calls.push(['fetch', id]); return subscriber(); },
    applyState: async (id, state) => { calls.push(['apply', id, state.status]); },
    clearState: async id => { calls.push(['clear', id]); },
    completeEvent: async (id, status, code) => { calls.push(['complete', id, status, code]); },
    ...overrides,
  } };
}

test('webhook rejects unauthorized, malformed and wrongly signed requests before state work', async () => {
  const fixture = webhookDependencies(); const handler = createRevenueCatWebhookHandler(fixture.value);
  assert.equal((await handler(await request(event(), { authorization: 'wrong' }))).status, 401);
  assert.equal((await handler(await request(event(), { signature: 't=1,v1=' + '0'.repeat(64) }))).status, 401);
  assert.equal((await handler(await request('{', {}))).status, 400);
  assert.equal((await handler(await request(event('INITIAL_PURCHASE', { aliases: {} })))).status, 400);
  assert.deepEqual(fixture.calls, []);
});

test('webhook applies a verified lifecycle snapshot once and acknowledges duplicate delivery', async () => {
  const fixture = webhookDependencies(); const handler = createRevenueCatWebhookHandler(fixture.value);
  assert.equal((await handler(await request(event()))).status, 200);
  assert.deepEqual(fixture.calls.map(call => call[0]), ['profiles', 'claim', 'fetch', 'apply', 'complete']);
  const duplicate = webhookDependencies({ claimEvent: async () => 'duplicate' });
  const response = await createRevenueCatWebhookHandler(duplicate.value)(await request(event()));
  assert.deepEqual(await response.json(), { received: true, duplicate: true });
  assert.equal(duplicate.calls.some(call => ['fetch', 'apply', 'clear'].includes(call[0])), false);
});

test('unknown or deleted customer is recorded as ignored and never recreated', async () => {
  const fixture = webhookDependencies({ findGenuineProfiles: async ids => { fixture.calls.push(['profiles', ids]); return []; } });
  const response = await createRevenueCatWebhookHandler(fixture.value)(await request(event()));
  assert.deepEqual(await response.json(), { received: true, ignored: true });
  assert.deepEqual(fixture.calls.map(call => call[0]), ['profiles', 'claim', 'complete']);
  assert.equal(fixture.calls.some(call => ['fetch', 'apply', 'clear', 'insertProfile'].includes(call[0])), false);
});

test('processing failure is recorded safely and returned for RevenueCat retry', async () => {
  const fixture = webhookDependencies({ applyState: async () => { throw new Error('database offline'); } });
  const response = await createRevenueCatWebhookHandler(fixture.value)(await request(event()));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { received: false, code: 'processing_failed' });
  assert.deepEqual(fixture.calls.at(-1), ['complete', 'event-INITIAL_PURCHASE', 'failed', 'processing_failed']);
});

test('authenticated reconciliation accepts only a genuine current user and clears absent entitlement', async () => {
  const calls = [];
  const handler = createReconcileMembershipHandler({
    verifyUser: async token => token === 'valid' ? { id: member } : null,
    isGenuineProfile: async id => id === member,
    fetchSubscriber: async id => { calls.push(['fetch', id]); return { subscriber: {} }; },
    applyState: async () => { calls.push(['apply']); },
    clearState: async id => { calls.push(['clear', id]); },
  });
  assert.equal((await handler(new Request('https://example.invalid', { method: 'POST' }))).status, 401);
  const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { Authorization: 'Bearer valid' } }));
  assert.deepEqual(await response.json(), { reconciled: true });
  assert.deepEqual(calls, [['fetch', member], ['clear', member]]);
});

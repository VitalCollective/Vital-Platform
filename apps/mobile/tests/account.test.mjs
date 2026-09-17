import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createAccountApi } from '../src/features/account/account-api.ts';
import { ACCOUNT_PANELS, accountPanel, profileValidation, interestValues, supportUrl, NOTIFICATION_LABELS } from '../src/features/account/account-model.ts';
import { SUPPORT_EMAIL } from '../src/features/account/account-content.ts';

test('all account destinations round-trip; invalid and repeated route parameters return to the hub', () => {
  for (const key of Object.keys(ACCOUNT_PANELS)) assert.equal(accountPanel(key), key);
  for (const value of [undefined, '', 'constructor', '__proto__', 'payment', ['profile', 'deletion']]) assert.equal(accountPanel(value), null);
});
test('You preserves tab routing and registers hardware back only on Android', () => {
  const route = readFileSync(new URL('../src/app/(tabs)/you.tsx', import.meta.url), 'utf8');
  assert.match(route, /if \(!panel \|\| Platform\.OS !== 'android'\) return;/);
  assert.match(route, /router\.setParams\(\{ panel: '' \}\)/);
  assert.match(route, /key=\{user\.id\}/);
  assert.match(route, /signOut=\{signOut\}/);
});
test('profile validation is understandable and bounded without losing meaningful whitespace inside names', () => {
  assert.ok(profileValidation('  ', ''));
  assert.ok(profileValidation('x'.repeat(81), ''));
  assert.ok(profileValidation('Name', 'x'.repeat(501)));
  assert.equal(profileValidation('  Jo Smith  ', 'Hello'), null);
});
test('interests retain all distinct entries for explicit UI validation, rather than silently truncating', () => {
  assert.deepEqual(interestValues(' walking, cooking,walking, , '), ['walking', 'cooking']);
  assert.equal(interestValues(Array.from({ length: 21 }, (_, i) => `interest${i}`).join(',')).length, 21);
});
test('approved support destination; email composition safely encodes member text', () => {
  assert.equal(SUPPORT_EMAIL, 'info@vitalcollective.co.uk');
  assert.equal(supportUrl(null, 'Hello'), null);
  assert.equal(supportUrl('help@example.com?bcc=other@example.com', 'Hello'), null);
  assert.equal(supportUrl('help@example.com', 'Ideas & feedback', 'A\nB'), 'mailto:help@example.com?subject=Ideas%20%26%20feedback&body=A%0AB');
});
function fixture({ user = 'member-a', response = [], status = 200 } = {}) {
  const calls = [];
  const client = createClient('https://account-test.invalid', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options = {}) => {
      calls.push({ url: new URL(url), method: options.method, body: options.body && JSON.parse(options.body) });
      return new Response(JSON.stringify(response), { status, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  client.auth.getSession = async () => ({ data: { session: user ? { user: { id: user } } : null }, error: null });
  return { api: createAccountApi(client), calls };
}
test('family reads are owner-scoped and request only privacy-minimised family fields', async () => {
  const { api, calls } = fixture(); await api.families('member-a');
  const url = calls[0].url;
  assert.equal(url.pathname, '/rest/v1/families');
  assert.equal(url.searchParams.get('owner_id'), 'eq.member-a');
  assert.match(url.searchParams.get('select'), /members:family_members/);
  assert.match(url.searchParams.get('select'), /age_confirmed_at/);
  assert.doesNotMatch(url.searchParams.get('select'), /\*|auth|email|age_band|interests|active/);
});
test('preferences use three existing self-owned tables; missing defaults are not invented', async () => {
  const { api, calls } = fixture({ response: null });
  assert.deepEqual(await api.preferences('member-a'), { activities: null, notifications: null, newsletter: null });
  assert.deepEqual(calls.map(c => c.url.pathname.split('/').pop()).sort(), ['newsletter_preferences', 'notification_preferences', 'user_preferences']);
  assert.ok(calls.every(c => c.url.searchParams.get('profile_id') === 'eq.member-a'));
});
test('account API does not read provider entitlement rows directly', () => {
  const source = readFileSync(new URL('../src/features/account/account-api.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /subscription_entitlements|\.memberships\(/);
});
test('preference writes are scoped updates, allowlist fields and cannot create rows', async () => {
  const { api, calls } = fixture({ response: { profile_id: 'member-a' } });
  await api.saveActivities('member-a', { preferred_sections: ['Vital Kids'], interests: ['Art'], profile_id: 'victim' });
  const notifications = Object.fromEntries(Object.keys(NOTIFICATION_LABELS).map(key => [key, true]));
  await api.saveNotifications('member-a', { ...notifications, profile_id: 'victim' });
  await api.saveNewsletter('member-a', false);
  await api.saveNewsletter('member-a', true);
  assert.ok(calls.every(c => c.method === 'PATCH' && c.url.searchParams.get('profile_id') === 'eq.member-a'));
  assert.deepEqual(calls[0].body, { preferred_sections: ['Vital Kids'], interests: ['Art'] });
  assert.deepEqual(calls[1].body, notifications);
  assert.equal(calls[2].body.subscribed, false); assert.ok(calls[2].body.unsubscribed_at);
  assert.equal(calls[3].body.subscribed, true); assert.equal(calls[3].body.unsubscribed_at, null);
});
test('missing-row and genuine backend failures reject rather than reporting a saved preference', async () => {
  const { api } = fixture({ status: 406, response: { code: 'PGRST116', message: 'No rows' } });
  await assert.rejects(() => api.saveNewsletter('member-a', false));
  await assert.rejects(() => api.families('member-a'));
});
for (const user of [null, 'member-b']) test(`missing/changed session ${user} cannot read or update another member`, async () => {
  const { api, calls } = fixture({ user });
  for (const operation of [() => api.families('member-a'), () => api.preferences('member-a'), () => api.saveNewsletter('member-a', true)]) {
    await assert.rejects(operation, /session changed/);
  }
  assert.equal(calls.length, 0);
});

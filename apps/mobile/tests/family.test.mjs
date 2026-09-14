import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createAccountApi } from '../src/features/account/account-api.ts';
import { FAMILY_RELATIONSHIPS, familyMemberValidation, parseFamilyAge } from '../src/features/account/account-model.ts';

const savedMember = {
  id: 'family-member-a', family_id: 'family-a', display_name: null,
  relationship: 'Child', age_years: 7, age_confirmed_at: '2026-09-14T12:00:00Z',
};

function fixture(responses, user = 'member-a') {
  const calls = [];
  const queue = [...responses];
  const client = createClient('https://family-test.invalid', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options = {}) => {
      calls.push({ url: new URL(url), method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
      return new Response(JSON.stringify(queue.shift() ?? null), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  client.auth.getSession = async () => ({ data: { session: user ? { user: { id: user } } : null }, error: null });
  return { api: createAccountApi(client), calls };
}

test('family validation permits an optional nickname and bounds controlled relationship and whole-year age', () => {
  assert.deepEqual(FAMILY_RELATIONSHIPS, ['Child', 'Partner', 'Parent', 'Grandparent', 'Other']);
  assert.equal(familyMemberValidation('', 'Child', '0'), null);
  assert.equal(familyMemberValidation('Gran', 'Grandparent', '120'), null);
  for (const age of ['', '-1', '1.5', '05', '121']) assert.match(familyMemberValidation('', 'Child', age), /whole number/);
  assert.match(familyMemberValidation('', 'Sibling', '8'), /relationship/);
  assert.match(familyMemberValidation('x'.repeat(61), 'Other', '8'), /60/);
  assert.equal(parseFamilyAge(' 9 '), 9);
});

test('add creates the private family container when needed and writes only approved member fields', async () => {
  const { api, calls } = fixture([null, { id: 'family-a' }, savedMember]);
  assert.deepEqual(await api.addFamilyMember('member-a', { displayName: '  ', relationship: 'Child', ageYears: 7 }), savedMember);
  assert.deepEqual(calls.map(call => [call.method, call.url.pathname]), [
    ['GET', '/rest/v1/families'], ['POST', '/rest/v1/families'], ['POST', '/rest/v1/family_members'],
  ]);
  assert.deepEqual(calls[1].body, { owner_id: 'member-a' });
  assert.deepEqual(calls[2].body, { family_id: 'family-a', display_name: null, relationship: 'Child', age_years: 7 });
});

test('edit and remove target one member, use acknowledged rows, and accept no client-owned family identity', async () => {
  const edited = { ...savedMember, display_name: 'Sam', relationship: 'Partner', age_years: 36 };
  const { api, calls } = fixture([edited, { id: savedMember.id }]);
  assert.deepEqual(await api.updateFamilyMember('member-a', savedMember.id, { displayName: '  Sam  ', relationship: 'Partner', ageYears: 36 }), edited);
  await api.removeFamilyMember('member-a', savedMember.id);
  assert.equal(calls[0].method, 'PATCH'); assert.equal(calls[0].url.searchParams.get('id'), `eq.${savedMember.id}`);
  assert.deepEqual(calls[0].body, { display_name: 'Sam', relationship: 'Partner', age_years: 36 });
  assert.equal(calls[1].method, 'DELETE'); assert.equal(calls[1].url.searchParams.get('id'), `eq.${savedMember.id}`);
});

test('invalid input and a changed session fail before family-table writes', async () => {
  const invalid = fixture([]);
  await assert.rejects(() => invalid.api.addFamilyMember('member-a', { displayName: '', relationship: 'Child', ageYears: 1.5 }), /whole number/);
  assert.equal(invalid.calls.length, 0);
  const changed = fixture([], 'member-b');
  for (const operation of [
    () => changed.api.addFamilyMember('member-a', { displayName: '', relationship: 'Child', ageYears: 7 }),
    () => changed.api.updateFamilyMember('member-a', savedMember.id, { displayName: '', relationship: 'Child', ageYears: 7 }),
    () => changed.api.removeFamilyMember('member-a', savedMember.id),
  ]) await assert.rejects(operation, /session changed/);
  assert.equal(changed.calls.length, 0);
});

test('Family UI exposes compact add/edit/remove controls, typed fields, privacy copy and confirmation', () => {
  const source = readFileSync(new URL('../src/features/account/account-family.tsx', import.meta.url), 'utf8');
  assert.match(source, /Name or nickname · optional/); assert.match(source, /Current age in whole years/);
  assert.match(source, /FAMILY_RELATIONSHIPS\.map/); assert.match(source, /Add a family member/);
  assert.match(source, /Save changes/); assert.match(source, /Remove family member/); assert.match(source, /Keep family member/);
  assert.match(source, /never part of your Community profile/); assert.match(source, /does not affect your Vital account or anyone else/);
});

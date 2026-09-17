import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBillingApi } from '../src/features/billing/billing-api.ts';
import {
  EMPTY_MEMBERSHIP_WELCOME,
  membershipWelcomeReducer,
} from '../src/features/billing/membership-welcome-state.ts';

function session(state, userId = 'member-a') {
  return membershipWelcomeReducer(state, { type: 'session', userId });
}

test('first confirmed activation shows the welcome after the server claims it', () => {
  let state = session(EMPTY_MEMBERSHIP_WELCOME);
  state = membershipWelcomeReducer(state, { type: 'checking' });
  state = membershipWelcomeReducer(state, { type: 'resolved', userId: 'member-a', claimed: true });
  assert.deepEqual(state, { userId: 'member-a', checked: true, checking: false, visible: true });
});

test('a subsequent launch does not show an already-claimed welcome', () => {
  let state = session(EMPTY_MEMBERSHIP_WELCOME);
  state = membershipWelcomeReducer(state, { type: 'checking' });
  state = membershipWelcomeReducer(state, { type: 'resolved', userId: 'member-a', claimed: false });
  assert.equal(state.visible, false);
  assert.equal(state.checked, true);
});

test('dismissal stays closed for the account during the session', () => {
  let state = session(EMPTY_MEMBERSHIP_WELCOME);
  state = membershipWelcomeReducer(state, { type: 'resolved', userId: 'member-a', claimed: true });
  state = membershipWelcomeReducer(state, { type: 'dismissed' });
  assert.equal(state.visible, false);
  assert.equal(membershipWelcomeReducer(state, { type: 'checking' }), state);
});

test('billing API claims the persisted marker through the authenticated RPC', async () => {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'member-a' } } }, error: null }) },
    rpc: async (name) => { calls.push(name); return { data: true, error: null }; },
  };
  assert.equal(await createBillingApi(client).claimWelcome('member-a'), true);
  assert.deepEqual(calls, ['claim_vital_membership_welcome']);
});

test('persistence is atomic, entitlement-gated and scoped to the authenticated preference row', () => {
  const migration = readFileSync(new URL('../../../supabase/migrations/20260917120000_membership_welcome.sql', import.meta.url), 'utf8');
  assert.match(migration, /membership_welcome_seen_at timestamptz/);
  assert.match(migration, /if not public\.has_valid_vital_membership\(\)/);
  assert.match(migration, /preferences\.profile_id = auth\.uid\(\)/);
  assert.match(migration, /membership_welcome_seen_at is null/);
  assert.match(migration, /grant execute[\s\S]*to authenticated, service_role/);
});

test('feedback dismisses the modal and opens the existing suggestion destination', () => {
  const modal = readFileSync(new URL('../src/features/billing/membership-welcome-modal.tsx', import.meta.url), 'utf8');
  assert.match(modal, /function sendFeedback\(\)[\s\S]*dismiss\(\);[\s\S]*pathname: '\/you'[\s\S]*panel: 'suggest'/);
  assert.match(modal, /label="Start exploring" onPress=\{dismiss\}/);
  assert.match(modal, /label="Send feedback"/);
});

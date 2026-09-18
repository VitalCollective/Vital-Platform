import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isDefinitiveAuthSessionError } from '../src/features/auth/auth-session.ts';
import { EMPTY_MEMBERSHIP } from '../src/features/billing/billing-model.ts';
import {
  clearVerifiedMembershipCache,
  readVerifiedMembershipCache,
  writeVerifiedMembershipCache,
} from '../src/features/billing/verified-membership-cache.ts';
import { RequestTimeoutError, withRequestTimeout } from '../src/lib/request-lifecycle.ts';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test('read deadlines turn stalled requests into a retryable timeout', async () => {
  let expire;
  const pending = withRequestTimeout(new Promise(() => undefined), {
    timeoutMs: 25,
    setTimer: (callback, delay) => {
      assert.equal(delay, 25);
      expire = callback;
      return 1;
    },
    clearTimer: () => undefined,
  });
  expire();
  await assert.rejects(pending, RequestTimeoutError);
});

test('only definitive authentication failures invalidate a restored session', () => {
  assert.equal(isDefinitiveAuthSessionError({ status: 401 }), true);
  assert.equal(isDefinitiveAuthSessionError({ code: 'refresh_token_not_found' }), true);
  assert.equal(isDefinitiveAuthSessionError({ message: 'Network request failed' }), false);
  assert.equal(isDefinitiveAuthSessionError(new RequestTimeoutError()), false);
});

test('verified membership cache is account-scoped and expires at the server boundary', () => {
  const storage = memoryStorage();
  const now = Date.parse('2029-01-01T00:00:00.000Z');
  const membership = {
    ...EMPTY_MEMBERSHIP,
    state: 'active',
    hasAccess: true,
    periodEndsAt: '2030-01-01T00:00:00.000Z',
  };
  writeVerifiedMembershipCache('member-a', membership, storage);
  assert.equal(readVerifiedMembershipCache('member-a', now, storage)?.hasAccess, true);
  assert.equal(
    readVerifiedMembershipCache('member-a', Date.parse(membership.periodEndsAt), storage),
    null,
  );
  assert.equal(readVerifiedMembershipCache('member-b', now, storage), null);
  assert.equal(storage.values.size, 0);
  clearVerifiedMembershipCache(storage);
  assert.equal(storage.values.size, 0);
});

test('launch and foreground paths stay gated and refresh auth before membership', () => {
  const layout = readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('../src/features/auth/auth-provider.tsx', import.meta.url), 'utf8');
  const billing = readFileSync(new URL('../src/features/billing/billing-provider.tsx', import.meta.url), 'utf8');
  assert.match(layout, /isLoading[\s\S]*isMembershipResolving/);
  assert.match(layout, /guard=\{Boolean\(session\)[\s\S]*hasAccess\}/);
  assert.match(auth, /temporary network failure must not erase a locally restored session/);
  assert.match(auth, /withRequestTimeout\(\s*client\.auth\.getUser\(\)/);
  assert.match(billing, /readVerifiedMembershipCache\(user\.id,/);
  assert.match(billing, /await revalidateSession\(\)[\s\S]*await load\(user\.id\)/);
});

test('core read surfaces have bounded failure paths instead of permanent spinners', () => {
  for (const path of [
    '../src/features/activities/activity-hooks.ts',
    '../src/features/community/community-hooks.ts',
    '../src/features/saved/saved-activities-state.ts',
    '../src/features/account/account-ui.tsx',
  ]) {
    assert.match(
      readFileSync(new URL(path, import.meta.url), 'utf8'),
      /withRequestTimeout/,
      path,
    );
  }
});

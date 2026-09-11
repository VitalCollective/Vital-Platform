import assert from 'node:assert/strict';
import test from 'node:test';

import {
  customerSafeErrorMessage,
  isFutureJwtTimingError,
  withFutureJwtTimingRetry,
} from '../src/lib/errors.ts';

const transientJwtError = {
  code: 'PGRST303',
  message: 'JWT issued at future',
};

test('recognises only the transient future-JWT timing failure', () => {
  assert.equal(isFutureJwtTimingError(transientJwtError), true);
  assert.equal(
    isFutureJwtTimingError({ code: 'PGRST303', message: 'JWT expired' }),
    false,
  );
  assert.equal(
    isFutureJwtTimingError({ code: '42501', message: 'permission denied' }),
    false,
  );
});

test('retries a transient future-JWT failure and then succeeds', async () => {
  let attempts = 0;

  const result = await withFutureJwtTimingRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw transientJwtError;
      return 'loaded';
    },
    { delaysMs: [0] },
  );

  assert.equal(result, 'loaded');
  assert.equal(attempts, 2);
});

test('stops after the configured retry bound', async () => {
  let attempts = 0;

  await assert.rejects(
    withFutureJwtTimingRetry(
      async () => {
        attempts += 1;
        throw transientJwtError;
      },
      { delaysMs: [0, 0] },
    ),
    transientJwtError,
  );

  assert.equal(attempts, 3);
});

test('does not retry unrelated failures', async () => {
  let attempts = 0;
  const unrelatedError = { code: '42501', message: 'permission denied' };

  await assert.rejects(
    withFutureJwtTimingRetry(async () => {
      attempts += 1;
      throw unrelatedError;
    }),
    unrelatedError,
  );

  assert.equal(attempts, 1);
});

test('returns only the supplied customer-safe message', () => {
  assert.equal(
    customerSafeErrorMessage(
      'Home ideas failed',
      transientJwtError,
      "We couldn't load your ideas just now.",
    ),
    "We couldn't load your ideas just now.",
  );
});

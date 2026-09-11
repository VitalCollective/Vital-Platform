import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPrintableResourceState } from '../src/lib/printable-resources.ts';

test('distinguishes available, not-required, and unavailable printable states', () => {
  assert.equal(classifyPrintableResourceState(0, 0), 'not-required');
  assert.equal(classifyPrintableResourceState(1, 1), 'available');
  assert.equal(classifyPrintableResourceState(2, 2), 'available');
  assert.equal(classifyPrintableResourceState(1, 0), 'unavailable');
  assert.equal(classifyPrintableResourceState(2, 1), 'unavailable');
});

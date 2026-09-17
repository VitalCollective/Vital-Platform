import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createAccountApi } from '../src/features/account/account-api.ts';
import {
  activitySubmissionValidation,
  feedbackSubmissionValidation,
} from '../src/features/account/account-model.ts';

function fixture(userId = 'member-a', response = { error: null }) {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null }, error: null }) },
    from(table) {
      return { async insert(values) { calls.push({ table, values }); return response; } };
    },
  };
  return { api: createAccountApi(client), calls };
}

test('feedback validation requires a message and bounds optional subject', () => {
  assert.match(feedbackSubmissionValidation({ type: 'bug', subject: '', message: ' ' }), /feedback/);
  assert.match(feedbackSubmissionValidation({ type: 'comment', subject: 'x'.repeat(121), message: 'Useful' }), /120/);
  assert.equal(feedbackSubmissionValidation({ type: 'suggestion', subject: 'A thought', message: 'Useful' }), null);
});

test('activity validation requires core content and rights confirmation', () => {
  const valid = { name: 'Family walk game', section: 'Vital Together', suitableAge: 'All ages', description: 'Take turns spotting colours.', equipmentNotes: '', rightsConfirmed: true };
  assert.equal(activitySubmissionValidation(valid), null);
  assert.match(activitySubmissionValidation({ ...valid, name: '' }), /name/);
  assert.match(activitySubmissionValidation({ ...valid, description: '' }), /description/);
  assert.match(activitySubmissionValidation({ ...valid, rightsConfirmed: false }), /right to submit/);
});

test('submission writes omit selectable identity and never create Community content', async () => {
  const { api, calls } = fixture();
  await api.submitFeedback('member-a', { type: 'bug', subject: '  Loading  ', message: '  Screen stalled  ' });
  await api.submitActivity('member-a', { name: '  Colour walk  ', section: 'Vital Kids', suitableAge: '  5–8  ', description: '  Spot five colours.  ', equipmentNotes: '  None  ', rightsConfirmed: true });
  assert.deepEqual(calls, [
    { table: 'member_submissions', values: { submission_type: 'feedback', feedback_kind: 'bug', subject: 'Loading', message: 'Screen stalled' } },
    { table: 'member_submissions', values: { submission_type: 'activity', activity_name: 'Colour walk', vital_section: 'Vital Kids', suitable_age: '5–8', description: 'Spot five colours.', equipment_notes: 'None', rights_confirmed: true } },
  ]);
  for (const call of calls) {
    assert.equal(Object.hasOwn(call.values, 'profile_id'), false);
    assert.notEqual(call.table, 'community_posts');
  }
});

test('missing or changed sessions cannot submit', async () => {
  for (const userId of [null, 'member-b']) {
    const { api, calls } = fixture(userId);
    await assert.rejects(() => api.submitFeedback('member-a', { type: 'other', subject: '', message: 'Hello' }), /session changed/);
    assert.equal(calls.length, 0);
  }
});

test('native forms keep success in Vital and clearly state submissions are private', () => {
  const forms = readFileSync(new URL('../src/features/account/account-submissions.tsx', import.meta.url), 'utf8');
  assert.match(forms, /FEEDBACK_TYPES\.map/);
  assert.match(forms, /label="Submit feedback"/);
  assert.match(forms, /label="Submit activity"/);
  assert.match(forms, /sent privately to the Vital team/);
  assert.match(forms, /not posted in Community/);
  assert.doesNotMatch(forms, /Linking|mailto:/);
});

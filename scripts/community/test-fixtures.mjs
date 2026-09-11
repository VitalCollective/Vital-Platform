// Synthetic fixtures for isolated tests only. Not editorial seed content.
import { APPROVED_NAMES } from './seed.mjs';
export function starterFixture() {
  return {
    schema_version: 3, batch_key: 'automated-test-only', editorial_approved: true,
    profiles: APPROVED_NAMES.map((display_name, index) => ({ key: `profile-${index + 1}`, display_name, created_at: '2026-01-01T12:00:00Z' })),
    posts: [{ key: 'test-post', author_key: 'profile-1', post_type: 'question', topic: 'Kids', title: 'TEST FIXTURE ONLY', body: 'test fixture with imperfect punctuation 🙂 dont change this', created_at: '2026-01-02T12:00:00Z' }],
    replies: [{ key: 'test-reply', author_key: 'profile-2', post_key: 'test-post', body: 'fixture reply', created_at: '2026-01-03T12:00:00Z' }],
    reactions: [{ key: 'test-reaction', author_key: 'profile-3', target_type: 'post', target_key: 'test-post', created_at: '2026-01-04T12:00:00Z' }],
  };
}

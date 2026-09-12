import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createProfileApi, COMMUNITY_PROFILE_FIELDS } from '../src/services/profile-api.ts';
import { createCommunityApi } from '../src/features/community/community-api.ts';

function fixture({ user = 'member-a', status = 200, incomplete = false } = {}) {
  const calls = [];
  let row = { id: 'member-a', display_name: 'Member', avatar_url: null, bio: null, is_seeded: false };
  const client = createClient('https://profile-test.invalid', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options = {}) => {
      const call = { url: new URL(url), method: options.method, body: options.body && JSON.parse(options.body) }; calls.push(call);
      if (status !== 200) return Response.json({ message: 'Backend details', code: '42501' }, { status });
      if (call.method === 'PATCH') row = { ...row, ...call.body };
      if (call.url.pathname.endsWith('search_community_posts') || call.url.pathname.endsWith('community_reply_page')) {
        return Response.json({ items: [{ id: 'content', author_id: 'member-a', author_name: 'Old name', body: 'Original content' }], hasMore: false, nextOffset: 20 });
      }
      const selected = call.url.searchParams.get('select').split(',');
      const result = incomplete ? { id: row.id } : Object.fromEntries(selected.map(key => [key, row[key]]));
      const plural = call.url.searchParams.has('id') && call.url.searchParams.get('id').startsWith('in.');
      return Response.json(plural ? [result] : result);
    } },
  });
  client.auth.getSession = async () => ({ data: { session: user ? { user: { id: user } } : null }, error: null });
  return { client, api: createProfileApi(client), calls };
}

test('bio saves to the canonical profile row, returns the acknowledged value and survives a fresh service read', async () => {
  const { api, client, calls } = fixture();
  assert.equal((await api.read('member-a')).bio, null);
  const saved = await api.update('member-a', '  Jo Member  ', '  First line.\nSecond line.  ');
  assert.equal(saved.bio, 'First line.\nSecond line.'); assert.equal(saved.displayName, 'Jo Member');
  assert.deepEqual(await createProfileApi(client).read('member-a'), saved);
  const write = calls.find(call => call.method === 'PATCH');
  assert.equal(write.url.pathname, '/rest/v1/profiles');
  assert.equal(write.url.searchParams.get('id'), 'eq.member-a');
  assert.equal(write.url.searchParams.get('select'), COMMUNITY_PROFILE_FIELDS);
  assert.deepEqual(write.body, { display_name: 'Jo Member', bio: saved.bio });
  assert.equal((await api.update('member-a', 'Jo Member', '   ')).bio, null);
  assert.equal((await api.read('member-a')).bio, null);
});

test('Community feed and replies retrieve the current bio, not Auth metadata or a stale author snapshot', async () => {
  const { api, client, calls } = fixture();
  const community = createCommunityApi(client);
  const filters = { search: '', topic: null, postType: null, order: 'recent' };
  assert.equal((await community.posts(filters)).items[0].author_bio, null);
  await api.update('member-a', 'Jo Member', 'Updated introduction');
  for (const content of [(await community.posts(filters)).items[0], (await community.replies('post')).items[0]]) {
    assert.equal(content.author_bio, 'Updated introduction');
    assert.equal(content.author_name, 'Jo Member');
    assert.equal(content.body, 'Original content');
  }
  const directory = calls.filter(call => call.url.searchParams.get('id')?.startsWith('in.'));
  assert.ok(directory.every(call => call.url.searchParams.get('select').split(',').includes('bio')));
  assert.ok(calls.every(call => !/auth|family|user_metadata/.test(call.url.pathname)));
});

test('missing or changed Auth session cannot update a different member', async () => {
  for (const user of [null, 'member-b']) {
    const { api, calls } = fixture({ user });
    await assert.rejects(() => api.update('member-a', 'Member', 'Bio'), /session changed/);
    assert.equal(calls.length, 0);
  }
});

test('missing rows, rejected writes and incomplete acknowledgements cannot report success', async () => {
  for (const options of [{ status: 403 }, { status: 406 }, { incomplete: true }]) {
    const { api } = fixture(options);
    await assert.rejects(() => api.update('member-a', 'Member', 'New introduction'));
  }
  const { api, calls } = fixture();
  await assert.rejects(() => api.update('member-a', ' ', 'Bio'));
  await assert.rejects(() => api.update('member-a', 'Member', 'x'.repeat(501)));
  assert.equal(calls.length, 0);
});

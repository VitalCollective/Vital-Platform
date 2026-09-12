import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

import { createActivitySavesApi } from '../src/features/saved/activity-saves-api.ts';
import { createActivitySaveController } from '../src/features/saved/activity-save-state.ts';
import { createSavedActivitiesController } from '../src/features/saved/saved-activities-state.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(initial = false) {
  let saved = initial;
  const writes = [];
  const api = {
    async read() { return saved; },
    async write(profile, activity, value) { writes.push([profile, activity, value]); saved = value; },
  };
  const controller = () => createActivitySaveController(api, 'member-a', 'activity-a');
  return { api, controller, writes };
}

test('initial unknown state cannot be toggled; existing saved state loads', async () => {
  const f = fixture(true), state = f.controller();
  assert.equal(state.getSnapshot().saved, null);
  await state.toggle();
  assert.equal(f.writes.length, 0);
  await state.refresh();
  assert.deepEqual(state.getSnapshot(), { saved: true, isLoading: false, isSaving: false, error: null });
});

test('save and unsave persist across independent screen instances', async () => {
  const f = fixture(), first = f.controller();
  await first.refresh(); await first.toggle();
  const reopened = f.controller();
  await reopened.refresh();
  assert.equal(reopened.getSnapshot().saved, true);
  await reopened.toggle();
  await first.refresh(); // Returning to an already-mounted screen.
  assert.equal(first.getSnapshot().saved, false);
  assert.deepEqual(f.writes, [['member-a', 'activity-a', true], ['member-a', 'activity-a', false]]);
});

test('optimistic state is immediate; rapid taps and refresh cannot race the write', async () => {
  const pending = deferred(); let writes = 0, reads = 0;
  const state = createActivitySaveController({
    async read() { reads++; return false; },
    async write() { writes++; await pending.promise; },
  }, 'member-a', 'activity-a');
  await state.refresh();
  const saving = state.toggle();
  assert.equal(state.getSnapshot().saved, true);
  assert.equal(state.getSnapshot().isSaving, true);
  await state.toggle(); await state.refresh();
  assert.equal(writes, 1); assert.equal(reads, 1);
  pending.resolve(); await saving;
  assert.equal(state.getSnapshot().saved, true);
  assert.equal(state.getSnapshot().isSaving, false);
});

for (const wasSaved of [false, true]) {
  test(`failed ${wasSaved ? 'unsave' : 'save'} rolls back, hides backend errors and allows retry`, async () => {
    const f = fixture(wasSaved), state = f.controller();
    f.api.write = async () => { throw new Error('JWT expired: secret backend detail'); };
    await state.refresh(); await state.toggle();
    assert.equal(state.getSnapshot().saved, wasSaved);
    assert.equal(state.getSnapshot().isSaving, false);
    assert.equal(state.getSnapshot().error, "We couldn't update your saved activity. Please try again.");
    await state.refresh();
    assert.equal(state.getSnapshot().error, null);
  });
}

test('failed read is not treated as unsaved, and retry safely reloads', async () => {
  const f = fixture(true), state = f.controller(); let fail = true;
  f.api.read = async () => { if (fail) throw new Error('permission denied'); return true; };
  await state.refresh(); await state.toggle();
  assert.equal(state.getSnapshot().saved, null);
  assert.equal(state.getSnapshot().error, "We couldn't check whether this activity is saved. Please try again.");
  assert.equal(f.writes.length, 0);
  fail = false; await state.refresh();
  assert.equal(state.getSnapshot().saved, true);
});

test('lost write acknowledgement is reconciled on retry before another toggle', async () => {
  const f = fixture(), state = f.controller();
  f.api.write = async () => { f.api.read = async () => true; throw new Error('Network response lost'); };
  await state.refresh(); await state.toggle();
  assert.equal(state.getSnapshot().saved, false); // Optimistic rollback, not an assertion about the DB.
  await state.toggle(); // Blocked until reconciliation.
  assert.ok(state.getSnapshot().error);
  await state.refresh();
  assert.equal(state.getSnapshot().saved, true);
  assert.equal(state.getSnapshot().error, null);
});

test('late reads cannot overwrite a newer focus refresh', async () => {
  const pending = deferred(); let reads = 0;
  const state = createActivitySaveController({
    async read() { return ++reads === 1 ? pending.promise : true; }, async write() {},
  }, 'member-a', 'activity-a');
  const first = state.refresh(); await state.refresh();
  pending.resolve(false); await first;
  assert.equal(state.getSnapshot().saved, true);
});

test('member/activity instances and unmounted subscriptions remain isolated', async () => {
  const pending = deferred(); let notified = 0;
  const api = { async read(member) { return member === 'member-a' ? pending.promise : false; }, async write() {} };
  const first = createActivitySaveController(api, 'member-a', 'activity-a');
  const unsubscribe = first.subscribe(() => notified++);
  const loading = first.refresh(); unsubscribe();
  const next = createActivitySaveController(api, 'member-b', 'activity-b');
  await next.refresh();
  pending.resolve(true); await loading;
  assert.equal(notified, 1);
  assert.equal(next.getSnapshot().saved, false);
});

// Actual Supabase/PostgREST query builder, with a local fetch stand-in only.
// Nothing in these tests contacts Supabase or creates real users/content.
function postgrestFixture() {
  const rows = new Map(), requests = [], activities = new Map();
  let member = 'member-a', failure = null, writeGate = null;
  const key = row => [row.profile_id, row.activity_id, row.list_type].join(':');
  const client = createClient('https://saved.test', 'test-publishable-key', {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input), method = init.method;
      requests.push({ url, method, body: init.body && JSON.parse(init.body) });
      assert.equal(url.pathname, '/rest/v1/saved_activities');
      if (failure) return new Response(JSON.stringify(failure), { status: 403, headers: { 'Content-Type': 'application/json' } });
      const filters = Object.fromEntries(['profile_id', 'activity_id', 'list_type'].map(name => [name, url.searchParams.get(name)?.replace(/^eq\./, '')]));
      if (method === 'GET' && url.searchParams.get('select')?.startsWith('activity:activities!inner(')) {
        assert.equal(filters.list_type, 'favourite');
        assert.ok(filters.profile_id);
        assert.equal(url.searchParams.get('activity.status'), 'eq.published');
        assert.equal(url.searchParams.get('order'), 'created_at.desc,activity_id.asc');
        const matches = [...rows.values()].filter(row => row.profile_id === filters.profile_id && row.list_type === 'favourite' && activities.get(row.activity_id)?.status === 'published')
          .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || a.activity_id.localeCompare(b.activity_id));
        const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit'));
        assert.equal(limit, 100);
        return new Response(JSON.stringify(matches.slice(offset, offset + limit).map(row => ({ activity: activities.get(row.activity_id) }))), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (writeGate && (method === 'POST' || method === 'DELETE')) await writeGate;
      let data = [];
      if (method === 'POST') {
        const row = JSON.parse(init.body);
        assert.equal(url.searchParams.get('on_conflict'), 'profile_id,activity_id,list_type');
        rows.set(key(row), row); data = [{ activity_id: row.activity_id }];
      } else {
        assert.ok(Object.values(filters).every(Boolean), 'all three key filters are mandatory');
        if (rows.has(key(filters))) data = [{ activity_id: filters.activity_id }];
        if (method === 'DELETE') { rows.delete(key(filters)); return new Response(null, { status: 204 }); }
      }
      const single = new Headers(init.headers).get('Accept')?.includes('vnd.pgrst.object');
      return new Response(JSON.stringify(single ? data[0] : data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  client.auth.getSession = async () => ({ data: { session: member ? { user: { id: member }, access_token: 'local-fixture-token' } : null }, error: null });
  return { api: createActivitySavesApi(client), anotherApi: () => createActivitySavesApi(client), rows, activities, requests, key,
    delayWrite(promise) { writeGate = promise; },
    setMember(value) { member = value; }, fail(value) { failure = value; } };
}

test('real query builder round trip is idempotent and preserves other lists/members/activities', async () => {
  const f = postgrestFixture();
  const untouched = [
    { profile_id: 'member-a', activity_id: 'activity-a', list_type: 'try_later' },
    { profile_id: 'member-b', activity_id: 'activity-a', list_type: 'favourite' },
    { profile_id: 'member-a', activity_id: 'activity-b', list_type: 'favourite' },
  ];
  untouched.forEach(row => f.rows.set(f.key(row), row));
  assert.equal(await f.api.read('member-a', 'activity-a'), false);
  await f.api.write('member-a', 'activity-a', true);
  await f.api.write('member-a', 'activity-a', true);
  assert.equal(f.rows.size, 4);
  assert.equal(await f.api.read('member-a', 'activity-a'), true);
  await f.api.write('member-a', 'activity-a', false);
  await f.api.write('member-a', 'activity-a', false);
  assert.equal(await f.api.read('member-a', 'activity-a'), false);
  assert.deepEqual([...f.rows.values()], untouched);
});

test('expired/switched sessions fail before reading or mutating another member bookmark', async () => {
  const f = postgrestFixture();
  for (const member of [null, 'member-b']) {
    f.setMember(member);
    await assert.rejects(f.api.read('member-a', 'activity-a'), /session changed/);
    await assert.rejects(f.api.write('member-a', 'activity-a', true), /session changed/);
    await assert.rejects(f.api.write('member-a', 'activity-a', false), /session changed/);
  }
  assert.equal(f.requests.length, 0);
});

test('reopening during a pending save waits for its result before reading the database', async () => {
  const f = postgrestFixture(), gate = deferred();
  f.delayWrite(gate.promise);
  const saving = f.api.write('member-a', 'activity-a', true);
  let readFinished = false;
  const reading = f.anotherApi().read('member-a', 'activity-a').then(saved => { readFinished = true; return saved; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(readFinished, false);
  assert.equal(f.requests.filter(r => r.method === 'GET').length, 0);
  gate.resolve(); await saving;
  assert.equal(await reading, true);
});

test('a failed write does not prevent a reopened screen reconciling with the database', async () => {
  const f = postgrestFixture();
  f.fail({ code: '42501', message: 'permission denied' });
  await assert.rejects(f.api.write('member-a', 'activity-a', true));
  f.fail(null);
  assert.equal(await f.anotherApi().read('member-a', 'activity-a'), false);
});

test('genuine PostgREST read/write failures propagate, without automatic unrelated retries', async () => {
  const f = postgrestFixture(); f.fail({ code: '42501', message: 'permission denied' });
  await assert.rejects(f.api.read('member-a', 'activity-a'), { code: '42501' });
  await assert.rejects(f.api.write('member-a', 'activity-a', true), { code: '42501' });
  await assert.rejects(f.api.write('member-a', 'activity-a', false), { code: '42501' });
  assert.equal(f.requests.length, 3);
});

test('Saved query joins only own published favourites, with stable newest-first order across pages', async () => {
  const f = postgrestFixture();
  for (let i = 0; i < 105; i++) {
    const id = `TEST-${String(i).padStart(3, '0')}`;
    f.activities.set(id, { id, title: id, status: 'published' });
    const row = { profile_id: 'member-a', activity_id: id, list_type: 'favourite', created_at: i < 3 ? '2026-09-11' : '2026-09-10' };
    f.rows.set(f.key(row), row);
  }
  for (const [id, profile, list, status] of [
    ['OTHER', 'member-b', 'favourite', 'published'], ['LATER', 'member-a', 'try_later', 'published'],
    ['DRAFT', 'member-a', 'favourite', 'draft'], ['GONE', 'member-a', 'favourite', null],
  ]) {
    if (status) f.activities.set(id, { id, status });
    const row = { profile_id: profile, activity_id: id, list_type: list };
    f.rows.set(f.key(row), row);
  }
  const result = await f.api.list('member-a');
  assert.equal(result.length, 105);
  assert.deepEqual(result.slice(0, 4).map(a => a.id), ['TEST-000', 'TEST-001', 'TEST-002', 'TEST-003']);
  assert.equal(result.at(-1).id, 'TEST-104');
  assert.deepEqual(f.requests.map(r => r.url.searchParams.get('offset')), ['0', '100']);
});

test('Saved list waits for pending unsave when returning from activity detail', async () => {
  const f = postgrestFixture(), gate = deferred();
  f.activities.set('activity-a', { id: 'activity-a', status: 'published' });
  await f.api.write('member-a', 'activity-a', true);
  f.delayWrite(gate.promise);
  const unsaving = f.api.write('member-a', 'activity-a', false);
  let completed = false;
  const listing = f.anotherApi().list('member-a').then(rows => { completed = true; return rows; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  gate.resolve(); await unsaving;
  assert.deepEqual(await listing, []);
});

test('Saved list rejects missing or changed sessions and backend failures', async () => {
  const f = postgrestFixture();
  for (const member of [null, 'member-b']) {
    f.setMember(member);
    await assert.rejects(f.api.list('member-a'), /session changed/);
  }
  assert.equal(f.requests.length, 0);
  f.setMember('member-a'); f.fail({ code: '42501', message: 'permission denied' });
  await assert.rejects(f.api.list('member-a'), { code: '42501' });
  assert.equal(f.requests.length, 1);
});

test('Saved refresh replaces the list after unsaving and reveals 20 at a time', async () => {
  let rows = Array.from({ length: 45 }, (_, i) => ({ id: `TEST-${i}` }));
  const state = createSavedActivitiesController({ async list(profile) { assert.equal(profile, 'member-a'); return rows; } }, 'member-a');
  assert.equal(state.getSnapshot().activities, null);
  await state.refresh();
  assert.equal(state.getSnapshot().visibleCount, 20);
  state.showMore();
  assert.equal(state.getSnapshot().visibleCount, 40);
  rows = rows.slice(1); await state.refresh();
  assert.equal(state.getSnapshot().activities[0].id, 'TEST-1');
  assert.equal(state.getSnapshot().visibleCount, 20);
  rows = []; await state.refresh();
  assert.deepEqual(state.getSnapshot().activities, []);
  assert.equal(state.getSnapshot().error, null);
});

test('Saved errors remain distinct from empty state and retry recovers', async () => {
  let failure = true;
  const state = createSavedActivitiesController({ async list() { if (failure) throw new Error('JWT/database detail'); return []; } }, 'member-a');
  await state.refresh();
  assert.equal(state.getSnapshot().activities, null);
  assert.equal(state.getSnapshot().error, "We couldn't load your saved activities just now. Please try again.");
  failure = false; await state.refresh();
  assert.deepEqual(state.getSnapshot().activities, []);
  assert.equal(state.getSnapshot().error, null);
});

test('late Saved refreshes and previous-account controllers cannot leak stale results', async () => {
  const pending = deferred(); let calls = 0;
  const api = { async list(profile) { return profile === 'member-a' && ++calls === 1 ? pending.promise : []; } };
  const first = createSavedActivitiesController(api, 'member-a');
  const loading = first.refresh(); await first.refresh();
  const second = createSavedActivitiesController(api, 'member-b'); await second.refresh();
  pending.resolve([{ id: 'OLD' }]); await loading;
  assert.deepEqual(first.getSnapshot().activities, []);
  assert.deepEqual(second.getSnapshot().activities, []);
});

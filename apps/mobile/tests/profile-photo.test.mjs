import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createProfilePhotoApi } from '../src/services/profile-photo-api.ts';
import { PROFILE_PHOTO_MAX_SOURCE_BYTES, profilePhotoCrop, validateProfilePhotoCandidate } from '../src/services/profile-photo-model.ts';
import { PROFILE_IMAGE_MAX_BYTES } from '../src/lib/profile-images.ts';

const member = '40000000-0000-4000-8000-000000000001';

function fixture({ session = member, updateError = null, cleanupError = null } = {}) {
  const calls = [];
  const failures = [];
  let row = { id: member, display_name: 'Member Name', avatar_url: `profile-images/${member}/avatar-old.jpg`, bio: 'Hello' };
  const objects = new Set([`${member}/avatar-old.jpg`]);
  let signedRevision = 0;
  const storageBucket = {
    async upload(path, bytes, options) { calls.push(['upload', path, bytes.byteLength, options]); objects.add(path); return { data: { path }, error: null }; },
    async list(folder, options) {
      calls.push(['list', folder, options]);
      return { data: [...objects].filter(path => path.startsWith(`${folder}/`)).map(path => ({ id: path, name: path.slice(folder.length + 1) })), error: cleanupError };
    },
    async remove(paths) {
      calls.push(['remove', paths]);
      if (cleanupError) return { data: null, error: cleanupError };
      paths.forEach(path => objects.delete(path)); return { data: paths, error: null };
    },
    async createSignedUrls(paths) {
      signedRevision += 1;
      calls.push(['sign', paths]);
      return { data: paths.map(path => ({ path, signedUrl: `https://storage.test/${path}?v=${signedRevision}` })), error: null };
    },
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: session ? { user: { id: session } } : null }, error: null }) },
    storage: { from(bucket) { assert.equal(bucket, 'profile-images'); return storageBucket; } },
    from(table) {
      assert.equal(table, 'profiles');
      let values;
      const query = {
        update(next) { values = next; return query; }, eq(column, id) { assert.equal(column, 'id'); assert.equal(id, member); return query; },
        select() { return query; }, async single() {
          if (updateError) return { data: null, error: updateError };
          row = { ...row, ...values }; return { data: { ...row }, error: null };
        },
      };
      return query;
    },
  };
  return { api: createProfilePhotoApi(client, { key: () => 'test', reportCleanupError: cause => failures.push(cause) }), calls, failures, objects, row: () => row };
}

test('upload writes a bounded JPEG to the authenticated member folder, updates avatar_url and removes the previous object', async () => {
  const { api, calls, objects, row } = fixture();
  const saved = await api.upload(member, { bytes: new ArrayBuffer(100), contentType: 'image/jpeg' });
  const path = `${member}/avatar-test.jpg`;
  assert.deepEqual(calls[0], ['upload', path, 100, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false }]);
  assert.equal(row().avatar_url, `profile-images/${path}`);
  assert.deepEqual([...objects], [path]);
  assert.equal(saved.avatarReference, `profile-images/${path}`);
  assert.match(saved.imageUrl, /avatar-test[.]jpg[?]v=1$/);
});

test('remove clears the canonical reference, deletes member-owned objects and restores initials state', async () => {
  const { api, objects, row } = fixture();
  const saved = await api.remove(member);
  assert.equal(row().avatar_url, null); assert.equal(saved.avatarReference, null); assert.equal(saved.imageUrl, null);
  assert.equal(objects.size, 0);
});

test('changed or absent sessions cannot upload, remove, or target another member folder', async () => {
  for (const session of [null, '40000000-0000-4000-8000-000000000002']) {
    const { api, calls } = fixture({ session });
    await assert.rejects(() => api.upload(member, { bytes: new ArrayBuffer(100), contentType: 'image/jpeg' }), /session changed/);
    await assert.rejects(() => api.remove(member), /session changed/);
    assert.equal(calls.length, 0);
  }
});

test('invalid prepared files are rejected before Storage and a failed profile write removes the new upload', async () => {
  const invalid = fixture();
  await assert.rejects(() => invalid.api.upload(member, { bytes: new ArrayBuffer(PROFILE_IMAGE_MAX_BYTES + 1), contentType: 'image/jpeg' }), /upload limits/);
  assert.equal(invalid.calls.length, 0);
  const failed = fixture({ updateError: { message: 'database detail' } });
  await assert.rejects(() => failed.api.upload(member, { bytes: new ArrayBuffer(100), contentType: 'image/jpeg' }),
    cause => cause?.message === 'database detail');
  assert.ok(!failed.objects.has(`${member}/avatar-test.jpg`));
});

test('source validation accepts common photos, rejects non-images and bounds size/dimensions; crop remains centred and square', () => {
  assert.doesNotThrow(() => validateProfilePhotoCandidate({ type: 'image', mimeType: 'image/heic', fileSize: 5_000_000, width: 4032, height: 3024 }));
  for (const candidate of [
    { type: 'video', mimeType: 'video/mp4', width: 100, height: 100 },
    { type: 'image', mimeType: 'image/gif', width: 100, height: 100 },
    { type: 'image', mimeType: 'image/jpeg', width: 0, height: 100 },
    { type: 'image', mimeType: 'image/jpeg', width: 100, height: 100, fileSize: PROFILE_PHOTO_MAX_SOURCE_BYTES + 1 },
  ]) assert.throws(() => validateProfilePhotoCandidate(candidate));
  assert.deepEqual(profilePhotoCrop(4032, 3024), { originX: 504, originY: 0, width: 3024, height: 3024 });
});

test('cleanup errors remain diagnostic without falsely undoing a confirmed canonical update', async () => {
  const cleanupError = { message: 'temporary storage cleanup detail' };
  const { api, failures, row } = fixture({ cleanupError });
  const saved = await api.upload(member, { bytes: new ArrayBuffer(100), contentType: 'image/jpeg' });
  assert.equal(saved.avatarReference, row().avatar_url); assert.deepEqual(failures, [cleanupError]);
});

test('Edit profile exposes add/change/remove with safe copy and an on-demand library-only picker', async () => {
  const [component, picker, appConfig] = await Promise.all([
    readFile(new URL('../src/features/account/account-profile-photo.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/profile-photo-picker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app.json', import.meta.url), 'utf8'),
  ]);
  for (const wording of ['Add profile photo', 'Change profile photo', 'Remove profile photo', 'Your initials will appear instead', 'We couldn’t update your profile photo. Please try again.']) {
    assert.match(component, new RegExp(wording.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(picker, /launchImageLibraryAsync/); assert.doesNotMatch(picker, /launchCameraAsync|requestCameraPermissionsAsync/);
  assert.match(picker, /allowsEditing:\s*true/); assert.match(picker, /aspect:\s*\[1,\s*1\]/);
  assert.match(appConfig, /"cameraPermission": false/); assert.match(appConfig, /"microphonePermission": false/);
});

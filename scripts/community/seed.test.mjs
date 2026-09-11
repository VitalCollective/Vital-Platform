import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { importStarterBundle, starterProfileId, validateSeedBundle } from './seed.mjs';
import { starterFixture } from './test-fixtures.mjs';

test('validates 30 exact approved public names without gender metadata; preserves prose and historical dates', () => {
  const bundle = starterFixture(); const before = JSON.stringify(bundle);
  const report = validateSeedBundle(bundle);
  assert.equal(report.valid, true); assert.equal(report.counts.profiles, 30);
  assert.equal(JSON.stringify(bundle), before);
});
test('rejects unapproved editorial data, duplicate identities and private profile fields', () => {
  for (const mutate of [b => b.schema_version = 1, b => b.schema_version = 2, b => b.editorial_approved = false, b => b.profiles[0].gender = 'x', b => b.profiles[0].auth_user_id = 'forged', b => b.profiles[1].display_name = b.profiles[0].display_name, b => b.profiles[1].key = b.profiles[0].key]) {
    const bundle = starterFixture(); mutate(bundle); assert.equal(validateSeedBundle(bundle).valid, false);
  }
});
test('rejects missing links, deep reply trees, future timestamps and duplicate reactions', () => {
  for (const mutate of [b => b.replies[0].post_key = 'absent', b => b.replies[0].parent_key = b.replies[0].key, b => b.posts[0].created_at = '2999-01-01T00:00:00Z', b => b.reactions.push({ ...b.reactions[0], key: 'duplicate' })]) {
    const bundle = starterFixture(); mutate(bundle); assert.equal(validateSeedBundle(bundle).valid, false);
  }
});
test('execute requires verified database counts rather than attempted counts', async () => {
  const bundle = starterFixture(); bundle.batch_key = 'reviewed-bundle';
  const client = { rpc: async () => ({ data: { verified: true, image_references_verified:true, identity_mode:'non_login_profiles', counts: { profiles: 30, posts: 0, replies: 1, reactions: 1 } }, error: null }) };
  await assert.rejects(importStarterBundle(client, bundle), /verification failed/);
});

test('execute uses only public content queries/RPC and verifies non-login identity mode', async () => {
  const bundle = starterFixture(); bundle.batch_key = 'reviewed-bundle';
  const counts = validateSeedBundle(bundle).counts;
  const client = {
    get auth(){throw new Error('Auth APIs must never be used');},
    rpc: async (name,{payload}) => {
      assert.equal(name,'import_community_starters'); assert.equal(payload.schema_version,3);
      return {data:{verified:true,image_references_verified:true,identity_mode:'non_login_profiles',counts},error:null};
    },
  };
  assert.equal((await importStarterBundle(client,bundle)).identity_mode,'non_login_profiles');
  await assert.rejects(importStarterBundle({rpc:async()=>({data:{verified:true,counts},error:null})},bundle),/identity architecture/);
});

test('optional owned image paths validate; absent/null images retain initials and unsafe references fail', () => {
  const bundle=starterFixture(); const profile=bundle.profiles[0];
  const prefix=starterProfileId(bundle.batch_key,profile.key);
  for (const path of [undefined,null,`${prefix}/portrait-v1.webp`,`${prefix}/avatar.png`]) {
    profile.avatar_path=path; assert.equal(validateSeedBundle(bundle).valid,true);
  }
  for (const path of ['',`https://example.com/${prefix}/face.jpg`,`C:\\portrait.jpg`,`${prefix}/../face.jpg`,`${prefix}/face.svg`,`${prefix}/face.gif`,`${prefix}/face.jpg?token=x`,'00000000-0000-0000-0000-000000000000/face.jpg',{}]) {
    profile.avatar_path=path; assert.equal(validateSeedBundle(bundle).valid,false,JSON.stringify(path));
  }
});

test('image import verifies Storage metadata and exact source payload without uploading or Auth calls', async () => {
  const bundle=starterFixture(); bundle.batch_key='reviewed-images';
  bundle.profiles[0].avatar_path=`${starterProfileId(bundle.batch_key,bundle.profiles[0].key)}/portrait-v1.webp`;
  let calls=0;
  const client={
    get auth(){throw new Error('No Auth API');},
    storage:{from(bucket){assert.equal(bucket,'profile-images');return {info:async path=>{assert.equal(path,bundle.profiles[0].avatar_path);return {data:{contentType:'image/webp',size:12345},error:null};}};}},
    rpc:async(name,{payload})=>{calls++;assert.deepEqual(payload,bundle);return {data:{verified:true,image_references_verified:true,identity_mode:'non_login_profiles',counts:validateSeedBundle(bundle).counts},error:null};},
  };
  await importStarterBundle(client,bundle); assert.equal(calls,1);
  for (const data of [null,{contentType:'image/svg+xml',size:10},{contentType:'image/webp',size:524289},{contentType:'image/webp',size:0}]) {
    client.storage.from=()=>({info:async()=>({data,error:null})});
    await assert.rejects(importStarterBundle(client,bundle),/No import attempted/);
  }
  assert.equal(calls,1);
});
test('execute refuses fixture batches before touching a client', async () => {
  await assert.rejects(importStarterBundle({}, starterFixture()), /Test fixtures cannot be imported/);
});

test('an uncertain import response does not falsely claim rollback or expose backend detail', async () => {
  const bundle = starterFixture(); bundle.batch_key = 'reviewed-bundle';
  const client = { rpc: async () => ({ data: null, error: { message: 'PRIVATE backend detail' } }) };
  await assert.rejects(importStarterBundle(client, bundle), error => {
    assert.match(error.message, /not confirmed/);
    assert.match(error.message, /identical-bundle replay/);
    assert.doesNotMatch(error.message, /PRIVATE|did not complete/);
    return true;
  });
});

test('the real CLI dry-run succeeds without credentials or database access', async () => {
  const directory = await mkdtemp(join(tmpdir(),'vital-community-test-'));
  try {
    const input = join(directory,'explicit-test-fixture.json');
    await writeFile(input,JSON.stringify(starterFixture()));
    const env = {...process.env};
    delete env.SUPABASE_URL; delete env.SUPABASE_SERVICE_ROLE_KEY;
    const result = spawnSync(process.execPath,[fileURLToPath(new URL('./seed.mjs',import.meta.url)),'--input',input,'--dry-run'],{env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/"profiles": 30/);
    for (const group of ['posts','replies','reactions']) assert.match(result.stdout,new RegExp(`"${group}": 1`));
    assert.match(result.stdout,/Dry-run complete. No database or Auth operation performed/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

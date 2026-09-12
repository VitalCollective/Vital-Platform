// Focused, in-memory PostgreSQL check of the already-existing save policies.
// No linked database connection, test users or writes outside PGlite.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

const { PGlite } = await import(process.env.PGLITE_MODULE
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE)).href : '@electric-sql/pglite');
const db = new PGlite();
after(() => db.close());
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
  grant usage on schema auth, public to authenticated, service_role, anon;
  grant execute on function auth.uid() to authenticated, service_role, anon;
  alter default privileges in schema public grant all on tables to authenticated, service_role;
`);
for (const name of ['20260823204450_initial_vital_schema.sql', '20260826085303_community_and_moderation.sql', '20260910120000_community_v1.sql']) {
  await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
}
const member = '30000000-0000-4000-8000-000000000001';
const other = '30000000-0000-4000-8000-000000000002';
const seed = '30000000-0000-4000-8000-000000000003';
await db.query('insert into auth.users(id) values ($1),($2)', [member, other]);
await db.query("insert into public.profiles(id,display_name,is_seeded,seed_key) values ($1,'LOCAL TEST',true,'saved-rls-fixture')", [seed]);
const sections = ['Vital Mums', 'Vital Kids', 'Vital Together', 'Vital Life', 'Vital Food'];
for (const [i, section] of sections.entries()) {
  await db.query("insert into public.activities(id,type,section,title,status) values ($1,'Activity',$2,'LOCAL TEST','published')", [`TEST-${i}`, section]);
}
async function as(id, role = 'authenticated') {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub', '${id ?? ''}', false);`);
}

test('genuine member can save all five sections and upsert without duplicates', async () => {
  await as(member);
  for (let i = 0; i < 5; i++) {
    for (let repeat = 0; repeat < 2; repeat++) await db.query(`
      insert into public.saved_activities(profile_id,activity_id,list_type) values ($1,$2,'favourite')
      on conflict (profile_id,activity_id,list_type) do update set list_type=excluded.list_type
      returning activity_id`, [member, `TEST-${i}`]);
  }
  assert.equal((await db.query('select * from public.saved_activities')).rows.length, 5);
});

test('other member cannot read, overwrite or delete another member bookmarks', async () => {
  await as(other);
  assert.equal((await db.query('select * from public.saved_activities')).rows.length, 0);
  await assert.rejects(db.query("insert into public.saved_activities(profile_id,activity_id,list_type) values ($1,'TEST-0','favourite') on conflict (profile_id,activity_id,list_type) do update set list_type=excluded.list_type", [member]));
  assert.equal((await db.query('delete from public.saved_activities where profile_id=$1 returning *', [member])).rows.length, 0);
});

test('seed and anonymous callers cannot participate in activity saving', async () => {
  for (const [id, role] of [[seed, 'authenticated'], [null, 'anon']]) {
    await as(id, role);
    await assert.rejects(db.query("insert into public.saved_activities(profile_id,activity_id,list_type) values ($1,'TEST-0','favourite')", [id ?? member]));
  }
});

test('unsaving affects only the requested favourite, preserving Try Later and other activities', async () => {
  await as(member);
  await db.query("insert into public.saved_activities(profile_id,activity_id,list_type) values ($1,'TEST-0','try_later')", [member]);
  await db.query("delete from public.saved_activities where profile_id=$1 and activity_id='TEST-0' and list_type='favourite'", [member]);
  const rows = (await db.query('select activity_id,list_type from public.saved_activities order by activity_id')).rows;
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], { activity_id: 'TEST-0', list_type: 'try_later' });
});

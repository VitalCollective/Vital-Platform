import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';

// Real PostgreSQL/RLS in memory only; no linked project or member data.
const { PGlite } = await import(process.env.PGLITE_MODULE
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE)).href : '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key,raw_user_meta_data jsonb,raw_app_meta_data jsonb,
    aud text,role text,banned_until timestamptz,created_at timestamptz,updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  grant usage on schema auth,public to authenticated,anon,service_role;
  grant execute on function auth.uid() to authenticated,anon,service_role;
  alter default privileges in schema public grant all on tables to authenticated,service_role;`);
for (const name of [
  '20260823204450_initial_vital_schema.sql',
  '20260826085303_community_and_moderation.sql',
  '20260910120000_community_v1.sql',
  '20260917180000_private_member_submissions.sql',
]) await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));

const id = n => `91000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1), other = id(2), seed = id(3);
async function root() { await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);"); }
async function as(subject, role = 'authenticated') { await db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${subject ?? ''}',false);`); }
async function rows(sql, args = []) { return (await db.query(sql, args)).rows; }
await root();
for (const [profile, name] of [[owner, 'TEST owner'], [other, 'TEST other']]) {
  await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [profile, { display_name: name }]);
}
await db.query("insert into public.profiles(id,display_name,is_seeded,seed_key) values($1,'TEST seed',true,'submission-test:seed')", [seed]);

test('genuine authenticated members can insert private feedback with server-derived identity', async () => {
  await as(owner);
  await db.query("insert into public.member_submissions(submission_type,feedback_kind,subject,message) values('feedback','bug','Loading','Screen stalled')");
  await root();
  const saved = (await rows('select profile_id,submission_type,feedback_kind,subject,message from public.member_submissions'))[0];
  assert.deepEqual(saved, { profile_id: owner, submission_type: 'feedback', feedback_kind: 'bug', subject: 'Loading', message: 'Screen stalled' });
});

test('members cannot read submissions or select another identity for insertion', async () => {
  await as(owner);
  await assert.rejects(db.query('select * from public.member_submissions'), /permission denied/i);
  await assert.rejects(db.query("insert into public.member_submissions(profile_id,submission_type,feedback_kind,message) values($1,'feedback','other','Spoof')", [other]), /row-level security/i);
  await as(seed);
  await assert.rejects(db.query("insert into public.member_submissions(submission_type,feedback_kind,message) values('feedback','other','Seed')"), /row-level security/i);
  await as(null, 'anon');
  await assert.rejects(db.query("insert into public.member_submissions(submission_type,feedback_kind,message) values('feedback','other','Anon')"), /permission denied/i);
});

test('conditional constraints accept complete activities and reject malformed shapes', async () => {
  await as(owner);
  await db.query(`insert into public.member_submissions
    (submission_type,activity_name,vital_section,suitable_age,description,equipment_notes,rights_confirmed)
    values('activity','Colour walk','Vital Kids','5–8','Spot five colours.','None',true)`);
  for (const sql of [
    "insert into public.member_submissions(submission_type,feedback_kind,message) values('feedback','bug','')",
    "insert into public.member_submissions(submission_type,activity_name,description,rights_confirmed) values('activity','Idea','Instructions',false)",
    "insert into public.member_submissions(submission_type,feedback_kind,message,activity_name) values('feedback','comment','Hello','Mixed')",
  ]) await assert.rejects(db.query(sql), /check constraint/i);
});

test('account/profile deletion cascades private submissions', async () => {
  await root();
  assert.equal(Number((await rows('select count(*) n from public.member_submissions where profile_id=$1', [owner]))[0].n), 2);
  await db.query('delete from public.profiles where id=$1', [owner]);
  assert.equal(Number((await rows('select count(*) n from public.member_submissions where profile_id=$1', [owner]))[0].n), 0);
});

test.after(async () => { await db.close(); });

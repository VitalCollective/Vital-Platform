import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';

// Real PostgreSQL/RLS in memory only; no linked project or personal data.
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
  '20260914120000_family_member_editing.sql',
]) await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));

const id = n => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1), other = id(2), seed = id(3);
async function root() { await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);"); }
async function as(subject) { await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${subject}',false);`); }
async function rows(sql, args = []) { return (await db.query(sql, args)).rows; }
await root();
for (const [profile, name] of [[owner, 'TEST owner'], [other, 'TEST other']]) {
  await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [profile, { display_name: name }]);
}
await db.query("insert into public.profiles(id,display_name,is_seeded,seed_key) values($1,'TEST seed',true,'family-test:seed')", [seed]);

let ownerFamily, ownerMember, otherFamily, otherMember;
test('owner can add privacy-minimised members and age confirmation is server-maintained', async () => {
  await as(owner);
  ownerFamily = (await rows("insert into public.families(owner_id) values(auth.uid()) returning id"))[0].id;
  const inserted = (await rows(`insert into public.family_members(family_id,display_name,relationship,age_years,age_confirmed_at)
    values($1,null,'Child',0,'2000-01-01') returning id,family_id,display_name,relationship,age_years,age_confirmed_at`, [ownerFamily]))[0];
  ownerMember = inserted.id;
  assert.equal(inserted.display_name, null); assert.equal(inserted.relationship, 'Child'); assert.equal(inserted.age_years, 0);
  assert.notEqual(new Date(inserted.age_confirmed_at).getUTCFullYear(), 2000);
  const unchanged = (await rows("update public.family_members set relationship='Other',age_confirmed_at='2000-01-01' where id=$1 returning age_confirmed_at", [ownerMember]))[0];
  assert.equal(new Date(unchanged.age_confirmed_at).getTime(), new Date(inserted.age_confirmed_at).getTime());
  const changed = (await rows("update public.family_members set age_years=1,age_confirmed_at='2000-01-01' where id=$1 returning age_years,age_confirmed_at", [ownerMember]))[0];
  assert.equal(changed.age_years, 1); assert.notEqual(new Date(changed.age_confirmed_at).getUTCFullYear(), 2000);
});

test('database constraints reject extra family containers and invalid member values', async () => {
  await as(owner);
  await assert.rejects(db.query("insert into public.families(owner_id) values(auth.uid())"), /unique|duplicate/i);
  for (const [name, relationship, age] of [['', 'Child', 4], ['Sam', 'Sibling', 4], ['Sam', 'Child', null], ['Sam', 'Child', 121]]) {
    await assert.rejects(db.query('insert into public.family_members(family_id,display_name,relationship,age_years) values($1,$2,$3,$4)', [ownerFamily, name, relationship, age]));
  }
});

test('RLS exposes and mutates family members only through their authenticated owner', async () => {
  await as(other);
  assert.equal((await rows('select id from public.family_members where id=$1', [ownerMember])).length, 0);
  assert.equal((await rows("update public.family_members set age_years=9 where id=$1 returning id", [ownerMember])).length, 0);
  assert.equal((await rows('delete from public.family_members where id=$1 returning id', [ownerMember])).length, 0);
  await assert.rejects(db.query("insert into public.family_members(family_id,relationship,age_years) values($1,'Child',9)", [ownerFamily]), /row-level security/i);
  otherFamily = (await rows("insert into public.families(owner_id) values(auth.uid()) returning id"))[0].id;
  otherMember = (await rows("insert into public.family_members(family_id,display_name,relationship,age_years) values($1,'TEST other child','Child',9) returning id", [otherFamily]))[0].id;
  await as(seed);
  await assert.rejects(db.query("insert into public.families(owner_id) values(auth.uid())"), /row-level security/i);
});

test('confirmed removal deletes only the selected owned family-member row', async () => {
  await as(owner);
  assert.equal((await rows('delete from public.family_members where id=$1 returning id', [ownerMember])).length, 1);
  await root();
  assert.equal((await rows('select id from public.family_members where id=$1', [ownerMember])).length, 0);
  assert.equal((await rows('select id from public.family_members where id=$1', [otherMember])).length, 1);
});

test.after(async () => { await db.close(); });

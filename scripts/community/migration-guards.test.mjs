import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

// Isolated PostgreSQL only. No Supabase client, credentials or network.
const modulePath = process.env.PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const core = await readFile(new URL('../../supabase/migrations/20260823204450_initial_vital_schema.sql', import.meta.url), 'utf8');
const community = await readFile(new URL('../../supabase/migrations/20260826085303_community_and_moderation.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../supabase/migrations/20260910120000_community_v1.sql', import.meta.url), 'utf8');
const member = '30000000-0000-4000-8000-000000000001';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth, public to authenticated, service_role, anon;
    alter default privileges in schema public grant all on tables to authenticated, service_role;
  `);
  await db.exec(core); await db.exec(community);
  await db.query('insert into auth.users(id,raw_user_meta_data) values ($1,$2)',[member,{display_name:'TEST migration guard'}]);
  return db;
}

async function rejectsSafely(change, expected, sql = migration) {
  const db = await fixture();
  try {
    await db.exec(change);
    const before = (await db.query('select * from public.profiles')).rows;
    const rules = (await db.query('select * from public.community_rules order by version')).rows;
    await assert.rejects(db.exec(sql),expected);
    await db.exec('rollback');
    assert.deepEqual((await db.query('select * from public.profiles')).rows,before);
    assert.deepEqual((await db.query('select * from public.community_rules order by version')).rows,rules);
    assert.equal((await db.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='auth_user_id'")).rows[0].n,0);
    assert.equal((await db.query("select to_regclass('public.community_seed_imports') as ledger")).rows[0].ledger,null);
  } finally { await db.close(); }
}

test('migration refuses missing, altered, non-current or additional rules history', async () => {
  for (const change of [
    'delete from public.community_rules',
    "update public.community_rules set content_markdown='Unexpected wording'",
    'update public.community_rules set is_current=false,retired_at=now()',
    "insert into public.community_rules(version,title,content_markdown,is_current) values (99,'Unexpected','Unexpected',false)",
  ]) await rejectsSafely(`alter table public.community_rules disable trigger user; ${change}; alter table public.community_rules enable trigger user;`,/Unexpected Community rules state/);
});

test('migration refuses missing, non-cascading or unvalidated original Auth FKs', async () => {
  for (const replacement of [
    '',
    'alter table public.profiles add constraint profiles_id_fkey foreign key(id) references auth.users(id)',
    'alter table public.profiles add constraint profiles_id_fkey foreign key(id) references auth.users(id) on delete cascade not valid',
  ]) await rejectsSafely(`alter table public.profiles drop constraint profiles_id_fkey; ${replacement}`,/Unexpected profile\/Auth FK/);
});

test('migration refuses orphan profiles and legacy Auth seed markers', async () => {
  // Deliberately corrupt only this isolated fixture to exercise the orphan check.
  await rejectsSafely(`set session_replication_role=replica; insert into public.profiles(id) values ('30000000-0000-4000-8000-000000000099'); set session_replication_role=origin;`,/Profile\/Auth integrity or legacy provenance/);
  for (const metadata of [{is_seeded:true},{seed_key:'historical-test'}]) {
    await rejectsSafely(`update auth.users set raw_app_meta_data='${JSON.stringify(metadata)}'::jsonb`,/Profile\/Auth integrity or legacy provenance/);
  }
});

test('migration refuses unreviewed existing Community contributions instead of defaulting them to genuine', async () => {
  await rejectsSafely(`insert into public.community_posts(room_id,author_id,title,body) values ('10000000-0000-4000-8000-000000000001','${member}','TEST legacy','TEST legacy');`,/Legacy Community contributions require an explicit provenance audit/);
});

test('migration refuses a member-subject connection', async () => {
  await rejectsSafely(`select set_config('request.jwt.claim.sub','${member}',false)`,/administrative migration connection/);
});

test('a late migration failure rolls back profile backfill, new schema and rules retirement together', async () => {
  // Collision occurs after the new FK, actor policies and rules publication.
  await rejectsSafely('create function public.community_access() returns jsonb language sql as \'select null::jsonb\';',/already exists/);
});

test('the pending migration contains exactly the eight approved rules and no managed Auth writes', () => {
  const rules = migration.split('$rules$')[1].trim().split('\n').map(line=>line.trim());
  assert.deepEqual(rules,[
    '1. Be kind. Different families find different things useful. Disagreement is welcome; judgemental parenting, bullying, hostility, harassment, hate, threats and abuse are not.',
    '2. Keep children safe. Do not sexualise children or share identifying or sensitive information about them.',
    "3. Protect privacy. Do not share someone else's private information without permission.",
    '4. Keep this a family-appropriate space. No sexual, violent or exploitative material.',
    '5. No advertisements, promotional posts, affiliate spam, repeated self-promotion or commercial solicitation. Honest conversation about something you used is welcome; sales pitches, referral codes and business promotion are not.',
    '6. Do not spam, scam, impersonate others or deliberately spread dangerous misinformation. Personal experience is not a substitute for professional health, wellbeing or safety advice.',
    '7. Report concerns to the Vital team rather than escalating conflict. You can also block another member.',
    '8. Share what worked, ask when you are stuck, and leave room for ordinary family life. Ideas, not homework.',
  ]);
  assert.doesNotMatch(migration,/\b(?:insert\s+into|update|delete\s+from|alter\s+table|truncate(?:\s+table)?)\s+auth\./i);
});

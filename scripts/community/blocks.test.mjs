import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

// Real PostgreSQL/RLS in memory only. No Supabase credentials or network.
const modulePath = process.env.PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, raw_user_meta_data jsonb, raw_app_meta_data jsonb,
    aud text, role text, banned_until timestamptz, created_at timestamptz, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
  grant usage on schema auth, public to authenticated, service_role, anon;
  grant execute on function auth.uid() to authenticated, service_role, anon;
  alter default privileges in schema public grant all on tables to authenticated, service_role;
`);
for (const name of ['20260823204450_initial_vital_schema.sql', '20260826085303_community_and_moderation.sql']) {
  await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
}

const uuid = n => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const memberA=uuid(1),memberB=uuid(2),moderator=uuid(3),seed=uuid(4);
const postA=uuid(101),postB=uuid(102),replyB=uuid(103),parentA=uuid(104);
const room='10000000-0000-4000-8000-000000000001';
async function as(id, role='authenticated') { await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id ?? ''}',false);`); }
async function root() { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);"); }
async function count(sql,args=[]) { return (await db.query(sql,args)).rows.length; }
async function one(sql,args=[]) { return (await db.query(sql,args)).rows[0]; }

await root();
for (const [id,name] of [[memberA,'Member A'],[memberB,'Member B'],[moderator,'Member Moderator']]) {
  await db.query('insert into auth.users(id,raw_user_meta_data) values ($1,$2)',[id,{display_name:name}]);
}
await db.exec(await readFile(new URL('../../supabase/migrations/20260910120000_community_v1.sql', import.meta.url),'utf8'));
const before = {};
for (const table of ['profiles','community_posts','community_comments','community_post_reactions','community_comment_reactions']) {
  before[table]=(await one(`select count(*)::int as n from public.${table}`)).n;
}
const migration = await readFile(new URL('../../supabase/migrations/20260913120000_complete_community_member_blocking.sql', import.meta.url),'utf8');
await db.exec(migration);
const after = {};
for (const table of Object.keys(before)) after[table]=(await one(`select count(*)::int as n from public.${table}`)).n;
await db.query("insert into public.profiles(id,display_name,is_seeded,seed_key) values ($1,'Starter profile',true,'block-test:starter')",[seed]);
await db.query("insert into public.admin_roles(profile_id,role) values ($1,'moderator')",[moderator]);
await db.query('insert into public.community_rule_acceptances(profile_id,rules_version) select id,2 from public.profiles where not is_seeded');
for (const [id,author,title,body] of [[postA,memberA,'Member A post','Visible words from A'],[postB,memberB,'Member B post','Searchable papaya from B']]) {
  await db.query('insert into public.community_posts(id,room_id,author_id,title,body) values ($1,$2,$3,$4,$5)',[id,room,author,title,body]);
}
await db.query("insert into public.community_comments(id,post_id,author_id,body) values ($1,$2,$3,'Searchable kumquat reply from B')",[replyB,postA,memberB]);
await db.query("insert into public.community_comments(id,post_id,author_id,body) values ($1,$2,$3,'Parent comment from A')",[parentA,postB,memberA]);
await db.query("insert into public.community_post_reactions(post_id,profile_id,reaction_type) values ($1,$2,'helpful'),($3,$4,'helpful')",[postB,memberA,postA,memberB]);

test('migration is narrow, creates no data and never writes Auth', async()=>{
  await root();
  assert.deepEqual(after,before);
  assert.doesNotMatch(migration,/\b(?:insert\s+into|update|delete\s+from|alter\s+table|truncate(?:\s+table)?)\s+auth\./i);
  assert.match(migration,/community_blocks|community_blocked_members|community_profile_block_visibility/);
  const cascades=(await db.query("select confdeltype from pg_constraint where conrelid='public.community_blocks'::regclass and contype='f'")).rows;
  assert.deepEqual(cascades.map(row=>row.confdeltype).sort(),['c','c']);
});

test('members can create only their own genuine, non-self block direction',async()=>{
  await as(memberA);
  await assert.rejects(db.query('insert into public.community_blocks(blocker_id,blocked_profile_id) values ($1,$1)',[memberA]));
  await assert.rejects(db.query('insert into public.community_blocks(blocker_id,blocked_profile_id) values ($1,$2)',[memberB,memberA]));
  await assert.rejects(db.query('insert into public.community_blocks(blocker_id,blocked_profile_id) values ($1,$2)',[memberA,seed]));
  await db.query('insert into public.community_blocks(blocker_id,blocked_profile_id) values ($1,$2)',[memberA,memberB]);
  assert.equal(await count('select * from public.community_blocks'),1);
  await as(memberB);
  assert.equal(await count('select * from public.community_blocks'),0,'incoming blocks remain private');
});

test('a block mutually hides profiles, posts, replies and Community search results',async()=>{
  for(const [viewer,hiddenProfile,hiddenPost,hiddenSearchTerm] of [[memberA,memberB,postB,'papaya'],[memberB,memberA,postA,'words']]) {
    await as(viewer);
    assert.equal(await count('select id from public.profiles where id=$1',[hiddenProfile]),0);
    assert.equal(await count('select id from public.community_posts where id=$1',[hiddenPost]),0);
    assert.equal((await one('select public.search_community_posts($1) as page',[hiddenSearchTerm])).page.items.length,0);
  }
  await as(memberA);
  assert.equal((await one('select public.community_reply_page($1) as page',[postA])).page.items.some(item=>item.id===replyB),false);
  assert.equal((await one("select public.search_community_posts('kumquat') as page")).page.items.length,0);
});

test('blocked pairs cannot add replies or Helpful reactions, but can delete pre-existing own reactions',async()=>{
  await as(memberA);
  await assert.rejects(db.query("insert into public.community_comments(post_id,author_id,body) values ($1,auth.uid(),'blocked reply')",[postB]));
  await db.query('delete from public.community_post_reactions where post_id=$1 and profile_id=auth.uid()',[postB]);
  await assert.rejects(db.query("insert into public.community_post_reactions(post_id,profile_id,reaction_type) values ($1,auth.uid(),'helpful')",[postB]));
  await as(memberB);
  await assert.rejects(db.query("insert into public.community_comments(post_id,author_id,body) values ($1,auth.uid(),'blocked reply')",[postA]));
  await assert.rejects(db.query("insert into public.community_comment_reactions(comment_id,profile_id,reaction_type) values ($1,auth.uid(),'helpful')",[parentA]));
  await db.query('delete from public.community_post_reactions where post_id=$1 and profile_id=auth.uid()',[postA]);
  await root();
  assert.equal(await count('select * from public.community_post_reactions where profile_id in ($1,$2)',[memberA,memberB]),0);
});

test('moderation visibility and authorised moderation writes survive blocks, but participation does not bypass them',async()=>{
  await as(memberA); await db.query('insert into public.community_blocks(blocker_id,blocked_profile_id) values ($1,$2)',[memberA,moderator]);
  await as(moderator);
  assert.equal(await count('select id from public.profiles where id=$1',[memberA]),1);
  assert.equal(await count('select id from public.community_posts where id=$1',[postA]),1);
  await db.query("update public.community_posts set locked=true where id=$1",[postA]);
  await assert.rejects(db.query("insert into public.community_comments(post_id,author_id,body) values ($1,auth.uid(),'blocked moderator participation')",[postA]));
  await assert.rejects(db.query("insert into public.community_comments(post_id,author_id,parent_comment_id,body) values ($1,auth.uid(),$2,'blocked parent reply')",[postB,parentA]));
  await assert.rejects(db.query("insert into public.community_post_reactions(post_id,profile_id,reaction_type) values ($1,auth.uid(),'helpful')",[postA]));
  await db.query("update public.community_posts set locked=false where id=$1",[postA]);
});

test('only outgoing blocks are listed, unblock restores visibility/interactions, and profile deletion cascades relationships',async()=>{
  await as(memberA);
  const blocked=(await db.query('select * from public.community_blocked_members()')).rows;
  assert.deepEqual(blocked.map(item=>item.display_name).sort(),['Member B','Member Moderator']);
  assert.ok(blocked.every(item=>!Object.hasOwn(item,'bio')));
  await db.query('delete from public.community_blocks where blocker_id=auth.uid() and blocked_profile_id=$1',[memberB]);
  assert.equal(await count('select id from public.profiles where id=$1',[memberB]),1);
  assert.equal(await count('select id from public.community_posts where id=$1',[postB]),1);
  await db.query("insert into public.community_comments(post_id,author_id,body) values ($1,auth.uid(),'reply after unblock')",[postB]);
  await db.query("insert into public.community_post_reactions(post_id,profile_id,reaction_type) values ($1,auth.uid(),'helpful')",[postB]);
  await db.query('insert into public.community_blocks(blocker_id,blocked_profile_id) values ($1,$2)',[memberA,memberB]);
  await root(); await db.query('delete from auth.users where id=$1',[memberB]);
  assert.equal(await count('select * from public.community_blocks where blocker_id=$1 or blocked_profile_id=$1',[memberB]),0);
  assert.equal(await count('select * from public.community_blocks where blocker_id=$1 and blocked_profile_id=$2',[memberA,moderator]),1);
});

test.after(async()=>{await db.close();});

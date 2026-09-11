import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { starterFixture as currentStarterFixture } from './test-fixtures.mjs';
// Keep regression coverage of the already-applied V2 importer independently.
function starterFixture() { return { ...currentStarterFixture(), schema_version: 2 }; }

// PGlite runs real PostgreSQL/RLS in memory. Its module may live in a separate
// validation runtime; it is deliberately not a mobile/app dependency.
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
const uuid = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const member = uuid(1), other = uuid(2), moderator = uuid(3), admin = uuid(4), owner = uuid(5), peerAdmin = uuid(6), peerMod = uuid(7), unaccepted = uuid(8);
const room = '10000000-0000-4000-8000-000000000001';
const postId = uuid(100), replyId = uuid(101);
async function as(id, role = 'authenticated') {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub', '${id ?? ''}', false);`);
}
async function root() { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
async function value(sql, args) { return (await db.query(sql, args)).rows[0]; }
await root();
for (let i = 1; i <= 8; i++) await db.query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)', [uuid(i), { display_name: `TEST member ${i}` }]);
const oldProfiles = (await db.query('select id,display_name,created_at,updated_at from public.profiles order by id')).rows;
await db.query('insert into public.community_rule_acceptances(profile_id,rules_version) values ($1,1)',[member]);
const migration = await readFile(new URL('../../supabase/migrations/20260910120000_community_v1.sql', import.meta.url), 'utf8');
await db.exec(migration);
await as(member);
const acceptanceAfterMigration = (await value('select public.has_accepted_current_community_rules() as accepted')).accepted;
await root();
await db.exec(`insert into public.admin_roles(profile_id,role) values ('${moderator}','moderator'),('${admin}','admin'),('${owner}','owner'),('${peerAdmin}','admin'),('${peerMod}','moderator');
  insert into public.community_rule_acceptances(profile_id,rules_version)
    select id, (select version from public.community_rules where is_current) from public.profiles where id <> '${unaccepted}';
  insert into public.activities(id,type,section,title,status) values ('TEST-ACTIVITY','Activity','Vital Kids','Linked constellation adventure','published');
`);

test('new migration executes and existing rules history is retained', async () => {
  await root(); const rows = (await db.query('select version,is_current from public.community_rules order by version')).rows;
  assert.deepEqual(rows, [{ version: 1, is_current: false }, { version: 2, is_current: true }]);
  assert.equal(acceptanceAfterMigration,false);
  assert.equal((await value('select count(*)::int as n from public.community_rule_acceptances where profile_id=$1 and rules_version=1',[member])).n,1);
});

test('existing genuine profiles backfill Auth links without changing IDs, names or timestamps', async () => {
  await root();
  assert.deepEqual((await db.query('select id,display_name,created_at,updated_at from public.profiles order by id')).rows,oldProfiles);
  const links = (await db.query('select id,auth_user_id,is_seeded,seed_key from public.profiles')).rows;
  assert.equal(links.length,8);
  assert.ok(links.every(p=>p.id===p.auth_user_id&&!p.is_seeded&&p.seed_key===null));
  assert.equal((await value("select attgenerated from pg_attribute where attrelid='public.profiles'::regclass and attname='auth_user_id'")).attgenerated,'s');
});

test('new genuine signup keeps the original trigger/preferences and auth.uid ownership', async () => {
  await root();
  await db.query('insert into auth.users(id,raw_user_meta_data) values ($1,$2)',[uuid(900),{display_name:'TEST new genuine'}]);
  assert.deepEqual(await value('select id,auth_user_id,is_seeded from public.profiles where id=$1',[uuid(900)]),{id:uuid(900),auth_user_id:uuid(900),is_seeded:false});
  for (const table of ['user_preferences','notification_preferences','newsletter_preferences']) {
    assert.equal((await value(`select count(*)::int as n from public.${table} where profile_id=$1`,[uuid(900)])).n,1);
  }
  await as(uuid(900));
  assert.equal((await value('select public.is_authenticated_member() as yes')).yes,true);
  assert.equal((await db.query("update public.profiles set display_name='TEST own name' where id=auth.uid() returning id")).rows.length,1);
  assert.equal((await db.query("update public.profiles set display_name='not allowed' where id=$1 returning id",[member])).rows.length,0);
  await db.query("insert into public.families(owner_id,name) values (auth.uid(),'TEST own family')");
  await root(); await db.query('delete from auth.users where id=$1',[uuid(900)]);
  assert.equal((await value('select count(*)::int as n from public.profiles where id=$1',[uuid(900)])).n,0);
});

test('clients cannot detach/retarget Auth links or spoof provenance; genuine profiles require Auth', async () => {
  await as(member);
  await assert.rejects(db.query('update public.profiles set auth_user_id=null where id=$1',[member]));
  await assert.rejects(db.query('update public.profiles set auth_user_id=$1 where id=$2',[other,member]));
  await assert.rejects(db.query("insert into public.profiles(id,display_name,is_seeded,seed_key) values ($1,'TEST spoof',true,'forged')",[uuid(902)]));
  await root();
  await assert.rejects(db.query("insert into public.profiles(id,display_name) values ($1,'TEST missing Auth')",[uuid(903)]));
  await assert.rejects(db.query("insert into public.profiles(id,display_name,is_seeded,seed_key) values ($1,'TEST no key',true,null)",[uuid(904)]));
  await assert.rejects(db.query("insert into public.profiles(id,display_name,is_seeded,seed_key) values ($1,'TEST empty key',true,'  ')",[uuid(904)]));
});
test('member creates post, linked activity, reply and Helpful using existing RLS', async () => {
  await as(member);
  await db.query('insert into public.community_posts(id,room_id,author_id,title,body,post_type,topic,activity_id) values ($1,$2,$3,$4,$5,$6,$7,$8)', [postId,room,member,'Rainy afternoon','A practical family question','question','Kids','TEST-ACTIVITY']);
  await as(other);
  await db.query('insert into public.community_comments(id,post_id,author_id,body) values ($1,$2,$3,$4)', [replyId,postId,other,'A searchable xylophone reply']);
  await db.query("insert into public.community_post_reactions(post_id,profile_id,reaction_type) values ($1,$2,'helpful')", [postId,other]);
  assert.equal((await value('select helpful_count,reply_count,activity_title from public.community_post_catalogue where id=$1',[postId])).activity_title,'Linked constellation adventure');
});
test('no rules acceptance, impersonation and role spoofing cannot create protected content', async () => {
  await as(unaccepted);
  await assert.rejects(db.query("insert into public.community_posts(room_id,author_id,title,body) values ($1,$2,'TEST','TEST')",[room,unaccepted]));
  await assert.rejects(db.query("insert into public.community_comment_reactions(comment_id,profile_id,reaction_type) values ($1,$2,'helpful')",[replyId,unaccepted]));
  await as(member);
  await assert.rejects(db.query("insert into public.community_posts(room_id,author_id,title,body) values ($1,$2,'TEST','TEST')",[room,other]));
  await assert.rejects(db.query("insert into public.admin_roles values ($1,'owner',now())",[member]));
});
test('reply depth and cross-post parent integrity are enforced', async () => {
  await as(member);
  await db.query('insert into public.community_comments(id,post_id,author_id,parent_comment_id,body) values ($1,$2,$3,$4,$5)',[uuid(102),postId,member,replyId,'TEST child reply']);
  await assert.rejects(db.query('insert into public.community_comments(post_id,author_id,parent_comment_id,body) values ($1,$2,$3,$4)',[postId,member,uuid(102),'TEST too deep']));
});
test('post/title/body/type/topic, reply content and linked activity are searchable; pages are bounded and deterministic', async () => {
  await as(member);
  for (const search of ['rainy','practical','question','kids','xylophone','constellation']) {
    const { result } = await value('select public.search_community_posts($1) as result',[search]);
    assert.equal(result.items[0].id,postId,search);
  }
  const { result: absent } = await value("select public.search_community_posts('notarealword') as result"); assert.equal(absent.items.length,0);
  const { result: filtered } = await value("select public.search_community_posts('', 'Food') as result"); assert.equal(filtered.items.length,0);
  await assert.rejects(db.query("select public.search_community_posts('',null,null,'recent',0,1000)"));
  await assert.rejects(db.query("select public.search_community_posts('',null,null,'recent',0,null)"));
  await assert.rejects(db.query('select public.community_reply_page($1,0,null)',[postId]));
  await db.query("update public.community_posts set tags=array['stargazing'] where id=$1",[postId]);
  assert.equal((await value("select public.search_community_posts('stargazing') as result")).result.items[0].id,postId);
  assert.equal((await value("select public.search_community_posts('',null,'tip') as result")).result.items.length,0);
  for (let i=0;i<23;i++) await db.query("insert into public.community_posts(room_id,author_id,title,body) values ($1,$2,$3,'TEST')",[room,member,`TEST pagination ${i}`]);
  const first = (await value("select public.search_community_posts('',null,null,'recent',0,20) as result")).result;
  const next = (await value("select public.search_community_posts('',null,null,'recent',20,20) as result")).result;
  assert.equal(first.items.length,20); assert.equal(first.hasMore,true); assert.equal(next.hasMore,false);
  assert.equal(new Set([...first.items,...next.items].map(p=>p.id)).size,24);
  assert.deepEqual(first,(await value("select public.search_community_posts('',null,null,'recent',0,20) as result")).result);
  assert.equal((await value("select public.search_community_posts('',null,null,'helpful') as result")).result.items[0].id,postId);
  assert.equal((await value("select public.search_community_posts('rainy',null,null,'relevant') as result")).result.items[0].id,postId);
});
test('blocked and removed reply text cannot leak through search or aggregates', async () => {
  await as(member);
  await db.query('insert into public.community_blocks(blocker_id,blocked_profile_id) values ($1,$2)',[member,other]);
  assert.equal((await value("select public.search_community_posts('xylophone') as result")).result.items.length,0);
  assert.equal((await value('select public.community_reply_page($1) as result',[postId])).result.items.some(r=>r.id===replyId),false);
  await db.query('delete from public.community_blocks where blocker_id=$1 and blocked_profile_id=$2',[member,other]);
  await as(moderator);
  await db.query("update public.community_comments set moderation_status='removed_by_moderator',removal_reason='TEST review' where id=$1",[replyId]);
  await as(member);
  assert.equal((await value("select public.search_community_posts('xylophone') as result")).result.items.length,0);
  await as(moderator); await db.query("update public.community_comments set moderation_status='visible' where id=$1",[replyId]);
});
test('Owner > Admin > Moderator > Member and no self/equal restriction; higher-authority revocation protected', async () => {
  for (const [actor,target,allowed] of [[moderator,member,true],[moderator,peerMod,false],[moderator,admin,false],[admin,moderator,true],[admin,peerAdmin,false],[admin,owner,false],[owner,admin,true],[owner,owner,false]]) {
    await as(actor); assert.equal((await value('select public.can_restrict_community_profile($1) as allowed',[target])).allowed,allowed);
  }
  await as(admin);
  await db.query("insert into public.community_user_restrictions(id,profile_id,imposed_by,restriction_type,ends_at,reason) values ($1,$2,$3,'posting_restriction',now()+interval '1 day','TEST restriction')",[uuid(200),other,admin]);
  await as(moderator);
  assert.equal((await db.query("update public.community_user_restrictions set status='revoked' where id=$1 returning id",[uuid(200)])).rows.length,0);
});
test('restricted members cannot insert/update reactions but may delete their own, report and block', async () => {
  await as(other);
  assert.equal((await db.query("update public.community_post_reactions set reaction_type='support' where post_id=$1 and profile_id=$2 returning post_id",[postId,other])).rows.length,0);
  assert.equal((await value('select reaction_type from public.community_post_reactions where post_id=$1 and profile_id=$2',[postId,other])).reaction_type,'helpful');
  await assert.rejects(db.query("insert into public.community_comment_reactions(comment_id,profile_id,reaction_type) values ($1,$2,'helpful')",[replyId,other]));
  await db.query('delete from public.community_post_reactions where post_id=$1 and profile_id=$2',[postId,other]);
  assert.equal((await db.query('select * from public.community_post_reactions where profile_id=$1',[other])).rows.length,0);
  await db.query("insert into public.community_reports(reporter_id,target_type,target_id,reason_category) values ($1,'post',$2,'spam_scam')",[other,postId]);
  await db.query('insert into public.community_blocks(blocker_id,blocked_profile_id) values ($1,$2)',[other,member]);
  await db.query('delete from public.community_blocks where blocker_id=$1 and blocked_profile_id=$2',[other,member]);
  await as(owner); await db.query("update public.community_user_restrictions set status='revoked' where id=$1",[uuid(200)]);
});
test('moderators can review/remove/restore/lock with automatic audit, but cannot rewrite content or new fields', async () => {
  await as(member); assert.equal((await db.query('select * from public.community_reports')).rows.length,0);
  await as(moderator); assert.equal((await db.query('select * from public.community_reports')).rows.length,1);
  await assert.rejects(db.query("update public.community_posts set topic='Food' where id=$1",[postId]));
  await assert.rejects(db.query("update public.community_posts set body='rewritten' where id=$1",[postId]));
  await db.query("update public.community_posts set moderation_status='removed_by_moderator',removal_reason='TEST spam review' where id=$1",[postId]);
  await as(member); assert.equal((await value("select public.search_community_posts('rainy') as result")).result.items.length,0);
  await as(moderator); await db.query("update public.community_posts set moderation_status='visible',locked=true where id=$1",[postId]);
  await as(other); await assert.rejects(db.query("insert into public.community_comments(post_id,author_id,body) values ($1,$2,'TEST locked')",[postId,other]));
  await as(moderator); assert.ok((await db.query('select * from public.community_moderation_actions')).rows.length>=5);
  await db.query("update public.community_posts set locked=false where id=$1",[postId]);
});
test('archiving a linked activity does not prevent existing post moderation', async () => {
  await root(); await db.query("update public.activities set status='draft' where id='TEST-ACTIVITY'");
  await as(moderator);
  await db.query("update public.community_posts set locked=true where id=$1",[postId]);
  await db.query("update public.community_posts set locked=false where id=$1",[postId]);
  await as(member);
  await assert.rejects(db.query("insert into public.community_posts(room_id,author_id,title,body,activity_id) values ($1,$2,'TEST','TEST','TEST-ACTIVITY')",[room,member]));
  await root(); await db.query("update public.activities set status='published' where id='TEST-ACTIVITY'");
});

test('provenance cannot be forged by members or moderators; seed import is service-only', async () => {
  for (const actor of [member, moderator]) {
    await as(actor);
    await assert.rejects(db.query("update public.profiles set is_seeded=true,seed_key='forged' where id=$1",[actor]));
    await assert.rejects(db.query("update public.community_posts set is_seeded=true,seed_key='forged' where id=$1",[postId]));
    await assert.rejects(db.query('select public.import_community_starters($1)',[starterFixture()]));
    await assert.rejects(db.query('select * from public.community_seed_imports'));
  }
});
test('service import is atomic/idempotent and creates only non-login profiles with exact prose/timestamps', async () => {
  await root();
  const beforeAuth = (await db.query('select * from auth.users order by id')).rows;
  // Tripwire: any Auth INSERT/UPDATE/DELETE during import fails this test.
  await db.exec(`create function auth.reject_fixture_writes() returns trigger language plpgsql as $$
    begin raise exception 'Community importer attempted an Auth write'; end; $$;
    create trigger forbid_import_auth_writes before insert or update or delete on auth.users
      for each statement execute function auth.reject_fixture_writes();`);
  await as(null,'service_role');
  const bundle = starterFixture();
  const first = (await value('select public.import_community_starters($1) as result',[bundle])).result;
  assert.deepEqual(first.counts,{profiles:30,posts:1,replies:1,reactions:1}); assert.equal(first.verified,true);
  assert.equal(first.identity_mode,'non_login_profiles');
  assert.equal((await value('select public.import_community_starters($1) as result',[bundle])).result.replayed,true);
  const changed = structuredClone(bundle); changed.posts[0].body='different';
  await assert.rejects(db.query('select public.import_community_starters($1)',[changed]));
  await root();
  const source = await value('select body,created_at from public.community_posts where is_seeded');
  assert.equal(source.body,bundle.posts[0].body); assert.equal(new Date(source.created_at).toISOString(),new Date(bundle.posts[0].created_at).toISOString());
  assert.deepEqual((await db.query('select * from auth.users order by id')).rows,beforeAuth);
  assert.equal((await value('select count(*)::int as n from public.profiles p where p.is_seeded and p.auth_user_id is null and not exists(select 1 from auth.users u where u.id=p.id)')).n,30);
  for (const table of ['user_preferences','notification_preferences','newsletter_preferences']) {
    assert.equal((await value(`select count(*)::int as n from public.${table} n join public.profiles p on p.id=n.profile_id where p.is_seeded`)).n,0);
  }
  assert.equal((await value('select count(*)::int as n from public.families f join public.profiles p on p.id=f.owner_id where p.is_seeded')).n,0);
  const invalid = starterFixture(); invalid.batch_key='test-rollback'; invalid.replies[0].post_key='missing';
  await as(null,'service_role'); await assert.rejects(db.query('select public.import_community_starters($1)',[invalid]));
  await root(); assert.equal((await value("select count(*)::int as count from public.profiles where seed_key like 'test-rollback:%'")).count,0);
  await db.exec('drop trigger forbid_import_auth_writes on auth.users; drop function auth.reject_fixture_writes();');
});
test('genuine/seeded/combined queries separate provenance and seeded reactions cannot add Helpful social proof', async () => {
  await as(member);
  const seeded = (await value("select public.search_community_posts('',null,null,'helpful',0,20,'seeded') as result")).result;
  assert.equal(seeded.items.length,1); assert.equal(seeded.items[0].helpful_count,0);
  const genuine = (await value("select public.search_community_posts('',null,null,'recent',0,30,'genuine') as result")).result;
  assert.equal(genuine.items.length,24); assert.ok(genuine.items.every(p=>!p.is_seeded));
  await as(seeded.items[0].author_id); assert.equal((await value('select public.can_create_community_content() as allowed')).allowed,false);
});
test('anonymous access is denied and private family information remains protected', async () => {
  await as(null,'anon'); await assert.rejects(db.query('select * from public.community_post_catalogue'));
  await assert.rejects(db.query("select public.search_community_posts('')"));
  await root(); await db.query("insert into public.families(id,owner_id,name) values ($1,$2,'PRIVATE TEST')",[uuid(500),member]);
  await db.query("insert into public.family_members(family_id,display_name) values ($1,'PRIVATE CHILD')",[uuid(500)]);
  await as(other); assert.equal((await db.query('select * from public.family_members')).rows.length,0);
});
test('all three active restriction types block all four reaction writes; both own reaction deletions remain allowed', async () => {
  await root();
  await db.query('insert into public.community_rule_acceptances(profile_id,rules_version) values ($1,2)',[unaccepted]);
  for (const [index,type] of ['posting_restriction','community_suspension','permanent_community_ban'].entries()) {
    await as(unaccepted);
    await db.query("insert into public.community_post_reactions(post_id,profile_id,reaction_type) values ($1,$2,'helpful')",[postId,unaccepted]);
    await db.query("insert into public.community_comment_reactions(comment_id,profile_id,reaction_type) values ($1,$2,'helpful')",[replyId,unaccepted]);
    await as(admin);
    await db.query('insert into public.community_user_restrictions(id,profile_id,imposed_by,restriction_type,ends_at,reason) values ($1,$2,$3,$4,$5,$6)',[uuid(700+index),unaccepted,admin,type,type==='permanent_community_ban'?null:'2999-01-01T00:00:00Z','TEST restriction variants']);
    await as(unaccepted);
    assert.equal((await db.query("update public.community_post_reactions set reaction_type='support' where profile_id=$1 returning post_id",[unaccepted])).rows.length,0);
    assert.equal((await db.query("update public.community_comment_reactions set reaction_type='support' where profile_id=$1 returning comment_id",[unaccepted])).rows.length,0);
    await db.query('delete from public.community_post_reactions where profile_id=$1',[unaccepted]);
    await db.query('delete from public.community_comment_reactions where profile_id=$1',[unaccepted]);
    await assert.rejects(db.query("insert into public.community_post_reactions(post_id,profile_id,reaction_type) values ($1,$2,'helpful')",[postId,unaccepted]));
    await assert.rejects(db.query("insert into public.community_comment_reactions(comment_id,profile_id,reaction_type) values ($1,$2,'helpful')",[replyId,unaccepted]));
    await assert.rejects(db.query("insert into public.community_comments(post_id,author_id,body) values ($1,$2,'TEST restricted')",[postId,unaccepted]));
    await as(owner); await db.query("update public.community_user_restrictions set status='revoked' where id=$1",[uuid(700+index)]);
  }
});
test('genuine metrics exclude starter identities, posts, replies and reactions', async () => {
  await as(null,'service_role'); const result=(await value('select public.community_genuine_metrics() as result')).result;
  assert.equal(result.members,8); assert.equal(result.posts,24); assert.equal(result.replies,2); assert.equal(result.helpful_reactions,0);
  await as(member); await assert.rejects(db.query('select public.community_genuine_metrics()'));
});

test('seed UUIDs cannot be attached to Auth, promoted to genuine or used as member actors', async () => {
  await root();
  const seed = await value('select id,seed_key from public.profiles where is_seeded order by id limit 1');
  const seedPost = await value('select id,author_id,body from public.community_posts where is_seeded');
  await assert.rejects(db.query('insert into auth.users(id,raw_user_meta_data) values ($1,$2)',[seed.id,{}]));
  assert.equal((await value('select count(*)::int as n from auth.users where id=$1',[seed.id])).n,0);
  await assert.rejects(db.query('update public.profiles set is_seeded=false,seed_key=null where id=$1',[seed.id]));
  await as(seedPost.author_id); // A forged subject in SQL; no actual Auth session exists.
  assert.equal((await value('select public.is_authenticated_member() as yes')).yes,false);
  assert.equal((await value('select public.can_create_community_content() as yes')).yes,false);
  assert.equal((await value('select public.community_access() as access')).access.isModerator,false);
  await assert.rejects(db.query("select public.search_community_posts('')"));
  assert.equal((await db.query("update public.profiles set display_name='Spoof' where id=auth.uid() returning id")).rows.length,0);
  assert.equal((await db.query("update public.community_posts set body='Spoof' where id=$1 returning id",[seedPost.id])).rows.length,0);
  assert.equal((await db.query('delete from public.community_posts where id=$1 returning id',[seedPost.id])).rows.length,0);
  await assert.rejects(db.query('insert into public.community_rule_acceptances(profile_id,rules_version) values (auth.uid(),2)'));
  await assert.rejects(db.query("insert into public.community_posts(author_id,room_id,title,body) values (auth.uid(),$1,'TEST','TEST')",[room]));
  await assert.rejects(db.query("insert into public.community_comments(author_id,post_id,body) values (auth.uid(),$1,'TEST')",[seedPost.id]));
  await assert.rejects(db.query("insert into public.community_post_reactions(profile_id,post_id,reaction_type) values (auth.uid(),$1,'helpful')",[postId]));
  await assert.rejects(db.query('insert into public.community_blocks(blocker_id,blocked_profile_id) values (auth.uid(),$1)',[member]));
  await assert.rejects(db.query("insert into public.community_reports(reporter_id,target_type,target_id,reason_category) values (auth.uid(),'post',$1,'spam_scam')",[postId]));
  await assert.rejects(db.query("insert into public.families(owner_id,name) values (auth.uid(),'TEST seed must not own a family')"));
  await root(); assert.equal((await value('select body from public.community_posts where id=$1',[seedPost.id])).body,seedPost.body);
});

test('a seed cannot alias an Auth user whose profile is missing', async () => {
  await root();
  await db.query('insert into auth.users(id,raw_user_meta_data) values ($1,$2)',[uuid(910),{}]);
  await db.query('delete from public.profiles where id=$1',[uuid(910)]);
  await assert.rejects(db.query("insert into public.profiles(id,is_seeded,seed_key) values ($1,true,'test-auth-alias')",[uuid(910)]),/cannot have an Auth identity/);
  await db.query('delete from auth.users where id=$1',[uuid(910)]);
});

test('genuine replies and reactions coexist with starter threads without contaminating strict genuine metrics', async () => {
  await root(); const seedPost=await value('select id from public.community_posts where is_seeded');
  await as(null,'service_role'); const before=(await value('select public.community_genuine_metrics() as metrics')).metrics;
  await as(member);
  await db.query("insert into public.community_comments(id,post_id,author_id,body) values ($1,$2,auth.uid(),'TEST real contribution to starter')",[uuid(920),seedPost.id]);
  await db.query("insert into public.community_post_reactions(post_id,profile_id,reaction_type) values ($1,auth.uid(),'helpful')",[seedPost.id]);
  const replies=(await value('select public.community_reply_page($1) as page',[seedPost.id])).page.items;
  assert.ok(replies.some(r=>r.is_seeded)); assert.ok(replies.some(r=>r.id===uuid(920)&&!r.is_seeded));
  assert.equal((await value('select helpful_count from public.community_post_catalogue where id=$1',[seedPost.id])).helpful_count,1);
  await as(null,'service_role'); assert.deepEqual((await value('select public.community_genuine_metrics() as metrics')).metrics,before);
});

test('moderators can remove/restore and audit seeded posts/replies without altering provenance', async () => {
  await root(); const seedPost=await value('select id from public.community_posts where is_seeded');
  const seedReply=await value('select id from public.community_comments where is_seeded');
  await as(moderator);
  for (const [table,id] of [['community_posts',seedPost.id],['community_comments',seedReply.id]]) {
    await db.query(`update public.${table} set moderation_status='removed_by_moderator',removal_reason='TEST starter moderation' where id=$1`,[id]);
    assert.equal((await value(`select is_seeded from public.${table} where id=$1`,[id])).is_seeded,true);
    await db.query(`update public.${table} set moderation_status='visible' where id=$1`,[id]);
  }
  assert.ok((await db.query('select id from public.community_moderation_actions where target_post_id=$1 or target_comment_id=$2',[seedPost.id,seedReply.id])).rows.length>=4);
});

test('deleting a genuine Auth user cascades profile, content, reactions, preferences and family data; seeds survive', async () => {
  await root();
  await db.query('insert into auth.users(id,raw_user_meta_data) values ($1,$2)',[uuid(930),{}]);
  await db.query('insert into public.community_rule_acceptances(profile_id,rules_version) values ($1,2)',[uuid(930)]);
  await as(uuid(930));
  await db.query("insert into public.community_posts(id,room_id,author_id,title,body) values ($1,$2,auth.uid(),'TEST cascade','TEST')",[uuid(931),room]);
  await db.query("insert into public.community_comments(id,post_id,author_id,body) values ($1,$2,auth.uid(),'TEST cascade reply')",[uuid(932),postId]);
  await db.query("insert into public.community_post_reactions(post_id,profile_id,reaction_type) values ($1,auth.uid(),'helpful')",[postId]);
  await db.query("insert into public.community_comment_reactions(comment_id,profile_id,reaction_type) values ($1,auth.uid(),'helpful')",[replyId]);
  await db.query("insert into public.families(id,owner_id,name) values ($1,auth.uid(),'TEST cascade family')",[uuid(933)]);
  await db.query("insert into public.family_members(family_id,display_name) values ($1,'TEST child')",[uuid(933)]);
  await root(); await db.query("insert into public.admin_roles(profile_id,role) values ($1,'support')",[uuid(930)]);
  await db.query('delete from auth.users where id=$1',[uuid(930)]);
  for (const [table,key] of [['profiles','id'],['community_posts','author_id'],['community_comments','author_id'],['community_post_reactions','profile_id'],['community_comment_reactions','profile_id'],['user_preferences','profile_id'],['notification_preferences','profile_id'],['newsletter_preferences','profile_id'],['community_rule_acceptances','profile_id'],['families','owner_id'],['admin_roles','profile_id']]) {
    assert.equal((await value(`select count(*)::int as n from public.${table} where ${key}=$1`,[uuid(930)])).n,0,table);
  }
  assert.equal((await value('select count(*)::int as n from public.family_members where family_id=$1',[uuid(933)])).n,0);
  assert.equal((await value('select count(*)::int as n from public.profiles where is_seeded')).n,30);
  assert.ok((await db.query('select id from public.community_content_revisions where content_id in ($1,$2)',[uuid(931),uuid(932)])).rows.length>=2);
});
test.after(async () => { await db.close(); });

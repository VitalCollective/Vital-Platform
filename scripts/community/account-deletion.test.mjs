import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';

// Real PostgreSQL/RLS in memory only. Storage metadata is a fixture; no network.
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(resolve(process.env.PGLITE_MODULE)).href : '@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key,raw_user_meta_data jsonb,raw_app_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  grant usage on schema auth,public,storage to authenticated,anon,service_role;
  alter default privileges in schema public grant all on tables to authenticated,service_role;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
  alter table storage.objects enable row level security; grant all on storage.objects to authenticated,service_role; grant select on storage.objects to anon;`);
for(const name of ['20260823204450_initial_vital_schema.sql','20260826085303_community_and_moderation.sql','20260910120000_community_v1.sql','20260910180000_community_profile_images.sql','20260913120000_complete_community_member_blocking.sql','20260913180000_secure_account_deletion.sql']) {
  await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
}
const id=n=>`60000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const member=id(1),other=id(2),moderator=id(3),seed=id(4),postKeep=id(101),postRemove=id(102),otherPost=id(103),memberReply=id(104),otherChild=id(105),otherReply=id(106);
const room='10000000-0000-4000-8000-000000000001';
async function root(){await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);");}
async function as(subject,role='authenticated'){await db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${subject??''}',false);`);}
async function row(sql,args=[]){return (await db.query(sql,args)).rows[0];}
async function count(table,where='true',args=[]){return (await row(`select count(*)::int n from public.${table} where ${where}`,args)).n;}
await root();
for(const [profile,name] of [[member,'Deleting member'],[other,'Other member'],[moderator,'Moderator']]) await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[profile,{display_name:name}]);
await db.query("insert into public.profiles(id,display_name,is_seeded,seed_key) values($1,'Starter',true,'account-delete:starter')",[seed]);
await db.query("insert into public.admin_roles(profile_id,role) values($1,'moderator')",[moderator]);
await db.query("insert into public.activities(id,type,section,title,status) values('DELETE-TEST','activity','Vital Life','Deletion test activity','published')");
const family=(await row("insert into public.families(owner_id,name) values($1,'Private family') returning id",[member])).id;
await db.query("insert into public.family_members(family_id,display_name) values($1,'Private child')",[family]);
await db.query("insert into public.saved_activities(profile_id,activity_id,list_type) values($1,'DELETE-TEST','try_later')",[member]);
await db.query("insert into public.activity_completions(profile_id,activity_id,note) values($1,'DELETE-TEST','private note')",[member]);
await db.query("insert into public.activity_ratings(profile_id,activity_id,rating,comment) values($1,'DELETE-TEST','loved','private rating')",[member]);
await db.query("insert into public.planned_activities(profile_id,activity_id,planned_for) values($1,'DELETE-TEST','2026-09-20')",[member]);
await db.query("insert into public.subscription_entitlements(profile_id,entitlement_id,status) values($1,'test','expired')",[member]);
await db.query("update public.profiles set avatar_url=$2 where id=$1",[member,`profile-images/${member}/avatar.webp`]);
await db.query("insert into storage.objects(bucket_id,name,metadata) values('profile-images',$1,'{}')",[`${member}/avatar.webp`]);
for(const [post,author,title] of [[postKeep,member,'Personal post to scrub'],[postRemove,member,'Personal post to delete'],[otherPost,other,'Other post'],[id(107),seed,'Starter post']]) await db.query('insert into public.community_posts(id,room_id,author_id,title,body,is_seeded,seed_key) values($1,$2,$3,$4,$5,$6,$7)',[post,room,author,title,`${title} body`,author===seed,author===seed?'account-delete:post':null]);
await db.query("insert into public.community_comments(id,post_id,author_id,body) values($1,$2,$3,'Other reply survives')",[otherReply,postKeep,other]);
await db.query("insert into public.community_comments(id,post_id,author_id,body) values($1,$2,$3,'Deleting member reply')",[memberReply,otherPost,member]);
await db.query("insert into public.community_comments(id,post_id,author_id,parent_comment_id,body) values($1,$2,$3,$4,'Other child survives')",[otherChild,otherPost,other,memberReply]);
await db.query("insert into public.community_post_reactions(post_id,profile_id,reaction_type) values($1,$2,'helpful')",[otherPost,member]);
await db.query("insert into public.community_comment_reactions(comment_id,profile_id,reaction_type) values($1,$2,'helpful')",[otherReply,member]);
await db.query('insert into public.community_blocks(blocker_id,blocked_profile_id) values($1,$2),($2,$1)',[member,other]);
await db.query('insert into public.saved_community_posts(profile_id,post_id) values($1,$2)',[member,otherPost]);
const report=(await row("insert into public.community_reports(reporter_id,target_type,target_id,reason_category,details) values($1,'post',$2,'other','Safety context') returning id",[member,otherPost])).id;
await db.query("insert into public.community_user_restrictions(profile_id,restriction_type,ends_at,reason,imposed_by) values($1,'posting_restriction','2026-09-20','test',$2)",[member,moderator]);

test('manifest is self-derived, rejects seed identities and protects moderation accounts',async()=>{
  await as(member);const manifest=(await row('select public.account_deletion_manifest() value')).value;
  assert.deepEqual(manifest,{profile_id:member,avatar_reference:`profile-images/${member}/avatar.webp`});
  await assert.rejects(db.query('select public.account_deletion_manifest($1)',[other]));
  await as(seed);await assert.rejects(db.query('select public.account_deletion_manifest()'),/NOT_GENUINE/);
  await assert.rejects(db.query('select public.authorize_account_deletion($1)',[seed]));
  await as(member);await assert.rejects(db.query('insert into public.account_deletion_authorizations(profile_id) values($1)',[member]));
  await as(moderator);await assert.rejects(db.query('select public.account_deletion_manifest()'),/ROLE_REQUIRES_REVIEW/);
  await root();await assert.rejects(db.query('delete from auth.users where id=$1',[moderator]),/Storage cleanup/);
  assert.equal((await row('select count(*)::int n from auth.users where id=$1',[moderator])).n,1);
});

test('direct profile deletion cannot leave a live Auth account',async()=>{
  await root();await assert.rejects(db.query('delete from public.profiles where id=$1',[other]),/account deletion service/);
  assert.equal((await row('select count(*)::int n from auth.users where id=$1',[other])).n,1);
  assert.equal(await count('profiles','id=$1',[other]),1);
});

test('Auth deletion removes private data and own contributions while preserving other replies through a neutral tombstone',async()=>{
  await root();
  // The Edge Function removes this exact owned object through the Storage API first.
  await db.query("delete from storage.objects where bucket_id='profile-images' and name=$1",[`${member}/avatar.webp`]);
  await as(null,'service_role');await db.query('select public.authorize_account_deletion($1)',[member]);
  await root();
  await db.query('delete from auth.users where id=$1',[member]);
  assert.equal((await row('select count(*)::int n from auth.users where id=$1',[member])).n,0);
  for(const [table,where] of [['profiles','id=$1'],['families','owner_id=$1'],['user_preferences','profile_id=$1'],['notification_preferences','profile_id=$1'],['newsletter_preferences','profile_id=$1'],['saved_activities','profile_id=$1'],['activity_completions','profile_id=$1'],['activity_ratings','profile_id=$1'],['planned_activities','profile_id=$1'],['subscription_entitlements','profile_id=$1'],['community_blocks','blocker_id=$1 or blocked_profile_id=$1'],['community_post_reactions','profile_id=$1'],['community_comment_reactions','profile_id=$1'],['saved_community_posts','profile_id=$1'],['community_user_restrictions','profile_id=$1']]) assert.equal(await count(table,where,[member]),0,table);
  assert.equal(await count('community_comments','author_id=$1',[member]),0);
  assert.equal(await count('community_posts','id=$1',[postRemove]),0);
  assert.deepEqual(await row('select author_id,title,body,post_type,topic,tags,activity_id,locked,pinned from public.community_posts where id=$1',[postKeep]),{author_id:null,title:'Deleted post',body:'This post was deleted by its author.',post_type:'discussion',topic:null,tags:[],activity_id:null,locked:true,pinned:false});
  assert.equal(await count('community_comments','id=$1 and author_id=$2',[otherReply,other]),1);
  assert.deepEqual(await row('select author_id,parent_comment_id,body from public.community_comments where id=$1',[otherChild]),{author_id:other,parent_comment_id:null,body:'Other child survives'});
  assert.equal(await count('community_content_revisions','author_id=$1 or changed_by=$1',[member]),0);
  assert.deepEqual(await row('select reporter_id,details from public.community_reports where id=$1',[report]),{reporter_id:null,details:'Safety context'});
  assert.equal((await row("select count(*)::int n from storage.objects where bucket_id='profile-images' and name=$1",[`${member}/avatar.webp`])).n,0);
  assert.equal(await count('profiles','id=$1',[seed]),1);assert.equal(await count('community_posts','author_id=$1',[seed]),1);
  assert.equal(await count('account_deletion_authorizations','profile_id=$1',[member]),0);
});

test.after(async()=>{await db.close();});

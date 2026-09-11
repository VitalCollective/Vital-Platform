import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { starterFixture } from './test-fixtures.mjs';
import { starterProfileId } from './seed.mjs';

// In-memory PostgreSQL only; Storage metadata/RLS fixture, no actual uploads.
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
  alter table storage.objects enable row level security;
  grant all on storage.objects to authenticated,service_role;
  grant select on storage.objects to anon;
`);
for(const name of ['20260823204450_initial_vital_schema.sql','20260826085303_community_and_moderation.sql','20260910120000_community_v1.sql']) {
  await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
}
const member='40000000-0000-4000-8000-000000000001',other='40000000-0000-4000-8000-000000000002';
await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$3),($2,$3)',[member,other,{display_name:'TEST real member'}]);
await db.query("insert into public.community_posts(room_id,author_id,title,body) values('10000000-0000-4000-8000-000000000001',$1,'TEST existing post','Do not change existing Community')",[member]);
const existingProfiles=(await db.query('select * from public.profiles order by id')).rows;
const existingPosts=(await db.query('select * from public.community_posts')).rows;
const migration=await readFile(new URL('../../supabase/migrations/20260910180000_community_profile_images.sql',import.meta.url),'utf8');
await db.exec(migration);
async function as(id,role='authenticated'){await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id??''}',false);`);}
async function root(){await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");}
async function row(sql,args){return (await db.query(sql,args)).rows[0];}
const bundle=starterFixture();
const seedId=starterProfileId(bundle.batch_key,bundle.profiles[0].key);
const seedPath=`${seedId}/portrait-v1.webp`;
bundle.profiles[0].avatar_path=seedPath;

test('image migration reuses avatar_url and preserves existing real profiles, conversations and rules',async()=>{
  assert.deepEqual((await db.query('select * from public.profiles order by id')).rows,existingProfiles);
  assert.deepEqual((await db.query('select * from public.community_posts')).rows,existingPosts);
  assert.equal((await row('select version from public.community_rules where is_current')).version,2);
  const bucket=await row("select * from storage.buckets where id='profile-images'");
  assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,524288);
  assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp']);
  assert.equal((await row("select count(*)::int as n from pg_policies where schemaname='storage'")).n,4);
  assert.doesNotMatch(migration,/\b(insert\s+into|update|delete\s+from|alter\s+table)\s+auth\./i);
});

test('V3 importer creates an image-present seed without Auth; absent images stay NULL; replay is exact',async()=>{
  await root();
  const authBefore=(await db.query('select * from auth.users order by id')).rows;
  await db.exec(`create function auth.reject_import_writes() returns trigger language plpgsql as $$ begin raise exception 'No Auth writes permitted'; end; $$;
    create trigger no_import_auth_writes before insert or update or delete on auth.users for each statement execute function auth.reject_import_writes();`);
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('profile-images',$1,$2)",[seedPath,{mimetype:'image/webp',size:12345}]);
  await as(null,'service_role');
  const first=(await row('select public.import_community_starters($1) as result',[bundle])).result;
  assert.equal(first.image_references_verified,true);assert.equal(first.identity_mode,'non_login_profiles');
  assert.equal((await row('select public.import_community_starters($1) as result',[bundle])).result.replayed,true);
  await root();
  assert.deepEqual(await row('select avatar_url,auth_user_id,is_seeded from public.profiles where id=$1',[seedId]),{avatar_url:`profile-images/${seedPath}`,auth_user_id:null,is_seeded:true});
  assert.equal((await row('select count(*)::int as n from public.profiles where is_seeded and avatar_url is null')).n,29);
  assert.deepEqual((await db.query('select * from auth.users order by id')).rows,authBefore);
  for(const table of ['user_preferences','notification_preferences','newsletter_preferences'])assert.equal((await row(`select count(*)::int as n from public.${table} q join public.profiles p on p.id=q.profile_id where p.is_seeded`)).n,0);
  const changed=structuredClone(bundle);changed.profiles[0].avatar_path=null;
  await as(null,'service_role');await assert.rejects(db.query('select public.import_community_starters($1)',[changed]),/different content/);
  await assert.rejects(db.query('select public.import_community_starters($1)',[{...bundle,schema_version:2}]),/Invalid starter bundle/);
});

test('invalid or unavailable seed images fail atomically without profiles or overwritten content',async()=>{
  for(const path of ['https://example.com/photo.jpg',`${seedId}/../photo.jpg`,`${seedId}/file.svg`]){
    const bad=structuredClone(bundle);bad.profiles[0].avatar_path=path;
    await assert.rejects(db.query('select public.import_community_starters($1)',[bad]),/Invalid starter image reference/);
  }
  const missing=structuredClone(bundle);missing.batch_key='test-missing-image';
  missing.profiles[0].avatar_path=`${starterProfileId(missing.batch_key,missing.profiles[0].key)}/missing.jpg`;
  await assert.rejects(db.query('select public.import_community_starters($1)',[missing]),/image is missing/);
  await root();assert.equal((await row("select count(*)::int as n from public.profiles where seed_key like 'test-missing-image:%'")).n,0);
  await db.query("update storage.objects set metadata=$2 where name=$1",[seedPath,{mimetype:'image/webp',size:600000}]);
  await as(null,'service_role');await assert.rejects(db.query('select public.import_community_starters($1)',[bundle]),/supported image limits/);
  await root();await db.query("update storage.objects set metadata=$2 where name=$1",[seedPath,{mimetype:'image/webp',size:12345}]);
});

test('real members read linked starter images; only their own image paths can be uploaded, changed or removed',async()=>{
  await as(member);
  assert.equal((await db.query('select * from storage.objects')).rows.length,1);
  const ownPath=`${member}/photo-v1.png`,otherPath=`${other}/photo-v1.png`;
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('profile-images',$1,$2)",[ownPath,{mimetype:'image/png',size:100}]);
  await db.query('update public.profiles set avatar_url=$1 where id=auth.uid()',[`profile-images/${ownPath}`]);
  assert.equal((await row('select auth_user_id=id as genuine from public.profiles where id=auth.uid()')).genuine,true);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('profile-images',$1)",[otherPath]));
  await assert.rejects(db.query('update storage.objects set name=$1 where name=$2',[otherPath,ownPath]));
  await assert.rejects(db.query('update public.profiles set avatar_url=$1 where id=auth.uid()',[`profile-images/${seedPath}`]));
  await assert.rejects(db.query("update public.profiles set avatar_url='https://example.com/tracker.jpg' where id=auth.uid()"));
  assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[seedPath])).rows.length,0);
  await as(other);assert.equal((await db.query('select * from storage.objects')).rows.length,2);
  await as(member);await db.query('delete from storage.objects where name=$1',[ownPath]);
  await db.query('update public.profiles set avatar_url=null where id=auth.uid()');
});

test('anonymous and seeded subjects cannot access images or act; metrics and service permissions remain protected',async()=>{
  for(const [id,role] of [[null,'anon'],[seedId,'authenticated']]){
    await as(id,role);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('profile-images',$1)",[`${seedId}/spoof.jpg`]));
    await assert.rejects(db.query('select public.import_community_starters($1)',[bundle]));
  }
  assert.equal((await row('select public.can_create_community_content() as yes')).yes,false);
  await as(null,'service_role');assert.deepEqual((await row('select public.community_genuine_metrics() as metrics')).metrics,{members:2,posts:1,replies:0,helpful_reactions:0});
});
test.after(async()=>{await db.close();});

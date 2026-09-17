import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';

// Real PostgreSQL/RLS in memory only; no linked Supabase project or billing provider.
const { PGlite } = await import(process.env.PGLITE_MODULE
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE)).href : '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key,raw_user_meta_data jsonb,raw_app_meta_data jsonb,
    aud text,role text,banned_until timestamptz,created_at timestamptz,updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
  alter table storage.objects enable row level security;
  grant usage on schema auth,public,storage to authenticated,anon,service_role;
  grant execute on function auth.uid() to authenticated,anon,service_role;
  grant select on storage.objects to authenticated,service_role;
  alter default privileges in schema public grant all on tables to authenticated,service_role;`);

for (const name of [
  '20260823204450_initial_vital_schema.sql',
  '20260826085303_community_and_moderation.sql',
  '20260827090000_authenticated_vital_resource_pdf_read.sql',
  '20260910120000_community_v1.sql',
  '20260913120000_complete_community_member_blocking.sql',
]) await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));

const id = n => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const member = id(1), other = id(2), seed = id(3);
const post = id(20);
async function root() { await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);"); }
async function as(subject, role = 'authenticated') { await db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${subject ?? ''}',false);`); }
async function rows(sql, args = []) { return (await db.query(sql, args)).rows; }
async function count(table) { return Number((await rows(`select count(*) n from public.${table}`))[0].n); }

await root();
for (const [profile, name] of [[member, 'TEST billing member'], [other, 'TEST other member']]) {
  await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [profile, { display_name: name }]);
}
await db.query("insert into public.profiles(id,display_name,is_seeded,seed_key) values($1,'TEST starter',true,'billing-test:seed')", [seed]);
await db.query("insert into public.activities(id,type,section,title,status) values('BILLING-TEST','activity','Vital Life','Billing test','published')");
await db.query("insert into public.resources(id,slug,title,resource_type,status) values('BILLING-R001','billing-resource','Billing resource','pdf','published')");
await db.query("insert into public.activity_resources(activity_id,resource_id,use_type) values('BILLING-TEST','BILLING-R001','primary')");
await db.query('insert into public.community_blocks(blocker_id,blocked_profile_id) values($1,$2)', [member, other]);
await db.query("insert into public.community_posts(id,room_id,author_id,title,body) values($1,'10000000-0000-4000-8000-000000000001',$2,'Billing-gated conversation','TEST private member content')", [post, member]);
await db.query("insert into public.subscription_entitlements(profile_id,entitlement_id,status,expires_at) values($1,'vital_membership','active','2030-01-01')", [other]);
const before = { activities: await count('activities'), resources: await count('resources'), links: await count('activity_resources'), profiles: await count('profiles'), posts: await count('community_posts'), entitlements: await count('subscription_entitlements') };

const migration = await readFile(new URL('../../supabase/migrations/20260914180000_revenuecat_subscription_foundation.sql', import.meta.url), 'utf8');
await db.exec(migration);

function state(status, overrides = {}) {
  return {
    entitlement_id: 'vital_membership', provider: 'revenuecat', revenuecat_customer_id: member,
    status, store: 'app_store', platform: 'ios', environment: 'sandbox', offering_id: 'default',
    product_id: 'uk.co.vitalcollective.membership.monthly', plan_kind: 'standard_monthly',
    started_at: '2026-09-14T12:00:00Z', expires_at: '2030-01-01T00:00:00Z',
    grace_period_ends_at: null, cancelled_at: null, billing_issue_at: null,
    trial_started_at: null, trial_ends_at: null, refunded_at: null, revoked_at: null,
    auto_renewing: true, provider_updated_at: '2026-09-14T12:00:00Z', source_event_id: 'event-test',
    ...overrides,
  };
}
async function apply(next) {
  await as(null, 'service_role');
  await db.query('select public.apply_revenuecat_membership_state($1,$2::jsonb)', [member, JSON.stringify(next)]);
}

test('migration is data-preserving and creates the minimal provider projection and ledger', async () => {
  await root();
  assert.deepEqual({ activities: await count('activities'), resources: await count('resources'), links: await count('activity_resources'), profiles: await count('profiles'), posts: await count('community_posts'), entitlements: await count('subscription_entitlements') }, before);
  const columns = (await rows("select column_name from information_schema.columns where table_schema='public' and table_name='subscription_entitlements'")).map(row => row.column_name);
  for (const name of ['store', 'platform', 'environment', 'revenuecat_customer_id', 'plan_kind', 'grace_period_ends_at', 'billing_issue_at', 'trial_ends_at', 'refunded_at', 'revoked_at', 'provider_verified_at']) assert.ok(columns.includes(name), name);
  assert.equal(await count('subscription_provider_events'), 0);
  assert.doesNotMatch(migration, /insert\s+into\s+auth\.|update\s+auth\.|delete\s+from\s+auth\./i);
});

test('non-entitled genuine members retain own-account access but cannot read substantive data', async () => {
  await as(member);
  assert.equal((await rows('select id from public.profiles where id=auth.uid()')).length, 1);
  assert.equal((await rows("select public.current_vital_membership() value"))[0].value.state, 'no_entitlement');
  assert.equal((await rows("select id from public.activities where id='BILLING-TEST'")).length, 0);
  assert.equal((await rows("select id from public.resources where id='BILLING-R001'")).length, 0);
  assert.equal((await rows('select profile_id from public.community_blocked_members()')).length, 0);
  assert.deepEqual((await rows('select public.search_community_posts() value'))[0].value.items, []);
  await assert.rejects(db.query("insert into public.saved_activities(profile_id,activity_id,list_type) values(auth.uid(),'BILLING-TEST','try_later')"), /row-level security/i);
  await assert.rejects(db.query('select * from public.subscription_entitlements'), /permission denied/i);
  await assert.rejects(db.query('select * from public.subscription_provider_events'), /permission denied/i);
});

test('a legacy row is preserved but cannot grant access until RevenueCat verifies it', async () => {
  await as(other);
  assert.equal((await rows('select public.has_valid_vital_membership() value'))[0].value, false);
  assert.equal((await rows("select id from public.activities where id='BILLING-TEST'")).length, 0);
  await root();
  assert.equal((await rows("select count(*)::int n from public.subscription_entitlements where profile_id=$1 and status='active'", [other]))[0].n, 1);
});

test('server projection grants trial, active, cancelled-through-expiry and valid grace access only', async () => {
  for (const status of ['trial', 'active', 'cancelled']) {
    await apply(state(status, { auto_renewing: status !== 'cancelled' }));
    await as(member);
    const current = (await rows('select public.current_vital_membership() value'))[0].value;
    assert.equal(current.has_access, true, status);
    assert.equal((await rows("select id from public.activities where id='BILLING-TEST'")).length, 1, status);
    assert.equal((await rows('select profile_id from public.community_blocked_members()')).length, 1, status);
    assert.equal((await rows('select public.search_community_posts() value'))[0].value.items.length, 1, status);
  }
  await apply(state('grace_period', { expires_at: '2020-01-01T00:00:00Z', grace_period_ends_at: '2030-01-01T00:00:00Z', billing_issue_at: '2026-09-14T12:00:00Z' }));
  await as(member);
  assert.equal((await rows('select public.has_valid_vital_membership() value'))[0].value, true);
  for (const [status, overrides] of [
    ['expired', { expires_at: '2020-01-01T00:00:00Z' }],
    ['billing_issue', { billing_issue_at: '2026-09-14T12:00:00Z' }],
    ['refunded', { refunded_at: '2026-09-14T12:00:00Z' }],
    ['revoked', { revoked_at: '2026-09-14T12:00:00Z' }],
  ]) {
    await apply(state(status, overrides)); await as(member);
    assert.equal((await rows('select public.has_valid_vital_membership() value'))[0].value, false, status);
    assert.equal((await rows("select id from public.activities where id='BILLING-TEST'")).length, 0, status);
  }
});

test('provider writes and idempotency functions are service-only and replay-safe', async () => {
  await as(member);
  await assert.rejects(db.query("select public.apply_revenuecat_membership_state($1,'{}'::jsonb)", [member]), /permission denied/i);
  await as(null, 'service_role');
  const hash = 'a'.repeat(64);
  assert.equal((await rows("select public.claim_subscription_provider_event('evt-1','RENEWAL','sandbox',$1,$2) value", [hash, member]))[0].value, 'claimed');
  assert.equal((await rows("select public.claim_subscription_provider_event('evt-1','RENEWAL','sandbox',$1,$2) value", [hash, member]))[0].value, 'busy');
  await db.query("select public.complete_subscription_provider_event('evt-1','processed')");
  assert.equal((await rows("select public.claim_subscription_provider_event('evt-1','RENEWAL','sandbox',$1,$2) value", [hash, member]))[0].value, 'duplicate');
  assert.equal((await rows("select attempt_count from public.subscription_provider_events where event_id='evt-1'"))[0].attempt_count, 1);
  assert.equal((await rows("select public.claim_subscription_provider_event('evt-retry','RENEWAL','sandbox',$1,$2) value", [hash, member]))[0].value, 'claimed');
  await db.query("select public.complete_subscription_provider_event('evt-retry','failed','temporary')");
  assert.equal((await rows("select public.claim_subscription_provider_event('evt-retry','RENEWAL','sandbox',$1,$2) value", [hash, member]))[0].value, 'claimed');
  assert.equal((await rows("select attempt_count from public.subscription_provider_events where event_id='evt-retry'"))[0].attempt_count, 2);
});

test('seed identities cannot satisfy membership and account deletion cascades state while pseudonymising the ledger', async () => {
  await as(seed);
  await assert.rejects(db.query('select public.current_vital_membership()'), /Authenticated Vital member required/i);
  assert.equal((await rows('select public.has_valid_vital_membership() value'))[0].value, false);
  await apply(state('active'));
  await as(null, 'service_role');
  await db.query("select public.claim_subscription_provider_event('evt-delete','INITIAL_PURCHASE','sandbox',$1,$2)", ['b'.repeat(64), member]);
  await db.query("select public.complete_subscription_provider_event('evt-delete','processed')");
  await root(); await db.query('delete from auth.users where id=$1', [member]);
  assert.equal((await rows('select count(*)::int n from public.subscription_entitlements where profile_id=$1', [member]))[0].n, 0);
  const ledger = (await rows("select profile_id,customer_id_hash from public.subscription_provider_events where event_id='evt-delete'"))[0];
  assert.equal(ledger.profile_id, null); assert.equal(ledger.customer_id_hash, 'b'.repeat(64));
  assert.equal((await rows('select count(*)::int n from public.profiles where id=$1', [other]))[0].n, 1);
});

test.after(async () => { await db.close(); });

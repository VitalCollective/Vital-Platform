import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

export const PROFILE_IMAGE_BUCKET = 'profile-images';
export const PROFILE_IMAGE_MAX_BYTES = 524288;
export function starterProfileId(batch, key) {
  const hex = createHash('md5').update(`vital-starter:profile:${batch}:${key}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function validStarterImagePath(path, batch, key) {
  return typeof path === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9][a-z0-9-]{0,79}\.(jpg|jpeg|png|webp)$/.test(path)
    && path.split('/')[0] === starterProfileId(batch, key);
}

// Approved public display names only. No gender attribute is stored or inferred.
export const APPROVED_NAMES = Object.freeze([
  'MidgetMary', 'Sophie M', 'WelshMam', 'LeanneP', 'RainyDayRachel', 'Priya N',
  'LauraJ', 'Nicola G', 'Katie E', 'Aisha H', 'MumOfMonsters', 'Sarah D', 'AmyK',
  'ClaireBear', 'SuperMum', 'DadBodDan', 'GarethJ', 'Tom H', 'OutdoorDad', 'Mike P',
  'BenA', 'PurplePenguin', 'CoffeeFirst', 'ChaosCoordinator', 'JustJo', 'SnackDealer',
  'TinyTornadoes', 'ProbablyLost', 'CheeseToastie', 'TwoLeftWellies',
]);
const TYPES = new Set(['question', 'idea', 'experience', 'tip', 'discussion']);
const TOPICS = new Set(['Mums', 'Kids', 'Together', 'Life', 'Food']);
const keyPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;
export function validateSeedBundle(bundle, now = new Date()) {
  const errors = [];
  const warnings = [];
  const problem = (condition, message) => { if (!condition) errors.push(message); };
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new Error('Bundle must be a JSON object.');
  // V3 cannot silently lose images against the V2 RPC or reach the retired V1 Auth path.
  problem(bundle.schema_version === 3, 'schema_version must be 3 (optional profile images; non-login starters).');
  problem(typeof bundle.batch_key === 'string' && keyPattern.test(bundle.batch_key), 'Invalid batch_key.');
  problem(bundle.editorial_approved === true, 'The final editorial dataset must be explicitly approved.');
  const maps = {};
  for (const group of ['profiles', 'posts', 'replies', 'reactions']) {
    problem(Array.isArray(bundle[group]), `${group} must be an array.`);
    const rows = Array.isArray(bundle[group]) ? bundle[group] : [];
    const map = new Map(); maps[group] = map;
    rows.forEach((row, index) => {
      const label = `${group}[${index}]`;
      if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`${label} must be an object.`); return; }
      problem(typeof row.key === 'string' && keyPattern.test(row.key), `${label}: invalid key.`);
      problem(!map.has(row.key), `${label}: duplicate key ${row.key}.`);
      map.set(row.key, row);
      const stamp = typeof row.created_at === 'string' ? Date.parse(row.created_at) : NaN;
      problem(Number.isFinite(stamp) && /(?:Z|[+-]\d{2}:\d{2})$/.test(row.created_at) && stamp <= now.getTime(), `${label}: explicit historical created_at with timezone required.`);
      const allowed = {
        profiles: ['key', 'display_name', 'created_at', 'avatar_path'],
        posts: ['key', 'author_key', 'post_type', 'topic', 'title', 'body', 'activity_id', 'tags', 'created_at'],
        replies: ['key', 'author_key', 'post_key', 'parent_key', 'body', 'created_at'],
        reactions: ['key', 'author_key', 'target_type', 'target_key', 'created_at'],
      }[group];
      for (const name of Object.keys(row)) problem(allowed.includes(name), `${label}: unsupported field ${name}. No private attributes, embedded photos, credentials or testimonials metadata.`);
      if (group === 'profiles') problem(row.avatar_path == null || validStarterImagePath(row.avatar_path, bundle.batch_key, row.key), `${label}: avatar_path must be an app-owned image in this starter's UUID folder (jpg, jpeg, png or webp).`);
    });
  }
  problem(maps.profiles.size === 30, 'Exactly 30 approved starter profiles are required.');
  const names = [...maps.profiles.values()].map((p) => p.display_name);
  problem(new Set(names).size === 30 && APPROVED_NAMES.every((name) => names.includes(name)), 'Use the 30 approved public identities exactly once.');
  problem(maps.posts.size >= 1 && maps.posts.size <= 100, 'Provide between 1 and 100 posts.');
  problem(maps.replies.size <= 300 && maps.reactions.size <= 300, 'V1 supports at most 300 replies and 300 reactions per reviewed batch.');
  if (maps.posts.size !== 36) warnings.push(`Expected approximately 36 posts; found ${maps.posts.size}.`);
  if (maps.replies.size !== 80) warnings.push(`Expected approximately 80 replies; found ${maps.replies.size}.`);
  function text(value, max, label) { problem(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${label}: nonblank text up to ${max} characters required.`); }
  function author(row, label) {
    const profile = maps.profiles.get(row.author_key);
    problem(Boolean(profile), `${label}: missing author ${row.author_key}.`);
    if (profile) problem(Date.parse(row.created_at) >= Date.parse(profile.created_at), `${label}: content predates its profile.`);
  }
  for (const p of maps.posts.values()) {
    author(p, `post ${p.key}`); text(p.title, 200, `post ${p.key} title`); text(p.body, 20000, `post ${p.key} body`);
    problem(TYPES.has(p.post_type), `post ${p.key}: invalid post_type.`);
    problem(p.topic == null || TOPICS.has(p.topic), `post ${p.key}: invalid topic.`);
    problem(p.activity_id == null || (typeof p.activity_id === 'string' && /^[A-Z0-9-]{1,60}$/.test(p.activity_id)), `post ${p.key}: invalid activity_id.`);
    problem(p.tags == null || (Array.isArray(p.tags) && p.tags.length <= 10 && p.tags.every((t) => typeof t === 'string' && t.trim() && t.length <= 60)), `post ${p.key}: invalid tags.`);
  }
  for (const r of maps.replies.values()) {
    author(r, `reply ${r.key}`); text(r.body, 10000, `reply ${r.key} body`);
    const post = maps.posts.get(r.post_key);
    problem(Boolean(post), `reply ${r.key}: missing post.`);
    if (post) problem(Date.parse(r.created_at) >= Date.parse(post.created_at), `reply ${r.key}: reply predates post.`);
    if (r.parent_key != null) {
      const parent = maps.replies.get(r.parent_key);
      problem(Boolean(parent) && parent.post_key === r.post_key && parent.key !== r.key && parent.parent_key == null, `reply ${r.key}: parent must be a root reply on the same post.`);
      if (parent) problem(Date.parse(r.created_at) >= Date.parse(parent.created_at), `reply ${r.key}: reply predates parent.`);
    }
  }
  const reactions = new Set();
  for (const r of maps.reactions.values()) {
    author(r, `reaction ${r.key}`);
    const target = r.target_type === 'post' ? maps.posts.get(r.target_key) : r.target_type === 'reply' ? maps.replies.get(r.target_key) : null;
    problem(Boolean(target), `reaction ${r.key}: missing/invalid target.`);
    if (target) problem(Date.parse(r.created_at) >= Date.parse(target.created_at), `reaction ${r.key}: reaction predates target.`);
    const pair = `${r.author_key}:${r.target_type}:${r.target_key}`;
    problem(!reactions.has(pair), `reaction ${r.key}: duplicate author/target.`); reactions.add(pair);
  }
  return { valid: errors.length === 0, errors, warnings, counts: Object.fromEntries(Object.entries(maps).map(([k, v]) => [k, v.size])) };
}

export async function importStarterBundle(client, bundle) {
  const validation = validateSeedBundle(bundle);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  if (/^(test|automated-test)(-|$)/.test(bundle.batch_key)) throw new Error('Test fixtures cannot be imported through execute mode.');
  // Only read metadata; image upload is a separate, explicitly approved workflow.
  for (const profile of bundle.profiles.filter(profile => profile.avatar_path != null)) {
    const { data, error } = await client.storage.from(PROFILE_IMAGE_BUCKET).info(profile.avatar_path);
    if (error || !data || !['image/jpeg','image/png','image/webp'].includes(data.contentType)
      || !Number.isFinite(data.size) || data.size < 1 || data.size > PROFILE_IMAGE_MAX_BYTES) {
      throw new Error(`Profile ${profile.key}: image is missing or outside the supported type/size limits. No import attempted.`);
    }
  }
  const activityIds = [...new Set(bundle.posts.map((p) => p.activity_id).filter(Boolean))];
  if (activityIds.length) {
    const { data, error } = await client.from('activities').select('id').eq('status', 'published').in('id', activityIds);
    if (error) throw new Error('Could not verify the linked Vital activities. No import attempted.');
    const found = new Set(data.map((row) => row.id));
    const missing = activityIds.filter((id) => !found.has(id));
    if (missing.length) throw new Error(`Unavailable linked activities: ${missing.join(', ')}`);
  }
  const { data, error } = await client.rpc('import_community_starters', { payload: bundle });
  if (error) throw new Error(`Starter import was not confirmed (${error.code ?? 'unknown'}). Inspect administrative logs; an identical-bundle replay can safely verify the outcome. Do not change the batch key or content to retry.`);
  if (!data?.verified || data.identity_mode !== 'non_login_profiles' || data.image_references_verified !== true
    || Object.entries(validation.counts).some(([key, expected]) => data.counts?.[key] !== expected)) throw new Error('Starter database verification failed: identity architecture or returned counts differ from the approved bundle.');
  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf('--input');
  const input = inputIndex >= 0 ? args[inputIndex + 1] : null;
  const execute = args.includes('--execute');
  if (!input) throw new Error('Usage: node scripts/community/seed.mjs --input reviewed.json --dry-run | --execute --confirm-project <SUPABASE_URL>');
  if (execute && args.includes('--dry-run')) throw new Error('Choose one mode.');
  const bundle = JSON.parse(await readFile(resolve(input), 'utf8'));
  const validation = validateSeedBundle(bundle);
  console.log(JSON.stringify(validation, null, 2));
  if (!validation.valid) { process.exitCode = 1; return; }
  if (!execute) { console.log('Dry-run complete. No database or Auth operation performed.'); return; }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const confirm = args[args.indexOf('--confirm-project') + 1];
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be supplied through process environment only.');
  if (!args.includes('--confirm-project') || confirm !== url) throw new Error('The explicit --confirm-project must match SUPABASE_URL.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  console.log(JSON.stringify(await importStarterBundle(client, bundle), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : 'Starter import failed.'); process.exitCode = 1; });
}

import type { SupabaseClient } from '@supabase/supabase-js';

export const PROFILE_IMAGE_BUCKET = 'profile-images';
const pathPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9][a-z0-9-]{0,79}\.(?:jpg|jpeg|png|webp)$/;
export type ImageProfile = { id: string; avatar_url: string | null };

// Reuse the existing avatar_url column for a durable app-owned storage reference,
// not an expiring signed URL, arbitrary tracking URL, data URL or local filename.
export function profileImagePath(reference: string | null | undefined, profileId: string): string | null {
  if (!reference?.startsWith(`${PROFILE_IMAGE_BUCKET}/`)) return null;
  const path = reference.slice(PROFILE_IMAGE_BUCKET.length + 1);
  return pathPattern.test(path) && path.split('/')[0] === profileId ? path : null;
}
export function profileInitials(name: string): string {
  return name.trim().split(/\s+/u).slice(0, 2).map(part => Array.from(part)[0] ?? '').join('').toUpperCase() || 'V';
}
export function avatarImageVisible(uri: string | null | undefined, failedUri: string | null): boolean {
  return Boolean(uri && uri !== failedUri);
}

export function createProfileImageResolver(client: SupabaseClient) {
  const cache = new Map<string, { url: string | null; expires: number }>();
  return async (profiles: ImageProfile[], now = Date.now()): Promise<Map<string, string | null>> => {
    const paths = new Map(profiles.map(p => [p.id, profileImagePath(p.avatar_url, p.id)]));
    const missing = [...new Set([...paths.values()].filter((path): path is string => Boolean(path)))].filter(path => (cache.get(path)?.expires ?? 0) <= now);
    if (missing.length) {
      try {
        const { data, error } = await client.storage.from(PROFILE_IMAGE_BUCKET).createSignedUrls(missing, 3600);
        for (const path of missing) {
          const item = !error ? data?.find(item => item.path === path && !item.error) : null;
          cache.set(path, { url: item?.signedUrl || null, expires: now + (item?.signedUrl ? 55 * 60_000 : 30_000) });
        }
      } catch {
        // Optional images never turn a successful Community read into an error.
        for (const path of missing) cache.set(path, { url: null, expires: now + 30_000 });
      }
      while (cache.size > 128) cache.delete(cache.keys().next().value!);
    }
    return new Map([...paths].map(([id, path]) => [id, path ? cache.get(path)?.url ?? null : null]));
  };
}
const resolvers = new WeakMap<SupabaseClient, ReturnType<typeof createProfileImageResolver>>();
export function profileImageResolver(client: SupabaseClient) {
  let resolver = resolvers.get(client);
  if (!resolver) { resolver = createProfileImageResolver(client); resolvers.set(client, resolver); }
  return resolver;
}

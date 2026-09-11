import { profileImageResolver } from '@/lib/profile-images';
import { requireSupabase } from '@/lib/supabase';

export async function getOwnCommunityProfile(id: string) {
  const client = requireSupabase();
  const { data, error } = await client.from('profiles').select('id,display_name,avatar_url').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const images = await profileImageResolver(client)([data]);
  return { id: data.id, displayName: data.display_name, imageUrl: images.get(id) ?? null };
}

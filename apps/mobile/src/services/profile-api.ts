import type { SupabaseClient } from '@supabase/supabase-js';
import { invalidateProfileImageCache, profileImagePath, profileImageResolver } from '../lib/profile-images.ts';
import { profileValidation } from '../features/account/account-model.ts';

export const COMMUNITY_PROFILE_FIELDS = 'id,display_name,avatar_url,bio';
export type MemberProfile = { id: string; displayName: string; avatarReference: string | null; imageUrl: string | null; bio: string | null };
type ProfileRow = { id: string; display_name: string; avatar_url: string | null; bio: string | null };
export function createProfileApi(client: SupabaseClient) {
  async function resolve(row: ProfileRow): Promise<MemberProfile> {
    const images = await profileImageResolver(client)([row]);
    return { id: row.id, displayName: row.display_name, avatarReference: row.avatar_url, imageUrl: images.get(row.id) ?? null, bio: row.bio };
  }
  return {
    async read(id: string) {
      const { data, error } = await client.from('profiles').select(COMMUNITY_PROFILE_FIELDS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? resolve(data as ProfileRow) : null;
    },
    async update(id: string, displayName: string, bio: string) {
      const validation = profileValidation(displayName, bio);
      if (validation) throw new Error(validation);
      const { data: session, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (session.session?.user.id !== id) throw new Error('Profile session changed');
      const expectedBio = bio.trim() || null;
      const { data, error } = await client.from('profiles').update({ display_name: displayName.trim(), bio: expectedBio })
        .eq('id', id).select(COMMUNITY_PROFILE_FIELDS).single();
      if (error) throw error;
      if (!data || data.id !== id || data.bio !== expectedBio) throw new Error('Profile update was not confirmed');
      // Hydrate the caller from the acknowledged database row, not a stale
      // tab-level read or Auth metadata. There is only one persisted bio.
      return resolve(data as ProfileRow);
    },
    async updateAvatar(id: string, avatarReference: string | null) {
      if (avatarReference !== null && !profileImagePath(avatarReference, id)) throw new Error('Invalid profile image reference');
      const { data: session, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (session.session?.user.id !== id) throw new Error('Profile session changed');
      const { data, error } = await client.from('profiles').update({ avatar_url: avatarReference })
        .eq('id', id).select(COMMUNITY_PROFILE_FIELDS).single();
      if (error) throw error;
      if (!data || data.id !== id || data.avatar_url !== avatarReference) throw new Error('Profile photo update was not confirmed');
      invalidateProfileImageCache(client, profileImagePath(avatarReference, id));
      return resolve(data as ProfileRow);
    },
  };
}

import { requireSupabase } from '@/lib/supabase';
import { createProfileApi } from './profile-api';

export function getOwnCommunityProfile(id: string) {
  return createProfileApi(requireSupabase()).read(id);
}
export function updateOwnCommunityProfile(id: string, displayName: string, bio: string) {
  return createProfileApi(requireSupabase()).update(id, displayName, bio);
}

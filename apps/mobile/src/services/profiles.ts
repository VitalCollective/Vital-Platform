import { requireSupabase } from '@/lib/supabase';
import { createProfileApi } from './profile-api';
import { createProfilePhotoApi, type PreparedProfilePhoto } from './profile-photo-api';

export function getOwnCommunityProfile(id: string) {
  return createProfileApi(requireSupabase()).read(id);
}
export function updateOwnCommunityProfile(id: string, displayName: string, bio: string) {
  return createProfileApi(requireSupabase()).update(id, displayName, bio);
}
export function updateOwnProfilePhoto(id: string, photo: PreparedProfilePhoto) {
  return createProfilePhotoApi(requireSupabase()).upload(id, photo);
}
export function removeOwnProfilePhoto(id: string) {
  return createProfilePhotoApi(requireSupabase()).remove(id);
}

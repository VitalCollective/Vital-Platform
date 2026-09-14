import type { SupabaseClient } from '@supabase/supabase-js';
import { reportTechnicalError } from '../lib/errors.ts';
import {
  invalidateProfileImageCache,
  PROFILE_IMAGE_BUCKET,
  PROFILE_IMAGE_MAX_BYTES,
  profileImagePath,
  profileImageReference,
} from '../lib/profile-images.ts';
import { createProfileApi, type MemberProfile } from './profile-api.ts';

export type PreparedProfilePhoto = { bytes: ArrayBuffer; contentType: 'image/jpeg' };

type Options = {
  key?: () => string;
  reportCleanupError?: (cause: unknown) => void;
};

export function createProfilePhotoApi(client: SupabaseClient, options: Options = {}) {
  const profiles = createProfileApi(client);
  const key = options.key ?? (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const reportCleanupError = options.reportCleanupError ?? ((cause) => reportTechnicalError('Clean up replaced profile photo', cause));

  async function member(id: string) {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!id || data.session?.user.id !== id) throw new Error('Profile session changed');
  }

  async function cleanup(id: string, keepPath: string | null) {
    const { data, error } = await client.storage.from(PROFILE_IMAGE_BUCKET).list(id, { limit: 100 });
    if (error) throw error;
    const paths = (data ?? []).map(object => `${id}/${object.name}`)
      .filter(path => path !== keepPath && Boolean(profileImagePath(profileImageReference(path), id)));
    if (!paths.length) return;
    const removed = await client.storage.from(PROFILE_IMAGE_BUCKET).remove(paths);
    if (removed.error) throw removed.error;
    for (const path of paths) invalidateProfileImageCache(client, path);
  }

  async function cleanupWithoutFailingSave(id: string, keepPath: string | null) {
    try { await cleanup(id, keepPath); }
    catch (cause) { reportCleanupError(cause); }
  }

  return {
    async upload(id: string, photo: PreparedProfilePhoto): Promise<MemberProfile> {
      await member(id);
      if (photo.contentType !== 'image/jpeg' || photo.bytes.byteLength < 1 || photo.bytes.byteLength > PROFILE_IMAGE_MAX_BYTES) {
        throw new Error('Prepared profile photo is outside the supported upload limits');
      }
      const path = `${id}/avatar-${key()}.jpg`;
      if (!profileImagePath(profileImageReference(path), id)) throw new Error('Invalid profile image path');
      const uploaded = await client.storage.from(PROFILE_IMAGE_BUCKET).upload(path, photo.bytes, {
        contentType: photo.contentType, cacheControl: '3600', upsert: false,
      });
      if (uploaded.error) throw uploaded.error;
      try {
        const saved = await profiles.updateAvatar(id, profileImageReference(path));
        await cleanupWithoutFailingSave(id, path);
        return saved;
      } catch (cause) {
        const rollback = await client.storage.from(PROFILE_IMAGE_BUCKET).remove([path]);
        if (rollback.error) reportCleanupError(rollback.error);
        throw cause;
      }
    },
    async remove(id: string): Promise<MemberProfile> {
      await member(id);
      const saved = await profiles.updateAvatar(id, null);
      await cleanupWithoutFailingSave(id, null);
      return saved;
    },
  };
}

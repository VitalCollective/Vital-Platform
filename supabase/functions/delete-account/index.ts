import { createClient } from 'npm:@supabase/supabase-js@2';
import { createDeleteAccountHandler, DeletionProblem } from './handler.ts';

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required Edge Function environment: ${name}`);
  return value;
}

const supabaseUrl = requiredEnvironment('SUPABASE_URL');
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? requiredEnvironment('SUPABASE_PUBLISHABLE_KEY');
const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const handler = createDeleteAccountHandler({
  now: () => Date.now(),
  async verifyUser(token) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, lastSignInAt: data.user.last_sign_in_at ?? null };
  },
  async getManifest(token) {
    const memberClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await memberClient.rpc('account_deletion_manifest');
    if (error) {
      const detail = `${error.message ?? ''} ${error.details ?? ''}`;
      if (detail.includes('ACCOUNT_ROLE_REQUIRES_REVIEW')) {
        throw new DeletionProblem('account_role_requires_review', 409, 'Contact Vital support before deleting this account.');
      }
      if (detail.includes('ACCOUNT_DELETION_NOT_GENUINE_MEMBER')) {
        throw new DeletionProblem('not_genuine_member', 403, 'This account cannot use member deletion.');
      }
      throw error;
    }
    return data;
  },
  async listAvatarObjects(profileId) {
    const paths: string[] = [];
    const pageSize = 100;
    for (let offset = 0; offset < 1000; offset += pageSize) {
      const { data, error } = await admin.storage.from('profile-images').list(profileId, {
        limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new DeletionProblem('avatar_cleanup_failed', 500, "We couldn't remove your profile image.");
      for (const object of data ?? []) if (object.id) paths.push(`${profileId}/${object.name}`);
      if ((data?.length ?? 0) < pageSize) return paths;
    }
    throw new DeletionProblem('avatar_cleanup_too_large', 409, 'Contact Vital support before deleting this account.');
  },
  async removeAvatarObjects(paths) {
    const { error } = await admin.storage.from('profile-images').remove(paths);
    if (error) throw new DeletionProblem('avatar_cleanup_failed', 500, "We couldn't remove your profile image.");
  },
  async authorizeDeletion(profileId) {
    const { error } = await admin.rpc('authorize_account_deletion', { requested_profile_id: profileId });
    if (error) throw new DeletionProblem('deletion_authorization_failed', 500, "We couldn't delete your account. Please try again.");
  },
  async clearDeletionAuthorization(profileId) {
    const { error } = await admin.from('account_deletion_authorizations').delete().eq('profile_id', profileId);
    if (error) throw error;
  },
  async deleteAuthUser(profileId) {
    const { error } = await admin.auth.admin.deleteUser(profileId, false);
    if (error) throw new DeletionProblem('deletion_failed', 500, "We couldn't delete your account. Please try again.");
  },
  reportFailure(code) { console.error(`[delete-account] request failed: ${code}`); },
});

Deno.serve(handler);

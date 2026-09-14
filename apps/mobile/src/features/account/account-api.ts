import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityPreferences, Family, Membership, NotificationPreferences } from './account-model.ts';

export class AccountDeletionError extends Error {
  constructor(message: string) { super(message); this.name = 'AccountDeletionError'; }
}

async function deletionError(cause: unknown): Promise<AccountDeletionError> {
  let code: unknown;
  const context = typeof cause === 'object' && cause !== null && 'context' in cause
    ? (cause as { context?: Response }).context : undefined;
  try { code = context ? (await context.clone().json() as { code?: unknown }).code : undefined; }
  catch { code = undefined; }
  if (code === 'recent_auth_required') {
    return new AccountDeletionError('For security, sign out and sign in again, then return here to delete your account.');
  }
  if (code === 'account_role_requires_review') {
    return new AccountDeletionError('This account has Community responsibilities that must be transferred safely. Please contact Vital support.');
  }
  return new AccountDeletionError("We couldn't delete your account. Nothing has been reported as successfully deleted. Please try again.");
}

export function createAccountApi(client: SupabaseClient) {
  async function member(id: string) {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!id || data.session?.user.id !== id) throw new Error('Account session changed');
  }
  async function one<T>(table: string, fields: string, id: string): Promise<T | null> {
    await member(id);
    const { data, error } = await client.from(table).select(fields).eq('profile_id', id).maybeSingle();
    if (error) throw error;
    return data as T | null;
  }
  async function update(table: string, id: string, values: object) {
    await member(id);
    const { error } = await client.from(table).update(values).eq('profile_id', id).select('profile_id').single();
    if (error) throw error; // Missing rows are errors, not a pretended successful save.
  }
  return {
    async families(id: string): Promise<Family[]> {
      await member(id);
      const { data, error } = await client.from('families')
        .select('id,name,members:family_members(id,display_name,relationship,age_band,age_years,interests)')
        .eq('owner_id', id).eq('members.active', true).order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as Family[];
    },
    async preferences(id: string) {
      const [activities, notifications, newsletter] = await Promise.all([
        one<ActivityPreferences>('user_preferences', 'preferred_sections,interests', id),
        one<NotificationPreferences>('notification_preferences', 'community_replies,planned_activity_reminders,recommendations,editorial_updates,product_updates', id),
        one<{ subscribed: boolean }>('newsletter_preferences', 'subscribed', id),
      ]);
      return { activities, notifications, newsletter };
    },
    async memberships(id: string): Promise<Membership[]> {
      await member(id);
      const { data, error } = await client.from('subscription_entitlements').select('status,started_at,expires_at,auto_renewing')
        .eq('profile_id', id).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Membership[];
    },
    saveActivities: (id: string, value: ActivityPreferences) => update('user_preferences', id, {
      preferred_sections: value.preferred_sections, interests: value.interests,
    }),
    saveNotifications: (id: string, value: NotificationPreferences) => update('notification_preferences', id, {
      community_replies: value.community_replies, planned_activity_reminders: value.planned_activity_reminders,
      recommendations: value.recommendations, editorial_updates: value.editorial_updates, product_updates: value.product_updates,
    }),
    saveNewsletter: (id: string, subscribed: boolean) => update('newsletter_preferences', id, {
      subscribed, ...(subscribed ? { subscribed_at: new Date().toISOString(), unsubscribed_at: null } : { unsubscribed_at: new Date().toISOString() }),
    }),
    async deleteAccount(id: string, confirmation: string): Promise<void> {
      await member(id);
      if (confirmation !== 'DELETE') throw new AccountDeletionError('Type DELETE to confirm account deletion.');
      const { data, error } = await client.functions.invoke('delete-account', { body: { confirmation } });
      if (error) throw await deletionError(error);
      if (data?.deleted !== true) throw new AccountDeletionError("We couldn't confirm that your account was deleted. Please try again.");
    },
  };
}
export type AccountApi = ReturnType<typeof createAccountApi>;

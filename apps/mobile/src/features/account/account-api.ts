import type { SupabaseClient } from '@supabase/supabase-js';
import { familyMemberValidation, type ActivityPreferences, type Family, type FamilyMember, type FamilyMemberInput, type Membership, type NotificationPreferences } from './account-model.ts';

const FAMILY_MEMBER_FIELDS = 'id,family_id,display_name,relationship,age_years,age_confirmed_at';

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
  function familyValues(input: FamilyMemberInput) {
    const invalid = familyMemberValidation(input.displayName, input.relationship, String(input.ageYears));
    if (invalid) throw new Error(invalid);
    return { display_name: input.displayName.trim() || null, relationship: input.relationship, age_years: input.ageYears };
  }
  async function familyContainer(id: string): Promise<string> {
    const existing = await client.from('families').select('id').eq('owner_id', id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) return existing.data.id;
    const created = await client.from('families').insert({ owner_id: id }).select('id').single();
    if (created.error) throw created.error;
    return created.data.id;
  }
  return {
    async families(id: string): Promise<Family[]> {
      await member(id);
      const { data, error } = await client.from('families')
        .select(`id,name,members:family_members(${FAMILY_MEMBER_FIELDS})`)
        .eq('owner_id', id).order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as Family[];
    },
    async addFamilyMember(id: string, input: FamilyMemberInput): Promise<FamilyMember> {
      await member(id);
      const values = familyValues(input);
      const familyId = await familyContainer(id);
      const { data, error } = await client.from('family_members').insert({ family_id: familyId, ...values })
        .select(FAMILY_MEMBER_FIELDS).single();
      if (error) throw error;
      return data as FamilyMember;
    },
    async updateFamilyMember(id: string, memberId: string, input: FamilyMemberInput): Promise<FamilyMember> {
      await member(id);
      if (!memberId) throw new Error('Family member is required');
      const { data, error } = await client.from('family_members').update(familyValues(input)).eq('id', memberId)
        .select(FAMILY_MEMBER_FIELDS).single();
      if (error) throw error;
      return data as FamilyMember;
    },
    async removeFamilyMember(id: string, memberId: string): Promise<void> {
      await member(id);
      if (!memberId) throw new Error('Family member is required');
      const { error } = await client.from('family_members').delete().eq('id', memberId).select('id').single();
      if (error) throw error;
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

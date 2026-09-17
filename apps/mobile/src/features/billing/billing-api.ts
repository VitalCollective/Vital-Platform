import type { SupabaseClient } from '@supabase/supabase-js';
import { parseVerifiedMembership, type VerifiedMembership } from './billing-model.ts';

export function createBillingApi(client: SupabaseClient) {
  async function member(id: string) {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!id || data.session?.user.id !== id) throw new Error('Billing session changed');
  }
  return {
    async membership(id: string): Promise<VerifiedMembership> {
      await member(id);
      const { data, error } = await client.rpc('current_vital_membership');
      if (error) throw error;
      return parseVerifiedMembership(data);
    },
    async reconcile(id: string): Promise<void> {
      await member(id);
      const { data, error } = await client.functions.invoke('reconcile-membership', { body: {} });
      if (error || data?.reconciled !== true) throw error ?? new Error('Membership reconciliation failed');
    },
    async claimWelcome(id: string): Promise<boolean> {
      await member(id);
      const { data, error } = await client.rpc('claim_vital_membership_welcome');
      if (error) throw error;
      return data === true;
    },
  };
}
export type BillingApi = ReturnType<typeof createBillingApi>;

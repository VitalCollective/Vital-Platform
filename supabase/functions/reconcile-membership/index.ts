import { createClient } from 'npm:@supabase/supabase-js@2';
import { createReconcileMembershipHandler } from './handler.ts';

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required Edge Function environment: ${name}`);
  return value;
}

const supabaseUrl = required('SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const revenueCatSecretKey = required('REVENUECAT_SECRET_API_KEY');
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const handler = createReconcileMembershipHandler({
  async verifyUser(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id };
  },
  async isGenuineProfile(id) {
    const { data, error } = await admin.from('profiles').select('id,auth_user_id,is_seeded')
      .eq('id', id).maybeSingle();
    if (error) throw error;
    return Boolean(data && !data.is_seeded && data.auth_user_id === data.id);
  },
  async fetchSubscriber(id) {
    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${revenueCatSecretKey}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('revenuecat_lookup_failed');
    return await response.json();
  },
  async applyState(id, state) {
    const { error } = await admin.rpc('apply_revenuecat_membership_state', {
      requested_profile_id: id, state,
    });
    if (error) throw error;
  },
  async clearState(id) {
    const { error } = await admin.rpc('clear_revenuecat_membership_state', {
      requested_profile_id: id,
    });
    if (error) throw error;
  },
  reportFailure(code) { console.error(`[reconcile-membership] request failed: ${code}`); },
});

Deno.serve(handler);

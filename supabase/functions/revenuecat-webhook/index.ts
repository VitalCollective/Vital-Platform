import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRevenueCatWebhookHandler } from './handler.ts';

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

const handler = createRevenueCatWebhookHandler({
  authorization: required('REVENUECAT_WEBHOOK_AUTHORIZATION'),
  hmacSecret: required('REVENUECAT_WEBHOOK_HMAC_SECRET'),
  nowSeconds: () => Math.floor(Date.now() / 1000),
  async findGenuineProfiles(ids) {
    if (!ids.length) return [];
    const { data, error } = await admin.from('profiles')
      .select('id,auth_user_id,is_seeded').in('id', ids);
    if (error) throw error;
    return (data ?? []).filter((profile) => !profile.is_seeded && profile.auth_user_id === profile.id)
      .map((profile) => profile.id);
  },
  async claimEvent(event) {
    const { data, error } = await admin.rpc('claim_subscription_provider_event', {
      requested_event_id: event.id,
      requested_event_type: event.type,
      requested_environment: event.environment,
      requested_customer_id_hash: event.customerIdHash,
      requested_profile_id: event.profileId,
    });
    if (error) throw error;
    return data;
  },
  async fetchSubscriber(profileId) {
    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(profileId)}`, {
      headers: { Authorization: `Bearer ${revenueCatSecretKey}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('revenuecat_lookup_failed');
    return await response.json();
  },
  async applyState(profileId, state) {
    const { error } = await admin.rpc('apply_revenuecat_membership_state', {
      requested_profile_id: profileId, state,
    });
    if (error) throw error;
  },
  async clearState(profileId) {
    const { error } = await admin.rpc('clear_revenuecat_membership_state', {
      requested_profile_id: profileId,
    });
    if (error) throw error;
  },
  async completeEvent(id, status, errorCode) {
    const { error } = await admin.rpc('complete_subscription_provider_event', {
      requested_event_id: id,
      requested_status: status,
      requested_error_code: errorCode ?? null,
    });
    if (error) throw error;
  },
  reportFailure(code) { console.error(`[revenuecat-webhook] request failed: ${code}`); },
});

Deno.serve(handler);

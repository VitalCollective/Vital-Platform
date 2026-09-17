export const VITAL_ENTITLEMENT_ID = 'vital_membership';

export type RevenueCatEvent = {
  id: string;
  type: string;
  app_user_id: string;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  environment: 'SANDBOX' | 'PRODUCTION';
  event_timestamp_ms?: number;
  entitlement_ids?: string[] | null;
  product_id?: string | null;
  offering_id?: string | null;
  cancel_reason?: string | null;
  expiration_reason?: string | null;
};

type RevenueCatSubscription = {
  billing_issues_detected_at?: string | null;
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  is_sandbox?: boolean;
  original_purchase_date?: string | null;
  period_type?: string | null;
  purchase_date?: string | null;
  refunded_at?: string | null;
  store?: string | null;
  unsubscribe_detected_at?: string | null;
};

export type RevenueCatSubscriberResponse = {
  request_date?: string;
  subscriber?: {
    entitlements?: Record<string, {
      expires_date?: string | null;
      grace_period_expires_date?: string | null;
      product_identifier?: string | null;
      purchase_date?: string | null;
    }>;
    subscriptions?: Record<string, RevenueCatSubscription>;
  };
};

export type VerifiedMembershipState = {
  entitlement_id: typeof VITAL_ENTITLEMENT_ID;
  provider: 'revenuecat';
  revenuecat_customer_id: string;
  status: 'trial' | 'active' | 'cancelled' | 'grace_period' | 'billing_issue' | 'expired' | 'refunded' | 'revoked';
  store: 'app_store' | 'play_store' | 'promotional' | 'unknown';
  platform: 'ios' | 'android' | 'unknown';
  environment: 'sandbox' | 'production';
  offering_id: string | null;
  product_id: string | null;
  plan_kind: 'standard_monthly' | 'standard_annual' | 'partner_monthly' | 'partner_annual' | 'unknown';
  started_at: string | null;
  expires_at: string | null;
  grace_period_ends_at: string | null;
  cancelled_at: string | null;
  billing_issue_at: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  refunded_at: string | null;
  revoked_at: string | null;
  auto_renewing: boolean;
  provider_updated_at: string;
  source_event_id: string | null;
};

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyRevenueCatSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const values = Object.fromEntries(signatureHeader.split(',').map((part) => {
    const separator = part.indexOf('=');
    return separator > 0
      ? [part.slice(0, separator).trim(), part.slice(separator + 1).trim()]
      : ['', ''];
  }));
  const timestamp = Number(values.t);
  const received = values.v1?.toLocaleLowerCase();
  if (!Number.isInteger(timestamp) || !received || !/^[0-9a-f]{64}$/.test(received)) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC', key, encoder.encode(`${timestamp}.${rawBody}`),
  );
  return constantTimeEqual(bytesToHex(new Uint8Array(signature)), received);
}

export async function hashRevenueCatIdentifier(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseRevenueCatEvent(value: unknown): RevenueCatEvent | null {
  if (!value || typeof value !== 'object') return null;
  const event = 'event' in value ? (value as { event?: unknown }).event : null;
  if (!event || typeof event !== 'object') return null;
  const candidate = event as Partial<RevenueCatEvent>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim()
    || typeof candidate.type !== 'string' || !candidate.type.trim()
    || typeof candidate.app_user_id !== 'string' || !candidate.app_user_id.trim()
    || !['SANDBOX', 'PRODUCTION'].includes(candidate.environment ?? '')) return null;
  const stringArray = (entry: unknown) => entry == null
    || (Array.isArray(entry) && entry.every((item) => typeof item === 'string'));
  const optionalString = (entry: unknown) => entry == null || typeof entry === 'string';
  if (!stringArray(candidate.aliases) || !stringArray(candidate.entitlement_ids)
    || !optionalString(candidate.original_app_user_id)
    || !optionalString(candidate.product_id) || !optionalString(candidate.offering_id)
    || !optionalString(candidate.cancel_reason) || !optionalString(candidate.expiration_reason)
    || (candidate.event_timestamp_ms != null
      && (typeof candidate.event_timestamp_ms !== 'number' || !Number.isFinite(candidate.event_timestamp_ms)))) return null;
  return candidate as RevenueCatEvent;
}

function normalizedStore(value: string | null | undefined): VerifiedMembershipState['store'] {
  const store = value?.toLocaleLowerCase();
  if (store === 'app_store' || store === 'mac_app_store') return 'app_store';
  if (store === 'play_store') return 'play_store';
  if (store === 'promotional') return 'promotional';
  return 'unknown';
}

function planKind(productId: string | null): VerifiedMembershipState['plan_kind'] {
  const value = productId?.toLocaleLowerCase() ?? '';
  if (value.includes('partner') && value.includes('monthly')) return 'partner_monthly';
  if (value.includes('partner') && value.includes('annual')) return 'partner_annual';
  if (value.includes('monthly')) return 'standard_monthly';
  if (value.includes('annual')) return 'standard_annual';
  return 'unknown';
}

function date(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function eventDate(event: RevenueCatEvent | null, fallback: string): string {
  return event?.event_timestamp_ms && Number.isFinite(event.event_timestamp_ms)
    ? new Date(event.event_timestamp_ms).toISOString()
    : fallback;
}

export function normalizeRevenueCatSubscriber(
  customerId: string,
  response: RevenueCatSubscriberResponse,
  event: RevenueCatEvent | null = null,
  now = new Date(),
): VerifiedMembershipState | null {
  const subscriber = response.subscriber ?? {};
  const entitlement = subscriber.entitlements?.[VITAL_ENTITLEMENT_ID];
  const subscriptions = subscriber.subscriptions ?? {};
  const eventConcernsVital = event?.entitlement_ids?.includes(VITAL_ENTITLEMENT_ID)
    || event?.product_id?.includes('vitalcollective')
    || event?.product_id?.startsWith('vital_')
    || false;
  const productId = entitlement?.product_identifier ?? event?.product_id ?? null;
  if (!entitlement && !eventConcernsVital) return null;

  const subscription = (productId && subscriptions[productId])
    || Object.values(subscriptions).find((item) => item.expires_date === entitlement?.expires_date)
    || {};
  const updatedAt = date(response.request_date) ?? eventDate(event, now.toISOString());
  const expiresAt = date(entitlement?.expires_date ?? subscription.expires_date);
  const graceEndsAt = date(entitlement?.grace_period_expires_date ?? subscription.grace_period_expires_date);
  const cancelledAt = date(subscription.unsubscribe_detected_at);
  const billingIssueAt = date(subscription.billing_issues_detected_at);
  // The REST subscriber snapshot is authoritative. Event fields are fallbacks
  // only after the entitlement has disappeared, so a delayed old webhook cannot
  // downgrade a newer active renewal for the same customer.
  const refundedAt = date(subscription.refunded_at)
    ?? (!entitlement && (['CUSTOMER_SUPPORT', 'REFUND'].includes(event?.cancel_reason ?? '')
      || ['CUSTOMER_SUPPORT', 'REFUND'].includes(event?.expiration_reason ?? '')
      || ['REFUND', 'REFUNDED'].includes(event?.type ?? ''))
      ? eventDate(event, updatedAt) : null);
  const revokedAt = !entitlement && (['REVOKE', 'REVOKED'].includes(event?.type ?? '')
    || event?.expiration_reason === 'REVOKED') ? eventDate(event, updatedAt) : null;
  const expiresInFuture = expiresAt ? Date.parse(expiresAt) > now.getTime() : false;
  const graceInFuture = graceEndsAt ? Date.parse(graceEndsAt) > now.getTime() : false;
  const isTrial = subscription.period_type?.toLocaleLowerCase() === 'trial';

  let status: VerifiedMembershipState['status'];
  if (refundedAt) status = 'refunded';
  else if (revokedAt) status = 'revoked';
  else if (graceInFuture && billingIssueAt) status = 'grace_period';
  else if (billingIssueAt && !graceInFuture) status = 'billing_issue';
  else if (!expiresInFuture) status = 'expired';
  else if (cancelledAt) status = 'cancelled';
  else if (isTrial) status = 'trial';
  else status = 'active';

  const store = normalizedStore(subscription.store);
  return {
    entitlement_id: VITAL_ENTITLEMENT_ID,
    provider: 'revenuecat',
    revenuecat_customer_id: customerId,
    status,
    store,
    platform: store === 'app_store' ? 'ios' : store === 'play_store' ? 'android' : 'unknown',
    environment: event?.environment === 'SANDBOX' || subscription.is_sandbox ? 'sandbox' : 'production',
    offering_id: event?.offering_id ?? null,
    product_id: productId,
    plan_kind: planKind(productId),
    started_at: date(subscription.original_purchase_date ?? subscription.purchase_date ?? entitlement?.purchase_date),
    expires_at: expiresAt,
    grace_period_ends_at: graceEndsAt,
    cancelled_at: cancelledAt,
    billing_issue_at: billingIssueAt,
    trial_started_at: isTrial ? date(subscription.purchase_date ?? entitlement?.purchase_date) : null,
    trial_ends_at: isTrial ? expiresAt : null,
    refunded_at: refundedAt,
    revoked_at: revokedAt,
    auto_renewing: !cancelledAt && !['cancelled', 'expired', 'refunded', 'revoked'].includes(status),
    provider_updated_at: updatedAt,
    source_event_id: event?.id ?? null,
  };
}

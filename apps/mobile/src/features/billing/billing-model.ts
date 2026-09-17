export const VITAL_ENTITLEMENT_ID = 'vital_membership';
export const REVENUECAT_OFFERING_ID = 'default';
export const BILLING_PRODUCTS = {
  standardMonthly: 'uk.co.vitalcollective.membership.monthly',
  standardAnnual: 'uk.co.vitalcollective.membership.annual',
  partnerMonthly: 'uk.co.vitalcollective.partner.monthly',
  partnerAnnual: 'uk.co.vitalcollective.partner.annual',
} as const;

export type MembershipState =
  | 'no_entitlement'
  | 'trial_available'
  | 'trial_active'
  | 'active'
  | 'cancelled'
  | 'grace_period'
  | 'billing_issue'
  | 'expired'
  | 'refunded'
  | 'revoked'
  | 'restoring'
  | 'provider_unavailable';

export type VerifiedMembership = {
  state: Exclude<MembershipState, 'trial_available' | 'restoring' | 'provider_unavailable'>;
  hasAccess: boolean;
  planKind: 'standard_monthly' | 'standard_annual' | 'partner_monthly' | 'partner_annual' | 'unknown' | null;
  productId: string | null;
  store: 'app_store' | 'play_store' | 'promotional' | 'unknown' | null;
  platform: 'ios' | 'android' | 'unknown' | null;
  environment: 'sandbox' | 'production' | null;
  startedAt: string | null;
  periodEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  trialEndsAt: string | null;
  autoRenewing: boolean | null;
  billingIssue: boolean;
  providerVerifiedAt: string | null;
};

export type BillingPlan = {
  id: 'monthly' | 'annual';
  packageIdentifier: '$rc_monthly' | '$rc_annual';
  productId: string;
  title: string;
  price: string;
  interval: string;
  trialDescription: string | null;
};

export const EMPTY_MEMBERSHIP: VerifiedMembership = {
  state: 'no_entitlement', hasAccess: false, planKind: null, productId: null,
  store: null, platform: null, environment: null, startedAt: null,
  periodEndsAt: null, gracePeriodEndsAt: null, trialEndsAt: null,
  autoRenewing: null, billingIssue: false, providerVerifiedAt: null,
};

const states = new Set([
  'no_entitlement', 'trial_active', 'active', 'cancelled', 'grace_period',
  'billing_issue', 'expired', 'refunded', 'revoked',
]);
const planKinds = new Set([
  'standard_monthly', 'standard_annual', 'partner_monthly', 'partner_annual', 'unknown',
]);

export function parseVerifiedMembership(value: unknown): VerifiedMembership {
  if (!value || typeof value !== 'object') throw new Error('Invalid membership response');
  const row = value as Record<string, unknown>;
  if (typeof row.state !== 'string' || !states.has(row.state) || typeof row.has_access !== 'boolean') {
    throw new Error('Invalid membership response');
  }
  const text = (key: string) => typeof row[key] === 'string' ? row[key] as string : null;
  const plan = text('plan_kind');
  return {
    state: row.state as VerifiedMembership['state'],
    hasAccess: row.has_access,
    planKind: plan && planKinds.has(plan) ? plan as VerifiedMembership['planKind'] : null,
    productId: text('product_id'),
    store: text('store') as VerifiedMembership['store'],
    platform: text('platform') as VerifiedMembership['platform'],
    environment: text('environment') as VerifiedMembership['environment'],
    startedAt: text('started_at'),
    periodEndsAt: text('period_ends_at'),
    gracePeriodEndsAt: text('grace_period_ends_at'),
    trialEndsAt: text('trial_ends_at'),
    autoRenewing: typeof row.auto_renewing === 'boolean' ? row.auto_renewing : null,
    billingIssue: row.billing_issue === true,
    providerVerifiedAt: text('provider_verified_at'),
  };
}

export function verifiedAccessStillCurrent(membership: VerifiedMembership, now = Date.now()): boolean {
  if (!membership.hasAccess || ['refunded', 'revoked', 'expired', 'billing_issue'].includes(membership.state)) return false;
  const boundary = verifiedMembershipBoundary(membership);
  return boundary !== null && boundary > now;
}

export function verifiedMembershipBoundary(membership: VerifiedMembership): number | null {
  const end = membership.state === 'grace_period'
    ? membership.gracePeriodEndsAt ?? membership.periodEndsAt
    : membership.periodEndsAt;
  if (!end) return null;
  const boundary = Date.parse(end);
  return Number.isFinite(boundary) ? boundary : null;
}

export function currentVerifiedMembership(
  membership: VerifiedMembership | null,
  now = Date.now(),
): VerifiedMembership | null {
  return membership && verifiedAccessStillCurrent(membership, now) ? membership : null;
}

const MAX_TIMER_DELAY_MS = 2_147_000_000;

type BoundaryTimerOptions = {
  now?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
};

export function scheduleVerifiedMembershipBoundaryRefresh(
  membership: VerifiedMembership,
  refresh: () => void,
  options: BoundaryTimerOptions = {},
): () => void {
  const boundary = verifiedMembershipBoundary(membership);
  if (boundary === null) return () => undefined;

  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    const remaining = boundary - now();
    if (remaining <= 0) {
      refresh();
      return;
    }
    timer = setTimer(() => {
      if (!cancelled) schedule();
    }, Math.min(remaining, MAX_TIMER_DELAY_MS));
  };

  schedule();
  return () => {
    cancelled = true;
    if (timer) clearTimer(timer);
  };
}

export function returnedToForeground(previousState: string, nextState: string): boolean {
  return nextState === 'active' && previousState !== 'active';
}

export function membershipHeading(membership: VerifiedMembership): string {
  if (membership.state === 'trial_active') return 'Your free trial is active';
  if (membership.state === 'cancelled' && membership.hasAccess) return 'Your access remains active';
  if (membership.state === 'grace_period') return 'Your membership needs attention';
  if (membership.state === 'billing_issue') return 'Update your payment method';
  if (membership.state === 'expired') return 'Your membership has ended';
  if (membership.state === 'refunded' || membership.state === 'revoked') return 'Your membership is no longer active';
  if (membership.hasAccess) return membership.planKind?.includes('annual') ? 'Annual membership' : 'Monthly membership';
  return 'Join Vital Collective';
}

export function formatMembershipDate(value: string | null): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(value));
}

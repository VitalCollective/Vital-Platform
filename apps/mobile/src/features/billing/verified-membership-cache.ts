import {
  currentVerifiedMembership,
  parseVerifiedMembership,
  type VerifiedMembership,
} from './billing-model.ts';

const CACHE_KEY = 'vital.verified-membership.v1';

export type MembershipCacheStorage = {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => unknown;
  setItem: (key: string, value: string) => unknown;
};

function projection(membership: VerifiedMembership) {
  return {
    state: membership.state,
    has_access: membership.hasAccess,
    plan_kind: membership.planKind,
    product_id: membership.productId,
    store: membership.store,
    platform: membership.platform,
    environment: membership.environment,
    started_at: membership.startedAt,
    period_ends_at: membership.periodEndsAt,
    grace_period_ends_at: membership.gracePeriodEndsAt,
    trial_ends_at: membership.trialEndsAt,
    auto_renewing: membership.autoRenewing,
    billing_issue: membership.billingIssue,
    provider_verified_at: membership.providerVerifiedAt,
  };
}

export function readVerifiedMembershipCache(
  userId: string,
  now = Date.now(),
  storage?: MembershipCacheStorage,
): VerifiedMembership | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as { version?: unknown; userId?: unknown; membership?: unknown };
    if (record.version !== 1 || record.userId !== userId) {
      storage.removeItem(CACHE_KEY);
      return null;
    }
    return currentVerifiedMembership(parseVerifiedMembership(record.membership), now);
  } catch {
    try {
      storage.removeItem(CACHE_KEY);
    } catch {
      // Ignore storage failures; the cache never grants access without a valid record.
    }
    return null;
  }
}

export function writeVerifiedMembershipCache(
  userId: string,
  membership: VerifiedMembership,
  storage?: MembershipCacheStorage,
): void {
  if (!storage) return;
  try {
    if (!currentVerifiedMembership(membership)) {
      storage.removeItem(CACHE_KEY);
      return;
    }
    storage.setItem(CACHE_KEY, JSON.stringify({
      version: 1,
      userId,
      membership: projection(membership),
    }));
  } catch {
    // The cache is an offline fallback only. Server verification remains authoritative.
  }
}

export function clearVerifiedMembershipCache(
  storage?: MembershipCacheStorage,
): void {
  try {
    storage?.removeItem(CACHE_KEY);
  } catch {
    // A failed cache cleanup must not obstruct sign-out or account switching.
  }
}

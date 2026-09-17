import { createContext, useContext } from 'react';
import type { BillingPlan, MembershipState, VerifiedMembership } from './billing-model';

export type BillingContextValue = {
  userId: string | null;
  isResolving: boolean;
  state: MembershipState;
  membership: VerifiedMembership;
  hasAccess: boolean;
  providerAvailable: boolean;
  purchasesEnabled: boolean;
  plans: BillingPlan[];
  managementUrl: string | null;
  busyAction: 'purchase' | 'restore' | null;
  error: string | null;
  refresh: () => Promise<void>;
  purchase: (plan: BillingPlan['id']) => Promise<void>;
  restore: () => Promise<void>;
};

export const BillingContext = createContext<BillingContextValue | null>(null);
export function useBilling() {
  const value = useContext(BillingContext);
  if (!value) throw new Error('useBilling must be used within BillingProvider.');
  return value;
}

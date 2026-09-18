import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/features/auth/auth-context';
import { customerSafeErrorMessage, reportTechnicalError } from '@/lib/errors';
import { withRequestTimeout } from '@/lib/request-lifecycle';
import { sessionStorage } from '@/lib/session-storage';
import { supabase } from '@/lib/supabase';
import { createBillingApi } from './billing-api';
import { billingConfig } from './billing-config';
import { BillingContext, type BillingContextValue } from './billing-context';
import {
  currentVerifiedMembership,
  EMPTY_MEMBERSHIP,
  returnedToForeground,
  scheduleVerifiedMembershipBoundaryRefresh,
  verifiedAccessStillCurrent,
  type BillingPlan,
  type VerifiedMembership,
} from './billing-model';
import {
  clearRevenueCatPresentation,
  observeRevenueCatCustomerInfo,
  prepareRevenueCat,
  purchaseRevenueCatPlan,
  restoreRevenueCatPurchases,
  type RevenueCatPresentation,
} from './revenuecat-client';
import {
  clearVerifiedMembershipCache,
  readVerifiedMembershipCache,
  writeVerifiedMembershipCache,
} from './verified-membership-cache';

const EMPTY_PRESENTATION: RevenueCatPresentation = { available: false, plans: [], managementUrl: null };

function purchaseWasCancelled(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null
    && 'userCancelled' in cause && cause.userCancelled === true;
}

export function BillingProvider({ children }: PropsWithChildren) {
  const { user, isLoading: authLoading, isPasswordRecovery, revalidateSession } = useAuth();
  const api = useMemo(() => supabase ? createBillingApi(supabase) : null, []);
  const [membership, setMembership] = useState(EMPTY_MEMBERSHIP);
  const [presentation, setPresentation] = useState(EMPTY_PRESENTATION);
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [busyAction, setBusyAction] = useState<BillingContextValue['busyAction']>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const verified = useRef<{ userId: string; membership: VerifiedMembership } | null>(null);

  const load = useCallback(async (
    id: string,
    { reconcile = true, refreshProvider = true } = {},
  ) => {
    const request = ++generation.current;
    setIsResolving(true); setServerUnavailable(false); setProviderUnavailable(false); setError(null);
    const [serverResult, providerResult] = await Promise.allSettled([
      withRequestTimeout(api ? api.membership(id) : Promise.reject(new Error('Supabase is not configured'))),
      refreshProvider ? withRequestTimeout(prepareRevenueCat(id)) : Promise.resolve(null),
    ]);
    if (request !== generation.current) return;
    const provider = providerResult.status === 'fulfilled' ? providerResult.value : null;
    if (provider) setPresentation(provider);
    if (refreshProvider && providerResult.status === 'rejected') {
      reportTechnicalError('Load RevenueCat membership options', providerResult.reason);
      setProviderUnavailable(true);
      setError("We couldn't load store membership options just now. Please try again.");
    }

    let next = serverResult.status === 'fulfilled' ? serverResult.value : null;
    if (reconcile && api && (!refreshProvider || provider?.available)) {
      try {
        await withRequestTimeout(api.reconcile(id));
        next = await withRequestTimeout(api.membership(id));
      } catch (cause) {
        reportTechnicalError('Reconcile RevenueCat membership', cause);
      }
    }
    if (request !== generation.current) return;
    if (next) {
      verified.current = { userId: id, membership: next };
      writeVerifiedMembershipCache(id, next, sessionStorage);
      setMembership(next);
    } else {
      const cached = verified.current?.userId === id ? verified.current.membership : null;
      const stillCurrent = currentVerifiedMembership(cached);
      if (stillCurrent) setMembership(stillCurrent);
      else setMembership(EMPTY_MEMBERSHIP);
      setServerUnavailable(true);
      setError("We couldn't confirm your membership just now. Please try again.");
    }
    setResolvedUserId(id);
    setIsResolving(false);
  }, [api]);

  useEffect(() => {
    generation.current += 1;
    setBusyAction(null); setError(null); clearRevenueCatPresentation();
    if (authLoading || !user || isPasswordRecovery) {
      verified.current = null;
      setMembership(EMPTY_MEMBERSHIP); setPresentation(EMPTY_PRESENTATION);
      setResolvedUserId(null);
      setServerUnavailable(false); setProviderUnavailable(false); setIsResolving(false);
      if (!authLoading && !user) clearVerifiedMembershipCache(sessionStorage);
      return;
    }
    const cached = readVerifiedMembershipCache(user.id, Date.now(), sessionStorage);
    verified.current = cached ? { userId: user.id, membership: cached } : null;
    setResolvedUserId(null);
    setMembership(cached ?? EMPTY_MEMBERSHIP); setPresentation(EMPTY_PRESENTATION);
    void load(user.id);
  }, [authLoading, isPasswordRecovery, load, user?.id]);

  useEffect(() => {
    if (authLoading || !user || isPasswordRecovery) return;
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const shouldRefresh = returnedToForeground(previousState, nextState);
      previousState = nextState;
      if (shouldRefresh) void (async () => {
        setIsResolving(true);
        try {
          await revalidateSession();
        } catch (cause) {
          reportTechnicalError('Refresh Supabase session on foreground', cause);
        }
        await load(user.id);
      })();
    });
    return () => subscription.remove();
  }, [authLoading, isPasswordRecovery, load, revalidateSession, user?.id]);

  useEffect(() => {
    if (!user || isPasswordRecovery || resolvedUserId !== user.id
      || !verifiedAccessStillCurrent(membership)) return;
    return scheduleVerifiedMembershipBoundaryRefresh(
      membership,
      () => void load(user.id),
    );
  }, [isPasswordRecovery, load, membership, resolvedUserId, user?.id]);

  useEffect(() => {
    if (!user || isPasswordRecovery || resolvedUserId !== user.id) return;
    let cancelled = false;
    let unsubscribe: () => void = () => undefined;
    void observeRevenueCatCustomerInfo(user.id, () => {
      void load(user.id, { refreshProvider: false });
    }).then((removeListener) => {
      if (cancelled) removeListener();
      else unsubscribe = removeListener;
    }).catch((cause) => reportTechnicalError('Observe RevenueCat membership updates', cause));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isPasswordRecovery, load, resolvedUserId, user?.id]);

  const run = useCallback(async (action: 'purchase' | 'restore', plan?: BillingPlan['id']) => {
    if (!user || busyAction) return;
    setBusyAction(action); setError(null);
    try {
      if (action === 'purchase' && plan) await purchaseRevenueCatPlan(user.id, plan);
      else await restoreRevenueCatPurchases(user.id);
      if (!api) throw new Error('Supabase is not configured');
      await api.reconcile(user.id);
      await load(user.id, { reconcile: false });
    } catch (cause) {
      if (action === 'purchase' && purchaseWasCancelled(cause)) return;
      reportTechnicalError(`${action} membership`, cause);
      setError(customerSafeErrorMessage(
        `${action} membership`, cause,
        action === 'restore'
          ? "We couldn't restore purchases just now. Please try again."
          : "We couldn't start your membership. No successful purchase has been confirmed.",
      ));
    } finally { setBusyAction(null); }
  }, [api, busyAction, load, user]);

  const displayedState = busyAction === 'restore' ? 'restoring'
    : serverUnavailable || (providerUnavailable && !verifiedAccessStillCurrent(membership))
    ? 'provider_unavailable' : membership.state === 'no_entitlement'
    && presentation.plans.some((plan) => Boolean(plan.trialDescription))
    ? 'trial_available' : membership.state;
  const value = useMemo<BillingContextValue>(() => ({
    userId: user?.id ?? null,
    isResolving: isResolving || Boolean(user && resolvedUserId !== user.id),
    state: displayedState,
    membership,
    hasAccess: verifiedAccessStillCurrent(membership),
    providerAvailable: presentation.available,
    purchasesEnabled: billingConfig.purchasesEnabled,
    plans: presentation.plans,
    managementUrl: presentation.managementUrl,
    busyAction,
    error,
    refresh: async () => { if (user) await load(user.id); },
    purchase: async (plan) => run('purchase', plan),
    restore: async () => run('restore'),
  }), [busyAction, displayedState, error, isResolving, load, membership, presentation, resolvedUserId, run, user]);
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

import { Platform } from 'react-native';
import type {
  CustomerInfo,
  CustomerInfoUpdateListener,
  PurchasesPackage,
} from 'react-native-purchases';
import {
  billingConfig,
  reportTestFlightBillingDiagnostic,
  revenueCatApiKey,
} from './billing-config';
import type { BillingPlan, IntroEligibilityStatus } from './billing-model';
import {
  REVENUECAT_OFFERING_ID,
  shouldPresentFreeTrial,
  storeLocalizedPlanPrice,
} from './billing-model';
import { reportTechnicalError } from '@/lib/errors';

export type RevenueCatPresentation = {
  available: boolean;
  plans: BillingPlan[];
  managementUrl: string | null;
};

let purchasesModule: typeof import('react-native-purchases').default | null = null;
let configuredUserId: string | null = null;
let presentedPackages = new Map<BillingPlan['id'], PurchasesPackage>();

function hasSevenDayAndroidFreePhase(aPackage: PurchasesPackage): boolean {
  const free = aPackage.product.defaultOption?.freePhase;
  if (!free) return false;
  const period = free.billingPeriod;
  return (period.unit === 'WEEK' && period.value === 1)
    || (period.unit === 'DAY' && period.value === 7);
}

function plan(
  aPackage: PurchasesPackage,
  iosEligibility: IntroEligibilityStatus = 'unknown',
): BillingPlan | null {
  const id = aPackage.identifier === '$rc_monthly' ? 'monthly'
    : aPackage.identifier === '$rc_annual' ? 'annual' : null;
  if (!id) return null;
  const trialEligible = shouldPresentFreeTrial(
    Platform.OS,
    iosEligibility,
    hasSevenDayAndroidFreePhase(aPackage),
  );
  return {
    id,
    packageIdentifier: aPackage.identifier as BillingPlan['packageIdentifier'],
    productId: aPackage.product.identifier,
    title: id === 'monthly' ? 'Monthly' : 'Annual',
    price: storeLocalizedPlanPrice(aPackage.product, id, billingConfig.purchaseChannel),
    interval: id === 'monthly' ? 'per month' : 'per year',
    trialEligible,
    trialDescription: trialEligible ? '7 days free' : null,
  };
}

export type RevenueCatTrialEligibility = Partial<Record<BillingPlan['id'], boolean>>;

async function iosIntroEligibility(
  Purchases: typeof import('react-native-purchases').default,
  packages: PurchasesPackage[],
): Promise<RevenueCatTrialEligibility> {
  const eligibility: RevenueCatTrialEligibility = {};
  if (Platform.OS !== 'ios' || packages.length === 0) return eligibility;
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(
      packages.map((item) => item.product.identifier),
    );
    for (const item of packages) {
      const status = result[item.product.identifier]?.status;
      const value: IntroEligibilityStatus = status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
        ? 'eligible'
        : status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE
          ? 'ineligible'
          : status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS
            ? 'no_offer'
            : 'unknown';
      const mapped = plan(item);
      if (mapped) eligibility[mapped.id] = value === 'eligible';
      reportTestFlightBillingDiagnostic('introductory offer eligibility', {
        packageIdentifier: item.identifier,
        productIdentifier: item.product.identifier,
        status: value,
      });
    }
  } catch (cause) {
    // Eligibility is promotional copy, not access state. Fail closed to the
    // paid presentation while keeping otherwise valid store plans available.
    reportTechnicalError('Check introductory offer eligibility', cause);
    for (const item of packages) {
      reportTestFlightBillingDiagnostic('introductory offer eligibility', {
        packageIdentifier: item.identifier,
        productIdentifier: item.product.identifier,
        status: 'request_failed',
      });
    }
  }
  return eligibility;
}

async function module() {
  purchasesModule ??= (await import('react-native-purchases')).default;
  return purchasesModule;
}

export function clearRevenueCatPresentation() {
  // RevenueCat logOut creates an anonymous customer. Keep the SDK identified,
  // but erase everything the signed-out Vital UI could display. The next genuine
  // account is switched directly with logIn(new Supabase UUID).
  presentedPackages = new Map();
}

export async function prepareRevenueCat(userId: string): Promise<RevenueCatPresentation> {
  const apiKey = revenueCatApiKey();
  if (Platform.OS === 'web' || !apiKey) {
    clearRevenueCatPresentation();
    return { available: false, plans: [], managementUrl: null };
  }
  const Purchases = await module();
  if (!configuredUserId) {
    Purchases.configure({ apiKey, appUserID: userId });
  } else if (configuredUserId !== userId) {
    await Purchases.logIn(userId);
  }
  configuredUserId = userId;
  clearRevenueCatPresentation();
  const [offerings, customerInfo] = await Promise.all([
    Purchases.getOfferings(), Purchases.getCustomerInfo(),
  ]);
  const offering = offerings.current?.identifier === REVENUECAT_OFFERING_ID
    ? offerings.current : null;
  const packages = offering?.availablePackages ?? [];
  const plans = packages
    .map((aPackage) => plan(aPackage))
    .filter((value): value is BillingPlan => Boolean(value));
  for (const aPackage of packages) {
    const mapped = plan(aPackage);
    if (mapped) {
      presentedPackages.set(mapped.id, aPackage);
      reportTestFlightBillingDiagnostic('resolved store package', {
        packageIdentifier: aPackage.identifier,
        productIdentifier: aPackage.product.identifier,
        numericPrice: aPackage.product.price,
        currencyCode: aPackage.product.currencyCode,
        priceString: aPackage.product.priceString,
        pricePerMonthString: aPackage.product.pricePerMonthString,
        pricePerYearString: aPackage.product.pricePerYearString,
        displayedPrice: mapped.price,
      });
    }
  }
  reportTestFlightBillingDiagnostic('provider result', {
    providerAvailable: true,
    offeringIdentifier: offering?.identifier ?? null,
    planCount: plans.length,
  });
  return { available: true, plans, managementUrl: customerInfo.managementURL };
}

export async function resolveRevenueCatTrialEligibility(
  userId: string,
): Promise<RevenueCatTrialEligibility | null> {
  if (Platform.OS !== 'ios') return null;
  const Purchases = requireReady(userId);
  return await iosIntroEligibility(Purchases, [...presentedPackages.values()]);
}

function requireReady(userId: string) {
  if (configuredUserId !== userId || !purchasesModule) throw new Error('RevenueCat is not ready for this member');
  return purchasesModule;
}

export async function purchaseRevenueCatPlan(userId: string, id: BillingPlan['id']): Promise<CustomerInfo> {
  if (!billingConfig.purchasesEnabled) throw new Error('Purchases are not enabled');
  const Purchases = requireReady(userId);
  const aPackage = presentedPackages.get(id);
  if (!aPackage) throw new Error('Membership plan is unavailable');
  return (await Purchases.purchasePackage(aPackage)).customerInfo;
}

export async function restoreRevenueCatPurchases(userId: string): Promise<CustomerInfo> {
  return await requireReady(userId).restorePurchases();
}

export async function observeRevenueCatCustomerInfo(
  userId: string,
  onUpdate: () => void,
): Promise<() => void> {
  const apiKey = revenueCatApiKey();
  if (Platform.OS === 'web' || !apiKey) return () => undefined;

  const Purchases = await module();
  if (configuredUserId !== userId) return () => undefined;

  const listener: CustomerInfoUpdateListener = () => {
    if (configuredUserId === userId) onUpdate();
  };
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

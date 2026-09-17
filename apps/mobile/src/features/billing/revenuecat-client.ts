import { Platform } from 'react-native';
import type {
  CustomerInfo,
  CustomerInfoUpdateListener,
  PurchasesPackage,
} from 'react-native-purchases';
import { billingConfig, revenueCatApiKey } from './billing-config';
import type { BillingPlan } from './billing-model';
import { REVENUECAT_OFFERING_ID } from './billing-model';

export type RevenueCatPresentation = {
  available: boolean;
  plans: BillingPlan[];
  managementUrl: string | null;
};

let purchasesModule: typeof import('react-native-purchases').default | null = null;
let configuredUserId: string | null = null;
let presentedPackages = new Map<BillingPlan['id'], PurchasesPackage>();

function trialDescription(aPackage: PurchasesPackage): string | null {
  const intro = aPackage.product.introPrice;
  if (intro?.price === 0) return `${intro.periodNumberOfUnits}-${intro.periodUnit.toLocaleLowerCase()} free trial`;
  const free = aPackage.product.defaultOption?.freePhase;
  if (free) return `${free.billingPeriod?.value ?? 7}-${free.billingPeriod?.unit?.toLocaleLowerCase() ?? 'day'} free trial`;
  return null;
}

function plan(aPackage: PurchasesPackage): BillingPlan | null {
  const id = aPackage.identifier === '$rc_monthly' ? 'monthly'
    : aPackage.identifier === '$rc_annual' ? 'annual' : null;
  if (!id) return null;
  return {
    id,
    packageIdentifier: aPackage.identifier as BillingPlan['packageIdentifier'],
    productId: aPackage.product.identifier,
    title: id === 'monthly' ? 'Monthly' : 'Annual',
    price: aPackage.product.priceString,
    interval: id === 'monthly' ? 'per month' : 'per year',
    trialDescription: trialDescription(aPackage),
  };
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
  const plans = (offering?.availablePackages ?? []).map(plan).filter((value): value is BillingPlan => Boolean(value));
  for (const aPackage of offering?.availablePackages ?? []) {
    const mapped = plan(aPackage);
    if (mapped) presentedPackages.set(mapped.id, aPackage);
  }
  return { available: true, plans, managementUrl: customerInfo.managementURL };
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

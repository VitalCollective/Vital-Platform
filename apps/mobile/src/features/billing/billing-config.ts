import { Platform } from 'react-native';
import { purchaseChannel, purchaseGate } from './billing-gate';

function publicValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && !normalized.includes('replace_me') ? normalized : null;
}

function testStoreValue(value: string | undefined): string | null {
  const normalized = publicValue(value);
  return normalized?.startsWith('test_') ? normalized : null;
}

function googlePlayValue(value: string | undefined): string | null {
  const normalized = publicValue(value);
  return normalized?.startsWith('goog_') ? normalized : null;
}

const isDevelopmentBuild = typeof __DEV__ !== 'undefined' && __DEV__;
const channel = purchaseChannel(process.env.EXPO_PUBLIC_REVENUECAT_PURCHASE_CHANNEL);
const testStoreApiKey = channel === 'test_store' && isDevelopmentBuild
  ? testStoreValue(process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY)
  : null;
const iosApiKey = publicValue(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY);
const androidApiKey = googlePlayValue(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY);

export const billingConfig = {
  purchaseChannel: channel,
  testStoreApiKey,
  iosApiKey,
  androidApiKey,
  purchasesEnabled: purchaseGate({
    channel,
    enabled: process.env.EXPO_PUBLIC_REVENUECAT_PURCHASES_ENABLED === 'true',
    isDevelopmentBuild,
    platform: Platform.OS,
    hasTestStoreKey: Boolean(testStoreApiKey),
    hasIosApiKey: Boolean(iosApiKey),
    hasAndroidApiKey: Boolean(androidApiKey),
  }),
};

export function revenueCatApiKey(): string | null {
  if (billingConfig.testStoreApiKey) return billingConfig.testStoreApiKey;
  if (Platform.OS === 'ios') return billingConfig.iosApiKey;
  if (Platform.OS === 'android') return billingConfig.androidApiKey;
  return null;
}

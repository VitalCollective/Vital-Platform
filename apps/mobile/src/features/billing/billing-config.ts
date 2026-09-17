import { Platform } from 'react-native';

function publicValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && !normalized.includes('replace_me') ? normalized : null;
}

function testStoreValue(value: string | undefined): string | null {
  const normalized = publicValue(value);
  return normalized?.startsWith('test_') ? normalized : null;
}

const isDevelopmentBuild = typeof __DEV__ !== 'undefined' && __DEV__;

export const billingConfig = {
  testStoreApiKey: isDevelopmentBuild
    ? testStoreValue(process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY)
    : null,
  iosApiKey: publicValue(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY),
  androidApiKey: publicValue(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY),
  purchasesEnabled: isDevelopmentBuild
    && process.env.EXPO_PUBLIC_REVENUECAT_PURCHASES_ENABLED === 'true',
};

export function revenueCatApiKey(): string | null {
  if (billingConfig.testStoreApiKey) return billingConfig.testStoreApiKey;
  if (Platform.OS === 'ios') return billingConfig.iosApiKey;
  if (Platform.OS === 'android') return billingConfig.androidApiKey;
  return null;
}

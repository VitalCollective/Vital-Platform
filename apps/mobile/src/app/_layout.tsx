import '@/global.css';

import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StatePanel } from '@/components/vital/state-panel';
import { AuthProvider } from '@/features/auth/auth-provider';
import { useAuth } from '@/features/auth/auth-context';
import { BillingProvider } from '@/features/billing/billing-provider';
import { useBilling } from '@/features/billing/billing-context';
import { MembershipWelcomeModal } from '@/features/billing/membership-welcome-modal';
import { colors, spacing, typography } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { configurationError, isLoading, isPasswordRecovery, session } = useAuth();
  const { hasAccess, isResolving: isMembershipResolving } = useBilling();
  const isPreparing = isLoading
    || Boolean(session && !isPasswordRecovery && isMembershipResolving);

  useEffect(() => {
    if (!isPreparing) void SplashScreen.hideAsync();
  }, [isPreparing]);

  if (isPreparing) {
    return (
      <View style={styles.centered}>
        <Text style={styles.brand}>Vital Collective</Text>
        <Text style={styles.loading}>Preparing something worthwhile…</Text>
      </View>
    );
  }

  if (configurationError) {
    return (
      <View style={styles.configuration}>
        <StatePanel
          kind="error"
          title="Mobile configuration needed"
          message={configurationError}
        />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!session || isPasswordRecovery}>
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session) && !isPasswordRecovery && !hasAccess}>
        <Stack.Screen name="membership" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session) && !isPasswordRecovery && hasAccess}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="activity/[id]"
          options={{
            title: 'Activity',
            headerBackTitle: 'Discover',
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.brand,
            headerShadowVisible: false,
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSerifDisplay_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <BillingProvider>
          <RootNavigator />
          <MembershipWelcomeModal />
          <StatusBar style="dark" />
        </BillingProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.canvas,
  },
  brand: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.title,
  },
  loading: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
  },
  configuration: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.canvas,
  },
});

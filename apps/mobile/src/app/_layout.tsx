import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StatePanel } from '@/components/vital/state-panel';
import { AuthProvider } from '@/features/auth/auth-provider';
import { useAuth } from '@/features/auth/auth-context';
import { colors, spacing, typography } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { configurationError, isLoading, session } = useAuth();

  useEffect(() => {
    if (!isLoading) void SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) {
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
      <Stack.Protected guard={Boolean(session)}>
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
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="dark" />
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
    fontWeight: '600',
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

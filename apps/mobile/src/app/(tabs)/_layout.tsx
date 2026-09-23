import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { AppShell } from '@/components/vital/app-shell';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { colors, typography } from '@/theme/tokens';
import { useLanguage } from '@/features/localization/language-context';

export default function TabLayout() {
  const { isDesktop } = useResponsiveLayout();
  const { t } = useLanguage();

  return (
    <AppShell>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.canvas },
          tabBarActiveTintColor: colors.plum,
          tabBarInactiveTintColor: colors.inkSubtle,
          tabBarStyle: isDesktop
            ? { display: 'none' }
            : {
                height: 68,
                paddingTop: 7,
                paddingBottom: 8,
                borderTopColor: colors.border,
                backgroundColor: colors.surface,
              },
          tabBarLabelStyle: {
            fontFamily: typography.bodySemiboldFamily,
            fontSize: 11,
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: t('Home'),
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: t('Discover'),
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? 'compass' : 'compass-outline'} color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: t('Community'),
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? 'people' : 'people-outline'} color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="saved"
          options={{
            title: t('Saved'),
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? 'bookmark' : 'bookmark-outline'} color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="you"
          options={{
            title: t('You'),
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen name="vital-mums" options={{ href: null }} />
        <Tabs.Screen name="vital-kids" options={{ href: null }} />
        <Tabs.Screen name="vital-together" options={{ href: null }} />
        <Tabs.Screen name="vital-life" options={{ href: null }} />
        <Tabs.Screen name="vital-food" options={{ href: null }} />
      </Tabs>
    </AppShell>
  );
}

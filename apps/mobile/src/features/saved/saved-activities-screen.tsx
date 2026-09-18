import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { ActivityCard } from '@/components/vital/activity-card';
import { Button } from '@/components/vital/button';
import { Screen, ScreenHeader } from '@/components/vital/screen';
import { StatePanel } from '@/components/vital/state-panel';
import { createActivitySavesApi } from '@/features/saved/activity-saves-api';
import { createSavedActivitiesController } from '@/features/saved/saved-activities-state';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { requireSupabase } from '@/lib/supabase';
import { colors, radii, spacing, typography } from '@/theme/tokens';

export function SavedActivitiesScreen({ profileId }: { profileId: string }) {
  const router = useRouter();
  const { isTablet } = useResponsiveLayout();
  const controller = useMemo(() => createSavedActivitiesController(createActivitySavesApi(requireSupabase()), profileId), [profileId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const refresh = useCallback(() => { void controller.refresh(); }, [controller]);
  useFocusEffect(refresh);
  const activities = state.activities ?? [];

  return (
    <Screen scrollProps={{ refreshControl: <RefreshControl refreshing={state.isLoading && state.activities !== null} onRefresh={refresh} tintColor={colors.brand} colors={[colors.brand]} /> }}>
      <ScreenHeader title="Saved" description="Good ideas to come back to, whenever you need them." />
      {state.activities !== null ? (
        <View style={styles.toolbar}>
          <Text style={styles.caption} accessibilityLiveRegion="polite">
            {activities.length} saved {activities.length === 1 ? 'activity' : 'activities'} · newest first
          </Text>
          <Button label="Refresh" icon="refresh-outline" variant="secondary" loading={state.isLoading} onPress={refresh} />
        </View>
      ) : null}
      {state.error ? (
        <StatePanel kind="error" title="Your saved ideas are unavailable" message={state.error} onRetry={refresh} />
      ) : state.isLoading && state.activities === null ? (
        <StatePanel kind="loading" title="Gathering your saved ideas" message="Bringing your saved activities together." />
      ) : activities.length ? (
        <>
          <View style={[styles.cards, isTablet && styles.cardsTablet]}>
            {activities.slice(0, state.visibleCount).map(activity => (
              <View key={activity.id} style={[styles.card, isTablet && styles.cardTablet]}>
                <ActivityCard activity={activity} variant="catalogue" onPress={() => router.push({ pathname: '/activity/[id]', params: { id: activity.id } })} />
              </View>
            ))}
          </View>
          {activities.length > state.visibleCount ? (
            <View style={styles.more}><Button label="Show more saved activities" variant="secondary" disabled={state.isLoading} onPress={controller.showMore} /></View>
          ) : null}
        </>
      ) : (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={30} color={colors.plum} accessible={false} />
          <Text style={styles.emptyTitle}>Keep a few good ideas close</Text>
          <Text style={styles.emptyCopy}>When an activity catches your eye, tap Save. You’ll find it here, ready for another day.</Text>
          <Button label="Find an activity" icon="search-outline" onPress={() => router.navigate('/discover')} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  caption: { color: colors.inkMuted, fontFamily: typography.bodyFamily, fontSize: typography.small },
  cards: { gap: spacing.sm },
  cardsTablet: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { width: '100%' },
  cardTablet: { width: '48%', flexGrow: 1 },
  more: { alignSelf: 'center', marginTop: spacing.lg },
  empty: { alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.brandSoft },
  emptyTitle: { fontFamily: typography.headingFamily, fontSize: typography.heading, color: colors.ink, textAlign: 'center' },
  emptyCopy: { fontFamily: typography.bodyFamily, fontSize: typography.body, lineHeight: 24, color: colors.inkMuted, textAlign: 'center', maxWidth: 420 },
});

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ActivityCard } from '@/components/vital/activity-card';
import { Button } from '@/components/vital/button';
import { FilterChip } from '@/components/vital/filter-chip';
import { Screen, ScreenHeader } from '@/components/vital/screen';
import { StatePanel } from '@/components/vital/state-panel';
import { activityDetailHref } from '@/features/activities/activity-navigation';
import { useSectionActivities } from '@/features/activities/activity-hooks';
import { useLanguage } from '@/features/localization/language-context';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { colors, spacing, typography } from '@/theme/tokens';
import type { AgeFilter, VitalSection } from '@/types/content';

const INITIAL_RESULT_LIMIT = 20;
const RESULT_INCREMENT = 20;

const AGE_OPTIONS: readonly { value: AgeFilter; label: string }[] = [
  { value: 'any', label: 'Any age' },
  { value: '2-4', label: 'Ages 2–4' },
  { value: '5-7', label: 'Ages 5–7' },
  { value: '8-10', label: 'Ages 8–10' },
  { value: '11-13', label: 'Ages 11–13' },
];

export function SectionActivityCatalogue({
  title,
  sentence,
}: {
  title: VitalSection;
  sentence: string;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const { isTablet } = useResponsiveLayout();
  const [age, setAge] = useState<AgeFilter>('any');
  const [resultLimit, setResultLimit] = useState(INITIAL_RESULT_LIMIT);
  const results = useSectionActivities(title, age);
  const showAgeFilter = title === 'Vital Kids' || title === 'Vital Together';

  useEffect(() => {
    setResultLimit(INITIAL_RESULT_LIMIT);
  }, [age, title]);

  const activities = results.data?.activities.slice(0, resultLimit) ?? [];
  const count = results.data?.count ?? 0;
  const hasMoreResults = activities.length < count;

  return (
    <Screen>
      <ScreenHeader eyebrow="Vital Collective" title={t(title)} description={t(sentence)} />

      {showAgeFilter ? (
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{t('Age')}</Text>
          <View style={styles.chipWrap}>
            {AGE_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                label={t(option.label)}
                selected={age === option.value}
                onPress={() => setAge(option.value)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.resultHeader}>
        <Text style={styles.resultTitle} accessibilityLiveRegion="polite">
          {results.isLoading && !results.data
            ? t('Finding activities…')
            : t(count === 1 ? '{count} activity' : '{count} activities', { count: count.toLocaleString() })}
        </Text>
        {showAgeFilter && age !== 'any' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setAge('any')}
            style={styles.resetButton}>
            <Text style={styles.resetText}>{t('Clear age')}</Text>
          </Pressable>
        ) : null}
      </View>

      {results.isLoading && !results.data ? (
        <StatePanel
          kind="loading"
          title={t('Loading {section}', { section: t(title) })}
          message={t('We are gathering ideas from the Vital collection.')}
        />
      ) : results.error ? (
        <StatePanel
          kind="error"
          title={t('Activities are unavailable')}
          message={results.error}
          onRetry={() => void results.retry()}
        />
      ) : activities.length ? (
        <View style={[styles.results, isTablet && styles.resultsTablet]}>
          {results.isLoading ? (
            <View style={styles.refreshing}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.refreshingText}>{t('Updating activities…')}</Text>
            </View>
          ) : null}
          {activities.map((activity) => (
            <View
              key={activity.id}
              style={[styles.resultCard, isTablet && styles.resultCardTablet]}>
              <ActivityCard
                activity={activity}
                variant="catalogue"
                onPress={() => router.push(activityDetailHref(activity.id))}
              />
            </View>
          ))}
        </View>
      ) : (
        <StatePanel
          title={age === 'any' ? t('No activities in {section} yet', { section: t(title) }) : t('No activities for this age')}
          message={
            age === 'any'
              ? t('There are no published activities in this section just now.')
              : t('Try another age group or clear the age filter.')
          }
        />
      )}

      {activities.length && hasMoreResults ? (
        <View style={styles.showMore}>
          <Button
            label={t('Show more')}
            icon="chevron-down"
            variant="secondary"
            onPress={() => setResultLimit((current) => current + RESULT_INCREMENT)}
          />
          <Text style={styles.shownText}>
            {t('Showing {shown} of {count}', { shown: activities.length.toLocaleString(), count: count.toLocaleString() })}
          </Text>
        </View>
      ) : activities.length && count > 0 ? (
        <Text style={styles.endText}>{t('All activities in this section are shown.')}</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterGroup: { gap: spacing.sm, marginBottom: spacing.lg },
  filterLabel: {
    color: colors.ink,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    fontWeight: '700',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  resultTitle: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.subheading,
    fontWeight: '600',
  },
  resetButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  resetText: {
    color: colors.brand,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.small,
  },
  results: { gap: spacing.sm },
  resultsTablet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
  },
  resultCard: { width: '100%' },
  resultCardTablet: {
    width: '48%',
    flexGrow: 1,
  },
  refreshing: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  refreshingText: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
  },
  showMore: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  shownText: {
    color: colors.inkSubtle,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
  },
  endText: {
    marginTop: spacing.xl,
    color: colors.inkSubtle,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    textAlign: 'center',
  },
});

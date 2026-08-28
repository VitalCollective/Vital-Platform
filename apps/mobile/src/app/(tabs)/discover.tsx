import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ActivityCard } from '@/components/vital/activity-card';
import { Button } from '@/components/vital/button';
import { FilterChip } from '@/components/vital/filter-chip';
import { Screen, ScreenHeader } from '@/components/vital/screen';
import { StatePanel } from '@/components/vital/state-panel';
import { useDiscoverActivities } from '@/features/activities/activity-hooks';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { colors, layout, radii, spacing, typography } from '@/theme/tokens';
import {
  VITAL_SECTIONS,
  type EnvironmentFilter,
  type VitalSection,
} from '@/types/content';

const PAGE_SIZE = 20;

function asVitalSection(value: string | string[] | undefined): VitalSection | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return VITAL_SECTIONS.find((section) => section === candidate) ?? null;
}

export default function DiscoverScreen() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<VitalSection | null>(() =>
    asVitalSection(params.section),
  );
  const [environment, setEnvironment] = useState<EnvironmentFilter>('any');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 350);

  useEffect(() => {
    const nextSection = asVitalSection(params.section);
    if (nextSection) {
      setSection(nextSection);
      setPage(0);
    }
  }, [params.section]);

  const results = useDiscoverActivities({
    search: debouncedSearch,
    section,
    environment,
    page,
    pageSize: PAGE_SIZE,
  });

  const clearFilters = () => {
    setSearch('');
    setSection(null);
    setEnvironment('any');
    setPage(0);
  };

  const setSectionFilter = (nextSection: VitalSection | null) => {
    setSection(nextSection);
    setPage(0);
  };

  const setEnvironmentFilter = (nextEnvironment: EnvironmentFilter) => {
    setEnvironment(nextEnvironment);
    setPage(0);
  };

  const count = results.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasFilters = Boolean(search || section || environment !== 'any');

  return (
    <Screen scrollProps={{ keyboardDismissMode: 'on-drag' }}>
      <ScreenHeader
        eyebrow="Published Vital activities"
        title="Discover"
        description="Search by what sounds useful, then narrow the setting or part of Vital."
      />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={21} color={colors.inkSubtle} />
        <TextInput
          accessibilityLabel="Search activities"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setPage(0);
          }}
          placeholder="Try ‘outdoors’, ‘drawing’ or ‘bread’"
          placeholderTextColor={colors.inkSubtle}
          style={styles.searchInput}
        />
        {search ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => {
              setSearch('');
              setPage(0);
            }}
            style={styles.clearSearch}>
            <Ionicons name="close-circle" size={22} color={colors.inkSubtle} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterGroup}>
        <Text style={styles.filterLabel}>Part of Vital</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}>
          <FilterChip
            label="All"
            selected={section === null}
            onPress={() => setSectionFilter(null)}
          />
          {VITAL_SECTIONS.map((item) => (
            <FilterChip
              key={item}
              label={item.replace('Vital ', '')}
              selected={section === item}
              onPress={() => setSectionFilter(item)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.filterGroup}>
        <Text style={styles.filterLabel}>Setting</Text>
        <View style={styles.environmentRow}>
          {(
            [
              ['any', 'Any'],
              ['indoor', 'Indoors'],
              ['outdoor', 'Outdoors'],
            ] as const
          ).map(([value, label]) => (
            <FilterChip
              key={value}
              label={label}
              selected={environment === value}
              onPress={() => setEnvironmentFilter(value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.resultHeader}>
        <View>
          <Text style={styles.resultTitle} accessibilityLiveRegion="polite">
            {results.isLoading && !results.data
              ? 'Finding activities…'
              : `${count.toLocaleString()} ${count === 1 ? 'activity' : 'activities'}`}
          </Text>
          {totalPages > 1 ? (
            <Text style={styles.pageText}>
              Page {page + 1} of {totalPages}
            </Text>
          ) : null}
        </View>
        {hasFilters ? (
          <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.resetButton}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        ) : null}
      </View>

      {results.data?.usedSearchFallback ? (
        <Text style={styles.fallbackNote}>
          Full-text search was unavailable, so Vital used a title and description search.
        </Text>
      ) : null}

      {results.isLoading && !results.data ? (
        <StatePanel
          kind="loading"
          title="Searching Vital"
          message="This is a server-side search of the published collection."
        />
      ) : results.error ? (
        <StatePanel
          kind="error"
          title="Search is unavailable"
          message={results.error}
          onRetry={() => void results.retry()}
        />
      ) : results.data?.activities.length ? (
        <View style={styles.results}>
          {results.isLoading ? (
            <View style={styles.refreshing}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.refreshingText}>Updating results…</Text>
            </View>
          ) : null}
          {results.data.activities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              onPress={() =>
                router.push({ pathname: '/activity/[id]', params: { id: activity.id } })
              }
            />
          ))}
        </View>
      ) : (
        <StatePanel
          title="Nothing matched those filters"
          message="Try a broader phrase, another section or either setting."
        />
      )}

      {count > PAGE_SIZE ? (
        <View style={styles.pagination}>
          <Button
            label="Previous"
            icon="arrow-back"
            variant="secondary"
            disabled={page === 0 || results.isLoading}
            onPress={() => setPage((current) => Math.max(0, current - 1))}
          />
          <Button
            label="Next"
            icon="arrow-forward"
            variant="secondary"
            disabled={page + 1 >= totalPages || results.isLoading}
            onPress={() => setPage((current) => current + 1)}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
  searchInput: {
    flex: 1,
    minHeight: 52,
    color: colors.ink,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
  },
  clearSearch: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterGroup: { gap: spacing.sm, marginTop: spacing.lg },
  filterLabel: {
    color: colors.ink,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    fontWeight: '700',
  },
  chipRow: { gap: spacing.xs, paddingRight: spacing.lg },
  environmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  resultTitle: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.subheading,
    fontWeight: '600',
  },
  pageText: {
    color: colors.inkSubtle,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  resetButton: {
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  resetText: {
    color: colors.brand,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    fontWeight: '700',
  },
  fallbackNote: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.warningSoft,
    color: colors.warning,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  results: { gap: spacing.md },
  refreshing: {
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
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
});

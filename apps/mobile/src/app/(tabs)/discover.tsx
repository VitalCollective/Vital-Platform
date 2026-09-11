import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { colors, layout, radii, spacing, typography } from '@/theme/tokens';
import {
  VITAL_SECTIONS,
  type AgeFilter,
  type DurationFilter,
  type EnvironmentFilter,
  type VitalSection,
} from '@/types/content';

const INITIAL_RESULT_LIMIT = 20;
const RESULT_INCREMENT = 20;

const SECTION_OPTIONS: readonly VitalSection[] = [
  'Vital Mums',
  'Vital Kids',
  'Vital Together',
  'Vital Life',
  'Vital Food',
];

const AGE_OPTIONS: readonly { value: AgeFilter; label: string }[] = [
  { value: 'any', label: 'Any age' },
  { value: '2-4', label: 'Ages 2–4' },
  { value: '5-7', label: 'Ages 5–7' },
  { value: '8-10', label: 'Ages 8–10' },
  { value: '11-13', label: 'Ages 11–13' },
  { value: 'all-ages', label: 'All ages' },
  { value: 'adults', label: 'Adults' },
];

const DURATION_OPTIONS: readonly { value: DurationFilter; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'quick', label: 'Quick · 15 mins or less' },
  { value: 'half-hour', label: '15–30 mins' },
  { value: 'hour', label: '30–60 mins' },
  { value: 'longer', label: 'More than an hour' },
  { value: 'flexible', label: 'Flexible or ongoing' },
];

function asVitalSection(value: string | string[] | undefined): VitalSection | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return VITAL_SECTIONS.find((section) => section === candidate) ?? null;
}

function optionLabel<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export default function DiscoverScreen() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const router = useRouter();
  const { isTablet } = useResponsiveLayout();
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<VitalSection | null>(() =>
    asVitalSection(params.section),
  );
  const [environment, setEnvironment] = useState<EnvironmentFilter>('any');
  const [age, setAge] = useState<AgeFilter>('any');
  const [duration, setDuration] = useState<DurationFilter>('any');
  const [draftAge, setDraftAge] = useState<AgeFilter>('any');
  const [draftDuration, setDraftDuration] = useState<DurationFilter>('any');
  const [areMoreFiltersOpen, setAreMoreFiltersOpen] = useState(false);
  const [resultLimit, setResultLimit] = useState(INITIAL_RESULT_LIMIT);
  const debouncedSearch = useDebouncedValue(search, 350);

  useEffect(() => {
    const nextSection = asVitalSection(params.section);
    if (nextSection) {
      setSection(nextSection);
      setResultLimit(INITIAL_RESULT_LIMIT);
    }
  }, [params.section]);

  const results = useDiscoverActivities({
    search: debouncedSearch,
    section,
    environment,
    age,
    duration,
    limit: resultLimit,
  });

  const clearFilters = () => {
    setSearch('');
    setSection(null);
    setEnvironment('any');
    setAge('any');
    setDuration('any');
    setDraftAge('any');
    setDraftDuration('any');
    setResultLimit(INITIAL_RESULT_LIMIT);
  };

  const setSectionFilter = (nextSection: VitalSection | null) => {
    setSection(nextSection);
    setResultLimit(INITIAL_RESULT_LIMIT);
  };

  const setEnvironmentFilter = (nextEnvironment: EnvironmentFilter) => {
    setEnvironment(nextEnvironment);
    setResultLimit(INITIAL_RESULT_LIMIT);
  };

  const openMoreFilters = () => {
    setDraftAge(age);
    setDraftDuration(duration);
    setAreMoreFiltersOpen(true);
  };

  const applyMoreFilters = () => {
    setAge(draftAge);
    setDuration(draftDuration);
    setResultLimit(INITIAL_RESULT_LIMIT);
    setAreMoreFiltersOpen(false);
  };

  const clearMoreFilters = () => {
    setAge('any');
    setDuration('any');
    setDraftAge('any');
    setDraftDuration('any');
    setResultLimit(INITIAL_RESULT_LIMIT);
  };

  const count = results.data?.count ?? 0;
  const shownCount = results.data?.activities.length ?? 0;
  const hasMoreResults = shownCount < count;
  const activeMoreFilterCount = Number(age !== 'any') + Number(duration !== 'any');
  const hasFilters = Boolean(
    search.trim() ||
      section ||
      environment !== 'any' ||
      activeMoreFilterCount,
  );
  const activeMoreFilterSummary = [
    age === 'any' ? null : optionLabel(AGE_OPTIONS, age),
    duration === 'any' ? null : optionLabel(DURATION_OPTIONS, duration),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Screen scrollProps={{ keyboardDismissMode: 'on-drag' }}>
        <ScreenHeader
          eyebrow="Find something to do"
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
              setResultLimit(INITIAL_RESULT_LIMIT);
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
                setResultLimit(INITIAL_RESULT_LIMIT);
              }}
              style={styles.clearSearch}>
              <Ionicons name="close-circle" size={22} color={colors.inkSubtle} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Part of Vital</Text>
          <View style={styles.chipWrap}>
            <FilterChip
              label="All"
              selected={section === null}
              onPress={() => setSectionFilter(null)}
            />
            {SECTION_OPTIONS.map((item) => (
              <FilterChip
                key={item}
                label={item.replace('Vital ', '')}
                selected={section === item}
                onPress={() => setSectionFilter(item)}
              />
            ))}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Setting</Text>
          <View style={styles.chipWrap}>
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

        <View style={styles.moreFiltersBlock}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More filters${activeMoreFilterCount ? `, ${activeMoreFilterCount} active` : ''}`}
            accessibilityHint="Choose an age and amount of time"
            onPress={openMoreFilters}
            style={({ pressed }) => [
              styles.moreFiltersButton,
              activeMoreFilterCount > 0 && styles.moreFiltersButtonActive,
              pressed && styles.pressed,
            ]}>
            <View style={styles.moreFiltersLabelRow}>
              <Ionicons name="options-outline" size={20} color={colors.brand} />
              <Text style={styles.moreFiltersLabel}>More filters</Text>
              {activeMoreFilterCount ? (
                <View style={styles.filterCountBadge}>
                  <Text style={styles.filterCountText}>{activeMoreFilterCount}</Text>
                </View>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={19} color={colors.brand} />
          </Pressable>

          {activeMoreFilterSummary ? (
            <View style={styles.activeFilterRow}>
              <Text style={styles.activeFilterText}>{activeMoreFilterSummary}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear age and time filters"
                onPress={clearMoreFilters}
                hitSlop={8}>
                <Text style={styles.clearMoreText}>Clear</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.resultHeader}>
          <Text style={styles.resultTitle} accessibilityLiveRegion="polite">
            {results.isLoading && !results.data
              ? 'Finding activities…'
              : `${count.toLocaleString()} ${count === 1 ? 'activity' : 'activities'}`}
          </Text>
          {hasFilters ? (
            <Pressable
              accessibilityRole="button"
              onPress={clearFilters}
              style={styles.resetButton}>
              <Text style={styles.resetText}>Reset all</Text>
            </Pressable>
          ) : null}
        </View>

        {results.isLoading && !results.data ? (
          <StatePanel
            kind="loading"
            title="Searching Vital"
            message="We are looking through the Vital collection."
          />
        ) : results.error ? (
          <StatePanel
            kind="error"
            title="Search is unavailable"
            message={results.error}
            onRetry={() => void results.retry()}
          />
        ) : results.data?.activities.length ? (
          <View style={[styles.results, isTablet && styles.resultsTablet]}>
            {results.isLoading ? (
              <View style={styles.refreshing}>
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.refreshingText}>Updating results…</Text>
              </View>
            ) : null}
            {results.data.activities.map((activity) => (
              <View
                key={activity.id}
                style={[styles.resultCard, isTablet && styles.resultCardTablet]}>
                <ActivityCard
                  activity={activity}
                  variant="catalogue"
                  onPress={() =>
                    router.push({
                      pathname: '/activity/[id]',
                      params: { id: activity.id },
                    })
                  }
                />
              </View>
            ))}
          </View>
        ) : (
          <StatePanel
            title="Nothing matched those filters"
            message="Try a broader phrase, another part of Vital, or fewer filters."
          />
        )}

        {results.data?.activities.length && hasMoreResults ? (
          <View style={styles.showMore}>
            <Button
              label="Show more"
              icon="chevron-down"
              variant="secondary"
              loading={results.isLoading}
              onPress={() =>
                setResultLimit((current) => current + RESULT_INCREMENT)
              }
            />
            <Text style={styles.shownText}>
              Showing {shownCount.toLocaleString()} of {count.toLocaleString()}
            </Text>
          </View>
        ) : results.data?.activities.length && count > 0 ? (
          <Text style={styles.endText}>All matching activities are shown.</Text>
        ) : null}
      </Screen>

      <Modal
        animationType="slide"
        onRequestClose={() => setAreMoreFiltersOpen(false)}
        transparent
        visible={areMoreFiltersOpen}>
        <View
          style={[styles.modalRoot, isTablet && styles.modalRootTablet]}
          accessibilityViewIsModal>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close filters"
            onPress={() => setAreMoreFiltersOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.filterSheet, isTablet && styles.filterDialog]}>
            <ScrollView
              contentContainerStyle={styles.filterSheetContent}
              showsVerticalScrollIndicator={false}>
              <View style={styles.sheetHeadingRow}>
                <View style={styles.sheetHeadingCopy}>
                  <Text style={styles.sheetEyebrow}>Narrow the ideas</Text>
                  <Text style={styles.sheetTitle}>Age and time</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close filters"
                  onPress={() => setAreMoreFiltersOpen(false)}
                  style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={colors.ink} />
                </Pressable>
              </View>

              <View style={styles.sheetGroup}>
                <Text style={styles.filterLabel}>Age</Text>
                <View style={styles.chipWrap}>
                  {AGE_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.value}
                      label={option.label}
                      selected={draftAge === option.value}
                      onPress={() => setDraftAge(option.value)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.sheetGroup}>
                <Text style={styles.filterLabel}>Time</Text>
                <View style={styles.chipWrap}>
                  {DURATION_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.value}
                      label={option.label}
                      selected={draftDuration === option.value}
                      onPress={() => setDraftDuration(option.value)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.sheetActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setDraftAge('any');
                    setDraftDuration('any');
                  }}
                  style={styles.clearSheetButton}>
                  <Text style={styles.clearSheetText}>Clear age and time</Text>
                </Pressable>
                <Button label="Apply filters" onPress={applyMoreFilters} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
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
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  moreFiltersBlock: {
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  moreFiltersButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  moreFiltersButtonActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  moreFiltersLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  moreFiltersLabel: {
    color: colors.brand,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.body,
  },
  filterCountBadge: {
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.plum,
  },
  filterCountText: {
    color: colors.white,
    fontFamily: typography.bodyBoldFamily,
    fontSize: typography.eyebrow,
  },
  activeFilterRow: {
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  activeFilterText: {
    flex: 1,
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 20,
  },
  clearMoreText: {
    color: colors.plum,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.small,
  },
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
  resetButton: {
    minHeight: layout.touchTarget,
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
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20, 28, 20, 0.42)',
  },
  modalRootTablet: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  filterSheet: {
    width: '100%',
    maxHeight: '92%',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: colors.canvas,
    overflow: 'hidden',
  },
  filterSheetContent: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  filterDialog: {
    maxWidth: 620,
    borderRadius: radii.lg,
  },
  sheetHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sheetHeadingCopy: { flex: 1, gap: spacing.xxs },
  sheetEyebrow: {
    color: colors.plum,
    fontFamily: typography.bodyBoldFamily,
    fontSize: typography.eyebrow,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  sheetTitle: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.heading,
    lineHeight: 32,
  },
  closeButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetGroup: { gap: spacing.sm },
  sheetActions: { gap: spacing.sm },
  clearSheetButton: {
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  clearSheetText: {
    color: colors.plum,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.small,
  },
  pressed: { opacity: 0.78 },
});

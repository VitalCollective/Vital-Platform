import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, sectionColors, shadows, spacing, typography } from '@/theme/tokens';
import type { ActivitySummary } from '@/types/content';
import { useLanguage } from '@/features/localization/language-context';

function customerAgeValue(value: string | null, allAges: string): string | null {
  const normalized = value?.trim().replace(/^ages?\s+/i, '') ?? '';
  if (!normalized) return null;
  if (normalized.toLowerCase() === 'all') return allAges;
  return normalized;
}

function isNumericAge(value: string): boolean {
  return /^\d+$/.test(value);
}

function ageLabel(activity: ActivitySummary, t: (value: string) => string): string | null {
  const minimum = customerAgeValue(activity.age_min, t('All ages'));
  const maximum = customerAgeValue(activity.age_max, t('All ages'));

  if (minimum && maximum) {
    if (minimum.toLowerCase() === maximum.toLowerCase()) {
      return isNumericAge(minimum) ? `${t('Age')} ${minimum}` : minimum;
    }
    return isNumericAge(minimum) && isNumericAge(maximum)
      ? `${t('Ages')} ${minimum}–${maximum}`
      : `${minimum}–${maximum}`;
  }
  if (minimum) return isNumericAge(minimum) ? `${t('Age')} ${minimum}+` : minimum;
  if (maximum) return isNumericAge(maximum) ? `${t('Up to age')} ${maximum}` : maximum;
  return null;
}

function environmentLabel(activity: ActivitySummary, t: (value: string) => string): string | null {
  if (activity.indoor && activity.outdoor) return t('Indoors or outdoors');
  if (activity.indoor) return t('Indoors');
  if (activity.outdoor) return t('Outdoors');
  return null;
}

export function ActivityCard({
  activity,
  onPress,
  compact = false,
  variant = 'standard',
}: {
  activity: ActivitySummary;
  onPress: () => void;
  compact?: boolean;
  variant?: 'standard' | 'catalogue';
}) {
  const { t } = useLanguage();
  const accent = sectionColors[activity.section];
  const isCatalogue = variant === 'catalogue';
  const details = [ageLabel(activity, t), activity.duration, environmentLabel(activity, t)].filter(
    (value): value is string => Boolean(value),
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${activity.title}, ${t(activity.section)}`}
      accessibilityHint={t('Opens activity details')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        isCatalogue && styles.cardCatalogue,
        shadows.card,
        { opacity: pressed ? 0.82 : 1 },
      ]}>
      <View style={styles.topLine}>
        <View style={[styles.accent, { backgroundColor: accent.accent }]} />
        <Text style={[styles.section, { color: accent.accent }]}>{t(activity.section)}</Text>
      </View>
      <Text
        style={[
          styles.title,
          compact && styles.titleCompact,
          isCatalogue && styles.titleCatalogue,
        ]}>
        {activity.title}
      </Text>
      {activity.summary ? (
        <Text
          style={[
            styles.summary,
            compact && styles.summaryCompact,
            isCatalogue && styles.summaryCatalogue,
          ]}
          numberOfLines={compact || isCatalogue ? 2 : 3}>
          {activity.summary}
        </Text>
      ) : null}
      {details.length > 0 ? (
        <Text style={styles.details}>{details.join('  ·  ')}</Text>
      ) : null}
      <View
        style={[
          styles.openRow,
          compact && styles.openRowCompact,
          isCatalogue && styles.openRowCatalogue,
        ]}>
        <Text style={styles.openText}>{t('See the activity')}</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.brand} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  cardCompact: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  cardCatalogue: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  accent: {
    width: 18,
    height: 3,
    borderRadius: radii.pill,
  },
  section: {
    fontFamily: typography.bodyFamily,
    fontSize: typography.eyebrow,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.heading,
    fontWeight: '600',
    lineHeight: 28,
  },
  titleCompact: {
    fontSize: typography.subheading,
    lineHeight: 25,
  },
  titleCatalogue: {
    fontSize: typography.subheading,
    lineHeight: 24,
  },
  summary: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 23,
  },
  summaryCompact: {
    fontSize: typography.small,
    lineHeight: 20,
  },
  summaryCatalogue: {
    fontSize: typography.small,
    lineHeight: 19,
  },
  details: {
    color: colors.inkSubtle,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 20,
  },
  openRow: {
    minHeight: 32,
    marginTop: spacing.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  openRowCompact: {
    minHeight: 28,
    marginTop: 0,
  },
  openRowCatalogue: {
    minHeight: 28,
    marginTop: 0,
  },
  openText: {
    color: colors.brand,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    fontWeight: '700',
  },
});

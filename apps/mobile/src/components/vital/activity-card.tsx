import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, sectionColors, shadows, spacing, typography } from '@/theme/tokens';
import type { ActivitySummary } from '@/types/content';

function ageLabel(activity: ActivitySummary): string | null {
  if (activity.age_min && activity.age_max) {
    return activity.age_min === activity.age_max
      ? `Age ${activity.age_min}`
      : `Ages ${activity.age_min}–${activity.age_max}`;
  }
  if (activity.age_min) return `Age ${activity.age_min}+`;
  if (activity.age_max) return `Up to age ${activity.age_max}`;
  return null;
}

function environmentLabel(activity: ActivitySummary): string | null {
  if (activity.indoor && activity.outdoor) return 'Indoors or outdoors';
  if (activity.indoor) return 'Indoors';
  if (activity.outdoor) return 'Outdoors';
  return null;
}

export function ActivityCard({
  activity,
  onPress,
}: {
  activity: ActivitySummary;
  onPress: () => void;
}) {
  const accent = sectionColors[activity.section];
  const details = [ageLabel(activity), activity.duration, environmentLabel(activity)].filter(
    (value): value is string => Boolean(value),
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${activity.title}, ${activity.section}`}
      accessibilityHint="Opens activity details"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        shadows.card,
        { opacity: pressed ? 0.82 : 1 },
      ]}>
      <View style={styles.topLine}>
        <View style={[styles.accent, { backgroundColor: accent.accent }]} />
        <Text style={[styles.section, { color: accent.accent }]}>{activity.section}</Text>
      </View>
      <Text style={styles.title}>{activity.title}</Text>
      {activity.summary ? (
        <Text style={styles.summary} numberOfLines={3}>
          {activity.summary}
        </Text>
      ) : null}
      {details.length > 0 ? (
        <Text style={styles.details}>{details.join('  ·  ')}</Text>
      ) : null}
      <View style={styles.openRow}>
        <Text style={styles.openText}>See the activity</Text>
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
  summary: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 23,
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
  openText: {
    color: colors.brand,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    fontWeight: '700',
  },
});

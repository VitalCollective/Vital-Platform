import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { ActivityCard } from '@/components/vital/activity-card';
import { Screen } from '@/components/vital/screen';
import { StatePanel } from '@/components/vital/state-panel';
import { useIdeasForToday } from '@/features/activities/activity-hooks';
import {
  colors,
  radii,
  sectionColors,
  spacing,
  typography,
} from '@/theme/tokens';
import { VITAL_SECTIONS, type VitalSection } from '@/types/content';

const sectionDescriptions: Record<VitalSection, string> = {
  'Vital Kids': 'Play, make and explore',
  'Vital Together': 'Time that feels well spent',
  'Vital Life': 'Practical everyday capability',
  'Vital Food': 'Cook, taste and understand',
  'Vital Mums': 'Space for the grown-ups too',
};

export default function HomeScreen() {
  const router = useRouter();
  const ideas = useIdeasForToday();

  const openDiscover = (section?: VitalSection) => {
    router.push(section ? { pathname: '/discover', params: { section } } : '/discover');
  };

  return (
    <Screen>
      <View style={styles.brandRow}>
        <View>
          <Text style={styles.brand}>Vital Collective</Text>
          <Text style={styles.brandLine}>Ideas for family life, properly considered.</Text>
        </View>
        <View style={styles.brandMark} accessibilityElementsHidden>
          <Ionicons name="leaf" color={colors.brand} size={24} />
        </View>
      </View>

      <View style={styles.welcome}>
        <Text style={styles.eyebrow}>Welcome</Text>
        <Text style={styles.display}>Less scrolling. More living.</Text>
        <Text style={styles.intro}>
          Find a worthwhile activity for the time, people and energy you have today.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="What shall we do?"
        accessibilityHint="Opens Discover to browse activities"
        onPress={() => openDiscover()}
        style={({ pressed }) => [styles.heroAction, { opacity: pressed ? 0.86 : 1 }]}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>Start here</Text>
          <Text style={styles.heroTitle}>What shall we do?</Text>
          <Text style={styles.heroText}>
            Browse real Vital ideas now. A more personal recommendation flow comes later.
          </Text>
        </View>
        <Ionicons name="arrow-forward-circle" color={colors.white} size={38} />
      </Pressable>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeading}>Explore Vital</Text>
          <Text style={styles.sectionKicker}>Five ways in</Text>
        </View>
        <View style={styles.sectionLinks}>
          {VITAL_SECTIONS.map((section) => {
            const accent = sectionColors[section];
            return (
              <Pressable
                key={section}
                accessibilityRole="button"
                accessibilityLabel={`${section}: ${sectionDescriptions[section]}`}
                onPress={() => openDiscover(section)}
                style={({ pressed }) => [
                  styles.sectionLink,
                  { backgroundColor: accent.soft, opacity: pressed ? 0.8 : 1 },
                ]}>
                <View style={styles.sectionLinkCopy}>
                  <Text style={[styles.sectionLinkTitle, { color: accent.accent }]}>
                    {section}
                  </Text>
                  <Text style={styles.sectionLinkText}>{sectionDescriptions[section]}</Text>
                </View>
                <Ionicons name="chevron-forward" color={accent.accent} size={21} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeading}>Ideas for today</Text>
          <Text style={styles.sectionKicker}>From Vital</Text>
        </View>
        <View style={styles.ideas}>
          {ideas.isLoading ? (
            <StatePanel
              kind="loading"
              title="Finding a few good ideas"
              message="We’re looking through the published Vital collection."
            />
          ) : ideas.error ? (
            <StatePanel
              kind="error"
              title="The ideas did not arrive"
              message={ideas.error}
              onRetry={() => void ideas.retry()}
            />
          ) : ideas.data?.length ? (
            ideas.data.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                onPress={() =>
                  router.push({ pathname: '/activity/[id]', params: { id: activity.id } })
                }
              />
            ))
          ) : (
            <StatePanel
              title="No ideas are published yet"
              message="When activities are available, a small selection will appear here."
            />
          )}
        </View>
      </View>

      <View style={styles.putDownNote}>
        <Ionicons name="print-outline" color={colors.brand} size={28} />
        <View style={styles.putDownCopy}>
          <Text style={styles.putDownTitle}>Choose it. Print it. Go do it.</Text>
          <Text style={styles.putDownText}>
            Vital uses the phone to start experiences—not become the experience.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  brand: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.heading,
    fontWeight: '600',
  },
  brandLine: {
    color: colors.inkSubtle,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  brandMark: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
  },
  welcome: { gap: spacing.sm, marginBottom: spacing.xl },
  eyebrow: {
    color: colors.brand,
    fontFamily: typography.bodyFamily,
    fontSize: typography.eyebrow,
    fontWeight: '800',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  display: {
    maxWidth: 620,
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.display,
    fontWeight: '600',
    lineHeight: 47,
  },
  intro: {
    maxWidth: 580,
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.subheading,
    lineHeight: 27,
  },
  heroAction: {
    minHeight: 150,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: colors.brand,
  },
  heroCopy: { flex: 1, gap: spacing.xs },
  heroEyebrow: {
    color: '#C9D9CC',
    fontFamily: typography.bodyFamily,
    fontSize: typography.eyebrow,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: colors.white,
    fontFamily: typography.headingFamily,
    fontSize: typography.title,
    fontWeight: '600',
  },
  heroText: {
    maxWidth: 520,
    color: '#E8EFE9',
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 21,
  },
  sectionBlock: { gap: spacing.md, marginTop: spacing.xxl },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionHeading: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.heading,
    fontWeight: '600',
  },
  sectionKicker: {
    color: colors.inkSubtle,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
  },
  sectionLinks: { gap: spacing.sm },
  sectionLink: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  sectionLinkCopy: { flex: 1, gap: spacing.xxs },
  sectionLinkTitle: {
    fontFamily: typography.headingFamily,
    fontSize: typography.subheading,
    fontWeight: '700',
  },
  sectionLinkText: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
  },
  ideas: { gap: spacing.md },
  putDownNote: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xxl,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
  },
  putDownCopy: { flex: 1, gap: spacing.xs },
  putDownTitle: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.subheading,
    fontWeight: '600',
  },
  putDownText: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 21,
  },
});

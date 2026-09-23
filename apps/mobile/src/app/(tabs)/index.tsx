import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { ActivityCard } from '@/components/vital/activity-card';
import { Screen } from '@/components/vital/screen';
import { StatePanel } from '@/components/vital/state-panel';
import { useIdeasForToday } from '@/features/activities/activity-hooks';
import { useAuth } from '@/features/auth/auth-context';
import { useLanguage } from '@/features/localization/language-context';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import {
  colors,
  radii,
  sectionColors,
  spacing,
  typography,
} from '@/theme/tokens';
import type { VitalSection } from '@/types/content';

const primaryLogo = require('../../../assets/brand/vital-logo-main.png');
const secondaryLogo = require('../../../assets/brand/vital-logo-simple.png');

type HomeSection = {
  section: VitalSection;
  href:
    | '/vital-mums'
    | '/vital-kids'
    | '/vital-together'
    | '/vital-life'
    | '/vital-food';
  description: string;
};

const homeSections: HomeSection[] = [
  {
    section: 'Vital Mums',
    href: '/vital-mums',
    description: 'Practical care, perspective and space for the grown-ups.',
  },
  {
    section: 'Vital Kids',
    href: '/vital-kids',
    description: 'Play, make, learn and follow their curiosity.',
  },
  {
    section: 'Vital Together',
    href: '/vital-together',
    description: 'Shared rituals, adventures and time that feels well spent.',
  },
  {
    section: 'Vital Life',
    href: '/vital-life',
    description: 'Everyday skills, confidence and capability for family life.',
  },
  {
    section: 'Vital Food',
    href: '/vital-food',
    description: 'Cook, taste, grow and understand what is on the table.',
  },
];

function firstNameFromDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const [firstName] = value.trim().split(/\s+/);
  return firstName || null;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isDesktop, isTablet } = useResponsiveLayout();
  const ideas = useIdeasForToday();
  const firstName = firstNameFromDisplayName(user?.user_metadata.display_name);

  return (
    <Screen>
      <View style={[styles.hero, isTablet && styles.heroWide]}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>
            {firstName ? t('Welcome back, {name}', { name: firstName }) : t('Welcome to Vital')}
          </Text>
          <Text style={[styles.heroTitle, isDesktop && styles.heroTitleDesktop]}>
            {t('What can Vital help you do today?')}
          </Text>
          <Text style={styles.heroIntro}>
            {t('Find a useful idea for your family, make time together, or learn something that makes everyday life feel more possible.')}
          </Text>
        </View>

        <Image
          accessibilityLabel={
            isDesktop
              ? 'Vital Collective detailed family logo'
              : 'Vital Collective simplified family logo'
          }
          resizeMode="contain"
          source={isDesktop ? primaryLogo : secondaryLogo}
          style={[
            styles.heroLogo,
            isTablet && styles.heroLogoTablet,
            isDesktop && styles.heroLogoDesktop,
          ]}
        />
      </View>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('Find something')}
        accessibilityHint={t('Opens Discover to search Vital activities')}
        onPress={() => router.push('/discover')}
        style={({ pressed }) => [
          styles.findCard,
          isTablet && styles.findCardWide,
          pressed && styles.pressed,
        ]}>
        <View style={styles.findCopy}>
          <View style={styles.findLabelRow}>
            <Ionicons name="search" size={19} color={colors.onBrandMuted} />
            <Text style={styles.findLabel}>{t('Find something')}</Text>
          </View>
          <Text style={styles.findTitle}>{t('What would help right now?')}</Text>
          <Text style={styles.findText}>
            {t('Search real Vital activities and ideas, then narrow them by part of Vital or where you want to be.')}
          </Text>
        </View>
        <View style={styles.findArrow}>
          <Ionicons name="arrow-forward" size={23} color={colors.brand} />
        </View>
      </Pressable>

      <View style={[styles.sectionBlock, !isTablet && styles.sectionBlockPhone]}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionEyebrow}>{t('Explore the collective')}</Text>
          <Text style={styles.sectionTitle}>{t('Five parts of family life')}</Text>
          <Text style={styles.sectionIntro}>
            {t('Each part of Vital has its own focus, with practical ideas that are made to be used away from the screen.')}
          </Text>
        </View>

        <View style={styles.sectionGrid}>
          {homeSections.map((item, index) => {
            const accent = sectionColors[item.section];

            return (
              <Pressable
                key={item.section}
                accessibilityRole="link"
                accessibilityLabel={`${t(item.section)}: ${t(item.description)}`}
                onPress={() => router.push(item.href)}
                style={({ pressed }) => [
                  styles.sectionCard,
                  !isTablet && styles.sectionCardPhone,
                  isTablet && styles.sectionCardTablet,
                  isDesktop && styles.sectionCardDesktop,
                  {
                    backgroundColor: accent.soft,
                    borderTopColor: accent.accent,
                  },
                  pressed && styles.pressed,
                ]}>
                <View style={[styles.sectionCardCopy, !isTablet && styles.sectionCardCopyPhone]}>
                  <Text style={[styles.sectionNumber, { color: accent.accent }]}>
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                  <Text style={[styles.sectionCardTitle, { color: accent.accent }]}>
                    {t(item.section)}
                  </Text>
                  <Text style={styles.sectionCardText} numberOfLines={isTablet ? undefined : 2}>
                    {t(item.description)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.sectionCardAction,
                    !isTablet && styles.sectionCardActionPhone,
                  ]}>
                  {isTablet ? (
                    <Text style={[styles.sectionCardActionText, { color: accent.accent }]}>
                      {t('Explore')}
                    </Text>
                  ) : null}
                  <Ionicons name="arrow-forward" size={17} color={accent.accent} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {ideas.isLoading || ideas.error || ideas.data?.length ? (
        <View style={[styles.sectionBlock, !isTablet && styles.sectionBlockPhone]}>
          <View style={styles.sectionHeadingRow}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>{t('Ideas to try')}</Text>
            </View>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/discover')}
              style={({ pressed }) => [
                styles.viewAllLink,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.viewAllText}>{t('View all')}</Text>
              <Ionicons name="arrow-forward" size={17} color={colors.plum} />
            </Pressable>
          </View>

          {ideas.isLoading ? (
            <StatePanel
              kind="loading"
              title={t('Finding a few good ideas')}
              message={t('We are looking through the Vital collection.')}
            />
          ) : ideas.error ? (
            <StatePanel
              kind="error"
              title={t('The ideas did not arrive')}
              message={ideas.error}
              onRetry={() => void ideas.retry()}
            />
          ) : (
            <View style={styles.ideasGrid}>
              {ideas.data?.map((activity) => (
                <View
                  key={activity.id}
                  style={[
                    styles.ideaCard,
                    isTablet && styles.ideaCardTablet,
                    isDesktop && styles.ideaCardDesktop,
                  ]}>
                  <ActivityCard
                    activity={activity}
                    compact
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
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  heroWide: {
    minHeight: 250,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xxl,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.plum,
    fontFamily: typography.bodyBoldFamily,
    fontSize: typography.eyebrow,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  heroTitle: {
    maxWidth: 620,
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.title,
    lineHeight: 40,
  },
  heroTitleDesktop: {
    fontSize: typography.display,
    lineHeight: 54,
  },
  heroIntro: {
    maxWidth: 590,
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 25,
  },
  heroLogo: {
    width: 176,
    height: 124,
    alignSelf: 'center',
  },
  heroLogoTablet: {
    width: 224,
    height: 168,
  },
  heroLogoDesktop: {
    width: 360,
    height: 240,
  },
  findCard: {
    minHeight: 164,
    marginTop: spacing.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.brand,
  },
  findCardWide: {
    minHeight: 150,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  findCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  findLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  findLabel: {
    color: colors.onBrandMuted,
    fontFamily: typography.bodyBoldFamily,
    fontSize: typography.eyebrow,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  findTitle: {
    color: colors.onBrand,
    fontFamily: typography.headingFamily,
    fontSize: typography.heading,
    lineHeight: 32,
  },
  findText: {
    maxWidth: 650,
    color: colors.onBrandMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 21,
  },
  findArrow: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    borderRadius: radii.pill,
    backgroundColor: colors.canvas,
  },
  sectionBlock: {
    gap: spacing.lg,
    marginTop: spacing.xxxl,
  },
  sectionBlockPhone: {
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  sectionHeading: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionEyebrow: {
    color: colors.plum,
    fontFamily: typography.bodyBoldFamily,
    fontSize: typography.eyebrow,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.heading,
    lineHeight: 32,
  },
  sectionIntro: {
    maxWidth: 620,
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 21,
  },
  sectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  sectionCard: {
    width: '100%',
    minHeight: 172,
    justifyContent: 'space-between',
    gap: spacing.lg,
    padding: spacing.lg,
    borderTopWidth: 3,
    borderRadius: radii.md,
  },
  sectionCardPhone: {
    minHeight: 108,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  sectionCardTablet: {
    width: '48%',
    flexGrow: 1,
  },
  sectionCardDesktop: {
    width: '18%',
  },
  sectionCardCopy: {
    gap: spacing.xs,
  },
  sectionCardCopyPhone: {
    flex: 1,
    gap: spacing.xxs,
  },
  sectionNumber: {
    fontFamily: typography.bodyBoldFamily,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  sectionCardTitle: {
    fontFamily: typography.headingFamily,
    fontSize: typography.subheading,
    lineHeight: 25,
  },
  sectionCardText: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 20,
  },
  sectionCardAction: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  sectionCardActionPhone: {
    width: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  sectionCardActionText: {
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.small,
  },
  viewAllLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  viewAllText: {
    color: colors.plum,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.small,
  },
  ideasGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  ideaCard: {
    width: '100%',
  },
  ideaCardTablet: {
    width: '48%',
    flexGrow: 1,
  },
  ideaCardDesktop: {
    width: '31%',
  },
  pressed: {
    opacity: 0.82,
  },
});

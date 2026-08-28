import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/vital/button';
import { DetailSection, DetailText } from '@/components/vital/detail-section';
import { Screen, ScreenHeader } from '@/components/vital/screen';
import { StatePanel } from '@/components/vital/state-panel';
import { useActivity } from '@/features/activities/activity-hooks';
import { openPrintableResource } from '@/services/resources';
import {
  colors,
  radii,
  sectionColors,
  spacing,
  typography,
} from '@/theme/tokens';
import type { ActivityDetail } from '@/types/content';

function ageLabel(activity: ActivityDetail): string | null {
  if (activity.age_min && activity.age_max) {
    return activity.age_min === activity.age_max
      ? `Age ${activity.age_min}`
      : `Ages ${activity.age_min}–${activity.age_max}`;
  }
  if (activity.age_min) return `Age ${activity.age_min}+`;
  if (activity.age_max) return `Up to age ${activity.age_max}`;
  return null;
}

function settingLabel(activity: ActivityDetail): string | null {
  if (activity.indoor && activity.outdoor) return 'Indoors or outdoors';
  if (activity.indoor) return 'Indoors';
  if (activity.outdoor) return 'Outdoors';
  return null;
}

export default function ActivityDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const activityId = Array.isArray(params.id) ? params.id[0] : params.id;
  const result = useActivity(activityId);
  const [openingResourceId, setOpeningResourceId] = useState<string | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const handleOpenResource = async (id: string, storagePath: string) => {
    setResourceError(null);
    setOpeningResourceId(id);
    try {
      await openPrintableResource(storagePath);
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : 'Unable to open this printable resource.',
      );
    } finally {
      setOpeningResourceId(null);
    }
  };

  if (result.isLoading) {
    return (
      <Screen>
        <StatePanel
          kind="loading"
          title="Preparing the activity"
          message="Gathering the useful details and any printable resources."
        />
      </Screen>
    );
  }

  if (result.error || !result.data) {
    return (
      <Screen>
        <StatePanel
          kind="error"
          title="This activity is unavailable"
          message={result.error ?? 'The activity could not be loaded.'}
          onRetry={() => void result.retry()}
        />
      </Screen>
    );
  }

  const { activity, resources } = result.data;
  const accent = sectionColors[activity.section];
  const metadata = [
    { label: 'Age', value: ageLabel(activity) },
    { label: 'Time', value: activity.duration },
    { label: 'Setting', value: settingLabel(activity) },
    { label: 'Preparation', value: activity.prep_time },
    { label: 'Difficulty', value: activity.difficulty },
    { label: 'Cost', value: activity.cost },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  const practical = [
    { label: 'Equipment', value: activity.equipment },
    { label: 'Adult involvement', value: activity.parent_involvement },
    { label: 'Mess level', value: activity.mess_level },
    { label: 'Weather', value: activity.weather },
    { label: 'Season', value: activity.season },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  const benefits = [
    { label: 'Physical', value: activity.physical_benefits },
    { label: 'Mental', value: activity.mental_benefits },
    { label: 'Social', value: activity.social_benefits },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  return (
    <Screen>
      <Stack.Screen options={{ title: activity.title }} />
      <View style={[styles.sectionMarker, { backgroundColor: accent.soft }]}>
        <View style={[styles.markerLine, { backgroundColor: accent.accent }]} />
        <Text style={[styles.sectionName, { color: accent.accent }]}>{activity.section}</Text>
      </View>
      <ScreenHeader title={activity.title} description={activity.summary ?? undefined} />

      {metadata.length ? (
        <View style={styles.metadataGrid}>
          {metadata.map((item) => (
            <View key={item.label} style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>{item.label}</Text>
              <Text style={styles.metadataValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {activity.instructions ? (
        <DetailSection title="How to do it">
          <DetailText>{activity.instructions}</DetailText>
        </DetailSection>
      ) : null}

      {practical.length ? (
        <DetailSection title="What you’ll need to know">
          <View style={styles.factList}>
            {practical.map((item) => (
              <View key={item.label} style={styles.factRow}>
                <Text style={styles.factLabel}>{item.label}</Text>
                <Text style={styles.factValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </DetailSection>
      ) : null}

      {activity.why_children_enjoy_it ? (
        <DetailSection title="Why it works">
          <DetailText>{activity.why_children_enjoy_it}</DetailText>
        </DetailSection>
      ) : null}

      {benefits.length ? (
        <DetailSection title="What it builds">
          <View style={styles.benefitList}>
            {benefits.map((item) => (
              <View key={item.label} style={styles.benefitItem}>
                <Text style={styles.benefitLabel}>{item.label}</Text>
                <Text style={styles.benefitText}>{item.value}</Text>
              </View>
            ))}
          </View>
        </DetailSection>
      ) : null}

      {activity.variations ? (
        <DetailSection title="Try it another way">
          <DetailText>{activity.variations}</DetailText>
        </DetailSection>
      ) : null}

      {activity.safety_notes ? (
        <DetailSection title="Keep in mind">
          <View style={styles.safetyNote}>
            <Ionicons name="shield-checkmark-outline" size={23} color={colors.warning} />
            <Text style={styles.safetyText}>{activity.safety_notes}</Text>
          </View>
        </DetailSection>
      ) : null}

      <DetailSection title="Printable resources">
        {resources.length ? (
          <View style={styles.resourceList}>
            <Text style={styles.printPrinciple}>
              Print it if you can, put the phone down, and go do it.
            </Text>
            {resourceError ? (
              <Text style={styles.resourceError} accessibilityRole="alert">
                {resourceError}
              </Text>
            ) : null}
            {resources.map((resource) => (
              <View key={resource.id} style={styles.resourceCard}>
                <View style={styles.resourceHeading}>
                  <Ionicons name="document-text-outline" size={26} color={colors.brand} />
                  <View style={styles.resourceCopy}>
                    <Text style={styles.resourceTitle}>{resource.title}</Text>
                    <Text style={styles.resourceMeta}>
                      {[
                        resource.useType,
                        resource.pageCount
                          ? `${resource.pageCount} ${resource.pageCount === 1 ? 'page' : 'pages'}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </View>
                <Button
                  label="Open printable resource"
                  icon="open-outline"
                  loading={openingResourceId === resource.id}
                  disabled={openingResourceId !== null && openingResourceId !== resource.id}
                  onPress={() => void handleOpenResource(resource.id, resource.storagePath)}
                />
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noResource}>
            There is no printable companion linked to this activity yet.
          </Text>
        )}
      </DetailSection>

      <View style={styles.finishNote}>
        <Ionicons name="phone-portrait-outline" size={25} color={colors.brand} />
        <Text style={styles.finishText}>
          You have what you need. The best part happens away from this screen.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionMarker: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    borderRadius: radii.pill,
  },
  markerLine: { width: 16, height: 3, borderRadius: radii.pill },
  sectionName: {
    fontFamily: typography.bodyFamily,
    fontSize: typography.eyebrow,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  metadataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  metadataItem: {
    minWidth: 126,
    flexGrow: 1,
    flexBasis: '30%',
    gap: spacing.xxs,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metadataLabel: {
    color: colors.inkSubtle,
    fontFamily: typography.bodyFamily,
    fontSize: typography.eyebrow,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metadataValue: {
    color: colors.ink,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    fontWeight: '600',
    lineHeight: 20,
  },
  factList: { gap: spacing.md },
  factRow: { gap: spacing.xxs },
  factLabel: {
    color: colors.ink,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    fontWeight: '700',
  },
  factValue: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 24,
  },
  benefitList: { gap: spacing.lg },
  benefitItem: { gap: spacing.xs },
  benefitLabel: {
    color: colors.brand,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  benefitText: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 24,
  },
  safetyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.warningSoft,
  },
  safetyText: {
    flex: 1,
    color: colors.warning,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 24,
  },
  resourceList: { gap: spacing.md },
  printPrinciple: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 24,
  },
  resourceCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  resourceHeading: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  resourceCopy: { flex: 1, gap: spacing.xxs },
  resourceTitle: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.subheading,
    fontWeight: '600',
  },
  resourceMeta: {
    color: colors.inkSubtle,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    textTransform: 'capitalize',
  },
  resourceError: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 20,
  },
  noResource: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 24,
  },
  finishNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.brandSoft,
  },
  finishText: {
    flex: 1,
    color: colors.brand,
    fontFamily: typography.headingFamily,
    fontSize: typography.subheading,
    fontWeight: '600',
    lineHeight: 25,
  },
});

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Screen, ScreenHeader } from '@/components/vital/screen';
import { colors, radii, spacing, typography } from '@/theme/tokens';

export function ShellScreen({
  title,
  description,
  note,
  icon,
}: {
  title: string;
  description: string;
  note: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Screen>
      <ScreenHeader eyebrow="Vital Collective" title={title} description={description} />
      <View style={styles.note}>
        <Ionicons name={icon} size={30} color={colors.brand} />
        <Text style={styles.noteTitle}>Made to be useful, not noisy.</Text>
        <Text style={styles.noteText}>{note}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: {
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noteTitle: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.heading,
    fontWeight: '600',
  },
  noteText: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 24,
  },
});

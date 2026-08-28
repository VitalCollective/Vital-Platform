import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, layout, radii, spacing, typography } from '@/theme/tokens';

export function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selectedChip,
        { opacity: pressed ? 0.78 : 1 },
      ]}>
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  selectedChip: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  label: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    fontWeight: '600',
  },
  selectedLabel: {
    color: colors.white,
  },
});

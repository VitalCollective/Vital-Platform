import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, layout, radii, spacing, typography } from '@/theme/tokens';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary' | 'danger';
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  variant = 'primary',
  accessibilityHint,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const palette = {
    primary: { background: colors.brand, foreground: colors.white, border: colors.brand },
    secondary: {
      background: colors.surface,
      foreground: colors.brand,
      border: colors.borderStrong,
    },
    danger: {
      background: colors.dangerSoft,
      foreground: colors.danger,
      border: colors.danger,
    },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          opacity: isDisabled ? 0.55 : pressed ? 0.82 : 1,
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.foreground} />
      ) : icon ? (
        <Ionicons name={icon} size={20} color={palette.foreground} />
      ) : null}
      <Text style={[styles.label, { color: palette.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  label: {
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    fontWeight: '700',
  },
});

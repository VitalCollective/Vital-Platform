import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/vital/button';
import { colors, radii, spacing, typography } from '@/theme/tokens';

type StatePanelProps = {
  title: string;
  message: string;
  kind?: 'loading' | 'empty' | 'error';
  onRetry?: () => void;
};

export function StatePanel({
  title,
  message,
  kind = 'empty',
  onRetry,
}: StatePanelProps) {
  return (
    <View
      style={[styles.panel, kind === 'error' && styles.errorPanel]}
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite">
      {kind === 'loading' ? (
        <ActivityIndicator size="small" color={colors.brand} />
      ) : (
        <Ionicons
          name={kind === 'error' ? 'alert-circle-outline' : 'leaf-outline'}
          size={27}
          color={kind === 'error' ? colors.danger : colors.brand}
        />
      )}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  errorPanel: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  title: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.subheading,
    fontWeight: '600',
    textAlign: 'center',
  },
  message: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 21,
    textAlign: 'center',
  },
});

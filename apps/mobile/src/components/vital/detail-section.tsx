import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/tokens';

export function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {typeof children === 'string' ? <Text style={styles.body}>{children}</Text> : children}
    </View>
  );
}

export function DetailText({ children }: { children: string }) {
  return <Text style={styles.body}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  title: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.heading,
    fontWeight: '600',
  },
  body: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 25,
  },
});

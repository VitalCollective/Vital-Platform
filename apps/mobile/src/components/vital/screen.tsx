import type { PropsWithChildren, ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout, spacing, typography } from '@/theme/tokens';

type ScreenProps = PropsWithChildren<{
  scrollProps?: ScrollViewProps;
  footer?: ReactNode;
}>;

export function Screen({ children, footer, scrollProps }: ScreenProps) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        {...scrollProps}>
        <View style={styles.content}>{children}</View>
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.header} accessibilityRole="header">
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
  },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  eyebrow: {
    color: colors.brand,
    fontFamily: typography.bodyFamily,
    fontSize: typography.eyebrow,
    fontWeight: '800',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.title,
    fontWeight: '600',
    lineHeight: 37,
  },
  description: {
    maxWidth: 620,
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 24,
  },
});

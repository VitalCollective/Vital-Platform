import type { PropsWithChildren, ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { colors, layout, spacing, typography } from '@/theme/tokens';

type ScreenProps = PropsWithChildren<{
  scrollProps?: ScrollViewProps;
  footer?: ReactNode;
}>;

export function Screen({ children, footer, scrollProps }: ScreenProps) {
  const { horizontalPadding, isDesktop } = useResponsiveLayout();

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        {...scrollProps}>
        <View
          style={[
            styles.content,
            {
              paddingHorizontal: horizontalPadding,
              paddingTop: isDesktop ? spacing.xxl : spacing.xl,
            },
          ]}>
          {children}
        </View>
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
  const { isDesktop } = useResponsiveLayout();

  return (
    <View style={styles.header} accessibilityRole="header">
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={[styles.title, isDesktop && styles.titleDesktop]}>{title}</Text>
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
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: typography.eyebrow,
    fontFamily: typography.bodyBoldFamily,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.title,
    lineHeight: 41,
  },
  titleDesktop: {
    maxWidth: layout.readingMaxWidth,
    fontSize: typography.display,
    lineHeight: 55,
  },
  description: {
    maxWidth: layout.readingMaxWidth,
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 24,
  },
});

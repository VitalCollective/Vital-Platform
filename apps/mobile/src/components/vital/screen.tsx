import { useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useLanguage } from '@/features/localization/language-context';
import { colors, layout, spacing, typography } from '@/theme/tokens';

type ScreenProps = PropsWithChildren<{
  scrollProps?: ScrollViewProps;
  footer?: ReactNode;
  keyboardAware?: boolean;
}>;

export function Screen({ children, footer, scrollProps, keyboardAware = false }: ScreenProps) {
  const { horizontalPadding, isDesktop } = useResponsiveLayout();
  const container = useRef<View>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const content = (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={keyboardAware && Platform.OS === 'ios'}
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
  if (!keyboardAware || Platform.OS !== 'android') return content;
  // Measure the shell's actual offset; do not assume a device or header height.
  // iOS uses ScrollView's native keyboard insets instead, avoiding double adjustment.
  return <View ref={container} collapsable={false} style={styles.safeArea}
    onLayout={() => container.current?.measureInWindow((_x, y) => setKeyboardOffset(y))}>
    <KeyboardAvoidingView behavior="height" keyboardVerticalOffset={keyboardOffset} style={styles.safeArea}>
      {content}
    </KeyboardAvoidingView>
  </View>;
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
  const { t } = useLanguage();

  return (
    <View style={styles.header} accessibilityRole="header">
      {eyebrow ? <Text style={styles.eyebrow}>{t(eyebrow)}</Text> : null}
      <Text style={[styles.title, isDesktop && styles.titleDesktop]}>{t(title)}</Text>
      {description ? <Text style={styles.description}>{t(description)}</Text> : null}
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

import { useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useLanguage } from '@/features/localization/language-context';
import { colors, layout, radii, spacing, typography } from '@/theme/tokens';

type AuthShellProps = PropsWithChildren<{
  title: string;
  intro: string;
  footer?: ReactNode;
}>;

type AuthFieldProps = Pick<
  TextInputProps,
  | 'autoCapitalize'
  | 'autoComplete'
  | 'autoCorrect'
  | 'keyboardType'
  | 'onSubmitEditing'
  | 'returnKeyType'
  | 'secureTextEntry'
  | 'textContentType'
> & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  hint?: string;
};

type AuthNoticeProps = {
  kind: 'error' | 'success' | 'info';
  children: ReactNode;
};

function BrandMark() {
  return (
    <Image
      accessible
      accessibilityLabel="Vital Collective brand mark"
      accessibilityRole="image"
      resizeMode="cover"
      source={require('../../../assets/brand/vital-mark.png')}
      style={styles.mark}
    />
  );
}

export function AuthShell({ title, intro, children, footer }: AuthShellProps) {
  const { horizontalPadding, isTablet } = useResponsiveLayout();
  const { t } = useLanguage();

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: horizontalPadding,
              paddingVertical: isTablet ? spacing.xxxl : spacing.xl,
            },
          ]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <View style={styles.identity}>
              <BrandMark />
              <Text style={styles.brandName}>Vital Collective</Text>
            </View>

            <View style={styles.headingGroup}>
              <Text
                accessibilityRole="header"
                style={[styles.title, isTablet && styles.titleTablet]}>
                {t(title)}
              </Text>
              <Text style={styles.intro}>{t(intro)}</Text>
            </View>

            <View style={[styles.panel, isTablet && styles.panelTablet]}>{children}</View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AuthField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  ...inputProps
}: AuthFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const { t } = useLanguage();

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{t(label)}</Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={t(label)}
        accessibilityHint={hint ? t(hint) : undefined}
        onBlur={() => setIsFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        placeholder={t(placeholder)}
        placeholderTextColor={colors.inkSubtle}
        selectionColor={colors.plum}
        style={[styles.input, isFocused && styles.inputFocused]}
        value={value}
      />
      {hint ? <Text style={styles.hint}>{t(hint)}</Text> : null}
    </View>
  );
}

export function AuthNotice({ kind, children }: AuthNoticeProps) {
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      style={[
        styles.notice,
        kind === 'error'
          ? styles.noticeError
          : kind === 'success'
            ? styles.noticeSuccess
            : styles.noticeInfo,
      ]}>
      <Text
        style={[
          styles.noticeText,
          kind === 'error' ? styles.noticeErrorText : styles.noticeTextDefault,
        ]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: spacing.lg,
  },
  identity: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  mark: {
    width: 160,
    height: 116,
  },
  brandName: {
    color: colors.brand,
    fontFamily: typography.headingFamily,
    fontSize: typography.heading,
  },
  headingGroup: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.title,
    lineHeight: 40,
    textAlign: 'center',
  },
  titleTablet: {
    fontSize: 40,
    lineHeight: 48,
  },
  intro: {
    maxWidth: layout.readingMaxWidth,
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 24,
    textAlign: 'center',
  },
  panel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  panelTablet: {
    padding: spacing.xl,
  },
  footer: {
    alignItems: 'center',
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.ink,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.small,
  },
  input: {
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    color: colors.ink,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
  },
  inputFocused: {
    borderColor: colors.plum,
    borderWidth: 2,
  },
  hint: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 20,
  },
  notice: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.sm,
  },
  noticeError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  noticeSuccess: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.successSoft,
  },
  noticeInfo: {
    borderColor: colors.border,
    backgroundColor: colors.plumSoft,
  },
  noticeText: {
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 20,
  },
  noticeTextDefault: {
    color: colors.ink,
  },
  noticeErrorText: {
    color: colors.danger,
  },
});

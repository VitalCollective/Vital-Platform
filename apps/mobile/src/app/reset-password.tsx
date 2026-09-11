import { useEffect, useState } from 'react';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AuthField,
  AuthNotice,
  AuthShell,
} from '@/components/vital/auth-shell';
import { Button } from '@/components/vital/button';
import { useAuth } from '@/features/auth/auth-context';
import { customerSafeErrorMessage } from '@/lib/errors';
import { colors, layout, spacing, typography } from '@/theme/tokens';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const routeParameters = useLocalSearchParams();
  const {
    session,
    isPasswordRecovery,
    isPasswordRecoveryLinkLoading,
    passwordRecoveryError,
    updatePassword,
    completePasswordRecovery,
  } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const hasRecoveryRouteParameters = [
    'access_token',
    'refresh_token',
    'type',
    'code',
    'sb_flow_id',
    'token_hash',
    'error',
    'error_code',
    'error_description',
  ].some((parameter) => parameter in routeParameters);

  useEffect(() => {
    if (
      isPasswordRecovery &&
      !isPasswordRecoveryLinkLoading &&
      hasRecoveryRouteParameters
    ) {
      router.replace('/reset-password');
    }
  }, [
    hasRecoveryRouteParameters,
    isPasswordRecovery,
    isPasswordRecoveryLinkLoading,
    router,
  ]);

  const submit = async () => {
    setError(null);

    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The two passwords do not match. Please enter them again.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updatePassword(password);
      setPassword('');
      setConfirmation('');
      setIsComplete(true);
    } catch (submitError) {
      setError(
        customerSafeErrorMessage(
          'Password update failed',
          submitError,
          "We couldn't update your password just now. Please try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const continueToApp = () => {
    completePasswordRecovery();
    router.replace('/(tabs)');
  };

  const recoveryUnavailable =
    !isPasswordRecoveryLinkLoading &&
    (Boolean(passwordRecoveryError) || !isPasswordRecovery || !session);

  return (
    <AuthShell
      title={isComplete ? 'Password updated' : 'Choose a new password'}
      intro={
        isComplete
          ? 'Your Vital Collective account is ready when you are.'
          : 'Use a memorable password that you do not use for another account.'
      }>
      {isPasswordRecoveryLinkLoading ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          style={styles.loading}>
          <ActivityIndicator color={colors.plum} />
          <Text style={styles.loadingText}>Checking your secure reset link…</Text>
        </View>
      ) : recoveryUnavailable ? (
        <>
          <AuthNotice kind="error">
            {passwordRecoveryError ??
              'Open the password reset link from your email before choosing a new password.'}
          </AuthNotice>
          <Link href="/forgot-password" asChild>
            <Pressable
              accessibilityRole="link"
              onPress={completePasswordRecovery}
              style={({ pressed }) => [
                styles.linkButton,
                pressed && styles.linkPressed,
              ]}>
              <Text style={styles.linkText}>Request a new reset link</Text>
            </Pressable>
          </Link>
        </>
      ) : isComplete ? (
        <>
          <AuthNotice kind="success">
            Your password has been changed successfully.
          </AuthNotice>
          <Button label="Continue to Vital" onPress={continueToApp} />
        </>
      ) : (
        <>
          <AuthField
            label="New password"
            autoCapitalize="none"
            autoComplete="new-password"
            autoCorrect={false}
            textContentType="newPassword"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            hint="Use at least 8 characters."
            returnKeyType="next"
          />
          <AuthField
            label="Confirm new password"
            autoCapitalize="none"
            autoComplete="new-password"
            autoCorrect={false}
            textContentType="newPassword"
            secureTextEntry
            value={confirmation}
            onChangeText={setConfirmation}
            placeholder="Enter the same password again"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
          {error ? <AuthNotice kind="error">{error}</AuthNotice> : null}
          <Button
            label="Update password"
            onPress={() => void submit()}
            loading={isSubmitting}
          />
        </>
      )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  loading: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    textAlign: 'center',
  },
  linkButton: {
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  linkText: {
    color: colors.plum,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.small,
    textAlign: 'center',
  },
  linkPressed: {
    opacity: 0.68,
  },
});

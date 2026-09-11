import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import {
  AuthField,
  AuthNotice,
  AuthShell,
} from '@/components/vital/auth-shell';
import { Button } from '@/components/vital/button';
import { useAuth } from '@/features/auth/auth-context';
import { customerSafeErrorMessage } from '@/lib/errors';
import { colors, layout, spacing, typography } from '@/theme/tokens';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  const submit = async () => {
    const normalizedEmail = email.trim();
    setError(null);

    if (!normalizedEmail) {
      setError('Enter the email address you use for Vital Collective.');
      return;
    }
    if (!emailPattern.test(normalizedEmail)) {
      setError('Enter a complete email address, such as name@example.com.');
      return;
    }

    setIsSubmitting(true);
    try {
      await requestPasswordReset(normalizedEmail);
      setIsSent(true);
    } catch (submitError) {
      setError(
        customerSafeErrorMessage(
          'Password reset email request failed',
          submitError,
          "We couldn't send the reset email just now. Please try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      intro="Enter your email and we’ll send you a secure link to choose a new password.">
      {isSent ? (
        <>
          <AuthNotice kind="success">
            If an account exists for {email.trim()}, a password reset link is on its way.
            Check your inbox and spam folder.
          </AuthNotice>
          <Button
            label="Send another link"
            variant="secondary"
            onPress={() => setIsSent(false)}
          />
        </>
      ) : (
        <>
          <AuthField
            label="Email address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            returnKeyType="send"
            onSubmitEditing={() => void submit()}
          />
          {error ? <AuthNotice kind="error">{error}</AuthNotice> : null}
          <Button
            label="Send reset link"
            onPress={() => void submit()}
            loading={isSubmitting}
          />
        </>
      )}

      <Link href="/" asChild>
        <Pressable
          accessibilityRole="link"
          style={({ pressed }) => [styles.backLink, pressed && styles.linkPressed]}>
          <Text style={styles.backText}>Back to sign in</Text>
        </Pressable>
      </Link>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  backLink: {
    width: '100%',
    minHeight: layout.touchTarget,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  backText: {
    color: colors.brand,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.small,
    textAlign: 'center',
  },
  linkPressed: {
    opacity: 0.68,
  },
});

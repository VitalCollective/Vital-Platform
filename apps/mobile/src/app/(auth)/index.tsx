import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AuthField,
  AuthNotice,
  AuthShell,
} from '@/components/vital/auth-shell';
import { Button } from '@/components/vital/button';
import { useAuth } from '@/features/auth/auth-context';
import { useLanguage } from '@/features/localization/language-context';
import { LanguageSelector } from '@/features/localization/language-selector';
import { customerSafeErrorMessage } from '@/lib/errors';
import { colors, layout, spacing, typography } from '@/theme/tokens';

type AuthMode = 'sign-in' | 'sign-up';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const { t } = useLanguage();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setMessage(null);

    if (!email.trim() || !password) {
      setError(t('Enter both your email address and password.'));
      return;
    }
    if (mode === 'sign-up' && password.length < 8) {
      setError(t('Choose a password with at least 8 characters.'));
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'sign-in') {
        await signIn(email, password);
      } else {
        const result = await signUp(email, password, displayName);
        if (result.needsEmailConfirmation) {
          setMessage(
            t('Check your inbox to confirm your email, then come back and sign in.'),
          );
          setMode('sign-in');
          setPassword('');
        }
      }
    } catch (submitError) {
      setError(
        customerSafeErrorMessage(
          isSignIn ? 'Sign in failed' : 'Sign up failed',
          submitError,
          isSignIn
            ? "We couldn't sign you in. Check your details and try again."
            : "We couldn't create your account just now. Please try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode((current) => (current === 'sign-in' ? 'sign-up' : 'sign-in'));
    setError(null);
    setMessage(null);
    setPassword('');
  };

  const isSignIn = mode === 'sign-in';

  return (
    <AuthShell
      title={isSignIn ? t('Welcome back') : t('Join Vital Collective')}
      intro={
        isSignIn
          ? t('Sign in to return to thoughtful ideas for family life.')
          : t('Create your account, then choose the Vital membership that suits you.')
      }>
      <LanguageSelector compact />
      {mode === 'sign-up' ? (
        <AuthField
          label={t('Member name')}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder={t('What should we call you?')}
        />
      ) : null}

      <AuthField
        label={t('Email address')}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        returnKeyType="next"
      />

      <View style={styles.passwordGroup}>
        <AuthField
          label={t('Password')}
          autoCapitalize="none"
          autoComplete={isSignIn ? 'current-password' : 'new-password'}
          autoCorrect={false}
          textContentType={isSignIn ? 'password' : 'newPassword'}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder={isSignIn ? t('Enter your password') : t('At least 8 characters')}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />

        {isSignIn ? (
          <Link href="/forgot-password" asChild>
            <Pressable
              accessibilityRole="link"
              hitSlop={8}
              style={({ pressed }) => [
                styles.forgotLink,
                pressed && styles.linkPressed,
              ]}>
              <Text style={styles.linkText}>{t('Forgot password?')}</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>

      {error ? <AuthNotice kind="error">{error}</AuthNotice> : null}
      {message ? <AuthNotice kind="success">{message}</AuthNotice> : null}

      <Button
        label={isSignIn ? t('Sign in') : t('Create account')}
        onPress={() => void submit()}
        loading={isSubmitting}
      />

      <Pressable
        accessibilityRole="button"
        onPress={switchMode}
        style={({ pressed }) => [
          styles.switchButton,
          pressed && styles.linkPressed,
        ]}>
        <Text style={styles.switchText}>
          {isSignIn
            ? t('New to Vital? Create an account')
            : t('Already have an account? Sign in')}
        </Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  passwordGroup: {
    gap: spacing.xxs,
  },
  forgotLink: {
    minHeight: layout.touchTarget,
    alignSelf: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  linkPressed: {
    opacity: 0.68,
  },
  linkText: {
    color: colors.plum,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.small,
  },
  switchButton: {
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  switchText: {
    color: colors.brand,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.small,
    textAlign: 'center',
  },
});

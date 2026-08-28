import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/vital/button';
import { useAuth } from '@/features/auth/auth-context';
import { colors, layout, radii, spacing, typography } from '@/theme/tokens';

type AuthMode = 'sign-in' | 'sign-up';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
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
      setError('Enter both your email address and password.');
      return;
    }
    if (mode === 'sign-up' && password.length < 8) {
      setError('Choose a password with at least 8 characters.');
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
            'Check your inbox to confirm your email, then come back and sign in.',
          );
          setMode('sign-in');
        }
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Authentication was not completed.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode((current) => (current === 'sign-in' ? 'sign-up' : 'sign-in'));
    setError(null);
    setMessage(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Text style={styles.eyebrow}>Vital Collective</Text>
            <Text style={styles.title}>Find something worth doing.</Text>
            <Text style={styles.intro}>
              Choose a useful idea, gather what you need, and get away from the screen.
            </Text>

            <View style={styles.form}>
              <Text style={styles.formTitle} accessibilityRole="header">
                {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
              </Text>

              {mode === 'sign-up' ? (
                <View style={styles.field}>
                  <Text style={styles.label}>Display name</Text>
                  <TextInput
                    accessibilityLabel="Display name"
                    autoCapitalize="words"
                    autoComplete="name"
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="How should we greet you?"
                    placeholderTextColor={colors.inkSubtle}
                    style={styles.input}
                  />
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>Email address</Text>
                <TextInput
                  accessibilityLabel="Email address"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.inkSubtle}
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  accessibilityLabel="Password"
                  autoCapitalize="none"
                  autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.inkSubtle}
                  style={styles.input}
                  onSubmitEditing={() => void submit()}
                />
              </View>

              {error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
              {message ? <Text style={styles.message}>{message}</Text> : null}

              <Button
                label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
                onPress={() => void submit()}
                loading={isSubmitting}
              />

              <Pressable
                accessibilityRole="button"
                onPress={switchMode}
                style={styles.switchButton}>
                <Text style={styles.switchText}>
                  {mode === 'sign-in'
                    ? 'New to Vital? Create an account'
                    : 'Already a member? Sign in'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xl },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
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
    fontSize: typography.display,
    fontWeight: '600',
    lineHeight: 46,
  },
  intro: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  form: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  formTitle: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.heading,
    fontWeight: '600',
  },
  field: { gap: spacing.xs },
  label: {
    color: colors.ink,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    fontWeight: '700',
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
  error: {
    color: colors.danger,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 20,
  },
  message: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.successSoft,
    color: colors.success,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    lineHeight: 20,
  },
  switchButton: {
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchText: {
    color: colors.brand,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    fontWeight: '700',
  },
});

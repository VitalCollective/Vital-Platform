import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ProfileAvatar } from '@/components/vital/profile-avatar';

import { Button } from '@/components/vital/button';
import { Screen, ScreenHeader } from '@/components/vital/screen';
import { useAuth } from '@/features/auth/auth-context';
import { customerSafeErrorMessage } from '@/lib/errors';
import { getOwnCommunityProfile } from '@/services/profiles';
import { colors, radii, spacing, typography } from '@/theme/tokens';

export default function YouScreen() {
  const { signOut, user } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getOwnCommunityProfile>>>(null);
  useEffect(() => {
    let active = true; setProfile(null);
    if (user?.id) void getOwnCommunityProfile(user.id).then(value => { if (active) setProfile(value); }).catch(() => {});
    return () => { active = false; };
  }, [user?.id]);

  const metadataName = user?.user_metadata.display_name;
  const displayName = profile?.displayName ?? (typeof metadataName === 'string' ? metadataName : 'Vital Member');

  const handleSignOut = async () => {
    setError(null);
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (signOutError) {
      setError(
        customerSafeErrorMessage(
          'Sign out failed',
          signOutError,
          "We couldn't sign you out just now. Please try again.",
        ),
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Your Vital"
        title={displayName}
        description="A simple account view for this first slice. Family, settings and subscription tools come next."
      />

      <View style={styles.accountCard}>
        <ProfileAvatar name={displayName} imageUrl={profile?.imageUrl} size={54} />
        <View style={styles.accountCopy}>
          <Text style={styles.accountName}>{displayName}</Text>
          <Text style={styles.email}>{user?.email ?? 'No email available'}</Text>
        </View>
      </View>

      <View style={styles.comingNext}>
        <Text style={styles.comingTitle}>Coming next</Text>
        <Text style={styles.comingText}>Family profile · Preferences · Subscription</Text>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        label="Sign out"
        icon="log-out-outline"
        variant="secondary"
        loading={isSigningOut}
        onPress={() => void handleSignOut()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  accountCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  accountName: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.subheading,
    fontWeight: '600',
  },
  email: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
  },
  comingNext: {
    gap: spacing.xs,
    marginVertical: spacing.xl,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  comingTitle: {
    color: colors.ink,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  comingText: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 24,
  },
  error: {
    color: colors.danger,
    fontFamily: typography.bodyFamily,
    fontSize: typography.small,
    marginBottom: spacing.md,
  },
});

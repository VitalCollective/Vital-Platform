import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Button } from '@/components/vital/button';
import { useAuth } from '@/features/auth/auth-context';
import { useLanguage } from '@/features/localization/language-context';
import { createActivitySavesApi } from '@/features/saved/activity-saves-api';
import { createActivitySaveController, type ActivitySaveState } from '@/features/saved/activity-save-state';
import { requireSupabase } from '@/lib/supabase';
import { colors, spacing, typography } from '@/theme/tokens';

export function ActivitySaveControl({ activityId }: { activityId: string }) {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return null; // Detail routes already require a session.
  return <MemberActivitySave key={`${user.id}:${activityId}`} profileId={user.id} activityId={activityId} />;
}

function MemberActivitySave({ profileId, activityId }: { profileId: string; activityId: string }) {
  const controller = useMemo(() => createActivitySaveController(
    createActivitySavesApi(requireSupabase()), profileId, activityId,
  ), [profileId, activityId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useFocusEffect(useCallback(() => { void controller.refresh(); }, [controller]));

  return <ActivitySaveButton state={state} onToggle={() => void controller.toggle()} onRetry={() => void controller.refresh()} />;
}

// Separate presentation lets isolated QA exercise the real control with no Auth
// credentials or writes to the connected project.
export function ActivitySaveButton({ state, onToggle, onRetry }: {
  state: ActivitySaveState; onToggle: () => void; onRetry: () => void;
}) {
  const { t } = useLanguage();
  const busy = state.isLoading || state.isSaving;
  return (
    <View style={styles.container}>
      <View style={styles.button}>
        <Button
          label={t(state.saved === null ? (state.error ? 'Saved status unavailable' : 'Checking saved status…') : state.saved ? 'Saved' : 'Save')}
          icon={state.saved ? 'bookmark' : 'bookmark-outline'}
          variant={state.saved ? 'primary' : 'secondary'}
          loading={busy}
          disabled={state.saved === null || Boolean(state.error)}
          accessibilityHint={t(state.saved ? 'Remove this activity from Saved' : 'Add this activity to Saved')}
          onPress={onToggle}
        />
      </View>
      {state.isSaving ? <Text style={styles.notice} accessibilityLiveRegion="polite">{t('Updating your saved activity…')}</Text> : null}
      {state.error ? (
        <View style={styles.error}>
          <Text style={styles.errorText} accessibilityRole="alert">{state.error}</Text>
          <View style={styles.button}>
            <Button label={t('Try again')} variant="secondary" onPress={onRetry} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs, marginBottom: spacing.lg },
  button: { alignSelf: 'flex-start', maxWidth: '100%' },
  notice: { color: colors.inkMuted, fontFamily: typography.bodyFamily, fontSize: typography.small },
  error: { gap: spacing.xs },
  errorText: { color: colors.danger, fontFamily: typography.bodyFamily, fontSize: typography.small, lineHeight: 21 },
});

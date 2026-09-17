import { useCallback, useMemo } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/auth-context';
import { createAccountApi } from '@/features/account/account-api';
import { accountPanel, accountParentPanel } from '@/features/account/account-model';
import { AccountScreen } from '@/features/account/account-screen';
import { requireSupabase } from '@/lib/supabase';
import { communityApi } from '@/services/community';

export default function YouScreen() {
  const { user, signOut } = useAuth();
  const { panel: parameter } = useLocalSearchParams<{ panel?: string | string[] }>();
  const panel = accountPanel(parameter);
  const router = useRouter();
  const api = useMemo(() => createAccountApi(requireSupabase()), []);
  const community = useMemo(() => communityApi(), []);
  useFocusEffect(useCallback(() => {
    if (!panel || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { router.setParams({ panel: accountParentPanel(panel) ?? '' }); return true; });
    return () => subscription.remove();
  }, [panel, router]));
  if (!user) return null;
  return <AccountScreen key={user.id} id={user.id} email={user.email} panel={panel} api={api} community={community}
    navigate={next => router.setParams({ panel: next ?? '' })} openCommunity={() => router.push('/community')} signOut={signOut} />;
}

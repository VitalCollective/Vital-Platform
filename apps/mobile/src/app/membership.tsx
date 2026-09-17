import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MembershipAccessScreen } from '@/features/account/account-screen';
import { createAccountApi } from '@/features/account/account-api';
import { accountPanel } from '@/features/account/account-model';
import { useAuth } from '@/features/auth/auth-context';
import { requireSupabase } from '@/lib/supabase';

export default function MembershipRoute() {
  const { user, signOut } = useAuth();
  const { panel: parameter } = useLocalSearchParams<{ panel?: string | string[] }>();
  const router = useRouter();
  const api = useMemo(() => createAccountApi(requireSupabase()), []);
  if (!user) return null;
  return <MembershipAccessScreen id={user.id} email={user.email} panel={accountPanel(parameter)} api={api}
    navigate={(panel) => router.setParams({ panel: panel ?? 'membership' })} signOut={signOut} />;
}

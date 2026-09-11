import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/auth-context';
import { CommunityScreenContent } from '@/features/community/community-screen';
import { communityApi } from '@/services/community';

export default function CommunityScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const api = useMemo(() => communityApi(), []);
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(useCallback(() => { setRefreshKey((value) => value + 1); }, []));
  if (!user) return null;
  return <CommunityScreenContent api={api} userId={user.id} refreshKey={refreshKey}
    onActivity={(id) => router.push({ pathname: '/activity/[id]', params: { id } })} />;
}

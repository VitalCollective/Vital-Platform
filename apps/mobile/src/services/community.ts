import { createCommunityApi } from '@/features/community/community-api';
import { requireSupabase } from '@/lib/supabase';

export function communityApi() {
  return createCommunityApi(requireSupabase());
}

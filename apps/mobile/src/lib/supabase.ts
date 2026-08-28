import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { mobileConfig } from '@/lib/config';
import { sessionStorage } from '@/lib/session-storage';

export const supabase = mobileConfig.isValid
  ? createClient(
      mobileConfig.supabaseUrl,
      mobileConfig.supabasePublishableKey,
      {
        auth: {
          storage: sessionStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      },
    )
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(mobileConfig.error ?? 'Supabase is not configured.');
  }

  return supabase;
}

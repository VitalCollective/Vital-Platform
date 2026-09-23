import { useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { reportTechnicalError } from '@/lib/errors';
import { requireSupabase } from '@/lib/supabase';
import { useLanguage } from './language-context';
import { isAppLanguage } from './localization-model';

export function LanguagePreferenceSync() {
  const { session } = useAuth();
  const { language, ready, setLanguage } = useLanguage();
  const syncedUser = useRef<string | null>(null);

  useEffect(() => {
    const id = session?.user.id;
    if (!ready || !id || syncedUser.current === id) return;
    let active = true;
    void (async () => {
      try {
        const client = requireSupabase();
        const { data, error } = await client.from('user_preferences')
          .select('language_code').eq('profile_id', id).maybeSingle();
        if (error) throw error;
        if (!active) return;
        if (isAppLanguage(data?.language_code)) {
          await setLanguage(data.language_code);
        } else {
          const saved = await client.from('user_preferences').update({ language_code: language })
            .eq('profile_id', id).is('language_code', null).select('profile_id').maybeSingle();
          if (saved.error) throw saved.error;
        }
        syncedUser.current = id;
      } catch (cause) {
        reportTechnicalError('Synchronize language preference', cause);
      }
    })();
    return () => { active = false; };
  }, [language, ready, session?.user.id, setLanguage]);

  useEffect(() => {
    if (!session) syncedUser.current = null;
  }, [session]);

  return null;
}

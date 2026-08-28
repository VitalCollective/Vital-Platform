import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { AuthContext, type SignUpResult } from '@/features/auth/auth-context';
import { mobileConfig } from '@/lib/config';
import { supabase } from '@/lib/supabase';

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const client = supabase;
    let isMounted = true;

    client.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) console.warn('Unable to restore Supabase session:', error.message);
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: authListener } = client.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setIsLoading(false);
      },
    );

    const appStateListener =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') {
              client.auth.startAutoRefresh();
            } else {
              client.auth.stopAutoRefresh();
            }
          });

    if (Platform.OS !== 'web' && AppState.currentState === 'active') {
      client.auth.startAutoRefresh();
    }

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
      appStateListener?.remove();
      if (Platform.OS !== 'web') client.auth.stopAutoRefresh();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      configurationError: mobileConfig.error,
      async signIn(email: string, password: string) {
        if (!supabase) throw new Error(mobileConfig.error ?? 'Supabase is not configured.');

        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },
      async signUp(
        email: string,
        password: string,
        displayName: string,
      ): Promise<SignUpResult> {
        if (!supabase) throw new Error(mobileConfig.error ?? 'Supabase is not configured.');

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim() || 'Vital Member',
            },
          },
        });
        if (error) throw error;

        return { needsEmailConfirmation: data.session === null };
      },
      async signOut() {
        if (!supabase) throw new Error(mobileConfig.error ?? 'Supabase is not configured.');
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [isLoading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

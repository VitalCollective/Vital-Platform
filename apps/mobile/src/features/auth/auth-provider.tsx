import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import { AuthContext, type SignUpResult } from '@/features/auth/auth-context';
import { isDefinitiveAuthSessionError } from '@/features/auth/auth-session';
import { parsePasswordRecoveryUrl } from '@/features/auth/password-recovery';
import { mobileConfig } from '@/lib/config';
import { reportTechnicalError } from '@/lib/errors';
import { withRequestTimeout } from '@/lib/request-lifecycle';
import { supabase } from '@/lib/supabase';

const invalidRecoveryLinkMessage =
  'This password reset link is invalid or has expired. Request a new link and try again.';

function clearRecoveryParametersFromWebUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.hash = '';
  [
    'access_token',
    'refresh_token',
    'expires_in',
    'expires_at',
    'token_type',
    'type',
    'code',
    'sb_flow_id',
    'token_hash',
    'error',
    'error_code',
    'error_description',
  ].forEach((parameter) => url.searchParams.delete(parameter));
  window.history.replaceState(window.history.state, '', url.toString());
}

function clearRecoveryParametersAfterNavigation() {
  clearRecoveryParametersFromWebUrl();
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.requestAnimationFrame(clearRecoveryParametersFromWebUrl);
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [isPasswordRecoveryLinkLoading, setIsPasswordRecoveryLinkLoading] =
    useState(false);
  const [passwordRecoveryError, setPasswordRecoveryError] = useState<
    string | null
  >(null);
  const recoveryFlowRef = useRef(false);

  const clearPasswordRecovery = useCallback(() => {
    recoveryFlowRef.current = false;
    setIsPasswordRecovery(false);
    setIsPasswordRecoveryLinkLoading(false);
    setPasswordRecoveryError(null);
  }, []);

  const revalidateSession = useCallback(async () => {
    if (!supabase) return null;
    const { data, error } = await withRequestTimeout(supabase.auth.getSession());
    if (error) {
      if (isDefinitiveAuthSessionError(error)) {
        setSession(null);
        clearPasswordRecovery();
        void supabase.auth.signOut({ scope: 'local' }).catch((cause) =>
          reportTechnicalError('Clear invalid Supabase session', cause),
        );
      }
      throw error;
    }
    setSession(data.session);
    return data.session;
  }, [clearPasswordRecovery]);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const client = supabase;
    let isMounted = true;
    let hasValidatedInitialSession = false;

    const handlePasswordRecoveryUrl = async (url: string) => {
      const recovery = parsePasswordRecoveryUrl(url);
      if (!recovery.isRecovery) return false;

      recoveryFlowRef.current = true;
      if (isMounted) {
        setIsPasswordRecovery(true);
        setIsPasswordRecoveryLinkLoading(true);
        setPasswordRecoveryError(null);
      }

      try {
        if (recovery.errorDescription) {
          throw new Error(invalidRecoveryLinkMessage);
        }

        let nextSession: Session | null = null;

        if (recovery.accessToken && recovery.refreshToken) {
          const { data, error } = await client.auth.setSession({
            access_token: recovery.accessToken,
            refresh_token: recovery.refreshToken,
          });
          if (error) throw error;
          nextSession = data.session;
        } else if (recovery.code) {
          const { data, error } = await client.auth.exchangeCodeForSession(
            recovery.code,
            recovery.flowId ? { flowId: recovery.flowId } : undefined,
          );
          if (error) throw error;
          nextSession = data.session;
        } else if (recovery.tokenHash) {
          const { data, error } = await client.auth.verifyOtp({
            token_hash: recovery.tokenHash,
            type: 'recovery',
          });
          if (error) throw error;
          nextSession = data.session;
        } else {
          throw new Error(invalidRecoveryLinkMessage);
        }

        if (!nextSession) throw new Error(invalidRecoveryLinkMessage);
        if (isMounted) setSession(nextSession);
      } catch {
        if (isMounted) setPasswordRecoveryError(invalidRecoveryLinkMessage);
      } finally {
        clearRecoveryParametersAfterNavigation();
        if (isMounted) setIsPasswordRecoveryLinkLoading(false);
      }

      return true;
    };

    const { data: authListener } = client.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!isMounted || event === 'INITIAL_SESSION' || !hasValidatedInitialSession) {
          return;
        }

        if (event === 'PASSWORD_RECOVERY') {
          recoveryFlowRef.current = true;
          setIsPasswordRecovery(true);
          setPasswordRecoveryError(null);
        } else if (event === 'SIGNED_OUT') {
          clearPasswordRecovery();
        } else if (event === 'SIGNED_IN' && !recoveryFlowRef.current) {
          clearPasswordRecovery();
        }
        setSession(nextSession);
        setIsLoading(false);
      },
    );

    const linkingListener = Linking.addEventListener('url', ({ url }) => {
      void handlePasswordRecoveryUrl(url);
    });

    void (async () => {
      try {
        const { data, error } = await withRequestTimeout(client.auth.getSession());
        if (!isMounted) return;
        if (error) console.warn('Unable to restore Supabase session:', error.message);

        let verifiedSession: Session | null = null;

        if (!error && data.session) {
          try {
            const { data: userData, error: userError } = await withRequestTimeout(
              client.auth.getUser(),
            );

            if (!userError && userData.user?.id === data.session.user.id) {
              verifiedSession = { ...data.session, user: userData.user };
            } else if (!userError || isDefinitiveAuthSessionError(userError)) {
              const { error: signOutError } = await withRequestTimeout(
                client.auth.signOut({ scope: 'local' }),
              );
              if (signOutError) {
                console.warn(
                  'Unable to clear an invalid stored Supabase session:',
                  signOutError.message,
                );
              }
            } else {
              verifiedSession = data.session;
              reportTechnicalError('Validate restored Supabase session', userError);
            }
          } catch (validationError) {
            // A temporary network failure must not erase a locally restored session.
            // The membership gate still resolves before protected content can render.
            verifiedSession = data.session;
            reportTechnicalError('Validate restored Supabase session', validationError);
          }
        }

        if (!isMounted) return;
        setSession(verifiedSession);

        const initialUrl = await withRequestTimeout(Linking.getInitialURL());
        if (initialUrl) await handlePasswordRecoveryUrl(initialUrl);
      } catch (initializationError) {
        if (isMounted) {
          setSession(null);
          console.warn(
            'Unable to initialize Supabase authentication:',
            initializationError instanceof Error
              ? initializationError.message
              : 'Unknown error',
          );
        }
      } finally {
        hasValidatedInitialSession = true;
        if (isMounted) setIsLoading(false);
      }
    })();

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
      linkingListener.remove();
      appStateListener?.remove();
      if (Platform.OS !== 'web') client.auth.stopAutoRefresh();
    };
  }, [clearPasswordRecovery]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      configurationError: mobileConfig.error,
      isPasswordRecovery,
      isPasswordRecoveryLinkLoading,
      passwordRecoveryError,
      revalidateSession,
      async signIn(email: string, password: string) {
        if (!supabase) throw new Error(mobileConfig.error ?? 'Supabase is not configured.');

        clearPasswordRecovery();
        clearRecoveryParametersAfterNavigation();

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

        clearPasswordRecovery();
        clearRecoveryParametersAfterNavigation();

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
      async requestPasswordReset(email: string) {
        if (!supabase) throw new Error(mobileConfig.error ?? 'Supabase is not configured.');

        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: Linking.createURL('/reset-password'),
        });
        if (error) throw error;
      },
      async updatePassword(password: string) {
        if (!supabase) throw new Error(mobileConfig.error ?? 'Supabase is not configured.');
        if (!isPasswordRecovery || !session) {
          throw new Error('Open a valid password reset link before choosing a new password.');
        }

        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      },
      completePasswordRecovery() {
        clearPasswordRecovery();
      },
      async signOut() {
        if (!supabase) throw new Error(mobileConfig.error ?? 'Supabase is not configured.');

        setSession(null);
        clearPasswordRecovery();
        const { error } = await supabase.auth.signOut();
        if (error) {
          await supabase.auth.signOut({ scope: 'local' });
          throw error;
        }
      },
    }),
    [
      clearPasswordRecovery,
      isLoading,
      isPasswordRecovery,
      isPasswordRecoveryLinkLoading,
      passwordRecoveryError,
      revalidateSession,
      session,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export type SignUpResult = {
  needsEmailConfirmation: boolean;
};

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  configurationError: string | null;
  isPasswordRecovery: boolean;
  isPasswordRecoveryLinkLoading: boolean;
  passwordRecoveryError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<SignUpResult>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  completePasswordRecovery: () => void;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return value;
}

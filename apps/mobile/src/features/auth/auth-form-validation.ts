export type AuthFormMode = 'sign-in' | 'sign-up';

export const AGE_CONFIRMATION_LABEL = 'I confirm that I am 18 or over.';
export const AGE_CONFIRMATION_ERROR = 'Confirm that you are 18 or over to create a Vital account.';

type AuthFormValues = {
  mode: AuthFormMode;
  email: string;
  password: string;
  ageConfirmed: boolean;
};

export function validateAuthForm({
  mode,
  email,
  password,
  ageConfirmed,
}: AuthFormValues): string | null {
  if (!email.trim() || !password) {
    return 'Enter both your email address and password.';
  }
  if (mode === 'sign-up' && password.length < 8) {
    return 'Choose a password with at least 8 characters.';
  }
  if (mode === 'sign-up' && !ageConfirmed) {
    return AGE_CONFIRMATION_ERROR;
  }
  return null;
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  AGE_CONFIRMATION_ERROR,
  AGE_CONFIRMATION_LABEL,
  validateAuthForm,
} from '../src/features/auth/auth-form-validation.ts';

const authScreen = readFileSync(
  new URL('../src/app/(auth)/index.tsx', import.meta.url),
  'utf8',
);
const forgotPasswordScreen = readFileSync(
  new URL('../src/app/(auth)/forgot-password.tsx', import.meta.url),
  'utf8',
);
const resetPasswordScreen = readFileSync(
  new URL('../src/app/reset-password.tsx', import.meta.url),
  'utf8',
);

test('signup age confirmation starts unchecked and blocks every shared submit path', () => {
  assert.match(authScreen, /const \[ageConfirmed, setAgeConfirmed\] = useState\(false\)/);
  assert.match(authScreen, /validateAuthForm\(\{[\s\S]*ageConfirmed,[\s\S]*\}\)/);
  assert.match(authScreen, /onSubmitEditing=\{\(\) => void submit\(\)\}/);
  assert.match(authScreen, /onPress=\{\(\) => void submit\(\)\}/);
  assert.equal(validateAuthForm({
    mode: 'sign-up',
    email: 'member@example.com',
    password: 'secure-pass',
    ageConfirmed: false,
  }), AGE_CONFIRMATION_ERROR);
});

test('valid signup proceeds through existing validation after confirmation', () => {
  assert.equal(validateAuthForm({
    mode: 'sign-up',
    email: 'member@example.com',
    password: 'secure-pass',
    ageConfirmed: true,
  }), null);
  assert.match(authScreen, /await signUp\(email, password, displayName\)/);
  assert.doesNotMatch(authScreen, /date.?of.?birth|birth.?date|dob/i);
});

test('login remains independent of the signup-only declaration', () => {
  assert.equal(validateAuthForm({
    mode: 'sign-in',
    email: 'member@example.com',
    password: 'secure-pass',
    ageConfirmed: false,
  }), null);
  assert.match(authScreen, /if \(mode === 'sign-in'\) \{[\s\S]*await signIn\(email, password\)/);
});

test('password recovery and reset remain independent of registration eligibility', () => {
  assert.match(forgotPasswordScreen, /await requestPasswordReset\(normalizedEmail\)/);
  assert.match(resetPasswordScreen, /await updatePassword\(password\)/);
  assert.doesNotMatch(forgotPasswordScreen, /ageConfirmed|AGE_CONFIRMATION/);
  assert.doesNotMatch(resetPasswordScreen, /ageConfirmed|AGE_CONFIRMATION/);
});

test('age control exposes checkbox semantics, state and an accessible explanation', () => {
  assert.equal(AGE_CONFIRMATION_LABEL, 'I confirm that I am 18 or over.');
  assert.match(authScreen, /accessibilityRole="checkbox"/);
  assert.match(authScreen, /accessibilityState=\{\{ checked: ageConfirmed, disabled: isSubmitting \}\}/);
  assert.match(authScreen, /accessibilityLabel=\{t\(AGE_CONFIRMATION_LABEL\)\}/);
  assert.match(authScreen, /accessibilityHint=\{t\('Required to create a Vital account\.'\)\}/);
  assert.match(authScreen, /minHeight: layout\.touchTarget/);
});

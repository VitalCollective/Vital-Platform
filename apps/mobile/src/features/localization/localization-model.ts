export const SUPPORTED_LANGUAGES = ['en', 'cy'] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: AppLanguage = 'en';
export const LANGUAGE_STORAGE_KEY = 'vital.app-language.v1';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string'
    && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}
export function resolvedLanguage(value: unknown): AppLanguage {
  return isAppLanguage(value) ? value : DEFAULT_LANGUAGE;
}

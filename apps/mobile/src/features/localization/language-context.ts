import { createContext, useContext } from 'react';
import type { AppLanguage } from './localization-model';

export type LanguageContextValue = {
  language: AppLanguage;
  ready: boolean;
  setLanguage: (language: AppLanguage) => Promise<void>;
  t: (english: string, parameters?: Record<string, string | number>) => string;
};

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used within LanguageProvider.');
  return value;
}

import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import '@/lib/session-storage';
import { LanguageContext } from './language-context';
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, resolvedLanguage, type AppLanguage } from './localization-model';
import { translate } from './translations';

function storedLanguage(): AppLanguage {
  try { return resolvedLanguage(globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY)); }
  catch { return DEFAULT_LANGUAGE; }
}

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setCurrentLanguage] = useState<AppLanguage>(DEFAULT_LANGUAGE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCurrentLanguage(storedLanguage());
    setReady(true);
  }, []);

  const setLanguage = useCallback(async (next: AppLanguage) => {
    setCurrentLanguage(next);
    try { globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, next); }
    catch { /* The in-memory selection still works for this session. */ }
  }, []);

  const value = useMemo(() => ({
    language,
    ready,
    setLanguage,
    t: (english: string, parameters?: Record<string, string | number>) => translate(language, english, parameters),
  }), [language, ready, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

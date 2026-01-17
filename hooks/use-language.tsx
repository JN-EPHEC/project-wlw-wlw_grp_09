import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import * as FileSystem from 'expo-file-system';
import { DEFAULT_LANGUAGE, translations, TranslationKey } from '@/constants/translations';

const LANGUAGE_FILE = `${FileSystem.documentDirectory ?? ''}campusride-language.json`;

const LanguageContext = createContext<
  { locale: string; setLocale: (value: string) => void } | undefined
>(undefined);

const normalizeLocale = (value: string | undefined) => {
  if (!value) return DEFAULT_LANGUAGE;
  const [lang] = value.split('-');
  return lang?.toLowerCase() ?? DEFAULT_LANGUAGE;
};

const getDeviceLocale = () => {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  }
  return DEFAULT_LANGUAGE;
};

const readStoredLocale = async () => {
  if (!FileSystem.documentDirectory) return null;
  try {
    const exists = await FileSystem.getInfoAsync(LANGUAGE_FILE);
    if (!exists.exists) return null;
    const contents = await FileSystem.readAsStringAsync(LANGUAGE_FILE);
    return contents || null;
  } catch {
    return null;
  }
};

const writeStoredLocale = async (value: string) => {
  if (!FileSystem.documentDirectory) return;
  try {
    await FileSystem.writeAsStringAsync(LANGUAGE_FILE, value, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {
    // ignore
  }
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<string>(DEFAULT_LANGUAGE);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const stored = await readStoredLocale();
        if (stored && isMounted) {
          setLocaleState(normalizeLocale(stored));
          return;
        }
        const deviceLocale = normalizeLocale(getDeviceLocale());
        if (isMounted) {
          setLocaleState(deviceLocale);
        }
      } catch {
        if (isMounted) {
          setLocaleState(normalizeLocale(getDeviceLocale()));
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const setLocale = useCallback(async (value: string) => {
    const normalized = normalizeLocale(value);
    setLocaleState(normalized);
    try {
      await writeStoredLocale(normalized);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}

export function translate(locale: string | undefined, key: TranslationKey) {
  const normalized = normalizeLocale(locale);
  const dictionary = translations[normalized as keyof typeof translations] ?? translations[DEFAULT_LANGUAGE];
  return dictionary[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key;
}

export function useTranslation() {
  const { locale } = useLanguage();
  return useCallback((key: TranslationKey) => translate(locale, key), [locale]);
}

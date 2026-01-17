import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { HeaderBackButton } from '@/components/ui/header-back-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GradientBackground } from '@/components/ui/gradient-background';
import { Colors, Gradients, Radius, Spacing, Shadows } from '@/app/ui/theme';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useLanguage, useTranslation } from '@/hooks/use-language';

const RAW_LANGUAGE_CODES = (() => {
  if (typeof Intl.supportedValuesOf !== 'function') {
    return ['en', 'fr', 'es', 'de', 'pt', 'it', 'nl', 'ru', 'ja', 'ko', 'zh', 'ar'];
  }

  try {
    return Intl.supportedValuesOf('language');
  } catch {
    return ['en', 'fr', 'es', 'de', 'pt', 'it', 'nl', 'ru', 'ja', 'ko', 'zh', 'ar'];
  }
})();
const LANGUAGE_CODES = Array.from(
  new Set(RAW_LANGUAGE_CODES.map((code) => code.split('-')[0]).filter(Boolean))
) as string[];

export default function LanguageSelectionScreen() {
  const { locale, setLocale } = useLanguage();
  const session = useAuthSession();
  const [query, setQuery] = useState('');
  const t = useTranslation();
  const backgroundColors = session.isDriver ? Gradients.driver : Gradients.twilight;

  const displayNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale, 'en'], { type: 'language' });
    } catch {
      return null;
    }
  }, [locale]);
  const fallbackDisplayNames = useMemo(() => {
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' });
    } catch {
      return null;
    }
  }, []);

  const languages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return LANGUAGE_CODES.map((code) => {
      const name =
        displayNames?.of(code) ?? fallbackDisplayNames?.of(code) ?? code;
      return { code, name };
    })
      .filter((language) => {
        if (!normalizedQuery) return true;
        return (
          language.name.toLowerCase().includes(normalizedQuery) ||
          language.code.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [displayNames, query]);

  const handleSelect = (code: string) => {
    setLocale(code);
    router.back();
  };

  return (
    <GradientBackground colors={backgroundColors} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <HeaderBackButton onPress={() => router.back()} />
          <Text style={styles.headerTitle}>{t('languageTitle')}</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.card}>
            <TextInput
              style={styles.searchInput}
              placeholder={t('languageSearchPlaceholder')}
              placeholderTextColor={Colors.gray500}
              value={query}
              onChangeText={setQuery}
            />
            {languages.length === 0 ? (
              <Text style={styles.emptyState}>{t('languageNoResults')}</Text>
            ) : (
              languages.map((language) => (
                <Pressable
                  key={language.code}
                  style={styles.languageRow}
                  onPress={() => handleSelect(language.code)}
                >
                  <View>
                    <Text style={styles.languageName}>{language.name}</Text>
                    <Text style={styles.languageCode}>{language.code.toUpperCase()}</Text>
                  </View>
                  {locale === language.code ? (
                    <IconSymbol name="checkmark" size={16} color={Colors.primary} />
                  ) : null}
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  header: {
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  searchInput: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    backgroundColor: '#F5F5FB',
    color: Colors.ink,
  },
  emptyState: {
    marginTop: Spacing.lg,
    textAlign: 'center',
    color: Colors.gray500,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECEFFD',
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
  },
  languageCode: {
    fontSize: 12,
    color: Colors.gray500,
  },
});

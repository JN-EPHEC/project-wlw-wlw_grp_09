import { router } from 'expo-router';
import { SafeAreaView, ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';

import { HeaderBackButton } from '@/components/ui/header-back-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GradientBackground } from '@/components/ui/gradient-background';
import { Colors, Gradients, Spacing, Shadows } from '@/app/ui/theme';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useTranslation } from '@/hooks/use-language';

export default function TermsScreen() {
  const session = useAuthSession();
  const t = useTranslation();
  const backgroundColors = session.isDriver ? Gradients.driver : Gradients.twilight;

  const sections = [
    {
      title: t('termsIntroductionTitle'),
      body: t('termsBodyIntroduction'),
      icon: 'doc.text',
    },
    {
      title: t('termsUsageTitle'),
      body: t('termsBodyUsage'),
      icon: 'car.fill',
    },
    {
      title: t('termsResponsibilitiesTitle'),
      body: t('termsBodyResponsibilities'),
      icon: 'shield.fill',
    },
    {
      title: t('termsPaymentsTitle'),
      body: t('termsBodyPayments'),
      icon: 'creditcard.fill',
    },
    {
      title: t('termsPrivacyTitle'),
      body: t('termsBodyPrivacy'),
      icon: 'lock.shield.fill',
    },
    {
      title: t('termsContactTitle'),
      body: t('termsBodyContact'),
      icon: 'envelope.fill',
    },
  ];

  return (
    <GradientBackground colors={backgroundColors} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <HeaderBackButton onPress={() => router.back()} />
          <Text style={styles.headerTitle}>{t('termsTitle')}</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
      <View style={styles.card}>
        <View style={styles.hero}>
          <View style={styles.heroTitleRow}>
            <IconSymbol name="sparkles" size={18} color={Colors.primary} />
            <Text style={styles.heroTitle}>{t('termsHeroLabel')}</Text>
          </View>
          <Text style={styles.heroIntro}>{t('termsIntro')}</Text>
        </View>
            {sections.map((section, index) => (
              <View
                key={section.title}
                style={[
                  styles.section,
                  index === sections.length - 1 && styles.sectionLast,
                ]}
              >
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIcon}>
                    <IconSymbol name={section.icon as any} size={16} color={Colors.primary} />
                  </View>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                </View>
                <Text style={styles.sectionBody}>{section.body}</Text>
              </View>
            ))}
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
    borderRadius: 36,
    padding: Spacing.lg,
    gap: Spacing.lg,
    ...Shadows.card,
  },
  hero: {
    backgroundColor: '#F9F7FF',
    borderRadius: 24,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.ink,
  },
  heroIntro: {
    color: Colors.gray600,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    gap: Spacing.xs,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECEFFD',
  },
  sectionLast: {
    borderBottomWidth: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ECEFFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.ink,
  },
  sectionBody: {
    color: Colors.gray600,
    fontSize: 14,
    lineHeight: 20,
  },
});

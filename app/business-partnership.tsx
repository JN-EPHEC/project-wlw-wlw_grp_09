import { router } from 'expo-router';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';
import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';

const C = Colors;

const heroStats = [
  { label: 'Utilisateurs actifs', value: '15K+', accent: C.primary },
  { label: 'Impressions/mois', value: '45K+', accent: C.secondaryDark },
];

const benefitPoints = [
  { title: 'Audience ciblée', detail: 'Étudiants et professeurs actifs quotidiennement' },
  { title: 'Visibilité maximale', detail: "Vos annonces affichées dans toute l'application" },
  { title: 'Budgets flexibles', detail: 'Solutions adaptées aux petites et grandes entreprises' },
  { title: 'Mesure des résultats', detail: 'Dashboard avec statistiques en temps réel' },
];

const formatPackages = [
  {
    title: 'Banner horizontal',
    subtitle: '320x100px · Affiché dans les listes de trajets',
    price: 'À partir de 99€/mois',
    tag: 'Populaire',
    tagColor: C.primary,
  },
  {
    title: 'Banner carré',
    subtitle: '300x300px · Intégré entre les trajets',
    price: 'À partir de 149€/mois',
    tag: 'Recommandé',
    tagColor: C.success,
  },
  {
    title: 'Package premium',
    subtitle: 'Tous formats · Placement prioritaire',
    price: 'À partir de 299€/mois',
    tag: 'Top',
    tagColor: C.accent,
  },
];

const trustQuotes = [
  {
    text: '"CampusRide nous a permis de toucher notre cible de manière efficace et abordable !"',
    author: '- Pizza Student, Bruxelles',
  },
  {
    text: '"ROI impressionnant. Nos ventes ont augmenté de 35% grâce aux étudiants !"',
    author: '- TechShop Campus',
  },
];

export default function BusinessPartnershipScreen() {

  const goBack = () => {
    try {
      router.back();
    } catch {
      router.replace('/(tabs)/profile');
    }
  };

  const onRequestQuote = () => {
    router.push('/business-quote');
  };

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable onPress={goBack} style={styles.backRow} accessibilityRole="button" hitSlop={12}>
            <IconSymbol name="arrow.up.left" size={24} color={C.white} />
            <Text style={styles.backLabel}>Retour</Text>
          </Pressable>

          <View style={styles.headerBlock}>
            <Text style={styles.pageTitle}>Publicité</Text>
            <Text style={styles.pageSubtitle}>Touchez des milliers d'étudiants</Text>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <IconSymbol name="sparkles" size={32} color={C.white} />
            </View>
            <Text style={styles.heroTitle}>Annoncez sur CampusRide</Text>
            <Text style={styles.heroBody}>
              Faites connaître votre entreprise auprès de milliers d'étudiants et professeurs chaque jour.
            </Text>
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroBadge}>
                <IconSymbol name="iphone" size={16} color={C.white} />
                <Text style={styles.heroBadgeText}>+15,000 utilisateurs actifs</Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            {heroStats.map((stat) => (
              <View key={stat.label} style={styles.statCard}>
                <Text style={[styles.statValue, { color: stat.accent }]}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Pourquoi faire de la pub ?</Text>
            {benefitPoints.map((point) => (
              <View key={point.title} style={styles.infoRow}>
                <IconSymbol name="checkmark.seal.fill" size={20} color={C.success} />
                <View style={styles.infoTextWrap}>
                  <Text style={styles.infoTitle}>{point.title}</Text>
                  <Text style={styles.infoDetail}>{point.detail}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Formats disponibles</Text>
            {formatPackages.map((format) => (
              <View key={format.title} style={styles.packageCard}>
                <View style={styles.packageHeader}>
                  <Text style={styles.packageTitle}>{format.title}</Text>
                  <View style={[styles.packageTag, { borderColor: format.tagColor }]}> 
                    <Text style={[styles.packageTagText, { color: format.tagColor }]}>{format.tag}</Text>
                  </View>
                </View>
                <Text style={styles.packageSubtitle}>{format.subtitle}</Text>
                <Text style={styles.packagePrice}>{format.price}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.sectionCard, styles.trustCard]}>
            <Text style={styles.sectionTitle}>Ils nous font confiance</Text>
            {trustQuotes.map((quote) => (
              <View key={quote.author} style={styles.quoteCard}>
                <Text style={styles.quoteText}>{quote.text}</Text>
                <Text style={styles.quoteAuthor}>{quote.author}</Text>
              </View>
            ))}
          </View>

          <View style={styles.ctaSection}>
            <Pressable
              style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
              onPress={onRequestQuote}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>Demander un devis</Text>
              <IconSymbol name="arrow.up.right.square" size={20} color={C.white} />
            </Pressable>
            <Text style={styles.ctaHint}>Nos équipes vous répondent sous 48h</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    gap: Spacing.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  backLabel: {
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
  },
  headerBlock: {
    marginTop: Spacing.sm,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: C.white,
  },
  pageSubtitle: {
    color: C.white,
    marginTop: Spacing.xs,
  },
  heroCard: {
    backgroundColor: '#F14BBF',
    borderRadius: 28,
    padding: Spacing.lg,
    shadowColor: '#0B2545',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 20,
    elevation: 8,
    gap: Spacing.xs,
  },
  heroIcon: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: Spacing.sm,
    borderRadius: 999,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: C.white,
  },
  heroBody: {
    color: C.white,
    fontSize: 16,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Spacing.xxl,
  },
  heroBadgeText: {
    color: C.white,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 24,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
    shadowColor: '#0B2545',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    color: C.gray600,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    padding: Spacing.lg,
    gap: Spacing.md,
    shadowColor: '#0B2545',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 6,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    padding: Spacing.lg,
    gap: Spacing.md,
    shadowColor: '#0B2545',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 4,
  },
  trustCard: {
    backgroundColor: '#F6F6FB',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.ink,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  infoTextWrap: {
    flex: 1,
  },
  infoTitle: {
    fontWeight: '700',
  },
  infoDetail: {
    color: C.gray600,
    marginTop: Spacing.xs,
  },
  packageCard: {
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 22,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  packageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  packageTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: C.ink,
  },
  packageSubtitle: {
    color: C.gray600,
    fontSize: 14,
  },
  packagePrice: {
    color: C.primary,
    fontWeight: '700',
  },
  packageTag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  packageTagText: {
    fontSize: 12,
    fontWeight: '700',
  },
  quoteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  quoteText: {
    color: C.gray900,
    fontSize: 15,
  },
  quoteAuthor: {
    marginTop: Spacing.xs,
    color: C.gray600,
    fontSize: 13,
  },
  ctaSection: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: C.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    justifyContent: 'center',
  },
  ctaButtonPressed: {
    opacity: 0.9,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: C.white,
    fontWeight: '700',
    fontSize: 16,
  },
  ctaHint: {
    color: C.white,
    fontSize: 12,
    opacity: 0.9,
    textAlign: 'center',
  },
});

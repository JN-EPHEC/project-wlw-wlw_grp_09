import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FAQ_ITEMS } from '@/constants/help-center';

const C = Colors;
const R = Radius;

export default function HelpScreen() {
  const router = useRouter();
  const [activeFaq, setActiveFaq] = useState(FAQ_ITEMS[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [showAllFaq, setShowAllFaq] = useState(false);

  const handleGoBack = useCallback(() => {
    try {
      router.back();
    } catch {
      router.push('/(tabs)/profile');
    }
  }, [router]);

  const openSupportChat = () => router.push('/(tabs)/messages');
  const openSupportEmail = () =>
    Linking.openURL('mailto:support@campusride.be').catch(() =>
      Alert.alert('Email indisponible', 'Impossible d’ouvrir ton application email.')
    );
  const callSupport = () =>
    Linking.openURL('tel:+3224001234').catch(() =>
      Alert.alert('Appel impossible', "Impossible d'initier l'appel depuis cet appareil.")
    );

  const filteredFaq = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return FAQ_ITEMS;
    return FAQ_ITEMS.filter(
      (item) =>
        item.question.toLowerCase().includes(value) ||
        item.answer.toLowerCase().includes(value)
    );
  }, [query]);

  const displayedFaq = useMemo(() => {
    const hasQuery = query.trim().length > 0;
    if (hasQuery || showAllFaq) return filteredFaq;
    return filteredFaq.slice(0, 4);
  }, [filteredFaq, query, showAllFaq]);

  const canShowMore = !query.trim() && filteredFaq.length > 4;

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <GradientBackground colors={Gradients.cta} style={styles.heroCard}>
            <Pressable
              style={styles.heroBackButton}
              onPress={handleGoBack}
              accessibilityRole="button"
              hitSlop={12}
            >
              <IconSymbol name="chevron.left.circle.fill" size={32} color={C.white} />
              <Text style={styles.heroBackText}>Retour</Text>
            </Pressable>
            <View style={styles.heroHeader}>
              <IconSymbol name="questionmark.circle" size={32} color="#FFFFFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>Centre d’aide</Text>
              </View>
            </View>
         </GradientBackground>

          <GradientBackground colors={Gradients.card} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Questions fréquentes</Text>
            <View style={styles.searchBox}>
              <IconSymbol name="magnifyingglass" size={18} color={C.gray500} />
              <TextInput
                placeholder="Rechercher dans l’aide..."
                placeholderTextColor={C.gray500}
                value={query}
                onChangeText={setQuery}
                style={styles.searchInput}
              />
            </View>
            <View style={styles.faqList}>
              {displayedFaq.map((item, index) => {
                const expanded = activeFaq === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setActiveFaq((prev) => (prev === item.id ? null : item.id))}
                    style={[styles.faqItem, expanded && styles.faqItemExpanded]}
                    accessibilityRole="button"
                  >
                    <View style={styles.faqQuestionRow}>
                      <View style={styles.faqBadge}>
                        <Text style={styles.faqBadgeText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.faqQuestion}>{item.question}</Text>
                      <View style={[
                        styles.faqChevron,
                        expanded && styles.faqChevronActive,
                      ]}>
                        <IconSymbol
                          name="chevron.down"
                          size={16}
                          color={expanded ? '#FFFFFF' : C.gray500}
                          style={expanded ? styles.faqIndicatorOpen : undefined}
                        />
                      </View>
                    </View>
                    {expanded ? <Text style={styles.faqAnswer}>{item.answer}</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            {canShowMore ? (
              <Pressable
                style={styles.showMoreButton}
                onPress={() => setShowAllFaq((prev) => !prev)}
                accessibilityRole="button"
              >
                <Text style={styles.showMoreText}>{showAllFaq ? 'Voir moins' : 'Voir plus'}</Text>
                <IconSymbol
                  name={showAllFaq ? 'chevron.up' : 'chevron.down'}
                  size={16}
                  color={C.primary}
                />
              </Pressable>
            ) : null}

            {filteredFaq.length === 0 ? (
              <Text style={styles.emptyState}>Aucune question trouvée pour “{query}”.</Text>
            ) : null}

            <View style={styles.supportCard}>
              <Text style={styles.supportTitle}>Contacter le support</Text>
              <Pressable style={styles.supportAction} onPress={openSupportChat}>
                <IconSymbol name="bubble.left.and.bubble.right.fill" size={20} color={C.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.supportActionLabel}>Chat en direct</Text>
                  <Text style={styles.supportActionHint}>Réponse en quelques minutes</Text>
                </View>
              </Pressable>
              <Pressable style={styles.supportAction} onPress={openSupportEmail}>
                <IconSymbol name="envelope.fill" size={20} color={C.secondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.supportActionLabel}>Email</Text>
                  <Text style={styles.supportActionHint}>support@campusride.be</Text>
                </View>
              </Pressable>
              <Pressable style={styles.supportAction} onPress={callSupport}>
                <IconSymbol name="phone.fill" size={20} color={C.primaryDark} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.supportActionLabel}>Téléphone</Text>
                  <Text style={styles.supportActionHint}>+32 2 400 12 34</Text>
                </View>
              </Pressable>
              <View style={styles.supportHours}>
                <IconSymbol name="clock" size={20} color={C.gray600} />
                <View>
                  <Text style={styles.supportHoursLabel}>Heures d’ouverture</Text>
                  <Text style={styles.supportHoursText}>Lundi - Vendredi : 9h00 - 18h00</Text>
                  <Text style={styles.supportHoursText}>Samedi : 10h00 - 16h00</Text>
                  <Text style={styles.supportHoursText}>Dimanche : Fermé</Text>
                </View>
              </View>
            </View>
          </GradientBackground>
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  heroCard: {
    borderRadius: R.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  heroBackText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  heroHeader: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  heroHeaderAligned: {
    justifyContent: 'flex-start',
    paddingLeft: Spacing.sm,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  sectionCard: {
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: 'rgba(21,23,43,0.08)',
    padding: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#0B2545',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  sectionTitle: { fontWeight: '800', fontSize: 18, color: C.ink },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(248,249,255,0.95)',
    borderRadius: 24,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(21,23,43,0.08)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.ink,
  },
  faqList: { gap: Spacing.sm },
  faqItem: {
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: 'rgba(21,23,43,0.08)',
    backgroundColor: 'rgba(248,249,255,0.95)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  faqItemExpanded: {
    borderColor: 'rgba(255,131,71,0.35)',
    backgroundColor: 'rgba(255,131,71,0.08)',
  },
  faqQuestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  faqBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,131,71,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqBadgeText: { color: C.primary, fontWeight: '700' },
  faqQuestion: { flex: 1, fontWeight: '700', color: C.ink },
  faqChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqChevronActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  showMoreButton: {
    marginTop: Spacing.xs,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,131,71,0.12)',
  },
  showMoreText: {
    color: C.primary,
    fontWeight: '700',
  },
  faqAnswer: { color: C.gray600, fontSize: 13, lineHeight: 18 },
  faqIndicatorOpen: { transform: [{ rotate: '180deg' }] },
  emptyState: {
    textAlign: 'center',
    color: C.gray500,
    fontSize: 13,
    paddingVertical: Spacing.sm,
  },
  supportCard: {
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: 'rgba(18,26,51,0.12)',
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#0B2545',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  supportTitle: { fontWeight: '700', color: C.ink, fontSize: 15 },
  supportAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: R.md,
    backgroundColor: 'rgba(248,249,255,0.95)',
  },
  supportActionLabel: { fontWeight: '600', color: C.ink },
  supportActionHint: { color: C.gray600, fontSize: 12 },
  supportHours: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(21,23,43,0.12)',
    paddingTop: Spacing.sm,
  },
  supportHoursLabel: { fontWeight: '700', color: C.gray700 },
  supportHoursText: { color: C.gray600, fontSize: 12 },
});

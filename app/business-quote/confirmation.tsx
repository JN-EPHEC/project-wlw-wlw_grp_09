import { router } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';
import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { confirmationTiles, steps } from '@/app/business-quote/constants';

const C = Colors;

export default function BusinessQuoteConfirmationScreen() {
  const goBack = () => {
    try {
      router.replace('/(tabs)/profile');
    } catch {
      router.push('/(tabs)/profile');
    }
  };

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.headerBlock}>
            <Text style={styles.pageTitle}>Merci pour votre intérêt !</Text>
            <Text style={styles.pageSubtitle}>Nous avons bien reçu votre demande de publicité.</Text>
          </View>
          <View style={styles.confirmationGrid}>
            {confirmationTiles.map((tile) => (
              <View key={tile.title} style={styles.confirmationCard}>
                <View style={[styles.confirmationIcon, { backgroundColor: tile.tint + '22' }]}> 
                  <IconSymbol name={tile.icon} size={22} color={tile.tint} />
                </View>
                <View style={styles.confirmationText}>
                  <Text style={styles.confirmationTitle}>{tile.title}</Text>
                  <Text style={styles.confirmationDescription}>{tile.description}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={[styles.sectionCard, styles.stepsCard]}>
            <Text style={styles.sectionTitle}>Prochaines étapes</Text>
            {steps.map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <Text style={styles.stepIndex}>{index + 1}.</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
          <Pressable style={styles.backButton} onPress={goBack} accessibilityRole="button">
            <Text style={styles.backButtonText}>Retour au profil</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    gap: Spacing.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  headerBlock: {
    marginTop: Spacing.sm,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: C.white,
  },
  pageSubtitle: {
    color: C.white,
    marginTop: Spacing.xs,
  },
  confirmationGrid: {
    gap: Spacing.sm,
  },
  confirmationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
    shadowColor: '#0B2545',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
  },
  confirmationIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationText: { flex: 1, gap: Spacing.xs },
  confirmationTitle: {
    fontWeight: '700',
    color: C.ink,
  },
  confirmationDescription: {
    color: C.gray600,
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 30,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  stepsCard: {
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.ink,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  stepIndex: {
    color: C.primary,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    color: C.gray700,
  },
  backButton: {
    marginTop: Spacing.xl,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  backButtonText: {
    fontWeight: '700',
    color: C.primary,
  },
});

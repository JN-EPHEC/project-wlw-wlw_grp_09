import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';

const C = Colors;

export default function PaymentConfirmationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    driver?: string;
    depart?: string;
    destination?: string;
    departureAt?: string;
    paymentMethod?: string;
  }>();

  const depart = params.depart ?? 'ton point de départ';
  const destination = params.destination ?? 'ta destination';
  const driver = params.driver ?? 'ton conducteur';
  const departureAt = params.departureAt ? Number(params.departureAt) : undefined;
  const paymentMethod = params.paymentMethod ?? 'wallet';

  const formatDeparture = () => {
    if (!departureAt || Number.isNaN(departureAt)) {
      return 'Date et heure bientôt disponibles';
    }
    const date = new Date(departureAt);
    return date.toLocaleString('fr-BE', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const paymentLabel =
    paymentMethod === 'wallet'
      ? 'Payé avec ton wallet'
      : paymentMethod === 'card'
      ? 'Payé par carte'
      : 'Paiement confirmé';

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <GradientBackground colors={Gradients.card} style={styles.card}>
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <IconSymbol name="checkmark.seal.fill" size={32} color={C.white} />
              </View>
              <Text style={styles.title}>Vous avez payé</Text>
              <Text style={styles.subtitle}>
                Ton trajet est confirmé et apparaît automatiquement dans tes trajets à venir.
              </Text>
            </View>

            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <IconSymbol name="location.fill" size={18} color={C.primary} />
                <Text style={styles.infoText}>
                  {depart} → {destination}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="clock" size={18} color={C.accent} />
                <Text style={styles.infoText}>{formatDeparture()}</Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="creditcard.fill" size={18} color={C.secondaryDark} />
                <Text style={styles.infoText}>{paymentLabel}</Text>
              </View>
            </View>

            <Text style={styles.infoCopy}>
              Tu peux retrouver cette réservation dans « Mes trajets → À venir » pour suivre ou
              modifier ton trajet.
            </Text>
          </View>

          <View style={styles.actions}>
            <GradientButton
              title="Voir mes trajets"
              variant="cta"
              fullWidth
              onPress={() => router.push({ pathname: '/trips', params: { initialTab: 'upcoming' } })}
              accessibilityRole="button"
            />
            <GradientButton
              title="Retour à l’accueil"
              variant="lavender"
              fullWidth
              onPress={() => router.push('/')}
              accessibilityRole="button"
            />
          </View>
        </GradientBackground>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: Spacing.lg,
  },
  card: {
    flex: 1,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    gap: Spacing.xl,
    ...Shadows.card,
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  header: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: Radius['2xl'],
    backgroundColor: C.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: C.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: C.gray600,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: C.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.card,
    alignSelf: 'stretch',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  infoText: {
    flexShrink: 1,
    color: C.gray700,
    fontSize: 14,
    textAlign: 'center',
  },
  infoCopy: {
    fontSize: 14,
    color: C.gray600,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
  },
  actions: {
    gap: Spacing.md,
    alignSelf: 'stretch',
    marginTop: 'auto',
  },
});

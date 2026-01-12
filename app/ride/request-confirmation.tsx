import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';

const C = Colors;

export default function RideRequestConfirmationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    driver?: string;
    depart?: string;
    destination?: string;
    cancelled?: string;
    paid?: string;
  }>();
  const driver = params.driver ?? 'le conducteur';
  const depart = params.depart ?? 'ton point de départ';
  const destination = params.destination ?? 'ton campus';
  const isCancelled = params.cancelled === '1';
  const isPaid = !isCancelled && params.paid === '1';

  const title = isCancelled
    ? 'Réservation annulée'
    : isPaid
    ? 'Ta place est confirmée.'
    : 'Demande envoyée';
  const subtitle = isCancelled
    ? `Ta réservation pour ${depart} → ${destination} est annulée. ${driver} a été averti immédiatement.`
    : isPaid
    ? null
    : `Nous avons transmis ta demande à ${driver}. Il doit l’accepter avant de confirmer ton trajet.`;
  const paymentNote = isCancelled
    ? 'Aucun paiement ne sera prélevé. Tu peux réserver un autre trajet quand tu veux.'
    : isPaid
    ? 'Ton trajet apparaît maintenant dans “Mes trajets”. Tu peux suivre tous les détails depuis cet onglet.'
    : `Le paiement se fait manuellement dès que ${driver} accepte ta demande.`;

  const reminderCopy = isCancelled
    ? null
    : isPaid
    ? 'Tu recevras un rappel avant le départ. Sois prêt à l’heure au point de rencontre.'
    : 'Tu recevras une notification dès que la réponse arrive.';

  const primaryAction = isPaid ? () => router.push('/trips') : isCancelled ? () => router.push('/') : () => router.push('/requests');
  const primaryLabel = isPaid ? 'Voir mes trajets' : isCancelled ? 'Retour à l’accueil' : 'Voir mes demandes';
  const showSecondary = !isCancelled;
  const secondaryAction = () => router.push('/');
  const secondaryLabel = 'Retour à l’accueil';
  const iconCircleStyles = [
    styles.iconCircle,
    isCancelled && styles.iconCircleWarning,
    isPaid && styles.iconCircleSuccess,
  ];
  const iconName = isCancelled ? 'xmark' : isPaid ? 'checkmark.seal.fill' : 'paperplane.fill';

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <GradientBackground colors={Gradients.card} style={styles.card}>
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={iconCircleStyles}>
                <IconSymbol name={iconName} size={26} color={C.white} />
              </View>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>

            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <IconSymbol name='location.fill' size={18} color={C.primary} />
                <Text style={styles.infoText}>
                  {depart} → {destination}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name='clock' size={18} color={C.accent} />
                <Text style={styles.infoText}>{paymentNote}</Text>
              </View>
              {reminderCopy ? (
                <View style={styles.infoRow}>
                  <IconSymbol name='bell.fill' size={18} color={C.secondaryDark} />
                  <Text style={styles.infoText}>{reminderCopy}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.actions}>
            <GradientButton
              title={primaryLabel}
              variant='cta'
              fullWidth
              onPress={primaryAction}
              accessibilityRole='button'
            />
            {showSecondary ? (
              <GradientButton
                title={secondaryLabel}
                variant='cta'
                fullWidth
                onPress={secondaryAction}
                accessibilityRole='button'
              />
            ) : null}
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
    gap: Spacing.lg,
  },
  header: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: Radius['2xl'],
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleWarning: {
    backgroundColor: C.danger,
  },
  iconCircleSuccess: {
    backgroundColor: C.success,
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
  actions: {
    gap: Spacing.md,
    alignSelf: 'stretch',
    marginTop: 'auto',
  },
});

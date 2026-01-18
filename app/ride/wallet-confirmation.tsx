import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import {
  cancelReservation,
  confirmReservationWithoutPayment,
  getRides,
  subscribeRides,
  type Ride,
} from '@/app/services/rides';
import {
  canPayWithWallet,
  creditWallet,
  debitWallet,
  getWallet,
  subscribeWallet,
} from '@/app/services/wallet';
import { createBooking } from '@/app/services/booking-store';
import { useAuthSession } from '@/hooks/use-auth-session';
import { maskPlate } from '@/app/utils/plate';
import { resolveMeetingPoint } from '@/utils/meeting-point';

const C = Colors;

export default function WalletConfirmationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    rideId?: string;
    amount?: string;
    depart?: string;
    destination?: string;
  }>();
  const session = useAuthSession();
  const [rides, setRides] = useState<Ride[]>(() => getRides());
  const [walletSnapshot, setWalletSnapshot] = useState(() =>
    session.email ? getWallet(session.email) : null
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeRides(setRides);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!session.email) {
      setWalletSnapshot(null);
      return;
    }
    const unsubscribe = subscribeWallet(session.email, setWalletSnapshot);
    return unsubscribe;
  }, [session.email]);

  const rideId = Array.isArray(params.rideId) ? params.rideId[0] : params.rideId;
  const ride = useMemo(() => (rideId ? rides.find((item) => item.id === rideId) ?? null : null), [
    rideId,
    rides,
  ]);
  const amount = params.amount ? Number(params.amount) : null;
  const walletBalance = walletSnapshot?.balance ?? 0;

  const handleConfirm = useCallback(() => {
    if (!rideId || !amount || Number.isNaN(amount)) {
      setError('Informations manquantes pour valider le paiement.');
      return;
    }
    if (!session.email) {
      router.replace('/sign-up');
      return;
    }
    if (!ride) {
      setError('Trajet introuvable.');
      return;
    }
    if (!Number.isFinite(ride.departureAt ?? NaN)) {
      console.error('[WalletConfirm] missing departureAt for ride', ride.id);
      setError('Impossible de confirmer ce trajet, la date est mal configurée.');
      return;
    }
    if (!canPayWithWallet(session.email, amount)) {
      setError('Solde insuffisant dans ton wallet.');
      return;
    }
    console.debug('[WalletConfirm] pressed', { rideId, amount, email: session.email });
    console.debug('[WalletConfirm] walletBefore', walletBalance);
    setIsProcessing(true);
    setError(null);
    try {
      const debitResult = debitWallet(
        session.email,
        amount,
        `Paiement trajet ${ride.depart} → ${ride.destination}`,
        { rideId }
      );
      console.debug('[WalletConfirm] debit', debitResult);
      if (!debitResult) {
        throw new Error('Solde insuffisant ou montant invalide.');
      }
      const reservation = confirmReservationWithoutPayment(ride.id, session.email);
      if (!reservation) {
        creditWallet(session.email, amount, {
          description: 'Annulation paiement',
          rideId,
          reason: 'reservation_failed',
        });
        throw new Error('Impossible de confirmer ce trajet pour le moment.');
      }
      const meetingPointSnapshot = resolveMeetingPoint({ ride });
      const meetingPointAddress = meetingPointSnapshot.address || ride.depart;
      const meetingPointLatLng = meetingPointSnapshot.latLng ?? null;
      const driverPlate = ride.plate ?? '';
      const bookingPayload = {
        id: `${ride.id}:${session.email}:${Date.now()}`,
        rideId: ride.id,
        passengerEmail: session.email,
        status: 'paid' as const,
        paid: true,
        paymentMethod: 'wallet' as const,
        paidAt: Date.now(),
        amount,
        pricePaid: amount,
        createdAt: Date.now(),
        depart: ride.depart,
        destination: ride.destination,
        driver: ride.driver,
        ownerEmail: ride.ownerEmail,
        departureAt: ride.departureAt,
        meetingPoint: meetingPointAddress,
        meetingPointAddress,
        meetingPointLatLng,
        time: ride.time,
        plate: ride.plate ?? null,
        driverPlate,
        maskedPlate: maskPlate(driverPlate),
      };
      console.debug('[WalletConfirm] booking payload', bookingPayload);
      const bookingResult = createBooking(bookingPayload);
      console.debug('[WalletConfirm] reservationResult', bookingResult);
      if (!bookingResult.ok) {
        cancelReservation(ride.id, session.email);
        creditWallet(session.email, amount, {
          description: 'Annulation paiement',
          rideId,
          reason: 'booking_failed',
        });
        throw new Error('Impossible de sauvegarder la confirmation.');
      }
      router.replace({
        pathname: '/ride/confirmed',
        params: { bookingId: bookingPayload.id },
      });
    } catch (err) {
      console.error('[WalletConfirm] failed', err);
      setError(err instanceof Error ? err.message : 'Impossible de confirmer le paiement pour le moment.');
    } finally {
      setIsProcessing(false);
    }
  }, [rideId, amount, session.email, ride, router, walletBalance]);

  const amountLabel = amount ? `€${amount.toFixed(2)}` : '—';
  const routeLabel = ride ? `${ride.depart} → ${ride.destination}` : `${params.depart ?? 'Ton trajet'} → ${
    params.destination ?? ''
  }`;

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <GradientBackground colors={Gradients.card} style={styles.card}>
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <IconSymbol name="wallet.pass.fill" size={28} color={C.white} />
              </View>
              <Text style={styles.title}>Confirmer votre paiement</Text>
              <Text style={styles.subtitle}>
                Le montant sera débité de ton wallet et ton trajet sera confirmé.
              </Text>
            </View>

            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <IconSymbol name="location.fill" size={18} color={C.primary} />
                <Text style={styles.infoText}>{routeLabel}</Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="creditcard.fill" size={18} color={C.secondaryDark} />
                <Text style={styles.infoText}>{`Montant : ${amountLabel}`}</Text>
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <View style={styles.actions}>
            <GradientButton
              variant="cta"
              fullWidth
              disabled={isProcessing || !ride || !amount}
              onPress={handleConfirm}
            >
              {isProcessing ? <ActivityIndicator color="#fff" /> : null}
              <Text style={styles.actionsLabel}>Confirmer mon paiement – {amountLabel}</Text>
            </GradientButton>
            <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
              <Text style={styles.secondaryLabel}>Annuler</Text>
            </Pressable>
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
    gap: Spacing.lg,
    alignItems: 'center',
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
  title: {
    fontSize: 28,
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
    width: '100%',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    color: C.gray700,
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.md,
    alignSelf: 'stretch',
  },
  actionsLabel: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: C.gray300,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  secondaryLabel: {
    fontWeight: '700',
    color: C.gray600,
  },
});

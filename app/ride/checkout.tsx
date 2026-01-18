import { ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { MeetingMap } from '@/components/meeting-map';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { maskPlate } from '@/app/utils/plate';
import { resolveMeetingPoint } from '@/utils/meeting-point';
import { useAuthSession } from '@/hooks/use-auth-session';
import { usePassengerRequests } from '@/hooks/use-passenger-requests';
import {
  listBookingsByPassenger,
  patchBooking,
  subscribeBookingsByPassenger,
  createBooking,
  type Booking,
} from '@/app/services/booking-store';
import {
  getRides,
  subscribeRides,
  type Ride,
} from '@/app/services/rides';
import { removeReservationRequest } from '@/app/services/reservation-requests';
import {
  creditWallet,
  getWallet,
  payWithWallet,
  subscribeWallet,
  type WalletSnapshot,
} from '@/app/services/wallet';
import { createThread } from '@/app/services/messages';
import { CAMPUSRIDE_COMMISSION_RATE } from '@/app/constants/fuel';

const C = Colors;

const formatCurrency = (value: number) => `€${value.toFixed(2)}`;

type InfoRowProps = {
  icon: ComponentProps<typeof IconSymbol>['name'];
  label: string;
  value: string;
};

const InfoRow = ({ icon, label, value }: InfoRowProps) => (
  <View style={styles.infoRow}>
    <IconSymbol name={icon} size={18} color={C.gray500} />
    <View style={styles.infoText}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  </View>
);

export default function RideCheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    rideId?: string | string[];
    rideid?: string | string[];
    rideID?: string | string[];
    id?: string | string[];
  }>();
  const rawRideId = params.rideId ?? params.rideid ?? params.rideID ?? params.id;
  const rideId = Array.isArray(rawRideId) ? rawRideId[0] : rawRideId ?? null;
  const rideIdString = typeof rideId === 'string' ? rideId : '';
  const session = useAuthSession();
  const passengerRequests = usePassengerRequests(session.email);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(() => (session.email ? getWallet(session.email) : null));
  const [rides, setRides] = useState<Ride[]>(() => getRides());
  const [ridesLoaded, setRidesLoaded] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>(() =>
    session.email ? listBookingsByPassenger(session.email) : []
  );
  const [bookingsLoaded, setBookingsLoaded] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [walletPaymentError, setWalletPaymentError] = useState<string | null>(null);

  useEffect(() => {
    console.debug('[Checkout] params', {
      rideId: params.rideId,
      rideid: params.rideid,
      rideID: params.rideID,
      id: params.id,
    });
    console.debug('[Checkout] rideIdString', rideIdString);
  }, [params.id, params.rideID, params.rideId, params.rideid, rideIdString]);

  useEffect(() => {
    const unsubscribe = subscribeRides((nextRides) => {
      setRides(nextRides);
      setRidesLoaded(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    setBookingsLoaded(false);
    if (!session.email) {
      setBookings([]);
      setBookingsLoaded(true);
      return;
    }
    const unsubscribe = subscribeBookingsByPassenger(session.email, (next) => {
      setBookings(next);
      setBookingsLoaded(true);
    });
    return unsubscribe;
  }, [session.email]);

  useEffect(() => {
    if (!session.email) {
      setWallet(null);
      return;
    }
    const unsubscribe = subscribeWallet(session.email, setWallet);
    return unsubscribe;
  }, [session.email]);

  const ride = useMemo(() => {
    if (!rideIdString) return null;
    return (
      rides.find((item) => (item.id ?? item.rideId) === rideIdString) ?? null
    );
  }, [rideIdString, rides]);

  const requestForRide = useMemo(() => {
    if (!rideIdString) return null;
    return (
      passengerRequests.requests.find((entry) => entry.rideId === rideIdString) ?? null
    );
  }, [passengerRequests.requests, rideIdString]);

  const bookingForRide = useMemo(() => {
    if (!rideIdString) return null;
    const candidates = bookings.filter((booking) => booking.rideId === rideIdString);
    if (!candidates.length) return null;
    return candidates.reduce((latest, candidate) =>
      candidate.createdAt > latest.createdAt ? candidate : latest
    );
  }, [bookings, rideIdString]);

  const showBookingNotFound = Boolean(rideIdString && bookingsLoaded && !bookingForRide);
  const showLoading = !ridesLoaded || !bookingsLoaded;

  const requestPending = requestForRide?.status === 'pending';
  const requestAccepted = requestForRide?.status === 'accepted';
  const bookingCancelled = bookingForRide?.status === 'cancelled';
  const bookingPaid = bookingForRide?.paymentStatus === 'paid';
const bookingMissing = requestAccepted && !bookingForRide;
const bookingReadyForPayment = Boolean(
  bookingForRide && requestAccepted && !bookingCancelled && !bookingPaid
);

const walletBalance = wallet?.balance ?? 0;

const driverProfileEmail = bookingForRide?.ownerEmail ?? ride?.ownerEmail ?? null;
const resolvedRideId = ride?.id ?? ride?.rideId ?? rideIdString ?? null;
const routeLabel = ride ? `${ride.depart} → ${ride.destination}` : '';

const handleViewDriverProfile = useCallback(() => {
  if (!driverProfileEmail) {
    Alert.alert('Profil indisponible', 'Impossible de retrouver ce conducteur.');
    return;
  }
  router.push({ pathname: '/driver-profile/[email]', params: { email: driverProfileEmail } });
}, [driverProfileEmail, router]);

const handleSendMessageToDriver = useCallback(() => {
  if (!session.email) {
    Alert.alert('Connexion requise', 'Connecte-toi pour envoyer un message.');
    return;
  }
  if (!driverProfileEmail || !ride || !resolvedRideId) {
    Alert.alert('Conversation indisponible', 'Impossible de démarrer la conversation pour le moment.');
    return;
  }
  const thread = createThread({
    rideId: resolvedRideId,
    routeLabel,
    participants: [
      { email: session.email, role: 'passenger' },
      { email: driverProfileEmail, role: 'driver' },
    ],
  });
  router.push({
    pathname: '/(tabs)/messages',
    params: { thread: thread.id, origin: 'checkout' },
  });
}, [driverProfileEmail, ride, resolvedRideId, routeLabel, router, session.email]);

  useEffect(() => {
    if (!rideIdString) return;
    console.log('[Checkout] rideId', rideIdString);
    console.log('[Checkout] booking', bookingForRide);
    console.log('[Checkout] ride', ride);
    console.log('[Checkout] paymentAllowed', bookingReadyForPayment);
  }, [bookingForRide, ride, bookingReadyForPayment, rideIdString]);

  useEffect(() => {
    console.debug('[Checkout] ridesLoaded', ridesLoaded, 'rides', rides.length);
    console.debug('[Checkout] rideFound', ride ? (ride.id ?? ride.rideId) : null);
  }, [ridesLoaded, rides.length, ride]);

  useEffect(() => {
    if (!rideIdString || !bookingForRide) return;
    const departureAtValue =
      bookingForRide.departureAt ?? ride?.departureAt ?? bookingForRide.createdAt ?? '';
    if (bookingPaid) {
      router.replace({
        pathname: '/ride/payment-confirmation',
        params: {
          driver: bookingForRide.driver ?? ride?.driver ?? '',
          depart: bookingForRide.depart ?? ride?.depart ?? '',
          destination: bookingForRide.destination ?? ride?.destination ?? '',
          departureAt: String(departureAtValue),
          paymentMethod: bookingForRide.paymentMethod ?? 'wallet',
        },
      });
      return;
    }
    if (bookingCancelled || requestForRide?.status === 'cancelled') {
      router.replace('/requests');
      return;
    }
  }, [
    bookingCancelled,
    bookingForRide,
    bookingPaid,
    requestForRide?.status,
    ride,
    rideIdString,
    router,
  ]);

  if (showLoading) {
    return (
      <AppBackground colors={Gradients.background}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={C.white} />
            <Text style={styles.loadingText}>Chargement des trajets…</Text>
          </View>
        </SafeAreaView>
      </AppBackground>
    );
  }

  if (!rideIdString) {
    return (
      <AppBackground colors={Gradients.background}>
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <GradientBackground colors={Gradients.card} style={styles.card}>
              <Text style={styles.fallbackTitle}>Trajet introuvable</Text>
              <Text style={styles.fallbackSubtitle}>
                Ce trajet n’existe pas ou le lien est invalide.
              </Text>
              <GradientButton
                title="Retour"
                variant="lavender"
                fullWidth
                onPress={() => router.replace('/requests')}
              />
            </GradientBackground>
          </ScrollView>
        </SafeAreaView>
      </AppBackground>
    );
  }

  if (showBookingNotFound) {
    return (
      <AppBackground colors={Gradients.background}>
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <GradientBackground colors={Gradients.card} style={styles.card}>
              <Text style={styles.fallbackTitle}>Réservation introuvable</Text>
              <Text style={styles.fallbackSubtitle}>
                Aucune réservation active n’a été trouvée pour ce trajet.
              </Text>
              <GradientButton
                title="Retour"
                variant="lavender"
                fullWidth
                onPress={() => router.replace('/requests')}
              />
            </GradientBackground>
          </ScrollView>
        </SafeAreaView>
      </AppBackground>
    );
  }

  const seatsTotal = ride?.seats ?? 0;
  const seatsReserved = ride?.passengers?.length ?? 0;
  const seatsAvailable = Math.max(0, seatsTotal - seatsReserved);
  const departureAt =
    ride?.departureAt ?? ride?.createdAt ?? bookingForRide?.departureAt ?? Date.now();
  const departureLabel = new Date(departureAt).toLocaleDateString('fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeLabel = new Date(departureAt).toLocaleTimeString('fr-BE', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const driverPlate = bookingForRide?.driverPlate ?? ride?.plate ?? null;
  const maskedPlate = driverPlate ? maskPlate(driverPlate) : '—';

  const meetingPoint = resolveMeetingPoint({ booking: bookingForRide, ride });
  const meetingAddress =
    meetingPoint.address ??
    bookingForRide?.meetingPointAddress ??
    ride?.depart ??
    '—';
  const meetingLatLng = meetingPoint.latLng ?? null;

  const passengerAmount =
    bookingForRide?.amount ?? bookingForRide?.pricePaid ?? ride?.price ?? 0;
  const platformFee = passengerAmount * CAMPUSRIDE_COMMISSION_RATE;
  const driverShare = passengerAmount - platformFee;
  const displayDepart = bookingForRide?.depart ?? ride?.depart ?? '—';
  const displayDestination = bookingForRide?.destination ?? ride?.destination ?? '—';
  const displayDriverName = bookingForRide?.driver ?? ride?.driver ?? '—';
  const displayDriverEmail = bookingForRide?.ownerEmail ?? ride?.ownerEmail ?? '—';

  const hasWalletCoverage = walletBalance >= passengerAmount;

  const paymentButtonDisabled =
    !bookingReadyForPayment ||
    isProcessingPayment ||
    passengerAmount <= 0 ||
    !hasWalletCoverage;

  const handlePaymentPress = () => {
    if (!bookingReadyForPayment) return;
    setWalletPaymentError(null);
    setPaymentModalVisible(true);
  };

  const resetPaymentState = () => {
    setIsProcessingPayment(false);
    setWalletPaymentError(null);
    setPaymentModalVisible(false);
  };

  const handleConfirmPayment = async () => {
    if (!session.email || !rideIdString || passengerAmount <= 0 || !bookingReadyForPayment) {
      return;
    }
    if (walletBalance < passengerAmount) {
      setWalletPaymentError('Solde insuffisant.');
      return;
    }
    console.debug('[Checkout] pay pressed', {
      rideId: rideIdString,
      amount: passengerAmount,
      walletBalance,
    });
    setIsProcessingPayment(true);
    setWalletPaymentError(null);
    let debited = false;
    try {
      const paymentResult = payWithWallet(
        session.email,
        passengerAmount,
        `Paiement trajet ${displayDepart} → ${displayDestination}`,
        { rideId: rideIdString }
      );
      if (!paymentResult) {
        setWalletPaymentError('Solde insuffisant.');
        return;
      }
      debited = true;
      const finalBookingId =
        bookingForRide?.id ?? `${rideIdString}:${session.email}:${Date.now()}`;
      const meetingPointAddress = meetingAddress;
      const meetingPointLatLng = meetingLatLng;
      const driverPlateValue = driverPlate;
      const maskedPlateValue = maskPlate(driverPlateValue ?? '');
      const payload = {
        status: 'paid',
        paid: true,
        paymentMethod: 'wallet',
        paymentStatus: 'paid',
        paidAt: Date.now(),
        amountPaid: passengerAmount,
        pricePaid: passengerAmount,
        meetingPoint: meetingPointAddress,
        meetingPointAddress,
        meetingPointLatLng,
        plate: ride?.plate ?? bookingForRide?.plate ?? null,
        driverPlate:
          driverPlateValue ?? ride?.plate ?? bookingForRide?.driverPlate ?? null,
        maskedPlate: maskedPlateValue,
      };
      if (bookingForRide) {
        const patchResult = patchBooking(session.email, bookingForRide.id, {
          ...payload,
        });
        if (!patchResult.ok) {
          throw new Error('Impossible de sauvegarder la réservation.');
        }
      } else {
        const bookingPayload: Booking = {
          id: finalBookingId,
          rideId: bookingForRide?.rideId ?? rideIdString,
          passengerEmail: session.email,
          ownerEmail: displayDriverEmail,
          driver: displayDriverName,
          status: 'paid',
          paid: true,
          paymentMethod: 'wallet',
          paymentStatus: 'paid',
          amount: passengerAmount,
          amountPaid: passengerAmount,
          pricePaid: passengerAmount,
          createdAt: Date.now(),
          depart: displayDepart,
          destination: displayDestination,
          departureAt: departureAt,
          meetingPoint: meetingPointAddress,
          meetingPointAddress,
          meetingPointLatLng,
          time: bookingForRide?.time ?? timeLabel,
          plate: ride?.plate ?? bookingForRide?.plate ?? null,
          driverPlate: driverPlateValue ?? ride?.plate ?? bookingForRide?.driverPlate ?? null,
          maskedPlate: maskedPlateValue,
        };
        const creationResult = createBooking(bookingPayload);
        if (!creationResult.ok) {
          throw new Error('Impossible de créer la réservation.');
        }
      }
      removeReservationRequest(session.email, rideIdString);
      router.replace({
        pathname: '/ride/payment-confirmation',
        params: {
          driver: displayDriverName,
          depart: displayDepart,
          destination: displayDestination,
          departureAt: String(departureAt),
          paymentMethod: 'wallet',
        },
      });
    } catch (error) {
      console.error('[Checkout] payment failed', error);
      if (debited) {
        creditWallet(session.email, passengerAmount, {
          description: 'Annulation paiement',
          rideId: rideIdString,
          reason: 'rollback',
        });
      }
      setWalletPaymentError('Paiement impossible, réessaie.');
    } finally {
      resetPaymentState();
    }
  };

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <IconSymbol name="chevron.left" size={20} color={C.white} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.title}>Procéder au paiement</Text>
              <Text style={styles.subtitle}>
                {displayDepart} → {displayDestination}
              </Text>
            </View>
          </View>

          <GradientBackground colors={Gradients.card} style={styles.card}>
            <Text style={styles.sectionTitle}>Conducteur</Text>
            <Text style={styles.driverName}>{displayDriverName}</Text>
            <Text style={styles.driverEmail}>{displayDriverEmail}</Text>
            <Text style={styles.driverPlate}>Plaque : {maskedPlate}</Text>
            <View style={styles.driverActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.driverActionButton,
                  pressed && styles.driverActionButtonPressed,
                ]}
                onPress={handleViewDriverProfile}
                accessibilityRole="button"
              >
                <IconSymbol name="person.crop.circle" size={16} color={C.primary} />
                <Text style={styles.driverActionText}>Voir le profil</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.driverActionButton,
                  pressed && styles.driverActionButtonPressed,
                ]}
                onPress={handleSendMessageToDriver}
                accessibilityRole="button"
              >
                <IconSymbol name="bubble.left.and.bubble.right.fill" size={16} color={C.primary} />
                <Text style={styles.driverActionText}>Envoyer un message</Text>
              </Pressable>
            </View>
          </GradientBackground>

          <GradientBackground colors={Gradients.card} style={styles.card}>
            <Text style={styles.sectionTitle}>Informations du trajet</Text>
            <InfoRow
              icon="location.fill"
              label="Trajet"
              value={`${displayDepart} → ${displayDestination}`}
            />
            <InfoRow icon="calendar" label="Date" value={departureLabel} />
            <InfoRow icon="clock" label="Heure" value={timeLabel} />
            <InfoRow
              icon="person.fill"
              label="Places restantes"
              value={ride ? `${seatsAvailable} place${seatsAvailable > 1 ? 's' : ''}` : '—'}
            />
          </GradientBackground>

          <GradientBackground colors={Gradients.card} style={styles.card}>
            <Text style={styles.sectionTitle}>Point de rencontre</Text>
            <Text style={styles.meetingAddress}>{meetingAddress}</Text>
            <MeetingMap address={meetingAddress} latLng={meetingLatLng} style={styles.map} />
          </GradientBackground>

          <GradientBackground colors={Gradients.card} style={styles.card}>
            <Text style={styles.sectionTitle}>Transparence paiement</Text>
            <InfoRow icon="creditcard.fill" label="Prix passager" value={formatCurrency(passengerAmount)} />
            <InfoRow icon="shield.fill" label="Commission CampusRide" value={formatCurrency(platformFee)} />
            <InfoRow icon="wallet.pass.fill" label="Montant versé au conducteur" value={formatCurrency(driverShare)} />
            {requestForRide ? (
              <>
                {!requestAccepted && requestPending ? (
                  <Text style={styles.statusCopy}>Ta demande est toujours en attente.</Text>
                ) : null}
                {!requestAccepted && !requestPending && !bookingReadyForPayment ? (
                  <Text style={styles.statusCopy}>
                    La demande a été annulée ou est déjà réglée. Retourne à la page du trajet.
                  </Text>
                ) : null}
                {bookingMissing ? (
                  <Text style={styles.statusCopy}>
                    La réservation est en cours de traitement, réessaie dans un instant.
                  </Text>
                ) : null}
                {!hasWalletCoverage ? (
                  <Text style={styles.statusCopy}>Solde du wallet insuffisant pour ce montant.</Text>
                ) : null}
                <GradientButton
                  title={requestAccepted ? 'Procéder au paiement' : 'Demande en attente'}
                  variant="cta"
                  fullWidth
                  disabled={paymentButtonDisabled}
                  onPress={handlePaymentPress}
                />
              </>
            ) : (
              <>
                <Text style={styles.statusCopy}>
                  Aucune demande acceptée trouvée pour ce trajet.
                </Text>
                <GradientButton
                  title="Retour"
                  variant="lavender"
                  fullWidth
                  onPress={() => router.replace(`/ride/${rideIdString}`)}
                />
              </>
            )}
            {walletPaymentError ? <Text style={styles.errorText}>{walletPaymentError}</Text> : null}
          </GradientBackground>
        </ScrollView>
      </SafeAreaView>
      <ConfirmModal
        visible={paymentModalVisible}
        title="Confirmer le paiement"
        message={`Tu vas payer ${formatCurrency(
          passengerAmount
        )} avec ton wallet. Solde actuel : ${formatCurrency(walletBalance)}.`}
        confirmLabel="Confirmer"
        cancelLabel="Annuler"
        onConfirm={handleConfirmPayment}
        onCancel={resetPaymentState}
        confirmDisabled={isProcessingPayment}
      />
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  loadingText: {
    marginTop: Spacing.sm,
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
  },
  scroll: {
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: Radius['2xl'],
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: C.white,
  },
  subtitle: {
    color: C.gray200,
    fontSize: 14,
  },
  card: {
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.card,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
    marginBottom: Spacing.sm,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '700',
    color: C.ink,
  },
  driverEmail: {
    fontSize: 14,
    color: C.gray600,
    marginBottom: Spacing.xs,
  },
  driverPlate: {
    fontSize: 14,
    fontWeight: '600',
    color: C.ink,
  },
  driverActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  driverActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: C.white,
  },
  driverActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.primaryDark,
  },
  driverActionButtonPressed: {
    opacity: 0.85,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  infoText: {
    flex: 1,
  },
  infoLabel: {
    color: C.gray500,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  infoValue: {
    color: C.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  meetingAddress: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  map: {
    width: '100%',
    height: 180,
    borderRadius: Radius.xl,
  },
  statusCopy: {
    color: C.gray600,
    fontSize: 14,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  errorText: {
    color: C.danger,
    fontSize: 13,
    marginTop: Spacing.sm,
    fontWeight: '600',
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  fallbackSubtitle: {
    color: C.gray500,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
});

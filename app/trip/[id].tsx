import { ActivityIndicator, Image, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { MeetingMap } from '@/components/meeting-map';
import { useAuthSession } from '@/hooks/use-auth-session';
import { getAvatarUrl } from '@/app/ui/avatar';
import { maskPlate } from '@/app/utils/plate';
import { CAMPUSRIDE_COMMISSION_RATE } from '@/app/constants/fuel';
import { getRide } from '@/app/services/rides';
import type { LatLng } from '@/app/services/location';
import {
  listBookingsByPassenger,
  subscribeBookingsByPassenger,
  type Booking,
} from '@/app/services/booking-store';
import { resolveMeetingPoint } from '@/utils/meeting-point';

const C = Colors;

const formatLongDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('fr-BE', {
    hour: '2-digit',
    minute: '2-digit',
  });

const getPaymentLabel = (method: Booking['paymentMethod']) => {
  switch (method) {
    case 'wallet':
      return 'Wallet';
    case 'card':
      return 'Carte bancaire';
    case 'cash':
      return 'Paiement en espèces';
    case 'pass':
      return 'Crédit CampusRide';
    case 'none':
    default:
      return 'Paiement confirmé';
  }
};

const formatBookingStatusLabel = (status: Booking['status']) => {
  switch (status) {
    case 'paid':
      return 'Payé';
    case 'completed':
      return 'Terminé';
    case 'cancelled':
      return 'Annulée';
    case 'accepted':
      return 'Acceptée';
    case 'pending':
      return 'En attente';
    default:
      return status;
  }
};

export default function TripDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const bookingId = Array.isArray(params.id) ? params.id[0] : params.id;
  const session = useAuthSession();
  const [bookings, setBookings] = useState<Booking[]>(() =>
    session.email ? listBookingsByPassenger(session.email) : []
  );
  const [loaded, setLoaded] = useState<boolean>(() => !session.email);

  useEffect(() => {
    if (!session.email) {
      setBookings([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    const unsubscribe = subscribeBookingsByPassenger(session.email, (items) => {
      setBookings(items);
      setLoaded(true);
    });
    return unsubscribe;
  }, [session.email]);

  const booking = useMemo(
    () => (bookingId ? bookings.find((entry) => entry.id === bookingId) ?? null : null),
    [bookingId, bookings]
  );

  useEffect(() => {
    if (!bookingId) return;
    console.debug('[TripDetails] open', { bookingId });
  }, [bookingId]);

  useEffect(() => {
    if (!booking) return;
    console.debug('[TripDetails] booking', booking);
  }, [booking]);

  const departureTimestamp = booking?.departureAt ?? booking?.createdAt ?? Date.now();
  const amountPaid = booking ? booking.pricePaid ?? booking.amount : 0;
  const platformFee = +(amountPaid * CAMPUSRIDE_COMMISSION_RATE).toFixed(2);
  const driverShare = +(amountPaid - platformFee).toFixed(2);
  const paymentLabel = booking ? getPaymentLabel(booking.paymentMethod) : '';
  const rideSnapshot = useMemo(
    () => (booking ? getRide(booking.rideId) : null),
    [booking]
  );
  const meetingPoint = useMemo(
    () => resolveMeetingPoint({ booking, ride: rideSnapshot }),
    [booking, rideSnapshot]
  );
  const meetingPointAddress = meetingPoint.address || 'Point de rendez-vous';
  const meetingPointLatLng = meetingPoint.latLng ?? null;
  const displayPlate =
    booking?.status === 'paid'
      ? booking.driverPlate ?? booking.plate ?? '—'
      : booking?.maskedPlate ?? maskPlate(booking?.plate);

  useEffect(() => {
    if (!booking) return;
    console.debug('[TripDetails] meetingPoint', meetingPoint);
  }, [booking, meetingPoint.address, meetingPoint.latLng?.lat, meetingPoint.latLng?.lng]);


  const renderContent = () => {
    if (!bookingId) {
      return (
        <GradientBackground colors={Gradients.card} style={styles.card}>
          <Text style={styles.fallbackTitle}>Trajet introuvable</Text>
          <Text style={styles.fallbackSubtitle}>Aucun identifiant de trajet fourni.</Text>
        </GradientBackground>
      );
    }
    if (!loaded) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={C.white} />
          <Text style={styles.loadingLabel}>Chargement du trajet…</Text>
        </View>
      );
    }
    if (!booking) {
      return (
        <GradientBackground colors={Gradients.card} style={styles.card}>
          <Text style={styles.fallbackTitle}>Trajet introuvable</Text>
          <Text style={styles.fallbackSubtitle}>La réservation n’existe plus dans ton historique.</Text>
        </GradientBackground>
      );
    }

    return (
      <GradientBackground colors={Gradients.card} style={styles.card}>
        <View style={styles.badgeRow}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>Confirmé</Text>
          </View>
          <Text style={styles.amountValue}>€{amountPaid.toFixed(2)}</Text>
        </View>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Informations du trajet</Text>
            <Text style={styles.cardSubtitle}>{formatLongDate(departureTimestamp)}</Text>
          </View>
          <View style={styles.heroTag}>
            <Text style={styles.heroTagText}>
              {booking.status === 'cancelled'
                ? 'Réservation annulée'
                : `Payé · ${formatBookingStatusLabel(booking.status)}`}
            </Text>
          </View>
        </View>
        {booking.status === 'cancelled' ? (
          <View style={styles.cancelledNotice}>
            <Text style={styles.cancelledNoticeTitle}>Réservation annulée</Text>
            <Text style={styles.cancelledNoticeText}>
              Les listes « Mes trajets » et « Mes demandes » ont été mises à jour. Tu peux revenir
              à tes trajets à venir ou vérifier ton wallet pour voir le remboursement.
            </Text>
            <GradientButton
              title="Voir mes trajets"
              variant="cta"
              fullWidth
              onPress={() =>
                router.replace({
                  pathname: '/trips',
                  params: { initialTab: 'upcoming' },
                })
              }
              accessibilityRole="button"
            />
          </View>
        ) : null}

        <View style={styles.driverRow}>
          <Image source={{ uri: getAvatarUrl(booking.ownerEmail, 128) }} style={styles.driverAvatar} />
          <View style={styles.driverMeta}>
            <Text style={styles.infoLabel}>Conducteur</Text>
            <Text style={styles.infoValue}>{booking.driver}</Text>
            <Text style={styles.infoHint}>{booking.ownerEmail}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <IconSymbol name="location.fill" size={18} color={C.primary} />
            <Text style={styles.statLabel}>Itinéraire</Text>
            <Text style={styles.statValue}>
              {booking.depart} → {booking.destination}
            </Text>
          </View>
          <View style={styles.statCard}>
            <IconSymbol name="clock" size={18} color={C.accent} />
            <Text style={styles.statLabel}>Départ</Text>
            <Text style={styles.statValue}>{formatTime(departureTimestamp)}</Text>
          </View>
          <View style={styles.statCard}>
            <IconSymbol name="creditcard.fill" size={18} color={C.secondary} />
            <Text style={styles.statLabel}>Montant payé</Text>
            <Text style={styles.statValue}>€{amountPaid.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Traces du trajet</Text>
          <View style={styles.infoRow}>
            <IconSymbol name="car.fill" size={18} color={C.secondary} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Plaque</Text>
              <Text style={styles.infoValue}>{displayPlate}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <IconSymbol name="person.crop.circle" size={18} color={C.gray500} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Passager</Text>
              <Text style={styles.infoValue}>{booking.passengerEmail}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Point de rencontre</Text>
          <View style={styles.meetingRow}>
            <IconSymbol name="mappin.and.ellipse" size={18} color={C.primary} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Lieu de rendez-vous</Text>
          <Text style={styles.infoValue}>{meetingPointAddress}</Text>
            </View>
          </View>
          <View style={styles.meetingRow}>
            <IconSymbol name="clock" size={18} color={C.gray500} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Heure estimée</Text>
              <Text style={styles.infoValue}>{booking.time ?? formatTime(departureTimestamp)}</Text>
            </View>
          </View>
          <MeetingMap
            address={meetingPointAddress}
            latLng={meetingPointLatLng}
            style={styles.map}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Transparence paiement</Text>
          <View style={styles.paymentRow}>
            <IconSymbol name="creditcard.fill" size={16} color={C.primary} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Montant par passager</Text>
              <Text style={styles.infoValue}>€{amountPaid.toFixed(2)}</Text>
            </View>
          </View>
          <View style={styles.paymentRow}>
            <IconSymbol name="chart.pie.fill" size={16} color={C.accent} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>CampusRide (20 %)</Text>
              <Text style={styles.infoValue}>€{platformFee.toFixed(2)}</Text>
            </View>
          </View>
          <View style={styles.paymentRow}>
            <IconSymbol name="sparkles" size={16} color={C.secondary} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Versé au conducteur</Text>
              <Text style={styles.infoValue}>€{driverShare.toFixed(2)}</Text>
            </View>
          </View>
          <View style={styles.paymentRow}>
            <IconSymbol name="wallet.pass.fill" size={16} color={C.secondaryDark} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Méthode</Text>
              <Text style={styles.infoValue}>{paymentLabel}</Text>
            </View>
          </View>
        </View>
      </GradientBackground>
    );
  };

  const scrollStyle = Platform.OS === 'web'
    ? [{ flex: 1 }, { overflowY: 'auto' as const }]
    : { flex: 1 };

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          style={scrollStyle}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
              <IconSymbol name="chevron.left" size={20} color={C.white} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.title}>Détails du trajet</Text>
              <Text style={styles.subtitle}>Passager · Trajet confirmé</Text>
            </View>
          </View>
          {renderContent()}
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: Spacing.lg,
  },
  scroll: {
    gap: Spacing.lg,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: C.white,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: C.gray400,
    fontSize: 14,
  },
  card: {
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    gap: Spacing.lg,
    ...Shadows.card,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    backgroundColor: C.successLight,
  },
  statusBadgeText: {
    color: C.success,
    fontWeight: '700',
    fontSize: 12,
  },
  amountValue: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
  },
  cardSubtitle: {
    color: C.gray500,
    fontSize: 13,
  },
  heroTag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  heroTagText: {
    fontSize: 12,
    color: C.gray600,
    fontWeight: '600',
  },
  cancelledNotice: {
    marginTop: Spacing.lg,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    backgroundColor: C.gray900,
    borderWidth: 1,
    borderColor: C.success,
    gap: Spacing.sm,
  },
  cancelledNoticeTitle: {
    color: C.success,
    fontWeight: '700',
    fontSize: 16,
  },
  cancelledNoticeText: {
    color: C.white,
    fontSize: 14,
    lineHeight: 20,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: Radius['2xl'],
    backgroundColor: C.gray150,
  },
  driverMeta: {
    flex: 1,
  },
  infoLabel: {
    color: C.gray500,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  infoValue: {
    color: C.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  infoHint: {
    color: C.gray600,
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: Radius.lg,
    backgroundColor: C.gray50,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statLabel: {
    fontSize: 11,
    color: C.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  sectionCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.gray150,
    padding: Spacing.md,
    backgroundColor: C.white,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.gray600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  infoText: {
    flex: 1,
  },
  meetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  map: {
    height: 140,
    borderRadius: Radius.lg,
    marginTop: Spacing.md,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  loadingLabel: {
    color: C.gray200,
    fontSize: 14,
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  fallbackSubtitle: {
    color: C.gray600,
    textAlign: 'center',
  },
});

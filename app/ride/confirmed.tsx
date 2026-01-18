import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { subscribeBookingsByPassenger, type Booking } from '@/app/services/booking-store';
import { getAvatarUrl } from '@/app/ui/avatar';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { maskPlate } from '@/app/utils/plate';
import { resolveMeetingPoint } from '@/utils/meeting-point';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuthSession } from '@/hooks/use-auth-session';

const C = Colors;

const formatDepartureMoment = (timestamp: number) => {
  if (!timestamp || Number.isNaN(timestamp)) return 'Date inconnue';
  const date = new Date(timestamp);
  const dateLabel = date.toLocaleDateString('fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeLabel = date.toLocaleTimeString('fr-BE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateLabel} · ${timeLabel}`;
};

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

export default function RideConfirmedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const session = useAuthSession();
  const bookingId = Array.isArray(params.bookingId) ? params.bookingId[0] : params.bookingId;
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setBooking(null);
    setLoaded(false);
    if (!session.email) {
      setLoaded(true);
      return;
    }
    const unsubscribe = subscribeBookingsByPassenger(session.email, (items) => {
      setLoaded(true);
      if (!bookingId) {
        setBooking(null);
        return;
      }
      const found = items.find((item) => item.id === bookingId) ?? null;
      setBooking(found);
    });
    return unsubscribe;
  }, [bookingId, session.email]);

  const departureTimestamp = useMemo(
    () => booking?.departureAt ?? booking?.createdAt ?? 0,
    [booking]
  );
  const amountPaid = booking ? booking.pricePaid ?? booking.amount : 0;
  const amountLabel = amountPaid.toFixed(2);
  const meetingPoint = useMemo(() => resolveMeetingPoint({ booking }), [booking]);
  const meetingPointAddress = meetingPoint.address || 'Point de rendez-vous';
  const meetingPointLatLng = meetingPoint.latLng ?? null;
  const displayPlate =
    booking?.status === 'paid'
      ? booking.driverPlate ?? booking.plate ?? '—'
      : booking?.maskedPlate ?? maskPlate(booking?.plate);

  useEffect(() => {
    if (!booking) return;
    console.debug('[RideConfirmed] meetingPoint', meetingPoint);
  }, [booking, meetingPoint.address, meetingPoint.latLng?.lat, meetingPoint.latLng?.lng]);

  const renderFallback = (title: string, subtitle: string) => (
    <GradientBackground colors={Gradients.card} style={styles.card}>
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>{title}</Text>
        <Text style={styles.fallbackSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.actions}>
        <GradientButton
          title="Retour à l’accueil"
          variant="lavender"
          fullWidth
          onPress={() => router.replace('/')}
          accessibilityRole="button"
        />
      </View>
    </GradientBackground>
  );

  const renderBookingContent = () => {
    if (!bookingId) {
      return renderFallback('Trajet introuvable', 'Ce lien est invalide ou expiré.');
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
      return renderFallback(
        'Trajet introuvable',
        'La réservation a été annulée ou n’existe plus dans ton historique.'
      );
    }
    return (
      <GradientBackground colors={Gradients.card} style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <IconSymbol name="checkmark.seal.fill" size={32} color={C.white} />
          </View>
          <Text style={styles.title}>Vous avez payé</Text>
          <Text style={styles.subtitle}>Ton trajet est confirmé et enregistré.</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.driverRow}>
            <Image
              source={{ uri: getAvatarUrl(booking.ownerEmail, 96) }}
              style={styles.driverAvatar}
            />
            <View style={styles.driverMeta}>
              <Text style={styles.infoLabel}>Conducteur</Text>
              <Text style={styles.infoValue}>{booking.driver}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <IconSymbol name="car.fill" size={18} color={C.secondary} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Plaque</Text>
              <Text style={styles.infoValue}>{displayPlate}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <IconSymbol name="location.fill" size={18} color={C.accent} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Départ → Destination</Text>
              <Text style={styles.infoValue}>
                {booking.depart} → {booking.destination}
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <IconSymbol name="mappin.and.ellipse" size={18} color={C.primary} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Point de rencontre</Text>
              <Text style={styles.infoValue}>{meetingPointAddress}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <IconSymbol name="clock" size={18} color={C.gray500} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Date & heure</Text>
              <Text style={styles.infoValue}>{formatDepartureMoment(departureTimestamp)}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <IconSymbol name="creditcard.fill" size={18} color={C.secondaryDark} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Montant payé</Text>
              <Text style={styles.infoValue}>€{amountLabel}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <IconSymbol name="wallet.pass.fill" size={18} color={C.secondaryLight} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Méthode</Text>
              <Text style={styles.infoValue}>{getPaymentLabel(booking.paymentMethod)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <GradientButton
            title="Voir mes trajets"
            variant="cta"
            fullWidth
            onPress={() => router.replace({ pathname: '/trips', params: { initialTab: 'upcoming' } })}
            accessibilityRole="button"
          />
          <GradientButton
            title="Retour à l’accueil"
            variant="lavender"
            fullWidth
            onPress={() => router.replace('/')}
            accessibilityRole="button"
          />
        </View>
      </GradientBackground>
    );
  };

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {renderBookingContent()}
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
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    gap: Spacing.lg,
    ...Shadows.card,
    minHeight: 420,
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
  },
  subtitle: {
    color: C.gray600,
    fontSize: 16,
    textAlign: 'center',
  },
  content: {
    gap: Spacing.md,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
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
  infoRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    paddingVertical: Spacing.xs,
  },
  infoText: {
    flex: 1,
  },
  infoLabel: {
    color: C.gray500,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  infoValue: {
    color: C.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  actions: {
    gap: Spacing.md,
  },
  fallback: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fallbackTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
  },
  fallbackSubtitle: {
    color: C.gray600,
    textAlign: 'center',
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
});

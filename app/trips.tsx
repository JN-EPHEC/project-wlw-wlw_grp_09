import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { useAuthSession } from '@/hooks/use-auth-session';
import { getAvatarUrl } from '@/app/ui/avatar';
import {
  listBookingsByPassenger,
  subscribeBookingsByPassenger,
  type Booking,
} from '@/app/services/booking-store';

const C = Colors;

export default function TripsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ initialTab?: 'upcoming' | 'history' }>();
  const session = useAuthSession();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
  const [bookings, setBookings] = useState<Booking[]>(() =>
    session.email ? listBookingsByPassenger(session.email) : []
  );

  const handleBookingsUpdate = useCallback((nextBookings: Booking[]) => {
    console.debug('[Trips] raw bookings', nextBookings);
    setBookings(nextBookings);
  }, []);

  useEffect(() => {
    if (!session.email) {
      setBookings([]);
      return;
    }
    const unsubscribe = subscribeBookingsByPassenger(session.email, handleBookingsUpdate);
    return unsubscribe;
  }, [session.email, handleBookingsUpdate]);

  useEffect(() => {
    if (!params.initialTab) return;
    setActiveTab(params.initialTab === 'history' ? 'history' : 'upcoming');
  }, [params.initialTab]);

  const getDepartureTime = useCallback(
    (booking: Booking) => booking.departureAt ?? booking.createdAt ?? 0,
    []
  );
  const bookingSortValue = useCallback((booking: Booking) => getDepartureTime(booking), [getDepartureTime]);
  const upcomingBookings = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            booking.passengerEmail === session.email &&
            booking.paid &&
            booking.status !== 'completed'
        )
        .sort((a, b) => bookingSortValue(a) - bookingSortValue(b)),
    [bookings, session.email, bookingSortValue]
  );
  const historyBookings = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            booking.passengerEmail === session.email &&
            booking.paid &&
            booking.status === 'completed'
        )
        .sort((a, b) => bookingSortValue(b) - bookingSortValue(a)),
    [bookings, session.email, bookingSortValue]
  );
  useEffect(() => {
    console.debug('[Trips] bookings updated count', bookings.length);
  }, [bookings.length]);
  useEffect(() => {
    console.debug('[Trips] upcoming count', upcomingBookings.length);
  }, [upcomingBookings.length]);
  useEffect(() => {
    console.debug('[Trips] history count', historyBookings.length);
  }, [historyBookings.length]);

  const sections = useMemo(
    () => [
      { key: 'upcoming', label: 'À venir', count: upcomingBookings.length },
      { key: 'history', label: 'Historique', count: historyBookings.length },
    ],
    [historyBookings.length, upcomingBookings.length]
  );

  const currentList = activeTab === 'upcoming' ? upcomingBookings : historyBookings;
  const emptyCopy = activeTab === 'upcoming'
    ? 'Tu n’as aucun trajet confirmé pour le moment.'
    : 'Tu n’as pas encore d’historique de trajets.';

  const openTripDetails = useCallback(
    (bookingId: string) => {
      router.push({ pathname: '/trip/[id]', params: { id: bookingId } });
    },
    [router]
  );
  const openTripRating = useCallback(
    (bookingId: string) => {
      router.push({ pathname: '/trip/rate', params: { bookingId } });
    },
    [router]
  );
  const handleTripComplete = useCallback(
    (bookingId: string) => {
      openTripRating(bookingId);
    },
    [openTripRating]
  );

  const renderCard = useCallback(
    (booking: Booking) => {
      const displayAmount = booking.pricePaid ?? booking.amount;
      const departureDate = new Date(getDepartureTime(booking));
      const formattedDeparture = departureDate.toLocaleString('fr-BE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
      return (
        <Pressable
          key={booking.id}
          style={styles.card}
            onPress={() => openTripDetails(booking.id)}
        >
          <View style={styles.cardHeader}>
            <Image source={{ uri: getAvatarUrl(booking.passengerEmail, 96) }} style={styles.cardAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardDriver}>{booking.driver}</Text>
              <Text style={styles.cardMeta}>
                {booking.depart} → {booking.destination}
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeUpcoming]}>
              <Text style={styles.badgeText}>Confirmé</Text>
            </View>
          </View>
          <View style={styles.cardFooter}>
            <View style={styles.cardFooterRow}>
              <IconSymbol name="clock" size={16} color={C.gray500} />
              <Text style={styles.cardFooterText}>{formattedDeparture}</Text>
            </View>
            <View style={styles.cardFooterRow}>
              <IconSymbol name="creditcard.fill" size={16} color={C.gray500} />
              <Text style={styles.cardFooterText}>{displayAmount.toFixed(2)} €</Text>
            </View>
          </View>
          {activeTab === 'upcoming' ? (
            <View style={styles.actionRow}>
              <Pressable
                style={styles.viewButton}
                onPress={(event) => {
                  event.stopPropagation();
                  openTripDetails(booking.id);
                }}
              >
                <Text style={styles.viewButtonText}>Voir le trajet</Text>
              </Pressable>
              {booking.status !== 'completed' ? (
                <GradientButton
                  title="Trajet terminé"
                  variant="cta"
                  size="sm"
                  fullWidth
                  style={styles.completeButton}
                  onPress={(event) => {
                    event.stopPropagation();
                    handleTripComplete(booking.id);
                  }}
                  accessibilityRole="button"
                />
              ) : null}
            </View>
          ) : null}
        </Pressable>
      );
    },
    [getDepartureTime, openTripDetails, handleTripComplete]
  );

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.headerTop}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <IconSymbol name="chevron.left" size={20} color={C.white} />
            </Pressable>
            <Text style={styles.title}>Mes trajets confirmés</Text>
          </View>
          <View style={styles.tabButtons}>
            {sections.map((section) => (
              <Pressable
                key={section.key}
                style={[styles.tabButton, activeTab === section.key && styles.tabButtonActive]}
                onPress={() => setActiveTab(section.key as typeof activeTab)}
              >
                <Text style={[styles.tabButtonText, activeTab === section.key && styles.tabButtonTextActive]}>
                  {section.label} ({section.count})
                </Text>
              </Pressable>
            ))}
          </View>

          {currentList.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol name="car" size={32} color={C.gray400} />
              <Text style={styles.emptyTitle}>Aucun trajet ici</Text>
              <Text style={styles.emptySubtitle}>{emptyCopy}</Text>
            </View>
          ) : (
            currentList.map((booking) => renderCard(booking))
          )}
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
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: C.white,
    fontSize: 22,
    fontWeight: '800',
  },
  tabButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  tabButton: {
    flex: 1,
    borderRadius: Radius.pill,
    backgroundColor: C.white,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadows.card,
  },
  tabButtonActive: {
    backgroundColor: C.primaryLight,
  },
  tabButtonText: {
    color: C.gray600,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: C.primaryDark,
  },
  card: {
    backgroundColor: C.white,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
  },
  cardDriver: {
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
  },
  cardMeta: {
    color: C.gray600,
  },
  badge: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  badgeUpcoming: {
    backgroundColor: C.successLight,
  },
  badgeHistory: {
    backgroundColor: C.gray200,
  },
  badgeText: {
    color: C.gray900,
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cardFooterText: {
    color: C.gray600,
    fontWeight: '600',
  },
  viewButton: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    backgroundColor: C.primary,
  },
  viewButtonText: {
    color: C.white,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  completeButton: {
    flex: 1,
  },
  emptyState: {
    backgroundColor: C.white,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadows.card,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
  },
  emptySubtitle: {
    textAlign: 'center',
    color: C.gray600,
  },
});

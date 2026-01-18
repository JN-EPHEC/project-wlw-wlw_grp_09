import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { getAvatarUrl } from '@/app/ui/avatar';
import { useAuthSession } from '@/hooks/use-auth-session';
import { usePassengerRequests } from '@/hooks/use-passenger-requests';
import { useDriverRequests } from '@/hooks/use-driver-requests';
import {
  getLatestBookingForRide,
  listBookingsByPassenger,
  subscribeBookingsByPassenger,
  type Booking,
} from '@/app/services/booking-store';
import {
  acceptDriverReservationRequest,
  rejectDriverReservationRequest,
  type ReservationRequestEntry,
} from '@/app/services/firestore-reservation-requests';

const C = Colors;

const formatBookingTimeLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('fr-BE', {
    hour: '2-digit',
    minute: '2-digit',
  });

export default function RequestsScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const isDriver = session.isDriver;
  const passengerRequests = usePassengerRequests(session.uid);
  const driverRequests = useDriverRequests(session.uid);
  const [activeTab, setActiveTab] = useState<'pending' | 'accepted'>('pending');
  const [bookings, setBookings] = useState<Booking[]>(() =>
    session.email ? listBookingsByPassenger(session.email) : []
  );
  useEffect(() => {
    if (!session.email) return;
    const unsubscribe = subscribeBookingsByPassenger(session.email, setBookings);
    return unsubscribe;
  }, [session.email]);
  const isPaymentAllowed = useCallback(
    (request: ReservationRequestEntry) => {
      if (request.status !== 'accepted') return false;
      if (!session.email || !request.rideId) return false;
      const booking = getLatestBookingForRide(session.email, request.rideId) ?? undefined;
      return Boolean(
        booking &&
          booking.status === 'accepted' &&
          booking.paymentStatus === 'unpaid'
      );
    },
    [session.email]
  );

  const bookingToRequestEntry = useCallback((booking: Booking): ReservationRequestEntry => {
    const timestamp = booking.createdAt ?? Date.now();
    const status: ReservationRequestEntry['status'] =
      booking.status === 'accepted' ||
      booking.status === 'paid' ||
      booking.status === 'completed'
        ? 'accepted'
        : booking.status === 'cancelled'
        ? 'cancelled'
        : 'pending';
    const paymentStatus: ReservationRequestEntry['paymentStatus'] =
      booking.paymentStatus === 'paid' || booking.status === 'paid' || booking.paid
        ? 'paid'
        : booking.paymentStatus === 'refunded'
        ? 'refunded'
        : 'unpaid';
    return {
      id: booking.id,
      rideId: booking.rideId,
      ridePath: booking.rideId,
      driverUid: '',
      driver: booking.driver,
      driverEmail: booking.ownerEmail,
      passengerUid: booking.passengerEmail,
      passengerEmail: booking.passengerEmail,
      passenger: booking.passengerEmail,
      passengerName: undefined,
      seatsRequested: 1,
      depart: booking.depart,
      destination: booking.destination,
      price: booking.amount,
      createdAt: timestamp,
      updatedAt: timestamp,
      status,
      requestStatus: status,
      paymentStatus,
      paymentRef: null,
      paidAt: booking.paid ? booking.paidAt ?? timestamp : null,
      timeLabel:
        booking.time ??
        formatBookingTimeLabel(booking.departureAt ?? booking.createdAt ?? timestamp),
      message: null,
      paymentMethod: null,
    };
  }, []);

  const localRequests = useMemo(() => bookings.map(bookingToRequestEntry), [bookings, bookingToRequestEntry]);

  const combinedRequests = useMemo(() => {
    const remote = passengerRequests.requests;
    if (!localRequests.length) {
      return remote;
    }
    const seen = new Set(remote.map((request) => request.id));
    return [...remote, ...localRequests.filter((request) => !seen.has(request.id))];
  }, [localRequests, passengerRequests.requests]);

  const pendingRequests = useMemo(
    () => combinedRequests.filter((request) => request.status === 'pending'),
    [combinedRequests]
  );
  const acceptedRequests = useMemo(
    () => combinedRequests.filter((request) => request.status === 'accepted'),
    [combinedRequests]
  );
  const activeRequestCount = pendingRequests.length + acceptedRequests.length;

  const sections = useMemo(
    () => [
      {
        key: 'pending',
        label: isDriver ? 'Demandes en attente' : 'Demandes en cours',
        count: isDriver ? driverRequests.pending.length : pendingRequests.length,
      },
      {
        key: 'accepted',
        label: 'Demandes acceptées',
        count: isDriver ? driverRequests.accepted.length : acceptedRequests.length,
      },
    ],
    [
      acceptedRequests.length,
      driverRequests.pending.length,
      driverRequests.accepted.length,
      isDriver,
      pendingRequests.length,
    ]
  );

  const currentList = useMemo(() => {
    if (isDriver) {
      return activeTab === 'pending' ? driverRequests.pending : driverRequests.accepted;
    }
    return activeTab === 'pending' ? pendingRequests : acceptedRequests;
  }, [
    activeTab,
    acceptedRequests,
    driverRequests.accepted,
    driverRequests.pending,
    isDriver,
    pendingRequests,
  ]);

  const emptyCopy = useMemo(() => {
    if (isDriver) {
      return activeTab === 'pending'
        ? 'Tu n’as aucune demande en attente pour le moment.'
        : 'Prends une décision pour afficher les demandes acceptées.';
    }
    return activeTab === 'pending'
      ? 'Tu n’as envoyé aucune demande pour l’instant.'
      : 'Pas encore de demande acceptée. Réserve un trajet pour commencer.';
  }, [activeTab, isDriver]);

  const activeTabBackgroundColor = isDriver ? Colors.accentSoft : Colors.primaryLight;
  const activeTabTextColor = isDriver ? Colors.accent : Colors.primaryDark;
  const openRideDetails = useCallback(
    (rideId: string) => {
      router.push(`/ride/${rideId}`);
    },
    [router]
  );

  const renderDriverCard = useCallback(
    (request: ReservationRequestEntry) => (
      <Pressable
        key={request.id}
        style={styles.card}
        onPress={() => openRideDetails(request.rideId)}
        accessibilityRole="button"
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardDriver}>{request.passenger}</Text>
            <Text style={styles.cardMeta}>
              {request.depart} → {request.destination}
            </Text>
          </View>
          <View style={[styles.badge, request.status === 'pending' ? styles.badgePending : styles.badgeAccepted]}>
            <Text style={styles.badgeText}>{request.status === 'pending' ? 'En attente' : 'Acceptée'}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <View style={styles.cardFooterRow}>
            <IconSymbol name="clock" size={16} color={C.gray500} />
            <Text style={styles.cardFooterText}>{request.timeLabel}</Text>
          </View>
          <View style={styles.cardFooterRow}>
            <IconSymbol name="creditcard.fill" size={16} color={C.gray500} />
            <Text style={styles.cardFooterText}>{request.price.toFixed(2)} €</Text>
          </View>
        </View>
        {request.status === 'pending' ? (
          <View style={styles.requestActions}>
            <Pressable
              style={[styles.requestActionButton, styles.requestActionButtonSecondary]}
              onPress={(event) => {
                event.stopPropagation();
                rejectDriverReservationRequest(session.uid, request.id);
              }}
            >
              <Text style={[styles.requestActionText, styles.requestActionTextSecondary]}>Refuser</Text>
            </Pressable>
            <Pressable
              style={[styles.requestActionButton, styles.requestActionButtonPrimary]}
              onPress={(event) => {
                event.stopPropagation();
                acceptDriverReservationRequest(session.uid, request.id);
              }}
            >
              <Text style={[styles.requestActionText, styles.requestActionTextPrimary]}>Accepter</Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    ),
    [openRideDetails, session.uid]
  );

  const renderPassengerCard = useCallback(
    (request: ReservationRequestEntry, isAcceptedList: boolean) => {
      const booking =
        session.email && request.rideId ? getLatestBookingForRide(session.email, request.rideId) ?? undefined : undefined;
      const driverName = booking?.driver ?? request.driver;
      const driverEmail = booking?.ownerEmail ?? request.driverEmail;
      const routeLabel = `${booking?.depart ?? request.depart} → ${booking?.destination ?? request.destination}`;
      const timeLabel =
        booking?.time ??
        request.timeLabel ??
        new Date(booking?.departureAt ?? booking?.createdAt ?? Date.now()).toLocaleTimeString('fr-BE', {
          hour: '2-digit',
          minute: '2-digit',
        });
      const amount = booking ? booking.pricePaid ?? booking.amount : request.price;
      const amountLabel = Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
      const paymentAllowedForRequest = isPaymentAllowed(request);
      const handleCheckoutNavigation = () => {
        if (!paymentAllowedForRequest) {
          Alert.alert(
            'Paiement indisponible',
            'Cette réservation n’est plus payable. Recommence une demande.'
          );
          return;
        }
        if (!request.rideId) {
          Alert.alert(
            'Trajet introuvable',
            'Impossible de retrouver ce trajet pour continuer le paiement.'
          );
          return;
        }
        router.push({
          pathname: '/ride/checkout',
          params: { rideid: request.rideId },
        });
      };
      const handlePress = () => {
        if (isAcceptedList) {
          handleCheckoutNavigation();
          return;
        }
        openRideDetails(request.rideId);
      };
      return (
        <Pressable
          key={request.id}
          style={styles.card}
          onPress={handlePress}
          accessibilityRole="button"
        >
          <View style={styles.cardHeader}>
            <Image source={{ uri: getAvatarUrl(driverEmail, 96) }} style={styles.cardAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardDriver}>{driverName}</Text>
              <Text style={styles.cardMeta}>{routeLabel}</Text>
            </View>
            <View
              style={[
                styles.badge,
                request.status === 'pending' ? styles.badgePending : styles.badgeAccepted,
              ]}
            >
              <Text style={styles.badgeText}>
                {request.status === 'pending' ? 'En attente' : 'Acceptée'}
              </Text>
            </View>
          </View>
          <View style={styles.cardFooter}>
            <View style={styles.cardFooterRow}>
              <IconSymbol name="clock" size={16} color={C.gray500} />
              <Text style={styles.cardFooterText}>{timeLabel}</Text>
            </View>
            <View style={styles.cardFooterRow}>
              <IconSymbol name="creditcard.fill" size={16} color={C.gray500} />
              <Text style={styles.cardFooterText}>{amountLabel} €</Text>
            </View>
          </View>
          {isAcceptedList && paymentAllowedForRequest ? (
            <Pressable
              style={styles.payButton}
              onPress={(event) => {
                event.stopPropagation();
                handleCheckoutNavigation();
              }}
            >
              <IconSymbol name="creditcard" size={16} color={C.white} />
              <Text style={styles.payButtonText}>Procéder au paiement</Text>
            </Pressable>
          ) : null}
        </Pressable>
      );
    },
    [isPaymentAllowed, openRideDetails, router, session.email]
  );

  return (
    <AppBackground colors={isDriver ? Gradients.driver : Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.headerTop}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <IconSymbol name="chevron.left" size={20} color={C.white} />
            </Pressable>
            <Text style={styles.title}>Mes demandes</Text>
          </View>
          <View style={styles.tabButtons}>
            {sections.map((section) => {
              const isActive = activeTab === section.key;
              return (
                <Pressable
                  key={section.key}
                  style={[
                    styles.tabButton,
                    isActive && styles.tabButtonActive,
                    isActive && {
                      backgroundColor: activeTabBackgroundColor,
                      borderColor: activeTabBackgroundColor,
                    },
                  ]}
                  onPress={() => setActiveTab(section.key as typeof activeTab)}
                >
                  <Text style={[styles.tabButtonText, isActive && { color: activeTabTextColor }]}>
                    {section.label} ({section.count})
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {currentList.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol name="doc.text" size={32} color={C.gray400} />
              <Text style={styles.emptyTitle}>Aucune demande ici</Text>
              <Text style={styles.emptySubtitle}>{emptyCopy}</Text>
            </View>
          ) : (
            currentList.map((item) =>
              isDriver
                ? renderDriverCard(item as ReservationRequestEntry)
                : renderPassengerCard(item as ReservationRequestEntry, activeTab === 'accepted')
            )
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
    backgroundColor: 'rgba(255,255,255,0.18)',
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: Colors.white,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadows.card,
  },
  tabButtonActive: {
    borderColor: 'transparent',
  },
  tabButtonText: {
    color: C.gray600,
    fontWeight: '700',
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
    fontSize: 13,
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
  },
  payButton: {
    marginTop: Spacing.md,
    backgroundColor: C.accent,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  payButtonText: {
    color: C.white,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  badgePending: {
    backgroundColor: C.secondaryLight,
  },
  badgeAccepted: {
    backgroundColor: C.successLight,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.ink,
  },
  requestActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  requestActionButton: {
    flex: 1,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestActionButtonPrimary: {
    backgroundColor: C.primary,
  },
  requestActionButtonSecondary: {
    backgroundColor: C.gray300,
  },
  requestActionText: {
    fontWeight: '700',
  },
  requestActionTextPrimary: {
    color: C.white,
  },
  requestActionTextSecondary: {
    color: C.gray700,
  },
  emptyState: {
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    backgroundColor: C.white,
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadows.card,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.ink,
  },
  emptySubtitle: {
    color: C.gray600,
    textAlign: 'center',
  },
});

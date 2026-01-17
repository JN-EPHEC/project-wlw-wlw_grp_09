import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { getAvatarUrl } from '@/app/ui/avatar';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useDriverRequests } from '@/hooks/use-driver-requests';
import { usePassengerRequests } from '@/hooks/use-passenger-requests';
import {
  acceptDriverReservationRequest,
  rejectDriverReservationRequest,
  type ReservationRequestEntry,
} from '@/app/services/reservation-requests';

const C = Colors;

export default function RequestsScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const isDriver = session.isDriver;
  const passengerRequests = usePassengerRequests(session.email);
  const driverRequests = useDriverRequests(session.email);
  const [activeTab, setActiveTab] = useState<'pending' | 'accepted'>('pending');

  const sections = useMemo(
    () => [
      {
        key: 'pending',
        label: isDriver ? 'Demandes en attente' : 'Demandes en cours',
        count: isDriver ? driverRequests.pending.length : passengerRequests.pending.length,
      },
      {
        key: 'accepted',
        label: 'Demandes acceptées',
        count: isDriver ? driverRequests.accepted.length : passengerRequests.accepted.length,
      },
    ],
    [
      driverRequests.pending.length,
      driverRequests.accepted.length,
      passengerRequests.pending.length,
      passengerRequests.accepted.length,
      isDriver,
    ]
  );

  const currentList = useMemo(() => {
    if (isDriver) {
      return activeTab === 'pending' ? driverRequests.pending : driverRequests.accepted;
    }
    return activeTab === 'pending' ? passengerRequests.pending : passengerRequests.accepted;
  }, [
    activeTab,
    driverRequests.accepted,
    driverRequests.pending,
    isDriver,
    passengerRequests.accepted,
    passengerRequests.pending,
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

  const renderCard = useCallback(
    (request: ReservationRequestEntry) => {
      const isDriverCard = isDriver;
      if (isDriverCard) {
        return (
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
                    rejectDriverReservationRequest(session.email, request.id);
                  }}
                >
                  <Text style={[styles.requestActionText, styles.requestActionTextSecondary]}>Refuser</Text>
                </Pressable>
                <Pressable
                  style={[styles.requestActionButton, styles.requestActionButtonPrimary]}
                  onPress={(event) => {
                    event.stopPropagation();
                    acceptDriverReservationRequest(session.email, request.id);
                  }}
                >
                  <Text style={[styles.requestActionText, styles.requestActionTextPrimary]}>Accepter</Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        );
      }
      return (
        <Pressable
          key={request.id}
          style={styles.card}
          onPress={() => openRideDetails(request.rideId)}
          accessibilityRole="button"
        >
          <View style={styles.cardHeader}>
            <Image source={{ uri: getAvatarUrl(request.driverEmail, 96) }} style={styles.cardAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardDriver}>{request.driver}</Text>
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
          {request.status === 'accepted' ? (
            <Pressable
              style={styles.payButton}
              onPress={(event) => {
                event.stopPropagation();
                console.debug('[Requests] checkout open', request.rideId);
                router.push({
                  pathname: '/ride/checkout',
                  params: { rideId: request.rideId },
                });
              }}
            >
              <IconSymbol name="creditcard" size={16} color={C.white} />
              <Text style={styles.payButtonText}>Procéder au paiement</Text>
            </Pressable>
          ) : null}
        </Pressable>
      );
    },
    [isDriver, openRideDetails, session.email]
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
            currentList.map((request) => renderCard(request))
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { useAuthSession } from '@/hooks/use-auth-session';
import { getAvatarUrl } from '@/app/ui/avatar';
import { getRides, hasRideDeparted, subscribeRides, type Ride } from '@/app/services/rides';

const C = Colors;

export default function TripsScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const [rides, setRides] = useState<Ride[]>(() => getRides());
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');

  useEffect(() => {
    const unsubscribe = subscribeRides(setRides);
    return unsubscribe;
  }, []);

  const myTrips = useMemo(() => {
    if (!session.email) return [];
    return rides.filter((ride) => ride.passengers.includes(session.email));
  }, [rides, session.email]);

  const upcomingTrips = useMemo(() => myTrips.filter((ride) => !hasRideDeparted(ride)), [myTrips]);
  const historyTrips = useMemo(() => myTrips.filter((ride) => hasRideDeparted(ride)), [myTrips]);

  const sections = useMemo(
    () => [
      { key: 'upcoming', label: 'À venir', count: upcomingTrips.length },
      { key: 'history', label: 'Historique', count: historyTrips.length },
    ],
    [upcomingTrips.length, historyTrips.length]
  );

  const currentList = activeTab === 'upcoming' ? upcomingTrips : historyTrips;
  const emptyCopy = activeTab === 'upcoming'
    ? 'Tu n’as aucun trajet confirmé pour le moment.'
    : 'Tu n’as pas encore d’historique de trajets.';

  const formatDeparture = (ride: Ride) => {
    const departure = new Date(ride.departureAt);
    return departure.toLocaleString('fr-BE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openRideDetails = useCallback(
    (rideId: string) => {
      router.push(`/ride/${rideId}`);
    },
    [router]
  );

  const renderCard = useCallback(
    (ride: Ride) => (
      <Pressable key={ride.id} style={styles.card} onPress={() => openRideDetails(ride.id)}>
        <View style={styles.cardHeader}>
          <Image source={{ uri: getAvatarUrl(ride.ownerEmail, 96) }} style={styles.cardAvatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardDriver}>{ride.driver}</Text>
            <Text style={styles.cardMeta}>
              {ride.depart} → {ride.destination}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              hasRideDeparted(ride) ? styles.badgeHistory : styles.badgeUpcoming,
            ]}
          >
            <Text style={styles.badgeText}>{hasRideDeparted(ride) ? 'Terminé' : 'Confirmé'}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <View style={styles.cardFooterRow}>
            <IconSymbol name="clock" size={16} color={C.gray500} />
            <Text style={styles.cardFooterText}>{formatDeparture(ride)}</Text>
          </View>
          <View style={styles.cardFooterRow}>
            <IconSymbol name="creditcard.fill" size={16} color={C.gray500} />
            <Text style={styles.cardFooterText}>{ride.price.toFixed(2)} €</Text>
          </View>
        </View>
        <Pressable
          style={styles.viewButton}
          onPress={(event) => {
            event.stopPropagation();
            openRideDetails(ride.id);
          }}
        >
          <Text style={styles.viewButtonText}>Voir le trajet</Text>
        </Pressable>
      </Pressable>
    ),
    [openRideDetails]
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
            currentList.map((ride) => renderCard(ride))
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

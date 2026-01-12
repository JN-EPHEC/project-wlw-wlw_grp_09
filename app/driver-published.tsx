import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRouter } from 'expo-router';

import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AppBackground } from '@/components/ui/app-background';
import { Colors, Gradients, Radius, Spacing, Shadows } from '@/app/ui/theme';
import { useAuthSession } from '@/hooks/use-auth-session';
import { getRides, subscribeRides, hasRideDeparted, type Ride } from '@/app/services/rides';
import {
  DisplayRide,
  FALLBACK_COMPLETED,
  FALLBACK_UPCOMING,
} from '@/app/data/driver-samples';
import { CAMPUS_LOCATIONS } from '@/app/data/campus-locations';

const formatRideBadgeDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('fr-BE', {
    day: 'numeric',
    month: 'short',
  });

const formatRideTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('fr-BE', {
    hour: '2-digit',
    minute: '2-digit',
  });

export default function DriverPublishedScreen() {
  const session = useAuthSession();
  const router = useRouter();
  const [rides, setRides] = useState<Ride[]>(() => getRides());
  const [highlightedCampus, setHighlightedCampus] = useState(CAMPUS_LOCATIONS[0]);

  useEffect(() => {
    const unsubscribe = subscribeRides(setRides);
    return unsubscribe;
  }, []);

  const ownerEmail = useMemo(() => (session.email ?? '').toLowerCase(), [session.email]);
  const publishedRides = useMemo(() => {
    if (!ownerEmail) return [];
    return rides
      .filter((ride) => ride.ownerEmail === ownerEmail)
      .sort((a, b) => a.departureAt - b.departureAt);
  }, [ownerEmail, rides]);

  const upcomingRides = useMemo(
    () => publishedRides.filter((ride) => !hasRideDeparted(ride)),
    [publishedRides]
  );
  const completedRides = useMemo(
    () => publishedRides.filter((ride) => hasRideDeparted(ride)),
    [publishedRides]
  );
  const upcomingRidesDisplay = useMemo<DisplayRide[]>(
    () => (upcomingRides.length ? (upcomingRides as DisplayRide[]) : FALLBACK_UPCOMING),
    [upcomingRides]
  );
  const completedRidesDisplay = useMemo<DisplayRide[]>(
    () => (completedRides.length ? (completedRides as DisplayRide[]) : FALLBACK_COMPLETED),
    [completedRides]
  );

  const stats = useMemo(
    () => ({
      upcoming: upcomingRidesDisplay.length,
      reservations: upcomingRidesDisplay.reduce((sum, ride) => {
        const reserved = ride.reservedSeats ?? ride.passengers.length;
        return sum + (reserved ?? 0);
      }, 0),
      completed: completedRidesDisplay.length,
    }),
    [upcomingRidesDisplay, completedRidesDisplay]
  );

  const pendingRequestsCount = useMemo(
    () =>
      upcomingRidesDisplay.reduce((sum, ride) => {
        const requests = ride.requests ?? 0;
        return sum + requests;
      }, 0),
    [upcomingRidesDisplay]
  );

  const handleViewRide = useCallback(
    (rideId: string) => {
      router.push({ pathname: '/driver-ride-detail', params: { rideId } } as any);
    },
    [router]
  );

  const handleHighlightCampus = useCallback((campusName: string) => {
    const campus = CAMPUS_LOCATIONS.find((item) => item.name === campusName);
    if (campus) {
      setHighlightedCampus(campus);
    }
  }, []);

  return (
    <AppBackground>
      <GradientBackground colors={Gradients.driver} style={styles.hero}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <IconSymbol name="chevron.left" size={24} color="#fff" />
            </Pressable>
            <View>
              <Text style={styles.heroTitle}>Mes trajets publiés</Text>
              <Text style={styles.heroSubtitle}>Gérez vos trajets et les réservations</Text>
            </View>
          </View>
        </SafeAreaView>
      </GradientBackground>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.alertCard}>
          <View style={styles.alertBadge}>
            <IconSymbol name="exclamationmark.circle" size={18} color={Colors.warning} />
          </View>
          <View style={styles.alertText}>
            <Text style={styles.alertTitle}>
              {pendingRequestsCount} nouvelles {pendingRequestsCount > 1 ? 'demandes' : 'demande'} en attente
            </Text>
            <Text style={styles.alertSubtitle}>Acceptez ou refusez les demandes de réservation</Text>
          </View>
        </View>

        <View style={styles.mapCard}>
          <Text style={styles.mapTitle}>Campus partenaires</Text>
          <View style={styles.mapFrame}>
            <View style={styles.mapGrid}>
              {[20, 40, 60, 80].map((value) => (
                <View
                  key={`v-${value}`}
                  style={[styles.mapLine, { left: `${value}%`, height: '100%' }]}
                />
              ))}
              {[20, 40, 60, 80].map((value) => (
                <View
                  key={`h-${value}`}
                  style={[styles.mapLine, { top: `${value}%`, width: '100%' }]}
                />
              ))}
            </View>
            {CAMPUS_LOCATIONS.map((node) => {
              const active = node.name === highlightedCampus.name;
              return (
                <Pressable
                  key={node.name}
                  style={[
                    styles.mapNode,
                    { backgroundColor: node.color, left: node.left, top: node.top },
                    active && styles.mapNodeActive,
                  ]}
                  onPress={() => handleHighlightCampus(node.name)}
                >
                  <IconSymbol name={node.icon} size={20} color="#fff" />
                  <Text style={styles.mapNodeLabel}>{node.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.mapDetail}>
            <Text style={styles.mapDetailTitle}>{highlightedCampus.name}</Text>
            <Text style={styles.mapDetailText}>{highlightedCampus.description}</Text>
          </View>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.upcoming}</Text>
            <Text style={styles.statLabel}>À venir</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.reservations}</Text>
            <Text style={styles.statLabel}>Réservations</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.completed}</Text>
            <Text style={styles.statLabel}>Terminés</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Trajets à venir</Text>
          {upcomingRidesDisplay.length === 0 ? (
            <Text style={styles.emptyText}>Aucun trajet publié pour le moment.</Text>
          ) : (
            upcomingRidesDisplay.map((ride) => {
              const pending = ride.requests ?? ride.passengers.length;
              const reserved = ride.reservedSeats ?? ride.passengers.length;
              return (
                <View key={ride.id} style={styles.rideCard}>
                  <View style={styles.rideBadge}>
                    <IconSymbol name="exclamationmark.triangle" size={14} color={Colors.warning} />
                    <Text style={styles.rideBadgeText}>
                      {pending} demande{pending > 1 ? 's' : ''} en attente
                    </Text>
                  </View>
                  <Text style={styles.rideRoute}>
                    {ride.depart} → {ride.destination}
                  </Text>
                  <Text style={styles.rideRouteSub}>
                    <IconSymbol name="mappin.and.ellipse" size={14} color={Colors.gray500} />
                    {' '}
                    {ride.depart}
                  </Text>
                  <Text style={styles.rideRouteSub}>
                    <IconSymbol name="mappin.and.ellipse" size={14} color={Colors.gray500} />
                    {' '}
                    {ride.destination}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={styles.metaGroup}>
                      <IconSymbol name="calendar" size={14} color={Colors.gray500} />
                      <Text style={styles.metaText}>{formatRideBadgeDate(ride.departureAt)}</Text>
                    </View>
                    <View style={styles.metaGroup}>
                      <IconSymbol name="clock" size={14} color={Colors.gray500} />
                      <Text style={styles.metaText}>{formatRideTime(ride.departureAt)}</Text>
                    </View>
                  </View>
                  <View style={styles.infoRow}>
                    <View style={styles.infoGroup}>
                      <IconSymbol name="person.2.fill" size={14} color={Colors.gray500} />
                      <Text style={styles.infoText}>
                        {reserved}/{ride.seats} places
                      </Text>
                    </View>
                    <Text style={styles.infoText}>Prix : {ride.price.toFixed(2)}€</Text>
                    <Pressable style={styles.viewButton} onPress={() => handleViewRide(ride.id)}>
                      <Text style={styles.viewButtonText}>Voir</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Trajets terminés</Text>
          {completedRidesDisplay.length === 0 ? (
            <Text style={styles.emptyText}>Aucun trajet terminé.</Text>
          ) : (
            completedRidesDisplay.slice(-1).map((ride) => (
              <View key={ride.id} style={styles.completedCard}>
                <View style={styles.completedHeader}>
                  <IconSymbol name="checkmark.circle.fill" size={16} color={Colors.success} />
                  <Text style={styles.completedStatus}>Terminé</Text>
                </View>
                <Text style={styles.completedRoute}>{ride.depart} → {ride.destination}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>{formatRideBadgeDate(ride.departureAt)}</Text>
                  <Text style={styles.metaText}>
                    {ride.passengers.length} passager{ride.passengers.length > 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.metaText}>{ride.price.toFixed(2)}€</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomLeftRadius: Radius['2xl'],
    borderBottomRightRadius: Radius['2xl'],
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: '#fff',
    fontSize: 16,
  },
  content: {
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  alertCard: {
    backgroundColor: '#fff',
    borderRadius: 30,
    padding: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
    flexWrap: 'wrap',
    ...Shadows.card,
  },
  alertBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF3D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertText: {
    flex: 1,
  },
  alertTitle: {
    fontWeight: '700',
    color: Colors.warning,
    fontSize: 16,
    flexWrap: 'wrap',
  },
  alertSubtitle: {
    color: Colors.gray600,
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 30,
    padding: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    ...Shadows.card,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.accent,
  },
  statLabel: {
    color: Colors.gray500,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 30,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  rideCard: {
    borderRadius: 26,
    backgroundColor: '#F9F2FF',
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  rideBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: '#FFF3D6',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius['2xl'],
  },
  rideBadgeText: {
    color: Colors.warning,
    fontWeight: '700',
    fontSize: 13,
  },
  rideRoute: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  rideRouteSub: {
    color: Colors.gray600,
    fontSize: 14,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metaText: {
    color: Colors.gray600,
    fontSize: 13,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  infoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  infoText: {
    color: Colors.gray600,
    fontSize: 13,
  },
  viewButton: {
    marginLeft: 'auto',
    backgroundColor: Colors.accent,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm * 2,
    paddingVertical: Spacing.xs,
  },
  viewButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  emptyText: {
    color: Colors.gray500,
    fontStyle: 'italic',
  },
  completedCard: {
    backgroundColor: '#F6F7FB',
    borderRadius: 24,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  completedStatus: {
    color: Colors.success,
    fontWeight: '700',
  },
  completedRoute: {
    fontWeight: '600',
    color: Colors.ink,
  },
  mapCard: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.card,
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  mapFrame: {
    height: 220,
    borderRadius: 20,
    backgroundColor: '#F5F6FA',
    overflow: 'hidden',
    position: 'relative',
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
  },
  mapLine: {
    position: 'absolute',
    borderColor: '#E1E7F5',
    borderWidth: 1,
    opacity: 0.5,
  },
  mapNode: {
    position: 'absolute',
    width: 130,
    padding: Spacing.xs,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  mapNodeActive: {
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  mapNodeLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  mapDetail: {
    backgroundColor: '#F2F4FF',
    borderRadius: 20,
    padding: Spacing.md,
  },
  mapDetailTitle: {
    fontWeight: '700',
    color: Colors.ink,
    fontSize: 16,
  },
  mapDetailText: {
    color: Colors.gray600,
    fontSize: 13,
    marginTop: Spacing.xs,
  },
});

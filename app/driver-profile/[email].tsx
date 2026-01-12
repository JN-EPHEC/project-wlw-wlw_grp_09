import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RatingStars } from '@/components/ui/rating-stars';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { getAvatarColor, getAvatarUrl } from '@/app/ui/avatar';
import { subscribeDriverReviews, type Review } from '@/app/services/reviews';
import { hasRideDeparted, subscribeRides, type Ride } from '@/app/services/rides';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';

const C = Colors;
const S = Shadows;

export default function DriverProfileScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [rides, setRides] = useState<Ride[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeRides(setRides);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!email) return;
    const unsubscribe = subscribeDriverReviews(email, setReviews);
    return unsubscribe;
  }, [email]);

  const driverRides = useMemo(
    () => rides.filter((ride) => email && ride.ownerEmail === email),
    [rides, email]
  );
  const driverName = driverRides[0]?.driver ?? 'Conducteur CampusRide';
  const availableRides = useMemo(
    () =>
      driverRides.filter(
        (ride) => !hasRideDeparted(ride) && ride.passengers.length < ride.seats
      ),
    [driverRides]
  );
  const driverEmail = email ?? 'inconnu@campusride.app';
  const upcomingTrips = driverRides.filter((ride) => !hasRideDeparted(ride)).length;
  const completedTrips = driverRides.filter((ride) => hasRideDeparted(ride)).length;
  const ratingSummary = useMemo(() => {
    if (reviews.length === 0) return { average: 0, count: 0 };
    const total = reviews.reduce((acc, review) => acc + review.rating, 0);
    return { average: +(total / reviews.length).toFixed(1), count: reviews.length };
  }, [reviews]);
  const avatarUri = getAvatarUrl(driverEmail, 160);
  const avatarBg = getAvatarColor(driverEmail);
  const formatRideDateLabel = useCallback((rideDate: Date) => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    const dateOnly = new Date(rideDate);
    dateOnly.setHours(0, 0, 0, 0);
    if (dateOnly.getTime() === today.getTime()) return "Aujourd'hui";
    if (dateOnly.getTime() === tomorrow.getTime()) return 'Demain';
    return rideDate.toLocaleDateString('fr-BE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }, []);

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityRole="button">
            <IconSymbol name="chevron.left" size={18} color={C.white} />
            <Text style={styles.backText}>Retour</Text>
          </Pressable>
          <Text style={styles.pageTitle}>Profil du conducteur</Text>
          <View style={styles.profileCard}>
            <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{driverName}</Text>
              <Text style={styles.driverEmail}>{driverEmail}</Text>
              <View style={styles.ratingRow}>
                <RatingStars value={ratingSummary.average} size={18} editable={false} />
                <Text style={styles.ratingText}>
                  {ratingSummary.average.toFixed(1)} / 5 · {ratingSummary.count} avis
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Trajets à venir</Text>
              <Text style={styles.statValue}>{upcomingTrips}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Trajets effectués</Text>
              <Text style={styles.statValue}>{completedTrips}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trajets disponibles</Text>
            {availableRides.map((ride) => {
              const rideDate = new Date(ride.departureAt);
              const seatsLeft = Math.max(0, ride.seats - ride.passengers.length);
              const dateLabel = formatRideDateLabel(rideDate);
              return (
                <GradientBackground key={ride.id} colors={Gradients.soft} style={styles.tripCard}>
                  <View style={styles.tripHeader}>
                    <View style={styles.tripHeaderInfo}>
                      <Text style={styles.tripMeta}>
                        {ride.time} · {dateLabel}
                      </Text>
                    </View>
                    <View style={styles.tripPricePill}>
                      <Text style={styles.tripPriceText}>€{ride.price.toFixed(2)}</Text>
                    </View>
                  </View>
                  <View style={styles.tripStatsRow}>
                    <View style={styles.tripStat}>
                      <IconSymbol name="clock" size={14} color={Colors.gray500} />
                      <Text style={styles.tripStatText}>{seatsLeft} place(s) dispo</Text>
                    </View>
                  </View>
                  <View style={styles.tripRouteRow}>
                    <View style={styles.tripRouteColumn}>
                      <IconSymbol name="location.fill" size={16} color={Colors.gray500} />
                      <Text style={styles.tripRouteLabel}>{ride.depart}</Text>
                    </View>
                    <IconSymbol name="chevron.right" size={16} color={Colors.gray400} />
                    <View style={styles.tripRouteColumn}>
                      <IconSymbol name="mappin.circle.fill" size={18} color="#FF6B9A" />
                      <Text style={styles.tripRouteDestination}>{ride.destination}</Text>
                    </View>
                  </View>
                  <GradientButton
                    title="Voir les détails"
                    onPress={() => router.push({ pathname: '/ride/[id]', params: { id: ride.id } })}
                    fullWidth
                    style={styles.tripButton}
                  />
                </GradientBackground>
              );
            })}
            {availableRides.length === 0 ? (
              <Text style={styles.emptyText}>Aucun trajet disponible pour ce conducteur.</Text>
            ) : null}
          </View>
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  backText: {
    color: C.white,
    fontWeight: '700',
  },
  pageTitle: {
    color: C.white,
    fontSize: 24,
    fontWeight: '800',
  },
  profileCard: {
    backgroundColor: C.card,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
    ...(S.card as object),
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  driverName: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
  },
  driverEmail: {
    color: C.gray600,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  ratingText: {
    color: C.gray600,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius['2xl'],
    padding: Spacing.md,
  },
  statLabel: {
    color: C.white,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    color: C.white,
    fontSize: 28,
    fontWeight: '800',
    marginTop: Spacing.xs,
  },
  section: {
    backgroundColor: C.card,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
    ...(S.card as object),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
  },
  rideRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECECEC',
    gap: Spacing.md,
  },
  rideLabel: {
    fontWeight: '700',
    color: C.ink,
  },
  rideMeta: {
    color: C.gray600,
    fontSize: 12,
  },
  ridePrice: {
    fontWeight: '700',
    color: C.primary,
    textAlign: 'right',
  },
  rideBadge: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rideSeats: {
    color: C.gray600,
    fontSize: 12,
  },
  tripCard: {
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripHeaderInfo: {
    flex: 1,
  },
  tripMeta: {
    color: C.gray600,
    marginTop: 2,
  },
  tripPricePill: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  tripPriceText: {
    color: C.primary,
    fontWeight: '800',
  },
  tripStatsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  tripStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  tripStatText: {
    color: C.gray700,
    fontWeight: '600',
    fontSize: 12,
  },
  tripRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tripRouteColumn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  tripRouteLabel: {
    color: C.gray700,
    fontWeight: '600',
  },
  tripRouteDestination: {
    color: C.ink,
    fontWeight: '700',
  },
  tripButton: {
    marginTop: Spacing.xs,
  },
  emptyText: {
    color: C.gray500,
    textAlign: 'center',
  },
});

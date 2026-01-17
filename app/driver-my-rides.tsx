import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import {
  getRides,
  hasRideDeparted,
  subscribeRides,
  type Ride,
} from '@/app/services/rides';
import { useAuthSession } from '@/hooks/use-auth-session';
import { maskPlate } from '@/app/utils/plate';

const C = Colors;

type TabKey = 'published' | 'upcoming' | 'history';

const isTabKey = (value: string | undefined): value is TabKey =>
  value === 'published' || value === 'upcoming' || value === 'history';

const TAB_EMPTY_COPY: Record<TabKey, string> = {
  published: 'Tu n’as aucun trajet publié pour le moment.',
  upcoming: 'Tu n’as aucun trajet à venir pour le moment.',
  history: 'Tu n’as pas encore d’historique de trajets.',
};

const normalizeEmail = (value?: string) => (value ?? '').trim().toLowerCase();

export default function DriverMyRidesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const session = useAuthSession();
  const [rides, setRides] = useState<Ride[]>(() => getRides());

  useEffect(() => {
    const unsubscribe = subscribeRides(setRides);
    return unsubscribe;
  }, []);

  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const activeTab: TabKey = isTabKey(tabParam) ? tabParam : 'published';

  const normalizedEmail = useMemo(() => normalizeEmail(session.email), [session.email]);
  const myRides = useMemo(() => {
    if (!normalizedEmail) return [];
    return rides.filter((ride) => normalizeEmail(ride.ownerEmail) === normalizedEmail);
  }, [normalizedEmail, rides]);

  useEffect(() => {
    if (__DEV__) {
      console.debug('[driver-my-rides] session', session.email);
      console.debug(
        '[driver-my-rides] sample rides ownerEmail',
        rides.slice(0, 5).map((ride) => ride.ownerEmail)
      );
    }
  }, [rides, session.email]);

  const now = Date.now();
  const publishedRides = useMemo(() => {
    return [...myRides].sort((a, b) => b.departureAt - a.departureAt);
  }, [myRides]);

  useEffect(() => {
    console.log('[DriverMyRides] published count', publishedRides.length);
  }, [publishedRides.length]);

  const upcomingRides = useMemo(() => {
    return myRides
      .filter((ride) => ride.departureAt > now)
      .sort((a, b) => a.departureAt - b.departureAt);
  }, [myRides, now]);

  const historyRides = useMemo(() => {
    return myRides
      .filter((ride) => ride.departureAt <= now)
      .sort((a, b) => b.departureAt - a.departureAt);
  }, [myRides, now]);

  const sections = useMemo(
    () => [
      { key: 'published' as const, label: 'Publiés', count: publishedRides.length },
      { key: 'upcoming' as const, label: 'À venir', count: upcomingRides.length },
      { key: 'history' as const, label: 'Historique', count: historyRides.length },
    ],
    [historyRides.length, publishedRides.length, upcomingRides.length]
  );

  const activeTabBackgroundColor = Colors.accentSoft;
  const activeTabTextColor = Colors.accent;

  const currentList = useMemo(() => {
    if (activeTab === 'upcoming') return upcomingRides;
    if (activeTab === 'history') return historyRides;
    return publishedRides;
  }, [activeTab, historyRides, publishedRides, upcomingRides]);

  const emptyCopy = TAB_EMPTY_COPY[activeTab];

  const handleTabSelect = useCallback(
    (tab: TabKey) => {
      router.replace({
        pathname: '/driver-my-rides',
        params: { tab } as any,
      });
    },
    [router]
  );

  const openRideDetail = useCallback(
    (rideId: string) => {
      router.push({
        pathname: '/driver-ride-detail',
        params: { rideId } as any,
      });
    },
    [router]
  );

  const renderRideCard = useCallback(
    (ride: Ride) => {
      const departureDate = new Date(ride.departureAt);
      const dateLabel = departureDate.toLocaleDateString('fr-BE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      const timeLabel = departureDate.toLocaleTimeString('fr-BE', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const capacityLabel = `${ride.passengers.length}/${ride.seats} réservées`;
      const typeLabel = ride.tripType === 'round_trip' ? 'Aller-retour' : 'Aller simple';
      const hasDeparted = hasRideDeparted(ride);
      return (
        <Pressable
          key={ride.id}
          style={styles.card}
          onPress={() => openRideDetail(ride.id)}
          accessibilityRole="button"
        >
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardDriver}>
                {ride.depart} → {ride.destination}
              </Text>
              <Text style={styles.cardMeta}>{dateLabel}</Text>
              <Text style={styles.cardNote}>{timeLabel}</Text>
            </View>
            <View style={[styles.badge, hasDeparted ? styles.badgeHistory : styles.badgePending]}>
              <Text style={styles.badgeText}>{hasDeparted ? 'Terminé' : 'À venir'}</Text>
            </View>
          </View>
          <View style={styles.cardDetails}>
            <View style={styles.cardDetailRow}>
              <IconSymbol name="person.2.fill" size={16} color={C.gray500} />
              <View style={styles.cardDetailInfo}>
                <Text style={styles.cardDetailValue}>{capacityLabel}</Text>
                <Text style={styles.cardDetailLabel}>{typeLabel}</Text>
              </View>
            </View>
            <View style={styles.cardDetailRow}>
              <IconSymbol name="creditcard.fill" size={16} color={C.gray500} />
              <View style={styles.cardDetailInfo}>
                <Text style={styles.cardDetailValue}>{ride.price.toFixed(2)} € / passager</Text>
                <Text style={styles.cardDetailLabel}>
                  {ride.pricingMode === 'double' ? 'Tarif double' : 'Tarif simple'}
                </Text>
              </View>
            </View>
            <View style={styles.cardDetailRow}>
              <IconSymbol name="car" size={16} color={C.gray500} />
              <View style={styles.cardDetailInfo}>
                <Text style={styles.cardDetailValue}>{maskPlate(ride.plate)}</Text>
                <Text style={styles.cardDetailLabel}>Plaque</Text>
              </View>
            </View>
          </View>
        </Pressable>
      );
    },
    [openRideDetail]
  );

  return (
    <AppBackground colors={Gradients.driver}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <GradientBackground colors={Gradients.driver} style={styles.hero}>
            <View style={styles.headerTop}>
              <Pressable style={styles.backButton} onPress={() => router.back()}>
                <IconSymbol name="chevron.left" size={20} color={C.white} />
              </Pressable>
              <Text style={styles.title}>Mes trajets</Text>
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
                    onPress={() => handleTabSelect(section.key)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.tabButtonText, isActive && { color: activeTabTextColor }]}>
                      {section.label} ({section.count})
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </GradientBackground>

          {currentList.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol name="car" size={32} color={C.gray400} />
              <Text style={styles.emptyTitle}>Aucun trajet ici</Text>
              <Text style={styles.emptySubtitle}>{emptyCopy}</Text>
            </View>
          ) : (
            currentList.map((ride) => renderRideCard(ride))
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
    paddingBottom: Spacing.xxl,
  },
  hero: {
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    marginTop: Spacing.sm,
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
  cardDriver: {
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
  },
  cardMeta: {
    color: C.gray600,
    fontSize: 13,
  },
  cardNote: {
    color: C.gray600,
    fontSize: 14,
  },
  cardDetails: {
    gap: Spacing.sm,
  },
  cardDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  cardDetailInfo: {
    flex: 1,
    gap: 2,
  },
  cardDetailValue: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
  },
  cardDetailLabel: {
    fontSize: 12,
    color: C.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  badgePending: {
    backgroundColor: C.secondaryLight,
  },
  badgeHistory: {
    backgroundColor: C.gray200,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.ink,
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

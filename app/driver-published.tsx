import { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { useRouter } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { useAuthSession } from '@/hooks/use-auth-session';
import { getRides, hasRideDeparted, subscribeRides, type Ride } from '@/app/services/rides';

const TAB_CONFIG = {
  published: {
    label: 'Publiés',
    emptyTitle: 'Aucun trajet publié',
    emptySubtitle: 'Publiez un trajet pour le voir ici.',
  },
  upcoming: {
    label: 'À venir',
    emptyTitle: 'Aucun trajet à venir',
    emptySubtitle: 'Planifiez un trajet pour l’afficher ici.',
  },
  history: {
    label: 'Historique',
    emptyTitle: 'Aucun trajet dans l’historique',
    emptySubtitle: 'Vos trajets passés apparaîtront ici.',
  },
} as const;

type TabKey = keyof typeof TAB_CONFIG;

export default function DriverPublishedScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const [rides, setRides] = useState<Ride[]>(() => getRides());
  const [activeTab, setActiveTab] = useState<TabKey>('published');

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

  const activeRides = useMemo(() => {
    if (activeTab === 'upcoming') return upcomingRides;
    if (activeTab === 'history') return completedRides;
    return publishedRides;
  }, [activeTab, publishedRides, upcomingRides, completedRides]);

  const currentTabConfig = TAB_CONFIG[activeTab];

  return (
    <AppBackground>
      <GradientBackground colors={Gradients.driver} style={styles.background}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityRole="button">
              <IconSymbol name="chevron.left" size={24} color={Colors.white} />
            </Pressable>
            <View>
              <Text style={styles.headerTitle}>Mes trajets</Text>
            </View>
          </View>
          <View style={styles.tabRow}>
            {(Object.keys(TAB_CONFIG) as TabKey[]).map((tab) => {
              const tabProps = TAB_CONFIG[tab];
              const isActive = tab === activeTab;
              return (
                <Pressable
                  key={tab}
                  style={[styles.tabItem, isActive && styles.tabItemActive]}
                  onPress={() => setActiveTab(tab)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tabProps.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </SafeAreaView>
        <View style={styles.content}>
          <View style={styles.card}>
            {activeRides.length === 0 ? (
              <>
                <View style={styles.iconWrapper}>
                  <IconSymbol name="car.fill" size={30} color={Colors.accent} />
                </View>
                <Text style={styles.cardTitle}>{currentTabConfig.emptyTitle}</Text>
                <Text style={styles.cardSubtitle}>{currentTabConfig.emptySubtitle}</Text>
              </>
            ) : (
              activeRides.map((ride) => (
                <View key={ride.id} style={styles.rideRow}>
                  <Text style={styles.rideRowTitle}>
                    {ride.depart} → {ride.destination}
                  </Text>
                  <Text style={styles.rideRowTime}>
                    {new Date(ride.departureAt).toLocaleString('fr-BE', {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      </GradientBackground>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    paddingBottom: Spacing.xl,
  },
  safe: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.md,
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
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: '800',
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  tabItem: {
    flex: 1,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabItemActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  tabLabelActive: {
    color: Colors.white,
  },
  content: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  card: {
    borderRadius: Radius['2xl'],
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadows.card,
    minHeight: 200,
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,193,203,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
    textAlign: 'center',
  },
  cardSubtitle: {
    color: Colors.gray600,
    textAlign: 'center',
  },
  rideRow: {
    width: '100%',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3FF',
  },
  rideRowTitle: {
    fontWeight: '700',
    color: Colors.ink,
  },
  rideRowTime: {
    color: Colors.gray500,
    marginTop: Spacing.xs,
  },
});

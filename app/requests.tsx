import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { getAvatarUrl } from '@/app/ui/avatar';
import { useAuthSession } from '@/hooks/use-auth-session';
import { usePassengerRequests } from '@/hooks/use-passenger-requests';
import { type ReservationRequestEntry } from '@/app/services/reservation-requests';

const C = Colors;

export default function RequestsScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const isDriver = session.isDriver;
  const { pending, accepted } = usePassengerRequests(session.email);
  const [activeTab, setActiveTab] = useState<'pending' | 'accepted'>('pending');

  const sections = useMemo(
    () => [
      { key: 'pending', label: 'Demandes en cours', count: pending.length },
      { key: 'accepted', label: 'Demandes acceptées', count: accepted.length },
    ],
    [pending.length, accepted.length]
  );

  const currentList = activeTab === 'pending' ? pending : accepted;
  const emptyCopy =
    activeTab === 'pending'
      ? 'Tu n’as envoyé aucune demande pour l’instant.'
      : 'Pas encore de demande acceptée. Réserve un trajet pour commencer.';

  const highlightColor = isDriver ? Colors.accent : Colors.primary;
  const openRideDetails = useCallback(
    (rideId: string) => {
      router.push(`/ride/${rideId}`);
    },
    [router]
  );

  const renderCard = useCallback(
    (request: ReservationRequestEntry) => (
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
              openRideDetails(request.rideId);
            }}
          >
            <IconSymbol name="creditcard" size={16} color={C.white} />
            <Text style={styles.payButtonText}>Procéder au paiement</Text>
          </Pressable>
        ) : null}
      </Pressable>
    ),
    [openRideDetails]
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
                    styles.tabButtonActive,
                    isActive && {
                      backgroundColor: highlightColor,
                      borderColor: highlightColor,
                    },
                  ]}
                  onPress={() => setActiveTab(section.key as typeof activeTab)}
                >
                  <Text
                    style={[
                      styles.tabButtonText,
                      isActive && styles.tabButtonTextActive,
                    ]}
                  >
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadows.card,
  },
  tabButtonActive: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  tabButtonText: {
    color: C.white,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: C.white,
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

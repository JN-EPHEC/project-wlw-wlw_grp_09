import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
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
import { Colors, Gradients, Radius, Spacing, Shadows } from '@/app/ui/theme';
import { getRides, subscribeRides, type Ride } from '@/app/services/rides';
import {
  ConfirmedPassenger,
  PendingRequest,
  acceptPendingRequest,
  getSampleRideDetail,
  refusePendingRequest,
} from '@/app/data/driver-samples';

const formatFullDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('fr-BE', {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatAmount = (value: number) => `${value.toFixed(2)} €`;

export default function DriverRideDetailScreen() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId?: string }>();
  const [rides, setRides] = useState<Ride[]>(() => getRides());

  useEffect(() => {
    const unsubscribe = subscribeRides(setRides);
    return unsubscribe;
  }, []);

  const ride = useMemo(() => {
    if (!rideId) return undefined;
    return rides.find((item) => item.id === rideId);
  }, [rideId, rides]);

  const detail = useMemo(() => getSampleRideDetail(rideId ?? ''), [rideId]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>(() => detail.pendingRequests);
  const [confirmedPassengers, setConfirmedPassengers] = useState<ConfirmedPassenger[]>(
    () => detail.confirmedPassengers
  );

  useEffect(() => {
    setPendingRequests(detail.pendingRequests);
    setConfirmedPassengers(detail.confirmedPassengers);
  }, [detail]);

  const reserved = ride?.passengers.length ?? confirmedPassengers.length;
  const totalSeats = ride?.seats ?? 3;
  const available = Math.max(totalSeats - reserved, 0);
  const pricePerPassenger = ride?.price ?? 2.13;
  const commission = +(pricePerPassenger * 0.2).toFixed(2);
  const driverNet = +(pricePerPassenger - commission).toFixed(2);
  const totalEstimated = +(driverNet * reserved).toFixed(2);

  const infoRows = [
    {
      label: 'Départ',
      value: ride?.depart ?? 'Ixelles, Brussels',
      icon: 'mappin.and.ellipse',
      color: Colors.primary,
    },
    {
      label: 'Arrivée',
      value: ride?.destination ?? 'EPHEC Delta',
      icon: 'mappin.and.ellipse',
      color: Colors.gray600,
    },
    {
      label: 'Date & Heure',
      value: ride?.departureAt
        ? `${formatFullDate(ride.departureAt)} · ${formatTime(ride.departureAt)}`
        : 'Dimanche 30 novembre · 08:15',
      icon: 'calendar',
      color: Colors.gray600,
    },
    {
      label: 'Places',
      value: `${reserved}/${totalSeats} réservées · ${available} disponible${available > 1 ? 's' : ''}`,
      icon: 'person.2.fill',
      color: Colors.gray600,
    },
  ];

  const handleAccept = useCallback(
    (request: PendingRequest) => {
      if (!rideId) return;
      const passenger = acceptPendingRequest(rideId, request.id);
      if (!passenger) return;
      setPendingRequests((prev) => prev.filter((item) => item.id !== request.id));
      setConfirmedPassengers((prev) => [...prev, passenger]);
      Alert.alert('Passager accepté', `${request.name} rejoint le trajet.`);
    },
    [rideId]
  );

  const handleRefuse = useCallback(
    (requestId: string) => {
      if (!rideId) return;
      const removed = refusePendingRequest(rideId, requestId);
      if (!removed) return;
      setPendingRequests((prev) => prev.filter((item) => item.id !== requestId));
      Alert.alert('Demande refusée', 'La demande a bien été refusée.');
    },
    [rideId]
  );

  const openMessages = useCallback(() => {
    router.push('/(tabs)/messages');
  }, [router]);

  return (
    <AppBackground>
      <GradientBackground colors={Gradients.driver} style={styles.hero}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <IconSymbol name="chevron.left" size={24} color="#fff" />
            </Pressable>
            <View>
              <Text style={styles.heroTitle}>Informations du trajet</Text>
              <Text style={styles.heroSubtitle}>Gérer les demandes et les passagers</Text>
            </View>
          </View>
        </SafeAreaView>
      </GradientBackground>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoCard}>
          {infoRows.map((row) => (
            <View key={row.label} style={styles.infoRow}>
              <IconSymbol name={row.icon} size={18} color={row.color} />
              <View style={styles.infoTextBlock}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.paymentCard}>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Prix par passager</Text>
            <Text style={styles.paymentValue}>{formatAmount(pricePerPassenger)}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Commission (20%)</Text>
            <Text style={[styles.paymentValue, styles.paymentNegative]}>- {formatAmount(commission)}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabelAccent}>Vous recevez par passager</Text>
            <Text style={[styles.paymentValue, styles.paymentAccent]}>{formatAmount(driverNet)}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabelAccent}>Total estimé</Text>
            <Text style={[styles.paymentValue, styles.paymentAccent, styles.paymentLarge]}>
              {formatAmount(totalEstimated)}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderText}>
            <IconSymbol name="exclamationmark.circle" size={16} color={Colors.warning} />
            {' '}
            Demandes en attente ({pendingRequests.length})
          </Text>
          {pendingRequests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestLeft}>
                <Image source={request.avatar} style={styles.requestAvatar} />
                <View>
                  <View style={styles.requestTitleRow}>
                    <Text style={styles.requestName}>{request.name}</Text>
                    <View style={styles.requestRating}>
                      <IconSymbol name="star.fill" size={12} color="#FABB2E" />
                      <Text style={styles.requestRatingText}>
                        {request.rating} · {request.trips} trajets
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.requestSubtitle}>{request.requestedAt}</Text>
                </View>
              </View>
              <View style={styles.requestActions}>
                <Pressable style={styles.refuseButton} onPress={() => handleRefuse(request.id)}>
                  <Text style={styles.refuseText}>Refuser</Text>
                </Pressable>
                <Pressable style={styles.acceptButton} onPress={() => handleAccept(request)}>
                  <Text style={styles.acceptText}>Accepter</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionCardGreen}>
          <Text style={styles.sectionHeaderText}>
            <IconSymbol name="checkmark.circle.fill" size={16} color={Colors.success} />
            {' '}
            Passagers confirmés ({confirmedPassengers.length})
          </Text>
          {confirmedPassengers.map((passenger) => (
            <View key={passenger.id} style={styles.confirmedCard}>
              <View style={styles.requestLeft}>
                <Image source={passenger.avatar} style={styles.requestAvatar} />
                <View>
                  <View style={styles.requestTitleRow}>
                    <Text style={styles.requestName}>{passenger.name}</Text>
                    <IconSymbol name="checkmark.seal.fill" size={14} color={Colors.success} />
                  </View>
                  <View style={styles.requestRating}>
                    <IconSymbol name="star.fill" size={12} color="#FABB2E" />
                    <Text style={styles.requestRatingText}>
                      {passenger.rating} · {passenger.trips} trajets
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.confirmedActions}>
                <Pressable style={styles.callButton} onPress={openMessages}>
                  <IconSymbol name="phone.fill" size={14} color={Colors.gray800} />
                  <Text style={styles.callText}>Appeler</Text>
                </Pressable>
                <Pressable style={styles.messageButton} onPress={openMessages}>
                  <IconSymbol name="bubble.left.and.bubble.right.fill" size={14} color="#fff" />
                  <Text style={styles.messageText}>Message</Text>
                </Pressable>
              </View>
              <Pressable>
                <Text style={styles.cancelText}>Annuler ce passager</Text>
              </Pressable>
            </View>
          ))}
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
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  infoTextBlock: {
    flex: 1,
  },
  infoLabel: {
    color: Colors.gray500,
    fontSize: 12,
  },
  infoValue: {
    color: Colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  paymentCard: {
    backgroundColor: '#F7F5FF',
    borderRadius: 24,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentLabel: {
    color: Colors.gray500,
  },
  paymentLabelAccent: {
    color: '#6F2BE2',
    fontWeight: '700',
  },
  paymentValue: {
    fontWeight: '700',
  },
  paymentAccent: {
    color: '#6F2BE2',
  },
  paymentNegative: {
    color: Colors.danger,
  },
  paymentLarge: {
    fontSize: 20,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  sectionCardGreen: {
    backgroundColor: '#E9FBEF',
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.xs,
    ...Shadows.card,
  },
  sectionHeaderText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.ink,
  },
  requestCard: {
    backgroundColor: '#FFF6EC',
    borderRadius: 24,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  requestLeft: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  requestAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  requestTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  requestName: {
    fontWeight: '700',
    fontSize: 16,
  },
  requestRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs / 2,
  },
  requestRatingText: {
    color: Colors.gray600,
    fontSize: 12,
  },
  requestSubtitle: {
    color: Colors.gray600,
    fontSize: 12,
  },
  requestActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  refuseButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: Radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: Colors.accent,
    borderRadius: Radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  refuseText: {
    color: Colors.danger,
    fontWeight: '700',
  },
  acceptText: {
    color: '#fff',
    fontWeight: '700',
  },
  confirmedCard: {
    backgroundColor: '#E9FBEF',
    borderRadius: 24,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  confirmedActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: '#fff',
  },
  callText: {
    color: Colors.gray800,
    fontWeight: '600',
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.accent,
  },
  messageText: {
    color: '#fff',
    fontWeight: '600',
  },
  cancelText: {
    color: Colors.danger,
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
});

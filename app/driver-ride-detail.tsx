import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Spacing, Shadows } from '@/app/ui/theme';
import { deleteRide, getRides, subscribeRides, type Ride } from '@/app/services/rides';

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

  const reserved = ride?.passengers.length ?? 0;
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

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const openDeleteModal = useCallback(() => {
    if (!ride) {
      Alert.alert('Trajet introuvable', 'Ce trajet ne peut pas être supprimé.');
      return;
    }
    console.debug('[DeleteRide] open confirm', ride.id);
    setConfirmVisible(true);
  }, [ride]);

  const closeDeleteModal = useCallback(() => {
    if (isDeleting) return;
    setConfirmVisible(false);
  }, [isDeleting]);

  const handleDeleteRide = useCallback(async () => {
    if (!ride) return;
    console.debug('[DeleteRide] start', ride.id);
    setIsDeleting(true);
    try {
      deleteRide(ride.id);
      console.debug('[DeleteRide] success', ride.id);
      setConfirmVisible(false);
      void router
        .replace({ pathname: '/driver-my-rides', params: { tab: 'published' } })
        .catch(() => router.back());
    } catch (error) {
      console.error('[DeleteRide] error', error);
      const message =
        error instanceof Error ? error.message : 'Impossible de supprimer ce trajet.';
      Alert.alert('Erreur', message);
    } finally {
      setIsDeleting(false);
    }
  }, [ride, router]);

  return (
    <AppBackground>
      <GradientBackground colors={Gradients.driver} style={styles.hero}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <IconSymbol name="chevron.left" size={20} color="#fff" />
            </Pressable>
            <Text style={styles.heroTitle}>Informations du trajet</Text>
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

        <GradientButton
          title="Voir mes demandes"
          variant="twilight"
          fullWidth
          onPress={() => router.push('/requests')}
        />

        <View style={styles.deleteWrapper}>
          <Pressable
            style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
            onPress={openDeleteModal}
            accessibilityRole="button"
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.deleteButtonText}>Supprimer ce trajet</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Supprimer ce trajet ?</Text>
            <Text style={styles.modalDescription}>
              Cette action supprimera immédiatement le trajet publié ainsi que toutes les demandes
              associées.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={closeDeleteModal}
                accessibilityRole="button"
                disabled={isDeleting}
              >
                <Text style={styles.modalButtonText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleDeleteRide}
                accessibilityRole="button"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>
                    Supprimer
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
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
  deleteWrapper: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    opacity: 0.7,
  },
  deleteButtonText: {
    color: Colors.danger,
    fontWeight: '700',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.white,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
    shadowColor: '#0B2545',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink,
  },
  modalDescription: {
    fontSize: 14,
    color: Colors.gray600,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modalButton: {
    flex: 1,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonSecondary: {
    borderWidth: 1,
    borderColor: Colors.gray300,
    backgroundColor: Colors.white,
  },
  modalButtonPrimary: {
    backgroundColor: Colors.danger,
  },
  modalButtonPrimaryText: {
    color: '#fff',
  },
  modalButtonText: {
    color: Colors.ink,
    fontWeight: '700',
  },
});

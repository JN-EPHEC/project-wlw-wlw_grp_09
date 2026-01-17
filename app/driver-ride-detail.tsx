import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { getRides, removeRide, subscribeRides, type Ride } from '@/app/services/rides';

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

  const handleRemoveRide = useCallback(() => {
    if (!ride) {
      Alert.alert('Trajet introuvable', 'Ce trajet ne peut pas être supprimé.');
      return;
    }
    Alert.alert(
      'Supprimer le trajet',
      'Souhaitez-vous vraiment supprimer ce trajet ? Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            try {
              removeRide(ride.id);
              Alert.alert('Trajet supprimé', 'Ce trajet a été retiré de la plateforme.');
              router.replace('/(tabs)/index');
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Impossible de supprimer ce trajet.';
              Alert.alert('Erreur', message);
            }
          },
        },
      ]
    );
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
          <Pressable style={styles.deleteButton} onPress={handleRemoveRide}>
            <Text style={styles.deleteButtonText}>Supprimer ce trajet</Text>
          </Pressable>
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
  deleteButtonText: {
    color: Colors.danger,
    fontWeight: '700',
  },
});

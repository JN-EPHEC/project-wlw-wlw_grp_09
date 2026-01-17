import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { getRide, subscribeRides, type Ride } from '@/app/services/rides';
import { maskPlate } from '@/app/utils/plate';

const C = Colors;

type Params = {
  id?: string | string[];
};

export default function DriverRidePublishedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const rawId = params.id;
  const rideId = Array.isArray(rawId) ? rawId[0] : rawId;
  const [ride, setRide] = useState<Ride | null>(() => (rideId ? getRide(rideId) ?? null : null));

  useEffect(() => {
    if (!rideId) {
      router.replace('/');
      return undefined;
    }
    console.log('[RidePublished] id', rideId);
    setRide(getRide(rideId) ?? null);
    const unsubscribe = subscribeRides((items) => {
      const match = items.find((entry) => entry.id === rideId) ?? null;
      setRide(match);
    });
    return unsubscribe;
  }, [rideId, router]);

  useEffect(() => {
    if (ride) {
      console.log('[RidePublished] ride loaded', ride.id);
    }
  }, [ride]);

  const navigateToRides = useCallback(() => {
    router.push({
      pathname: '/driver-my-rides',
      params: { tab: 'published' },
    });
  }, [router]);

  const navigateHome = useCallback(() => {
    router.push('/');
  }, [router]);

  const isLoading = !ride;
  const departureDate = useMemo(() => {
    if (!ride?.departureAt) return null;
    return new Date(ride.departureAt);
  }, [ride]);

  const routeLabel = ride?.depart && ride?.destination ? `${ride.depart} → ${ride.destination}` : 'Trajet en cours de chargement';
  const formattedDate = departureDate
    ? departureDate.toLocaleDateString('fr-BE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : 'Date à venir';
  const timeLabel = ride?.time ?? 'Heure à confirmer';
  const timeCopy = departureDate ? `${formattedDate} · ${timeLabel}` : 'Date et heure à confirmer';
  const seatsLabel = ride ? `${ride.seats} place(s)` : 'Places à confirmer';
  const tripTypeLabel = ride
    ? ride.tripType === 'round_trip'
      ? 'Aller-retour'
      : 'Aller simple'
    : 'Type de trajet à confirmer';
  const capacityCopy = `${seatsLabel} · ${tripTypeLabel}`;
  const priceCopy = ride ? `${ride.price.toFixed(2)} € / passager` : 'Prix en cours de calcul';
  const plateCopy = ride?.plate ? maskPlate(ride.plate) : 'Plaque masquée';

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <GradientBackground colors={Gradients.card} style={styles.card}>
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <IconSymbol name="paperplane.fill" size={26} color={C.white} />
              </View>
              <Text style={styles.title}>Trajet publié</Text>
              <Text style={styles.subtitle}>
                Ton trajet a bien été publié et est maintenant visible par les passagers. Tu recevras
                une notification dès qu’un passager réserve une place.
              </Text>
              {isLoading ? <Text style={styles.loadingText}>Chargement...</Text> : null}
            </View>

            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <IconSymbol name="location.fill" size={18} color={C.primary} />
                <Text style={styles.infoText}>{routeLabel}</Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="calendar" size={18} color={C.accent} />
                <Text style={styles.infoText}>{timeCopy}</Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="person.2.fill" size={18} color={C.secondary} />
                <Text style={styles.infoText}>{capacityCopy}</Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="creditcard.fill" size={18} color={C.secondaryDark} />
                <Text style={styles.infoText}>{priceCopy}</Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="car" size={18} color={C.secondaryLight} />
                <Text style={styles.infoText}>{plateCopy}</Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="clock" size={18} color={C.secondaryDark} />
                <Text style={styles.infoText}>
                  Les passagers peuvent désormais réserver une place pour ton trajet.
                </Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="bell.fill" size={18} color={C.secondaryDark} />
                <Text style={styles.infoText}>
                  Tu seras notifié à chaque nouvelle demande afin de confirmer rapidement.
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <GradientButton
              title="Mes trajets"
              variant="cta"
              fullWidth
              onPress={navigateToRides}
              accessibilityRole="button"
            />
            <GradientButton
              title="Retour à l’accueil"
              variant="twilight"
              fullWidth
              onPress={navigateHome}
              accessibilityRole="button"
            />
          </View>
        </GradientBackground>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: Spacing.lg,
  },
  card: {
    flex: 1,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    gap: Spacing.xl,
    ...Shadows.card,
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    gap: Spacing.lg,
  },
  header: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: Radius['2xl'],
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: C.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: C.gray600,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: C.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.card,
    alignSelf: 'stretch',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  infoText: {
    flex: 1,
    color: C.gray700,
    fontSize: 14,
  },
  loadingText: {
    fontSize: 14,
    color: C.gray600,
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.md,
    alignSelf: 'stretch',
  },
});

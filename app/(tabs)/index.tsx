// app/(tabs)/index.tsx
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AREAS, MAX_RADIUS_KM, resolveAreaFromPlace } from '@/app/constants/areas';
import type { AuthSnapshot } from '@/app/services/auth';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PublishRideFlowPreview } from '@/components/publish-ride-flow';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useBreakpoints } from '@/hooks/use-breakpoints';
import { useDriverSecurity } from '@/hooks/use-driver-security';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { RideMap } from '../../components/ride-map';
import { CANCELLATION_POLICY } from '../constants/policies';
import { getDistanceKm } from '../services/distance';
import {
  markAsRead,
  registerAreaInterest,
  subscribeNotifications,
  type Notification,
} from '../services/notifications';
import type { PaymentMethod } from '../services/payments';
import {
  subscribeDriverReviews,
  subscribePassengerReviews,
  type Review,
} from '../services/reviews';
import { evaluateRewards } from '../services/rewards';
import {
  cancelReservation,
  getRides,
  hasRideDeparted,
  removeRide,
  reserveSeat,
  subscribeRides,
  type Ride,
} from '../services/rides';
import {
  getNextSelfieLabel,
  isVehicleVerified,
  needsFreshSelfie,
} from '../services/security';
import { getWallet, subscribeWallet, type WalletSnapshot } from '../services/wallet';
import { getAvatarColor, getAvatarUrl } from '../ui/avatar';
import {
  Gradients,
  Radius,
  Spacing,
  Colors as ThemeColors,
  Shadows as ThemeShadows,
  Typography,
} from '../ui/theme';

const C = ThemeColors;
const S = ThemeShadows;

const availableSeats = (ride: Ride) => ride.seats - ride.passengers.length;

const formatName = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const formatAlias = (email: string) => {
  const base = email.split('@')[0] ?? email;
  const cleaned = base.replace(/[._-]+/g, ' ');
  return formatName(cleaned) ?? cleaned;
};

const timeFilterOptions = [
  { id: 'all', label: 'Toutes' },
  { id: 'before-8', label: 'Avant 8h' },
  { id: '8-10', label: '08h-10h' },
  { id: 'after-10', label: 'Après 10h' },
] as const;

const seatFilterOptions = [
  { id: 'all', label: 'Toutes' },
  { id: '1', label: '1 place+' },
  { id: '2', label: '2 places+' },
  { id: '3', label: '3 places' },
] as const;

const withinRadius = (ride: Ride, areaPlace: string) => {
  const distance = getDistanceKm(ride.depart, areaPlace);
  return distance <= MAX_RADIUS_KM;
};

const RideRow = ({
  ride,
  session,
  highlighted = false,
  onOpen,
  driverCompleted,
  wallet,
}: {
  ride: Ride;
  session: AuthSnapshot;
  highlighted?: boolean;
  onOpen: (id: string) => void;
  driverCompleted: number;
  wallet: WalletSnapshot | null;
}) => {
  const amOwner = !!session.email && ride.ownerEmail === session.email;
  const amPassenger = !!session.email && ride.passengers.includes(session.email);
  const seatsLeft = availableSeats(ride);
  const departed = hasRideDeparted(ride);
  const scale = useRef(new Animated.Value(1)).current;
  const [driverRating, setDriverRating] = useState<{ average: number; count: number }>({
    average: 0,
    count: 0,
  });
  const walletBalance = wallet?.balance ?? 0;
  const rideCredits = wallet?.rideCredits ?? 0;
  const hasWalletBalance = walletBalance >= ride.price;
  const hasRideCredits = rideCredits > 0;
  const canceledPassengersNames = useMemo(
    () => (ride.canceledPassengers ?? []).map((email) => formatAlias(email)).join(', '),
    [ride.canceledPassengers]
  );
  const canceledPassengersCount = ride.canceledPassengers?.length ?? 0;

  useEffect(() => {
    if (!highlighted) {
      scale.stopAnimation();
      scale.setValue(1);
      return;
    }
    const animation = Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.05,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 220,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    const loop = Animated.loop(animation, { iterations: 3 });
    loop.start();
    return () => loop.stop();
  }, [highlighted, scale]);

  useEffect(() => {
    const unsubscribe = subscribeDriverReviews(ride.ownerEmail, (items) => {
      if (!items.length) {
        setDriverRating({ average: 0, count: 0 });
        return;
      }
      const sum = items.reduce((acc, review) => acc + review.rating, 0);
      const average = Math.round((sum / items.length) * 10) / 10;
      setDriverRating({ average, count: items.length });
    });
    return unsubscribe;
  }, [ride.ownerEmail]);

  const departureDayLabel = (() => {
    const departure = new Date(ride.departureAt);
    const now = new Date();
    const todayKey = now.toDateString();
    const departureKey = departure.toDateString();
    if (departureKey === todayKey) return 'Aujourd’hui';
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (departureKey === tomorrow.toDateString()) return 'Demain';
    return departure.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' });
  })();

  const confirmReservation = (method: PaymentMethod) => {
    if (!session.email) return router.push('/sign-up');
    const result = reserveSeat(ride.id, session.email, { paymentMethod: method });
    if (!result.ok) {
      switch (result.reason) {
        case 'FULL':
          return Alert.alert('Complet', 'Toutes les places ont été réservées.');
        case 'ALREADY_RESERVED':
          return Alert.alert('Déjà réservé', 'Tu as déjà une place sur ce trajet.');
        case 'DEPARTED':
          return Alert.alert('Trop tard', 'Ce trajet est déjà parti.');
        case 'PAYMENT_WALLET':
          return Alert.alert('Solde insuffisant', 'Recharge ton wallet ou choisis un autre moyen de paiement.');
        case 'PAYMENT_PASS':
          return Alert.alert('Crédits épuisés', 'Achète un nouveau pack pour continuer à profiter des trajets.');
        default:
          return Alert.alert('Paiement impossible', 'Le paiement n’a pas abouti. Réessaie dans un instant.');
      }
    }
    const methodLabel =
      method === 'wallet'
        ? 'via ton wallet'
        : method === 'pass'
        ? 'avec un crédit CampusRide'
        : 'par carte';
    Alert.alert(
      'Réservation confirmée ✅',
      `Paiement ${methodLabel} accepté. Tu recevras un rappel avant le départ.`
    );
  };

  const onReserve = () => {
    if (!session.email) {
      return router.push('/sign-up');
    }
    if (departed) {
      return Alert.alert('Trop tard', 'Ce trajet est déjà parti.');
    }
    if (amOwner) {
      return Alert.alert('Tu es conducteur', 'Tu peux modifier le trajet dans l’onglet Explore.');
    }
    if (seatsLeft <= 0) {
      return Alert.alert('Complet', 'Toutes les places ont été réservées.');
    }
    if (amPassenger) {
      return Alert.alert('Déjà réservé', 'Tu as déjà une place sur ce trajet.');
    }

    const options: { label: string; method: PaymentMethod }[] = [
      { label: 'Carte bancaire sécurisée', method: 'card' },
    ];
    if (hasWalletBalance) {
      options.unshift({
        label: `Wallet (€${walletBalance.toFixed(2)})`,
        method: 'wallet',
      });
    }
    if (hasRideCredits) {
      options.unshift({
        label: `Pack CampusRide (${rideCredits} crédit${rideCredits > 1 ? 's' : ''})`,
        method: 'pass',
      });
    }

    if (options.length === 1) {
      confirmReservation(options[0].method);
      return;
    }

    Alert.alert(
      'Choisir le paiement',
      'Sélectionne ton mode de paiement pour confirmer la réservation.',
      [
        { text: 'Annuler', style: 'cancel' },
        ...options.map((option) => ({
          text: option.label,
          onPress: () => confirmReservation(option.method),
        })),
      ]
    );
  };

  const onCancelReservation = () => {
    if (!session.email) return;
    if (departed) {
      return Alert.alert('Trajet terminé', 'Les trajets passés ne peuvent plus être modifiés.');
    }
    Alert.alert(
      'Annuler ma réservation',
      'Confirme l’annulation de ta place ? Le conducteur sera notifié immédiatement.',
      [
        { text: 'Garder ma place', style: 'cancel' },
        {
          text: 'Annuler la réservation',
          style: 'destructive',
          onPress: () => {
            if (!session.email) return;
            cancelReservation(ride.id, session.email);
            Alert.alert('Réservation annulée', 'Ta place a été libérée.');
          },
        },
      ]
    );
  };

  const onEdit = () => {
    if (departed) {
      return Alert.alert('Trajet terminé', 'Tu ne peux plus modifier un trajet déjà parti.');
    }
    router.push({ pathname: '/explore', params: { edit: ride.id } });
  };

  const onDelete = () => {
    if (departed) {
      return Alert.alert('Trajet terminé', 'Ce trajet ne peut plus être supprimé.');
    }
    Alert.alert(
      'Supprimer le trajet',
      'Confirme la suppression ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            try {
              removeRide(ride.id);
              Alert.alert('Trajet supprimé ✅', 'Ton annonce a été retirée.');
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Suppression impossible pour ce trajet.';
              Alert.alert('Action impossible', message);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const approxDistance = Math.max(1, Math.round(getDistanceKm(ride.depart, ride.destination)));

  const statusLabel = (() => {
    if (departed) return 'Terminé';
    if (amPassenger) return 'Réservé';
    if (seatsLeft <= 0) return 'Complet';
    if (amOwner) return 'Mon trajet';
    return `${seatsLeft} place(s)`;
  })();

  const statusStyle = [
    styles(C, S).statusPill,
    departed
      ? styles(C, S).statusPillPast
      : amPassenger
      ? styles(C, S).statusPillMine
      : seatsLeft <= 0
      ? styles(C, S).statusPillFull
      : styles(C, S).statusPillAvailable,
  ];

  const statusTextStyle =
    departed
      ? styles(C, S).statusPillTextPast
      : amPassenger || amOwner
      ? styles(C, S).statusPillTextMine
      : seatsLeft <= 0
      ? styles(C, S).statusPillTextFull
      : styles(C, S).statusPillTextAvailable;
  const reward = useMemo(
    () =>
      evaluateRewards({
        completedRides: driverCompleted,
        averageRating: driverRating.average,
        reviewCount: driverRating.count,
      }),
    [driverCompleted, driverRating.average, driverRating.count]
  );
  const driverAvatarBg = getAvatarColor(ride.ownerEmail);
  const driverAvatarUri = getAvatarUrl(ride.ownerEmail, 96);
  const vehicleVerified = isVehicleVerified(ride.ownerEmail, ride.plate);
  const driverMetaParts = [
    driverRating.count > 0
      ? `${driverRating.average.toFixed(1)}⭐ (${driverRating.count})`
      : 'Nouveau conducteur',
    ride.plate,
    ride.time,
  ];
  if (driverCompleted > 0) {
    driverMetaParts.push(
      `${driverCompleted} trajet${driverCompleted > 1 ? 's' : ''}`
    );
  }
  if (vehicleVerified) {
    driverMetaParts.push('Plaque vérifiée');
  }

  const openDriverReviews = () => {
    router.push({
      pathname: '/reviews/[email]',
      params: { email: ride.ownerEmail },
    });
  };

  return (
    <Pressable onPress={() => onOpen(ride.id)} style={styles(C, S).ridePressable}>
      <Animated.View
        style={[
          styles(C, S).rideCardWrapper,
          highlighted && styles(C, S).rideCardHighlighted,
          { transform: [{ scale }] },
        ]}
      >
        <GradientBackground colors={Gradients.card} style={styles(C, S).rideCard}>
      <View style={styles(C, S).rideHeader}>
        <View style={styles(C, S).driverRow}>
          <View style={[styles(C, S).driverAvatar, { backgroundColor: driverAvatarBg }]}>
            <Image source={{ uri: driverAvatarUri }} style={styles(C, S).driverAvatarImage} />
          </View>
            <View style={styles(C, S).driverInfo}>
            <View style={styles(C, S).driverTopRow}>
              <Text style={styles(C, S).driverName}>{ride.driver}</Text>
              {reward.badgeLabel ? (
                <View style={styles(C, S).driverBadgePill}>
                  <Text style={styles(C, S).driverBadgeText}>{reward.badgeLabel}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles(C, S).driverMetaText}>{driverMetaParts.join(' • ')}</Text>
            {reward.highlight ? (
              <Text style={styles(C, S).driverRewardText}>{reward.highlight}</Text>
            ) : null}
            <Pressable style={styles(C, S).driverReviewsLink} onPress={openDriverReviews}>
              <Text style={styles(C, S).driverReviewsText}>Voir les avis</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles(C, S).rideHeaderRight}>
          <View style={statusStyle}>
            <Text style={[styles(C, S).statusPillText, statusTextStyle]}>{statusLabel}</Text>
          </View>
          <Text style={styles(C, S).rideHeaderRightMeta}>{departureDayLabel}</Text>
        </View>
      </View>

      <Text style={styles(C, S).rideRoute}>
        {ride.depart} → {ride.destination}
      </Text>

      <View style={styles(C, S).rideMetaRow}>
        <View style={styles(C, S).rideMetaItem}>
          <Text style={styles(C, S).rideMetaLabel}>Distance estimée</Text>
          <Text style={styles(C, S).rideMetaValue}>{approxDistance} km</Text>
        </View>
        <View style={styles(C, S).rideMetaItem}>
          <Text style={styles(C, S).rideMetaLabel}>Tarif</Text>
          <Text style={styles(C, S).rideMetaValue}>€{ride.price.toFixed(2)}</Text>
        </View>
        <View style={styles(C, S).rideMetaItem}>
          <Text style={styles(C, S).rideMetaLabel}>Capacité</Text>
          <Text style={styles(C, S).rideMetaValue}>
            {ride.passengers.length}/{ride.seats}
          </Text>
        </View>
      </View>

      {ride.passengers.length > 0 ? (
        <View style={styles(C, S).ridePassengers}>
          <Text style={styles(C, S).ridePassengersLabel}>Passagers confirmés</Text>
          <Text style={styles(C, S).ridePassengersValue}>
            {ride.passengers.map((mail) => formatAlias(mail)).join(', ')}
          </Text>
        </View>
      ) : null}

      {vehicleVerified ? (
        <View style={styles(C, S).vehicleVerifiedRow}>
          <IconSymbol name="checkmark.seal.fill" size={16} color={C.success} />
          <Text style={styles(C, S).vehicleVerifiedText}>Véhicule vérifié par CampusRide</Text>
        </View>
      ) : null}

      {departed ? (
        <Text style={styles(C, S).statusPast}>Ce trajet est archivé.</Text>
      ) : (
        <View style={styles(C, S).rideActions}>
          {amOwner ? (
            <>
              <GradientButton
                title="Modifier"
                size="sm"
                variant="lavender"
                style={styles(C, S).actionButton}
                fullWidth
                onPress={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
                accessibilityRole="button"
              />
              <GradientButton
                title="Supprimer"
                size="sm"
                variant="danger"
                style={styles(C, S).actionButton}
                fullWidth
                onPress={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
                accessibilityRole="button"
              />
            </>
          ) : amPassenger ? (
            <GradientButton
              title="Annuler ma place"
              size="sm"
              variant="lavender"
              style={styles(C, S).actionButton}
              fullWidth
              onPress={(event) => {
                event.stopPropagation();
                onCancelReservation();
              }}
              accessibilityRole="button"
            />
          ) : (
            <GradientButton
              title={seatsLeft > 0 ? 'Réserver' : 'Complet'}
              size="sm"
              variant="cta"
              style={styles(C, S).actionButton}
              fullWidth
              onPress={(event) => {
                event.stopPropagation();
                onReserve();
              }}
              disabled={seatsLeft <= 0}
              accessibilityRole="button"
            />
          )}
        </View>
      )}
      <View style={styles(C, S).policyRow}>
        <Text style={styles(C, S).policyLabel}>Politique d’annulation</Text>
        <Text style={styles(C, S).policyText}>{CANCELLATION_POLICY}</Text>
      </View>
      {amOwner && canceledPassengersCount > 0 ? (
        <View style={styles(C, S).cancellationBadge}>
          <Text style={styles(C, S).cancellationBadgeText}>
            {canceledPassengersCount > 1
              ? `Annulations récentes : ${canceledPassengersNames}`
              : `Annulation récente : ${canceledPassengersNames}`}
          </Text>
        </View>
      ) : null}
        </GradientBackground>
      </Animated.View>
    </Pressable>
  );
};

export default function Home() {
  const params = useLocalSearchParams<{ spotlight?: string }>();
  const session = useAuthSession();
  const { isDesktop, isTablet, responsiveSpacing, maxContentWidth, width: viewportWidth } =
    useBreakpoints();
  const listBottomInset = useTabBarInset(Spacing.xxl);
  const [rides, setRides] = useState<Ride[]>(getRides());
  const [wallet, setWallet] = useState<WalletSnapshot | null>(() =>
    session.email ? getWallet(session.email) : null
  );
  const preferredAreaId = useMemo(
    () => resolveAreaFromPlace(session.address ?? '')?.id ?? AREAS[0]?.id ?? 'etterbeek',
    [session.address]
  );
  const [areaId, setAreaId] = useState(preferredAreaId);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [highlightedRideId, setHighlightedRideId] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<(typeof timeFilterOptions)[number]['id']>('all');
  const [seatFilter, setSeatFilter] = useState<(typeof seatFilterOptions)[number]['id']>('all');
  const [destinationFilter, setDestinationFilter] = useState('all');
  const [passengerReviews, setPassengerReviews] = useState<Review[]>([]);
  const [activeHome, setActiveHome] = useState<'passenger' | 'driver'>(
    session.isDriver && !session.isPassenger ? 'driver' : 'passenger'
  );
  const [driverReviews, setDriverReviews] = useState<Review[]>([]);
  const autoPromptedReviews = useRef<Set<string>>(new Set());
  const driverSecurity = useDriverSecurity(session.email);
  const handleOpenBusiness = useCallback(() => {
    router.push('/business-partnership');
  }, [router]);
  const openDriverVerification = () => router.push('/driver-verification');

  useEffect(() => {
    const unsub = subscribeRides(setRides);
    return unsub;
  }, []);

  useEffect(() => {
    if (!session.email) {
      setNotifications([]);
      return;
    }
    const unsubscribe = subscribeNotifications(session.email, setNotifications);
    return unsubscribe;
  }, [session.email]);

  useEffect(() => {
    if (!session.email) {
      setWallet(null);
      return;
    }
    setWallet(getWallet(session.email));
    const unsubscribe = subscribeWallet(session.email, setWallet);
    return unsubscribe;
  }, [session.email]);

  useEffect(() => {
    if (!session.email) {
      setPassengerReviews([]);
      return;
    }
    const unsubscribe = subscribePassengerReviews(session.email, setPassengerReviews);
    return unsubscribe;
  }, [session.email]);

  useEffect(() => {
    if (!session.email) {
      setDriverReviews([]);
      return;
    }
    const unsubscribe = subscribeDriverReviews(session.email, setDriverReviews);
    return unsubscribe;
  }, [session.email]);

  useEffect(() => {
    setAreaId(preferredAreaId);
  }, [preferredAreaId]);

  useEffect(() => {
    if (!session.email) return;
    registerAreaInterest(session.email, areaId);
  }, [areaId, session.email]);

  useEffect(() => {
    if (params.spotlight) {
      setHighlightedRideId(String(params.spotlight));
    }
  }, [params.spotlight]);

  useEffect(() => {
    if (!highlightedRideId) return;
    const timeout = setTimeout(() => setHighlightedRideId(null), 4000);
    return () => clearTimeout(timeout);
  }, [highlightedRideId]);

  const areaPlace = useMemo(
    () => AREAS.find((area) => area.id === areaId)?.place ?? AREAS[0]?.place ?? 'Etterbeek',
    [areaId]
  );

  const destinationOptions = useMemo(() => {
    const options = new Set<string>();
    rides.forEach((ride) => {
      if (withinRadius(ride, areaPlace)) options.add(ride.destination);
    });
    return ['all', ...Array.from(options).sort((a, b) => a.localeCompare(b, 'fr'))];
  }, [rides, areaPlace]);

  useEffect(() => {
    if (!destinationOptions.includes(destinationFilter)) {
      setDestinationFilter('all');
    }
  }, [destinationOptions, destinationFilter]);

  useEffect(() => {
    if (!session.isDriver && activeHome === 'driver') {
      setActiveHome('passenger');
    }
  }, [session.isDriver, activeHome]);

  useEffect(() => {
    if (session.isDriver && !session.isPassenger && activeHome !== 'driver') {
      setActiveHome('driver');
    }
  }, [session.isDriver, session.isPassenger, activeHome]);

  const filteredRides = useMemo(() => {
    const matchTime = (ride: Ride) => {
      const toMinutes = (value: string) => {
        const [hours, minutes] = value.split(':').map((part) => parseInt(part, 10));
        return hours * 60 + minutes;
      };
      const minutes = toMinutes(ride.time);
      switch (timeFilter) {
        case 'before-8':
          return minutes < 8 * 60;
        case '8-10':
          return minutes >= 8 * 60 && minutes <= 10 * 60;
        case 'after-10':
          return minutes > 10 * 60;
        default:
          return true;
      }
    };

    const matchSeats = (ride: Ride) => {
      const available = availableSeats(ride);
      switch (seatFilter) {
        case '1':
          return available >= 1;
        case '2':
          return available >= 2;
        case '3':
          return available >= 3;
        default:
          return true;
      }
    };

    const matchDestination = (ride: Ride) => {
      if (destinationFilter === 'all') return true;
      return ride.destination.toLowerCase() === destinationFilter.toLowerCase();
    };

    return rides.filter(
      (ride) =>
        withinRadius(ride, areaPlace) &&
        matchTime(ride) &&
        matchSeats(ride) &&
        matchDestination(ride)
    );
  }, [rides, areaPlace, timeFilter, seatFilter, destinationFilter]);

  const myReservations = useMemo(
    () =>
      rides
        .filter(
          (ride) =>
            !!session.email && ride.passengers.includes(session.email) && !hasRideDeparted(ride)
        )
        .sort((a, b) => a.departureAt - b.departureAt),
    [rides, session.email]
  );

  const ridesToRate = useMemo(() => {
    if (!session.email) return [];
    const reviewedRideIds = new Set(passengerReviews.map((review) => review.rideId));
    return rides
      .filter(
        (ride) =>
          ride.passengers.includes(session.email) &&
          hasRideDeparted(ride) &&
          !reviewedRideIds.has(ride.id)
      )
      .sort((a, b) => b.departureAt - a.departureAt);
  }, [rides, session.email, passengerReviews]);
  const ridesToRatePreview = useMemo(() => ridesToRate.slice(0, 3), [ridesToRate]);
  const driverCompletedMap = useMemo(() => {
    const map = new Map<string, number>();
    rides.forEach((ride) => {
      if (hasRideDeparted(ride)) {
        const key = ride.ownerEmail;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    });
    return map;
  }, [rides]);
  const completedRidesCount = useMemo(
    () => rides.filter((ride) => hasRideDeparted(ride)).length,
    [rides]
  );

  const myPublishedRides = useMemo(
    () =>
      rides
        .filter((ride) => !!session.email && ride.ownerEmail === session.email)
        .sort((a, b) => a.departureAt - b.departureAt),
    [rides, session.email]
  );

  const myUpcomingDriverRides = useMemo(
    () => myPublishedRides.filter((ride) => !hasRideDeparted(ride)),
    [myPublishedRides]
  );

  const myPastDriverRides = useMemo(
    () => myPublishedRides.filter((ride) => hasRideDeparted(ride)),
    [myPublishedRides]
  );

  const driverPassengersTotal = useMemo(
    () => myPublishedRides.reduce((acc, ride) => acc + ride.passengers.length, 0),
    [myPublishedRides]
  );

  const driverPassengersHistoric = useMemo(
    () => myPastDriverRides.reduce((acc, ride) => acc + ride.passengers.length, 0),
    [myPastDriverRides]
  );

  const driverReviewSummary = useMemo(() => {
    if (!driverReviews.length) return { average: 0, count: 0 };
    const total = driverReviews.reduce((sum, review) => sum + review.rating, 0);
    return {
      average: Math.round((total / driverReviews.length) * 10) / 10,
      count: driverReviews.length,
    };
  }, [driverReviews]);

  const driverEarningsTotal = useMemo(() => {
    if (!wallet) return 0;
    return wallet.transactions.reduce(
      (acc, tx) => (tx.type === 'credit' ? acc + tx.amount : acc),
      0
    );
  }, [wallet]);

  const nextDriverRide = useMemo(
    () => myUpcomingDriverRides[0] ?? null,
    [myUpcomingDriverRides]
  );

  const driverHeroStats = useMemo(
    () => [
      { label: 'Trajets à venir', value: myUpcomingDriverRides.length },
      { label: 'Passagers', value: driverPassengersTotal },
      {
        label: 'Note moyenne',
        value: driverReviewSummary.count ? `${driverReviewSummary.average}/5` : '—',
      },
    ],
    [
      myUpcomingDriverRides.length,
      driverPassengersTotal,
      driverReviewSummary.average,
      driverReviewSummary.count,
    ]
  );

  const driverSecurityBanner = useMemo(() => {
    if (!session.isDriver) return null;
    if (!driverSecurity) {
      return {
        tone: 'info' as const,
        message: 'Vérification de tes documents en cours…',
        color: '#6b7280',
      };
    }
    if (driverSecurity.blockers.requiresLicense || driverSecurity.blockers.requiresVehicle) {
      return {
        tone: 'danger' as const,
        message: 'Ajoute ton permis et confirme ton véhicule pour publier tes trajets.',
        color: '#F16B6B',
      };
    }
    if (needsFreshSelfie(driverSecurity)) {
      return {
        tone: 'warning' as const,
        message: `Selfie requis avant ${getNextSelfieLabel(driverSecurity)}.`,
        color: '#F9CB66',
      };
    }
    return null;
  }, [driverSecurity, session.isDriver]);

  const openRideDetail = (id: string) => {
    setHighlightedRideId(id);
    router.push({ pathname: '/ride/[id]', params: { id } });
  };

  const openReviewForm = (rideId: string) => {
    router.push({ pathname: '/review/[rideId]', params: { rideId } });
  };

  useEffect(() => {
    if (!session.email) return;
    const target = ridesToRate[0];
    if (!target) return;
    if (autoPromptedReviews.current.has(target.id)) return;
    autoPromptedReviews.current.add(target.id);
    const timer = setTimeout(() => openReviewForm(target.id), 600);
    return () => clearTimeout(timer);
  }, [ridesToRate, session.email]);

  const rideAlerts = useMemo(
    () => notifications.filter((notif) => notif.metadata?.action === 'ride-published'),
    [notifications]
  );

  const unreadRideAlerts = useMemo(
    () => rideAlerts.filter((notif) => !notif.read),
    [rideAlerts]
  );

  const handleRideAlertPress = (notif: Notification) => {
    if (session.email) {
      markAsRead(session.email, notif.id);
    }
    const rideId = String(notif.metadata?.rideId ?? '');
    if (rideId) {
      const rideExists = rides.some((ride) => ride.id === rideId);
      if (!rideExists) {
        return Alert.alert('Trajet indisponible', 'Ce trajet n’est plus disponible.');
      }
      setHighlightedRideId(rideId);
      openRideDetail(rideId);
      return;
    }
    router.push('/(tabs)/index');
  };

  const sorted = useMemo(
    () =>
      [...filteredRides].sort((a, b) => {
        if (a.ownerEmail === session.email && b.ownerEmail !== session.email) return -1;
        if (a.ownerEmail !== session.email && b.ownerEmail === session.email) return 1;
        return a.departureAt - b.departureAt;
      }),
    [filteredRides, session.email]
  );

  const freeSeats = useMemo(
    () =>
      filteredRides.reduce((acc, ride) => {
        const available = availableSeats(ride);
        return acc + (available > 0 ? available : 0);
      }, 0),
    [filteredRides]
  );

  const firstName = useMemo(() => {
    const first = session.name ? session.name.split(' ')[0] : null;
    return formatName(first);
  }, [session.name]);

  const heroStats = useMemo(
    () => [
      { label: 'Trajets disponibles', value: filteredRides.length },
      { label: 'Places libres', value: freeSeats },
      { label: 'Mes réservations', value: myReservations.length },
    ],
    [filteredRides.length, freeSeats, myReservations.length]
  );

  const headerContainerStyle = useMemo(
    () => [
      styles(C, S).headerBlock,
      {
        paddingHorizontal: responsiveSpacing,
        maxWidth: Math.min(maxContentWidth, viewportWidth),
        width: '100%',
        alignSelf: 'center',
      },
    ],
    [responsiveSpacing, maxContentWidth, viewportWidth]
  );

  const listContentStyle = useMemo(
    () => [
      styles(C, S).listContent,
      {
        paddingHorizontal: responsiveSpacing,
        maxWidth: Math.min(maxContentWidth, viewportWidth),
        width: '100%',
        alignSelf: 'center',
        paddingBottom: listBottomInset,
      },
    ],
    [responsiveSpacing, maxContentWidth, viewportWidth, listBottomInset]
  );

  const passengerHeroSectionStyle = useMemo(
    () => [
      styles(C, S).passengerHeroSection,
      isTablet || isDesktop ? styles(C, S).passengerHeroSectionWide : styles(C, S).passengerHeroSectionMobile,
    ],
    [isDesktop, isTablet]
  );

  const heroCardResponsiveStyle = useMemo(
    () => [
      styles(C, S).heroCard,
      isTablet || isDesktop ? styles(C, S).heroCardWide : styles(C, S).heroCardMobile,
    ],
    [isDesktop, isTablet]
  );

  const mapSectionResponsiveStyle = useMemo(
    () => [
      styles(C, S).mapHomeSection,
      isTablet || isDesktop ? styles(C, S).mapHomeSectionWide : styles(C, S).mapHomeSectionMobile,
    ],
    [isDesktop, isTablet]
  );

  const filtersPanelStyle = useMemo(
    () => [
      styles(C, S).filtersPanel,
      isDesktop ? styles(C, S).filtersPanelDesktop : styles(C, S).filtersPanelMobile,
    ],
    [isDesktop]
  );

  const renderHeader = () => (
    <View style={headerContainerStyle}>
      {session.isDriver ? (
        <View style={styles(C, S).modeSwitch}>
          {(['passenger', 'driver'] as const).map((mode) => {
            const selected = activeHome === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => setActiveHome(mode)}
                style={[
                  styles(C, S).modeSwitchButton,
                  selected ? styles(C, S).modeSwitchButtonActive : undefined,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <IconSymbol
                  name={mode === 'passenger' ? 'person.fill' : 'car.fill'}
                  size={18}
                  color={selected ? C.primary : C.gray500}
                />
                <Text
                  style={[
                    styles(C, S).modeSwitchLabel,
                    selected ? styles(C, S).modeSwitchLabelActive : undefined,
                  ]}
                >
                  {mode === 'passenger' ? 'Passager' : 'Conducteur'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {activeHome === 'passenger' ? (
        <>
          {!session.isDriver ? (
            <GradientBackground colors={Gradients.card} style={styles(C, S).driverReminder}>
              <Text style={styles(C, S).driverReminderTitle}>Partage ton trajet retour ?</Text>
              <Text style={styles(C, S).driverReminderSubtitle}>
                Tu peux proposer un trajet et fixer ton prix dans l’onglet Explore. Les autres étudiants seront notifiés instantanément.
              </Text>
              <GradientButton
                title="Proposer un trajet"
                size="sm"
                variant="cta"
                onPress={() => router.push('/explore')}
                accessibilityRole="button"
                style={styles(C, S).driverReminderButton}
              />
            </GradientBackground>
          ) : null}
          <View style={passengerHeroSectionStyle}>
            <GradientBackground colors={Gradients.ocean} style={heroCardResponsiveStyle}>
              <View style={styles(C, S).heroTexts}>
                <Text style={styles(C, S).heroGreeting}>
                  {firstName ? `Salut ${firstName} 👋` : 'Bienvenue 👋'}
                </Text>
                <Text style={styles(C, S).heroSubtitle}>
                  {filteredRides.length > 0
                    ? `Aujourd’hui, ${filteredRides.length} trajet(s) correspondant(s) à tes filtres.`
                    : 'Ajuste les filtres ou active les alertes pour être informé en premier.'}
                </Text>
                {firstName ? (
                  <Text style={styles(C, S).heroPersonalized}>
                    {`${firstName}, on t’a préparé une sélection sur-mesure en fonction de ta zone et de tes disponibilités.`}
                  </Text>
                ) : null}
              </View>
              <GradientButton
                title="Proposer un trajet"
                onPress={() => router.push('/explore')}
                style={styles(C, S).heroButton}
                textStyle={styles(C, S).heroButtonText}
                accessibilityRole="button"
              />
              <View style={styles(C, S).heroStatsRow}>
                {heroStats.map((stat) => (
                  <View key={stat.label} style={styles(C, S).heroStat}>
                    <Text style={styles(C, S).heroStatValue}>{stat.value}</Text>
                    <Text style={styles(C, S).heroStatLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </GradientBackground>

            <View style={mapSectionResponsiveStyle}>
              <Text style={styles(C, S).sectionTitle}>Carte des trajets</Text>
              <Text style={styles(C, S).sectionSubtitle}>
                Visualise instantanément les départs et arrivées du jour autour de ton campus. Les lignes en
                pointillé suggèrent des itinéraires populaires en attendant de nouveaux trajets.
              </Text>
              <RideMap rides={filteredRides.length > 0 ? filteredRides : rides} />
            </View>
          </View>

          {firstName ? (
            <View style={styles(C, S).personalizedTips}>
              <Text style={styles(C, S).personalizedTitle}>Conseils pour toi, {firstName}</Text>
              <View style={styles(C, S).personalizedList}>
                <Text style={styles(C, S).personalizedItem}>• Enregistre plusieurs départs favoris pour comparer rapidement.</Text>
                <Text style={styles(C, S).personalizedItem}>• Active les alertes pour les communes voisines : tu recevras tout de suite une notification.</Text>
                <Text style={styles(C, S).personalizedItem}>• Consulte le wallet pour suivre tes économies trajets après trajets.</Text>
              </View>
            </View>
          ) : null}

          {rideAlerts.length > 0 ? (
            <GradientBackground colors={Gradients.soft} style={styles(C, S).alertCard}>
              <View style={styles(C, S).alertHeader}>
                <Text style={styles(C, S).alertTitle}>Nouveaux trajets publiés</Text>
                <Text style={styles(C, S).alertCounter}>
                  {unreadRideAlerts.length > 0
                    ? `${unreadRideAlerts.length} alerte(s) non lue(s)`
                    : 'Consultées'}
                </Text>
              </View>
              {rideAlerts.slice(0, 3).map((notif) => {
                const driver =
                  typeof notif.metadata?.driver === 'string' ? notif.metadata?.driver : 'Conducteur';
                const plate = typeof notif.metadata?.plate === 'string' ? notif.metadata?.plate : '';
                const time = typeof notif.metadata?.time === 'string' ? notif.metadata?.time : '';
                const rideId = String(notif.metadata?.rideId ?? '');
                const destination =
                  typeof notif.metadata?.destination === 'string' ? notif.metadata?.destination : '';
                return (
                  <View key={notif.id} style={styles(C, S).alertRow}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles(C, S).alertRowTitle}>
                        {driver}
                        {plate ? ` • ${plate}` : ''}
                        {time ? ` • ${time}` : ''}
                      </Text>
                      <Text style={styles(C, S).alertRowBody}>
                        {destination ? `Trajet vers ${destination}` : notif.body}
                      </Text>
                    </View>
                    <Pressable
                      style={styles(C, S).alertButton}
                      onPress={() => handleRideAlertPress(notif)}
                      accessibilityLabel={`Voir le trajet ${rideId}`}
                    >
                      <Text style={styles(C, S).alertButtonText}>Voir</Text>
                    </Pressable>
                  </View>
                );
              })}
              {rideAlerts.length > 3 ? (
                <Text style={styles(C, S).alertFooter}>+ {rideAlerts.length - 3} autre(s) alerte(s)</Text>
              ) : null}
            </GradientBackground>
          ) : null}

          <View style={filtersPanelStyle}>
            <View style={[styles(C, S).filterGroup, isDesktop && styles(C, S).filterGroupDesktop]}>
              <Text style={styles(C, S).filterSectionTitle}>Heure</Text>
              <View style={styles(C, S).filterChipsRow}>
                {timeFilterOptions.map((option) => {
                  const selected = timeFilter === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => setTimeFilter(option.id)}
                      style={[
                        styles(C, S).filterChip,
                        selected ? styles(C, S).filterChipSelected : styles(C, S).filterChipIdle,
                      ]}
                    >
                      <Text
                        style={[
                          styles(C, S).filterChipText,
                          selected
                            ? styles(C, S).filterChipTextSelected
                            : styles(C, S).filterChipTextIdle,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles(C, S).filterGroup, isDesktop && styles(C, S).filterGroupDesktop]}>
              <Text style={styles(C, S).filterSectionTitle}>Destination</Text>
              <View style={styles(C, S).filterChipsRow}>
                {destinationOptions.map((destination) => {
                  const selected = destinationFilter === destination;
                  return (
                    <Pressable
                      key={destination}
                      onPress={() => setDestinationFilter(destination)}
                      style={[
                        styles(C, S).filterChip,
                        selected ? styles(C, S).filterChipSelected : styles(C, S).filterChipIdle,
                      ]}
                    >
                      <Text
                        style={[
                          styles(C, S).filterChipText,
                          selected
                            ? styles(C, S).filterChipTextSelected
                            : styles(C, S).filterChipTextIdle,
                        ]}
                      >
                        {destination === 'all' ? 'Toutes' : destination}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles(C, S).filterGroup, isDesktop && styles(C, S).filterGroupDesktop]}>
              <Text style={styles(C, S).filterSectionTitle}>Places minimum</Text>
              <View style={styles(C, S).filterChipsRow}>
                {seatFilterOptions.map((option) => {
                  const selected = seatFilter === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => setSeatFilter(option.id)}
                      style={[
                        styles(C, S).filterChip,
                        selected ? styles(C, S).filterChipSelected : styles(C, S).filterChipIdle,
                      ]}
                    >
                      <Text
                        style={[
                          styles(C, S).filterChipText,
                          selected
                            ? styles(C, S).filterChipTextSelected
                            : styles(C, S).filterChipTextIdle,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles(C, S).sectionHeader}>
            <Text style={styles(C, S).sectionTitle}>Zones couvertes</Text>
            <Text style={styles(C, S).sectionSubtitle}>Rayon 30 km autour du campus sélectionné</Text>
          </View>
          <View style={styles(C, S).filters}>
            {AREAS.map((area) => {
              const selected = area.id === areaId;
              return (
                <Pressable
                  key={area.id}
                  onPress={() => setAreaId(area.id)}
                  style={[
                    styles(C, S).filterChip,
                    selected ? styles(C, S).filterChipSelected : styles(C, S).filterChipIdle,
                  ]}
                >
                  <Text
                    style={[
                      styles(C, S).filterChipText,
                      selected ? styles(C, S).filterChipTextSelected : styles(C, S).filterChipTextIdle,
                    ]}
                  >
                    {area.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {session.email && ridesToRate.length > 0 ? (
            <GradientBackground colors={Gradients.card} style={styles(C, S).reviewsCard}>
              <View style={styles(C, S).reviewsHeader}>
                <Text style={styles(C, S).reviewsCardTitle}>Avis à laisser</Text>
                <Text style={styles(C, S).reviewsCardSubtitle}>
                  Partage ton expérience pour aider la communauté.
                </Text>
              </View>
              {ridesToRatePreview.map((ride) => (
                <View key={ride.id} style={styles(C, S).reviewsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles(C, S).reviewsRoute}>
                      {ride.depart} → {ride.destination}
                    </Text>
                    <Text style={styles(C, S).reviewsMeta}>
                      {ride.driver} •{' '}
                      {new Date(ride.departureAt).toLocaleDateString('fr-BE', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Text>
                  </View>
                  <Pressable style={styles(C, S).reviewsButton} onPress={() => openReviewForm(ride.id)}>
                    <Text style={styles(C, S).reviewsButtonText}>Noter</Text>
                  </Pressable>
                </View>
              ))}
              {ridesToRate.length > ridesToRatePreview.length ? (
                <Text style={styles(C, S).reviewsMore}>
                  + {ridesToRate.length - ridesToRatePreview.length} trajet(s) supplémentaires à noter
                </Text>
              ) : null}
            </GradientBackground>
          ) : null}

          {myReservations.length > 0 ? (
            <GradientBackground colors={Gradients.card} style={styles(C, S).reservationsCard}>
              <View style={styles(C, S).reservationsHeader}>
                <Text style={styles(C, S).reservationsTitle}>Mes réservations</Text>
                <Text style={styles(C, S).reservationsSubtitle}>À venir uniquement</Text>
              </View>
              {myReservations.map((ride) => (
                <View key={ride.id} style={styles(C, S).reservationRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles(C, S).reservationRoute}>
                      {ride.depart} → {ride.destination}
                    </Text>
                    <Text style={styles(C, S).reservationMeta}>
                      {ride.time} •{' '}
                      {new Date(ride.departureAt).toLocaleDateString('fr-BE', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Text>
                  </View>
                  <Text style={styles(C, S).reservationSeats}>
                    {ride.passengers.length}/{ride.seats}
                  </Text>
                </View>
              ))}
            </GradientBackground>
          ) : null}
          <View style={styles(C, S).sectionHeader}>
            <Text style={styles(C, S).sectionTitle}>Trajets proches</Text>
            <Text style={styles(C, S).sectionSubtitle}>
              Match en direct avec les conducteurs de ton campus
            </Text>
          </View>
        </>
      ) : (
        <>
          <GradientBackground colors={Gradients.sunset} style={heroCardResponsiveStyle}>
            <View style={styles(C, S).heroTexts}>
              <Text style={styles(C, S).heroGreeting}>
                {firstName ? `Salut ${firstName} 👋` : 'Bienvenue conducteur 👋'}
              </Text>
              <Text style={styles(C, S).heroSubtitle}>
                {myUpcomingDriverRides.length > 0
                  ? `Tu as ${myUpcomingDriverRides.length} trajet(s) prévu(s). Vérifie les réservations et prépare ton départ.`
                  : 'Publie ton premier trajet en moins de 2 minutes pour aider tes camarades.'}
              </Text>
              <Text style={styles(C, S).heroPersonalized}>
                {`Total encaissé : €${driverEarningsTotal.toFixed(2)} • ${
                  driverReviewSummary.count
                    ? `Note ${driverReviewSummary.average}/5`
                    : 'Pas encore de note'
                }`}
              </Text>
            </View>
            <GradientButton
              title="Publier un trajet"
              onPress={() => router.push('/explore')}
              style={styles(C, S).heroButton}
              textStyle={styles(C, S).heroButtonText}
              accessibilityRole="button"
            />
            <View style={styles(C, S).heroStatsRow}>
              {driverHeroStats.map((stat) => (
                <View key={stat.label} style={styles(C, S).heroStat}>
                  <Text style={styles(C, S).heroStatValue}>{stat.value}</Text>
                  <Text style={styles(C, S).heroStatLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </GradientBackground>

          <GradientBackground colors={Gradients.card} style={styles(C, S).driverFlowCard}>
            <PublishRideFlowPreview />
          </GradientBackground>

          {driverSecurityBanner ? (
            <GradientBackground colors={Gradients.soft} style={styles(C, S).driverSecurityCard}>
              <View style={styles(C, S).driverSecurityRow}>
                <IconSymbol name="exclamationmark.triangle" size={18} color={driverSecurityBanner.color} />
                <Text style={styles(C, S).driverSecurityText}>{driverSecurityBanner.message}</Text>
              </View>
              <GradientButton
                title="Mettre à jour mes documents"
                onPress={openDriverVerification}
                size="sm"
                style={styles(C, S).driverSecurityButton}
              />
            </GradientBackground>
          ) : null}

          {nextDriverRide ? (
            <GradientBackground colors={Gradients.card} style={styles(C, S).driverNextRideCard}>
              <View style={styles(C, S).driverNextRideHeader}>
                <Text style={styles(C, S).driverNextRideLabel}>Prochain départ</Text>
                <Text style={styles(C, S).driverNextRideMeta}>
                  {new Date(nextDriverRide.departureAt).toLocaleDateString('fr-BE', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  • {nextDriverRide.time}
                </Text>
              </View>
              <Text style={styles(C, S).driverNextRideRoute}>
                {nextDriverRide.depart} → {nextDriverRide.destination}
              </Text>
              <View style={styles(C, S).driverNextRideRow}>
                <Text style={styles(C, S).driverNextRideInfo}>
                  {nextDriverRide.passengers.length}/{nextDriverRide.seats} passagers confirmés
                </Text>
                <Pressable
                  style={styles(C, S).driverNextRideAction}
                  onPress={() =>
                    router.push({ pathname: '/explore', params: { edit: nextDriverRide.id } })
                  }
                >
                  <Text style={styles(C, S).driverNextRideActionText}>Modifier</Text>
                </Pressable>
              </View>
            </GradientBackground>
          ) : (
            <GradientBackground colors={Gradients.card} style={styles(C, S).driverNextRideCard}>
              <Text style={styles(C, S).driverNextRideLabel}>Encore aucun trajet publié</Text>
              <Text style={styles(C, S).driverNextRideEmpty}>
                Propose ton premier trajet pour apparaître dans la recherche des passagers.
              </Text>
            </GradientBackground>
          )}

          {myPastDriverRides.length > 0 ? (
            <GradientBackground colors={Gradients.soft} style={styles(C, S).driverSummaryCard}>
              <Text style={styles(C, S).driverSummaryTitle}>Historique conducteur</Text>
              <Text style={styles(C, S).driverSummaryLine}>
                {`${myPastDriverRides.length} trajet(s) complété(s) • ${driverPassengersHistoric} passagers transportés`}
              </Text>
              <Text style={styles(C, S).driverSummaryLine}>
                {driverReviewSummary.count
                  ? `Tu as reçu ${driverReviewSummary.count} avis. Continue sur ta lancée !`
                  : 'Collecte tes premiers avis en offrant une super expérience.'}
              </Text>
            </GradientBackground>
          ) : null}
        </>
      )}

      <Pressable
        onPress={handleOpenBusiness}
        accessibilityRole="button"
        style={styles(C, S).businessCardWrapper}
      >
        <GradientBackground
          colors={['#B96DFF', '#925CFF', '#6E4AE2']}
          style={styles(C, S).businessCard}
        >
          <Image
            source={require('@/assets/images/fusee.png')}
            style={styles(C, S).businessIcon}
          />
          <View style={{ flex: 1, gap: Spacing.xs }}>
            <Text style={styles(C, S).businessTitle}>Obtenez plus de clients avec CampusRide</Text>
            <Text style={styles(C, S).businessSubtitle}>
              Touchez +1000 étudiants actifs avec profils vérifiés.
            </Text>
          </View>
          <View style={styles(C, S).businessCTA}>
            <Text style={styles(C, S).businessCTAText}>Découvrir</Text>
          </View>
        </GradientBackground>
      </Pressable>
    </View>
  );

  const renderEmptyState = () => (
    <View
      style={[
        styles(C, S).emptyState,
        {
          paddingHorizontal: responsiveSpacing,
          maxWidth: Math.min(maxContentWidth, viewportWidth),
          width: '100%',
          alignSelf: 'center',
        },
      ]}
    >
      <Text style={styles(C, S).emptyTitle}>
        {activeHome === 'passenger' ? 'Aucun trajet pour l’instant' : 'Aucun trajet conducteur'}
      </Text>
      <Text style={styles(C, S).emptySubtitle}>
        {activeHome === 'passenger'
          ? 'Reviens un peu plus tard ou propose ton trajet pour lancer la dynamique.'
          : 'Publie un trajet pour apparaître auprès des passagers de ton campus.'}
      </Text>
      {activeHome === 'driver' ? (
        <GradientButton
          title="Publier un trajet"
          size="sm"
          variant="cta"
          onPress={() => router.push('/explore')}
          style={styles(C, S).driverEmptyButton}
        />
      ) : null}
    </View>
  );

  const listData = activeHome === 'passenger' ? sorted : myUpcomingDriverRides;

  return (
    <AppBackground style={styles(C, S).screen}>
      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RideRow
            ride={item}
            session={session}
            highlighted={highlightedRideId === item.id}
            onOpen={openRideDetail}
            driverCompleted={driverCompletedMap.get(item.ownerEmail) ?? 0}
            wallet={wallet}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles(C, S).listSeparator} />}
        ListEmptyComponent={renderEmptyState}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={listContentStyle}
        style={[styles(C, S).list, { width: '100%' }]}
        extraData={{
          timeFilter,
          seatFilter,
          destinationFilter,
          highlightedRideId,
          passengerReviewsVersion: passengerReviews.length,
          completedRidesCount,
          walletBalance: wallet?.balance ?? 0,
          walletCredits: wallet?.rideCredits ?? 0,
          activeHome,
          driverUpcomingVersion: myUpcomingDriverRides.length,
        }}
        showsVerticalScrollIndicator={false}
      />
    </AppBackground>
  );
}

const styles = (C: typeof ThemeColors, S: typeof ThemeShadows) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    list: { flex: 1 },
    listContent: {
      paddingBottom: Spacing.xxl,
      paddingTop: Spacing.xl,
      gap: Spacing.lg,
    },
    listSeparator: { height: Spacing.lg },
    emptyState: {
      paddingVertical: Spacing.xl,
      alignItems: 'center',
      gap: Spacing.sm,
    },
    emptyTitle: {
      color: C.gray700,
      fontSize: 16,
      fontWeight: '700',
    },
    emptySubtitle: {
      color: C.gray500,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
    },
    driverEmptyButton: {
      marginTop: Spacing.md,
      alignSelf: 'center',
    },
    headerBlock: {
      gap: Spacing.xl,
    },
    modeSwitch: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      backgroundColor: 'rgba(255,255,255,0.75)',
      borderRadius: Radius.pill,
      padding: Spacing.xs,
      gap: Spacing.xs,
    },
    modeSwitchButton: {
      flex: 1,
      borderRadius: Radius.pill,
      paddingVertical: Spacing.sm,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Spacing.xs,
    },
    modeSwitchButtonActive: {
      backgroundColor: '#FFFFFF',
      shadowColor: 'rgba(10, 10, 10, 0.08)',
      shadowOpacity: 1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    modeSwitchLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: 'rgba(30,34,53,0.55)',
    },
    modeSwitchLabelActive: {
      color: C.ink,
    },
    businessCardWrapper: {
      marginTop: Spacing.md,
      width: '100%',
    },
    businessCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      width: '100%',
      shadowColor: 'rgba(42, 16, 90, 0.4)',
      shadowOpacity: 0.5,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    businessIcon: { width: 48, height: 48, resizeMode: 'contain' },
    businessTitle: {
      fontWeight: '800',
      color: '#FFFFFF',
      fontSize: 16,
    },
    businessSubtitle: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: 13,
    },
    businessCTA: {
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.6)',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      backgroundColor: 'rgba(255,255,255,0.15)',
    },
    businessCTAText: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    driverReminder: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.25)',
      padding: Spacing.lg,
      gap: Spacing.sm,
      backgroundColor: 'transparent',
      width: '100%',
    },
    driverReminderTitle: { fontWeight: '800', color: C.ink, fontSize: 16 },
    driverReminderSubtitle: { color: C.gray600, fontSize: 12, lineHeight: 18 },
    driverReminderButton: { alignSelf: 'flex-start' },
    passengerHeroSection: {
      width: '100%',
      gap: Spacing.lg,
    },
    passengerHeroSectionMobile: {
      flexDirection: 'column',
    },
    passengerHeroSectionWide: {
      flexDirection: 'row',
      alignItems: 'stretch',
      flexWrap: 'nowrap',
      gap: Spacing.lg,
    },
    heroCard: {
      backgroundColor: C.secondary,
      borderRadius: Radius.lg,
      padding: Spacing.xl,
      gap: Spacing.lg,
      borderWidth: 1,
      borderColor: C.secondaryLight,
      ...(S.floating as object),
      flexShrink: 1,
    },
    heroCardMobile: {
      width: '100%',
    },
    heroCardWide: {
      flex: 1,
      minWidth: 280,
    },
    heroTexts: {
      gap: Spacing.sm,
    },
    heroGreeting: {
      color: '#FFFFFF',
      fontSize: 24,
      fontWeight: Typography.heading.fontWeight,
      letterSpacing: Typography.heading.letterSpacing,
    },
    heroSubtitle: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 14,
      lineHeight: 20,
    },
    heroPersonalized: {
      color: 'rgba(255,255,255,0.8)',
      fontSize: 12,
      lineHeight: 18,
    },
    heroButton: {
      alignSelf: 'flex-start',
      borderRadius: Radius.md,
      overflow: 'hidden',
    },
    heroButtonText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 14,
    },
    heroStatsRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      flexWrap: 'wrap',
    },
    heroStat: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: Radius.md,
      padding: Spacing.md,
      gap: 4,
    },
    heroStatValue: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '800',
    },
    heroStatLabel: {
      color: 'rgba(255,255,255,0.8)',
      fontSize: 12,
    },
    driverNextRideCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.35)',
      padding: Spacing.lg,
      gap: Spacing.sm,
      backgroundColor: '#FFFFFF',
      width: '100%',
    },
    driverNextRideHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    driverNextRideLabel: {
      fontWeight: '700',
      color: C.ink,
      fontSize: 15,
    },
    driverNextRideMeta: {
      color: C.gray600,
      fontSize: 12,
    },
    driverNextRideRoute: {
      fontSize: 16,
      fontWeight: '700',
      color: C.ink,
    },
    driverNextRideRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    driverNextRideInfo: {
      color: C.gray600,
      fontSize: 13,
    },
    driverNextRideAction: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: Radius.md,
      backgroundColor: C.primaryLight,
    },
    driverNextRideActionText: {
      color: C.primaryDark,
      fontWeight: '700',
      fontSize: 13,
    },
    driverNextRideEmpty: {
      color: C.gray600,
      fontSize: 13,
      lineHeight: 18,
    },
    driverSummaryCard: {
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      gap: Spacing.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.3)',
      backgroundColor: 'rgba(255,255,255,0.9)',
      width: '100%',
    },
    driverSummaryTitle: {
      fontWeight: '700',
      color: C.ink,
      fontSize: 15,
    },
    driverSummaryLine: {
      color: C.gray600,
      fontSize: 13,
      lineHeight: 18,
    },
    driverFlowCard: {
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      gap: Spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.2)',
      backgroundColor: 'rgba(255,255,255,0.95)',
      width: '100%',
    },
    driverSecurityCard: {
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      gap: Spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.35)',
      backgroundColor: 'rgba(255,255,255,0.9)',
      width: '100%',
    },
    driverSecurityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    driverSecurityText: {
      flex: 1,
      color: C.gray600,
      fontSize: 12,
      lineHeight: 18,
    },
    driverSecurityButton: {
      alignSelf: 'flex-start',
    },
    sectionHeader: {
      marginTop: Spacing.xl,
      gap: 4,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: Typography.subheading.fontWeight,
      letterSpacing: Typography.subheading.letterSpacing,
      color: C.ink,
    },
    sectionSubtitle: {
      color: C.gray600,
      fontSize: 13,
    },
    filtersPanel: {
      backgroundColor: C.card,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.gray200,
      padding: Spacing.lg,
      gap: Spacing.md,
      ...(S.card as object),
    },
    filtersPanelMobile: {
      width: '100%',
    },
    filtersPanelDesktop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      width: '100%',
      columnGap: Spacing.lg,
      rowGap: Spacing.lg,
    },
    filterGroup: {
      gap: Spacing.xs,
    },
    filterGroupDesktop: {
      flex: 1,
      minWidth: 220,
    },
    filterSectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: C.gray600,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: Spacing.xs,
    },
    filterChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    filters: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    alertCard: {
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      gap: Spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(35,75,124,0.18)',
      width: '100%',
    },
    alertHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    alertTitle: {
      fontWeight: '700',
      color: C.ink,
      fontSize: 16,
    },
    alertCounter: {
      color: C.gray500,
      fontSize: 12,
    },
    alertRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      paddingVertical: Spacing.xs,
    },
    alertRowTitle: {
      color: C.ink,
      fontWeight: '700',
      fontSize: 14,
    },
    alertRowBody: {
      color: C.gray600,
      fontSize: 12,
      lineHeight: 16,
    },
    alertButton: {
      backgroundColor: C.primary,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radius.pill,
    },
    alertButtonText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 12,
    },
    alertFooter: {
      color: C.gray500,
      fontSize: 12,
    },
    personalizedTips: {
      backgroundColor: C.card,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.gray200,
      padding: Spacing.lg,
      gap: Spacing.sm,
      ...(S.card as object),
      width: '100%',
    },
    personalizedTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: C.ink,
    },
    personalizedList: {
      gap: Spacing.xs,
    },
    personalizedItem: {
      color: C.gray600,
      fontSize: 13,
      lineHeight: 18,
    },
    mapHomeSection: {
      gap: Spacing.sm,
    },
    mapHomeSectionMobile: {
      width: '100%',
    },
    mapHomeSectionWide: {
      flex: 1,
      minWidth: 320,
    },
    filterChip: {
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radius.pill,
      borderWidth: 1,
    },
    filterChipIdle: {
      backgroundColor: C.gray50,
      borderColor: C.gray200,
    },
    filterChipSelected: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    filterChipText: {
      fontSize: 13,
      fontWeight: '700',
    },
    filterChipTextIdle: { color: C.gray600 },
    filterChipTextSelected: { color: '#FFFFFF' },
    reviewsCard: {
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.25)',
      gap: Spacing.md,
      width: '100%',      
    },
    reviewsHeader: {
      gap: Spacing.xs,
    },
    reviewsCardTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: C.ink,
    },
    reviewsCardSubtitle: {
      color: C.gray600,
      fontSize: 12,
    },
    reviewsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.xs,
    },
    reviewsRoute: {
      color: C.ink,
      fontWeight: '700',
    },
    reviewsMeta: {
      color: C.gray600,
      fontSize: 12,
    },
    reviewsButton: {
      backgroundColor: C.primary,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.pill,
    },
    reviewsButtonText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 13,
    },
    reviewsMore: {
      color: C.gray500,
      fontSize: 12,
    },
    reservationsCard: {
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.2)',
      gap: Spacing.md,
      width: '100%',
    },
    reservationsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    reservationsTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: C.ink,
    },
    reservationsSubtitle: {
      color: C.gray500,
      fontSize: 12,
    },
    reservationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: C.gray150,
    },
    reservationRoute: { fontWeight: '700', color: C.ink },
    reservationMeta: { color: C.gray600, fontSize: 12 },
    reservationSeats: {
      backgroundColor: C.secondaryLight,
      color: C.secondary,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: Radius.pill,
      fontWeight: '700',
    },
    rideCardWrapper: {
      borderRadius: Radius.lg,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.28)',
      backgroundColor: 'transparent',
      ...(S.card as object),
    },
    rideCard: {
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      gap: Spacing.md,
      backgroundColor: 'transparent',
    },
    ridePressable: {
      borderRadius: Radius.lg,
    },
    rideCardHighlighted: {
      borderColor: C.primary,
      shadowColor: C.primary,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    rideHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Spacing.md,
    },
    driverRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      flex: 1,
    },
    driverAvatar: {
      width: 52,
      height: 52,
      borderRadius: Radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    driverAvatarImage: {
      width: '100%',
      height: '100%',
    },
    driverInfo: {
      flex: 1,
      gap: Spacing.xs,
    },
    driverTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flexWrap: 'wrap',
    },
    driverName: {
      color: C.ink,
      fontWeight: '700',
      fontSize: 16,
      flexShrink: 1,
    },
    driverBadgePill: {
      backgroundColor: C.primaryLight,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: Radius.pill,
    },
    driverBadgeText: {
      color: C.primaryDark,
      fontSize: 11,
      fontWeight: '700',
    },
    driverMetaText: {
      color: C.gray600,
      fontSize: 12,
    },
    driverRewardText: {
      color: C.secondary,
      fontSize: 11,
      fontWeight: '600',
    },
    driverReviewsLink: {
      marginTop: Spacing.xs,
    },
    driverReviewsText: {
      color: C.secondary,
      fontSize: 12,
      fontWeight: '700',
    },
    rideRoute: {
      fontSize: 17,
      fontWeight: '800',
      color: C.ink,
      letterSpacing: Typography.subheading.letterSpacing,
      marginTop: Spacing.sm,
    },
    rideHeaderRight: {
      alignItems: 'flex-end',
      gap: Spacing.xs,
    },
    rideHeaderRightMeta: {
      color: C.gray500,
      fontSize: 12,
    },
    statusPill: {
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    statusPillAvailable: {
      backgroundColor: C.primaryLight,
    },
    statusPillMine: {
      backgroundColor: C.secondaryLight,
    },
    statusPillFull: {
      backgroundColor: C.gray200,
    },
    statusPillPast: {
      backgroundColor: C.gray150,
    },
    statusPillText: {
      fontSize: 12,
      fontWeight: '700',
    },
    statusPillTextAvailable: {
      color: C.primaryDark,
    },
    statusPillTextMine: {
      color: C.secondary,
    },
    statusPillTextFull: {
      color: C.gray600,
    },
    statusPillTextPast: {
      color: C.gray500,
    },
    rideMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: Spacing.lg,
    },
    rideMetaItem: {
      flex: 1,
      gap: 2,
    },
    rideMetaLabel: {
      color: C.gray600,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    rideMetaValue: {
      color: C.ink,
      fontWeight: '700',
      fontSize: 15,
    },
    ridePassengers: {
      backgroundColor: C.gray100,
      borderRadius: Radius.md,
      padding: Spacing.md,
      gap: 4,
    },
    ridePassengersLabel: {
      color: C.gray600,
      fontSize: 12,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    ridePassengersValue: {
      color: C.gray700,
      fontSize: 13,
    },
    vehicleVerifiedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      marginTop: Spacing.sm,
    },
    vehicleVerifiedText: {
      color: C.success,
      fontSize: 12,
      fontWeight: '700',
    },
    statusPast: {
      color: C.gray600,
      fontStyle: 'italic',
      marginTop: Spacing.sm,
    },
    rideActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    policyRow: {
      marginTop: Spacing.sm,
      gap: Spacing.xs,
    },
    policyLabel: {
      color: C.gray600,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    policyText: {
      color: C.gray600,
      fontSize: 12,
      lineHeight: 18,
    },
    cancellationBadge: {
      marginTop: Spacing.xs,
      backgroundColor: C.warningLight,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
    },
    cancellationBadgeText: {
      color: C.warning,
      fontSize: 12,
      fontWeight: '600',
    },
    actionButton: {
      flex: 1,
      minWidth: 110,
    },
  });

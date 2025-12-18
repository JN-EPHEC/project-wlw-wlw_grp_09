// app/(tabs)/explore.tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';

import { RideMap } from '../../components/ride-map';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RewardBadge } from '@/components/reward-badge';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useDriverSecurity } from '@/hooks/use-driver-security';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import type { AuthSnapshot } from '@/app/services/auth';
import { buildPriceBand, clampPriceToBand, estimatePrice, roughKmFromText, type PriceQuote } from '../services/pricing';
import {
  addRide,
  getRide,
  hasRideDeparted,
  removeRide,
  reserveSeat,
  subscribeRides,
  updateRide,
  type Ride,
  type RidePayload,
} from '../services/rides';
import {
  markAsRead as markNotificationAsRead,
  subscribeNotifications,
  type Notification,
} from '../services/notifications';
import {
  subscribeDriverReviews,
  type Review,
} from '../services/reviews';
import type { PaymentMethod } from '../services/payments';
import { applyRewards, type RewardSnapshot } from '../services/rewards';
import {
  needsFreshSelfie,
  normalizePlate,
  remindVehicleMismatch,
} from '../services/security';
import { getCoordinates, getDistanceKm, getDurationMinutes } from '../services/distance';
import { Colors, Gradients, Shadows, Radius as ThemeRadius, Spacing as ThemeSpacing } from '../ui/theme';
import { getAvatarUrl } from '../ui/avatar';
import { BRUSSELS_COMMUNES } from '@/constants/communes';
import { getCurrentCommune, LocationPermissionError } from '../services/location';

const DefaultColors = {
  primary: '#E63946',
  primaryDark: '#C12F3B',
  primaryLight: '#FFE1D6',
  secondary: '#234B7C',
  secondaryLight: '#E3ECFB',
  ink: '#111827',
  gray900: '#111827',
  gray700: '#374151',
  gray600: '#4B5563',
  gray500: '#6B7280',
  gray400: '#94A3B8',
  gray300: '#D1D5DB',
  gray200: '#E5E7EB',
  gray150: '#F1F5F9',
  gray100: '#F3F4F6',
  gray50: '#FFFFFF',
  bg: '#FFFFFF',
  card: '#FFFFFF',
  danger: '#DC2626',
  success: '#22C55E',
};
const C = (Colors ?? DefaultColors) as typeof DefaultColors;
const S = (Shadows ?? { card: {} }) as typeof Shadows;
const R = ThemeRadius;
const Spacing = ThemeSpacing;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ROUTE_VISUALS = [
  {
    key: 'ephec woluwe',
    line: Colors.primary,
    glow: 'rgba(255,147,83,0.4)',
    startDot: Colors.primary,
    endDot: Colors.secondary,
  },
  {
    key: 'ephec delta',
    line: '#4C6EF5',
    glow: 'rgba(76,110,245,0.4)',
    startDot: '#4C6EF5',
    endDot: '#7B61FF',
  },
  {
    key: 'ephec lln',
    line: '#16A34A',
    glow: 'rgba(22,163,74,0.35)',
    startDot: '#16A34A',
    endDot: '#22C55E',
  },
  {
    key: 'ephec schaerbeek',
    line: '#C026D3',
    glow: 'rgba(192,38,211,0.35)',
    startDot: '#C026D3',
    endDot: '#EC4899',
  },
] as const;

const defaultRouteVisual = {
  line: '#FFFFFF',
  glow: 'rgba(255,255,255,0.35)',
  startDot: Colors.primary,
  endDot: Colors.secondary,
};
const HERO_MAP_IMAGE = require('../../assets/images/publish-map.png');

const RESULT_FILTERS = [
  { id: 'recommended', label: 'Pertinence' },
  { id: 'earliest', label: 'Plus tôt' },
  { id: 'price', label: 'Prix ↑' },
  { id: 'distance', label: 'Distance' },
] as const;

type ResultFilterId = (typeof RESULT_FILTERS)[number]['id'];
type ResultsFilterAnchor = 'search';
type ExploreParams = { edit?: string; depart?: string; campus?: string };

const derivePseudoRating = (ride: Ride) => {
  const seed = ride.driver.length + ride.destination.length;
  const base = 4 + (seed % 10) / 20;
  return Math.min(4.9, Math.round(base * 10) / 10);
};

type PriceFilterId = 'all' | 'lt4' | '4to6' | 'gt6';
const PRICE_FILTERS: { id: PriceFilterId; label: string; predicate: (price: number) => boolean }[] = [
  { id: 'all', label: 'Tous', predicate: () => true },
  { id: 'lt4', label: '<4€', predicate: (price) => price < 4 },
  { id: '4to6', label: '4€-6€', predicate: (price) => price >= 4 && price <= 6 },
  { id: 'gt6', label: '>6€', predicate: (price) => price > 6 },
];

type DurationFilterId = 'all' | 'short' | 'medium' | 'long';
const DURATION_FILTERS: { id: DurationFilterId; label: string; predicate: (minutes: number) => boolean }[] = [
  { id: 'all', label: 'Toutes', predicate: () => true },
  { id: 'short', label: '<30 min', predicate: (minutes) => minutes > 0 && minutes < 30 },
  { id: 'medium', label: '30-45 min', predicate: (minutes) => minutes >= 30 && minutes <= 45 },
  { id: 'long', label: '>45 min', predicate: (minutes) => minutes > 45 },
];

type HourFilterId = 'all' | 'morning' | 'afternoon' | 'evening' | 'night';
const HOUR_FILTERS: { id: HourFilterId; label: string; range: [number, number] | null }[] = [
  { id: 'all', label: 'Toutes', range: null },
  { id: 'morning', label: 'Matin', range: [5 * 60, 11 * 60] },
  { id: 'afternoon', label: 'Après-midi', range: [11 * 60, 16 * 60] },
  { id: 'evening', label: 'Soir', range: [16 * 60, 21 * 60] },
  { id: 'night', label: 'Nuit', range: [21 * 60, 24 * 60] },
];

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map((part) => parseInt(part, 10) || 0);
  return hours * 60 + minutes;
};

const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
type QuickSuggestion = {
  label: string;
  depart: string;
  destination: string;
  time: string;
  seats: string;
};

export default function ExplorePublish() {
  const session = useAuthSession();
  const params = useLocalSearchParams<ExploreParams>();
  const passengerOnly = session.isPassenger && !session.isDriver;
  const initialDepart = typeof params.depart === 'string' ? params.depart : undefined;
  const initialDestination = typeof params.campus === 'string' ? params.campus : undefined;
  const editId = typeof params.edit === 'string' ? params.edit : undefined;
  if (passengerOnly) {
    return (
      <PassengerPublishScreen
        session={session}
        initialDepart={initialDepart}
        initialDestination={initialDestination}
      />
    );
  }
  return <DriverPublishScreen session={session} params={{ edit: editId }} />;
}

function DriverPublishScreen({ session, params }: { session: AuthSnapshot; params: { edit?: string } }) {
  const router = useRouter();
  const driverSecurity = useDriverSecurity(session.email);
  const contentBottomInset = useTabBarInset(Spacing.xl);
  const openDriverVerification = useCallback(() => {
    router.push('/driver-verification');
  }, [router]);

  const [driver, setDriver] = useState('');
  const [plate, setPlate] = useState('');
  const [depart, setDepart] = useState('');
  const [destination, setDestination] = useState('');
  const [time, setTime] = useState('');
  const [seats, setSeats] = useState('1');
  const [rides, setRides] = useState<Ride[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rewardSnapshot, setRewardSnapshot] = useState<RewardSnapshot | null>(null);
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [priceTouched, setPriceTouched] = useState(false);
  const [pricingMode, setPricingMode] = useState<'single' | 'double'>('single');
  const [customPriceInput, setCustomPriceInput] = useState('0.00');

  const myRides = useMemo(
    () =>
      rides
        .filter((ride) => ride.ownerEmail === session.email)
        .sort((a, b) => a.departureAt - b.departureAt),
    [rides, session.email]
  );
  const completedRides = useMemo(
    () => myRides.filter((ride) => hasRideDeparted(ride)).length,
    [myRides]
  );
  const ratingSummary = useMemo(() => {
    if (reviews.length === 0) return { average: 0, count: 0 };
    const total = reviews.reduce((acc, review) => acc + review.rating, 0);
    return { average: Math.round((total / reviews.length) * 10) / 10, count: reviews.length };
  }, [reviews]);

  const unreadNotifications = useMemo(
    () => notifications.filter((notif) => !notif.read),
    [notifications]
  );

  const populateForm = useCallback((draft: Ride) => {
    setEditingId(draft.id);
    setDriver(draft.driver);
    setPlate(draft.plate);
    setDepart(draft.depart);
    setDestination(draft.destination);
    setTime(draft.time);
    setSeats(String(draft.seats));
    setCustomPrice(draft.price);
    setCustomPriceInput(draft.price.toFixed(2));
    const band = buildPriceBand(roughKmFromText(draft.depart, draft.destination), draft.seats);
    setPricingMode(draft.price >= band.double * 0.9 ? 'double' : 'single');
    setPriceTouched(true);
  }, []);

  const acknowledgeNotification = useCallback(
    (id: string) => {
      if (!session.email) return;
      markNotificationAsRead(session.email, id);
    },
    [session.email]
  );

  useEffect(() => {
    const unsubscribe = subscribeRides(setRides);
    return unsubscribe;
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
      setReviews([]);
      return;
    }
    const unsubscribe = subscribeDriverReviews(session.email, setReviews);
    return unsubscribe;
  }, [session.email]);

  useEffect(() => {
    if (!session.email) {
      setRewardSnapshot(null);
      return;
    }
    const snapshot = applyRewards(session.email, {
      completedRides,
      averageRating: ratingSummary.average,
      reviewCount: ratingSummary.count,
    });
    setRewardSnapshot(snapshot);
  }, [session.email, completedRides, ratingSummary.average, ratingSummary.count]);

  useEffect(() => {
    if (!session.name) return;
    if (driver.trim().length > 0) return;
    setDriver(session.name);
  }, [session.name, driver]);

  useEffect(() => {
    if (!driverSecurity) return;
    if (editingId) return;
    const storedPlate = driverSecurity.vehicle.plate ?? '';
    if (!storedPlate) return;
    const storedNormalized = normalizePlate(storedPlate);
    const currentNormalized = normalizePlate(plate);
    if (storedNormalized && storedNormalized !== currentNormalized) {
      setPlate(storedPlate);
    }
  }, [driverSecurity, driverSecurity?.vehicle.plate, driverSecurity?.vehicle.updatedAt, editingId, plate]);

  const km = useMemo(() => roughKmFromText(depart, destination), [depart, destination]);
  const seatsCount = useMemo(() => {
    const parsed = Number(seats);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.min(4, Math.round(parsed)));
  }, [seats]);
  const priceQuote = useMemo<PriceQuote>(() => estimatePrice(km, { seats: seatsCount }), [km, seatsCount]);
  const priceBand = useMemo(() => buildPriceBand(km, seatsCount), [km, seatsCount]);
  const commissionPerPassenger = priceQuote.commissionPerPassenger;
  const commissionTotal = +(commissionPerPassenger * seatsCount).toFixed(2);
  const driverNetPerPassengerRecommended = priceQuote.driverTakeHomePerPassenger;
  const driverNetPerPassenger = +(customPrice - commissionPerPassenger).toFixed(2);
  const driverNetTotal = +(driverNetPerPassenger * seatsCount).toFixed(2);
  const driverNetTotalRecommended = +(driverNetPerPassengerRecommended * seatsCount).toFixed(2);
  const rideTotal = +(customPrice * seatsCount).toFixed(2);

  useEffect(() => {
    setCustomPrice((prev) => clampPriceToBand(prev || priceBand.suggested, km, seatsCount));
  }, [priceBand.min, priceBand.max, priceBand.suggested, km, seatsCount]);

  useEffect(() => {
    if (editingId || priceTouched) return;
    setCustomPrice(priceBand.suggested);
    setPricingMode('single');
  }, [priceBand.suggested, editingId, priceTouched]);

  useEffect(() => {
    setCustomPriceInput(customPrice.toFixed(2));
  }, [customPrice]);

  const onPriceInputChange = (value: string) => {
    setCustomPriceInput(value);
    const sanitized = value.replace(',', '.');
    const parsed = parseFloat(sanitized);
    if (!Number.isFinite(parsed)) {
      return;
    }
    setPriceTouched(true);
    setCustomPrice(clampPriceToBand(parsed, km, seatsCount));
  };

  const applyPricingMode = (mode: 'single' | 'double') => {
    setPricingMode(mode);
    setPriceTouched(true);
    const base = mode === 'double' ? priceBand.double : priceBand.suggested;
    setCustomPrice(clampPriceToBand(base, km, seatsCount));
  };
  const firstName = useMemo(() => {
    const raw = session.name ? session.name.split(' ')[0] : 'conducteur';
    if (!raw) return 'Conducteur';
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }, [session.name]);

  const quickSuggestions = useMemo<QuickSuggestion[]>(
    () => [
      {
        label: 'Navette Etterbeek → LLN (07:45)',
        depart: 'Etterbeek',
        destination: 'EPHEC Louvain-la-Neuve',
        time: '07:45',
        seats: '3',
      },
      {
        label: 'Retour Woluwé (17:30)',
        depart: 'EPHEC Woluwé',
        destination: 'Etterbeek',
        time: '17:30',
        seats: '2',
      },
      {
        label: 'Trajet express vers ULB (08:10)',
        depart: 'Ixelles',
        destination: 'ULB - Solbosch',
        time: '08:10',
        seats: '3',
      },
    ],
    []
  );

  const impactPoints = useMemo(
    () => [
      { icon: 'fuelpump.fill', text: 'Optimise tes frais de carburant à chaque trajet.' },
      { icon: 'bell.fill', text: 'Tes passagers reçoivent une notification instantanée.' },
      { icon: 'wallet.pass.fill', text: 'Ton wallet est crédité automatiquement après le trajet.' },
    ],
    []
  );

  const applySuggestion = useCallback((suggestion: QuickSuggestion) => {
    setDepart(suggestion.depart);
    setDestination(suggestion.destination);
    setTime(suggestion.time);
    setSeats(suggestion.seats);
  }, []);

  const pricingBreakdown = useMemo(
    () => [
      {
        label: 'Carburant estimé',
        description: `${priceQuote.assumptions.consumptionPer100Km.toFixed(1)} L/100km • €${priceQuote.assumptions.fuelPricePerLitre.toFixed(3)}/L`,
        amount: priceQuote.fuelCost,
      },
      {
        label: 'Entretien & usure',
        description: `€${priceQuote.assumptions.maintenancePerKm.toFixed(2)} par km`,
        amount: priceQuote.maintenanceCost,
      },
      {
        label: 'Commission CampusRide',
        description: `${(priceQuote.assumptions.commissionRate * 100).toFixed(0)}% pour l’assurance, support et plateforme`,
        amount: commissionTotal,
      },
      {
        label: 'Net conducteur',
        description: `€${driverNetPerPassenger.toFixed(2)} / passager`,
        amount: driverNetTotal,
      },
    ],
    [priceQuote, commissionTotal, driverNetPerPassenger, driverNetTotal]
  );

  const handleRemoveRide = useCallback((ride: Ride) => {
    try {
      removeRide(ride.id);
      Alert.alert('Trajet supprimé ✅', 'Ton annonce a été retirée.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Suppression impossible pour ce trajet.';
      Alert.alert('Action impossible', message);
    }
  }, []);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!driver.trim()) e.driver = 'Nom conducteur requis';
    if (!plate.trim()) {
      e.plate = 'Plaque requise';
    } else if (!/^[A-Za-z0-9-]{4,10}$/.test(plate.trim())) {
      e.plate = 'Plaque invalide (ex. ABC-123)';
    }
    if (!depart.trim()) e.depart = 'Lieu de départ requis';
    if (!destination.trim()) e.destination = 'Destination requise';
    if (!isTime(time)) e.time = 'Heure au format HH:MM';
    const s = Number(seats);
    if (!Number.isInteger(s) || s < 1 || s > 3) e.seats = 'Places : 1 à 3';
    if (customPrice < priceBand.min || customPrice > priceBand.max) {
      e.price = `Prix entre €${priceBand.min.toFixed(2)} et €${priceBand.max.toFixed(2)} par passager`;
    }
    if (!session.email) e.session = 'Connecte-toi pour publier un trajet.';
    return e;
  }, [driver, plate, depart, destination, time, seats, customPrice, priceBand.min, priceBand.max, session.email]);

  const isValid = Object.keys(errors).filter((key) => key !== 'session').length === 0;

  const securityBlockingMessage = useMemo(() => {
    if (!session.isDriver) return null;
    if (!driverSecurity) return 'Chargement de la vérification en cours…';
    if (driverSecurity.blockers.requiresLicense || driverSecurity.blockers.requiresVehicle) {
      return 'Ajoute ton permis et une photo de ton véhicule avant de publier un trajet.';
    }
    if (needsFreshSelfie(driverSecurity)) {
      return 'Prends un selfie de vérification pour confirmer que tu es bien le conducteur.';
    }
    return null;
  }, [driverSecurity, session.isDriver]);

  useEffect(() => {
    if (!params.edit) {
      if (editingId) setEditingId(null);
      return;
    }
    const draft = getRide(String(params.edit));
    if (!draft) {
      Alert.alert('Trajet introuvable', "Le trajet sélectionné n'existe plus.");
      setEditingId(null);
      return;
    }
    if (draft.ownerEmail !== session.email) {
      Alert.alert('Accès refusé', 'Tu ne peux modifier que tes propres trajets.');
      setEditingId(null);
      return;
    }
    populateForm(draft);
  }, [params.edit, session.email, populateForm, editingId]);

  const resetForm = () => {
    setEditingId(null);
    setDriver(session.name ?? '');
    setPlate(driverSecurity?.vehicle.plate ?? '');
    setDepart('');
    setDestination('');
    setTime('');
    setSeats('1');
    setPricingMode('single');
    setPriceTouched(false);
    setCustomPrice(priceBand.suggested);
    router.replace('/(tabs)/explore');
  };

  const submit = () => {
    if (!driverSecurity) {
      Alert.alert('Vérification en cours', 'Patiente un instant avant de publier ton trajet.');
      return;
    }
    if (driverSecurity.blockers.requiresLicense || driverSecurity.blockers.requiresVehicle) {
      Alert.alert(
        'Complète ta vérification',
        'Ajoute ton permis et une photo de ton véhicule pour assurer la sécurité de tes passagers.',
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Ouvrir la vérification', onPress: openDriverVerification },
        ]
      );
      return;
    }
    if (needsFreshSelfie(driverSecurity)) {
      Alert.alert(
        'Selfie requis',
        'Prends un selfie de vérification avant de proposer un nouveau trajet.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Prendre un selfie', onPress: openDriverVerification },
        ]
      );
      return;
    }
    if (!isValid) {
      const firstError = Object.values(errors)[0] ?? 'Vérifie les champs.';
      return Alert.alert('Formulaire incomplet', firstError);
    }

    if (!session.email) {
      return router.push('/sign-up');
    }

    if (driverSecurity.vehicle.plate) {
      const storedPlate = normalizePlate(driverSecurity.vehicle.plate);
      const currentPlate = normalizePlate(plate);
      if (storedPlate && currentPlate && storedPlate !== currentPlate) {
        remindVehicleMismatch();
        return;
      }
    }

    const finalPrice = clampPriceToBand(customPrice, km, seatsCount);
    const payload: RidePayload = {
      id: editingId ?? Date.now().toString(),
      driver: driver.trim(),
      plate: plate.trim(),
      depart: depart.trim(),
      destination: destination.trim(),
      time,
      seats: Number(seats),
      price: finalPrice,
      ownerEmail: session.email,
      pricingMode,
    };

    try {
      if (editingId) {
        updateRide(editingId, payload);
        Alert.alert('Trajet mis à jour ✅', 'Ta fiche trajet a été actualisée.');
      } else {
        addRide(payload);
        Alert.alert('Trajet publié ✅', 'Les étudiants à proximité verront ton annonce.');
      }
      resetForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
      Alert.alert('Action impossible', message);
    }
  };

  return (
    <AppBackground style={styles(C, S).screen}>
      <SafeAreaView style={styles(C, S).safe}>
        <ScrollView
          contentContainerStyle={[styles(C, S).container, { paddingBottom: contentBottomInset }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles(C, S).header}>
          <View style={styles(C, S).headerTitleRow}>
            <IconSymbol name="map.fill" size={20} color={C.primary} />
            <Text style={styles(C, S).headerTitle}>Publier un trajet</Text>
          </View>
          <Text style={styles(C, S).headerSub}>
            {`Merci ${firstName}, chaque trajet partagé aide la communauté à se déplacer.`}
          </Text>
        </View>

        <GradientBackground colors={Gradients.card} style={[styles(C, S).card, styles(C, S).introCard]}>
          <Text style={styles(C, S).introTitle}>Ton impact sur CampusRide</Text>
          <Text style={styles(C, S).introSubtitle}>
            Publie un trajet en 3 étapes : définis ton parcours, vérifie l’estimation, confirme.
            Chaque réservation crédite ton wallet automatiquement.
          </Text>
          <View style={styles(C, S).introSteps}>
            {impactPoints.map((point) => (
              <View key={point.text} style={styles(C, S).introRow}>
                <IconSymbol name={point.icon as any} size={18} color={C.primary} />
                <Text style={styles(C, S).introText}>{point.text}</Text>
              </View>
            ))}
          </View>
        </GradientBackground>

        {session.isDriver && securityBlockingMessage ? (
          <GradientBackground colors={Gradients.soft} style={[styles(C, S).card, styles(C, S).securityNotice]}>
            <View style={styles(C, S).securityNoticeRow}>
              <IconSymbol name="exclamationmark.triangle" size={20} color={C.warning} />
              <Text style={styles(C, S).securityNoticeTitle}>Vérification requise</Text>
            </View>
            <Text style={styles(C, S).securityNoticeText}>{securityBlockingMessage}</Text>
            <GradientButton
              title="Compléter maintenant"
              onPress={openDriverVerification}
              size="sm"
              style={styles(C, S).securityNoticeButton}
            />
          </GradientBackground>
        ) : null}

        <GradientBackground colors={Gradients.card} style={[styles(C, S).card, styles(C, S).quickCard]}>
          <Text style={styles(C, S).quickTitle}>Besoin d’inspiration ?</Text>
          <Text style={styles(C, S).quickSubtitle}>Sélectionne un scénario pour pré-remplir le formulaire.</Text>
          <View style={styles(C, S).quickList}>
            {quickSuggestions.map((suggestion) => (
              <Pressable
                key={suggestion.label}
                style={styles(C, S).quickChip}
                onPress={() => applySuggestion(suggestion)}
              >
                <IconSymbol name="car.fill" size={16} color={C.gray600} />
                <Text style={styles(C, S).quickChipText}>{suggestion.label}</Text>
              </Pressable>
            ))}
          </View>
        </GradientBackground>

        {km > 0 ? (
          <GradientBackground
            colors={Gradients.card}
            style={[styles(C, S).card, styles(C, S).pricingCard]}
          >
            <View style={styles(C, S).pricingHeader}>
              <IconSymbol name="eurosign.circle.fill" size={22} color={C.primary} />
              <Text style={styles(C, S).pricingTitle}>Estimation tarifaire</Text>
            </View>
            <View style={styles(C, S).pricingSummaryRow}>
              <View style={styles(C, S).pricingSummaryBlock}>
                <Text style={styles(C, S).pricingSummaryLabel}>Distance</Text>
                <Text style={styles(C, S).pricingSummaryValue}>{priceQuote.distanceKm.toFixed(1)} km</Text>
              </View>
              <View style={styles(C, S).pricingSummaryBlock}>
                <Text style={styles(C, S).pricingSummaryLabel}>Tarif conseillé</Text>
                <Text style={styles(C, S).pricingSummaryValue}>€{priceBand.suggested.toFixed(2)} / passager</Text>
              </View>
              <View style={styles(C, S).pricingSummaryBlock}>
                <Text style={styles(C, S).pricingSummaryLabel}>Mon tarif</Text>
                <Text style={styles(C, S).pricingSummaryValue}>€{customPrice.toFixed(2)} / passager</Text>
              </View>
              <View style={styles(C, S).pricingSummaryBlock}>
                <Text style={styles(C, S).pricingSummaryLabel}>Recette totale</Text>
                <Text style={styles(C, S).pricingSummaryValue}>€{rideTotal.toFixed(2)}</Text>
              </View>
            </View>
            <View style={styles(C, S).pricingChipsRow}>
              <View style={styles(C, S).pricingChipDriver}>
                <Text style={styles(C, S).pricingChipTitle}>Net conducteur</Text>
                <Text style={styles(C, S).pricingChipValue}>€{driverNetPerPassenger.toFixed(2)} / passager • €{driverNetTotal.toFixed(2)} / trajet</Text>
                <Text style={styles(C, S).pricingChipHint}>Recommandé : €{driverNetPerPassengerRecommended.toFixed(2)} / passager • €{driverNetTotalRecommended.toFixed(2)} / trajet</Text>
              </View>
              <View style={styles(C, S).pricingChipPlatform}>
                <Text style={styles(C, S).pricingChipTitle}>CampusRide</Text>
                <Text style={styles(C, S).pricingChipValue}>€{commissionPerPassenger.toFixed(2)} / passager • €{commissionTotal.toFixed(2)} / trajet</Text>
              </View>
            </View>
            <View style={styles(C, S).pricingBreakdown}>
              {pricingBreakdown.map((tier) => (
                <View key={tier.label} style={styles(C, S).pricingRow}>
                  <Text style={styles(C, S).pricingRowLabel}>{tier.label}</Text>
                  <View style={styles(C, S).pricingRowContent}>
                    <Text style={styles(C, S).pricingRowValue}>{tier.description}</Text>
                    <Text style={styles(C, S).pricingRowAmount}>€{tier.amount.toFixed(2)}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles(C, S).pricingHint}>
              Les passagers voient ce prix avant de confirmer leur paiement sécurisé.
            </Text>
          </GradientBackground>
        ) : null}

        <GradientBackground colors={Gradients.card} style={[styles(C, S).card, styles(C, S).notificationsCard]}>
          <View style={styles(C, S).notificationsHeader}>
            <Text style={styles(C, S).notificationsTitle}>Activité passagers</Text>
            <Text style={styles(C, S).notificationsSubtitle}>
              Mises à jour sur les réservations reçues pour tes trajets durant les dernières 24h.
            </Text>
          </View>
          {unreadNotifications.length > 0 ? (
            unreadNotifications.slice(0, 3).map((notif) => (
              <View key={notif.id} style={styles(C, S).notificationRow}>
                <IconSymbol name="bell.fill" size={18} color={C.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles(C, S).notificationBody}>{notif.body}</Text>
                  <Text style={styles(C, S).notificationTime}>
                    {new Date(notif.createdAt).toLocaleTimeString('fr-BE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Pressable
                  onPress={() => acknowledgeNotification(notif.id)}
                  style={styles(C, S).notificationRead}
                >
                  <Text style={styles(C, S).notificationReadText}>Vu</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles(C, S).notificationEmpty}>
              Aucun nouveau passager pour tes trajets aujourd’hui. Partage ton annonce pour la booster !
            </Text>
          )}
          {notifications.length > unreadNotifications.length ? (
            <Text style={styles(C, S).notificationHint}>
              {notifications.length - unreadNotifications.length} notification(s) déjà consultée(s).
            </Text>
          ) : null}
        </GradientBackground>

        {rewardSnapshot ? (
          <RewardBadge
            snapshot={rewardSnapshot}
            actionLabel={ratingSummary.count > 0 ? 'Voir mes avis' : undefined}
            onPressAction={ratingSummary.count > 0 ? () => router.push('/(tabs)/profile') : undefined}
          />
        ) : null}

        <GradientBackground colors={Gradients.card} style={[styles(C, S).card, styles(C, S).mapCard]}>
          <Text style={styles(C, S).mapTitle}>Carte en temps réel</Text>
          <RideMap rides={rides} />
          <Text style={styles(C, S).mapHint}>
            Les trajets publiés (y compris le tien) apparaissent instantanément pour les étudiants
            connectés.
          </Text>
        </GradientBackground>

        {myRides.length > 0 ? (
          <GradientBackground colors={Gradients.card} style={[styles(C, S).card, styles(C, S).ridesCard]}>
            <Text style={styles(C, S).ridesTitle}>Mes trajets à venir</Text>
            <Text style={styles(C, S).ridesSubtitle}>
              Gère tes annonces avant le départ. Les trajets passés sont archivés automatiquement.
            </Text>
            {myRides.map((ride) => (
              <MyRideRow
                key={ride.id}
                ride={ride}
                C={C}
                S={S}
                onEdit={() => populateForm(ride)}
                onRemove={handleRemoveRide}
              />
            ))}
          </GradientBackground>
        ) : null}

        <GradientBackground colors={Gradients.card} style={[styles(C, S).card, styles(C, S).formCard]}>
          <Field
            label="Nom du conducteur"
            placeholder="Ex. Lina Dupont"
            autoCapitalize="words"
            value={driver}
            onChangeText={setDriver}
            error={errors.driver}
            C={C}
          />
          <Field
            label="Plaque d'immatriculation"
            placeholder="ABC-123"
            autoCapitalize="characters"
            value={plate}
            onChangeText={setPlate}
            error={errors.plate}
            C={C}
          />
          <Field
            label="Lieu de départ"
            placeholder="Ex. Etterbeek"
            value={depart}
            onChangeText={setDepart}
            error={errors.depart}
            C={C}
          />
          <Field
            label="Destination"
            placeholder="Ex. ULB - Solbosch"
            value={destination}
            onChangeText={setDestination}
            error={errors.destination}
            C={C}
          />
          <Field
            label="Heure (HH:MM)"
            placeholder="08:15"
            inputMode="numeric"
            value={time}
            onChangeText={setTime}
            error={errors.time}
            C={C}
          />
          <Field
            label="Places disponibles"
            placeholder="1"
            inputMode="numeric"
            value={seats}
            onChangeText={setSeats}
            error={errors.seats}
            C={C}
          />

          <View style={styles(C, S).priceSection}>
            <Text style={styles(C, S).priceLabel}>Tarif par passager</Text>
            <View style={styles(C, S).priceModeRow}>
              <GradientButton
                title="Aller simple"
                size="sm"
                variant={pricingMode === 'single' ? 'cta' : 'soft'}
                onPress={() => applyPricingMode('single')}
                style={styles(C, S).priceModeButton}
                accessibilityRole="button"
              />
              <GradientButton
                title="Aller + retour"
                size="sm"
                variant={pricingMode === 'double' ? 'cta' : 'soft'}
                onPress={() => applyPricingMode('double')}
                style={styles(C, S).priceModeButton}
                accessibilityRole="button"
              />
            </View>
            <View style={styles(C, S).priceInputRow}>
              <Text style={styles(C, S).priceInputPrefix}>€</Text>
              <TextInput
                value={customPriceInput}
                onChangeText={onPriceInputChange}
                keyboardType="decimal-pad"
                style={styles(C, S).priceInput}
              />
            </View>
            <Text style={styles(C, S).priceBandText}>
              Autorisé : €{priceBand.min.toFixed(2)} – €{priceBand.max.toFixed(2)} par passager
            </Text>
            {errors.price ? <Text style={styles(C, S).error}>{errors.price}</Text> : null}
          </View>

          <View style={styles(C, S).preview}>
            <Text style={styles(C, S).previewText}>
              Mon tarif : <Text style={styles(C, S).price}>€{customPrice.toFixed(2)}</Text> / passager • Total €{rideTotal.toFixed(2)}
            </Text>
            <Text style={styles(C, S).previewHint}>
              Tarif conseillé : €{priceBand.suggested.toFixed(2)} • Aller + retour : €{priceBand.double.toFixed(2)}
            </Text>
          </View>

          <GradientButton
            title={editingId ? 'Mettre à jour' : 'Publier'}
            onPress={submit}
            disabled={!isValid || !!errors.session || !!securityBlockingMessage}
            style={styles(C, S).cta}
            accessibilityRole="button"
            fullWidth
          />
          {editingId ? (
            <Pressable onPress={resetForm} style={styles(C, S).ctaGhost}>
              <Text style={styles(C, S).ctaGhostText}>Annuler la modification</Text>
            </Pressable>
          ) : null}
          {errors.session ? <Text style={styles(C, S).error}>{errors.session}</Text> : null}
        </GradientBackground>
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

function PassengerPublishScreen({
  session,
  initialDepart,
  initialDestination,
}: {
  session: AuthSnapshot;
  initialDepart?: string;
  initialDestination?: string;
}) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView | null>(null);
  const tabBarInset = useTabBarInset(Spacing.xl);
  const pinchScale = useRef(new Animated.Value(1)).current;
  const baseScale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);
  const mapScale = Animated.multiply(baseScale, pinchScale);
  const MIN_MAP_SCALE = 1;
  const MAX_MAP_SCALE = 2.4;
  const pinchGestureHandler = useMemo(
    () =>
      Animated.event([{ nativeEvent: { scale: pinchScale } }], {
        useNativeDriver: true,
      }),
    [pinchScale]
  );
  const handlePinchStateChange = useCallback(
    (event: { nativeEvent: { state: number; scale: number } }) => {
      if (event.nativeEvent.state === State.END || event.nativeEvent.state === State.CANCELLED) {
        lastScale.current *= event.nativeEvent.scale;
        if (lastScale.current > MAX_MAP_SCALE) lastScale.current = MAX_MAP_SCALE;
        if (lastScale.current < MIN_MAP_SCALE) lastScale.current = MIN_MAP_SCALE;
        baseScale.setValue(lastScale.current);
        pinchScale.setValue(1);
      }
      if (event.nativeEvent.state === State.BEGAN) {
        pinchScale.setValue(1);
      }
    },
    [baseScale, pinchScale, MAX_MAP_SCALE, MIN_MAP_SCALE]
  );
  const formatDateLabel = useCallback(
    (date: Date) =>
      date.toLocaleDateString('fr-BE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    []
  );
  const defaultTomorrow = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next;
  }, []);
  const [fromCampus, setFromCampus] = useState(initialDepart || 'Ixelles');
  const [toCampus, setToCampus] = useState(initialDestination || 'EPHEC Woluwe');
  const [selectedDate, setSelectedDate] = useState(defaultTomorrow);
  const [travelTime, setTravelTime] = useState('09:00');
  const [showDestList, setShowDestList] = useState(false);
  const [showFromList, setShowFromList] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(selectedDate.getMonth());
  const [calendarYear, setCalendarYear] = useState(selectedDate.getFullYear());
  const campusOptions = ['EPHEC Woluwe', 'EPHEC Delta', 'EPHEC Louvain-la-Neuve', 'EPHEC Schaerbeek'];
  const campusFilterOptions = useMemo(() => ['all', ...campusOptions], [campusOptions]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [ridesReady, setRidesReady] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [detectedCommune, setDetectedCommune] = useState<string | null>(null);
  const [preciseDepartCoords, setPreciseDepartCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [searchResults, setSearchResults] = useState<Ride[]>([]);
  const [resultsFilterState, setResultsFilterState] = useState<{
    visible: boolean;
    anchor: ResultsFilterAnchor;
  }>({ visible: false, anchor: 'search' });
  const [activeResultFilter, setActiveResultFilter] = useState<ResultFilterId>('recommended');
  const [onlyAvailableSeats, setOnlyAvailableSeats] = useState(true);
  const [priceFilter, setPriceFilter] = useState<PriceFilterId>('all');
  const [durationFilter, setDurationFilter] = useState<DurationFilterId>('all');
  const [campusFilter, setCampusFilter] = useState<string>('all');
  const [hourFilter, setHourFilter] = useState<HourFilterId>('all');
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchInstance, setSearchInstance] = useState(0);
  const [resultsOffset, setResultsOffset] = useState<number | null>(null);
  const [showAllRides, setShowAllRides] = useState(false);
  const initialSearchTriggered = useRef(false);
  const fromBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialDepart) {
      setFromCampus(initialDepart);
    }
  }, [initialDepart]);

  useEffect(() => {
    if (initialDestination) {
      setToCampus(initialDestination);
    }
  }, [initialDestination]);
  const filterPanelAnchor = resultsFilterState.visible ? resultsFilterState.anchor : null;
  const toggleResultsFilters = useCallback(
    (anchor: ResultsFilterAnchor) => {
      setResultsFilterState((prev) => {
        if (prev.anchor !== anchor) {
          return { anchor, visible: true };
        }
        return { anchor, visible: !prev.visible };
      });
    },
    []
  );
  const [reservingRideId, setReservingRideId] = useState<string | null>(null);
  const [paymentRide, setPaymentRide] = useState<Ride | null>(null);
  const [paymentMethodChoice, setPaymentMethodChoice] = useState<'apple-pay' | 'card'>('apple-pay');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardMasked, setCardMasked] = useState(false);
  const [expiryMonth, setExpiryMonth] = useState<number | null>(null);
  const [expiryYear, setExpiryYear] = useState<number | null>(null);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [pickerExpiryMonth, setPickerExpiryMonth] = useState<number | null>(null);
  const [pickerExpiryYear, setPickerExpiryYear] = useState<number | null>(null);
  useEffect(() => {
    if (expiryMonth && expiryYear) {
      const mm = String(expiryMonth).padStart(2, '0');
      const yy = String(expiryYear % 100).padStart(2, '0');
      setCardExpiry(`${mm}/${yy}`);
    } else {
      setCardExpiry('');
    }
  }, [expiryMonth, expiryYear]);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const getRideDistance = useCallback((ride: Ride) => {
    const distance = getDistanceKm(ride.depart, ride.destination);
    if (!Number.isFinite(distance)) return Number.MAX_SAFE_INTEGER;
    return distance;
  }, []);
  const getRideDuration = useCallback((ride: Ride) => {
    const minutes = getDurationMinutes(ride.depart, ride.destination);
    if (!Number.isFinite(minutes)) return Number.MAX_SAFE_INTEGER;
    return minutes;
  }, []);
  const upcomingHomeRides = useMemo(
    () =>
      rides
        .filter((ride) => !hasRideDeparted(ride))
        .sort((a, b) => a.departureAt - b.departureAt),
    [rides]
  );
  const scrollContentStyle = useMemo(
    () => [passengerStyles.scrollContent, { paddingBottom: tabBarInset }],
    [tabBarInset]
  );
  const routeVisual = useMemo(() => {
    if (!toCampus) return defaultRouteVisual;
    const key = toCampus.toLowerCase();
    const match = ROUTE_VISUALS.find((item) => key.includes(item.key)) ?? null;
    return match ?? defaultRouteVisual;
  }, [toCampus]);
  const sampledMinutes = useMemo(() => {
    if (!fromCampus || !toCampus) return null;
    const minutes = getDurationMinutes(fromCampus, toCampus);
    if (!minutes || !Number.isFinite(minutes)) return null;
    return minutes;
  }, [fromCampus, toCampus]);
  const heroDepartLabel = fromCampus || 'Commune au choix';
  const heroArrivalLabel = toCampus || 'Destination EPHEC';
  const heroDurationLabel = sampledMinutes ? `${sampledMinutes} min estimées` : 'Temps estimé';
  const heroDestinationCoords = useMemo(() => {
    if (!toCampus) return null;
    const { lat, lng } = getCoordinates(toCampus);
    return { latitude: lat, longitude: lng };
  }, [toCampus]);
  const scopedResults = useMemo(
    () => (showAllRides ? upcomingHomeRides : searchResults),
    [showAllRides, upcomingHomeRides, searchResults]
  );
  const applyRideFilters = useCallback(
    (list: Ride[]) => {
      let filtered = [...list];
      if (onlyAvailableSeats) {
        filtered = filtered.filter((ride) => ride.passengers.length < ride.seats);
      }
      if (priceFilter !== 'all') {
        const predicate = PRICE_FILTERS.find((entry) => entry.id === priceFilter)?.predicate;
        if (predicate) {
          filtered = filtered.filter((ride) => predicate(ride.price));
        }
      }
      if (durationFilter !== 'all') {
        const predicate = DURATION_FILTERS.find((entry) => entry.id === durationFilter)?.predicate;
        if (predicate) {
          filtered = filtered.filter((ride) => {
            const minutes = getRideDuration(ride);
            if (minutes === Number.MAX_SAFE_INTEGER) return false;
            return predicate(minutes);
          });
        }
      }
      if (campusFilter !== 'all') {
        const campusKey = normalizeText(campusFilter);
        filtered = filtered.filter((ride) =>
          normalizeText(ride.destination).includes(campusKey)
        );
      }
      if (hourFilter !== 'all') {
        const entry = HOUR_FILTERS.find((item) => item.id === hourFilter);
        filtered = filtered.filter((ride) => {
          const minutes = timeToMinutes(ride.time);
          if (!Number.isFinite(minutes)) return false;
          if (!entry || !entry.range) return true;
          const [start, end] = entry.range;
          if (hourFilter === 'night') {
            const wrapLimit = 5 * 60;
            if (minutes >= start) return true;
            return minutes < wrapLimit;
          }
          return minutes >= start && minutes < end;
        });
      }
      switch (activeResultFilter) {
        case 'earliest':
          filtered.sort((a, b) => a.departureAt - b.departureAt);
          break;
        case 'price':
          filtered.sort((a, b) => a.price - b.price);
          break;
        case 'distance':
          filtered.sort((a, b) => getRideDistance(a) - getRideDistance(b));
          break;
        case 'recommended':
        default:
          filtered.sort((a, b) => {
            const seatsA = Math.max(0, a.seats - a.passengers.length);
            const seatsB = Math.max(0, b.seats - b.passengers.length);
            if (seatsB !== seatsA) return seatsB - seatsA;
            return a.departureAt - b.departureAt;
          });
          break;
      }
      return filtered;
    },
    [
      onlyAvailableSeats,
      activeResultFilter,
      getRideDistance,
      priceFilter,
      durationFilter,
      campusFilter,
      hourFilter,
      getRideDuration,
    ]
  );
  const filteredSearchResults = useMemo(
    () => applyRideFilters(scopedResults),
    [applyRideFilters, scopedResults]
  );
  const resultsCountLabel = useMemo(() => {
    if (!searchPerformed) return 'Prêt à lancer une recherche';
    if (filteredSearchResults.length === 0) {
      if (showAllRides) {
        return scopedResults.length === 0 ? 'Aucun trajet planifié' : '0 après filtres';
      }
      return scopedResults.length === 0 ? 'Aucun trajet' : '0 après filtres';
    }
    if (filteredSearchResults.length === scopedResults.length || scopedResults.length === 0) {
      return showAllRides
        ? `${filteredSearchResults.length} trajet(s) affiché(s)`
        : `${filteredSearchResults.length} trouvés`;
    }
    return `${filteredSearchResults.length}/${scopedResults.length} affichés`;
  }, [
    filteredSearchResults.length,
    scopedResults.length,
    searchPerformed,
    showAllRides,
  ]);
  const resultsEmptyLabel = useMemo(() => {
    if (showAllRides) {
      if (scopedResults.length === 0) {
        return 'Aucun trajet n’est prévu pour le moment.';
      }
      return 'Aucun trajet ne correspond à ces filtres. Allège-les pour voir davantage d’options.';
    }
    if (scopedResults.length === 0) {
      return 'Aucun trajet ne correspond à cette recherche. Ajuste les horaires ou retente plus tard.';
    }
    return 'Aucun trajet ne correspond à ces filtres. Essaie de les assouplir pour voir plus d’options.';
  }, [scopedResults.length, showAllRides]);

  const showResultsCard = searchPerformed;
  const ridesCardCountLabel = resultsCountLabel;
  const ridesCardList = filteredSearchResults;
  const fallbackHomeResults = useMemo(() => {
    return upcomingHomeRides.filter((ride) => ride.passengers.length < ride.seats).slice(0, 4);
  }, [upcomingHomeRides]);
  const showFallbackHome =
    searchPerformed && ridesCardList.length === 0 && fallbackHomeResults.length > 0;

  useEffect(() => {
    if (!showAllRides) return;
    if (!searchPerformed) setSearchPerformed(true);
  }, [showAllRides, searchPerformed]);

  const cardNumberDisplay = useMemo(() => {
    if (!cardNumber) return '';
    return cardMasked ? maskCardNumberDisplay(cardNumber) : formatCardNumber(cardNumber);
  }, [cardNumber, cardMasked]);

  const expiryYears = useMemo(() => {
    const start = new Date().getFullYear();
    return Array.from({ length: EXPIRY_YEARS_SPAN }, (_, idx) => start + idx);
  }, []);
  const expiryMonths = useMemo(() => Array.from({ length: 12 }, (_, idx) => idx + 1), []);

  const confirmExpirySelection = useCallback(() => {
    if (!pickerExpiryMonth || !pickerExpiryYear) {
      return;
    }
    setExpiryMonth(pickerExpiryMonth);
    setExpiryYear(pickerExpiryYear);
    setShowExpiryPicker(false);
  }, [pickerExpiryMonth, pickerExpiryYear]);
  const animateDropdown = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.create(160, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
  }, []);
  const travelDateLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate, formatDateLabel]);
  const dropdownOpen = showFromList || showDestList;
  const closeDropdowns = useCallback(() => {
    animateDropdown();
    setShowDestList(false);
    setShowFromList(false);
  }, [animateDropdown]);
  const communeSuggestions = useMemo(() => {
    const query = fromCampus.trim().toLowerCase();
    const base =
      query.length === 0
        ? BRUSSELS_COMMUNES.slice(0, 6)
        : BRUSSELS_COMMUNES.filter((commune) => commune.toLowerCase().includes(query)).slice(0, 10);
    const unique = Array.from(new Set(base));
    return ['Ma position actuelle', ...unique];
  }, [fromCampus]);

  const handleUseLocation = useCallback(async () => {
    try {
      setLocationLoading(true);
      const { commune, coords } = await getCurrentCommune();
      setFromCampus(commune);
      setDetectedCommune(commune);
      setPreciseDepartCoords({
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      setShowFromList(false);
      setShowDestList(false);
    } catch (error) {
      if (error instanceof LocationPermissionError) {
        Alert.alert(
          'Localisation désactivée',
          'Active la localisation pour suggérer automatiquement ta commune.'
        );
      } else {
        Alert.alert(
          'Position indisponible',
          'Impossible de récupérer ta position actuelle. Réessaie dans un instant.'
        );
      }
    } finally {
      setLocationLoading(false);
    }
  }, []);

  const handleFromFocus = useCallback(() => {
    if (fromBlurTimeout.current) {
      clearTimeout(fromBlurTimeout.current);
      fromBlurTimeout.current = null;
    }
    animateDropdown();
    setShowFromList(true);
    setShowDestList(false);
  }, [animateDropdown]);

  const handleFromBlur = useCallback(() => {
    fromBlurTimeout.current = setTimeout(() => {
      setShowFromList(false);
    }, 120);
  }, []);

  const toggleDestList = useCallback(() => {
    animateDropdown();
    setShowDestList((prev) => {
      const next = !prev;
      if (next) {
        setShowFromList(false);
      }
      return next;
    });
  }, [animateDropdown]);
  const selectFromCommune = useCallback(
    (commune: string) => {
      if (commune === 'Ma position actuelle') {
        handleUseLocation();
        return;
      }
      setFromCampus(commune);
      setDetectedCommune(null);
      setPreciseDepartCoords(null);
      animateDropdown();
      setShowFromList(false);
    },
    [animateDropdown, handleUseLocation]
  );
  const selectDestinationCampus = useCallback(
    (campus: string) => {
      setToCampus(campus);
      animateDropdown();
      setShowDestList(false);
    },
    [animateDropdown]
  );
  const renderSheetContent = () => (
    <>
      <Text style={passengerStyles.sheetTitle}>Choisir votre destination</Text>
      <View style={passengerStyles.campusChipsRow}>
        {campusOptions.map((campus) => {
          const selected = campus === toCampus;
          return (
            <Pressable
              key={campus}
              onPress={() => selectDestinationCampus(campus)}
              style={[passengerStyles.campusChip, selected && passengerStyles.campusChipSelected]}
              accessibilityRole="button"
              accessibilityLabel={`Aller vers ${campus}`}
              hitSlop={8}
            >
              <Text
                style={[passengerStyles.campusChipText, selected && passengerStyles.campusChipTextSelected]}
              >
                {campus.replace('EPHEC ', '')}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={passengerStyles.destinationRow}>
        <View style={passengerStyles.destinationColumn}>
          <View style={[passengerStyles.dropdownWrapper, passengerStyles.dropdownWrapperTop]}>
            <View style={passengerStyles.inputWrapper}>
              <IconSymbol name="location.fill" size={18} color={Colors.gray500} />
              <TextInput
                style={passengerStyles.dropdownTextInput}
                value={fromCampus}
                onChangeText={(value) => {
                  setFromCampus(value);
                  setDetectedCommune(null);
                  setPreciseDepartCoords(null);
                  if (!showFromList) {
                    animateDropdown();
                    setShowFromList(true);
                  }
                }}
                placeholder="Votre commune de départ"
                placeholderTextColor={Colors.gray400}
                onFocus={handleFromFocus}
                onBlur={handleFromBlur}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
              />
            </View>
            <View style={passengerStyles.locationHelperRow}>
              <Pressable
                style={[
                  passengerStyles.locationChip,
                  locationLoading && passengerStyles.locationChipDisabled,
                ]}
                onPress={handleUseLocation}
                disabled={locationLoading}
                accessibilityRole="button"
              >
                <IconSymbol name="location.fill" size={14} color={Colors.secondary} />
                <Text style={passengerStyles.locationChipText}>
                  {locationLoading ? 'Localisation…' : 'Utiliser ma position'}
                </Text>
              </Pressable>
              {detectedCommune ? (
                <Text style={passengerStyles.locationDetectedText}>
                  Commune détectée : {detectedCommune}
                </Text>
              ) : null}
            </View>
            {showFromList && communeSuggestions.length > 0 ? (
              <View style={passengerStyles.dropdownList}>
                {communeSuggestions.map((commune) => (
                  <Pressable
                    key={commune}
                    style={passengerStyles.dropdownItem}
                    onPress={() => selectFromCommune(commune)}
                  >
                    <Text style={passengerStyles.dropdownItemText}>{commune}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          <View style={[passengerStyles.dropdownWrapper, passengerStyles.dropdownWrapperBottom]}>
            <View style={[passengerStyles.inputWrapper, passengerStyles.toInput]}>
              <IconSymbol name="location.fill" size={18} color="#FF70A0" />
              <Pressable
                style={passengerStyles.dropdownTrigger}
                onPress={toggleDestList}
                accessibilityRole="button"
                accessibilityLabel="Choisir un campus de destination"
              >
                <Text style={passengerStyles.dropdownText}>{toCampus}</Text>
              </Pressable>
            </View>
            {showDestList ? (
              <View style={passengerStyles.dropdownList}>
                {campusOptions.map((campus) => (
                  <Pressable
                    key={campus}
                    style={passengerStyles.dropdownItem}
                    onPress={() => selectDestinationCampus(campus)}
                  >
                    <Text style={passengerStyles.dropdownItemText}>{campus}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
        <View style={passengerStyles.actionsColumn}>
          <Pressable
            style={passengerStyles.swapButton}
            accessibilityRole="button"
            accessibilityLabel="Inverser les trajets"
            onPress={() => {
              closeDropdowns();
              setFromCampus(toCampus);
              setToCampus(fromCampus);
              setDetectedCommune(null);
              setPreciseDepartCoords(null);
            }}
          >
            <IconSymbol name="chevron.up" size={18} color="#7A7A98" />
            <IconSymbol name="chevron.down" size={18} color="#7A7A98" />
          </Pressable>
        </View>
      </View>
      <View style={passengerStyles.dateSection}>
        {!dropdownOpen ? (
          <View style={passengerStyles.dateRow}>
            <Pressable
              style={[passengerStyles.inputWrapper, passengerStyles.smallInput, passengerStyles.pickerTrigger]}
              onPress={() => {
                closeDropdowns();
                openDatePicker();
              }}
              accessibilityRole="button"
              accessibilityLabel="Sélectionner une date"
            >
              <IconSymbol name="calendar" size={18} color={Colors.gray500} />
              <Text style={passengerStyles.dropdownText}>{travelDateLabel}</Text>
            </Pressable>
            <Pressable
              style={[passengerStyles.inputWrapper, passengerStyles.smallInput, passengerStyles.pickerTrigger]}
              onPress={() => {
                closeDropdowns();
                setShowTimePicker(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Sélectionner une heure"
            >
              <IconSymbol name="clock" size={18} color={Colors.gray500} />
              <Text style={passengerStyles.dropdownText}>{travelTime}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={passengerStyles.dateRowPlaceholder} />
        )}
      </View>
      <GradientButton
        title="Chercher"
        onPress={onSearch}
        variant="cta"
        disabled={dropdownOpen || isSearching}
        style={[
          passengerStyles.fullSearchButton,
          dropdownOpen && passengerStyles.fullSearchButtonLowered,
        ]}
      />
      {isSearching ? (
        <View style={passengerStyles.searchLoading}>
          <ActivityIndicator color={Colors.primary} size="small" />
          <Text style={passengerStyles.searchLoadingText}>Recherche en cours...</Text>
        </View>
      ) : null}
    </>
  );

  const timeOptions = useMemo(() => {
    const slots: string[] = [];
    for (let hour = 6; hour <= 22; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
      slots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    return slots;
  }, []);
  const weekdayHeaders = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const calendarDays = useMemo(() => {
    const days: { key: string; date: Date | null; label: string }[] = [];
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) {
      days.push({ key: `empty-${calendarMonth}-${calendarYear}-${i}`, date: null, label: '' });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(calendarYear, calendarMonth, day);
      days.push({ key: dateObj.toISOString(), date: dateObj, label: day.toString() });
    }
    while (days.length % 7 !== 0) {
      const idx = days.length;
      days.push({ key: `pad-${calendarMonth}-${calendarYear}-${idx}`, date: null, label: '' });
    }
    return days;
  }, [calendarMonth, calendarYear]);
  const calendarTitle = useMemo(
    () =>
      new Date(calendarYear, calendarMonth, 1).toLocaleDateString('fr-BE', {
        month: 'long',
        year: 'numeric',
      }),
    [calendarMonth, calendarYear]
  );
  const isSameDay = useCallback((a: Date, b: Date) => {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }, []);
  const formatDeparture = useCallback(
    (timestamp: number) => {
      const departure = new Date(timestamp);
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);
      if (isSameDay(departure, today)) return 'Aujourd’hui';
      if (isSameDay(departure, tomorrow)) return 'Demain';
      return departure.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' });
    },
    [isSameDay]
  );
  const openDatePicker = () => {
    setCalendarMonth(selectedDate.getMonth());
    setCalendarYear(selectedDate.getFullYear());
    setShowDatePicker(true);
  };
  const goToPrevMonth = () => {
    setCalendarMonth((prev) => {
      if (prev === 0) {
        setCalendarYear((year) => year - 1);
        return 11;
      }
      return prev - 1;
    });
  };
  const goToNextMonth = () => {
    setCalendarMonth((prev) => {
      if (prev === 11) {
        setCalendarYear((year) => year + 1);
        return 0;
      }
      return prev + 1;
    });
  };
  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);
    setShowDatePicker(false);
  };

  const openRide = useCallback(
    (id: string) => {
      router.push(`/ride/${id}`);
    },
    [router]
  );

  const handleReserveRide = useCallback(
    (ride: Ride, method: PaymentMethod = 'wallet') => {
      if (!session.email) {
        Alert.alert(
          'Connexion requise',
          'Connecte-toi ou crée un compte pour réserver un trajet.',
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Se connecter',
              onPress: () => router.push('/sign-up'),
            },
          ]
        );
        return false;
      }
      if (ride.passengers.length >= ride.seats) {
        Alert.alert('Trajet complet', 'Toutes les places ont été réservées.');
        return false;
      }
      let response: ReturnType<typeof reserveSeat> | null = null;
      setReservingRideId(ride.id);
      try {
        response = reserveSeat(ride.id, session.email, { paymentMethod: method });
      } finally {
        setReservingRideId((current) => (current === ride.id ? null : current));
      }
      if (!response) return false;
      if (response.ok) {
        Alert.alert(
          'Réservation confirmée',
          `Ta place pour ${ride.depart} → ${ride.destination} est réservée.`,
          [
            { text: 'Voir le trajet', onPress: () => openRide(ride.id) },
            { text: 'OK', style: 'default' },
          ]
        );
        return true;
      }
      if (response.reason === 'PAYMENT_WALLET' && method !== 'card') {
        Alert.alert(
          'Solde insuffisant',
          'Ton wallet ne couvre pas ce trajet. Souhaites-tu payer par carte ?',
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Payer par carte', onPress: () => handleReserveRide(ride, 'card') },
          ]
        );
        return false;
      }
      let message = 'Impossible de réserver ce trajet pour le moment.';
      switch (response.reason) {
        case 'DEPARTED':
          message = 'Ce trajet est déjà parti.';
          break;
        case 'ALREADY_RESERVED':
          message = 'Tu as déjà une place confirmée sur ce trajet.';
          break;
        case 'FULL':
          message = 'Toutes les places ont été prises.';
          break;
        case 'PAYMENT_WALLET':
          message = 'Solde insuffisant dans ton wallet.';
          break;
        case 'PAYMENT_PASS':
          message = 'Aucun crédit trajet disponible.';
          break;
        case 'PAYMENT_UNKNOWN':
          message = response.details ?? 'Erreur de paiement. Réessaie plus tard.';
          break;
        default:
          break;
      }
      Alert.alert('Réservation impossible', message);
      return false;
    },
    [session.email, router, openRide]
  );

  const startPaymentFlow = useCallback(
    (ride: Ride) => {
      if (!session.email) {
        Alert.alert(
          'Connexion requise',
          'Connecte-toi ou crée un compte pour réserver un trajet.',
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Se connecter', onPress: () => router.push('/sign-up') },
          ]
        );
        return;
      }
      if (ride.passengers.length >= ride.seats) {
        Alert.alert('Trajet complet', 'Toutes les places ont été réservées.');
        return;
      }
      setPaymentRide(ride);
      setPaymentMethodChoice('apple-pay');
      setCardNumber('');
      setCardExpiry('');
      setCardCvv('');
      setPaymentError(null);
      setCardMasked(false);
      setExpiryMonth(null);
      setExpiryYear(null);
      setPickerExpiryMonth(null);
      setPickerExpiryYear(null);
    },
    [session.email, router]
  );

  const closePaymentSheet = useCallback(() => {
    setPaymentRide(null);
    setPaymentError(null);
    setCardNumber('');
    setCardExpiry('');
    setCardCvv('');
    setCardMasked(false);
    setExpiryMonth(null);
    setExpiryYear(null);
    setPickerExpiryMonth(null);
    setPickerExpiryYear(null);
    setShowExpiryPicker(false);
  }, []);

  const confirmPayment = useCallback(() => {
    if (!paymentRide) return;
    setPaymentError(null);
    let method: PaymentMethod = 'card';
    if (paymentMethodChoice === 'card') {
      const digits = cardNumber.replace(/[^0-9]/g, '');
      if (digits.length < 12) {
        setPaymentError('Numéro de carte invalide.');
        return;
      }
      if (!expiryMonth || !expiryYear) {
        setPaymentError("Sélectionne la date d'expiration.");
        return;
      }
      const expiryDate = new Date(expiryYear, expiryMonth - 1, 1);
      expiryDate.setMonth(expiryDate.getMonth() + 1);
      if (expiryDate <= new Date()) {
        setPaymentError('Cette carte est expirée.');
        return;
      }
      if (!/^\d{3,4}$/.test(cardCvv)) {
        setPaymentError('CVV invalide.');
        return;
      }
    } else {
      method = 'card';
    }
    const success = handleReserveRide(paymentRide, method);
    if (success) {
      setCardMasked(true);
      closePaymentSheet();
    }
  }, [paymentRide, paymentMethodChoice, cardNumber, cardExpiry, cardCvv, handleReserveRide, closePaymentSheet]);

  const renderRideResult = useCallback(
    (ride: Ride) => {
      const seatsLeft = Math.max(0, ride.seats - ride.passengers.length);
      const distanceLabel = (() => {
        const km = getRideDistance(ride);
        if (!Number.isFinite(km) || km === Number.MAX_SAFE_INTEGER) return 'Trajet';
        return `${km.toFixed(1)} km`;
      })();
      const durationMinutes = getRideDuration(ride);
      const durationLabel =
        durationMinutes === Number.MAX_SAFE_INTEGER
          ? 'Durée estimée'
          : `${Math.round(durationMinutes)} min`;
      const ratingValue = derivePseudoRating(ride);
      const avatarUri = getAvatarUrl(ride.ownerEmail, 72);
      const reserving = reservingRideId === ride.id;
      return (
        <GradientBackground key={ride.id} colors={Gradients.soft} style={passengerStyles.resultCardWrapper}>
          <Pressable
            style={passengerStyles.resultCard}
            onPress={() => openRide(ride.id)}
            accessibilityRole="button"
          >
            <View style={passengerStyles.resultDriverRow}>
              <Image source={{ uri: avatarUri }} style={passengerStyles.resultAvatar} />
              <View style={passengerStyles.resultDriverTexts}>
                <Text style={passengerStyles.resultDriverName}>{ride.driver}</Text>
                <Text style={passengerStyles.resultMetaText}>
                  {ride.time} • {distanceLabel}
                </Text>
              </View>
              <View style={passengerStyles.resultPricePill}>
                <Text style={passengerStyles.resultPriceValue}>€{ride.price.toFixed(2)}</Text>
              </View>
            </View>
            <View style={passengerStyles.resultStatsRow}>
              <View style={passengerStyles.resultStatPill}>
                <IconSymbol name="star.fill" size={14} color={Colors.secondary} />
                <Text style={passengerStyles.resultStatText}>{ratingValue.toFixed(1)} / 5</Text>
              </View>
              <View style={passengerStyles.resultStatPill}>
                <IconSymbol name="clock" size={14} color={Colors.gray500} />
                <Text style={passengerStyles.resultStatText}>{durationLabel}</Text>
              </View>
            </View>
            <Text style={passengerStyles.resultSchedule}>
              {formatDeparture(ride.departureAt)} •{' '}
              {seatsLeft > 0 ? `${seatsLeft} place${seatsLeft > 1 ? 's' : ''} dispo` : 'Complet'}
            </Text>
            <View style={passengerStyles.resultRouteRow}>
              <View style={passengerStyles.resultRouteColumn}>
                <IconSymbol name="location.fill" size={16} color={Colors.gray500} />
                <Text style={passengerStyles.resultRouteLabel}>{ride.depart}</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={Colors.gray400} />
              <View style={passengerStyles.resultRouteColumnDestination}>
                <IconSymbol name="mappin.circle.fill" size={18} color="#FF6B9A" />
                <Text style={passengerStyles.resultRouteDestination}>{ride.destination}</Text>
              </View>
            </View>
            <GradientButton
              title={seatsLeft > 0 ? 'Réserver' : 'Complet'}
              onPress={() => startPaymentFlow(ride)}
              size="sm"
              variant="twilight"
              fullWidth
              style={passengerStyles.resultReserveButton}
              accessibilityRole="button"
              disabled={seatsLeft <= 0 || reserving}
            >
              {reserving ? <ActivityIndicator color="#fff" /> : null}
            </GradientButton>
          </Pressable>
        </GradientBackground>
      );
    },
    [formatDeparture, getRideDistance, getRideDuration, openRide, startPaymentFlow, reservingRideId]
  );

  const renderResultsFilters = () => (
    <View style={passengerStyles.filterPanel}>
      <View style={passengerStyles.filterChipsRow}>
        {RESULT_FILTERS.map((filter) => {
          const selected = activeResultFilter === filter.id;
          return (
            <Pressable
              key={filter.id}
              style={[passengerStyles.filterChip, selected && passengerStyles.filterChipActive]}
              onPress={() => setActiveResultFilter(filter.id)}
              accessibilityRole="button"
            >
              <Text
                style={[
                  passengerStyles.filterChipLabel,
                  selected && passengerStyles.filterChipLabelActive,
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={passengerStyles.filterGroup}>
        <Text style={passengerStyles.filterGroupLabel}>Prix</Text>
        <View style={passengerStyles.filterChipsRow}>
          {PRICE_FILTERS.map((filter) => {
            const selected = priceFilter === filter.id;
            return (
              <Pressable
                key={filter.id}
                style={[passengerStyles.filterChip, selected && passengerStyles.filterChipActive]}
                onPress={() => setPriceFilter(filter.id)}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    passengerStyles.filterChipLabel,
                    selected && passengerStyles.filterChipLabelActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={passengerStyles.filterGroup}>
        <Text style={passengerStyles.filterGroupLabel}>Durée</Text>
        <View style={passengerStyles.filterChipsRow}>
          {DURATION_FILTERS.map((filter) => {
            const selected = durationFilter === filter.id;
            return (
              <Pressable
                key={filter.id}
                style={[passengerStyles.filterChip, selected && passengerStyles.filterChipActive]}
                onPress={() => setDurationFilter(filter.id)}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    passengerStyles.filterChipLabel,
                    selected && passengerStyles.filterChipLabelActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={passengerStyles.filterGroup}>
        <Text style={passengerStyles.filterGroupLabel}>Campus</Text>
        <View style={passengerStyles.filterChipsRow}>
          {campusFilterOptions.map((option) => {
            const selected = campusFilter === option;
            const label = option === 'all' ? 'Tous' : option.replace('EPHEC ', '');
            return (
              <Pressable
                key={option}
                style={[passengerStyles.filterChip, selected && passengerStyles.filterChipActive]}
                onPress={() => setCampusFilter(option)}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    passengerStyles.filterChipLabel,
                    selected && passengerStyles.filterChipLabelActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={passengerStyles.filterGroup}>
        <Text style={passengerStyles.filterGroupLabel}>Heure</Text>
        <View style={passengerStyles.filterChipsRow}>
          {HOUR_FILTERS.map((filter) => {
            const selected = hourFilter === filter.id;
            return (
              <Pressable
                key={filter.id}
                style={[passengerStyles.filterChip, selected && passengerStyles.filterChipActive]}
                onPress={() => setHourFilter(filter.id)}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    passengerStyles.filterChipLabel,
                    selected && passengerStyles.filterChipLabelActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Pressable
        style={passengerStyles.filterToggle}
        onPress={() => setOnlyAvailableSeats((prev) => !prev)}
        accessibilityRole="switch"
        accessibilityState={{ checked: onlyAvailableSeats }}
      >
        <View
          style={[
            passengerStyles.filterToggleSwitch,
            onlyAvailableSeats && passengerStyles.filterToggleSwitchActive,
          ]}
        >
          <View
            style={[
              passengerStyles.filterToggleThumb,
              onlyAvailableSeats && passengerStyles.filterToggleThumbActive,
            ]}
          />
        </View>
        <Text style={passengerStyles.filterToggleLabel}>Places disponibles uniquement</Text>
      </Pressable>
      <Pressable
        style={passengerStyles.filterToggle}
        onPress={() => setShowAllRides((prev) => !prev)}
        accessibilityRole="switch"
        accessibilityState={{ checked: showAllRides }}
      >
        <View
          style={[
            passengerStyles.filterToggleSwitch,
            showAllRides && passengerStyles.filterToggleSwitchActive,
          ]}
        >
          <View
            style={[
              passengerStyles.filterToggleThumb,
              showAllRides && passengerStyles.filterToggleThumbActive,
            ]}
          />
        </View>
        <Text style={passengerStyles.filterToggleLabel}>Afficher tous les trajets</Text>
      </Pressable>
    </View>
  );

  const onSearch = useCallback(() => {
    closeDropdowns();
    setSearchPerformed(true);
    setIsSearching(true);
    setSearchInstance((count) => count + 1);
    const preferredMinutes = timeToMinutes(travelTime);
    const departQuery = normalizeText(fromCampus);
    const destinationQuery = normalizeText(toCampus);
    const flexibleDepart = departQuery.includes('ma position');
    const filtered = rides
      .filter((ride) => !hasRideDeparted(ride))
      .filter((ride) => {
        const rideDepart = normalizeText(ride.depart);
        const rideDestination = normalizeText(ride.destination);
        const departMatches = flexibleDepart || rideDepart.includes(departQuery);
        const destinationMatches = rideDestination.includes(destinationQuery);
        const dayMatches = isSameDay(new Date(ride.departureAt), selectedDate);
        const minutesDiff = Math.abs(timeToMinutes(ride.time) - preferredMinutes);
        const timeMatches = Number.isFinite(minutesDiff) ? minutesDiff <= 60 : true;
        return departMatches && destinationMatches && dayMatches && timeMatches;
      })
      .sort((a, b) => a.departureAt - b.departureAt);
    setSearchResults(filtered);
    setIsSearching(false);
  }, [
    closeDropdowns,
    travelTime,
    fromCampus,
    toCampus,
    rides,
    isSameDay,
    selectedDate,
  ]);

  useEffect(() => {
    if (initialSearchTriggered.current) return;
    if (!ridesReady) return;
    if (!initialDepart && !initialDestination) return;
    initialSearchTriggered.current = true;
    onSearch();
  }, [initialDepart, initialDestination, onSearch, ridesReady]);

  useEffect(() => {
    if (!searchPerformed) return;
    if (!scrollRef.current) return;
    if (resultsOffset == null) return;
    if (searchInstance === 0) return;
    scrollRef.current.scrollTo({ y: Math.max(resultsOffset - Spacing.lg, 0), animated: true });
  }, [searchPerformed, resultsOffset, searchInstance]);

  useEffect(() => {
    const unsubscribe = subscribeRides((items) => {
      setRides(items);
      setRidesReady(true);
    });
    return unsubscribe;
  }, []);

  return (
    <AppBackground colors={Gradients.twilight}>
      <SafeAreaView style={passengerStyles.safe}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={scrollContentStyle}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={closeDropdowns}
        >
          {Platform.OS === 'web' ? (
            <View style={passengerStyles.heroColumnWeb}>
              <View style={[passengerStyles.heroCardWeb, passengerStyles.heroCardWebMap]}>
                <HeroWebMap
                  rides={rides}
                  origin={preciseDepartCoords}
                  originLabel={(detectedCommune ?? fromCampus) || undefined}
                  destination={heroDestinationCoords}
                  destinationLabel={toCampus || undefined}
                />
              </View>
              <View style={[passengerStyles.heroCardWeb, passengerStyles.heroCardCompact]}>
                {renderSheetContent()}
              </View>
            </View>
          ) : (
            <>
              <View style={passengerStyles.mapWrapper}>
                <PinchGestureHandler
                  onGestureEvent={pinchGestureHandler}
                  onHandlerStateChange={handlePinchStateChange}
                >
                  <Animated.View style={[passengerStyles.mapContent, { transform: [{ scale: mapScale }] }]}>
                    <Image source={HERO_MAP_IMAGE} style={passengerStyles.mapImage} resizeMode="cover" />
                    <View pointerEvents="none" style={passengerStyles.mapTitleCard}>
                      <Text style={passengerStyles.mapTitle}>Trouver un trajet</Text>
                    </View>
                    <View style={passengerStyles.routeBadge}>
                      <Text style={passengerStyles.routeTitle}>{heroArrivalLabel}</Text>
                      <Text style={passengerStyles.routeDuration}>{heroDurationLabel}</Text>
                    </View>
                    <View style={passengerStyles.mapBubbleStart}>
                      <View
                        style={[
                          passengerStyles.mapBubbleDot,
                          { backgroundColor: routeVisual.startDot },
                        ]}
                      />
                      <View>
                        <Text style={passengerStyles.mapBubbleLabel}>Départ</Text>
                        <Text style={passengerStyles.mapBubbleValue}>{heroDepartLabel}</Text>
                      </View>
                    </View>
                    <View style={passengerStyles.mapBubbleDestination}>
                      <View
                        style={[
                          passengerStyles.mapBubbleDot,
                          passengerStyles.mapBubbleDotDestination,
                          { backgroundColor: routeVisual.endDot },
                        ]}
                      />
                      <View>
                        <Text
                          style={[passengerStyles.mapBubbleLabel, passengerStyles.mapBubbleLabelOnDark]}
                        >
                          Destination
                        </Text>
                        <Text
                          style={[passengerStyles.mapBubbleValue, passengerStyles.mapBubbleValueOnDark]}
                        >
                          {heroArrivalLabel}
                        </Text>
                      </View>
                    </View>
                  </Animated.View>
                </PinchGestureHandler>
              </View>
              <View style={[passengerStyles.sheet, passengerStyles.sheetExpanded]}>
                {renderSheetContent()}
              </View>
            </>
          )}

          {showResultsCard ? (
            <GradientBackground
              colors={Gradients.card}
              style={passengerStyles.resultsCard}
              onLayout={(event) => setResultsOffset(event.nativeEvent.layout.y)}
            >
              <View style={passengerStyles.resultsHeader}>
                <View>
                  <Text style={passengerStyles.resultsTitle}>Trajets disponibles</Text>
                  <Text style={passengerStyles.resultsCount}>{ridesCardCountLabel}</Text>
                </View>
                <Pressable
                  style={[
                    passengerStyles.filterButton,
                    filterPanelAnchor === 'search' && passengerStyles.filterButtonActive,
                  ]}
                  onPress={() => toggleResultsFilters('search')}
                  accessibilityRole="button"
                >
                  <IconSymbol
                    name="line.3.horizontal.decrease.circle.fill"
                    size={20}
                    color={filterPanelAnchor === 'search' ? Colors.primary : Colors.gray600}
                  />
                  <Text style={passengerStyles.filterButtonText}>Filtres</Text>
                </Pressable>
              </View>
              {filterPanelAnchor === 'search' ? renderResultsFilters() : null}
              {ridesCardList.length === 0 ? (
                <Text style={passengerStyles.resultsEmpty}>{resultsEmptyLabel}</Text>
              ) : (
                <View style={passengerStyles.resultsList}>
                  {ridesCardList.map((ride) => renderRideResult(ride))}
                </View>
              )}
            </GradientBackground>
          ) : null}
          {showFallbackHome ? (
            <GradientBackground colors={Gradients.card} style={passengerStyles.resultsCard}>
              <View style={passengerStyles.resultsHeader}>
                <View>
                  <Text style={passengerStyles.resultsTitle}>Autres trajets disponibles</Text>
                  <Text style={passengerStyles.resultsCount}>
                    {`${fallbackHomeResults.length} suggestion(s)`}
                  </Text>
                </View>
              </View>
              <Text style={passengerStyles.resultsHint}>
                Aucun trajet ne correspond exactement à ta recherche. Voici les trajets encore disponibles autour
                de ta zone.
              </Text>
              <View style={passengerStyles.resultsList}>
                {fallbackHomeResults.map((ride) => renderRideResult(ride))}
              </View>
            </GradientBackground>
          ) : null}
        </ScrollView>
        <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
          <View style={passengerStyles.pickerOverlay}>
            <Pressable style={passengerStyles.pickerBackdrop} onPress={() => setShowDatePicker(false)} />
            <View style={passengerStyles.pickerCard}>
              <View style={passengerStyles.calendarHeader}>
                <Pressable style={passengerStyles.calendarNavButton} onPress={goToPrevMonth} accessibilityRole="button">
                  <IconSymbol name="chevron.left" size={20} color={Colors.gray600} />
                </Pressable>
                <Text style={passengerStyles.calendarTitle}>{calendarTitle}</Text>
                <Pressable style={passengerStyles.calendarNavButton} onPress={goToNextMonth} accessibilityRole="button">
                  <IconSymbol name="chevron.right" size={20} color={Colors.gray600} />
                </Pressable>
              </View>
              <View style={passengerStyles.calendarWeekdays}>
                {weekdayHeaders.map((label) => (
                  <Text key={label} style={passengerStyles.calendarWeekdayText}>
                    {label}
                  </Text>
                ))}
              </View>
              <View style={passengerStyles.calendarGrid}>
                {calendarDays.map((day) => {
                  const selected = day.date ? isSameDay(day.date, selectedDate) : false;
                  return (
                    <Pressable
                      key={day.key}
                      style={[
                        passengerStyles.calendarDay,
                        !day.date && passengerStyles.calendarDayDisabled,
                        selected && passengerStyles.calendarDaySelected,
                      ]}
                      disabled={!day.date}
                      onPress={() => day.date && handleSelectDate(day.date)}
                    >
                      <Text
                        style={[
                          passengerStyles.calendarDayText,
                          selected && passengerStyles.calendarDayTextSelected,
                        ]}
                      >
                        {day.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
          <View style={passengerStyles.pickerOverlay}>
            <Pressable style={passengerStyles.pickerBackdrop} onPress={() => setShowTimePicker(false)} />
            <View style={passengerStyles.pickerCard}>
              <Text style={passengerStyles.pickerTitle}>Choisir une heure</Text>
              <ScrollView contentContainerStyle={passengerStyles.pickerGrid}>
                {timeOptions.map((slot) => (
                  <Pressable
                    key={slot}
                    style={[
                      passengerStyles.pickerOption,
                      travelTime === slot && passengerStyles.pickerOptionActive,
                    ]}
                    onPress={() => {
                      setTravelTime(slot);
                      setShowTimePicker(false);
                    }}
                  >
                    <Text
                      style={[
                        passengerStyles.pickerOptionText,
                        travelTime === slot && passengerStyles.pickerOptionTextActive,
                      ]}
                    >
                      {slot}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
        <Modal visible={!!paymentRide} transparent animationType="slide" onRequestClose={closePaymentSheet}>
          <View style={passengerStyles.paymentOverlay}>
            <Pressable style={passengerStyles.paymentBackdrop} onPress={closePaymentSheet} />
            <View style={passengerStyles.paymentCard}>
              <View style={passengerStyles.paymentHeader}>
                <Text style={passengerStyles.paymentTitle}>Confirmer le paiement</Text>
                {paymentRide ? (
                  <Text style={passengerStyles.paymentSubtitle}>
                    {paymentRide.depart} → {paymentRide.destination}
                  </Text>
                ) : null}
              </View>
              {paymentRide ? (
                <View style={passengerStyles.paymentAmountBox}>
                  <Text style={passengerStyles.paymentAmountLabel}>Montant total</Text>
                  <Text style={passengerStyles.paymentAmountValue}>€{paymentRide.price.toFixed(2)}</Text>
                </View>
              ) : null}
              <View style={passengerStyles.paymentMethodsRow}>
                {(['apple-pay', 'card'] as const).map((method) => {
                  const selected = paymentMethodChoice === method;
                  return (
                    <Pressable
                      key={method}
                      style={[
                        passengerStyles.paymentMethodButton,
                        selected && passengerStyles.paymentMethodButtonActive,
                      ]}
                      onPress={() => setPaymentMethodChoice(method)}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          passengerStyles.paymentMethodText,
                          selected && passengerStyles.paymentMethodTextActive,
                        ]}
                      >
                        {method === 'apple-pay' ? 'Apple Pay' : 'Carte bancaire'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {paymentMethodChoice === 'card' ? (
                <View style={passengerStyles.paymentForm}>
                  <TextInput
                    value={cardNumberDisplay}
                    onChangeText={(value) => {
                      const digits = value.replace(/[^0-9]/g, '').slice(0, 16);
                      setCardNumber(digits);
                      setCardMasked(false);
                    }}
                    onFocus={() => setCardMasked(false)}
                    onBlur={() => setCardMasked(true)}
                    placeholder="Numéro de carte"
                    keyboardType="number-pad"
                    style={passengerStyles.paymentInput}
                    placeholderTextColor={Colors.gray500}
                    maxLength={19}
                  />
                  <View style={passengerStyles.paymentRow}>
                    <Pressable
                      style={[
                        passengerStyles.paymentInput,
                        passengerStyles.paymentInputHalf,
                        passengerStyles.paymentInputPressable,
                      ]}
                      onPress={() => {
                        setPickerExpiryMonth(expiryMonth);
                        setPickerExpiryYear(expiryYear);
                        setShowExpiryPicker(true);
                      }}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          passengerStyles.paymentInputValue,
                          !cardExpiry && passengerStyles.paymentInputPlaceholder,
                        ]}
                      >
                        {cardExpiry || 'MM/AA'}
                      </Text>
                    </Pressable>
                    <TextInput
                      value={cardCvv}
                      onChangeText={(value) => {
                        const digits = value.replace(/[^0-9]/g, '').slice(0, 4);
                        setCardCvv(digits);
                      }}
                      placeholder="CVV"
                      keyboardType="number-pad"
                      style={[passengerStyles.paymentInput, passengerStyles.paymentInputHalf]}
                      placeholderTextColor={Colors.gray500}
                      maxLength={4}
                      secureTextEntry
                    />
                  </View>
                </View>
              ) : (
                <View style={passengerStyles.paymentNoteBox}>
                  <Text style={passengerStyles.paymentNote}>
                    Apple Pay sera utilisé sur ton appareil pour finaliser la transaction.
                  </Text>
                </View>
              )}
              {paymentError ? <Text style={passengerStyles.paymentError}>{paymentError}</Text> : null}
              {paymentMethodChoice === 'apple-pay' ? (
                <Pressable
                  style={[
                    passengerStyles.applePayButton,
                    reservingRideId && paymentRide?.id === reservingRideId && passengerStyles.applePayButtonDisabled,
                  ]}
                  onPress={confirmPayment}
                  disabled={!!reservingRideId && paymentRide?.id === reservingRideId}
                  accessibilityRole="button"
                >
                  {paymentRide && reservingRideId === paymentRide.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={passengerStyles.applePayText}> Pay</Text>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  style={[
                    passengerStyles.cardPayButton,
                    reservingRideId && paymentRide?.id === reservingRideId && passengerStyles.cardPayButtonDisabled,
                  ]}
                  onPress={confirmPayment}
                  disabled={!!reservingRideId && paymentRide?.id === reservingRideId}
                  accessibilityRole="button"
                >
                  {paymentRide && reservingRideId === paymentRide.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <View style={passengerStyles.cardPayContent}>
                      <Text style={passengerStyles.cardPayIcon}>💳</Text>
                      <Text style={passengerStyles.cardPayText}>
                        {paymentRide ? `Payer €${paymentRide.price.toFixed(2)}` : 'Payer par carte'}
                      </Text>
                    </View>
                  )}
                </Pressable>
              )}
              <Pressable onPress={closePaymentSheet} style={passengerStyles.paymentCancel}>
                <Text style={passengerStyles.paymentCancelText}>Annuler</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <Modal visible={showExpiryPicker} transparent animationType="fade" onRequestClose={() => setShowExpiryPicker(false)}>
          <View style={passengerStyles.pickerOverlay}>
            <Pressable style={passengerStyles.pickerBackdrop} onPress={() => setShowExpiryPicker(false)} />
            <View style={passengerStyles.expiryPickerCard}>
              <Text style={passengerStyles.expiryPickerTitle}>Date d'expiration</Text>
              <View style={passengerStyles.expiryPickerRow}>
                <ScrollView contentContainerStyle={passengerStyles.expiryPickerList}>
                  {expiryMonths.map((month) => {
                    const selected = pickerExpiryMonth === month;
                    return (
                      <Pressable
                        key={month}
                        style={[
                          passengerStyles.expiryPickerItem,
                          selected && passengerStyles.expiryPickerItemActive,
                        ]}
                        onPress={() => setPickerExpiryMonth(month)}
                      >
                        <Text
                          style={[
                            passengerStyles.expiryPickerItemText,
                            selected && passengerStyles.expiryPickerItemTextActive,
                          ]}
                        >
                          {String(month).padStart(2, '0')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <ScrollView contentContainerStyle={passengerStyles.expiryPickerList}>
                  {expiryYears.map((year) => {
                    const selected = pickerExpiryYear === year;
                    return (
                      <Pressable
                        key={year}
                        style={[
                          passengerStyles.expiryPickerItem,
                          selected && passengerStyles.expiryPickerItemActive,
                        ]}
                        onPress={() => setPickerExpiryYear(year)}
                      >
                        <Text
                          style={[
                            passengerStyles.expiryPickerItemText,
                            selected && passengerStyles.expiryPickerItemTextActive,
                          ]}
                        >
                          {year}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <GradientButton
                title="Valider"
                onPress={confirmExpirySelection}
                disabled={!pickerExpiryMonth || !pickerExpiryYear}
                fullWidth
                style={passengerStyles.expiryPickerConfirm}
              />
              <Pressable onPress={() => setShowExpiryPicker(false)} style={passengerStyles.paymentCancel}>
                <Text style={passengerStyles.paymentCancelText}>Annuler</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </AppBackground>
  );
}

const passengerStyles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: 0,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },
  mapWrapper: {
    height: 400,
    width: 'auto',
    position: 'relative',
    marginHorizontal: -Spacing.lg,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  mapContent: {
    flex: 1,
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  mapImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroColumnWeb: {
    flexDirection: 'column',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  heroCardWeb: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  heroCardCompact: {
    padding: Spacing.md,
  },
  heroCardWebMap: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    marginTop: Spacing.md,
  },
  webMapHero: {
    width: '100%',
    height: 320,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  webMapError: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(12, 16, 28, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  webMapErrorText: {
    color: Colors.white,
    fontWeight: '700',
    textAlign: 'center',
  },
  mapBubbleStart: {
    position: 'absolute',
    top: '62%',
    left: '6%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 18,
    gap: Spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  mapBubbleDestination: {
    position: 'absolute',
    top: '28%',
    right: '8%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 33, 92, 0.95)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 18,
    gap: Spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  mapBubbleDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  mapBubbleDotDestination: {
    backgroundColor: Colors.secondary,
  },
  mapBubbleLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.gray500,
  },
  mapBubbleValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink,
  },
  mapBubbleLabelOnDark: {
    color: Colors.gray100,
  },
  mapBubbleValueOnDark: {
    color: Colors.white,
  },
  mapTitleCard: {
    position: 'absolute',
    top: 40,
    alignSelf: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.ink,
  },
  routeBadge: {
    position: 'absolute',
    right: Spacing.lg,
    top: '45%',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  routeTitle: {
    fontWeight: '800',
    color: '#FF9353',
  },
  routeDuration: {
    color: Colors.gray600,
    fontWeight: '600',
    fontSize: 12,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: -(Spacing.xxl * 3),
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    overflow: 'visible',
    zIndex: 10,
    elevation: 6,
  },
  sheetExpanded: {
    minHeight: 360,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  inputStack: {
    gap: Spacing.sm,
    position: 'relative',
    overflow: 'visible',
  },
  destinationColumn: {
    flex: 1,
    gap: Spacing.md,
  },
  campusChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  campusChip: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  campusChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  campusChipText: {
    fontWeight: '600',
    color: Colors.gray600,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  campusChipTextSelected: {
    color: Colors.primaryDark,
  },
  destinationRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
  },
  dropdownWrapper: {
    position: 'relative',
  },
  dropdownWrapperTop: {
    zIndex: 30,
  },
  dropdownWrapperBottom: {
    zIndex: 20,
  },
  dateSection: {
    minHeight: 70,
    width: '100%',
    justifyContent: 'center',
    marginTop: -Spacing.xs,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    zIndex: 5,
  },
  dateRowPlaceholder: {
    height: 60,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7F2',
    borderRadius: R.lg,
    paddingHorizontal: Spacing.sm,
    backgroundColor: '#F9F9FF',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
    fontSize: 16,
    color: Colors.ink,
  },
  swapRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: Spacing.sm,
  },
  swapIcon: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: 44,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#EEEFFC',
  },
  toInput: {
    alignItems: 'center',
    position: 'relative',
  },
  inlineButton: {
    marginLeft: Spacing.sm,
    borderRadius: R.pill,
  },
  smallInput: {
    flex: 1,
  },
  dropdownTrigger: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
  },
  dropdownText: {
    fontSize: 16,
    color: Colors.ink,
    fontWeight: '600',
  },
  dropdownTextInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
    fontSize: 16,
    color: Colors.ink,
    fontWeight: '600',
  },
  locationHelperRow: {
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: R.pill,
    backgroundColor: '#F1F5FF',
    alignSelf: 'flex-start',
  },
  locationChipDisabled: {
    opacity: 0.6,
  },
  locationChipText: {
    color: Colors.gray700,
    fontSize: 12,
    fontWeight: '600',
  },
  locationDetectedText: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    fontSize: 12,
    color: Colors.gray600,
    fontWeight: '500',
  },
  actionsColumn: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Spacing.xs,
  },
  swapButton: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#EEEFFC',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  fullSearchButton: {
    marginTop: Spacing.md,
  },
  fullSearchButtonLowered: {
    marginTop: Spacing.xxl * 2,
  },
  searchLoading: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchLoadingText: {
    color: Colors.gray600,
    fontWeight: '600',
  },
  pickerTrigger: {
    paddingRight: Spacing.md,
    minHeight: 56,
    justifyContent: 'center',
  },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 60,
    elevation: 8,
  },
  dropdownItem: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  dropdownItemText: {
    fontWeight: '600',
    color: Colors.ink,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: Spacing.lg,
    position: 'relative',
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  pickerCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: Spacing.lg,
    maxHeight: '80%',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  pickerGrid: {
    gap: Spacing.sm,
  },
  pickerOption: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: '#E5E7F2',
  },
  pickerOptionActive: {
    backgroundColor: '#FFE8F3',
    borderColor: '#FF70A0',
  },
  pickerOptionText: {
    fontWeight: '600',
    color: Colors.ink,
    textAlign: 'center',
  },
  pickerOptionTextActive: {
    color: '#C13584',
  },
  paymentOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  paymentBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  paymentHeader: {
    gap: 4,
  },
  paymentTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink,
  },
  paymentSubtitle: {
    color: Colors.gray600,
    fontWeight: '600',
  },
  paymentAmountBox: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 18,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentAmountLabel: {
    color: Colors.gray600,
    fontWeight: '600',
  },
  paymentAmountValue: {
    fontWeight: '800',
    color: Colors.ink,
    fontSize: 18,
  },
  paymentMethodsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  paymentMethodButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
    alignItems: 'center',
  },
  paymentMethodButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  paymentMethodText: {
    fontWeight: '600',
    color: Colors.gray600,
  },
  paymentMethodTextActive: {
    color: Colors.primaryDark,
  },
  paymentForm: {
    gap: Spacing.sm,
  },
  paymentInput: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontWeight: '600',
    color: Colors.ink,
    backgroundColor: '#F9F9FF',
  },
  paymentRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  paymentInputHalf: {
    flex: 1,
  },
  paymentInputPressable: {
    justifyContent: 'center',
  },
  paymentInputValue: {
    fontWeight: '600',
    color: Colors.ink,
  },
  paymentInputPlaceholder: {
    color: Colors.gray500,
  },
  paymentNoteBox: {
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    padding: Spacing.sm,
  },
  paymentNote: {
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  paymentError: {
    color: Colors.danger,
    fontWeight: '600',
  },
  applePayButton: {
    marginTop: Spacing.xs,
    borderRadius: 16,
    backgroundColor: '#000',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applePayButtonDisabled: {
    opacity: 0.5,
  },
  applePayText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  cardPayButton: {
    marginTop: Spacing.xs,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPayButtonDisabled: {
    opacity: 0.5,
  },
  cardPayContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardPayIcon: {
    fontSize: 18,
  },
  cardPayText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.4,
  },
  paymentCancel: {
    alignSelf: 'center',
    marginTop: Spacing.xs,
  },
  paymentCancelText: {
    color: Colors.gray600,
    fontWeight: '600',
  },
  expiryPickerCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  expiryPickerTitle: {
    fontWeight: '800',
    fontSize: 18,
    color: Colors.ink,
    textAlign: 'center',
  },
  expiryPickerRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  expiryPickerList: {
    paddingVertical: Spacing.xs,
  },
  expiryPickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginBottom: Spacing.xs,
    minWidth: 70,
    alignItems: 'center',
  },
  expiryPickerItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  expiryPickerItemText: {
    fontWeight: '600',
    color: Colors.gray600,
  },
  expiryPickerItemTextActive: {
    color: Colors.primaryDark,
  },
  expiryPickerConfirm: {
    marginTop: Spacing.sm,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  calendarNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: Colors.ink,
    textTransform: 'capitalize',
  },
  calendarWeekdays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  calendarWeekdayText: {
    width: '13.5%',
    textAlign: 'center',
    fontWeight: '600',
    color: Colors.gray500,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.xs,
  },
  calendarDay: {
    width: '13.5%',
    aspectRatio: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayDisabled: {
    opacity: 0.2,
  },
  calendarDaySelected: {
    backgroundColor: '#FFE8F3',
  },
  calendarDayText: {
    fontWeight: '600',
    color: Colors.ink,
  },
  calendarDayTextSelected: {
    color: '#C13584',
  },
  resultsCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  resultsTitle: {
    fontWeight: '800',
    fontSize: 18,
    color: Colors.ink,
  },
  resultsCount: {
    color: Colors.gray600,
    fontWeight: '600',
    fontSize: 13,
    marginTop: 2,
  },
  resultsHint: {
    color: Colors.gray600,
    fontSize: 12,
    lineHeight: 18,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,25,40,0.12)',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  filterButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(255,123,84,0.15)',
  },
  filterButtonText: {
    fontWeight: '700',
    color: Colors.gray700,
  },
  filterPanel: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  filterGroup: {
    gap: Spacing.xs,
  },
  filterGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: Colors.gray150,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  filterChipLabel: {
    fontWeight: '600',
    color: Colors.gray600,
    fontSize: 13,
  },
  filterChipLabelActive: {
    color: Colors.primaryDark,
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  filterToggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 16,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.15)',
  },
  filterToggleSwitchActive: {
    backgroundColor: 'rgba(255,123,84,0.4)',
  },
  filterToggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 12,
    backgroundColor: Colors.gray400,
    alignSelf: 'flex-start',
  },
  filterToggleThumbActive: {
    backgroundColor: Colors.primary,
    alignSelf: 'flex-end',
  },
  filterToggleLabel: {
    fontWeight: '600',
    color: Colors.gray600,
  },
  resultsEmpty: {
    color: Colors.gray600,
    fontSize: 13,
    lineHeight: 20,
  },
  resultsList: {
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  resultCardWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  resultCard: {
    borderRadius: 24,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  resultDriverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  resultAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  resultDriverTexts: {
    flex: 1,
  },
  resultDriverName: {
    fontWeight: '700',
    color: Colors.ink,
    fontSize: 16,
  },
  resultMetaText: {
    color: Colors.gray600,
    fontSize: 12,
    marginTop: 2,
  },
  resultStatsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 4,
  },
  resultStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: Colors.gray150,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  resultStatText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.gray600,
  },
  resultPricePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
  },
  resultPriceValue: {
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  resultSchedule: {
    color: Colors.gray600,
    fontSize: 13,
  },
  resultRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  resultRouteColumn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultRouteColumnDestination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultRouteLabel: {
    color: Colors.gray700,
    fontWeight: '600',
  },
  resultRouteDestination: {
    color: Colors.ink,
    fontWeight: '700',
  },
  resultReserveButton: {
    marginTop: Spacing.sm,
  },
});

function MyRideRow({
  ride,
  onEdit,
  onRemove,
  C,
  S,
}: {
  ride: Ride;
  onEdit: () => void;
  onRemove: (ride: Ride) => void;
  C: typeof DefaultColors;
  S: typeof Shadows;
}) {
  const seatsLeft = ride.seats - ride.passengers.length;
  const departed = hasRideDeparted(ride);
  const dayLabel = (() => {
    const departure = new Date(ride.departureAt);
    const now = new Date();
    if (departure.toDateString() === now.toDateString()) return 'Aujourd’hui';
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (departure.toDateString() === tomorrow.toDateString()) return 'Demain';
    return departure.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' });
  })();

  const statusLabel = departed ? 'Trajet terminé' : `${seatsLeft} place(s) restantes`;

  const handleEdit = () => {
    if (departed) {
      Alert.alert('Trajet terminé', 'Tu ne peux plus modifier un trajet déjà parti.');
      return;
    }
    onEdit();
  };

  const handleDelete = () => {
    if (departed) {
      Alert.alert('Trajet terminé', 'La suppression est désactivée après le départ.');
      return;
    }
    Alert.alert(
      'Supprimer le trajet',
      `Confirme la suppression du trajet ${ride.depart} → ${ride.destination} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => onRemove(ride),
        },
      ]
    );
  };

  const style = styles(C, S);

  const avatarUri = getAvatarUrl(ride.ownerEmail, 64);

  return (
    <View style={style.rideRow}>
      <View style={style.rideRowAvatar}>
        <Image source={{ uri: avatarUri }} style={style.rideRowAvatarImage} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={style.rideRowTitle}>
          {ride.depart} → {ride.destination}
        </Text>
        <View style={style.rideRowMetaRow}>
          <IconSymbol name="clock.fill" size={16} color={C.gray600} />
          <Text style={style.rideRowMeta}>
            {ride.time} • {dayLabel} • {statusLabel}
          </Text>
        </View>
        <View style={style.rideRowMetaRow}>
          <IconSymbol name="eurosign.circle" size={16} color={C.gray600} />
          <Text style={style.rideRowMeta}>
            €{ride.price.toFixed(2)} / passager
            {ride.pricingMode === 'double' ? ' • Aller + retour' : ''}
          </Text>
        </View>
        <View style={style.rideRowMetaRow}>
          <IconSymbol name="car.fill" size={16} color={C.gray600} />
          <Text style={style.rideRowMeta}>Plaque : {ride.plate}</Text>
        </View>
        <View style={style.rideRowMetaRow}>
          <IconSymbol name="person.2.fill" size={16} color={C.gray600} />
          <Text style={style.rideRowMeta}>
            Réservations : {ride.passengers.length}/{ride.seats}
          </Text>
        </View>
      </View>
      <View style={style.rideRowActions}>
        <GradientButton
          title="Modifier"
          size="sm"
          variant="lavender"
          fullWidth
          style={style.rideRowButton}
          onPress={handleEdit}
          accessibilityRole="button"
          disabled={departed}
        />
        <GradientButton
          title="Supprimer"
          size="sm"
          variant="danger"
          fullWidth
          style={style.rideRowButton}
          onPress={handleDelete}
          accessibilityRole="button"
          disabled={departed}
        />
      </View>
    </View>
  );
}

function Field({
  label,
  error,
  C,
  ...props
}: {
  label: string;
  error?: string;
  placeholder?: string;
  value: string;
  onChangeText: (s: string) => void;
  inputMode?: 'text' | 'numeric' | 'email' | 'tel' | 'search' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  C: typeof DefaultColors;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray600, marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        style={[
          {
            borderWidth: 1,
            borderColor: C.gray300,
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            fontSize: 16,
            color: C.ink,
            backgroundColor: C.gray150,
          },
          !!error && { borderColor: C.danger },
        ]}
        placeholderTextColor={C.gray500}
        {...props}
      />
      {!!error && <Text style={{ color: C.danger, fontSize: 12, marginTop: 6 }}>{error}</Text>}
    </View>
  );
}

const styles = (C: typeof DefaultColors, S: typeof Shadows) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },
    safe: { flex: 1, backgroundColor: 'transparent' },
    container: { padding: 16, paddingBottom: 28, gap: 14 },
    header: { alignItems: 'center', gap: 6, marginTop: 4 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerTitle: { fontSize: 22, fontWeight: '800', color: C.ink },
    headerSub: { color: C.gray600, textAlign: 'center', fontSize: 13 },
    introCard: { gap: 12 },
    introTitle: { fontWeight: '700', color: C.ink },
    introSubtitle: { color: C.gray600, fontSize: 13, lineHeight: 20 },
    introSteps: { gap: Spacing.xs },
    introRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    introText: { color: C.gray600, fontSize: 13, lineHeight: 18, flex: 1 },
    securityNotice: { gap: 10 },
    securityNoticeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    securityNoticeTitle: { color: C.warning, fontWeight: '700', fontSize: 14 },
    securityNoticeText: { color: C.gray600, fontSize: 12, lineHeight: 18 },
    securityNoticeButton: { alignSelf: 'flex-start' },
    quickCard: { gap: 10 },
    quickTitle: { fontWeight: '700', color: C.ink },
    quickSubtitle: { color: C.gray600, fontSize: 13 },
    quickList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    quickChip: {
      backgroundColor: C.gray150,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: R.pill,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    quickChipText: { color: C.gray600, fontWeight: '700', fontSize: 12 },
    pricingCard: { gap: 10 },
    pricingHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pricingTitle: { fontWeight: '700', color: C.ink, fontSize: 16 },
    pricingSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    pricingSummaryBlock: {
      flexGrow: 1,
      minWidth: 110,
      backgroundColor: C.gray150,
      borderRadius: R.md,
      padding: Spacing.sm,
      gap: 2,
    },
    pricingSummaryLabel: { color: C.gray600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 },
    pricingSummaryValue: { color: C.ink, fontWeight: '700' },
    pricingChipsRow: { gap: Spacing.sm },
    pricingChipDriver: {
      backgroundColor: C.secondaryLight,
      borderRadius: R.md,
      padding: Spacing.sm,
      gap: 2,
    },
    pricingChipPlatform: {
      backgroundColor: C.primaryLight,
      borderRadius: R.md,
      padding: Spacing.sm,
      gap: 2,
    },
    pricingChipTitle: { color: C.gray600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 },
    pricingChipValue: { color: C.ink, fontSize: 12 },
    pricingChipHint: { color: C.gray600, fontSize: 11 },
    pricingBreakdown: { gap: 10 },
    pricingRow: { gap: 4 },
    pricingRowLabel: { color: C.ink, fontSize: 13, fontWeight: '700' },
    pricingRowContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
    pricingRowValue: { color: C.gray600, fontSize: 11, flex: 1 },
    pricingRowAmount: { color: C.secondary, fontSize: 13, fontWeight: '700' },
    pricingHint: { color: C.gray500, fontSize: 12 },

    card: {
      borderRadius: 16,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.25)',
      backgroundColor: 'transparent',
    },
    formCard: { marginTop: 4 },

    notificationsCard: { gap: 12, borderColor: C.primary, borderWidth: 1 },
    notificationsHeader: { gap: Spacing.xs },
    notificationsTitle: { fontWeight: '800', color: C.primary, fontSize: 16 },
    notificationsSubtitle: { color: C.gray600, fontSize: 12 },
    notificationRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    notificationBody: { color: C.gray600, fontSize: 13, flexShrink: 1 },
    notificationTime: { color: C.gray500, fontSize: 12, marginTop: 2 },
    notificationRead: {
      backgroundColor: C.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
    notificationReadText: { color: '#fff', fontWeight: '700' },
    notificationHint: { color: C.gray500, fontSize: 12 },
    notificationEmpty: { color: C.gray600, fontSize: 12 },

    ridesCard: { gap: 12 },
    ridesTitle: { fontWeight: '800', color: C.ink, fontSize: 18 },
    ridesSubtitle: { color: C.gray700, fontSize: 12 },

    rideRow: {
      flexDirection: 'row',
      gap: 12,
      borderWidth: 1,
      borderColor: C.gray200,
      borderRadius: 12,
      padding: 12,
      backgroundColor: C.bg,
    },
    rideRowAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: C.gray150,
    },
    rideRowAvatarImage: {
      width: '100%',
      height: '100%',
    },
    rideRowTitle: { fontWeight: '700', color: C.ink },
    rideRowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rideRowMeta: { color: C.gray600, fontSize: 12 },
    rideRowActions: {
      flexDirection: 'row',
      gap: 8,
    },
    rideRowButton: {
      flex: 1,
      minWidth: 140,
    },

    mapCard: { gap: 12 },
    mapTitle: { fontWeight: '800', color: C.ink, marginBottom: 8 },
    mapHint: { color: C.gray700, fontSize: 12 },

    priceSection: { gap: Spacing.sm, marginTop: Spacing.sm },
    priceLabel: { fontWeight: '700', color: C.ink, fontSize: 14 },
    priceModeRow: { flexDirection: 'row', gap: Spacing.sm },
    priceModeButton: { flex: 1 },
    priceInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.gray300,
      borderRadius: 12,
      backgroundColor: C.gray150,
      paddingHorizontal: Spacing.sm,
    },
    priceInputPrefix: { color: C.gray600, fontWeight: '700', marginRight: 4 },
    priceInput: { flex: 1, fontSize: 16, color: C.ink, paddingVertical: 8 },
    priceBandText: { color: C.gray600, fontSize: 12 },

    preview: {
      backgroundColor: C.gray100,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: C.gray200,
      marginTop: 4,
    },
    previewText: { color: C.gray700, fontWeight: '700' },
    previewHint: { color: C.gray500, fontSize: 12 },
    price: { color: C.ink, fontWeight: '900' },

    cta: {
      marginTop: 10,
      alignSelf: 'stretch',
    },
    ctaGhost: {
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 6,
    },
    ctaGhostText: { color: C.gray700, fontWeight: '600' },
    error: { color: C.danger, fontSize: 12, marginTop: 8 },
  });
const formatCardNumber = (digits: string) => {
  if (!digits) return '';
  return digits
    .replace(/[^0-9]/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();
};

const maskCardNumberDisplay = (digits: string) => {
  if (!digits) return '';
  const normalized = digits.replace(/[^0-9]/g, '').slice(0, 16);
  if (normalized.length <= 4) return normalized;
  const maskedSection = normalized
    .slice(0, -4)
    .replace(/./g, '*');
  const visible = normalized.slice(-4);
  const grouped = `${maskedSection}${visible}`.match(/.{1,4}/g)?.join(' ') ?? `${maskedSection}${visible}`;
  return grouped;
};

const EXPIRY_YEARS_SPAN = 12;

const HERO_GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? 'AIzaSyCU9joaWe-_aSq4RMbqbLsrVi0pkC5iu8c';

type HeroSegment = {
  id: string;
  start: { latitude: number; longitude: number };
  end: { latitude: number; longitude: number };
  startLabel: string;
  endLabel: string;
};

const HERO_FALLBACK_SEGMENTS: HeroSegment[] = [
  {
    id: 'hero-fallback-1',
    start: { latitude: 50.8467, longitude: 4.3517 },
    end: { latitude: 50.8794, longitude: 4.7009 },
    startLabel: 'Grand-Place',
    endLabel: 'Leuven',
  },
];

const loadHeroGoogleMaps = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('window unavailable'));
  }
  if (window.google && window.google.maps) {
    return Promise.resolve(window.google);
  }
  if (window.__campusRideHeroMapLoader) {
    return window.__campusRideHeroMapLoader;
  }
  window.__campusRideHeroMapLoader = new Promise<any>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${HERO_GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Google Maps JS failed to load.'));
    document.head.appendChild(script);
  });
  return window.__campusRideHeroMapLoader;
};

const computeHeroCamera = (segments: HeroSegment[]) => {
  if (segments.length === 0) {
    return { center: { lat: 50.8503, lng: 4.3517 }, zoom: 11 };
  }
  const lats = segments.flatMap((segment) => [segment.start.latitude, segment.end.latitude]);
  const lngs = segments.flatMap((segment) => [segment.start.longitude, segment.end.longitude]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const latitudeDelta = Math.max((maxLat - minLat) * 1.4, 0.02);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.4, 0.02);
  const delta = Math.max(latitudeDelta, longitudeDelta);
  const zoom = Math.max(5, Math.min(15, Math.log2(360 / delta)));
  return { center, zoom };
};

const HeroWebMap = ({ rides }: { rides: Ride[] }) => {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const overlays = useRef<{ markers: any[]; polylines: any[] }>({ markers: [], polylines: [] });
  const [error, setError] = useState<string | null>(null);

  const segments = useMemo<HeroSegment[]>(() => {
    if (!rides.length) return HERO_FALLBACK_SEGMENTS;
    return rides.slice(0, 3).map((ride) => ({
      id: ride.id,
      start: getCoordinates(ride.depart),
      end: getCoordinates(ride.destination),
      startLabel: ride.depart,
      endLabel: ride.destination,
    }));
  }, [rides]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let mounted = true;
    loadHeroGoogleMaps()
      .then((google) => {
        if (!mounted || !mapNode.current) return;
        const camera = computeHeroCamera(segments);
        mapInstance.current = new google.maps.Map(mapNode.current, {
          center: camera.center,
          zoom: camera.zoom,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
        });
      })
      .catch(() => {
        if (mounted) {
          setError("Impossible d'afficher Google Maps.");
        }
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const google = window.google;
    const map = mapInstance.current;
    if (!google || !map) return;

    overlays.current.markers.forEach((marker) => marker.setMap(null));
    overlays.current.polylines.forEach((polyline) => polyline.setMap(null));
    overlays.current = { markers: [], polylines: [] };

    const camera = computeHeroCamera(segments);
    map.setCenter(camera.center);
    map.setZoom(camera.zoom);

    segments.forEach((segment) => {
      const path = [
        { lat: segment.start.latitude, lng: segment.start.longitude },
        { lat: segment.end.latitude, lng: segment.end.longitude },
      ];
      const polyline = new google.maps.Polyline({
        path,
        strokeColor: '#7A5FFF',
        strokeOpacity: 0.9,
        strokeWeight: 4,
        geodesic: true,
      });
      polyline.setMap(map);

      const start = new google.maps.Marker({
        position: path[0],
        title: segment.startLabel,
        label: 'A',
      });
      const end = new google.maps.Marker({
        position: path[1],
        title: segment.endLabel,
        label: 'B',
      });
      start.setMap(map);
      end.setMap(map);
      overlays.current.polylines.push(polyline);
      overlays.current.markers.push(start, end);
    });
  }, [segments]);

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View style={passengerStyles.webMapHero}>
      <div ref={mapNode} style={webMapSurfaceStyle} />
      {error ? (
        <View style={passengerStyles.webMapError}>
          <Text style={passengerStyles.webMapErrorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
};

const webMapSurfaceStyle: CSSProperties = {
  width: '100%',
  height: '100%',
};

declare global {
  interface Window {
    __campusRideHeroMapLoader?: Promise<any>;
  }
}

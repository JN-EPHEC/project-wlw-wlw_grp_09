// app/(tabs)/explore.tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { RideMap } from '../../components/ride-map';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RewardBadge } from '@/components/reward-badge';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useDriverSecurity } from '@/hooks/use-driver-security';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { buildPriceBand, clampPriceToBand, estimatePrice, roughKmFromText, type PriceQuote } from '../services/pricing';
import {
  addRide,
  getRide,
  hasRideDeparted,
  removeRide,
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
import { applyRewards, type RewardSnapshot } from '../services/rewards';
import {
  needsFreshSelfie,
  normalizePlate,
  remindVehicleMismatch,
} from '../services/security';
import { Colors, Gradients, Shadows, Radius as ThemeRadius, Spacing as ThemeSpacing } from '../ui/theme';
import { getAvatarUrl } from '../ui/avatar';

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

const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
type QuickSuggestion = {
  label: string;
  depart: string;
  destination: string;
  time: string;
  seats: string;
};

export default function ExplorePublish() {
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string }>();
  const session = useAuthSession();
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

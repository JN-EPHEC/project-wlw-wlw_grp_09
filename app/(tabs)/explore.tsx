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

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useDriverSecurity } from '@/hooks/use-driver-security';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import type { AuthSnapshot } from '@/app/services/auth';
import {
  hasRideDeparted,
  reserveSeat,
  subscribeRides,
  addRide,
  type Ride,
} from '../services/rides';
import type { PaymentMethod } from '../services/payments';
import { getCoordinates, getDistanceKm, getDurationMinutes } from '../services/distance';
import { loadGoogleMapsApi } from '../services/google-maps-loader';
import { Colors, Gradients, Shadows, Radius as ThemeRadius, Spacing as ThemeSpacing } from '../ui/theme';
import { getAvatarUrl } from '../ui/avatar';
import { BRUSSELS_COMMUNES } from '@/constants/communes';
import { CAMPUS_LOCATIONS, findCampusLocation } from '@/constants/campuses';
import { getCurrentCommune, LocationPermissionError } from '../services/location';
import { maskPlate } from '@/app/utils/plate';
import { getWallet, subscribeWallet, type WalletSnapshot } from '../services/wallet';

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

const PRICE_MIN = 2;
const PRICE_MAX = 12;
const PRICE_STEP = 0.5;

type ExploreParams = { edit?: string; depart?: string; campus?: string; requireSchedule?: string };

const derivePseudoRating = (ride: Ride) => {
  const seed = ride.driver.length + ride.destination.length;
  const base = 4 + (seed % 10) / 20;
  return Math.min(4.9, Math.round(base * 10) / 10);
};

type PassengerExplorePersistedState = {
  fromCampus: string;
  toCampus: string;
  selectedDateISO: string;
  travelTime: string;
  hasConfirmedDate: boolean;
  hasConfirmedTime: boolean;
  priceLimit: number;
  draftPriceLimit: number;
  moreFiltersVisible: boolean;
  searchResults: Ride[];
  searchPerformed: boolean;
  validationTouched: boolean;
  searchInstance: number;
  scrollOffset: number;
};

let passengerExplorePersistedState: PassengerExplorePersistedState | null = null;

const cloneRideList = (list: Ride[]): Ride[] =>
  list.map((ride) => ({
    ...ride,
    passengers: [...ride.passengers],
    canceledPassengers: [...ride.canceledPassengers],
  }));


const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map((part) => parseInt(part, 10) || 0);
  return hours * 60 + minutes;
};

export default function ExplorePublish() {
  const session = useAuthSession();
  const params = useLocalSearchParams<ExploreParams>();
  const passengerOnly = session.isPassenger && !session.isDriver;
  const initialDepart = typeof params.depart === 'string' ? params.depart : undefined;
  const initialDestination = typeof params.campus === 'string' ? params.campus : undefined;
  const requireScheduleConfirmation = params.requireSchedule === '1';
  if (passengerOnly) {
    return (
      <PassengerPublishScreen
        session={session}
        initialDepart={initialDepart}
        initialDestination={initialDestination}
        requireSchedule={requireScheduleConfirmation}
      />
    );
  }
  return <DriverPublishScreen />;
}

function DriverPublishScreen() {
  const session = useAuthSession();
  const pinchScale = useRef(new Animated.Value(1)).current;
  const baseScale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);
  const mapScale = Animated.multiply(baseScale, pinchScale);
  const MIN_MAP_SCALE = 1;
  const MAX_MAP_SCALE = 2.4;
  const defaultTomorrow = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next;
  }, []);

  const pinchGestureHandler = useMemo(
    () =>
      Animated.event([{ nativeEvent: { scale: pinchScale } }], {
        useNativeDriver: true,
      }),
    [pinchScale]
  );

  const handlePinchStateChange = useCallback(
    (event: { nativeEvent: { state: number; scale: number } }) => {
      if (
        event.nativeEvent.state === State.END ||
        event.nativeEvent.state === State.CANCELLED
      ) {
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
    [baseScale, pinchScale]
  );

  const router = useRouter();
  const tabBarInset = useTabBarInset(Spacing.xl);
  const security = useDriverSecurity(session.email);
  const registeredPlate = security?.vehicle?.plate?.trim() ?? '';
  const [isPublishingRide, setIsPublishingRide] = useState(false);
  const scrollContentStyle = useMemo(
    () => [passengerStyles.scrollContent, { paddingBottom: tabBarInset + Spacing.xxl }],
    [tabBarInset]
  );

  const [meetingPoint, setMeetingPoint] = useState('');
  const [destination, setDestination] = useState('');
  const [places, setPlaces] = useState(1);
  const [selectedDate, setSelectedDate] = useState(defaultTomorrow);
  const [travelTime, setTravelTime] = useState('09:00');
  const [hasConfirmedDate, setHasConfirmedDate] = useState(false);
  const [hasConfirmedTime, setHasConfirmedTime] = useState(false);
  const [showMeetingList, setShowMeetingList] = useState(false);
  const [showDestinationList, setShowDestinationList] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(defaultTomorrow.getMonth());
  const [calendarYear, setCalendarYear] = useState(defaultTomorrow.getFullYear());
  const [detectedMeetingCommune, setDetectedMeetingCommune] = useState<string | null>(null);
  const [validationTouched, setValidationTouched] = useState(false);
  const meetingBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const timeOptions = useMemo(() => {
    const slots: string[] = [];
    for (let hour = 6; hour <= 22; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
      slots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    return slots;
  }, []);

  const isSameDay = useCallback((a: Date, b: Date) => {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }, []);

  const campusOptions = ['EPHEC Woluwe', 'EPHEC Delta', 'EPHEC Louvain-la-Neuve', 'EPHEC Schaerbeek'];

  const availableTimeOptions = useMemo(() => {
    const now = new Date();
    if (!isSameDay(selectedDate, now)) {
      return timeOptions;
    }
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const filtered = timeOptions.filter((slot) => {
      const [hours, minutes] = slot.split(':').map((value) => parseInt(value, 10));
      return hours * 60 + minutes >= nowMinutes;
    });
    return filtered.length ? filtered : timeOptions;
  }, [isSameDay, selectedDate, timeOptions]);

  const calendarDays = useMemo(() => {
    const days: { key: string; date: Date | null; label: string }[] = [];
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) {
      days.push({
        key: `empty-${calendarMonth}-${calendarYear}-${i}`,
        date: null,
        label: '',
      });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(calendarYear, calendarMonth, day);
      days.push({
        key: dateObj.toISOString(),
        date: dateObj,
        label: day.toString(),
      });
    }
    while (days.length % 7 !== 0) {
      const idx = days.length;
      days.push({
        key: `pad-${calendarMonth}-${calendarYear}-${idx}`,
        date: null,
        label: '',
      });
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

  const animateDropdown = useCallback(() => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(160, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
  }, []);

  const communeSuggestions = useMemo(() => {
    const query = meetingPoint.trim().toLowerCase();
    const base =
      query.length === 0
        ? BRUSSELS_COMMUNES.slice(0, 6)
        : BRUSSELS_COMMUNES.filter((commune) =>
            commune.toLowerCase().includes(query)
          ).slice(0, 10);
    const unique = Array.from(new Set(base));
    return ['Utiliser ma position', ...unique];
  }, [meetingPoint]);

  const closeDropdowns = useCallback(() => {
    animateDropdown();
    setShowMeetingList(false);
    setShowDestinationList(false);
  }, [animateDropdown]);

  const handleMeetingFocus = useCallback(() => {
    if (meetingBlurTimeout.current) {
      clearTimeout(meetingBlurTimeout.current);
      meetingBlurTimeout.current = null;
    }
    animateDropdown();
    setShowMeetingList(true);
    setShowDestinationList(false);
  }, [animateDropdown]);

  const handleMeetingBlur = useCallback(() => {
    meetingBlurTimeout.current = setTimeout(() => {
      setShowMeetingList(false);
    }, 120);
  }, []);

  const handleUseMeetingLocation = useCallback(async () => {
    try {
      const { commune } = await getCurrentCommune();
      setMeetingPoint(commune);
      setDetectedMeetingCommune(commune);
      setShowMeetingList(false);
    } catch (error) {
      if (error instanceof LocationPermissionError) {
        Alert.alert('Localisation désactivée', 'Active la localisation pour remplir automatiquement votre position.');
      } else {
        Alert.alert(
          'Position indisponible',
          'Impossible de récupérer votre position. Réessaie dans un instant.'
        );
      }
    }
  }, []);

  const selectMeetingPoint = useCallback(
    (commune: string) => {
      if (commune === 'Utiliser ma position') {
        handleUseMeetingLocation();
        return;
      }
      setMeetingPoint(commune);
      setDetectedMeetingCommune(null);
      animateDropdown();
      setShowMeetingList(false);
    },
    [animateDropdown, handleUseMeetingLocation]
  );

  const selectDestinationCampus = useCallback(
    (campus: string) => {
      setDestination(campus);
      animateDropdown();
      setShowDestinationList(false);
    },
    [animateDropdown]
  );

  const toggleDestinationList = useCallback(() => {
    animateDropdown();
    setShowDestinationList((prev) => {
      const next = !prev;
      if (next) {
        setShowMeetingList(false);
      }
      return next;
    });
  }, [animateDropdown]);

  const goToPrevMonth = useCallback(() => {
    setCalendarMonth((prev) => {
      if (prev === 0) {
        setCalendarYear((year) => year - 1);
        return 11;
      }
      return prev - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setCalendarMonth((prev) => {
      if (prev === 11) {
        setCalendarYear((year) => year + 1);
        return 0;
      }
      return prev + 1;
    });
  }, []);

  const openDatePicker = useCallback(() => {
    setCalendarMonth(selectedDate.getMonth());
    setCalendarYear(selectedDate.getFullYear());
    setShowDatePicker(true);
  }, [selectedDate]);

  const handleSelectDate = useCallback(
    (date: Date | null) => {
      if (!date) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) return;
      setSelectedDate(date);
      setHasConfirmedDate(true);
      setShowDatePicker(false);
    },
    []
  );

  const handleSelectTime = useCallback(
    (slot: string) => {
      const [hours, minutes] = slot.split(':').map((value) => parseInt(value, 10));
      const now = new Date();
      const selection = new Date(selectedDate);
      selection.setHours(hours, minutes, 0, 0);
      if (selection.getTime() < now.getTime()) {
        return;
      }
      setTravelTime(slot);
      setHasConfirmedTime(true);
      setShowTimePicker(false);
    },
    [selectedDate]
  );

  const travelDateLabel = useMemo(
    () =>
      selectedDate.toLocaleDateString('fr-BE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    [selectedDate]
  );

  const dropdownOpen = showMeetingList || showDestinationList;

  const destinationLabel = destination && destination.trim() ? destination : 'Sélectionnez un campus';

  const estimatedMinutes = useMemo(() => {
    if (!meetingPoint.trim() || !destination.trim()) return null;
    const minutes = getDurationMinutes(meetingPoint, destination);
    if (!Number.isFinite(minutes)) return null;
    return minutes;
  }, [meetingPoint, destination]);

  const heroDepartLabel = meetingPoint.trim().length ? meetingPoint : 'Commune au choix';
  const heroArrivalLabel = destination.trim().length ? destination : 'Destination EPHEC';
  const heroDurationLabel = estimatedMinutes ? `${estimatedMinutes} min estimées` : 'Temps estimé';

  const routeVisual = useMemo(() => {
    if (!destination) return defaultRouteVisual;
    const key = destination.toLowerCase();
    const match = ROUTE_VISUALS.find((item) => key.includes(item.key));
    return match ?? defaultRouteVisual;
  }, [destination]);

  const validationMessage = useMemo(() => {
    if (!validationTouched) return null;
    if (!meetingPoint.trim() || !destination.trim()) {
      return 'Complétez les points de trajet.';
    }
    if (!hasConfirmedDate) {
      return 'Choisissez une date future.';
    }
    if (!hasConfirmedTime) {
      return 'Choisissez une heure valide.';
    }
    if (places <= 0) {
      return 'Indiquez le nombre de places disponibles.';
    }
    return null;
  }, [
    validationTouched,
    meetingPoint,
    destination,
    hasConfirmedDate,
    hasConfirmedTime,
    places,
  ]);

  const canPublish =
    !!meetingPoint.trim() &&
    !!destination.trim() &&
    hasConfirmedDate &&
    hasConfirmedTime &&
    places > 0;

  const handlePublish = useCallback(() => {
    if (isPublishingRide) return;
    setValidationTouched(true);
    if (!session.email) {
      Alert.alert('Connexion requise', 'Connecte-toi pour publier un trajet.');
      return;
    }
    if (!session.isDriver) {
      Alert.alert('Mode conducteur requis', 'Active ton rôle conducteur pour publier un trajet.');
      return;
    }
    if (!registeredPlate) {
      Alert.alert('Plaque manquante', 'Enregistre ton véhicule dans la vérification conducteur.');
      return;
    }
    if (!canPublish) {
      return;
    }

    setIsPublishingRide(true);
    try {
      const rideId = `ride-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      addRide({
        id: rideId,
        driver: session.name ?? 'Conducteur',
        plate: registeredPlate,
        depart: meetingPoint.trim(),
        destination: destination.trim(),
        time: travelTime,
        seats: places,
        price: 0,
        ownerEmail: session.email,
        pricingMode: 'single',
      });
      Alert.alert('Trajet publié', 'Ton trajet apparaît maintenant dans Mes trajets.');
      router.push('/driver-published');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de publier ce trajet.';
      Alert.alert('Erreur', message);
    } finally {
      setIsPublishingRide(false);
    }
  }, [
    canPublish,
    destination,
    isPublishingRide,
    meetingPoint,
    places,
    registeredPlate,
    router,
    session.email,
    session.isDriver,
    session.name,
    travelTime,
  ]);

  const meetingOptions = communeSuggestions;

  const increasePlaces = useCallback(() => {
    setPlaces((prev) => Math.min(prev + 1, 5));
  }, []);

  const decreasePlaces = useCallback(() => {
    setPlaces((prev) => Math.max(prev - 1, 1));
  }, []);

  const renderFormBody = () => (
    <>
      <Text style={passengerStyles.sheetTitle}>Publier un trajet</Text>
      <View
        style={[
          passengerStyles.destinationRow,
          dropdownOpen && passengerStyles.destinationRowRaised,
        ]}
      >
        <View
          style={[
            passengerStyles.destinationColumn,
            dropdownOpen && passengerStyles.dropdownRaised,
          ]}
        >
          <View style={[passengerStyles.dropdownWrapper, passengerStyles.dropdownWrapperTop]}>
            <Text style={passengerStyles.dropdownLabel}>POINT DE RENCONTRE</Text>
            <View style={passengerStyles.inputWrapper}>
              <IconSymbol name="location.fill" size={18} color={Colors.gray500} />
              <TextInput
                style={passengerStyles.dropdownTextInput}
                value={meetingPoint}
                onChangeText={(value) => {
                  setMeetingPoint(value);
                  setDetectedMeetingCommune(null);
                  if (!showMeetingList) {
                    animateDropdown();
                    setShowMeetingList(true);
                  }
                }}
                placeholder="Saisir votre adresse"
                placeholderTextColor={Colors.gray400}
                onFocus={handleMeetingFocus}
                onBlur={handleMeetingBlur}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
              />
            </View>
            {detectedMeetingCommune ? (
              <Text style={passengerStyles.locationDetectedText}>
                Commune détectée : {detectedMeetingCommune}
              </Text>
            ) : null}
            {showMeetingList ? (
              <View style={passengerStyles.dropdownList}>
                {meetingOptions.map((commune) => (
                  <Pressable
                    key={commune}
                    style={passengerStyles.dropdownItem}
                    onPress={() => selectMeetingPoint(commune)}
                  >
                    <Text style={passengerStyles.dropdownItemText}>{commune}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          <View style={[passengerStyles.dropdownWrapper, passengerStyles.dropdownWrapperBottom]}>
            <Text style={passengerStyles.dropdownLabel}>DESTINATION</Text>
            <View style={[passengerStyles.inputWrapper, passengerStyles.toInput]}>
              <IconSymbol name="graduationcap.fill" size={18} color={Colors.gray500} />
              <Pressable
                style={passengerStyles.dropdownTrigger}
                onPress={toggleDestinationList}
                accessibilityRole="button"
                accessibilityLabel="Choisir un campus de destination"
              >
                <Text
                  style={[
                    passengerStyles.dropdownText,
                    !destination && passengerStyles.dropdownTextPlaceholder,
                  ]}
                >
                  {destinationLabel}
                </Text>
              </Pressable>
            </View>
            {showDestinationList ? (
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
            accessibilityLabel="Inverser les points de trajet"
            onPress={() => {
              closeDropdowns();
              setMeetingPoint(destination);
              setDestination(meetingPoint);
              setDetectedMeetingCommune(null);
            }}
          >
            <IconSymbol name="chevron.up" size={18} color="#7A7A98" />
            <IconSymbol name="chevron.down" size={18} color="#7A7A98" />
          </Pressable>
        </View>
      </View>
      <View style={passengerStyles.dateSection}>
        <View style={passengerStyles.dateRow} pointerEvents={dropdownOpen ? 'none' : 'auto'}>
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
            <Text
              style={[
                passengerStyles.dropdownText,
                !hasConfirmedDate && passengerStyles.dropdownTextPlaceholder,
              ]}
            >
              {hasConfirmedDate ? travelDateLabel : 'Choisir une date'}
            </Text>
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
            <Text
              style={[
                passengerStyles.dropdownText,
                !hasConfirmedTime && passengerStyles.dropdownTextPlaceholder,
              ]}
            >
              {hasConfirmedTime ? travelTime : 'Choisir une heure'}
            </Text>
          </Pressable>
        </View>
        {validationMessage ? <Text style={passengerStyles.dateError}>{validationMessage}</Text> : null}
      </View>
      <View style={{ gap: Spacing.xs }}>
        <Text style={passengerStyles.dropdownLabel}>PLACES DISPONIBLES</Text>
        <View
          style={[
            passengerStyles.inputWrapper,
            passengerStyles.smallInput,
            { justifyContent: 'space-between', paddingVertical: Spacing.sm },
          ]}
        >
          <IconSymbol name="person.fill" size={18} color={Colors.gray500} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Pressable
              style={{ padding: Spacing.md }}
              onPress={decreasePlaces}
              accessibilityRole="button"
              accessibilityLabel="Réduire le nombre de places"
            >
              <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.gray500 }}>−</Text>
            </Pressable>
            <Text style={{ fontWeight: '700', color: Colors.ink, fontSize: 16 }}>{places}</Text>
            <Pressable
              style={{ padding: Spacing.md }}
              onPress={increasePlaces}
              accessibilityRole="button"
              accessibilityLabel="Augmenter le nombre de places"
            >
              <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.gray500 }}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <Pressable style={passengerStyles.moreFiltersButton}>
        <Text style={passengerStyles.moreFiltersButtonText}>Plus de filtres</Text>
      </Pressable>
      <View style={passengerStyles.searchButtonWrapper}>
        <View style={passengerStyles.searchButtonShield} />
        <GradientButton
          title="Publier un trajet"
          onPress={handlePublish}
          size="sm"
          variant="cta"
          fullWidth
          style={passengerStyles.fullSearchButton}
          contentStyle={{ gap: isPublishingRide ? Spacing.sm : 8 }}
          accessibilityRole="button"
          disabled={!canPublish || isPublishingRide}
        >
          {isPublishingRide ? <ActivityIndicator color="#fff" size="small" /> : null}
        </GradientButton>
      </View>
    </>
  );

  const renderDatePickerModal = () => (
    <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
      <View style={passengerStyles.pickerOverlay}>
        <Pressable style={passengerStyles.pickerBackdrop} onPress={() => setShowDatePicker(false)} />
        <View style={passengerStyles.pickerCard}>
          <View style={passengerStyles.calendarHeader}>
            <Pressable
              style={passengerStyles.calendarNavButton}
              onPress={goToPrevMonth}
              accessibilityRole="button"
            >
              <IconSymbol name="chevron.left" size={20} color={Colors.gray600} />
            </Pressable>
            <Text style={passengerStyles.calendarTitle}>{calendarTitle}</Text>
            <Pressable
              style={passengerStyles.calendarNavButton}
              onPress={goToNextMonth}
              accessibilityRole="button"
            >
              <IconSymbol name="chevron.right" size={20} color={Colors.gray600} />
            </Pressable>
          </View>
          <View style={passengerStyles.calendarWeekdays}>
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((label) => (
              <Text key={label} style={passengerStyles.calendarWeekdayText}>
                {label}
              </Text>
            ))}
          </View>
          <View style={passengerStyles.calendarGrid}>
            {calendarDays.map((day) => {
              const selected = day.date ? isSameDay(day.date, selectedDate) : false;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const disabled = day.date ? day.date < today : true;
              return (
                <Pressable
                  key={day.key}
                  style={[
                    passengerStyles.calendarDay,
                    disabled && passengerStyles.calendarDayDisabled,
                    selected && passengerStyles.calendarDaySelected,
                  ]}
                  disabled={!day.date || disabled}
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
  );

  const renderTimePickerModal = () => (
    <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
      <View style={passengerStyles.pickerOverlay}>
        <Pressable style={passengerStyles.pickerBackdrop} onPress={() => setShowTimePicker(false)} />
        <View style={passengerStyles.pickerCard}>
          <Text style={passengerStyles.pickerTitle}>Choisir une heure</Text>
          <ScrollView contentContainerStyle={passengerStyles.pickerGrid}>
            {availableTimeOptions.map((slot) => (
              <Pressable
                key={slot}
                style={[
                  passengerStyles.pickerOption,
                  travelTime === slot && passengerStyles.pickerOptionActive,
                ]}
                onPress={() => handleSelectTime(slot)}
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
  );

  const mapNode =
    Platform.OS === 'web' ? (
      <HeroWebMap
        rides={[]}
        depart={meetingPoint.trim() ? meetingPoint : undefined}
        destination={destination.trim() ? destination : undefined}
      />
    ) : (
      <PinchGestureHandler
        onGestureEvent={pinchGestureHandler}
        onHandlerStateChange={handlePinchStateChange}
      >
        <Animated.View
          style={[
            passengerStyles.mapContent,
            { transform: [{ scale: mapScale }] },
          ]}
        >
          <Image
            source={HERO_MAP_IMAGE}
            style={passengerStyles.mapImage}
            resizeMode="cover"
          />
          <View pointerEvents="none" style={passengerStyles.mapTitleCard}>
            <Text style={passengerStyles.mapTitle}>Trouver un trajet</Text>
          </View>
          <View style={passengerStyles.routeBadge}>
            <Text style={passengerStyles.routeTitle}>{heroArrivalLabel}</Text>
            <Text style={passengerStyles.routeDuration}>
              {heroDurationLabel}
            </Text>
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
              <Text style={passengerStyles.mapBubbleValue}>
                {heroDepartLabel}
              </Text>
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
                style={[
                  passengerStyles.mapBubbleLabel,
                  passengerStyles.mapBubbleLabelOnDark,
                ]}
              >
                Destination
              </Text>
              <Text
                style={[
                  passengerStyles.mapBubbleValue,
                  passengerStyles.mapBubbleValueOnDark,
                ]}
              >
                {heroArrivalLabel}
              </Text>
            </View>
          </View>
        </Animated.View>
      </PinchGestureHandler>
    );

  const renderFormCard = () => (
    <View style={[passengerStyles.sheet, passengerStyles.sheetExpanded]}>
      {renderFormBody()}
    </View>
  );

  return (
    <AppBackground colors={Gradients.driver}>
      <SafeAreaView style={passengerStyles.safe}>
        <ScrollView
          contentContainerStyle={scrollContentStyle}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          style={{ flex: 1 }}
        >
          {Platform.OS === 'web' ? (
            <View style={passengerStyles.heroColumnWeb}>
              <View
                style={[passengerStyles.heroCardWeb, passengerStyles.heroCardWebMap]}
              >
                <View style={passengerStyles.webMapHero}>{mapNode}</View>
              </View>
              <View style={[passengerStyles.heroCardWeb, passengerStyles.heroCardCompact]}>
                {renderFormBody()}
              </View>
            </View>
          ) : (
            <>
              <View style={passengerStyles.mapWrapper}>{mapNode}</View>
              {renderFormCard()}
            </>
          )}
        </ScrollView>
        {renderDatePickerModal()}
        {renderTimePickerModal()}
      </SafeAreaView>
    </AppBackground>
  );
}

function PassengerPublishScreen({
  session,
  initialDepart,
  initialDestination,
  requireSchedule,
}: {
  session: AuthSnapshot;
  initialDepart?: string;
  initialDestination?: string;
  requireSchedule?: boolean;
}) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView | null>(null);
  const restoredState = passengerExplorePersistedState;
  const scheduleRequired = !!requireSchedule;
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
  const [fromCampus, setFromCampus] = useState(restoredState?.fromCampus ?? initialDepart ?? '');
  const [toCampus, setToCampus] = useState(restoredState?.toCampus ?? initialDestination ?? '');
  const [selectedDate, setSelectedDate] = useState(() => {
    if (restoredState?.selectedDateISO) {
      const parsed = new Date(restoredState.selectedDateISO);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return defaultTomorrow;
  });
  const [travelTime, setTravelTime] = useState(restoredState?.travelTime ?? '09:00');
  const [hasConfirmedDate, setHasConfirmedDate] = useState(restoredState?.hasConfirmedDate ?? false);
  const [hasConfirmedTime, setHasConfirmedTime] = useState(restoredState?.hasConfirmedTime ?? false);
  const [showDestList, setShowDestList] = useState(false);
  const [showFromList, setShowFromList] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(selectedDate.getMonth());
  const [calendarYear, setCalendarYear] = useState(selectedDate.getFullYear());
  const campusOptions = ['EPHEC Woluwe', 'EPHEC Delta', 'EPHEC Louvain-la-Neuve', 'EPHEC Schaerbeek'];
  const [rides, setRides] = useState<Ride[]>([]);
  const [ridesReady, setRidesReady] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [detectedCommune, setDetectedCommune] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Ride[]>(() =>
    restoredState?.searchResults ? cloneRideList(restoredState.searchResults) : []
  );
  const [wallet, setWallet] = useState<WalletSnapshot | null>(() =>
    session.email ? getWallet(session.email) : null
  );
  const [moreFiltersVisible, setMoreFiltersVisible] = useState(restoredState?.moreFiltersVisible ?? false);
  const restoredPriceLimit = restoredState?.priceLimit ?? 8;
  const restoredDraftPriceLimit = restoredState?.draftPriceLimit ?? restoredPriceLimit;
  const [priceLimit, setPriceLimit] = useState(restoredPriceLimit);
  const [draftPriceLimit, setDraftPriceLimit] = useState(restoredDraftPriceLimit);
  const [priceSliderWidth, setPriceSliderWidth] = useState(1);
  const [searchPerformed, setSearchPerformed] = useState(restoredState?.searchPerformed ?? false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchInstance, setSearchInstance] = useState(restoredState?.searchInstance ?? 0);
  const [resultsOffset, setResultsOffset] = useState<number | null>(null);
  const fromBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [validationTouched, setValidationTouched] = useState(restoredState?.validationTouched ?? false);
  const [useManualCardEntry, setUseManualCardEntry] = useState(false);
  const scrollOffsetRef = useRef(restoredState?.scrollOffset ?? 0);
  const stateSnapshotRef = useRef<PassengerExplorePersistedState | null>(null);

  useEffect(() => {
    if (scheduleRequired) {
      setHasConfirmedDate(false);
      setHasConfirmedTime(false);
    }
  }, [scheduleRequired]);

  useEffect(() => {
    if (!restoredState?.scrollOffset) return;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ y: restoredState.scrollOffset, animated: false });
      }
    });
  }, [restoredState?.scrollOffset]);

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
  setDraftPriceLimit(priceLimit);
}, [priceLimit]);
useEffect(() => {
  stateSnapshotRef.current = {
    fromCampus,
    toCampus,
    selectedDateISO: selectedDate.toISOString(),
    travelTime,
    hasConfirmedDate,
    hasConfirmedTime,
    priceLimit,
    draftPriceLimit,
    moreFiltersVisible,
    searchResults: cloneRideList(searchResults),
    searchPerformed,
    validationTouched,
    searchInstance,
    scrollOffset: scrollOffsetRef.current,
  };
}, [
  fromCampus,
  toCampus,
  selectedDate,
  travelTime,
  hasConfirmedDate,
  hasConfirmedTime,
  priceLimit,
  draftPriceLimit,
  moreFiltersVisible,
  searchResults,
  searchPerformed,
  validationTouched,
  searchInstance,
]);
useEffect(() => {
  return () => {
    passengerExplorePersistedState = stateSnapshotRef.current;
  };
}, []);
const [reservingRideId, setReservingRideId] = useState<string | null>(null);
const [paymentRide, setPaymentRide] = useState<Ride | null>(null);
const [paymentMethodChoice, setPaymentMethodChoice] = useState<'apple-pay' | 'card' | 'wallet'>('apple-pay');
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
  const scopedResults = searchResults;
  const ridesCardList = useMemo(() => {
    return [...scopedResults]
      .filter((ride) => ride.seats - ride.passengers.length >= 1)
      .filter((ride) => ride.price <= priceLimit + 0.001)
      .sort((a, b) => a.departureAt - b.departureAt);
  }, [priceLimit, scopedResults]);
  const resultsCountLabel = useMemo(() => {
    if (!searchPerformed) return 'Prêt à lancer une recherche';
    if (ridesCardList.length === 0) {
      return scopedResults.length === 0 ? 'Aucun trajet' : 'Aucun trajet disponible';
    }
    return `${ridesCardList.length} trouvés`;
  }, [ridesCardList.length, scopedResults.length, searchPerformed]);
  const resultsEmptyLabel = useMemo(() => {
    if (scopedResults.length === 0) {
      return 'Aucun trajet ne correspond à cette recherche. Ajuste les horaires ou retente plus tard.';
    }
    return 'Aucun trajet ne correspond à cette recherche. Ajuste les horaires ou retente plus tard.';
  }, [scopedResults.length]);

  const ridesCardCountLabel = resultsCountLabel;
  const fallbackHomeResults = useMemo(() => {
    return upcomingHomeRides.filter((ride) => ride.passengers.length < ride.seats).slice(0, 4);
  }, [upcomingHomeRides]);
  const hasPrimaryResults = ridesCardList.length > 0;
  const fallbackCountLabel = `${fallbackHomeResults.length} suggestion(s)`;
  const walletBalance = wallet?.balance ?? 0;
  const defaultWalletCard = useMemo(() => {
    if (!wallet) return null;
    const preferred = wallet.defaultPaymentMethodId
      ? wallet.paymentMethods.find((method) => method.id === wallet.defaultPaymentMethodId)
      : null;
    return preferred ?? wallet.paymentMethods[0] ?? null;
  }, [wallet]);
  const defaultWalletCardLabel = useMemo(() => {
    if (!defaultWalletCard) return null;
    const brand = defaultWalletCard.brand || 'Carte';
    return `${brand} ••••${defaultWalletCard.last4}`;
  }, [defaultWalletCard]);
  const defaultWalletCardExpiry = useMemo(() => {
    if (!defaultWalletCard?.expMonth || !defaultWalletCard?.expYear) return null;
    const month = String(defaultWalletCard.expMonth).padStart(2, '0');
    const year = String(defaultWalletCard.expYear).slice(-2);
    return `${month}/${year}`;
  }, [defaultWalletCard]);
  const canUseSavedCard = !!defaultWalletCard;
  useEffect(() => {
    if (paymentMethodChoice !== 'card') {
      setUseManualCardEntry(false);
    } else if (!canUseSavedCard) {
      setUseManualCardEntry(true);
    }
  }, [paymentMethodChoice, canUseSavedCard]);

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
  const selectedDateTime = useMemo(() => {
    const [hours, minutes] = travelTime.split(':').map((value) => parseInt(value, 10));
    const date = new Date(selectedDate);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      date.setHours(hours, minutes, 0, 0);
    } else {
      date.setHours(0, 0, 0, 0);
    }
    return date;
  }, [selectedDate, travelTime]);
  const isScheduleInPast = useMemo(() => selectedDateTime.getTime() < Date.now(), [selectedDateTime]);
  const isLocationReady = fromCampus.trim().length > 0 && toCampus.trim().length > 0;
  const scheduleReady = !scheduleRequired || (hasConfirmedDate && hasConfirmedTime);
  const allFieldsReady = isLocationReady && scheduleReady;
  const canSubmitSearch = allFieldsReady && !isScheduleInPast;
  const validationMessage = useMemo(() => {
    if (!validationTouched) return null;
    if (!allFieldsReady) {
      return 'Remplissez tous les champs avant de lancer la recherche.';
    }
    if (isScheduleInPast) {
      return "Choisis une date et une heure futures.";
    }
    return null;
  }, [validationTouched, allFieldsReady, isScheduleInPast]);
  const showResultsCard = searchPerformed && scheduleReady && isLocationReady;
  const handlePriceSliderChange = useCallback(
    (locationX: number) => {
      const width = priceSliderWidth || 1;
      const ratio = Math.min(Math.max(locationX / width, 0), 1);
      const rawValue = PRICE_MIN + ratio * (PRICE_MAX - PRICE_MIN);
      const stepped = Math.round(rawValue / PRICE_STEP) * PRICE_STEP;
      setDraftPriceLimit(Number(Math.min(PRICE_MAX, Math.max(PRICE_MIN, stepped)).toFixed(1)));
    },
    [priceSliderWidth]
  );
  const priceSliderRatio = useMemo(() => {
    return Math.min(1, Math.max(0, (draftPriceLimit - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)));
  }, [draftPriceLimit]);
  const applyPriceFilter = useCallback(() => {
    setPriceLimit(draftPriceLimit);
  }, [draftPriceLimit]);
  const priceApplyDisabled = draftPriceLimit === priceLimit;
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
      const { commune } = await getCurrentCommune();
      setFromCampus(commune);
      setDetectedCommune(commune);
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
      <View
        style={[
          passengerStyles.destinationRow,
          dropdownOpen && passengerStyles.destinationRowRaised,
        ]}
      >
        <View
          style={[
            passengerStyles.destinationColumn,
            dropdownOpen && passengerStyles.dropdownRaised,
          ]}
        >
          <View style={[passengerStyles.dropdownWrapper, passengerStyles.dropdownWrapperTop]}>
            <Text style={passengerStyles.dropdownLabel}>POINT DE DÉPART</Text>
            <View style={passengerStyles.inputWrapper}>
              <IconSymbol name="location.fill" size={18} color={Colors.gray500} />
              <TextInput
                style={passengerStyles.dropdownTextInput}
                value={fromCampus}
                onChangeText={(value) => {
                  setFromCampus(value);
                  setDetectedCommune(null);
                  if (!showFromList) {
                    animateDropdown();
                    setShowFromList(true);
                  }
                }}
                placeholder="Saisir votre adresse"
                placeholderTextColor={Colors.gray400}
                onFocus={handleFromFocus}
                onBlur={handleFromBlur}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
              />
            </View>
            {detectedCommune ? (
              <Text style={passengerStyles.locationDetectedText}>
                Commune détectée : {detectedCommune}
              </Text>
            ) : null}
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
            <Text style={passengerStyles.dropdownLabel}>DESTINATION</Text>
            <View style={[passengerStyles.inputWrapper, passengerStyles.toInput]}>
              <IconSymbol name="graduationcap.fill" size={18} color={Colors.gray500} />
              <Pressable
                style={passengerStyles.dropdownTrigger}
                onPress={toggleDestList}
                accessibilityRole="button"
                accessibilityLabel="Choisir un campus de destination"
              >
                <Text
                  style={[
                    passengerStyles.dropdownText,
                    (!toCampus || !toCampus.trim()) && passengerStyles.dropdownTextPlaceholder,
                  ]}
                >
                  {toCampus && toCampus.trim() ? toCampus : 'Sélectionnez un campus'}
                </Text>
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
            }}
          >
            <IconSymbol name="chevron.up" size={18} color="#7A7A98" />
            <IconSymbol name="chevron.down" size={18} color="#7A7A98" />
          </Pressable>
        </View>
      </View>
      <View style={passengerStyles.dateSection}>
        <View style={passengerStyles.dateRow} pointerEvents={dropdownOpen ? 'none' : 'auto'}>
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
            <Text
              style={[
                passengerStyles.dropdownText,
                !hasConfirmedDate && passengerStyles.dropdownTextPlaceholder,
              ]}
            >
              {hasConfirmedDate ? travelDateLabel : 'Choisir une date'}
            </Text>
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
            <Text
              style={[
                passengerStyles.dropdownText,
                !hasConfirmedTime && passengerStyles.dropdownTextPlaceholder,
              ]}
            >
              {hasConfirmedTime ? travelTime : 'Choisir une heure'}
            </Text>
          </Pressable>
        </View>
        {validationMessage ? <Text style={passengerStyles.dateError}>{validationMessage}</Text> : null}
      </View>
      <Pressable
        style={[passengerStyles.moreFiltersButton, moreFiltersVisible && passengerStyles.moreFiltersButtonActive]}
        onPress={() => setMoreFiltersVisible((prev) => !prev)}
        accessibilityRole="button"
      >
        <IconSymbol
          name={moreFiltersVisible ? 'line.horizontal.3.decrease.circle.fill' : 'line.horizontal.3.decrease.circle'}
          size={20}
          color={moreFiltersVisible ? Colors.primary : Colors.gray600}
        />
        <Text
          style={[
            passengerStyles.moreFiltersButtonText,
            moreFiltersVisible && passengerStyles.moreFiltersButtonTextActive,
          ]}
        >
          Plus de filtres
        </Text>
      </Pressable>
      {moreFiltersVisible ? (
        <View style={passengerStyles.moreFiltersPanel}>
          <View style={passengerStyles.filterGroup}>
            <Text style={passengerStyles.filterGroupLabel}>Prix</Text>
            <View style={passengerStyles.sliderLabelRow}>
              <Text style={passengerStyles.sliderValue}>{draftPriceLimit.toFixed(1)} €</Text>
            </View>
            <View
              style={passengerStyles.sliderTrack}
              onLayout={(event) => setPriceSliderWidth(Math.max(event.nativeEvent.layout.width, 1))}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(event) => {
                handlePriceSliderChange(event.nativeEvent.locationX);
              }}
              onResponderMove={(event) => {
                handlePriceSliderChange(event.nativeEvent.locationX);
              }}
            >
              <View style={passengerStyles.sliderTrackBackground} />
              <View style={[passengerStyles.sliderTrackFill, { width: `${priceSliderRatio * 100}%` }]} />
              <View
                style={[
                  passengerStyles.sliderThumb,
                  { left: `${priceSliderRatio * 100}%` },
                ]}
              />
            </View>
            <View style={passengerStyles.sliderScale}>
              <Text style={passengerStyles.sliderScaleLabel}>{PRICE_MIN} €</Text>
              <Text style={passengerStyles.sliderScaleLabel}>{PRICE_MAX} €</Text>
            </View>
            <Pressable
              style={[
                passengerStyles.filterApplyButton,
                priceApplyDisabled && passengerStyles.filterApplyButtonDisabled,
              ]}
              onPress={applyPriceFilter}
              disabled={priceApplyDisabled}
              accessibilityRole="button"
            >
              <Text style={passengerStyles.filterApplyButtonText}>Appliquer</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <View style={passengerStyles.searchButtonWrapper}>
        <GradientButton
          title="Chercher"
          onPress={onSearch}
          variant="cta"
          disabled={dropdownOpen || isSearching || !canSubmitSearch}
          style={passengerStyles.fullSearchButton}
        />
        {!canSubmitSearch ? (
          <Pressable
            style={passengerStyles.searchButtonShield}
            onPress={onSearch}
            accessibilityRole="button"
          />
        ) : null}
      </View>
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return;
    setSelectedDate(date);
    setHasConfirmedDate(true);
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
        router.push({
          pathname: '/ride/request-confirmation',
          params: {
            driver: ride.driver,
            depart: ride.depart,
            destination: ride.destination,
            paid: '1',
          },
        });
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
      if (walletBalance >= ride.price) {
        setPaymentMethodChoice('wallet');
      } else if (defaultWalletCard) {
        setPaymentMethodChoice('card');
      } else {
        setPaymentMethodChoice('apple-pay');
      }
      setCardNumber('');
      setCardExpiry('');
      setCardCvv('');
      setPaymentError(null);
      setCardMasked(false);
      setExpiryMonth(null);
      setExpiryYear(null);
      setPickerExpiryMonth(null);
      setPickerExpiryYear(null);
      setUseManualCardEntry(false);
    },
    [session.email, router, walletBalance, defaultWalletCard]
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
    setUseManualCardEntry(false);
  }, []);

  const confirmPayment = useCallback(() => {
    if (!paymentRide) return;
    setPaymentError(null);
    const usingSavedCard = paymentMethodChoice === 'card' && canUseSavedCard && !useManualCardEntry;
    let method: PaymentMethod;
    if (paymentMethodChoice === 'card') {
      method = 'card';
      if (!usingSavedCard) {
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
      }
    } else if (paymentMethodChoice === 'wallet') {
      method = 'wallet';
      if (walletBalance + 0.0001 < paymentRide.price) {
        setPaymentError('Solde insuffisant dans ton wallet.');
        return;
      }
    } else {
      method = 'apple-pay';
    }
    const success = handleReserveRide(paymentRide, method);
    if (success) {
      setCardMasked(true);
      closePaymentSheet();
    }
  }, [
    paymentRide,
    paymentMethodChoice,
    canUseSavedCard,
    useManualCardEntry,
    cardNumber,
    cardExpiry,
    cardCvv,
    walletBalance,
    handleReserveRide,
    closePaymentSheet,
  ]);

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
      return (
        <GradientBackground key={ride.id} colors={Gradients.soft} style={passengerStyles.resultCardWrapper}>
          <View style={passengerStyles.resultCard}>
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
              title={seatsLeft > 0 ? 'Voir les détails' : 'Complet'}
              onPress={() => openRide(ride.id)}
              size="sm"
              variant="cta"
              fullWidth
              style={passengerStyles.resultReserveButton}
              accessibilityRole="button"
              disabled={seatsLeft <= 0}
            />
          </View>
        </GradientBackground>
      );
    },
    [formatDeparture, getRideDistance, getRideDuration, openRide]
  );


  const onSearch = useCallback(() => {
    setValidationTouched(true);
    closeDropdowns();
    if (!allFieldsReady) {
      return;
    }
    if (isScheduleInPast) {
      return;
    }
    setSearchPerformed(true);
    setIsSearching(true);
    setSearchInstance((count) => count + 1);
    const preferredMinutes = timeToMinutes(travelTime);
    const departQuery = normalizeText(fromCampus);
    const destinationQuery = normalizeText(toCampus);
    const filtered = rides
      .filter((ride) => !hasRideDeparted(ride))
      .filter((ride) => {
        const rideDepart = normalizeText(ride.depart);
        const rideDestination = normalizeText(ride.destination);
        const departMatches = rideDepart.includes(departQuery);
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
    isScheduleInPast,
    allFieldsReady,
  ]);

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
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          {Platform.OS === 'web' ? (
            <View style={passengerStyles.heroColumnWeb}>
              <View style={[passengerStyles.heroCardWeb, passengerStyles.heroCardWebMap]}>
                <HeroWebMap rides={rides} depart={fromCampus} destination={toCampus} />
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
                  <Text style={passengerStyles.resultsCount}>
                    {hasPrimaryResults ? ridesCardCountLabel : fallbackCountLabel}
                  </Text>
                </View>
              </View>
              {hasPrimaryResults ? (
                <View style={passengerStyles.resultsList}>
                  {ridesCardList.map((ride) => renderRideResult(ride))}
                </View>
              ) : fallbackHomeResults.length > 0 ? (
                <View style={passengerStyles.resultsList}>
                  {fallbackHomeResults.map((ride) => renderRideResult(ride))}
                </View>
              ) : (
                <Text style={passengerStyles.resultsEmpty}>{resultsEmptyLabel}</Text>
              )}
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
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const disabled = day.date ? day.date < today : true;
                  return (
                    <Pressable
                      key={day.key}
                      style={[
                        passengerStyles.calendarDay,
                        disabled && passengerStyles.calendarDayDisabled,
                        selected && passengerStyles.calendarDaySelected,
                      ]}
                      disabled={disabled}
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
                      setHasConfirmedTime(true);
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
                {[
                  {
                    key: 'wallet' as const,
                    label: `Wallet (€${walletBalance.toFixed(2)})`,
                    disabled: !paymentRide || walletBalance + 0.0001 < (paymentRide?.price ?? 0),
                  },
                  { key: 'apple-pay' as const, label: 'Apple Pay' },
                  { key: 'card' as const, label: 'Carte bancaire' },
                ].map((option) => {
                  const selected = paymentMethodChoice === option.key;
                  const disabled = option.disabled;
                  const caption =
                    option.key === 'wallet'
                      ? paymentRide && walletBalance + 0.0001 >= paymentRide.price
                        ? 'Solde suffisant'
                        : 'Solde insuffisant'
                      : option.key === 'card' && defaultWalletCardLabel
                      ? defaultWalletCardLabel
                      : null;
                  return (
                    <Pressable
                      key={option.key}
                      style={[
                        passengerStyles.paymentMethodButton,
                        selected && passengerStyles.paymentMethodButtonActive,
                        disabled && passengerStyles.paymentMethodButtonDisabled,
                      ]}
                      onPress={() => {
                        if (disabled) return;
                        setPaymentMethodChoice(option.key);
                      }}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          passengerStyles.paymentMethodText,
                          selected && passengerStyles.paymentMethodTextActive,
                          disabled && passengerStyles.paymentMethodTextDisabled,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {caption ? (
                        <Text style={passengerStyles.paymentMethodCaption}>{caption}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {paymentMethodChoice === 'card' ? (
                canUseSavedCard && !useManualCardEntry ? (
                  <View style={passengerStyles.savedCardBox}>
                    <Text style={passengerStyles.savedCardLabel}>{defaultWalletCardLabel}</Text>
                    {defaultWalletCardExpiry ? (
                      <Text style={passengerStyles.savedCardHint}>Expire le {defaultWalletCardExpiry}</Text>
                    ) : null}
                    <Pressable onPress={() => setUseManualCardEntry(true)} accessibilityRole="button">
                      <Text style={passengerStyles.paymentLink}>Utiliser une autre carte</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
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
                    {canUseSavedCard ? (
                      <Pressable
                        onPress={() => {
                          setUseManualCardEntry(false);
                          setCardNumber('');
                          setCardExpiry('');
                          setCardCvv('');
                        }}
                      >
                        <Text style={passengerStyles.paymentLink}>
                          Utiliser {defaultWalletCardLabel || 'ma carte enregistrée'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                )
              ) : paymentMethodChoice === 'wallet' ? (
                <View style={passengerStyles.paymentNoteBox}>
                  <Text style={passengerStyles.paymentNote}>
                    {paymentRide
                      ? walletBalance + 0.0001 >= paymentRide.price
                        ? `€${paymentRide.price.toFixed(2)} seront débités de ton wallet (solde: €${walletBalance.toFixed(
                            2
                          )}).`
                        : 'Solde insuffisant. Recharge ton wallet ou choisis un autre moyen de paiement.'
                      : 'Ton wallet sera débité pour ce trajet.'}
                  </Text>
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
              ) : paymentMethodChoice === 'wallet' ? (
                <Pressable
                  style={[
                    passengerStyles.walletPayButton,
                    ((paymentRide && (walletBalance + 0.0001 < paymentRide.price || reservingRideId === paymentRide.id)) ||
                      !paymentRide) &&
                      passengerStyles.walletPayButtonDisabled,
                  ]}
                  onPress={confirmPayment}
                  disabled={
                    !paymentRide ||
                    (paymentRide && (walletBalance + 0.0001 < paymentRide.price || reservingRideId === paymentRide.id))
                  }
                  accessibilityRole="button"
                >
                  {paymentRide && reservingRideId === paymentRide.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={passengerStyles.walletPayText}>
                      {paymentRide ? `Débiter €${paymentRide.price.toFixed(2)}` : 'Débiter mon wallet'}
                    </Text>
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
    position: 'relative',
  },
  dropdownRaised: {
    zIndex: 3000,
    elevation: 30,
  },
  destinationRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
    position: 'relative',
  },
  destinationRowRaised: {
    zIndex: 200,
  },
  dropdownWrapper: {
    position: 'relative',
    gap: Spacing.xs,
  },
  dropdownLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gray600,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dropdownWrapperTop: {
    zIndex: 140,
  },
  dropdownWrapperBottom: {
    zIndex: 120,
  },
  dateSection: {
    minHeight: 70,
    width: '100%',
    justifyContent: 'center',
    marginTop: -Spacing.sm,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 0,
    zIndex: 5,
    position: 'relative',
  },
  dateError: {
    marginTop: Spacing.xs,
    color: Colors.danger,
    fontWeight: '600',
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
  dropdownTextPlaceholder: {
    color: Colors.gray400,
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
  searchButtonWrapper: {
    position: 'relative',
  },
  searchButtonShield: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: R.pill,
  },
  fullSearchButton: {
    marginTop: Spacing.md,
    position: 'relative',
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
    minHeight: 48,
    justifyContent: 'center',
  },
  moreFiltersButton: {
    marginTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: R.pill,
    borderWidth: 0,
    backgroundColor: Colors.white,
  },
  moreFiltersButtonActive: {
    backgroundColor: Colors.white,
  },
  moreFiltersButtonText: {
    fontWeight: '700',
    color: Colors.gray700,
  },
  moreFiltersButtonTextActive: {
    color: Colors.primaryDark,
  },
  moreFiltersPanel: {
    marginTop: Spacing.xs,
    padding: Spacing.md,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: Colors.gray150,
    backgroundColor: Colors.gray50,
    gap: Spacing.sm,
  },
  filterGroup: {
    gap: Spacing.xs,
  },
  filterGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.gray600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sliderLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderValue: {
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  sliderTrack: {
    marginTop: Spacing.xs,
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrackBackground: {
    position: 'absolute',
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gray200,
    width: '100%',
    left: 0,
  },
  sliderTrackFill: {
    position: 'absolute',
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    left: 0,
  },
  sliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    transform: [{ translateX: -11 }],
  },
  sliderScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  sliderScaleLabel: {
    fontSize: 12,
    color: Colors.gray500,
  },
  filterApplyButton: {
    alignSelf: 'flex-end',
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    borderRadius: R.lg,
    backgroundColor: Colors.primary,
  },
  filterApplyButtonDisabled: {
    backgroundColor: Colors.gray300,
  },
  filterApplyButtonText: {
    color: Colors.white,
    fontWeight: '700',
    letterSpacing: 0.2,
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
    zIndex: 1000,
    elevation: 20,
    pointerEvents: 'auto',
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
  paymentMethodButtonDisabled: {
    opacity: 0.55,
  },
  paymentMethodText: {
    fontWeight: '600',
    color: Colors.gray600,
  },
  paymentMethodTextActive: {
    color: Colors.primaryDark,
  },
  paymentMethodTextDisabled: {
    color: Colors.gray500,
  },
  paymentMethodCaption: {
    fontSize: 11,
    color: Colors.gray500,
    marginTop: 2,
  },
  savedCardBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.gray150,
    padding: Spacing.md,
    backgroundColor: Colors.gray50,
    gap: 4,
  },
  savedCardLabel: {
    fontWeight: '700',
    color: Colors.ink,
  },
  savedCardHint: {
    color: Colors.gray600,
    fontSize: 13,
  },
  paymentLink: {
    color: Colors.primaryDark,
    fontWeight: '700',
    marginTop: 8,
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
  googlePayNoteBox: {
    borderRadius: 16,
    backgroundColor: '#E8F0FE',
    padding: Spacing.sm,
    marginTop: Spacing.xs,
  },
  googlePayNoteText: {
    color: '#1A73E8',
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
  walletPayButton: {
    marginTop: Spacing.xs,
    borderRadius: 16,
    backgroundColor: Colors.primaryDark,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletPayButtonDisabled: {
    opacity: 0.4,
  },
  walletPayText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
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
          <Text style={style.rideRowMeta}>Plaque : {maskPlate(ride.plate)}</Text>
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
    campusCard: { gap: Spacing.md },
    campusCardTitle: { fontWeight: '700', color: C.ink },
    campusMap: {
      marginTop: Spacing.sm,
      borderRadius: 26,
      backgroundColor: '#FFF7EF',
      minHeight: 200,
      overflow: 'hidden',
      position: 'relative',
      justifyContent: 'center',
    },
    publishWebMap: {
      ...StyleSheet.absoluteFillObject,
    },
    campusFallbackMap: {
      ...StyleSheet.absoluteFillObject,
    },
    publishWebMapError: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255,255,255,0.85)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.sm,
    },
    publishWebMapErrorText: {
      color: Colors.danger,
      fontWeight: '700',
      textAlign: 'center',
    },
    campusLegend: {
      marginTop: Spacing.sm,
      backgroundColor: '#FFFFFF',
      borderRadius: 24,
      padding: Spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      ...S.card,
    },
    campusLegendLabel: {
      fontWeight: '600',
      color: C.gray600,
    },
    campusLegendIcons: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    campusLegendIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: Colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    publishSection: {
      gap: Spacing.md,
    },
    detailsStack: {
      gap: Spacing.sm,
    },
    tripDetailsCard: {
      flexDirection: 'column',
      gap: Spacing.sm,
      padding: Spacing.lg,
      borderRadius: 28,
      ...S.card,
    },
    tripDetailsTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: C.ink,
    },
    detailInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: C.gray50,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: 16,
    },
    detailInputField: {
      flex: 1,
      fontSize: 16,
      color: C.ink,
      paddingVertical: 2,
    },
    dateTimeRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    dateField: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      borderRadius: 16,
      backgroundColor: C.gray50,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
    },
    dateFieldInput: {
      flex: 1,
      fontSize: 15,
      color: C.ink,
      paddingVertical: 6,
    },
    metaRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    metaBlock: {
      flex: 1,
      backgroundColor: '#fff',
      borderRadius: 18,
      padding: Spacing.sm,
      gap: Spacing.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.gray200,
    },
    metaLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: C.gray600,
    },
    metaValueInput: {
      fontSize: 16,
      color: C.ink,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: '#fff',
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(0,0,0,0.08)',
    },
    notesInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.gray300,
      borderRadius: 18,
      backgroundColor: C.gray50,
      padding: Spacing.sm,
      color: C.ink,
      fontSize: 14,
      minHeight: 72,
      textAlignVertical: 'top',
    },
    detailsButton: {
      marginTop: Spacing.sm,
    },
    successCard: {
      marginTop: Spacing.sm,
      backgroundColor: '#FFF',
      borderRadius: 36,
      padding: Spacing.lg,
      gap: Spacing.sm,
      ...S.card,
    },
    successCardCompact: {
      marginTop: Spacing.sm,
    },
    successTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: C.ink,
    },
    successMessageBox: {
      marginTop: Spacing.sm,
      backgroundColor: '#E9FFEF',
      borderRadius: 18,
      padding: Spacing.sm,
      borderWidth: 1,
      borderColor: '#B5F0C6',
    },
    successMessageText: {
      color: C.success,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
    },
    successInfoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      marginTop: Spacing.sm,
    },
    successRoute: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    successText: {
      color: C.gray600,
      fontWeight: '600',
    },
    successTextActive: {
      color: '#9F6BFF',
      fontWeight: '700',
    },
    successDetailText: {
      color: C.gray500,
      fontSize: 12,
      marginTop: Spacing.xs / 2,
    },
    successBadge: {
      alignSelf: 'flex-start',
      marginLeft: 'auto',
      backgroundColor: '#F6EDFF',
      borderRadius: R.xl,
      paddingVertical: Spacing.xs / 2,
      paddingHorizontal: Spacing.sm,
    },
    successBadgeText: {
      color: '#9F6BFF',
      fontWeight: '700',
      fontSize: 12,
    },

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
    priceStaticRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.gray300,
      borderRadius: 12,
      backgroundColor: C.gray150,
      paddingHorizontal: Spacing.sm,
    },
    priceInputPrefix: { color: C.gray600, fontWeight: '700', marginRight: 4 },
    priceStaticValue: { flex: 1, fontSize: 16, color: C.ink, fontWeight: '700', paddingVertical: 8 },
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

type HeroLatLng = { lat: number; lng: number };
type HeroPreviewMarker = { position: HeroLatLng; label: string; kind: 'origin' | 'destination' };

const toHeroCoordinates = (point: HeroLatLng) => ({
  latitude: point.lat,
  longitude: point.lng,
});

const HERO_DESTINATION_PIN_SVG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48"><path fill="%23D93025" stroke="%23A52714" stroke-width="2" d="M16 1C8.82 1 3 6.82 3 14c0 9.5 13 24 13 24s13-14.5 13-24C29 6.82 23.18 1 16 1z"/><circle cx="16" cy="15" r="6" fill="%23FFFFFF"/></svg>';
const HERO_DESTINATION_PIN_SIZE = { width: 24, height: 36 };

const isValidHeroCoordinate = (coord: HeroSegment['start'] | null | undefined) =>
  !!coord && Number.isFinite(coord.latitude) && Number.isFinite(coord.longitude);

const sanitizeHeroSegments = (segments: HeroSegment[]): HeroSegment[] =>
  segments.filter(
    (segment) => isValidHeroCoordinate(segment.start) && isValidHeroCoordinate(segment.end)
  );

const computeHeroCamera = (segments: HeroSegment[]) => {
  const validSegments = sanitizeHeroSegments(segments);
  if (validSegments.length === 0) {
    return { center: { lat: 50.8503, lng: 4.3517 }, zoom: 11 };
  }
  const lats = validSegments.flatMap((segment) => [segment.start.latitude, segment.end.latitude]);
  const lngs = validSegments.flatMap((segment) => [segment.start.longitude, segment.end.longitude]);
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

const HeroWebMap = ({
  rides,
  depart,
  destination,
}: {
  rides: Ride[];
  depart?: string | null;
  destination?: string | null;
}) => {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const overlays = useRef<{ markers: any[]; polylines: any[]; infoWindows: google.maps.OverlayView[] }>({
    markers: [],
    polylines: [],
    infoWindows: [],
  });
  const geocoderRef = useRef<any>(null);
  const directionsRef = useRef<any>(null);
  const lastDirectionsRequestId = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [previewMarkers, setPreviewMarkers] = useState<{
    start: HeroPreviewMarker | null;
    end: HeroPreviewMarker | null;
  }>({ start: null, end: null });
  const [previewPath, setPreviewPath] = useState<HeroLatLng[] | null>(null);

  const segments = useMemo<HeroSegment[]>(() => {
    if (!rides.length) return [];
    return rides.slice(0, 3).map((ride) => ({
      id: ride.id,
      start: getCoordinates(ride.depart),
      end: getCoordinates(ride.destination),
      startLabel: ride.depart,
      endLabel: ride.destination,
    }));
  }, [rides]);

  const hasPreviewInput = Boolean(depart?.trim()) || Boolean(destination?.trim());
  const usingFallback = segments.length === 0 && !hasPreviewInput;
  const displaySegments = usingFallback ? HERO_FALLBACK_SEGMENTS : segments;
  const safeDisplaySegments = useMemo(() => sanitizeHeroSegments(displaySegments), [displaySegments]);
  const cameraSegments = useMemo(() => {
    const list: HeroSegment[] = [...safeDisplaySegments];
    if (previewMarkers.start && previewMarkers.end) {
      list.push({
        id: 'hero-preview-route',
        start: toHeroCoordinates(previewMarkers.start.position),
        end: toHeroCoordinates(previewMarkers.end.position),
        startLabel: previewMarkers.start.label,
        endLabel: previewMarkers.end.label,
      });
    } else if (previewMarkers.start) {
      const start = toHeroCoordinates(previewMarkers.start.position);
      list.push({
        id: 'hero-preview-start',
        start,
        end: start,
        startLabel: previewMarkers.start.label,
        endLabel: previewMarkers.start.label,
      });
    } else if (previewMarkers.end) {
      const end = toHeroCoordinates(previewMarkers.end.position);
      list.push({
        id: 'hero-preview-end',
        start: end,
        end,
        startLabel: previewMarkers.end.label,
        endLabel: previewMarkers.end.label,
      });
    }
    return list.length ? list : HERO_FALLBACK_SEGMENTS;
  }, [previewMarkers.end, previewMarkers.start, safeDisplaySegments]);

  const selectedCampus = useMemo(() => findCampusLocation(destination), [destination]);
  const selectedCampusKey = selectedCampus?.name.trim().toLowerCase() ?? null;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let mounted = true;
    loadGoogleMapsApi()
      .then((google) => {
        if (!mounted || !mapNode.current) return;
        const camera = computeHeroCamera(cameraSegments);
        mapInstance.current = new google.maps.Map(mapNode.current, {
          center: camera.center,
          zoom: camera.zoom,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
        });
        setMapReady(true);
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
    if (!mapReady || !google) {
      if (!hasPreviewInput) {
        setPreviewMarkers({ start: null, end: null });
      }
      return;
    }

    const clean = (value?: string | null) => (value && value.trim().length ? value.trim() : null);
    const originLabel = clean(depart);
    const destinationLabel = clean(destination);
    if (!originLabel && !destinationLabel) {
      setPreviewMarkers({ start: null, end: null });
      return;
    }

    let cancelled = false;

    const geocodeAddress = (address: string): Promise<HeroLatLng> =>
      new Promise((resolve) => {
        try {
          if (!geocoderRef.current) {
            geocoderRef.current = new google.maps.Geocoder();
          }
          const geocoder = geocoderRef.current;
          geocoder!.geocode({ address }, (results, status) => {
            if (status === 'OK' && results && results[0] && results[0].geometry.location) {
              const loc = results[0].geometry.location;
              const lat = Number(loc.lat());
              const lng = Number(loc.lng());
              if (Number.isFinite(lat) && Number.isFinite(lng)) {
                resolve({ lat, lng });
                return;
              }
            }
            const fallback = getCoordinates(address);
            resolve({ lat: fallback.latitude, lng: fallback.longitude });
          });
        } catch {
          const fallback = getCoordinates(address);
          resolve({ lat: fallback.latitude, lng: fallback.longitude });
        }
      });

    (async () => {
      const [startPosition, endPosition] = await Promise.all([
        originLabel ? geocodeAddress(originLabel) : Promise.resolve<HeroLatLng | null>(null),
        destinationLabel ? geocodeAddress(destinationLabel) : Promise.resolve<HeroLatLng | null>(null),
      ]);
      if (cancelled) return;
      const safeStart =
        startPosition && Number.isFinite(startPosition.lat) && Number.isFinite(startPosition.lng)
          ? startPosition
          : null;
      const safeEnd =
        endPosition && Number.isFinite(endPosition.lat) && Number.isFinite(endPosition.lng)
          ? endPosition
          : null;
      setPreviewMarkers({
        start: safeStart ? { position: safeStart, label: originLabel!, kind: 'origin' } : null,
        end: safeEnd ? { position: safeEnd, label: destinationLabel!, kind: 'destination' } : null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [depart, destination, hasPreviewInput, mapReady]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const google = window.google;
    const map = mapInstance.current;
    const origin = previewMarkers.start?.position ?? null;
    const end = previewMarkers.end?.position ?? null;
    if (!mapReady || !google || !map || !origin || !end) {
      setPreviewPath(null);
      return;
    }

    if (!directionsRef.current) {
      directionsRef.current = new google.maps.DirectionsService();
    }
    const requestId = ++lastDirectionsRequestId.current;
    try {
      directionsRef.current.route(
        {
          origin,
          destination: end,
          travelMode: google.maps.TravelMode.DRIVING,
          provideRouteAlternatives: false,
        },
        (response, status) => {
          if (requestId !== lastDirectionsRequestId.current) return;
          if (status === 'OK' && response?.routes?.length) {
            const overview = response.routes[0].overview_path ?? [];
            if (overview.length > 0) {
              const path = overview.map((point) => ({ lat: point.lat(), lng: point.lng() }));
              setPreviewPath(path);
              return;
            }
          }
          setPreviewPath(null);
        }
      );
    } catch (routeError) {
      if (requestId === lastDirectionsRequestId.current) {
        console.warn('Hero map directions failed', routeError);
        setPreviewPath(null);
      }
    }
  }, [mapReady, previewMarkers.end, previewMarkers.start]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const map = mapInstance.current;
    const google = window.google;
    if (!map || !google) return;

    overlays.current.markers.forEach((marker) => marker.setMap(null));
    overlays.current.polylines.forEach((polyline) => polyline.setMap(null));
    overlays.current.infoWindows.forEach((info) => info.setMap(null));
    overlays.current = { markers: [], polylines: [], infoWindows: [] };

    const camera = computeHeroCamera(cameraSegments);
    map.setCenter(camera.center);
    map.setZoom(camera.zoom);

    safeDisplaySegments.forEach((segment) => {
      const path = [
        { lat: segment.start.latitude, lng: segment.start.longitude },
        { lat: segment.end.latitude, lng: segment.end.longitude },
      ];
      const polyline = new google.maps.Polyline({
        path,
        strokeColor: '#1A73E8',
        strokeOpacity: 0.9,
        strokeWeight: 4,
        geodesic: true,
      });
      polyline.setMap(map);

      const start = new google.maps.Marker({
        position: path[0],
        title: segment.startLabel,
        icon: {
          path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          fillColor: '#10B981',
          fillOpacity: 0.95,
          strokeColor: '#0F5132',
          strokeOpacity: 0.9,
          strokeWeight: 2,
          scale: 4.6,
        },
      });
      const endMarker = new google.maps.Marker({
        position: path[1],
        title: segment.endLabel,
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          fillColor: '#F97316',
          fillOpacity: 0.95,
          strokeColor: '#C05621',
          strokeOpacity: 0.9,
          strokeWeight: 2,
          scale: 4.6,
        },
      });
      start.setMap(map);
      endMarker.setMap(map);
      overlays.current.polylines.push(polyline);
      overlays.current.markers.push(start, endMarker);
    });

    if (previewPath && previewPath.length > 0) {
      const previewPolyline = new google.maps.Polyline({
        path: previewPath,
        strokeColor: '#1A73E8',
        strokeOpacity: 0.95,
        strokeWeight: 5,
      });
      previewPolyline.setMap(map);
      overlays.current.polylines.push(previewPolyline);
    } else if (previewMarkers.start && previewMarkers.end) {
      const previewPolyline = new google.maps.Polyline({
        path: [previewMarkers.start.position, previewMarkers.end.position],
        strokeColor: '#1A73E8',
        strokeOpacity: 0.85,
        strokeWeight: 4,
        geodesic: true,
      });
      previewPolyline.setMap(map);
      overlays.current.polylines.push(previewPolyline);
    }

    const createOriginMarker = (marker: HeroPreviewMarker) =>
      new google.maps.Marker({
        position: marker.position,
        title: marker.label,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#1A73E8',
          fillOpacity: 0.95,
          strokeColor: '#FFFFFF',
          strokeOpacity: 0.9,
          strokeWeight: 2,
          scale: 7,
        },
      });

    const createDestinationMarker = (marker: HeroPreviewMarker) =>
      new google.maps.Marker({
        position: marker.position,
        title: marker.label,
        icon: {
          url: HERO_DESTINATION_PIN_SVG,
          scaledSize: new google.maps.Size(
            HERO_DESTINATION_PIN_SIZE.width,
            HERO_DESTINATION_PIN_SIZE.height
          ),
          anchor: new google.maps.Point(
            HERO_DESTINATION_PIN_SIZE.width / 2,
            HERO_DESTINATION_PIN_SIZE.height
          ),
        },
        zIndex: 1000,
      });

    if (previewMarkers.start) {
      const marker = createOriginMarker(previewMarkers.start);
      marker.setMap(map);
      overlays.current.markers.push(marker);
    }
    if (previewMarkers.end) {
      const marker = createDestinationMarker(previewMarkers.end);
      marker.setMap(map);
      overlays.current.markers.push(marker);
    }

    if (previewMarkers.start && previewMarkers.end) {
      const durationMinutes = getDurationMinutes(
        previewMarkers.start.label,
        previewMarkers.end.label
      );
      if (durationMinutes && Number.isFinite(durationMinutes)) {
        const midpoint = (() => {
          if (previewPath && previewPath.length > 0) {
            const midIndex = Math.floor(previewPath.length / 2);
            return previewPath[midIndex];
          }
          return {
            lat: (previewMarkers.start.position.lat + previewMarkers.end.position.lat) / 2,
            lng: (previewMarkers.start.position.lng + previewMarkers.end.position.lng) / 2,
          };
        })();
        const bubbleContent =
          `<div style="position:relative;display:inline-flex;align-items:center;font-size:13px;font-weight:700;color:#111;">` +
          `<div style="width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;` +
          `border-right:9px solid #fff;box-shadow:1px 0 1px rgba(0,0,0,0.12);margin-right:-1px;"></div>` +
          `<span style="background:#fff;border:2px solid #dcdcdc;border-radius:18px;padding:4px 12px;box-shadow:0 2px 6px rgba(0,0,0,0.15);">` +
          `${durationMinutes} min</span>` +
          `</div>`;
        const infoWindowDiv = document.createElement('div');
        infoWindowDiv.innerHTML = bubbleContent;
        const overlay = new google.maps.OverlayView();
        overlay.onAdd = function () {
          const pane = this.getPanes()?.floatPane;
          if (!pane) return;
          pane.appendChild(infoWindowDiv);
        };
        overlay.draw = function () {
          const projection = this.getProjection();
          if (!projection) return;
          const pos = projection.fromLatLngToDivPixel(new google.maps.LatLng(midpoint.lat, midpoint.lng));
          if (pos) {
            infoWindowDiv.style.position = 'absolute';
            infoWindowDiv.style.transform = 'translate(10px, -50%)';
            infoWindowDiv.style.left = `${pos.x}px`;
            infoWindowDiv.style.top = `${pos.y}px`;
          }
        };
        overlay.onRemove = function () {
          if (infoWindowDiv.parentNode) {
            infoWindowDiv.parentNode.removeChild(infoWindowDiv);
          }
        };
        overlay.setMap(map);
        overlays.current.infoWindows.push(overlay);
      }
    }

    // Campus markers intentionally removed per request.
  }, [
    cameraSegments,
    previewMarkers.end,
    previewMarkers.start,
    previewPath,
    safeDisplaySegments,
    selectedCampusKey,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const map = mapInstance.current;
    const google = window.google;
    if (!map || !google) return;
    const destinationLabel = previewMarkers.end?.label ?? selectedCampus?.name ?? null;
    if (!destinationLabel) return;
    const campus = findCampusLocation(destinationLabel);
    const arrivalPosition = previewMarkers.end?.position;
    if (!campus || !arrivalPosition) return;

    const campusLatLng = new google.maps.LatLng(campus.latitude, campus.longitude);
    const arrivalLatLng = new google.maps.LatLng(arrivalPosition.lat, arrivalPosition.lng);
    const dottedLine = new google.maps.Polyline({
      path: [arrivalLatLng, campusLatLng],
      geodesic: true,
      strokeColor: '#1A73E8',
      strokeOpacity: 0.8,
      strokeWeight: 3,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            scale: 3,
          },
          offset: '0',
          repeat: '12px',
        },
      ],
    });
    dottedLine.setMap(map);
    overlays.current.polylines.push(dottedLine);
  }, [previewMarkers.end, selectedCampus]);

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

const RideMap = ({
  rides,
  selectedCampus,
  previewDepart,
  previewDestination,
}: {
  rides: Ride[];
  selectedCampus?: string | null;
  previewDepart?: string;
  previewDestination?: string;
}) => {
  const destination = selectedCampus ?? previewDestination ?? null;
  if (Platform.OS === 'web') {
    return <HeroWebMap rides={rides} depart={previewDepart} destination={destination} />;
  }
  return (
    <View style={styles(C, S).campusMap}>
      <Image source={HERO_MAP_IMAGE} style={styles(C, S).campusFallbackMap} resizeMode="cover" />
    </View>
  );
};

const PublishCampusWebMap = () => {
  if (Platform.OS !== 'web') {
    return null;
  }

  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const markers = useRef<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadGoogleMapsApi()
      .then((google) => {
        if (!mounted || !mapNode.current) return;
        const camera = computeCampusCamera();
        mapInstance.current = new google.maps.Map(mapNode.current, {
          center: camera.center,
          zoom: camera.zoom,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
        });
        setMapReady(true);
      })
      .catch(() => {
        if (mounted) {
          setError("Impossible d'afficher Google Maps.");
        }
      });
    return () => {
      mounted = false;
      markers.current.forEach((marker) => marker.setMap(null));
      markers.current = [];
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const google = window.google;
    const map = mapInstance.current;
    if (!google || !map) return;

    markers.current.forEach((marker) => marker.setMap(null));
    markers.current = [];

    const camera = computeCampusCamera();
    map.setCenter(camera.center);
    map.setZoom(camera.zoom);

    CAMPUS_LOCATIONS.forEach((campus) => {
      const marker = new google.maps.Marker({
        map,
        position: { lat: campus.latitude, lng: campus.longitude },
        title: campus.name,
      });
      markers.current.push(marker);
    });
  }, [mapReady]);

  return (
    <View style={styles(C, S).publishWebMap}>
      <div ref={mapNode} style={webMapSurfaceStyle} />
      {error ? (
        <View style={styles(C, S).publishWebMapError}>
          <Text style={styles(C, S).publishWebMapErrorText}>{error}</Text>
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
  // Ensures module augmentation can extend Window elsewhere when needed.
  interface Window {}
}

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  LayoutChangeEvent,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import type { AuthSession } from '@/app/services/auth';
import { useAuthSession } from '@/hooks/use-auth-session';
import { getAvatarUrl } from '@/app/ui/avatar';
import type { Notification } from '@/app/services/notifications';
import { subscribeNotifications } from '@/app/services/notifications';
import { getRides, hasRideDeparted, subscribeRides, type Ride } from '@/app/services/rides';
import { getWallet, subscribeWallet, type WalletSnapshot } from '@/app/services/wallet';
import { usePassengerRequests } from '@/hooks/use-passenger-requests';
import { getCurrentCommune, LocationPermissionError } from '@/app/services/location';

type SectionKey = 'search' | 'requests' | 'trips';
type SectionFocus = { key: SectionKey; token: number };

const isSectionKey = (value: string | undefined): value is SectionKey =>
  value === 'search' || value === 'requests' || value === 'trips';

const CAMPUS_OPTIONS = [
  'EPHEC Delta',
  'EPHEC Louvain-la-Neuve',
  'EPHEC Schaerbeek',
  'EPHEC Woluwe',
  'EPHEC Schuman',
];

const sponsorOffer = {
  brand: 'Spotify Student',
  tagline: 'Premium -50 % pendant 12 mois',
  description: 'Ta musique sans limites pendant les trajets CampusRide.',
  badge: 'Sponsorisé',
  logo: require('@/assets/images/Spotify.png'),
  colors: ['#1DB954', '#18A148', '#12823A'],
  url: 'https://www.spotify.com/be-fr/student/',
};

const sponsorSecondary = {
  brand: 'Netflix Student',
  tagline: '1er mois offert',
  badge: 'Sponsorisé',
  colors: ['#F44336', '#D32F2F'],
  url: 'https://www.netflix.com/be-en/',
  logo: require('@/assets/images/Netflix.jpg'),
  description: 'Tes séries et films préférés pendant les trajets CampusRide.',
};

const quickSponsor = {
  brand: 'Quick Étudiant',
  tagline: 'Menus étudiants & bons plans',
  badge: 'SPONSORISÉ',
  colors: ['#E30A14', '#F03A3D', '#FF6F6F'],
  url: 'https://www.quick.be/fr/deals',
  logo: require('@/assets/images/Quick.png'),
};

const LOCATION_SUGGESTION_OPTION = 'Utiliser ma position';

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });

const getFirstName = (value: string | null | undefined) => {
  if (!value) return null;
  const [first] = value.trim().split(/\s+/);
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
};

const getRandomRating = (ride: Ride) => {
  const seed = ride.driver.length + ride.destination.length;
  const base = 4 + (seed % 10) / 20;
  return Math.min(4.9, Math.round(base * 10) / 10);
};

const getRandomTripsCount = (ride: Ride) => 10 + (ride.driver.length % 5) * 5;

const DRIVER_NAV_LINKS = [
  { key: 'home', label: 'Accueil', route: '/', icon: 'house.fill' },
  { key: 'rides', label: 'Trajets publiés', route: '/explore', icon: 'list.bullet.rectangle' },
  { key: 'messages', label: 'Messages', route: '/(tabs)/messages', icon: 'bubble.left.and.bubble.right.fill' },
  { key: 'profile', label: 'Profil', route: '/(tabs)/profile', icon: 'person.crop.circle' },
];

const formatRideBadgeDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('fr-BE', {
    day: 'numeric',
    month: 'short',
  });

const formatRideMoment = (timestamp: number) => {
  const rideDate = new Date(timestamp);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const timeLabel = formatTime(timestamp);
  if (rideDate >= today && rideDate < tomorrow) {
    return `Aujourd'hui, ${timeLabel}`;
  }
  if (rideDate >= tomorrow && rideDate < dayAfter) {
    return `Demain, ${timeLabel}`;
  }
  return `${formatRideBadgeDate(timestamp)} · ${timeLabel}`;
};

const getDriverRideStatus = (ride: Ride) => {
  if (hasRideDeparted(ride)) {
    return { label: 'Terminé', tint: Colors.success, background: Colors.successLight };
  }
  if (ride.passengers.length === 0) {
    return { label: 'Publié', tint: Colors.accent, background: Colors.accentSoft };
  }
  return { label: 'En attente', tint: Colors.warning, background: Colors.warningLight };
};

const DRIVER_RULES = [
  { key: 'no-smoking', label: 'Fumée non autorisée', icon: '🚭' },
  { key: 'music', label: 'Musique autorisée', icon: '🎵' },
  { key: 'pets', label: 'Animaux acceptés', icon: '🐕' },
  { key: 'calm', label: 'Trajet calme', icon: '🤫' },
  { key: 'luggage', label: 'Bagages acceptés', icon: '🧳' },
  { key: 'chat', label: 'Discussion bienvenue', icon: '💬' },
];

export default function Home() {
  const session = useAuthSession();
  const params = useLocalSearchParams<{ mode?: string; section?: string }>();
  const [previewPassenger, setPreviewPassenger] = useState(params.mode === 'passenger');
  const initialSection = Array.isArray(params.section) ? params.section[0] : params.section;
  const [focusSection, setFocusSection] = useState<SectionFocus | null>(() =>
    isSectionKey(initialSection) ? { key: initialSection, token: Date.now() } : null
  );

  useEffect(() => {
    if (params.mode === 'passenger') {
      setPreviewPassenger(true);
      router.replace('/');
    }
  }, [params.mode, router]);

  useEffect(() => {
    const nextSection = Array.isArray(params.section) ? params.section[0] : params.section;
    if (isSectionKey(nextSection)) {
      setFocusSection({ key: nextSection, token: Date.now() });
      router.replace('/');
    }
  }, [params.section, router]);

  useEffect(() => {
    if (!session.isDriver && previewPassenger) {
      setPreviewPassenger(false);
    }
  }, [session.isDriver, previewPassenger]);

  const showPassenger = previewPassenger || !session.isDriver;
  return showPassenger ? (
    <PassengerHome session={session} focusSection={focusSection} />
  ) : (
    <DriverDashboard session={session} />
  );
}

function PassengerHome({ session, focusSection }: { session: AuthSession; focusSection: SectionFocus | null }) {
  const scrollRef = useRef<ScrollView>(null);
  const sectionPositions = useRef<Record<SectionKey, number>>({
    search: 0,
    requests: 0,
    trips: 0,
  });

  const [rides, setRides] = useState<Ride[]>(getRides());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(() =>
    session.email ? getWallet(session.email) : null
  );
  const [departureInput, setDepartureInput] = useState('');
  const [campus, setCampus] = useState('');
  const [tripTab, setTripTab] = useState<'current' | 'reserved' | 'history'>('current');
  const [showCampusList, setShowCampusList] = useState(false);
  const [isDepartureFocused, setDepartureFocused] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [detectedCommune, setDetectedCommune] = useState<string | null>(null);
  const departureBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeRides(setRides);
    return unsubscribe;
  }, []);

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
      setNotifications([]);
      return;
    }
    const unsubscribe = subscribeNotifications(session.email, setNotifications);
    return unsubscribe;
  }, [session.email]);

  const { pending: passengerPendingRequests, accepted: passengerAcceptedRequests } = usePassengerRequests(
    session.email
  );

  const recommendedRides = useMemo(() => rides.slice(0, 3), [rides]);
  const myReservations = useMemo(
    () =>
      rides.filter(
        (ride) => !!session.email && ride.passengers.includes(session.email)
      ),
    [rides, session.email]
  );
  const pendingRequests = useMemo(
    () => myReservations.filter((ride) => !hasRideDeparted(ride)),
    [myReservations]
  );
  const historyTrips = useMemo(
    () => myReservations.filter((ride) => hasRideDeparted(ride)),
    [myReservations]
  );
  const reservedTrips = useMemo(
    () => pendingRequests.filter((ride) => ride.passengers.length < ride.seats),
    [pendingRequests]
  );

  const canceledTrips = useMemo(
    () =>
      rides.filter((ride) => !!session.email && ride.canceledPassengers.includes(session.email)),
    [rides, session.email]
  );

  const tripBuckets = useMemo(
    () => ({
      current: pendingRequests,
      reserved: reservedTrips,
      history: historyTrips,
    }),
    [pendingRequests, reservedTrips, historyTrips]
  );

  const activeTrip = tripBuckets[tripTab][0] ?? pendingRequests[0] ?? historyTrips[0] ?? null;
  const featuredRide = recommendedRides[0] ?? activeTrip ?? rides[0] ?? null;

  const unreadNotifications = useMemo(
    () => notifications.filter((notif) => !notif.read).length,
    [notifications]
  );
  const passengerRequestCount = passengerPendingRequests.length + passengerAcceptedRequests.length;

  const firstName = getFirstName(session.name);
  const walletBalance = wallet?.balance ?? 0;
  const rideCredits = wallet?.rideCredits ?? 0;

  const handleCampusSelect = () => {
    setShowCampusList((prev) => !prev);
  };

  const selectCampus = (value: string) => {
    setCampus(value);
    setShowCampusList(false);
  };
  const handleSearch = () => {
    setShowCampusList(false);
    router.push({
      pathname: '/explore',
      params: {
        depart: departureInput,
        campus,
      } as any,
    });
  };

  const handleDepartureFocus = () => {
    if (departureBlurTimeout.current) {
      clearTimeout(departureBlurTimeout.current);
      departureBlurTimeout.current = null;
    }
    setDepartureFocused(true);
  };

  const handleDepartureBlur = () => {
    departureBlurTimeout.current = setTimeout(() => setDepartureFocused(false), 120);
  };

  const handleUseLocation = useCallback(async () => {
    try {
      setLocationLoading(true);
      const { commune, address } = await getCurrentCommune();
      setDepartureInput(address);
      setDetectedCommune(commune);
      setDepartureFocused(false);
    } catch (error) {
      if (error instanceof LocationPermissionError) {
        Alert.alert(
          'Localisation désactivée',
          'Active l’accès à la localisation pour détecter automatiquement ta commune.'
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
  const openRide = (ride: Ride | null) => {
    if (!ride) return;
    router.push({ pathname: '/ride/[id]', params: { id: ride.id } });
  };

  const openSponsor = (url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce sponsor pour le moment.')
    );
  };

  const registerSection = (key: SectionKey) => (event: LayoutChangeEvent) => {
    sectionPositions.current[key] = event.nativeEvent.layout.y;
  };

  const scrollToSection = useCallback(
    (key: SectionKey) => {
      setShowCampusList(false);
      const position = sectionPositions.current[key] ?? 0;
      scrollRef.current?.scrollTo({ y: Math.max(position - 16, 0), animated: true });
    },
    []
  );

  useEffect(() => {
    if (!focusSection) return;
    const timeout = setTimeout(() => {
      scrollToSection(focusSection.key);
    }, 350);
    return () => clearTimeout(timeout);
  }, [focusSection, scrollToSection]);

  const quickActions = useMemo(
    () => [
      {
        key: 'requests' as SectionKey,
        label: 'Mes demandes',
        icon: 'doc.text' as const,
        badge: passengerRequestCount > 0 ? String(passengerRequestCount) : undefined,
        onPress: () => router.push('/requests'),
      },
      {
        key: 'trips' as SectionKey,
        label: 'Mes trajets',
        icon: 'car.fill' as const,
        badge: tripBuckets[tripTab].length > 0 ? undefined : undefined,
        onPress: () => router.push('/trips'),
      },
    ],
    [passengerRequestCount, tripBuckets, tripTab, router]
  );

  const sponsorSlides = useMemo(() => [sponsorSecondary, sponsorOffer], []);
  const sponsorScrollRef = useRef<ScrollView>(null);
  const sponsorIndexRef = useRef(0);
  const { width: windowWidth } = useWindowDimensions();
  const sliderWidth = Math.max(windowWidth - Spacing.lg * 2, 300);
  const sponsorCardHeight = 170;

  useEffect(() => {
    if (!sliderWidth) return;
    const interval = setInterval(() => {
      const nextIndex = (sponsorIndexRef.current + 1) % sponsorSlides.length;
      sponsorIndexRef.current = nextIndex;
      sponsorScrollRef.current?.scrollTo({ x: nextIndex * sliderWidth, animated: true });
    }, 3000);
    return () => clearInterval(interval);
  }, [sliderWidth, sponsorSlides.length]);


  const departureDropdownOptions = useMemo(() => [LOCATION_SUGGESTION_OPTION], []);

  const showDepartureSuggestions = isDepartureFocused;
  const departureHasValue = departureInput.trim().length > 0;
  const destinationHasValue = campus.trim().length > 0;
  const destinationLabel = destinationHasValue ? campus : 'Sélectionnez un campus';

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <GradientBackground colors={Gradients.background} style={styles.hero}>
            <View style={styles.heroHeader}>
              <View>
                <Text style={styles.heroLabel}>Bonjour {firstName ?? 'CampusRider'}</Text>
                <Text style={styles.heroSubtitle}>Trouve ton prochain trajet</Text>
              </View>
              <Pressable style={styles.notificationIcon} onPress={() => router.push('/notifications')}>
                <IconSymbol name="bell.fill" size={22} color={Colors.white} />
                {unreadNotifications > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>{unreadNotifications}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
            <View style={styles.quickActionsRow}>
              {quickActions.map((action) => (
                <Pressable
                  key={action.key}
                  style={styles.quickAction}
                  onPress={action.onPress}
                  accessibilityRole="button"
                >
                  <View style={styles.quickIconWrapper}>
                    <View style={styles.quickIcon}>
                      <IconSymbol name={action.icon} size={24} color={Colors.primaryDark} />
                    </View>
                    {action.badge ? (
                      <View style={styles.quickActionBadge}>
                        <Text style={styles.quickBadgeText}>{action.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.quickLabel}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
          </GradientBackground>

          <View style={styles.section} onLayout={registerSection('search')}>
            <Text style={styles.sectionTitle}>Choisir votre destination</Text>
            <View style={styles.formCard}>
              <View style={[searchStyles.dropdownWrapper, searchStyles.dropdownWrapperTop]}>
                <Text style={searchStyles.dropdownLabel}>POINT DE DÉPART</Text>
                <View style={searchStyles.inputWrapper}>
                  <IconSymbol name="location.fill" size={18} color={Colors.gray500} />
                  <TextInput
                    placeholder="Saisir votre adresse"
                    placeholderTextColor={Colors.gray400}
                    value={departureInput}
                    onChangeText={(value) => {
                      setDepartureInput(value);
                      setDetectedCommune(null);
                    }}
                    style={searchStyles.dropdownTextInput}
                    onFocus={handleDepartureFocus}
                    onBlur={handleDepartureBlur}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  {departureHasValue ? (
                    <Pressable
                      style={searchStyles.clearButton}
                      onPress={() => {
                        setDepartureInput('');
                        setDetectedCommune(null);
                        setDepartureFocused(false);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Effacer le point de départ"
                    >
                      <IconSymbol name="xmark" size={18} color={Colors.gray500} />
                    </Pressable>
                  ) : null}
                </View>
                {detectedCommune ? (
                  <Text style={searchStyles.locationDetectedText}>
                    Commune détectée : {detectedCommune}
                  </Text>
                ) : null}
                {showDepartureSuggestions ? (
                  <View style={searchStyles.dropdownList}>
                    <ScrollView
                      style={styles.suggestionScroll}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      {departureDropdownOptions.map((option, index) => (
                        <Pressable
                          key={`${option}-${index}`}
                          style={searchStyles.dropdownItem}
                          onPress={() => {
                            handleUseLocation();
                          }}
                        >
                          <Text style={searchStyles.dropdownItemText}>
                            {locationLoading ? 'Localisation…' : option}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
              <View style={[searchStyles.dropdownWrapper, searchStyles.dropdownWrapperBottom]}>
                <Text style={searchStyles.dropdownLabel}>DESTINATION</Text>
                <View style={[searchStyles.inputWrapper, searchStyles.toInput]}>
                  <IconSymbol name="graduationcap.fill" size={18} color={Colors.gray500} />
                  <View style={searchStyles.dropdownValueWithClear}>
                    <Pressable
                      style={searchStyles.dropdownTrigger}
                      onPress={handleCampusSelect}
                      accessibilityRole="button"
                      accessibilityLabel="Choisir un campus"
                    >
                      <Text
                        style={[
                          searchStyles.dropdownText,
                          !destinationHasValue && searchStyles.dropdownTextPlaceholder,
                        ]}
                      >
                        {destinationLabel}
                      </Text>
                    </Pressable>
                    {destinationHasValue ? (
                      <Pressable
                        style={searchStyles.clearButton}
                        onPress={() => {
                          selectCampus('');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Effacer la destination"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <IconSymbol name="xmark" size={18} color={Colors.gray500} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                {showCampusList ? (
                  <View style={searchStyles.dropdownList}>
                    {CAMPUS_OPTIONS.map((option) => (
                      <Pressable
                        key={option}
                        style={searchStyles.dropdownItem}
                        onPress={() => selectCampus(option)}
                      >
                        <Text style={searchStyles.dropdownItemText}>{option}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={searchStyles.searchButtonWrapper}>
                <GradientButton
                  title="Rechercher"
                  onPress={handleSearch}
                  variant="cta"
                  fullWidth
                  style={searchStyles.fullSearchButton}
                  contentStyle={{ paddingVertical: Spacing.lg }}
                  accessibilityRole="button"
                />
              </View>
            </View>
          </View>

          <View style={[styles.section, styles.sponsorSection]}>
            <View style={[styles.sponsorCarouselWrapper, { height: sponsorCardHeight + Spacing.sm }]}>
              <ScrollView
                ref={sponsorScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                snapToInterval={sliderWidth}
                decelerationRate="fast"
                contentContainerStyle={styles.sponsorCarousel}
                onMomentumScrollEnd={(event) => {
                  const index = Math.max(
                    0,
                    Math.min(
                      sponsorSlides.length - 1,
                      Math.round(event.nativeEvent.contentOffset.x / sliderWidth)
                    )
                  );
                  sponsorIndexRef.current = index;
                }}
              >
                {sponsorSlides.map((slide) => (
                  <GradientBackground
                    key={slide.brand}
                    colors={slide.colors}
                    style={[styles.sponsorCard, { width: sliderWidth, height: sponsorCardHeight }]}
                  >
                    <View style={styles.sponsorHeader}>
                      <View style={styles.sponsorBadge}>
                        <Text style={styles.sponsorBadgeText}>{slide.badge}</Text>
                      </View>
                      <Pressable onPress={() => openSponsor(slide.url)}>
                        <IconSymbol name="arrow.up.right.square" size={22} color={Colors.white} />
                      </Pressable>
                    </View>
              <View style={styles.sponsorBrandRow}>
                <Image source={slide.logo} style={styles.sponsorLogo} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sponsorBrand}>{slide.brand}</Text>
                  <Text style={styles.sponsorTagline}>{slide.tagline}</Text>
                </View>
              </View>
                    {slide.description ? (
                      <>
                        <Text style={styles.sponsorDescription}>{slide.description}</Text>
                        <Pressable style={styles.sponsorButton} onPress={() => openSponsor(slide.url)}>
                          <Text style={styles.sponsorButtonText}>Profiter de l’offre</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </GradientBackground>
                ))}
              </ScrollView>
            </View>

          </View>

          <View style={styles.driverPromoSection}>
            <GradientBackground colors={Gradients.cta} style={styles.driverPromoCard}>
              <Text style={styles.driverHeader}>Gagnez de l’argent</Text>
              <Text style={styles.driverSubtitle}>
                Publie ton premier trajet en moins de 2 minutes.
              </Text>
              <Pressable
                style={styles.driverPromoAction}
                onPress={() => router.push('/driver-verification')}
              >
                <View style={styles.driverPromoActionContent}>
                  <IconSymbol name="car.fill" size={16} color={Colors.primaryDark} />
                  <Text style={styles.driverPromoActionText}>Devenir conducteur</Text>
                </View>
              </Pressable>
            </GradientBackground>
          </View>
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

type DriverDashboardProps = {
  session: AuthSession;
};

function DriverDashboard({ session }: DriverDashboardProps) {
  const ownerEmail = (session.email ?? '').toLowerCase();
  const [rides, setRides] = useState<Ride[]>(() => getRides());
  const [loadingRides, setLoadingRides] = useState(() => getRides().length === 0);
  const [meetingPoint, setMeetingPoint] = useState('');
  const [destination, setDestination] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [showMeetingList, setShowMeetingList] = useState(false);
  const [showDestinationList, setShowDestinationList] = useState(false);
  const [detectedMeetingCommune, setDetectedMeetingCommune] = useState<string | null>(null);
  const meetingBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeRides((items) => {
      setRides(items);
      setLoadingRides(false);
    });
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

  const handleCreateRide = useCallback(() => {
    router.push('/create-ride');
  }, []);

  const openQuickSponsor = useCallback(() => {
    Linking.openURL(quickSponsor.url).catch(() => undefined);
  }, []);

  const unreadNotifications = useMemo(
    () => notifications.filter((notif) => !notif.read).length,
    [notifications]
  );
  const driverQuickActions = useMemo(
    () => [
      {
        key: 'requests',
        label: 'Mes demandes',
        icon: 'doc.text' as const,
        onPress: () => router.push('/requests'),
      },
      {
        key: 'trips',
        label: 'Mes trajets',
        icon: 'car.fill' as const,
        onPress: () => router.push('/driver-published'),
      },
    ],
    [router]
  );

  const meetingPointHasValue = meetingPoint.trim().length > 0;
  const destinationHasValue = destination.trim().length > 0;
  const destinationLabelDriver = destinationHasValue ? destination : 'Sélectionnez un campus';
  const meetingDropdownOptions = useMemo(() => [LOCATION_SUGGESTION_OPTION], []);
  const canContinue = meetingPointHasValue && destinationHasValue;

  const closeDriverDropdowns = useCallback(() => {
    setShowMeetingList(false);
    setShowDestinationList(false);
  }, []);

  const handleDriverMeetingFocus = useCallback(() => {
    if (meetingBlurTimeout.current) {
      clearTimeout(meetingBlurTimeout.current);
      meetingBlurTimeout.current = null;
    }
    setShowMeetingList(true);
    setShowDestinationList(false);
  }, []);

  const handleDriverMeetingBlur = useCallback(() => {
    meetingBlurTimeout.current = setTimeout(() => {
      setShowMeetingList(false);
    }, 120);
  }, []);

  const handleDriverUseLocation = useCallback(async () => {
    try {
      setLocationLoading(true);
      const { commune, address } = await getCurrentCommune();
      setMeetingPoint(address);
      setDetectedMeetingCommune(commune);
      closeDriverDropdowns();
    } catch (error) {
      if (error instanceof LocationPermissionError) {
        Alert.alert(
          'Localisation désactivée',
          'Active la localisation pour détecter automatiquement ton point de rencontre.'
        );
      } else {
        Alert.alert(
          'Position indisponible',
          'Impossible de récupérer ta position. Réessaie dans un instant.'
        );
      }
    } finally {
      setLocationLoading(false);
    }
  }, [closeDriverDropdowns]);

  const toggleDriverDestinationList = useCallback(() => {
    setShowDestinationList((prev) => !prev);
    setShowMeetingList(false);
  }, []);

  const selectDriverDestination = useCallback(
    (value: string) => {
      setDestination(value);
      closeDriverDropdowns();
    },
    [closeDriverDropdowns]
  );

  const handleContinue = useCallback(() => {
    if (!canContinue) return;
    closeDriverDropdowns();
    router.push({
      pathname: '/explore',
      params: {
        driverMeeting: meetingPoint.trim(),
        driverDestination: destination.trim(),
      } as any,
    });
  }, [canContinue, closeDriverDropdowns, destination, meetingPoint]);

  useEffect(() => {
    return () => {
      if (meetingBlurTimeout.current) {
        clearTimeout(meetingBlurTimeout.current);
      }
    };
  }, []);

  return (
    <AppBackground style={driverStyles.screen}>
      <SafeAreaView style={driverStyles.safe}>
        <ScrollView
          contentContainerStyle={driverStyles.content}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        >
          <GradientBackground colors={Gradients.driver} style={driverStyles.hero}>
            <View style={styles.heroHeader}>
              <View>
                <Text style={styles.heroLabel}>Bonjour Eya</Text>
                <Text style={styles.heroSubtitle}>Publie ton prochain trajet</Text>
              </View>
              <Pressable
                style={styles.notificationIcon}
                onPress={() => router.push('/notifications')}
                accessibilityRole="button"
              >
                <IconSymbol name="bell.fill" size={22} color={Colors.white} />
                {unreadNotifications > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>{unreadNotifications}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
            <View style={styles.quickActionsRow}>
              {driverQuickActions.map((action) => (
                <Pressable
                  key={action.key}
                  style={styles.quickAction}
                  onPress={action.onPress}
                  accessibilityRole="button"
                >
                  <View style={styles.quickIconWrapper}>
                    <View style={[styles.quickIcon, driverStyles.quickIcon]}>
                      <IconSymbol name={action.icon} size={24} color={Colors.accent} />
                    </View>
                  </View>
                  <Text style={styles.quickLabel}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
          </GradientBackground>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Publier mon trajet</Text>
            <View style={styles.formCard}>
              <View style={[searchStyles.dropdownWrapper, searchStyles.dropdownWrapperTop]}>
                <Text style={searchStyles.dropdownLabel}>POINT DE RENCONTRE</Text>
                <View style={searchStyles.inputWrapper}>
                  <IconSymbol name="location.fill" size={18} color={Colors.gray500} />
                  <TextInput
                    value={meetingPoint}
                    onChangeText={(value) => {
                      setMeetingPoint(value);
                      setDetectedMeetingCommune(null);
                      if (!showMeetingList) {
                        setShowMeetingList(true);
                      }
                    }}
                    placeholder="Saisir votre adresse"
                    placeholderTextColor={Colors.gray400}
                    style={searchStyles.dropdownTextInput}
                    autoCapitalize="words"
                    onFocus={handleDriverMeetingFocus}
                    onBlur={handleDriverMeetingBlur}
                  />
                  {meetingPointHasValue ? (
                    <Pressable
                      style={searchStyles.clearButton}
                      onPress={() => {
                        setMeetingPoint('');
                        setDetectedMeetingCommune(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Effacer le point de rencontre"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <IconSymbol name="xmark" size={18} color={Colors.gray500} />
                    </Pressable>
                  ) : null}
                </View>
                {detectedMeetingCommune ? (
                  <Text style={searchStyles.locationDetectedText}>
                    Commune détectée : {detectedMeetingCommune}
                  </Text>
                ) : null}
                {showMeetingList ? (
                  <View style={searchStyles.dropdownList}>
                    <ScrollView
                      style={styles.suggestionScroll}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      {meetingDropdownOptions.map((option, index) => (
                        <Pressable
                          key={`${option}-${index}`}
                          style={searchStyles.dropdownItem}
                          onPress={handleDriverUseLocation}
                        >
                          <Text style={searchStyles.dropdownItemText}>
                            {locationLoading ? 'Localisation…' : option}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
              <View style={[searchStyles.dropdownWrapper, searchStyles.dropdownWrapperBottom]}>
                <Text style={searchStyles.dropdownLabel}>DESTINATION</Text>
                <View style={[searchStyles.inputWrapper, searchStyles.toInput]}>
                  <IconSymbol name="graduationcap.fill" size={18} color={Colors.gray500} />
                  <View style={searchStyles.dropdownValueWithClear}>
                    <Pressable
                      style={searchStyles.dropdownTrigger}
                      onPress={toggleDriverDestinationList}
                      accessibilityRole="button"
                      accessibilityLabel="Choisir une destination"
                    >
                      <Text
                        style={[
                          searchStyles.dropdownText,
                          !destinationHasValue && searchStyles.dropdownTextPlaceholder,
                        ]}
                      >
                        {destinationLabelDriver}
                      </Text>
                    </Pressable>
                    {destinationHasValue ? (
                      <Pressable
                        style={searchStyles.clearButton}
                        onPress={() => {
                          setDestination('');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Effacer la destination"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <IconSymbol name="xmark" size={18} color={Colors.gray500} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                {showDestinationList ? (
                  <View style={searchStyles.dropdownList}>
                    {CAMPUS_OPTIONS.map((option) => (
                      <Pressable
                        key={option}
                        style={searchStyles.dropdownItem}
                        onPress={() => selectDriverDestination(option)}
                      >
                        <Text style={searchStyles.dropdownItemText}>{option}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={searchStyles.searchButtonWrapper}>
                <GradientButton
                  title="Continuer"
                  onPress={handleContinue}
                  variant="twilight"
                  size="sm"
                  fullWidth
                  style={[searchStyles.fullSearchButton, searchStyles.driverCTA]}
                  contentStyle={{ paddingVertical: Spacing.lg }}
                  accessibilityRole="button"
                  disabled={!canContinue}
                />
              </View>
            </View>
          </View>
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
    gap: Spacing.xl,
    paddingBottom: Spacing.xxl * 2,
  },
  hero: {
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLabel: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: Colors.white,
    fontSize: 16,
    opacity: 0.9,
  },
  notificationIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: Colors.danger,
    borderRadius: Radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  notificationBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
    justifyContent: 'center',
  },
  quickAction: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 150,
    maxWidth: 180,
    borderRadius: Radius['2xl'],
    backgroundColor: Colors.card,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
    position: 'relative',
  },
  quickIconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionBadge: {
    width: 22,
    height: 22,
    position: 'absolute',
    top: -6,
    right: -2,
    backgroundColor: Colors.danger,
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  quickLabel: {
    fontWeight: '700',
    color: Colors.ink,
    textAlign: 'center',
  },
  quickBadgeText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 14,
  },
  section: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius['2xl'],
    backgroundColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  sponsorSection: {
    paddingHorizontal: 0,
    paddingBottom: Spacing.md,
  },
  sectionRaised: {
    zIndex: 60,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
  },
  formCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  suggestionScroll: {
    maxHeight: 280,
  },
  recommendedList: {
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  rideCard: {
    width: 280,
    backgroundColor: Colors.card,
    borderRadius: Radius['2xl'],
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadows.card,
    marginRight: Spacing.md,
  },
  rideHeader: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  rideDriver: {
    fontWeight: '700',
    color: Colors.ink,
  },
  rideMeta: {
    color: Colors.gray500,
    fontSize: 12,
  },
  priceBadge: {
    alignItems: 'flex-end',
  },
  priceBadgeText: {
    color: Colors.primary,
    fontWeight: '800',
  },
  priceBadgeSub: {
    color: Colors.gray500,
    fontSize: 12,
  },
  rideRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.secondary,
  },
  routeLabel: {
    color: Colors.ink,
  },
  rideFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rideFooterLabel: {
    color: Colors.gray500,
  },
  secondaryButton: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  requestCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.card,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusText: {
    color: Colors.success,
    fontWeight: '700',
  },
  requestBadgeText: {
    color: Colors.gray600,
  },
  requestBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  requestAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  requestDriver: {
    fontWeight: '700',
    color: Colors.ink,
  },
  requestMeta: {
    color: Colors.gray500,
    fontSize: 12,
  },
  requestRoute: {
    color: Colors.ink,
    marginTop: 2,
  },
  requestPrice: {
    alignItems: 'flex-end',
  },
  requestPriceValue: {
    color: Colors.primary,
    fontWeight: '800',
  },
  requestPriceLabel: {
    color: Colors.gray500,
    fontSize: 12,
  },
  emptyText: {
    color: Colors.gray500,
    fontStyle: 'italic',
  },
  emptyTextLight: {
    color: Colors.white,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.gray100,
    borderRadius: Radius.pill,
    padding: Spacing.xs,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  tabButtonActive: {
    backgroundColor: Colors.card,
    ...Shadows.card,
  },
  tabLabel: {
    color: Colors.gray500,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: Colors.primary,
  },
  tripCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.card,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tripStatusText: {
    color: '#4F8EF7',
    fontWeight: '700',
  },
  tripHeaderMeta: {
    color: Colors.gray500,
    fontSize: 12,
  },
  sponsorCard: {
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.xs * 2,
    paddingHorizontal: Spacing.sm * 2,
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
    borderWidth: 0,
    overflow: 'hidden',
    justifyContent: 'space-between',
    paddingBottom: Spacing.xs,
  },
  sponsorCarouselWrapper: {
    marginTop: Spacing.md,
    overflow: 'hidden',
    paddingHorizontal: Spacing.sm,
    width: '100%',
  },
  sponsorCarousel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  sponsorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sponsorBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  sponsorBadgeText: {
    color: Colors.white,
    fontWeight: '700',
  },
  sponsorBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  sponsorLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  sponsorBrand: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  sponsorTagline: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  sponsorDescription: {
    color: Colors.white,
    opacity: 0.9,
    fontSize: 13,
    lineHeight: 18,
  },
  sponsorButton: {
    backgroundColor: Colors.white,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  sponsorButtonText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  driverHeader: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  driverTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
  },
  driverSubtitle: {
    color: Colors.white,
    opacity: 0.9,
    textAlign: 'center',
  },
  driverPromoSection: {
    marginTop: Spacing.sm,
    width: '100%',
    marginBottom: Spacing.xl * 2,
  },
  driverPromoCard: {
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.xs,
    alignItems: 'center',
  },
  driverPromoAction: {
    marginTop: Spacing.md,
    backgroundColor: Colors.white,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius['2xl'],
    alignSelf: 'center',
  },
  driverPromoActionText: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  driverPromoActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  searchHint: {
    color: Colors.gray500,
    fontSize: 12,
    marginTop: Spacing.md,
  },
});

const searchStyles = StyleSheet.create({
  dropdownWrapper: {
    position: 'relative',
    gap: Spacing.xs,
  },
  dropdownWrapperTop: {
    zIndex: 140,
  },
  dropdownWrapperBottom: {
    zIndex: 120,
  },
  dropdownLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gray600,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7F2',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    height: 52,
    gap: Spacing.sm,
    backgroundColor: '#F9F9FF',
  },
  toInput: {
    alignItems: 'center',
    position: 'relative',
  },
  dropdownValueWithClear: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dropdownTrigger: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
  },
  dropdownText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink,
  },
  dropdownTextPlaceholder: {
    color: Colors.gray400,
  },
  dropdownTextInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink,
  },
  clearButton: {
    marginLeft: Spacing.sm,
    padding: Spacing.xs,
    borderRadius: 999,
  },
  locationDetectedText: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    fontSize: 12,
    color: Colors.gray600,
    fontWeight: '500',
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
  },
  dropdownItem: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  dropdownItemText: {
    fontWeight: '600',
    color: Colors.ink,
  },
  searchButtonWrapper: {
    marginTop: Spacing.md,
  },
  fullSearchButton: {
    position: 'relative',
  },
  driverCTA: {
    borderRadius: Radius.xl,
    height: 58,
  },
});


const driverStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFE8D8',
  },
  safe: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl * 1.5,
    paddingTop: Spacing.xl,
    gap: Spacing.lg,
  },
  hero: {
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  heroGradient: {
    borderRadius: 36,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  heroGreeting: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: Radius['2xl'],
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    color: Colors.white,
    fontWeight: '700',
  },
  quickAction: {},
  quickIcon: {
    backgroundColor: Colors.accentSoft,
    borderWidth: 0,
  },
  publishCard: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius['2xl'],
    backgroundColor: '#FFFFFF',
    gap: Spacing.sm,
    ...Shadows.card,
  },
  publishTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  publishField: {
    gap: Spacing.xs,
  },
  publishLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gray600,
  },
  publishInput: {
    borderWidth: 1,
    borderColor: '#E5E7F2',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    color: Colors.ink,
    fontSize: 15,
    minHeight: 48,
  },
  publishButton: {
    backgroundColor: Colors.accent,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
  },
  heroCardOverlay: {
    marginTop: Spacing.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    overflow: 'visible',
    zIndex: 10,
  },
  heroOverlayTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink,
  },
  heroOverlaySubtitle: {
    color: Colors.gray600,
  },
  tripTabs: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  tripTab: {
    flex: 1,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  tripTabActive: {
    backgroundColor: Colors.white,
    borderColor: 'transparent',
  },
  tripTabLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.gray600,
  },
  tripTabLabelActive: {
    color: Colors.primary,
  },
  addTripButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.accent,
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  addTripButtonText: {
    color: Colors.white,
    fontWeight: '700',
  },
  loaderWrapper: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyState: {
    marginTop: Spacing.lg,
    borderRadius: Radius['2xl'],
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
    ...Shadows.card,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  emptyStateSubtitle: {
    color: Colors.gray500,
    textAlign: 'center',
  },
  tripList: {
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  tripCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  tripCardHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tripCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  tripCardMeta: {
    color: Colors.gray500,
    marginTop: Spacing.xs,
  },
  tripStatusBadge: {
    paddingHorizontal: Spacing.md / 2,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    backgroundColor: '#FFF5EB',
  },
  tripStatusLabel: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  pendingSection: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.gray600,
  },
  pendingRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  pendingAvatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    backgroundColor: Colors.gray100,
  },
  pendingInfo: {
    flex: 1,
  },
  pendingName: {
    fontWeight: '700',
    color: Colors.ink,
  },
  pendingMeta: {
    color: Colors.gray500,
    fontSize: 12,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  actionButton: {
    backgroundColor: Colors.accent,
    borderRadius: Radius['2xl'],
    paddingHorizontal: Spacing.sm * 1.5,
    paddingVertical: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.danger,
    paddingHorizontal: Spacing.sm * 1.5,
  },
  outlineButtonText: {
    color: Colors.danger,
  },
  callButton: {
    backgroundColor: '#F9F9FF',
    borderRadius: Radius['2xl'],
    paddingHorizontal: Spacing.sm * 1.5,
    paddingVertical: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callButtonText: {
    color: Colors.ink,
    fontWeight: '700',
    fontSize: 13,
  },
  confirmedSection: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  confirmedRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  confirmedActions: {
    flexDirection: 'column',
    gap: Spacing.xs,
    alignItems: 'flex-end',
  },
  cancelLink: {
    marginTop: Spacing.xs,
  },
  cancelLinkText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  historySection: {
    marginTop: Spacing.md,
  },
  infoGrid: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.gray500,
  },
  infoValue: {
    fontWeight: '700',
    color: Colors.ink,
  },
  detailEmptyText: {
    color: Colors.gray500,
    fontStyle: 'italic',
  },
  heroPrimaryButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.accent,
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.xs * 2,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    ...Shadows.card,
  },
  heroPrimaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  quickPreviewWrapper: {
    marginTop: Spacing.lg,
    borderRadius: Radius['2xl'],
    backgroundColor: '#FFFFFF',
    padding: Spacing.sm,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  quickPreviewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  quickPreviewEmpty: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  quickPreviewEmptyText: {
    color: Colors.gray600,
    fontStyle: 'italic',
  },
  quickPreviewItem: {
    borderRadius: 26,
    backgroundColor: '#F7F7FB',
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  quickPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickPreviewRoute: {
    fontWeight: '700',
    color: Colors.ink,
  },
  quickPreviewBadge: {
    backgroundColor: '#FF8B3D',
    borderRadius: Radius.pill,
    paddingVertical: Spacing.xs / 1.5,
    paddingHorizontal: Spacing.md,
  },
  quickPreviewBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  quickPreviewMeta: {
    color: Colors.gray500,
    fontSize: 13,
  },
  quickPreviewInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewAddButton: {
    marginTop: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  previewAddText: {
    color: Colors.accent,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.card,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  placeholder: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  placeholderSubtitle: {
    color: Colors.gray500,
  },
  emptyText: {
    color: Colors.gray500,
  },
  cancelledCard: {
    borderRadius: 24,
    padding: Spacing.lg,
    backgroundColor: '#F3EBFF',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    ...Shadows.card,
  },
  previewCard: {
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.card,
    marginTop: Spacing.sm,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  previewRoute: {
    fontWeight: '700',
    color: Colors.ink,
    flex: 1,
  },
  demandBadge: {
    backgroundColor: '#FF8B3D',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs / 1.5,
  },
  demandBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  previewMeta: {
    color: Colors.gray500,
    fontSize: 13,
  },
  previewInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  previewInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  previewInfoText: {
    color: Colors.gray600,
    fontWeight: '600',
  },
  previewPrice: {
    fontWeight: '700',
    color: Colors.ink,
  },
  addRideButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.accent,
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    ...Shadows.card,
  },
  addRideText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

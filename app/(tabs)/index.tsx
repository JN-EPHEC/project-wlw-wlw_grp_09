import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  View,
} from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { DisplayRide, FALLBACK_UPCOMING } from '@/app/data/driver-samples';
import type { AuthSession } from '@/app/services/auth';
import { useAuthSession } from '@/hooks/use-auth-session';
import { getAvatarUrl } from '@/app/ui/avatar';
import type { Notification } from '@/app/services/notifications';
import { subscribeNotifications } from '@/app/services/notifications';
import { getRides, hasRideDeparted, subscribeRides, type Ride } from '@/app/services/rides';
import { getWallet, subscribeWallet, type WalletSnapshot } from '@/app/services/wallet';
import { usePassengerRequests } from '@/hooks/use-passenger-requests';
import { BRUSSELS_COMMUNES } from '@/constants/communes';
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

const driverSponsor = {
  brand: 'Adobe Creative Cloud',
  tagline: '60 % de réduction étudiants',
  badge: 'Sponsorisé',
  url: 'https://www.adobe.com/fr/creativecloud/buy/students.html',
  colors: ['#A7001F', '#E62216'],
  logo: require('@/assets/images/adobe.jpg'),
};

const sponsorSecondary = {
  brand: 'Netflix Student',
  tagline: '1er mois offert',
  badge: 'Sponsorisé',
  colors: ['#F44336', '#D32F2F'],
  url: 'https://www.netflix.com/be-en/',
  logo: require('@/assets/images/Netflix.jpg'),
};

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

  const selectDepartureSuggestion = (value: string) => {
    setDepartureInput(value);
    setDetectedCommune(null);
    setDepartureFocused(false);
  };

  const handleUseLocation = useCallback(async () => {
    try {
      setLocationLoading(true);
      const { commune } = await getCurrentCommune();
      setDepartureInput(commune);
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

  const itinerary = useMemo(() => {
    if (!featuredRide) return [];
    const segments = [
      {
        label: featuredRide.depart,
        time: formatTime(featuredRide.departureAt),
        color: '#7ED957',
      },
      {
        label: 'Point intermédiaire',
        time: formatTime(featuredRide.departureAt + 5 * 60 * 1000),
        color: '#B1B5C8',
      },
      {
        label: featuredRide.destination,
        time: formatTime(featuredRide.departureAt + 12 * 60 * 1000),
        color: Colors.primary,
      },
    ];
    return segments;
  }, [featuredRide]);

  const departureSuggestions = useMemo(() => {
    const query = departureInput.trim().toLowerCase();
    if (!query) return [...BRUSSELS_COMMUNES];
    return BRUSSELS_COMMUNES.filter((commune) =>
      commune.toLowerCase().includes(query)
    );
  }, [departureInput]);

  const showDepartureSuggestions = isDepartureFocused && departureSuggestions.length > 0;

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
                      <IconSymbol name={action.icon} size={24} color={Colors.primary} />
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
              <Text style={styles.inputLabel}>Point de départ</Text>
              <View style={styles.dropdownContainer}>
                <View style={styles.inputRow}>
                  <View style={[styles.inputWrapper, styles.inputWrapperSoft]}>
                    <IconSymbol name="location.fill" size={18} color={Colors.gray500} />
                    <TextInput
                      placeholder="Saisir votre adresse"
                      placeholderTextColor={Colors.gray400}
                      value={departureInput}
                      onChangeText={(value) => {
                        setDepartureInput(value);
                        setDetectedCommune(null);
                      }}
                      style={styles.input}
                      onFocus={handleDepartureFocus}
                      onBlur={handleDepartureBlur}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>
                  <Pressable
                    style={styles.swapButton}
                    accessibilityRole="button"
                    accessibilityLabel="Inverser départ et destination"
                    onPress={() => {
                      setDepartureInput(campus);
                      setCampus(departureInput);
                      setDetectedCommune(null);
                      setShowCampusList(false);
                    }}
                  >
                    <IconSymbol name="chevron.up" size={18} color={Colors.gray500} />
                    <IconSymbol name="chevron.down" size={18} color={Colors.gray500} />
                  </Pressable>
                </View>
                {showDepartureSuggestions ? (
                  <View style={styles.dropdownListHome}>
                    <ScrollView
                      style={styles.suggestionScroll}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      {[locationLoading ? 'Localisation…' : 'Ma position actuelle', ...departureSuggestions].map(
                        (suggestion, index) => (
                          <Pressable
                            key={`${suggestion}-${index}`}
                            style={styles.dropdownItemHome}
                            onPress={() => {
                              if (index === 0) {
                                handleUseLocation();
                                return;
                              }
                              selectDepartureSuggestion(suggestion);
                            }}
                          >
                            <Text style={styles.dropdownItemHomeText}>{suggestion}</Text>
                          </Pressable>
                        )
                      )}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
              <Text style={styles.inputLabel}>Destination</Text>
              <View style={styles.dropdownContainer}>
                <Pressable style={[styles.selector]} onPress={handleCampusSelect}>
                  <IconSymbol name="graduationcap.fill" size={18} color={Colors.gray500} />
                  <Text style={[styles.selectorText, !campus && styles.selectorPlaceholder]}>
                    {campus || 'Sélectionnez un campus'}
                  </Text>
                  <IconSymbol name="chevron.down" size={18} color={Colors.gray400} />
                </Pressable>
                {showCampusList ? (
                  <View style={styles.dropdownListInline}>
                    {CAMPUS_OPTIONS.map((option) => (
                      <Pressable
                        key={option}
                        style={[
                          styles.dropdownItemInline,
                          option === campus && styles.dropdownItemInlineActive,
                        ]}
                        onPress={() => selectCampus(option)}
                      >
                        <Text
                          style={[
                            styles.dropdownItemInlineText,
                            option === campus && styles.dropdownItemInlineTextActive,
                          ]}
                        >
                          {option}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <Pressable style={styles.primaryButton} onPress={handleSearch} accessibilityRole="button">
                <IconSymbol name="magnifyingglass" size={18} color={Colors.white} />
                <Text style={styles.primaryButtonText}>Rechercher</Text>
              </Pressable>
            </View>
          </View>

          <GradientBackground colors={sponsorSecondary.colors} style={[styles.inlineSponsor, styles.inlineSponsorStandalone]}>
            <View style={styles.inlineSponsorLogo}>
              <Image
                source={sponsorSecondary.logo}
                style={styles.inlineSponsorLogoImage}
                resizeMode="contain"
              />
            </View>
            <View style={{ flex: 1 }}>
              {sponsorSecondary.badge ? (
                <View style={styles.inlineBadge}>
                  <Text style={styles.inlineBadgeText}>{sponsorSecondary.badge}</Text>
                </View>
              ) : null}
              <Text style={styles.inlineSponsorLabel}>{sponsorSecondary.brand}</Text>
              <Text style={styles.inlineSponsorTagline}>{sponsorSecondary.tagline}</Text>
            </View>
            <Pressable onPress={() => openSponsor(sponsorSecondary.url)}>
              <IconSymbol name="arrow.up.right.square" size={24} color={Colors.white} />
            </Pressable>
          </GradientBackground>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trajets qui pourraient vous intéresser</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendedList}>
              {recommendedRides.map((ride) => (
                <Pressable
                  key={ride.id}
                  style={styles.rideCard}
                  onPress={() => openRide(ride)}
                  accessibilityRole="button"
                >
                  <View style={styles.rideHeader}>
                    <Image source={{ uri: getAvatarUrl(ride.ownerEmail, 96) }} style={styles.avatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rideDriver}>{ride.driver}</Text>
                      <Text style={styles.rideMeta}>
                        ⭐ {getRandomRating(ride)} · {getRandomTripsCount(ride)} trajets
                      </Text>
                    </View>
                    <View style={styles.priceBadge}>
                      <Text style={styles.priceBadgeText}>{ride.price.toFixed(2)} €</Text>
                      <Text style={styles.priceBadgeSub}>
                        {ride.seats - ride.passengers.length} place(s)
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rideRoute}>
                    <View style={styles.routeDot} />
                    <Text style={styles.routeLabel}>{ride.depart}</Text>
                  </View>
                  <View style={styles.rideRoute}>
                    <View style={[styles.routeDot, { backgroundColor: Colors.primary }]} />
                    <Text style={styles.routeLabel}>{ride.destination}</Text>
                  </View>
                  <View style={styles.rideFooter}>
                    <Text style={styles.rideFooterLabel}>
                      {formatTime(ride.departureAt)} · {ride.seats} place(s)
                    </Text>
                    <Pressable style={styles.secondaryButton} onPress={() => openRide(ride)}>
                      <Text style={styles.secondaryButtonText}>Voir les détails</Text>
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.section} onLayout={registerSection('requests')}>
            <Text style={styles.sectionTitle}>Mes demandes</Text>
            <Text style={styles.sectionSubtitle}>Suivez vos demandes de covoiturage</Text>
            <View style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <View style={styles.statusBadge}>
                  <IconSymbol name="checkmark.seal.fill" size={16} color={Colors.success} />
                  <Text style={styles.statusText}>Acceptée</Text>
                </View>
                <Text style={styles.requestBadgeText}>
                  {pendingRequests.length} acceptée(s)
                </Text>
              </View>
              {pendingRequests[0] ? (
                <>
                  <View style={styles.requestBody}>
                    <Image
                      source={{ uri: getAvatarUrl(pendingRequests[0].ownerEmail, 96) }}
                      style={styles.requestAvatar}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.requestDriver}>{pendingRequests[0].driver}</Text>
                      <Text style={styles.requestMeta}>
                        ⭐ {getRandomRating(pendingRequests[0])} · {getRandomTripsCount(pendingRequests[0])} trajets
                      </Text>
                      <Text style={styles.requestRoute}>
                        {pendingRequests[0].depart} → {pendingRequests[0].destination}
                      </Text>
                    </View>
                    <View style={styles.requestPrice}>
                      <Text style={styles.requestPriceValue}>
                        {pendingRequests[0].price.toFixed(2)} €
                      </Text>
                      <Text style={styles.requestPriceLabel}>{pendingRequests[0].seats} place(s)</Text>
                    </View>
                  </View>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => openRide(pendingRequests[0])}
                  >
                    <Text style={styles.primaryButtonText}>Procéder au paiement</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={styles.emptyText}>
                  Tu n’as pas encore de demande acceptée. Réserve un trajet dès maintenant !
                </Text>
              )}
            </View>
          </View>

          <View style={styles.section} onLayout={registerSection('trips')}>
            <Text style={styles.sectionTitle}>Mes trajets</Text>
            <Text style={styles.sectionSubtitle}>Gérez vos réservations</Text>
            <View style={styles.tabs}>
              {(['current', 'reserved', 'history'] as const).map((tab) => (
                <Pressable
                  key={tab}
                  style={[styles.tabButton, tripTab === tab && styles.tabButtonActive]}
                  onPress={() => setTripTab(tab)}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      tripTab === tab && styles.tabLabelActive,
                    ]}
                  >
                    {tab === 'current' ? 'En cours' : tab === 'reserved' ? 'Réservés' : 'Historique'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {activeTrip ? (
              <View style={styles.tripCard}>
                <View style={styles.tripHeader}>
                  <View style={styles.tripStatus}>
                    <IconSymbol name="sparkles" size={16} color="#4F8EF7" />
                    <Text style={styles.tripStatusText}>
                      {hasRideDeparted(activeTrip) ? 'Terminé' : 'En cours'}
                    </Text>
                  </View>
                  <Text style={styles.tripHeaderMeta}>
                    {formatDate(activeTrip.departureAt)} · {formatTime(activeTrip.departureAt)}
                  </Text>
                </View>
                <View style={styles.requestBody}>
                  <Image
                    source={{ uri: getAvatarUrl(activeTrip.ownerEmail, 96) }}
                    style={styles.requestAvatar}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.requestDriver}>{activeTrip.driver}</Text>
                    <Text style={styles.requestMeta}>
                      ⭐ {getRandomRating(activeTrip)} · {getRandomTripsCount(activeTrip)} trajets
                    </Text>
                    <Text style={styles.requestRoute}>
                      {activeTrip.depart} → {activeTrip.destination}
                    </Text>
                  </View>
                  <View style={styles.requestPrice}>
                    <Text style={styles.requestPriceValue}>{activeTrip.price.toFixed(2)} €</Text>
                    <Text style={styles.requestPriceLabel}>5.2 km · 15 min</Text>
                  </View>
                </View>
                <Pressable style={styles.primaryButton} onPress={() => openRide(activeTrip)}>
                  <IconSymbol name="paperplane.fill" size={18} color={Colors.white} />
                  <Text style={styles.primaryButtonText}>Voir +</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[styles.emptyText, styles.emptyTextLight]}>
                Aucun trajet pour cette catégorie.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Annulés</Text>
            <Text style={styles.sectionSubtitle}>Les trajets que vous avez annulés</Text>
            {canceledTrips.length ? (
              canceledTrips.map((ride) => (
                <View key={ride.id} style={styles.cancelledCard}>
                  <View style={styles.requestBody}>
                    <Image
                      source={{ uri: getAvatarUrl(ride.ownerEmail, 96) }}
                      style={styles.requestAvatar}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.requestDriver}>{ride.driver}</Text>
                      <Text style={styles.requestMeta}>
                        {formatTime(ride.departureAt)} · {ride.depart} → {ride.destination}
                      </Text>
                      <Text style={styles.requestSubtitle}>Réservation annulée</Text>
                    </View>
                    <View style={styles.requestPrice}>
                      <Text style={styles.requestPriceValue}>{ride.price.toFixed(2)} €</Text>
                      <Text style={styles.requestPriceLabel}>{ride.seats} place(s)</Text>
                    </View>
                  </View>
                  <Pressable style={styles.secondaryButton} onPress={() => openRide(ride)}>
                    <Text style={styles.secondaryButtonText}>Voir les détails</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={[styles.emptyText, styles.emptyTextLight]}>
                Aucune annulation pour le moment.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Itinéraire</Text>
            <View style={styles.infoCard}>
              {itinerary.map((item, index) => (
                <View key={item.label} style={styles.itineraryRow}>
                  <View style={[styles.itineraryDot, { backgroundColor: item.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itineraryLabel}>{item.label}</Text>
                    <Text style={styles.itineraryTime}>{item.time}</Text>
                  </View>
                  {index < itinerary.length - 1 ? (
                    <View style={styles.itineraryBridge} />
                  ) : null}
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Informations</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <IconSymbol name="calendar" size={20} color={Colors.gray500} />
                <Text style={styles.infoLabel}>Date</Text>
                <Text style={styles.infoValue}>
                  {featuredRide ? formatDate(featuredRide.departureAt) : '—'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="clock" size={20} color={Colors.gray500} />
                <Text style={styles.infoLabel}>Heure de départ</Text>
                <Text style={styles.infoValue}>
                  {featuredRide ? formatTime(featuredRide.departureAt) : '—'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="person.fill" size={20} color={Colors.gray500} />
                <Text style={styles.infoLabel}>Places réservées</Text>
                <Text style={styles.infoValue}>
                  {featuredRide ? featuredRide.passengers.length : 0} place(s)
                </Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="creditcard.fill" size={20} color={Colors.gray500} />
                <Text style={styles.infoLabel}>Prix total</Text>
                <Text style={styles.infoValueHighlight}>
                  {featuredRide ? `${featuredRide.price.toFixed(2)} €` : '—'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Offres sponsorisées</Text>
            <GradientBackground colors={sponsorOffer.colors} style={styles.sponsorCard}>
              <View style={styles.sponsorHeader}>
                <View style={styles.sponsorBadge}>
                  <Text style={styles.sponsorBadgeText}>{sponsorOffer.badge}</Text>
                </View>
                <Pressable onPress={() => openSponsor(sponsorOffer.url)}>
                  <IconSymbol name="arrow.up.right.square" size={22} color={Colors.white} />
                </Pressable>
              </View>
              <View style={styles.sponsorBrandRow}>
                <Image source={sponsorOffer.logo} style={styles.sponsorLogo} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sponsorBrand}>{sponsorOffer.brand}</Text>
                  <Text style={styles.sponsorTagline}>{sponsorOffer.tagline}</Text>
                </View>
              </View>
              <Text style={styles.sponsorDescription}>{sponsorOffer.description}</Text>
              <Pressable style={styles.sponsorButton} onPress={() => openSponsor(sponsorOffer.url)}>
                <Text style={styles.sponsorButtonText}>Profiter de l’offre</Text>
              </Pressable>
            </GradientBackground>

          </View>

          <View style={styles.section}>
            <GradientBackground colors={Gradients.cta} style={styles.driverCTA}>
              <View style={styles.driverLogoWrapper}>
                <Image
                  source={require('@/assets/images/logo.png')}
                  style={styles.driverLogo}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.driverTitle}>Devenez conducteur et gagnez de l’argent</Text>
              <Text style={styles.driverSubtitle}>
                Publie ton premier trajet en moins de 2 minutes et fixe ton prix librement.
              </Text>
              <Pressable
                style={styles.primaryButton}
                onPress={() => router.push('/driver-verification')}
              >
                <Text style={styles.primaryButtonText}>Devenir conducteur</Text>
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

  useEffect(() => {
    const unsubscribe = subscribeRides((items) => {
      setRides(items);
      setLoadingRides(false);
    });
    return unsubscribe;
  }, []);

  const publishedRides = useMemo(() => {
    if (!ownerEmail) return [];
    return rides
      .filter((ride) => ride.ownerEmail === ownerEmail)
      .sort((a, b) => a.departureAt - b.departureAt);
  }, [rides, ownerEmail]);

  const upcomingRides = useMemo(
    () => publishedRides.filter((ride) => !hasRideDeparted(ride)),
    [publishedRides]
  );

  const greetingName = getFirstName(session.name) ?? 'Conducteur';
  const displayFullName = session.name?.trim()?.length ? session.name : greetingName;

  const handleCreateRide = useCallback(() => {
    router.push('/create-ride');
  }, []);

  const handleEditRide = useCallback((rideId: string) => {
    router.push({ pathname: '/explore', params: { edit: rideId } } as any);
  }, []);

  const handleOpenSponsor = useCallback(() => {
    Linking.openURL(driverSponsor.url).catch(() => undefined);
  }, []);

  const handleViewPublished = useCallback(() => {
    router.push('/driver-published');
  }, []);

  const upcomingRidesDisplay = useMemo<DisplayRide[]>(
    () => (upcomingRides.length ? (upcomingRides as DisplayRide[]) : FALLBACK_UPCOMING),
    [upcomingRides]
  );
  const quickPreviewRides = useMemo(() => upcomingRidesDisplay.slice(0, 2), [upcomingRidesDisplay]);

  return (
    <AppBackground style={driverStyles.screen}>
      <SafeAreaView style={driverStyles.safe}>
        <ScrollView
          contentContainerStyle={driverStyles.content}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        >
          <GradientBackground colors={Gradients.driver} style={driverStyles.heroGradient}>
            <View style={driverStyles.heroTop}>
              <View>
                <Text style={driverStyles.heroGreeting}>Bonjour {greetingName}</Text>
                <Text style={driverStyles.heroSubtitle}>Gérez vos trajets</Text>
              </View>
              <Pressable style={driverStyles.heroBell} onPress={() => router.push('/(tabs)/messages')}>
                <IconSymbol name="bell.fill" size={18} color="#fff" />
              </Pressable>
            </View>
            <Pressable style={driverStyles.sponsorWrapper} onPress={handleOpenSponsor}>
              <GradientBackground colors={driverSponsor.colors} style={driverStyles.sponsorCard}>
                <Image source={driverSponsor.logo} style={driverStyles.sponsorLogo} resizeMode="contain" />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={driverStyles.sponsorBadge}>{driverSponsor.badge}</Text>
                  <Text style={driverStyles.sponsorTitle}>{driverSponsor.brand}</Text>
                  <Text style={driverStyles.sponsorSubtitle}>{driverSponsor.tagline}</Text>
                </View>
                <IconSymbol name="arrow.up.right.square" size={18} color="#FFFFFF" />
              </GradientBackground>
            </Pressable>
          </GradientBackground>

          <View style={driverStyles.heroCardOverlay}>
            <Text style={driverStyles.heroOverlayTitle}>Bonjour {displayFullName}</Text>
            <Text style={driverStyles.heroOverlaySubtitle}>Gérez vos trajets</Text>
            <Pressable style={driverStyles.heroPrimaryButton} onPress={handleViewPublished}>
              <IconSymbol name="list.bullet.rectangle" size={16} color="#fff" />
              <Text style={driverStyles.heroPrimaryButtonText}>Voir mes trajets publiés</Text>
            </Pressable>
            <View style={driverStyles.quickPreviewWrapper}>
              <Text style={driverStyles.quickPreviewTitle}>Aperçu rapide</Text>
              {loadingRides ? (
                <View style={driverStyles.quickPreviewEmpty}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : quickPreviewRides.length === 0 ? (
                <Text style={driverStyles.quickPreviewEmptyText}>
                  Publie un trajet pour voir un aperçu rapide.
                </Text>
              ) : (
                quickPreviewRides.map((ride) => {
                  const pending = ride.requests ?? ride.passengers.length;
                  return (
                    <View key={ride.id} style={driverStyles.quickPreviewItem}>
                      <View style={driverStyles.quickPreviewRow}>
                        <Text style={driverStyles.quickPreviewRoute}>
                          {ride.depart} → {ride.destination}
                        </Text>
                        {pending ? (
                          <View style={driverStyles.quickPreviewBadge}>
                            <Text style={driverStyles.quickPreviewBadgeText}>
                              {pending} demande{pending > 1 ? 's' : ''}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={driverStyles.quickPreviewMeta}>{formatRideMoment(ride.departureAt)}</Text>
                      <View style={driverStyles.quickPreviewInfo}>
                        <View style={driverStyles.previewInfo}>
                          <IconSymbol name="person.2.fill" size={14} color={Colors.gray500} />
                          <Text style={driverStyles.previewInfoText}>
                            {ride.passengers.length} passager{ride.passengers.length > 1 ? 's' : ''}
                          </Text>
                        </View>
                        <Text style={driverStyles.previewPrice}>Prix: {ride.price.toFixed(2)}€</Text>
                      </View>
                    </View>
                  );
                })
              )}
              <Pressable style={driverStyles.previewAddButton} onPress={handleCreateRide}>
                <IconSymbol name="plus" size={16} color={Colors.accent} />
                <Text style={driverStyles.previewAddText}>Ajouter un nouveau trajet</Text>
              </Pressable>
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
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gray600,
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    color: Colors.ink,
    fontSize: 15,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7F2',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    height: 56,
    gap: Spacing.sm,
  },
  inputWrapperSoft: {
    backgroundColor: '#F9F9FF',
    borderColor: '#E5E7F2',
  },
  swapButton: {
    width: 48,
    height: 56,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E5E7F2',
    backgroundColor: '#F9F9FF',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: Spacing.xs,
  },
  suggestionList: {
    marginTop: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    overflow: 'hidden',
  },
  suggestionScroll: {
    maxHeight: 280,
  },
  dropdownContainer: {
    position: 'relative',
  },
  suggestionItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  suggestionText: {
    color: Colors.ink,
    fontWeight: '600',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7F2',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    height: 56,
    gap: Spacing.sm,
    backgroundColor: '#F9F9FF',
  },
  selectorText: {
    flex: 1,
    color: Colors.ink,
    fontSize: 15,
  },
  selectorPlaceholder: {
    color: Colors.gray400,
  },
  dropdownListInline: {
    marginTop: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dropdownItemInline: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dropdownItemInlineText: {
    color: Colors.ink,
  },
  dropdownItemInlineActive: {
    backgroundColor: Colors.primaryLight,
  },
  dropdownItemInlineTextActive: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: '700',
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
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.card,
  },
  itineraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  itineraryDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  itineraryLabel: {
    fontWeight: '700',
    color: Colors.ink,
  },
  itineraryTime: {
    color: Colors.gray500,
    fontSize: 12,
  },
  itineraryBridge: {
    width: 40,
    height: 1,
    backgroundColor: Colors.gray200,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  infoLabel: {
    color: Colors.gray600,
    flex: 1,
  },
  infoValue: {
    color: Colors.ink,
    fontWeight: '600',
  },
  infoValueHighlight: {
    color: Colors.primary,
    fontWeight: '800',
  },
  sponsorCard: {
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
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
    fontSize: 22,
    fontWeight: '800',
  },
  sponsorTagline: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  sponsorDescription: {
    color: Colors.white,
    opacity: 0.9,
  },
  sponsorButton: {
    backgroundColor: Colors.white,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  sponsorButtonText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  driverCTA: {
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  driverLogoWrapper: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.lg,
    alignSelf: 'flex-start',
  },
  driverLogo: {
    width: 96,
    height: 32,
  },
  driverTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.white,
  },
  driverSubtitle: {
    color: Colors.white,
    opacity: 0.9,
  },
  inlineSponsor: {
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    position: 'relative',
    zIndex: 10,
  },
  inlineSponsorStandalone: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: Spacing.md,
  },
  inlineSponsorLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineSponsorLogoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  inlineBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 1.5,
    marginBottom: Spacing.xs,
  },
  inlineBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  inlineSponsorLabel: {
    color: Colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  inlineSponsorTagline: {
    color: Colors.white,
    opacity: 0.9,
  },
  searchHint: {
    color: Colors.gray500,
    fontSize: 12,
    marginTop: Spacing.md,
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
  heroGradient: {
    borderRadius: 36,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroGreeting: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
  },
  heroBell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sponsorWrapper: {
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
  },
  sponsorCard: {
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  sponsorLogo: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  sponsorBadge: {
    color: '#FFECD8',
    fontSize: 12,
    fontWeight: '700',
  },
  sponsorTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: Spacing.xs,
  },
  sponsorSubtitle: {
    color: '#FFFFFF',
    opacity: 0.9,
  },
  heroCardOverlay: {
    marginTop: -Spacing.xl,
    backgroundColor: '#FFFFFF',
    borderRadius: 36,
    padding: Spacing.xl,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  heroOverlayTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink,
  },
  heroOverlaySubtitle: {
    color: Colors.gray600,
  },
  heroPrimaryButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.accent,
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
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
  dropdownListHome: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 100,
    elevation: 10,
  },
  dropdownItemHome: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  dropdownItemHomeText: {
    color: Colors.ink,
    fontWeight: '600',
  },
});

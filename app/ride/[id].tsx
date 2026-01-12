import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuthSession } from '@/hooks/use-auth-session';
import { RatingStars } from '@/components/ui/rating-stars';
import {
  cancelReservation,
  getRide,
  hasRideDeparted,
  removeRide,
  reserveSeat,
  subscribeRides,
  type Ride,
} from '@/app/services/rides';
import { createThread } from '@/app/services/messages';
import { getWallet, subscribeWallet, type WalletSnapshot } from '@/app/services/wallet';
import { logReservationRequest, removeReservationRequest } from '@/app/services/reservation-requests';
import { usePassengerRequests } from '@/hooks/use-passenger-requests';
import { subscribeDriverReviews } from '@/app/services/reviews';
import { evaluateRewards } from '@/app/services/rewards';
import { Colors, Gradients, Shadows, Spacing, Radius, Typography } from '@/app/ui/theme';
import { getAvatarColor, getAvatarUrl } from '@/app/ui/avatar';
import {
  submitPassengerFeedback,
  subscribeDriverFeedback,
  type PassengerFeedback,
} from '@/app/services/passenger-feedback';
import { createReport } from '@/app/services/reports';
import type { ReportReason } from '@/app/services/reports';
import { GradientButton } from '@/components/ui/gradient-button';
import { CAMPUSRIDE_COMMISSION_RATE } from '@/app/constants/fuel';
import { maskPlate } from '@/app/utils/plate';
import { MeetingMap } from '@/components/meeting-map';
import type { PaymentMethod } from '@/app/services/payments';

const C = Colors;
const S = Shadows;
const PRICE_RATE_PER_KM = 0.4;

const ensureStudentEmail = (email: string) => {
  if (!email) return '';
  const local = email.split('@')[0]?.toLowerCase() ?? email;
  return `${local}@students.ephec.be`;
};

export default function RideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAuthSession();
  const { width } = useWindowDimensions();
  const isCompact = width < 420;
  const [ride, setRide] = useState<Ride | null>(() => (id ? getRide(String(id)) ?? null : null));
  const [driverCompleted, setDriverCompleted] = useState(0);
  const [driverRating, setDriverRating] = useState<{ average: number; count: number }>({
    average: 0,
    count: 0,
  });
  const [wallet, setWallet] = useState<WalletSnapshot | null>(() =>
    session.email ? getWallet(session.email) : null
  );
  const [driverFeedback, setDriverFeedback] = useState<PassengerFeedback[]>([]);
  const [feedbackTarget, setFeedbackTarget] = useState<{ email: string; alias: string } | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(4.5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    email: string;
    alias: string;
    type: 'driver' | 'passenger';
  } | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('inappropriate-behaviour');
  const [reportComment, setReportComment] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const reportCommentRef = useRef<TextInput | null>(null);
  const { pending: pendingRequests, accepted: activeAcceptedRequests } = usePassengerRequests(
    session.email
  );
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);

  const platformFeePerPassenger = useMemo(() => {
    if (!ride) return 0;
    return +(ride.price * CAMPUSRIDE_COMMISSION_RATE).toFixed(2);
  }, [ride]);

  const driverNetPerPassenger = useMemo(() => {
    if (!ride) return 0;
    return +(ride.price - platformFeePerPassenger).toFixed(2);
  }, [ride, platformFeePerPassenger]);
  const acceptedReservation = useMemo(() => {
    if (!ride) return null;
    return activeAcceptedRequests.find((request) => request.rideId === ride.id) ?? null;
  }, [activeAcceptedRequests, ride]);
  const pendingReservation = useMemo(() => {
    if (!ride) return null;
    return pendingRequests.find((request) => request.rideId === ride.id) ?? null;
  }, [pendingRequests, ride]);
  const reservationAccepted = !!acceptedReservation;
  const reservationPending = !!pendingReservation && !reservationAccepted;
  const hasRequestedReservation = reservationPending || reservationAccepted;
  const openDriverProfile = () => {
    if (!ride) return;
    router.push({ pathname: '/driver-profile/[email]', params: { email: ride.ownerEmail } });
  };

  useEffect(() => {
    const unsubscribe = subscribeRides((rides) => {
      const next = rides.find((item) => item.id === id) ?? null;
      setRide(next);
      if (next) {
        const completed = rides.filter(
          (item) => item.ownerEmail === next.ownerEmail && hasRideDeparted(item)
        ).length;
        setDriverCompleted(completed);
      } else {
        setDriverCompleted(0);
      }
    });
    return unsubscribe;
  }, [id]);

  useEffect(() => {
    if (!ride?.ownerEmail) {
      setDriverRating({ average: 0, count: 0 });
      return;
    }
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
  }, [ride?.ownerEmail]);

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
      setDriverFeedback([]);
      return;
    }
    const unsubscribe = subscribeDriverFeedback(session.email, setDriverFeedback);
    return unsubscribe;
  }, [session.email]);


  const amOwner = useMemo(
    () => !!session.email && ride?.ownerEmail === session.email,
    [ride, session.email]
  );

  const amPassenger = useMemo(
    () => !!session.email && !!ride && ride.passengers.includes(session.email),
    [ride, session.email]
  );

  const seatsLeft = ride ? ride.seats - ride.passengers.length : 0;
  const departed = ride ? hasRideDeparted(ride) : false;
  const canViewSensitiveDetails = amOwner || amPassenger || reservationAccepted;
  const reward = useMemo(
    () =>
      evaluateRewards({
        completedRides: driverCompleted,
        averageRating: driverRating.average,
        reviewCount: driverRating.count,
      }),
    [driverCompleted, driverRating.average, driverRating.count]
  );
  const walletBalance = wallet?.balance ?? 0;
  const hasWalletBalance = ride ? walletBalance >= ride.price : false;

  const departureDayLabel = useMemo(() => {
    if (!ride) return '';
    const departure = new Date(ride.departureAt);
    const now = new Date();
    const todayKey = now.toDateString();
    const departureKey = departure.toDateString();
    if (departureKey === todayKey) return 'Aujourd’hui';
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (departureKey === tomorrow.toDateString()) return 'Demain';
    return departure.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'short' });
  }, [ride]);

  const passengerFeedbackMap = useMemo(() => {
    const map = new Map<string, PassengerFeedback>();
    driverFeedback.forEach((entry) => {
      map.set(entry.passengerEmail, entry);
    });
    return map;
  }, [driverFeedback]);

  if (!id) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Aucun trajet sélectionné.</Text>
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Trajet introuvable ou supprimé.</Text>
        <GradientButton
          title="Retour"
          size="sm"
          variant="lavender"
          onPress={() => router.back()}
          accessibilityRole="button"
          style={styles.backActionButton}
        />
      </View>
    );
  }

  const distanceLabel = useMemo(() => {
    if (!ride) return '';
    const km = ride.price / PRICE_RATE_PER_KM;
    return `${km.toFixed(1)} km × €${PRICE_RATE_PER_KM.toFixed(2)}/km`;
  }, [ride]);
  const driverAvatarBg = getAvatarColor(ride.ownerEmail);
  const driverAvatarUri = getAvatarUrl(ride.ownerEmail, 128);
  const driverMetaLabel =
    driverRating.count > 0
      ? `${driverRating.average.toFixed(1)}/5 • ${driverRating.count} avis`
      : 'Nouveau conducteur';
  const driverCompletedLabel =
    driverCompleted > 0
      ? `${driverCompleted} trajet${driverCompleted > 1 ? 's' : ''} terminés`
      : 'Premier trajet à venir';

  const requestReservation = () => {
    if (!ride) return;
    if (!session.email) {
      router.push('/sign-up');
      return;
    }
    if (departed) {
      Alert.alert('Trajet terminé', 'Ce trajet est déjà parti.');
      return;
    }
    if (amOwner) {
      Alert.alert('Tu es conducteur', 'Tu peux gérer ce trajet depuis Explore.');
      return;
    }
    if (amPassenger) {
      Alert.alert('Déjà confirmé', 'Tu fais déjà partie de ce trajet.');
      return;
    }
    if (hasRequestedReservation) {
      Alert.alert('Demande déjà envoyée', 'Rends-toi dans Mes demandes pour suivre le statut.');
      return;
    }
    if (seatsLeft <= 0) {
      Alert.alert('Complet', 'Toutes les places ont été réservées.');
      return;
    }
    const entry = logReservationRequest(session.email, ride, null);
    if (!entry) return;
    router.push({
      pathname: '/ride/request-confirmation',
      params: {
        driver: ride.driver,
        depart: ride.depart,
        destination: ride.destination,
      },
    });
  };

  const confirmReservation = (method: PaymentMethod) => {
    if (!ride) return;
    if (!session.email) {
      router.push('/sign-up');
      return;
    }
    if (!reservationAccepted && !amPassenger) {
      Alert.alert('En attente', 'Le conducteur doit accepter ta demande avant le paiement.');
      return;
    }
    const result = reserveSeat(ride.id, session.email, { paymentMethod: method });
    if (!result.ok) {
      switch (result.reason) {
        case 'FULL':
          Alert.alert('Complet', 'Toutes les places ont été réservées.');
          return;
        case 'ALREADY_RESERVED':
          Alert.alert('Déjà réservé', 'Tu as déjà une place confirmée pour ce trajet.');
          return;
        case 'DEPARTED':
          Alert.alert('Trop tard', 'Ce trajet est déjà parti.');
          return;
        case 'PAYMENT_WALLET':
          Alert.alert('Solde insuffisant', 'Ton wallet ne couvre pas le montant.');
          return;
        case 'PAYMENT_PASS':
          Alert.alert('Crédits épuisés', 'Aucun crédit CampusRide disponible.');
          return;
        default:
          Alert.alert('Paiement impossible', 'Nous n’avons pas pu finaliser le paiement.');
          return;
      }
    }
    removeReservationRequest(session.email, ride.id);
    router.push({
      pathname: '/ride/request-confirmation',
      params: {
        driver: ride.driver,
        depart: ride.depart,
        destination: ride.destination,
        paid: '1',
      },
    });
  };

  const closePaymentModal = () => setPaymentModalVisible(false);

  const confirmWalletPayment = () => {
    if (!hasWalletBalance) {
      Alert.alert('Solde insuffisant', 'Recharge ton wallet pour payer ce trajet.');
      return;
    }
    closePaymentModal();
    confirmReservation('wallet');
  };

  const onReserve = () => {
    if (!ride) return;
    if (!session.email) {
      return router.push('/sign-up');
    }
    if (departed) {
      return Alert.alert('Trop tard', 'Ce trajet est déjà parti.');
    }
    if (amOwner) {
      return Alert.alert('Tu es conducteur', 'Tu peux gérer ce trajet depuis Explore.');
    }
    if (amPassenger) {
      return Alert.alert('Déjà réservé', 'Tu as déjà une place sur ce trajet.');
    }
    if (seatsLeft <= 0) {
      return Alert.alert('Complet', 'Toutes les places ont été réservées.');
    }
    if (!reservationAccepted) {
      return Alert.alert('Demande en attente', 'Le conducteur doit accepter ta demande avant le paiement.');
    }
    setPaymentModalVisible(true);
  };

  const contactDriver = () => {
    if (!ride) return;
    if (!session.email) {
      return router.push('/sign-up');
    }
    if (ride.ownerEmail.toLowerCase() === session.email.toLowerCase()) {
      return router.push('/(tabs)/messages');
    }
    const routeLabel = `${ride.depart} → ${ride.destination}`;
    const thread = createThread({
      rideId: ride.id,
      routeLabel,
      participants: [
        { email: ride.ownerEmail, name: ride.driver, role: 'driver' },
        {
          email: session.email,
          name: session.name ?? session.email,
          role: session.isDriver && !session.isPassenger ? 'driver' : 'passenger',
        },
      ],
    });
    router.push({
      pathname: '/(tabs)/messages',
      params: { thread: thread.id, origin: `/ride/${ride.id}` },
    });
  };

  const onCancel = () => {
    if (!session.email) {
      router.push('/sign-up');
      return;
    }
    const result = cancelReservation(ride.id, session.email);
    if (!result) {
      Alert.alert('Annulation impossible', 'Ta réservation est introuvable.');
      return;
    }
    removeReservationRequest(session.email, ride.id);
    router.push({
      pathname: '/ride/request-confirmation',
      params: {
        driver: ride.driver,
        depart: ride.depart,
        destination: ride.destination,
        cancelled: '1',
      },
    });
  };

  const onDelete = () => {
    Alert.alert('Supprimer', 'Supprimer définitivement ce trajet ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          removeRide(ride.id);
          router.back();
        },
      },
    ]);
  };

  const formatAlias = (value: string) => {
    const base = value.split('@')[0] ?? value;
    const cleaned = base.replace(/[._-]+/g, ' ');
    return cleaned
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  };

  const openPassengerFeedbackModal = (passengerEmail: string) => {
    if (!session.email || !ride) return;
    const entry = passengerFeedbackMap.get(passengerEmail);
    const alias = formatAlias(passengerEmail);
    setFeedbackTarget({ email: passengerEmail, alias });
    setFeedbackRating(entry ? entry.rating : 4.5);
    setFeedbackComment(entry?.comment ?? '');
  };

  const submitPassengerEvaluation = () => {
    if (!feedbackTarget || !session.email || !ride) return;
    if (!hasRideDeparted(ride)) {
      Alert.alert('Trajet en cours', 'Tu pourras évaluer ce passager après la fin du trajet.');
      return;
    }
    try {
      setSubmittingFeedback(true);
      submitPassengerFeedback({
        rideId: ride.id,
        passengerEmail: feedbackTarget.email,
        driverEmail: session.email,
        rating: feedbackRating,
        comment: feedbackComment,
      });
      Alert.alert('Avis envoyé ✅', `${feedbackTarget.alias} sera notifié de ton retour.`);
      setFeedbackTarget(null);
      setFeedbackComment('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible d’enregistrer la note.';
      Alert.alert('Erreur', message);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const closeFeedbackModal = () => {
    setFeedbackTarget(null);
    setFeedbackComment('');
    setSubmittingFeedback(false);
  };

  const ensureCanReport = () => {
    if (!session.email) {
      Alert.alert(
        'Connexion requise',
        'Connecte-toi pour signaler un conducteur ou un passager.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Se connecter', onPress: () => router.push('/sign-in') },
        ]
      );
      return false;
    }
    return true;
  };

  const openReportModal = (target: { email: string; alias: string; type: 'driver' | 'passenger' }) => {
    if (!ride || !ensureCanReport()) return;
    setReportTarget(target);
    setReportReason('inappropriate-behaviour');
    setReportComment('');
  };

  const reportPassenger = (passengerEmail: string) => {
    if (!ride) return;
    const alias = formatAlias(passengerEmail);
    openReportModal({ email: passengerEmail, alias, type: 'passenger' });
  };

  const reportDriver = () => {
    if (!ride) return;
    openReportModal({ email: ride.ownerEmail, alias: ride.driver, type: 'driver' });
  };

  const closeReportModal = () => {
    setReportTarget(null);
    setReportComment('');
    setReportSubmitting(false);
  };

  const submitReport = () => {
    if (!reportTarget || !ride || !session.email) return;
    try {
      setReportSubmitting(true);
      createReport({
        reporterEmail: session.email,
        targetEmail: reportTarget.email,
        rideId: ride.id,
        reason: reportReason,
        comment: reportComment.trim() || undefined,
        metadata: {
          context: reportTarget.type === 'driver' ? 'passenger-report' : 'driver-report',
        },
      });
      Alert.alert('Signalement envoyé', 'Notre équipe va examiner ta demande.');
      closeReportModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de signaler pour le moment.';
      Alert.alert('Erreur', message);
      setReportSubmitting(false);
    }
  };

  useEffect(() => {
    if (!reportTarget) return;
    const timeout = setTimeout(() => {
      reportCommentRef.current?.focus();
    }, 200);
    return () => clearTimeout(timeout);
  }, [reportTarget]);

  const heroStatusLabel = departed
    ? 'Trajet terminé'
    : seatsLeft > 0
    ? 'Places disponibles'
    : 'Complet';
  const heroStatusIcon = departed
    ? 'checkmark.seal.fill'
    : seatsLeft > 0
    ? 'sparkles'
    : 'exclamationmark.triangle';
  const driverStudentEmail = ensureStudentEmail(ride.ownerEmail);
const statHighlights = [
    {
      key: 'price',
      icon: 'creditcard.fill' as const,
      label: 'Tarif',
      value: canViewSensitiveDetails ? `${ride.price.toFixed(2)} €` : '—',
      hint: canViewSensitiveDetails ? 'par passager' : 'Visible après acceptation',
    },
    {
      key: 'seats',
      icon: 'person.fill' as const,
      label: 'Places',
      value: `${ride.passengers.length}/${ride.seats}`,
      hint: seatsLeft > 0 ? `${seatsLeft} restante(s)` : 'Complet',
    },
    {
      key: 'time',
      icon: 'clock' as const,
      label: 'Départ',
      value: ride.time,
      hint: departureDayLabel,
    },
];
const REPORT_REASONS: { label: string; value: ReportReason }[] = [
  { label: 'Comportement inapproprié', value: 'inappropriate-behaviour' },
  { label: 'Conduite dangereuse', value: 'unsafe-driving' },
  { label: 'Retard / annulation tardive', value: 'late-cancellation' },
  { label: 'Absence au rendez-vous', value: 'no-show' },
  { label: 'Autre', value: 'other' },
];

  return (
    <>
      <AppBackground colors={Gradients.background}>
        <SafeAreaView style={styles.safe}>
          <ScrollView
            contentContainerStyle={[styles.scroll, isCompact && styles.scrollCompact]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroHeader}>
              <Pressable style={styles.heroBackButton} onPress={() => router.back()}>
                <IconSymbol name="chevron.left" size={20} color={Colors.white} />
              </Pressable>
              <Text style={styles.pageTitle}>Informations du trajet</Text>
            </View>
            {reservationAccepted ? (
              <View style={[styles.acceptBanner, isCompact && styles.acceptBannerCompact]}>
                <View style={styles.acceptIconCircle}>
                  <Image
                    source={require('@/assets/images/verifier.png')}
                    style={styles.acceptIconImage}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.acceptTextGroup}>
                  <Text style={styles.acceptTitle}>Demande acceptée !</Text>
                  <Text style={styles.acceptSubtitle}>{ride.driver} a validé ta réservation.</Text>
                </View>
              </View>
            ) : null}
            {reservationPending ? (
              <View style={[styles.noticeBanner, isCompact && styles.noticeBannerCompact]}>
                <View style={styles.noticeIcon}>
                  <IconSymbol name="clock.badge.exclamationmark" size={28} color={Colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.noticeTitle}>Demande envoyée</Text>
                  <Text style={styles.noticeSubtitle}>
                    {ride.driver} doit accepter ta demande avant de révéler le point de rencontre.
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={[styles.heroCard, isCompact && styles.heroCardCompact]}>
              <Text style={styles.heroCardTitle}>Le conducteur</Text>
              <View style={[styles.heroDriverRow, isCompact && styles.heroDriverRowCompact]}>
                <View style={[styles.heroAvatar, { backgroundColor: driverAvatarBg }]}>
                  <Image source={{ uri: driverAvatarUri }} style={styles.heroAvatarImage} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroDriverName}>{ride.driver}</Text>
                  <Text
                    style={styles.heroDriverEmail}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    ellipsizeMode="clip"
                  >
                    {driverStudentEmail}
                  </Text>
                  <View style={styles.heroRatingRow}>
                    <RatingStars
                      value={driverRating.count > 0 ? driverRating.average : 0}
                      size={18}
                      editable={false}
                    />
                    <Pressable
                      onPress={() =>
                        router.push({ pathname: '/reviews/[email]', params: { email: ride.ownerEmail } })
                      }
                      accessibilityRole="button"
                      style={styles.heroRatingMetaButton}
                    >
                      <Text style={styles.heroRatingText}>{driverMetaLabel}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.heroActionRow}>
                    <Pressable
                      style={[styles.heroProfileButton, styles.heroProfileButtonPrimary]}
                      onPress={openDriverProfile}
                      accessibilityRole="button"
                    >
                      <Text style={styles.heroProfileButtonText}>Voir le profil</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.heroProfileButton, styles.heroProfileButtonPrimary]}
                      onPress={contactDriver}
                      accessibilityRole="button"
                    >
                      <Text style={styles.heroProfileButtonText}>Contacter</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
              {reward.badgeLabel ? (
                <View style={styles.heroReward}>
                  <Text style={styles.heroRewardText}>{reward.badgeLabel}</Text>
                  {reward.highlight ? (
                    <Text style={styles.heroRewardHint}>{reward.highlight}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={[styles.statsRow, isCompact && styles.statsRowCompact]}>
              {statHighlights.map((stat) => (
                <View key={stat.key} style={[styles.statCard, isCompact && styles.statCardCompact]}>
                  <IconSymbol name={stat.icon} size={20} color={Colors.primary} />
                  <Text style={styles.statLabel}>{stat.label}</Text>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statHint}>{stat.hint}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.sectionCard, isCompact && styles.sectionCardCompact]}>
              <Text style={styles.sectionTitle}>Informations trajet</Text>
              <View style={styles.infoRow}>
                <IconSymbol name="person.crop.circle" size={18} color={Colors.gray500} />
                <Text style={styles.infoLabel}>Conducteur</Text>
                <Text style={styles.infoValue}>{ride.driver}</Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="doc.text" size={18} color={Colors.gray500} />
                <Text style={styles.infoLabel}>Plaque</Text>
                <Text style={styles.infoValue}>{maskPlate(ride.plate)}</Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="location.fill" size={18} color={Colors.gray500} />
                <Text style={styles.infoLabel}>Départ</Text>
                <Text style={styles.infoValue}>{ride.depart}</Text>
              </View>
              <View style={styles.infoRow}>
                <IconSymbol name="graduationcap.fill" size={18} color={Colors.gray500} />
                <Text style={styles.infoLabel}>Destination</Text>
                <Text style={styles.infoValue}>{ride.destination}</Text>
              </View>
            </View>

            <View style={[styles.sectionCard, isCompact && styles.sectionCardCompact]}>
              <Text style={styles.sectionTitle}>Point de rencontre</Text>
              {canViewSensitiveDetails ? (
                <>
                  <View style={styles.meetingRow}>
                    <View style={styles.meetingIcon}>
                      <IconSymbol name="mappin.and.ellipse" size={22} color={Colors.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.meetingLabel}>Lieu de rendez-vous</Text>
                      <Text style={styles.meetingAddress}>{ride.depart}</Text>
                    </View>
                  </View>
                  <View style={styles.meetingRow}>
                    <View style={styles.meetingIcon}>
                      <IconSymbol name="clock" size={20} color={Colors.white} />
                    </View>
                    <Text style={styles.meetingTimeText}>
                      Heure de départ : <Text style={styles.meetingTimeValue}>{ride.time}</Text>
                    </Text>
                  </View>
                  <MeetingMap address={ride.depart} style={styles.meetingMap} />
                </>
              ) : (
                <View style={styles.restrictedNotice}>
                  <Text style={styles.restrictedNoticeTitle}>Visible après acceptation</Text>
                  <Text style={styles.restrictedNoticeText}>
                    Le conducteur partagera le lieu exact dès que ta demande sera acceptée.
                  </Text>
                </View>
              )}
            </View>

            <View style={[styles.sectionCard, isCompact && styles.sectionCardCompact]}>
              <Text style={styles.sectionTitle}>Transparence paiement</Text>
              {canViewSensitiveDetails ? (
                <>
                  <View style={styles.priceBreakRow}>
                    <Text style={styles.priceBreakLabel}>Montant par passager</Text>
                    <View>
                      <Text style={styles.priceBreakValue}>€{ride.price.toFixed(2)}</Text>
                      <Text style={styles.priceBreakHint}>
                        Calculé à partir de {distanceLabel}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.priceBreakRow}>
                    <Text style={styles.priceBreakLabel}>CampusRide (20 %)</Text>
                    <Text style={[styles.priceBreakValue, styles.priceBreakFee]}>
                      €{platformFeePerPassenger.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.priceBreakRow}>
                    <Text style={styles.priceBreakLabel}>Versé au conducteur</Text>
                    <Text style={styles.priceBreakValue}>€{driverNetPerPassenger.toFixed(2)}</Text>
                  </View>
                  <Text style={styles.priceBreakHint}>
                    Ce détail apparaît avant toute confirmation afin que tu saches exactement ce qui est prélevé.
                  </Text>
                </>
              ) : (
                <View style={styles.restrictedNotice}>
                  <Text style={styles.restrictedNoticeTitle}>Montant masqué</Text>
                  <Text style={styles.restrictedNoticeText}>
                    Tu verras le tarif exact dès que ta demande aura été acceptée par le conducteur.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.actionStack}>
              {departed ? (
                <Text style={styles.statusText}>Ce trajet est terminé.</Text>
              ) : amOwner ? (
                <>
                  <GradientButton
                    title="Modifier"
                    size="sm"
                    variant="lavender"
                    fullWidth
                    style={[styles.actionButton, isCompact && styles.actionButtonFull]}
                    onPress={() => router.push({ pathname: '/explore', params: { edit: ride.id } })}
                    accessibilityRole="button"
                  />
                  <GradientButton
                    title="Supprimer"
                    size="sm"
                    variant="danger"
                    fullWidth
                    style={[styles.actionButton, isCompact && styles.actionButtonFull]}
                    onPress={onDelete}
                    accessibilityRole="button"
                  />
                </>
              ) : amPassenger ? (
                <GradientButton
                  title="Annuler ma réservation"
                  size="sm"
                  variant="lavender"
                  fullWidth
                  style={[styles.actionButton, isCompact && styles.actionButtonFull]}
                  onPress={onCancel}
                  accessibilityRole="button"
                />
              ) : reservationAccepted ? (
                <GradientButton
                  title={seatsLeft > 0 ? 'Procéder au paiement' : 'Complet'}
                  size="sm"
                  variant="cta"
                  fullWidth
                  style={[styles.actionButton, isCompact && styles.actionButtonFull]}
                  onPress={onReserve}
                  disabled={seatsLeft <= 0}
                  accessibilityRole="button"
                />
              ) : reservationPending ? (
                <>
                  <Text style={styles.statusText}>Demande en attente de confirmation.</Text>
                  <GradientButton
                    title="Voir mes demandes"
                    size="sm"
                    variant="lavender"
                    fullWidth
                    style={[styles.actionButton, isCompact && styles.actionButtonFull]}
                    onPress={() => router.push('/requests')}
                    accessibilityRole="button"
                  />
                </>
              ) : (
                <GradientButton
                  title={seatsLeft > 0 ? 'Demander ce trajet' : 'Complet'}
                  size="sm"
                  variant="cta"
                  fullWidth
                  style={[styles.actionButton, isCompact && styles.actionButtonFull]}
                  onPress={requestReservation}
                  disabled={seatsLeft <= 0}
                  accessibilityRole="button"
                />
              )}
            </View>

          </ScrollView>
        </SafeAreaView>
      </AppBackground>
      {paymentModalVisible ? (
        <View style={styles.inlineModalPortal}>
          <View style={[styles.modalBackdrop, isCompact && styles.modalBackdropCompact]}>
            <View style={[styles.modalCard, styles.paymentModalCard, isCompact && styles.modalCardCompact]}>
              <Text style={styles.modalTitle}>Choisis un moyen de paiement</Text>
              <Text style={styles.modalSubtitle}>
                Sélectionne une option pour confirmer ta réservation.
              </Text>
              <View style={styles.walletSummary}>
                <Text style={styles.walletSummaryLabel}>Solde du wallet</Text>
                <Text style={styles.walletSummaryValue}>€{walletBalance.toFixed(2)}</Text>
              </View>
              <View style={styles.walletDetails}>
                <View>
                  <Text style={styles.walletDetailsLabel}>Montant à payer</Text>
                  <Text style={styles.walletDetailsValue}>€{ride.price.toFixed(2)}</Text>
                </View>
                {!hasWalletBalance ? (
                  <Text style={styles.walletWarning}>Solde insuffisant pour ce trajet.</Text>
                ) : null}
              </View>
              <GradientButton
                title="Payer avec mon wallet"
                size="sm"
                variant="cta"
                fullWidth
                style={styles.walletPayButton}
                onPress={confirmWalletPayment}
                disabled={!hasWalletBalance}
              />
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.walletCancelButton}
                onPress={closePaymentModal}
                accessibilityRole="button"
              >
                <Text style={styles.walletCancelButtonText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
      <Modal
        visible={!!feedbackTarget}
        animationType="slide"
        transparent
        onRequestClose={closeFeedbackModal}
      >
        <View style={[styles.modalBackdrop, isCompact && styles.modalBackdropCompact]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
              <Text style={styles.modalTitle}>
                Noter {feedbackTarget?.alias}
              </Text>
              <Text style={styles.modalSubtitle}>
                Partage ton ressenti pour améliorer la confiance sur CampusRide.
              </Text>
              <RatingStars value={feedbackRating} editable onChange={setFeedbackRating} size={28} />
              <TextInput
                style={styles.modalInput}
                placeholder="Commentaire (facultatif)"
                placeholderTextColor={C.gray400}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={feedbackComment}
                onChangeText={setFeedbackComment}
              />
              <View style={styles.modalActions}>
                <Pressable style={[styles.modalButton, styles.modalButtonSecondary]} onPress={closeFeedbackModal}>
                  <Text style={styles.modalButtonSecondaryText}>Annuler</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.modalButtonPrimary, submittingFeedback && styles.modalButtonDisabled]}
                  disabled={submittingFeedback}
                  onPress={submitPassengerEvaluation}
                >
                  <Text style={styles.modalButtonPrimaryText}>
                    {submittingFeedback ? 'Envoi…' : 'Publier'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <Modal visible={!!reportTarget} animationType="slide" transparent onRequestClose={closeReportModal}>
        <View style={[styles.modalBackdrop, isCompact && styles.modalBackdropCompact]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <ScrollView
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
                <Text style={styles.modalTitle}>Signaler {reportTarget?.alias}</Text>
                <Text style={styles.modalSubtitle}>
                  Sélectionne une raison et ajoute un commentaire pour aider notre équipe.
                </Text>
                <View style={styles.reportReasons}>
                  {REPORT_REASONS.map((reason) => {
                    const active = reason.value === reportReason;
                    return (
                      <TouchableOpacity
                        key={reason.value}
                        activeOpacity={0.7}
                        style={[styles.reportReasonChip, active && styles.reportReasonChipActive]}
                        onPress={() => setReportReason(reason.value)}
                      >
                        <Text
                          style={[
                            styles.reportReasonChipText,
                            active && styles.reportReasonChipTextActive,
                          ]}
                        >
                          {reason.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  ref={reportCommentRef}
                  style={styles.modalInput}
                  placeholder="Commentaire (optionnel)"
                  placeholderTextColor={C.gray400}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={reportComment}
                  onChangeText={setReportComment}
                />
                <View style={styles.modalActions}>
                  <Pressable style={[styles.modalButton, styles.modalButtonSecondary]} onPress={closeReportModal}>
                    <Text style={styles.modalButtonSecondaryText}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.modalButton,
                      styles.modalButtonPrimary,
                      reportSubmitting && styles.modalButtonDisabled,
                    ]}
                    disabled={reportSubmitting}
                    onPress={submitReport}
                  >
                    <Text style={styles.modalButtonPrimaryText}>
                      {reportSubmitting ? 'Envoi…' : 'Envoyer'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.gray50,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
  scrollCompact: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  heroCard: {
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    gap: Spacing.lg,
    backgroundColor: C.card,
    ...(S.card as object),
  },
  heroCardCompact: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heroBackButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: Typography.heading.letterSpacing,
    flexShrink: 1,
  },
  heroCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroDriverRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  heroDriverRowCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  heroAvatar: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarImage: {
    width: '100%',
    height: '100%',
  },
  heroDriverName: {
    color: C.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  heroDriverEmail: {
    color: C.gray600,
    fontSize: 13,
    flexShrink: 1,
    width: '100%',
  },
  heroRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: 4,
  },
  heroRatingMetaButton: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  heroRatingText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  heroActionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
  },
  heroProfileButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  heroProfileButtonPrimary: {
    borderColor: Colors.primary,
  },
  heroProfileButtonText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  heroDriverMeta: {
    color: C.gray600,
    fontSize: 12,
    marginTop: 2,
  },
  heroReviewsLinkInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroReviewsText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  heroReportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
  },
  heroReportButtonCompact: {
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  heroReportText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  acceptBanner: {
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#12B76A',
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  acceptBannerCompact: {
    gap: Spacing.md,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius['2xl'],
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  noticeBannerCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  noticeIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius['2xl'],
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  noticeSubtitle: {
    color: 'rgba(255,255,255,0.9)',
  },
  acceptIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptIconImage: {
    width: '80%',
    height: '80%',
  },
  acceptTextGroup: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  acceptTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.white,
    textAlign: 'center',
  },
  acceptSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 18,
    textAlign: 'center',
  },
  heroReward: {
    backgroundColor: C.primaryLight,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 2,
  },
  heroRewardText: {
    color: C.primaryDark,
    fontWeight: '700',
  },
  heroRewardHint: {
    color: C.primaryDark,
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  statsRowCompact: {
    flexDirection: 'column',
  },
  statCard: {
    flex: 1,
    minWidth: 110,
    borderRadius: Radius['2xl'],
    backgroundColor: C.card,
    padding: Spacing.md,
    gap: 4,
    ...(S.card as object),
  },
  statCardCompact: {
    flex: undefined,
    width: '100%',
  },
  statLabel: {
    color: C.gray500,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  statValue: {
    color: C.ink,
    fontWeight: '800',
    fontSize: 18,
  },
  statHint: {
    color: C.gray500,
    fontSize: 12,
  },
  sectionCard: {
    backgroundColor: C.card,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
    ...(S.card as object),
  },
  sectionCardCompact: {
    padding: Spacing.md,
  },
  restrictedNotice: {
    borderRadius: Radius.xl,
    backgroundColor: C.gray50,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: C.gray200,
    gap: Spacing.xs,
  },
  restrictedNoticeTitle: {
    fontWeight: '700',
    color: C.gray700,
  },
  restrictedNoticeText: {
    color: C.gray600,
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  infoLabel: {
    flex: 1,
    color: C.gray600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontSize: 12,
  },
  infoValue: {
    color: C.ink,
    fontWeight: '700',
  },
  meetingRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  meetingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFB380',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetingLabel: {
    fontWeight: '800',
    color: C.ink,
  },
  meetingAddress: {
    color: C.gray700,
    fontSize: 14,
  },
  meetingTimeText: {
    color: C.gray700,
    fontWeight: '600',
  },
  meetingTimeValue: {
    color: C.ink,
    fontWeight: '800',
  },
  meetingMap: {
    height: 180,
    borderRadius: Radius.xl,
    marginTop: Spacing.md,
  },
  priceBreakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceBreakLabel: {
    color: C.gray600,
    fontSize: 13,
  },
  priceBreakValue: {
    color: C.ink,
    fontWeight: '700',
  },
  priceBreakFee: {
    color: C.primary,
  },
  priceBreakHint: {
    color: C.gray500,
    fontSize: 12,
  },
  actionStack: {
    gap: Spacing.md,
  },
  actionButton: {
    flexGrow: 1,
    minWidth: 150,
  },
  actionButtonFull: {
    width: '100%',
    minWidth: undefined,
  },
  statusText: {
    color: C.gray600,
    fontStyle: 'italic',
  },
  backActionButton: {
    marginTop: Spacing.md,
    alignSelf: 'center',
    minWidth: 160,
  },
  passengerEmpty: {
    color: C.gray600,
    fontSize: 13,
  },
  passengerRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: C.gray150,
    paddingVertical: Spacing.sm,
  },
  passengerRowCompact: {
    flexDirection: 'column',
  },
  passengerName: {
    color: C.ink,
    fontWeight: '600',
  },
  passengerMeta: {
    color: C.gray600,
    fontSize: 12,
  },
  passengerComment: {
    color: C.gray700,
    fontSize: 13,
    marginTop: 4,
  },
  passengerActions: {
    gap: Spacing.xs,
    justifyContent: 'center',
  },
  passengerActionsCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  passengerActionPrimary: {
    backgroundColor: C.secondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  passengerActionPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  passengerActionSecondary: {
    borderWidth: 1,
    borderColor: C.danger,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  passengerActionSecondaryText: {
    color: C.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  passengerActionDisabled: {
    opacity: 0.4,
  },
  inlineModalPortal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(16, 32, 48, 0.55)',
    padding: Spacing.xl,
    justifyContent: 'center',
  },
  modalBackdropCompact: {
    padding: Spacing.lg,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: C.card,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  modalCardCompact: {
    padding: Spacing.lg,
  },
  paymentModalCard: {
    gap: Spacing.md,
  },
  walletSummary: {
    borderRadius: Radius['2xl'],
    backgroundColor: 'rgba(255,127,80,0.12)',
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  walletSummaryLabel: {
    color: C.gray600,
    fontSize: 13,
  },
  walletSummaryValue: {
    color: C.ink,
    fontSize: 26,
    fontWeight: '800',
  },
  walletDetails: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.gray150,
    padding: Spacing.md,
    gap: Spacing.xs,
    backgroundColor: '#fff',
  },
  walletDetailsLabel: {
    color: C.gray600,
    fontSize: 13,
  },
  walletDetailsValue: {
    color: C.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  walletWarning: {
    marginTop: Spacing.xs,
    color: C.danger,
    fontWeight: '600',
  },
  walletPayButton: {
    marginTop: Spacing.sm,
  },
  walletCancelButton: {
    width: '100%',
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    backgroundColor: 'rgba(13, 34, 64, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletCancelButtonText: {
    color: C.gray700,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalTitle: {
    color: C.ink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: Typography.heading.letterSpacing,
  },
  modalSubtitle: { color: C.gray600, fontSize: 13 },
  modalInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.gray300,
    backgroundColor: C.gray50,
    padding: Spacing.md,
    minHeight: 100,
    color: C.ink,
  },
  reportReasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  reportReasonChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: C.gray300,
  },
  reportReasonChipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  reportReasonChipText: {
    color: C.gray600,
    fontSize: 12,
    fontWeight: '600',
  },
  reportReasonChipTextActive: {
    color: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  modalButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  modalButtonPrimary: { backgroundColor: C.primary },
  modalButtonSecondary: { backgroundColor: C.gray150 },
  modalButtonDisabled: { opacity: 0.6 },
  modalButtonPrimaryText: { color: '#fff', fontWeight: '700' },
  modalButtonSecondaryText: { color: C.gray600, fontWeight: '700' },
  error: {
    color: C.gray600,
    fontSize: 14,
  },
});

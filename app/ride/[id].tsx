import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  cancelBooking,
  createBooking,
  getActiveBookingForRide,
  getBookingById,
  getBookingForRide,
  isBlockingReservation,
  listBookingsByPassenger,
  subscribeBookingsByPassenger,
  type Booking,
  updateBooking,
} from '@/app/services/booking-store';
import {
  creditWallet,
  debitWallet,
  getWallet,
  subscribeWallet,
  type WalletSnapshot,
} from '@/app/services/wallet';
import {
  logReservationRequest,
  markReservationCancelled,
  removeReservationRequest,
} from '@/app/services/reservation-requests';
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
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { CAMPUSRIDE_COMMISSION_RATE } from '@/app/constants/fuel';
import { maskPlate } from '@/app/utils/plate';
import { MeetingMap } from '@/components/meeting-map';
import type { PaymentMethod } from '@/app/services/payments';
import { FALLBACK_UPCOMING } from '@/app/data/driver-samples';
import { resolveMeetingPoint } from '@/utils/meeting-point';

export type RideDetailScreenMode = 'detail' | 'checkout';

export type RideDetailScreenProps = {
  mode?: RideDetailScreenMode;
  overrideRideId?: string;
};

const C = Colors;
const S = Shadows;
const PRICE_RATE_PER_KM = 0.4;

const findFallbackRide = (rideId?: string | null) => {
  if (!rideId) return null;
  return FALLBACK_UPCOMING.find((ride) => ride.id === rideId) ?? null;
};

const ensureStudentEmail = (email: string) => {
  if (!email) return '';
  const local = email.split('@')[0]?.toLowerCase() ?? email;
  return `${local}@students.ephec.be`;
};

export default function RideDetailScreen({ mode: propMode, overrideRideId }: RideDetailScreenProps = {}) {
  const params = useLocalSearchParams<{ id?: string; mode?: RideDetailScreenMode }>();
  const paramId = Array.isArray(params.id) ? params.id[0] : params.id;
  const rideId = overrideRideId ?? paramId ?? null;
  const session = useAuthSession();
  const { width } = useWindowDimensions();
  const isCompact = width < 420;
  const routeMode = propMode ?? (params.mode === 'checkout' ? 'checkout' : 'detail');
  const initialRealRide = rideId ? getRide(String(rideId)) : null;
  const initialFallbackRide = !initialRealRide ? findFallbackRide(rideId) : null;
  const initialRide = initialRealRide ?? initialFallbackRide;
  const [ride, setRide] = useState<Ride | null>(initialRide);
  const [isFallbackRide, setIsFallbackRide] = useState(!initialRealRide && !!initialFallbackRide);
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
  const passengerRequests = usePassengerRequests(session.email);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [showWalletConfirmModal, setShowWalletConfirmModal] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [walletPaymentError, setWalletPaymentError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>(() =>
    session.email ? listBookingsByPassenger(session.email) : []
  );
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const platformFeePerPassenger = useMemo(() => {
    if (!ride) return 0;
    return +(ride.price * CAMPUSRIDE_COMMISSION_RATE).toFixed(2);
  }, [ride]);

  const driverNetPerPassenger = useMemo(() => {
    if (!ride) return 0;
    return +(ride.price - platformFeePerPassenger).toFixed(2);
  }, [ride, platformFeePerPassenger]);
  const userRequestForRide = useMemo(() => {
    if (!ride) return null;
    return (
      passengerRequests.requests.find((request) => request.rideId === ride.id) ?? null
    );
  }, [passengerRequests.requests, ride]);
  const checkoutGuardRedirectedRef = useRef(false);
  const prevRequestStatus = useRef<string | null>(null);
  const reservationAccepted = userRequestForRide?.status === 'accepted';
  const reservationPending =
    userRequestForRide?.status === 'pending' && !reservationAccepted;
  const bookingForRide = useMemo(() => {
    if (!ride?.id || !session.email) return null;
    return getActiveBookingForRide(session.email, ride.id);
  }, [bookings, ride?.id, session.email]);
  const latestBookingForRide = useMemo(() => {
    if (!ride?.id || !session.email) return null;
    return getBookingForRide(session.email, ride.id);
  }, [bookings, ride?.id, session.email]);
  const bookingReadyForPayment =
    latestBookingForRide?.status === 'accepted' && latestBookingForRide?.paymentStatus === 'unpaid';
  const paymentAllowed = reservationAccepted && bookingReadyForPayment;
  useEffect(() => {
    console.debug('[Ride] active booking', bookingForRide?.status, bookingForRide?.id);
  }, [bookingForRide?.id, bookingForRide?.status]);
  const cancelledBannerVisible = false;
  useEffect(() => {
    console.debug('[Ride] cancelled banner visible?', cancelledBannerVisible);
  }, [cancelledBannerVisible]);
  const hasActiveBookingForRide = !!bookingForRide && isBlockingReservation(bookingForRide);
  const showCancelButton =
    bookingForRide?.status === 'accepted' && bookingForRide?.paid === false;
  const hasRequestedReservation =
    !!userRequestForRide && userRequestForRide.status !== 'cancelled';
  const amOwner = useMemo(
    () => !!session.email && ride?.ownerEmail === session.email,
    [ride, session.email]
  );
  const amPassenger = useMemo(
    () => !!session.email && !!ride && ride.passengers.includes(session.email),
    [ride, session.email]
  );
  const canViewSensitiveDetails = routeMode === 'checkout' && (amOwner || amPassenger || reservationAccepted);
  useEffect(() => {
    if (!rideId) return;
    const status = userRequestForRide?.status ?? 'idle';
    console.debug('[Request] status', status, rideId);
  }, [rideId, userRequestForRide?.status]);
  useEffect(() => {
    console.debug('[RidePage] request status', userRequestForRide?.status, 'rideId', rideId);
    prevRequestStatus.current = userRequestForRide?.status ?? null;
  }, [rideId, userRequestForRide?.status]);
  useEffect(() => {
    if (routeMode !== 'checkout' || !ride || !session.email) return;
    const requestStatus = userRequestForRide?.status ?? 'idle';
    const bookingStatus = latestBookingForRide?.status ?? bookingForRide?.status;
    const paymentStatus = latestBookingForRide?.paymentStatus ?? bookingForRide?.paymentStatus;
    if (!paymentAllowed || requestStatus !== 'accepted') {
      console.debug('[CheckoutGuard]', { rideId, requestStatus, bookingStatus, paymentStatus });
      if (!checkoutGuardRedirectedRef.current) {
        checkoutGuardRedirectedRef.current = true;
        router.replace(`/ride/${ride.id}`);
      }
      return;
    }
    checkoutGuardRedirectedRef.current = false;
  }, [
    bookingForRide?.paymentStatus,
    bookingForRide?.status,
    bookingReadyForPayment,
    latestBookingForRide?.paymentStatus,
    latestBookingForRide?.status,
    paymentAllowed,
    ride,
    rideId,
    routeMode,
    router,
    session.email,
    userRequestForRide?.status,
  ]);
  useEffect(() => {
    if (!session.email) {
      setBookings([]);
      return;
    }
    const unsubscribe = subscribeBookingsByPassenger(session.email, setBookings);
    return unsubscribe;
  }, [session.email]);
  const walletBalance = wallet?.balance ?? 0;
  const checkoutAmount = ride?.price ?? 0;
  const walletBalanceLabel = walletBalance.toFixed(2);
  const checkoutAmountLabel = checkoutAmount.toFixed(2);
  const hasWalletBalance = ride ? walletBalance >= ride.price : false;
  const rideMeetingPoint = useMemo(() => resolveMeetingPoint({ ride }), [ride]);
  const rideMeetingPointAddress = rideMeetingPoint.address || 'Point de rendez-vous';
  const rideMeetingPointLatLng = rideMeetingPoint.latLng;
  const openDriverProfile = () => {
    if (!ride) return;
    router.push({ pathname: '/driver-profile/[email]', params: { email: ride.ownerEmail } });
  };

  useEffect(() => {
    if (!rideId) return;
    const unsubscribe = subscribeRides((rides) => {
      const next = rides.find((item) => item.id === rideId) ?? null;
      if (next) {
        setRide(next);
        setDriverCompleted(
          rides.filter((item) => item.ownerEmail === next.ownerEmail && hasRideDeparted(item)).length
        );
        setIsFallbackRide(false);
        return;
      }
      const fallback = findFallbackRide(rideId);
      setRide(fallback);
      setDriverCompleted(0);
      setIsFallbackRide(!!fallback);
    });
    return unsubscribe;
  }, [rideId]);

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


  const seatsLeft = ride ? ride.seats - ride.passengers.length : 0;
  const departed = ride ? hasRideDeparted(ride) : false;
  const reward = useMemo(
    () =>
      evaluateRewards({
        completedRides: driverCompleted,
        averageRating: driverRating.average,
        reviewCount: driverRating.count,
      }),
    [driverCompleted, driverRating.average, driverRating.count]
  );
  useEffect(() => {
    if (routeMode === 'checkout' && rideId) {
      console.debug('[Checkout] open', rideId);
    }
  }, [routeMode, rideId]);
  useEffect(() => {
    if (routeMode === 'checkout') {
      console.debug('[Checkout] canPay', hasWalletBalance);
    }
  }, [routeMode, hasWalletBalance]);

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

  if (!rideId) {
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
    const passengerEmail = session.email;
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
    if (hasRequestedReservation || hasActiveBookingForRide) {
      Alert.alert('Demande déjà envoyée', 'Rends-toi dans Mes demandes pour suivre le statut.');
      return;
    }
    if (seatsLeft <= 0) {
      Alert.alert('Complet', 'Toutes les places ont été réservées.');
      return;
    }
    const entry = logReservationRequest(passengerEmail, ride, null);
    if (!entry) return;
    const meetingPointSnapshot = resolveMeetingPoint({ ride });
    const meetingPointAddress = meetingPointSnapshot.address || ride.depart;
    const meetingPointLatLng = meetingPointSnapshot.latLng ?? null;
    const driverPlate = ride.plate ?? '';
    const bookingPayload = {
      id: entry.id,
      rideId: ride.id,
      passengerEmail,
      driver: ride.driver,
      ownerEmail: ride.ownerEmail,
      status: 'pending' as const,
      paid: false,
      paymentMethod: 'none' as const,
      amount: Number.isFinite(ride.price) ? ride.price : 0,
      createdAt: entry.createdAt,
      depart: ride.depart,
      destination: ride.destination,
      departureAt: Number.isFinite(ride.departureAt) ? ride.departureAt : Date.now(),
      meetingPoint: ride.depart,
      meetingPointAddress,
      meetingPointLatLng,
      time: ride.time,
      dateLabel: ride.dateLabel,
      plate: ride.plate ?? null,
      driverPlate,
      maskedPlate: maskPlate(driverPlate),
    };
    const bookingResult = createBooking(bookingPayload);
    if (!bookingResult.ok) {
      console.error('[Booking] request creation failed', bookingResult.reason, bookingPayload);
    } else {
      console.log('[Booking] created (pending)', bookingPayload);
      setTimeout(() => {
        const current = getBookingById(passengerEmail, bookingPayload.id);
        if (!current || current.status !== 'pending') return;
        const acceptedPatch = {
          status: 'accepted',
          acceptedAt: Date.now(),
          paymentStatus: 'unpaid' as const,
          paid: false,
        };
        const acceptResult = updateBooking(passengerEmail, bookingPayload.id, acceptedPatch);
        if (acceptResult.ok) {
          console.debug('[Booking] auto-accepted', {
            bookingId: bookingPayload.id,
            paymentStatus: 'unpaid',
          });
        } else {
          const acceptedBookingPayload = {
            ...bookingPayload,
            status: 'accepted' as const,
            paymentStatus: 'unpaid' as const,
            paid: false,
            acceptedAt: Date.now(),
          };
          const creationResult = createBooking(acceptedBookingPayload);
          if (creationResult.ok) {
            console.debug('[Booking] auto-accepted (created)', bookingPayload.id);
          } else {
            console.warn(
              '[Booking] auto-accept create failed',
              creationResult.reason,
              bookingPayload.id
            );
          }
        }
      }, 10000);
    }
    router.push({
      pathname: '/ride/request-confirmation',
      params: {
        driver: ride.driver,
        depart: ride.depart,
        destination: ride.destination,
      },
    });
  };

  const handleProceedToPayment = () => {
    if (!ride) return;
    if (!session.email) {
      router.push('/sign-up');
      return;
    }
    if (!reservationAccepted) {
      setCheckoutError('Le conducteur doit accepter ta demande avant le paiement.');
      return;
    }
    if (!paymentAllowed) {
      setCheckoutError('Cette réservation n’est plus payable. Recommence une demande.');
      return;
    }
    if (!Number.isFinite(ride.departureAt)) {
      setCheckoutError('Informations de trajet manquantes.');
      return;
    }
    setCheckoutError(null);
    setWalletPaymentError(null);
    console.debug('[Checkout] proceed clicked', { rideId: ride.id, amount: ride.price });
    setShowWalletConfirmModal(true);
  };

  const confirmWalletCheckoutPayment = async () => {
    if (!ride) return;
    if (!session.email) {
      router.push('/sign-up');
      return;
    }
    const amount = ride.price;
    const rideIdValue = ride.id;
    const passengerEmail = session.email;
    const currentBalance = wallet?.balance ?? 0;
    console.debug('[Checkout] wallet confirm', { rideId: rideIdValue, amount });
    if (currentBalance < amount) {
      setWalletPaymentError('Solde insuffisant.');
      return;
    }
    setIsPaying(true);
    setWalletPaymentError(null);
    let debited = false;
    try {
      const debitResult = debitWallet(
        passengerEmail,
        amount,
        `Paiement trajet ${ride.depart} → ${ride.destination}`,
        { rideId: rideIdValue, reason: 'ride_payment' }
      );
      if (!debitResult) {
        setWalletPaymentError('Solde insuffisant.');
        return;
      }
      debited = true;
      const finalBookingId = bookingForRide?.id ?? `${rideIdValue}:${passengerEmail}:${Date.now()}`;
      if (bookingForRide) {
        const paidPatch = updateBooking(passengerEmail, bookingForRide.id, {
          status: 'paid',
          paid: true,
          paymentMethod: 'wallet',
          paidAt: Date.now(),
          amountPaid: amount,
          pricePaid: amount,
          paymentStatus: 'paid',
        });
        if (!paidPatch.ok) {
          throw new Error('Impossible de sauvegarder la réservation.');
        }
      } else {
        const meetingPointSnapshot = resolveMeetingPoint({ ride });
        const meetingPointAddress = meetingPointSnapshot.address || ride.depart;
        const meetingPointLatLng = meetingPointSnapshot.latLng ?? null;
        const bookingPayload = {
          id: finalBookingId,
          rideId: rideIdValue,
          passengerEmail,
          status: 'paid' as const,
          paid: true,
          paymentMethod: 'wallet' as const,
          paidAt: Date.now(),
          amount,
          pricePaid: amount,
          createdAt: Date.now(),
          depart: ride.depart,
          destination: ride.destination,
          driver: ride.driver,
          ownerEmail: ride.ownerEmail,
          departureAt: ride.departureAt,
          meetingPoint: meetingPointAddress,
          meetingPointAddress,
          meetingPointLatLng,
          time: ride.time,
          plate: ride.plate ?? null,
        };
        console.debug('[WalletConfirm] booking payload', bookingPayload);
        const bookingResult = createBooking(bookingPayload);
        console.debug('[WalletConfirm] reservationResult', bookingResult);
        if (!bookingResult.ok) {
          cancelReservation(ride.id, session.email);
          creditWallet(session.email, amount, {
            description: 'Annulation paiement',
            rideId,
            reason: 'booking_failed',
          });
          throw new Error('Impossible de sauvegarder la confirmation.');
        }
      }
      console.debug('[Payment] booking paid', finalBookingId);
      removeReservationRequest(passengerEmail, rideIdValue);
      setShowWalletConfirmModal(false);
      router.replace({
        pathname: '/ride/confirmed',
        params: { bookingId: finalBookingId },
      });
    } catch (error) {
      console.error('[Checkout] payment failed', error);
      if (debited) {
        try {
          creditWallet(passengerEmail, amount, {
            description: 'Reversion paiement',
            reason: 'rollback',
            rideId: rideIdValue,
          });
        } catch (rollbackError) {
          console.error('[Checkout] rollback failed', rollbackError);
        }
      }
      setWalletPaymentError('Paiement impossible, réessaie.');
    } finally {
      setIsPaying(false);
    }
  };

  const closeWalletConfirmModal = () => {
    setShowWalletConfirmModal(false);
    setWalletPaymentError(null);
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

  const handleConfirmCancel = useCallback(async () => {
    if (!ride || !session.email || !bookingForRide) {
      setShowCancelModal(false);
      return;
    }
    console.debug('[UI] cancel pressed', { rideId: ride.id, bookingId: bookingForRide.id });
    setIsCancelling(true);
    setCheckoutError(null);
    try {
      await cancelBooking(bookingForRide.id);
      const result = cancelReservation(ride.id, session.email);
      if (!result) {
        setCheckoutError('Ta réservation est introuvable.');
        return;
      }
      markReservationCancelled(session.email, ride.id);
    } catch (error) {
      console.error('[RideDetail] cancellation failed', error);
      setCheckoutError('Impossible d’annuler la réservation pour le moment. Réessaie plus tard.');
    } finally {
      setIsCancelling(false);
      setShowCancelModal(false);
    }
  }, [
    bookingForRide,
    cancelBooking,
    cancelReservation,
    removeReservationRequest,
    ride,
    session.email,
    setCheckoutError,
  ]);

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
            {isFallbackRide ? (
              <View style={styles.fallbackBanner}>
                <Text style={styles.fallbackLabel}>Trajet de démonstration</Text>
                <Text style={styles.fallbackText}>
                  Les informations affichées ici sont fictives, elles servent à tester l’accès aux détails.
                </Text>
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
                      <Text style={styles.meetingAddress}>{rideMeetingPointAddress}</Text>
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
                  <MeetingMap
                    address={rideMeetingPointAddress}
                    latLng={rideMeetingPointLatLng}
                    style={styles.meetingMap}
                  />
                </>
              ) : (
                <View style={styles.restrictedNotice}>
                  <Text style={styles.restrictedNoticeTitle}>Visible après acceptation</Text>
                  <Text style={styles.restrictedNoticeText}>
                    Ces informations apparaissent dans la page de paiement après que ta demande est acceptée.
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
                    Les détails sont disponibles sur la page de paiement une fois ta demande acceptée.
                  </Text>
                </View>
              )}
            </View>

            {routeMode === 'checkout' && !reservationAccepted ? (
              <View style={styles.checkoutNotice}>
                <Text style={styles.checkoutNoticeTitle}>Paiement indisponible</Text>
                <Text style={styles.checkoutNoticeText}>
                  Ta demande doit d’abord être acceptée par le conducteur pour continuer.
                </Text>
                <GradientButton
                  title="Retour"
                  size="sm"
                  variant="lavender"
                  fullWidth
                  style={[styles.actionButton, isCompact && styles.actionButtonFull]}
                  onPress={() => router.back()}
                  accessibilityRole="button"
                />
              </View>
            ) : null}

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
                <Text style={styles.statusText}>Tu as déjà une place sur ce trajet.</Text>
              ) : routeMode === 'checkout' ? (
                <>
                  {checkoutError ? <Text style={styles.errorText}>{checkoutError}</Text> : null}
                  <GradientButton
                    title={isPaying ? 'Paiement en cours…' : seatsLeft > 0 ? 'Procéder au paiement' : 'Complet'}
                    size="sm"
                    variant="cta"
                    fullWidth
                    style={[styles.actionButton, isCompact && styles.actionButtonFull]}
                    onPress={handleProceedToPayment}
                    disabled={seatsLeft <= 0 || isPaying || !ride}
                    accessibilityRole="button"
                  />
                  {showCancelButton ? (
                    <GradientButton
                      title={isCancelling ? 'Annulation en cours…' : 'Annuler ma réservation'}
                      size="sm"
                      variant="lavender"
                      fullWidth
                      style={[
                        styles.actionButton,
                        styles.cancelCheckoutButton,
                        isCompact && styles.actionButtonFull,
                      ]}
                      onPress={() => setShowCancelModal(true)}
                      disabled={isCancelling}
                      accessibilityRole="button"
                    />
                  ) : null}
                </>
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
      <ConfirmModal
        visible={showCancelModal}
        title="Annuler la réservation ?"
        message="Voulez-vous vraiment annuler cette réservation ?"
        confirmLabel="Oui, annuler"
        cancelLabel="Retour"
        onConfirm={handleConfirmCancel}
        onCancel={() => setShowCancelModal(false)}
        confirmDisabled={isCancelling}
      />
      <Modal
        visible={routeMode === 'checkout' && showWalletConfirmModal}
        animationType="slide"
        transparent
        onRequestClose={closeWalletConfirmModal}
      >
        <View style={[styles.modalBackdrop, isCompact && styles.modalBackdropCompact]}>
          <View
            style={[
              styles.modalCard,
              styles.walletConfirmModalCard,
              isCompact && styles.modalCardCompact,
            ]}
          >
            <Text style={styles.walletConfirmTitle}>Confirmer le paiement</Text>
            <Text style={styles.walletConfirmDescription}>
              Ce trajet coûte {checkoutAmountLabel} €. Ton solde wallet : {walletBalanceLabel} €.
            </Text>
            {walletBalance < checkoutAmount ? (
              <Text style={styles.walletConfirmWarning}>Solde insuffisant</Text>
            ) : null}
            {walletPaymentError ? (
              <Text style={styles.walletPaymentError}>{walletPaymentError}</Text>
            ) : null}
            <GradientButton
              title={isPaying ? 'Paiement en cours…' : `Confirmer ${checkoutAmountLabel} €`}
              size="sm"
              variant="cta"
              fullWidth
              style={styles.walletConfirmButton}
              contentStyle={styles.walletConfirmButtonContent}
              onPress={confirmWalletCheckoutPayment}
              disabled={isPaying || walletBalance < checkoutAmount}
              accessibilityRole="button"
            >
              {isPaying ? <ActivityIndicator color="#fff" /> : null}
            </GradientButton>
            <Pressable
              activeOpacity={0.85}
              style={styles.walletCancelButton}
              onPress={closeWalletConfirmModal}
              accessibilityRole="button"
            >
              <Text style={styles.walletCancelButtonText}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {routeMode !== 'checkout' && paymentModalVisible ? (
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
  fallbackBanner: {
    width: '100%',
    borderRadius: Radius['2xl'],
    padding: Spacing.md,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  fallbackLabel: {
    fontWeight: '700',
    color: '#7C3AED',
  },
  fallbackText: {
    color: C.gray600,
    fontSize: 13,
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
  checkoutNotice: {
    backgroundColor: C.white,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...S.card,
  },
  checkoutNoticeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.ink,
  },
  checkoutNoticeText: {
    color: C.gray600,
    lineHeight: 20,
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
  cancelCheckoutButton: {
    marginTop: Spacing.xs,
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
  walletConfirmModalCard: {
    gap: Spacing.md,
  },
  walletConfirmTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
  },
  walletConfirmDescription: {
    color: C.gray600,
    fontSize: 14,
    lineHeight: 20,
  },
  walletConfirmWarning: {
    color: C.danger,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  walletPaymentError: {
    marginTop: Spacing.xs,
    color: C.danger,
    fontSize: 13,
    textAlign: 'center',
  },
  walletConfirmButton: {
    marginTop: Spacing.md,
  },
  walletConfirmButtonContent: {
    gap: 12,
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

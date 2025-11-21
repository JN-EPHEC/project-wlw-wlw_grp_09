import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  ActivityIndicator,
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
} from 'react-native';

import * as Auth from '@/app/services/auth';
import {
  subscribeNotifications,
  type Notification,
} from '@/app/services/notifications';
import { subscribePassengerFeedback, type PassengerFeedback } from '@/app/services/passenger-feedback';
import { createReport } from '@/app/services/reports';
import {
  estimateRatingConfidence,
  respondToReview,
  subscribeDriverReviews,
  type Review,
} from '@/app/services/reviews';
import { applyRewards, type RewardSnapshot } from '@/app/services/rewards';
import {
  getRides,
  hasRideDeparted,
  subscribeRides,
  type Ride,
} from '@/app/services/rides';
import {
  getWallet,
  subscribeWallet,
  type WalletSnapshot,
} from '@/app/services/wallet';
import {
  getNextSelfieLabel,
  needsFreshSelfie,
} from '@/app/services/security';
import { getAvatarUrl } from '@/app/ui/avatar';
import { Colors, Gradients, Radius, Spacing, Typography } from '@/app/ui/theme';
import { buildSmartReplies } from '@/app/utils/ai-reply';
import { ReviewCard } from '@/components/review-card';
import { RewardBadge } from '@/components/reward-badge';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RatingStars } from '@/components/ui/rating-stars';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useDriverSecurity } from '@/hooks/use-driver-security';
import { useBreakpoints } from '@/hooks/use-breakpoints';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { RideMap as ProfileRideMap } from '../../components/ride-map';
import { captureProfilePhoto, pickProfileImage, pickProfileDocument } from '@/app/utils/image-picker';

const C = Colors;
const R = Radius;

const formatName = (value: string | null | undefined) => {
  if (!value) return null;
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0) return null;
  const first = parts[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
};

export default function ProfileScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const [rides, setRides] = useState<Ride[]>(getRides());
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rewardSnapshot, setRewardSnapshot] = useState<RewardSnapshot | null>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [respondTarget, setRespondTarget] = useState<Review | null>(null);
  const [responseDraft, setResponseDraft] = useState('');
  const [isPublishingResponse, setIsPublishingResponse] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const checklist = wallet?.checklist ?? [];
  const [passengerFeedback, setPassengerFeedback] = useState<PassengerFeedback[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const [walletSectionY, setWalletSectionY] = useState(0);
  const [sectionAnchors, setSectionAnchors] = useState<Record<string, number>>({});
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const driverSecurity = useDriverSecurity(session.email);
  const {
    isDesktop,
    isTablet,
    responsiveSpacing,
    maxContentWidth,
    width: viewportWidth,
  } = useBreakpoints();
  const showSideNav = isDesktop;
  const scrollBottomInset = useTabBarInset(Spacing.xxl);

  const updateRoles = useCallback(
    (changes: { driver?: boolean; passenger?: boolean }) => {
      if (!session.email) return;
      try {
        Auth.updateProfile(session.email, changes);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Modification impossible pour le moment.';
        Alert.alert('Erreur', message);
      }
    },
    [session.email]
  );

  const togglePassengerRole = useCallback(() => {
    const next = !session.isPassenger;
    if (!next && !session.isDriver) {
      Alert.alert('Action impossible', 'Tu dois conserver au moins un rôle actif.');
      return;
    }
    updateRoles({ passenger: next });
  }, [session.isPassenger, session.isDriver, updateRoles]);

  const openDriverVerification = useCallback(() => {
    router.push('/driver-verification');
  }, [router]);

  const enableDriverMode = useCallback(() => {
    if (!session.email) return;
    if (session.isDriver) {
      router.push('/explore');
      return;
    }
    if (!driverSecurity) {
      Alert.alert('Initialisation en cours', 'Patiente un instant avant de passer conducteur.');
      return;
    }
    if (driverSecurity.blockers.requiresLicense || driverSecurity.blockers.requiresVehicle) {
      Alert.alert(
        'Complète ta vérification',
        'Ajoute ton permis et ton véhicule pour garantir la sécurité de tes passagers.',
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Compléter maintenant', onPress: openDriverVerification },
        ]
      );
      return;
    }
    if (needsFreshSelfie(driverSecurity)) {
      Alert.alert(
        'Selfie requis',
        'Réalise un selfie de vérification pour confirmer que tu es bien le conducteur.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Prendre un selfie', onPress: openDriverVerification },
        ]
      );
      return;
    }
    Alert.alert(
      'Passe côté conducteur',
      'Publie ton trajet en 2 minutes, fixe ton prix et finance tes déplacements.',
      [
        { text: 'Plus tard', style: 'cancel' },
        {
          text: 'Activer maintenant',
          style: 'default',
          onPress: () => updateRoles({ driver: true }),
        },
      ]
    );
  }, [
    session.email,
    session.isDriver,
    driverSecurity,
    openDriverVerification,
    updateRoles,
    router,
  ]);

  const disableDriverMode = useCallback(() => {
    if (!session.isDriver) return;
    Alert.alert(
      'Désactiver le mode conducteur ?',
      'Tu pourras toujours reproposer des trajets quand tu le souhaites.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Désactiver', style: 'destructive', onPress: () => updateRoles({ driver: false }) },
      ]
    );
  }, [session.isDriver, updateRoles]);

  const [previewAvatarUri, setPreviewAvatarUri] = useState<string | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  const applyAvatar = useCallback(
    async (uri: string | null) => {
      if (!session.email) return false;
      setIsSavingAvatar(true);
      try {
        await Auth.updateProfile(session.email, { avatarUrl: uri ?? '' });
        Alert.alert(
          'Photo de profil',
          uri ? 'Ton avatar a été mis à jour.' : 'Ta photo a été supprimée.'
        );
        return true;
      } catch {
        Alert.alert('Erreur', 'Impossible de mettre à jour la photo de profil.');
        return false;
      } finally {
        setIsSavingAvatar(false);
      }
    },
    [session.email]
  );

  const startAvatarSelection = useCallback(
    async (source: 'camera' | 'gallery' | 'files') => {
      if (updatingAvatar || isSavingAvatar) return;
      setUpdatingAvatar(true);
      try {
        let uri: string | null = null;
        if (source === 'camera') uri = await captureProfilePhoto();
        else if (source === 'gallery') uri = await pickProfileImage();
        else uri = await pickProfileDocument();
        if (uri) {
          setPreviewAvatarUri(uri);
        }
      } finally {
        setUpdatingAvatar(false);
      }
    },
    [updatingAvatar, isSavingAvatar]
  );

  const changeAvatar = useCallback(() => {
    if (!session.email || updatingAvatar || isSavingAvatar) return;

    const openCamera = () => void startAvatarSelection('camera');
    const openGallery = () => void startAvatarSelection('gallery');
    const openFiles = () => void startAvatarSelection('files');

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Annuler', 'Prendre une photo', 'Choisir dans ma galerie', 'Importer un fichier'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) openCamera();
          if (index === 2) openGallery();
          if (index === 3) openFiles();
        }
      );
      return;
    }

    Alert.alert(
      'Photo de profil',
      'Comment veux-tu mettre à jour ton avatar ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Prendre une photo', onPress: openCamera },
        { text: 'Choisir dans ma galerie', onPress: openGallery },
        { text: 'Importer un fichier', onPress: openFiles },
      ],
      { cancelable: true }
    );
  }, [session.email, updatingAvatar, isSavingAvatar, startAvatarSelection]);

  const onRemoveAvatar = useCallback(() => {
    if (!session.email || isSavingAvatar) return;
    Alert.alert(
      'Supprimer ta photo ?',
      'Ton avatar redeviendra l’illustration par défaut.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            void applyAvatar(null);
          },
        },
      ]
    );
  }, [session.email, isSavingAvatar, applyAvatar]);

  const confirmAvatarPreview = useCallback(async () => {
    if (!previewAvatarUri) return;
    const ok = await applyAvatar(previewAvatarUri);
    if (ok) {
      setPreviewAvatarUri(null);
    }
  }, [previewAvatarUri, applyAvatar]);

  const cancelAvatarPreview = useCallback(() => {
    if (isSavingAvatar) return;
    setPreviewAvatarUri(null);
  }, [isSavingAvatar]);

  const scrollToWallet = useCallback(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ y: walletSectionY, animated: true });
  }, [walletSectionY]);

  const registerAnchor = useCallback(
    (key: string) => (event: any) => {
      const offset = Math.max(0, event.nativeEvent.layout.y - 24);
      setSectionAnchors((prev) => ({ ...prev, [key]: offset }));
    },
    []
  );

  const scrollToSection = useCallback(
    (key: string) => {
      const y = sectionAnchors[key];
      if (y === undefined || !scrollRef.current) return;
      scrollRef.current.scrollTo({ y, animated: true });
    },
    [sectionAnchors]
  );

  const sideNavSections = useMemo(
    () => [
      { key: 'overview', label: 'Aperçu' },
      { key: 'security', label: 'Sécurité' },
      { key: 'wallet', label: 'Wallet' },
      { key: 'rides', label: 'Trajets' },
      { key: 'reviews', label: 'Avis' },
      { key: 'alerts', label: 'Alertes' },
      { key: 'reputation', label: 'Réputation' },
    ],
    []
  );

  const driverSecurityStatus = useMemo(() => {
    if (!driverSecurity) {
      return {
        label: 'Analyse en cours',
        color: C.gray500,
        description: 'Chargement de tes documents de vérification…',
      };
    }
    if (driverSecurity.blockers.requiresLicense || driverSecurity.blockers.requiresVehicle) {
      return {
        label: 'Complète ta vérification',
        color: C.danger,
        description: 'Ajoute ton permis et ton véhicule pour activer le mode conducteur.',
      };
    }
    if (needsFreshSelfie(driverSecurity)) {
      return {
        label: 'Selfie requis',
        color: C.warning,
        description: 'Réalise un selfie de vérification avant de publier un trajet.',
      };
    }
    return {
      label: 'Sécurité validée',
      color: C.success,
      description: 'Tes documents sont validés et ton selfie est récent.',
    };
  }, [driverSecurity]);

  const securityHighlights = useMemo(
    () => [
      {
        key: 'license',
        label: 'Permis de conduire déposé',
        done: !!driverSecurity?.driverLicenseUrl,
      },
      {
        key: 'vehicle',
        label: 'Plaque et véhicule confirmés',
        done:
          !!driverSecurity?.vehicle.plate &&
          !!driverSecurity?.vehicle.brand &&
          !!driverSecurity?.vehicle.photoUrl,
      },
      {
        key: 'selfie',
        label: 'Selfie de vérification à jour',
        done: driverSecurity ? !needsFreshSelfie(driverSecurity) : false,
      },
    ],
    [driverSecurity]
  );

  const nextSelfieLabel = useMemo(() => {
    if (!driverSecurity) return null;
    if (needsFreshSelfie(driverSecurity)) return 'À réaliser maintenant';
    return getNextSelfieLabel(driverSecurity);
  }, [driverSecurity]);

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
      setPassengerFeedback([]);
      return;
    }
    const unsubscribe = subscribePassengerFeedback(session.email, setPassengerFeedback);
    return unsubscribe;
  }, [session.email]);

  const firstName = formatName(session.name) ?? 'Conducteur';
  const avatarSource = session.avatarUrl
    ? { uri: session.avatarUrl }
    : { uri: getAvatarUrl(session.email ?? session.name ?? 'driver', 128) };
  const myRides = useMemo(
    () => rides.filter((ride) => ride.ownerEmail === session.email),
    [rides, session.email]
  );
  const upcoming = useMemo(
    () => myRides.filter((ride) => !hasRideDeparted(ride)),
    [myRides]
  );
  const completed = useMemo(
    () => myRides.filter((ride) => hasRideDeparted(ride)),
    [myRides]
  );

  const rideTotals = useMemo(() => {
    return myRides.reduce(
      (acc, ride) => {
        acc.passengers += ride.passengers.length;
        acc.seats += ride.seats;
        acc.price += ride.price;
        return acc;
      },
      { passengers: 0, seats: 0, price: 0 }
    );
  }, [myRides]);

  const occupancy =
    rideTotals.seats > 0 ? Math.round((rideTotals.passengers / rideTotals.seats) * 100) : 0;
  const avgPrice = myRides.length > 0 ? rideTotals.price / myRides.length : 0;

  const walletTotals = useMemo(() => {
    if (!wallet) return { earned: 0, withdrawn: 0 };
    return wallet.transactions.reduce(
      (acc, tx) => {
        if (tx.type === 'credit') acc.earned += tx.amount;
        else acc.withdrawn += tx.amount;
        return acc;
      },
      { earned: 0, withdrawn: 0 }
    );
  }, [wallet]);

  const walletBalance = wallet?.balance ?? 0;
  const walletPoints = wallet?.points ?? 0;
  const lastWalletTransaction = wallet?.transactions[0] ?? null;
  const lastWalletTransactionLabel = useMemo(() => {
    if (!lastWalletTransaction) return 'Aucune opération récente';
    const amount = `${lastWalletTransaction.type === 'credit' ? '+' : '-'}€${lastWalletTransaction.amount.toFixed(2)}`;
    const date = new Date(lastWalletTransaction.createdAt).toLocaleDateString('fr-BE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${amount} • ${date}`;
  }, [lastWalletTransaction]);

  const hasPayoutMethod = !!wallet?.payoutMethod;
  const payoutLabel = wallet?.payoutMethod
    ? `${wallet.payoutMethod.brand} ••••${wallet.payoutMethod.last4}`
    : 'Aucune carte enregistrée';

  const canWithdraw = useMemo(() => {
    if (!wallet) return false;
    if (wallet.balance <= 0) return false;
    if (!wallet.lastWithdrawalAt) return true;
    const delay = (wallet.withdrawalDelayDays ?? 30) * 24 * 60 * 60 * 1000;
    return Date.now() - wallet.lastWithdrawalAt >= delay;
  }, [wallet]);

  const nextWithdrawalLabel = useMemo(() => {
    if (!wallet?.lastWithdrawalAt) return 'Disponible immédiatement';
    const delay = (wallet.withdrawalDelayDays ?? 30) * 24 * 60 * 60 * 1000;
    const next = wallet.lastWithdrawalAt + delay;
    if (Date.now() >= next) return 'Disponible immédiatement';
    return new Date(next).toLocaleDateString('fr-BE', {
      day: 'numeric',
      month: 'long',
    });
  }, [wallet?.lastWithdrawalAt, wallet?.withdrawalDelayDays]);

  const walletCredits = wallet?.rideCredits ?? 0;

  const recentNotifications = useMemo(() => notifications.slice(0, 3), [notifications]);
  const ratingSummary = useMemo(() => {
    if (reviews.length === 0) return { average: 0, count: 0 };
    const total = reviews.reduce((acc, review) => acc + review.rating, 0);
    const average = Math.round((total / reviews.length) * 10) / 10;
    return { average, count: reviews.length };
  }, [reviews]);

  const passengerReputation = useMemo(() => {
    if (passengerFeedback.length === 0) return { average: 0, count: 0 };
    const total = passengerFeedback.reduce((acc, entry) => acc + entry.rating, 0);
    const average = Math.round((total / passengerFeedback.length) * 10) / 10;
    return { average, count: passengerFeedback.length };
  }, [passengerFeedback]);

  const ratingConfidence = useMemo(
    () =>
      estimateRatingConfidence({
        completedRides: completed.length,
        averageRating: ratingSummary.average,
      }),
    [completed.length, ratingSummary.average]
  );

  useEffect(() => {
    if (!session.email) {
      setRewardSnapshot(null);
      return;
    }
    const snapshot = applyRewards(session.email, {
      completedRides: completed.length,
      averageRating: ratingSummary.average,
      reviewCount: ratingSummary.count,
    });
    setRewardSnapshot(snapshot);
  }, [session.email, completed.length, ratingSummary.average, ratingSummary.count]);

  const visibleReviews = useMemo(
    () => (showAllReviews ? reviews : reviews.slice(0, 3)),
    [reviews, showAllReviews]
  );
  const hasMoreReviews = reviews.length > 3;
  const disableSubmit = responseDraft.trim().length < 3 || isPublishingResponse;

  const scrollContentStyle = useMemo(
    () => [
      styles.scroll,
      {
        paddingHorizontal: responsiveSpacing,
        maxWidth: Math.min(maxContentWidth, viewportWidth),
        width: '100%',
        alignSelf: 'center',
        paddingBottom: scrollBottomInset,
      },
    ],
    [responsiveSpacing, maxContentWidth, viewportWidth, scrollBottomInset]
  );

  const headerCardStyle = useMemo(
    () => [
      styles.headerCard,
      !(isDesktop || isTablet) && styles.headerCardStacked,
    ],
    [isDesktop, isTablet]
  );

  const walletBalanceRowStyle = useMemo(
    () => [
      styles.walletBalanceRow,
      !(isDesktop || isTablet) && styles.walletBalanceRowStacked,
    ],
    [isDesktop, isTablet]
  );
  const onToggleReviews = () => setShowAllReviews((prev) => !prev);

  const openRespondModal = (review: Review) => {
    setRespondTarget(review);
    setResponseDraft(review.response?.body ?? 'Merci pour ton avis !');
    setAiSuggestions(buildSmartReplies(review));
  };

  const promptReport = (targetEmail: string, rideId: string | undefined, context: 'driver-review' | 'passenger-feedback') => {
    if (!session.email) return;
    const reasons = [
      { label: 'Comportement inapproprié', value: 'inappropriate-behaviour' },
      { label: 'Annulation tardive', value: 'late-cancellation' },
      { label: 'Absence au rendez-vous', value: 'no-show' },
      { label: 'Conduite dangereuse', value: 'unsafe-driving' },
      { label: 'Autre', value: 'other' },
    ];
    Alert.alert(
      'Signaler ce membre',
      'Choisis la raison du signalement. Notre équipe vérifiera rapidement.',
      [
        { text: 'Annuler', style: 'cancel' },
        ...reasons.map((reason) => ({
          text: reason.label,
          style: reason.value === 'other' ? 'destructive' : 'default',
          onPress: () =>
            createReport({
              reporterEmail: session.email!,
              targetEmail,
              rideId,
              reason: reason.value as any,
              metadata: { context },
            }),
        })),
      ]
    );
  };

  const handleReportReview = (review: Review) => {
    promptReport(review.passengerEmail, review.rideId, 'driver-review');
  };

  const handleReportPassengerFeedback = (entry: PassengerFeedback) => {
    promptReport(entry.passengerEmail, entry.rideId, 'passenger-feedback');
  };

  const openReviewsScreen = () => {
    if (!session.email) return;
    router.push({ pathname: '/reviews/[email]', params: { email: session.email } });
  };

  const closeRespondModal = () => {
    setRespondTarget(null);
    setResponseDraft('');
    setIsPublishingResponse(false);
    setAiSuggestions([]);
  };

  const onSubmitResponse = () => {
    if (!respondTarget || disableSubmit) return;
    try {
      setIsPublishingResponse(true);
      respondToReview(respondTarget.id, responseDraft);
      Alert.alert('Réponse envoyée', 'Ton message a été publié auprès du passager.');
      closeRespondModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de publier la réponse.';
      Alert.alert('Erreur', message);
      setIsPublishingResponse(false);
    }
  };

  const applyAiSuggestion = useCallback((suggestion: string) => {
    setResponseDraft(suggestion);
  }, []);

  const refreshAiSuggestions = useCallback(() => {
    if (!respondTarget) return;
    setAiSuggestions(buildSmartReplies(respondTarget));
  }, [respondTarget]);

  const notificationIcon = (notif: Notification) => {
    const action = notif.metadata?.action;
    switch (action) {
      case 'wallet-credit':
      case 'payment-received':
        return 'creditcard.fill';
      case 'payment-confirmed':
        return 'checkmark.seal.fill';
      case 'ride-published':
        return 'paperplane.fill';
      default:
        return 'bell.fill';
    }
  };

  return (
    <AppBackground style={styles.screen}>
      <SafeAreaView style={styles.safe}>
        {showSideNav ? (
          <View style={styles.sideNav} pointerEvents="box-none">
            {sideNavSections.map((section) => (
              <Pressable
                key={section.key}
                style={[
                  styles.sideNavButton,
                  sectionAnchors[section.key] === undefined && styles.sideNavButtonDisabled,
                ]}
                onPress={() => scrollToSection(section.key)}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.sideNavText,
                    sectionAnchors[section.key] !== undefined && styles.sideNavTextActive,
                  ]}
                >
                  {section.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={scrollContentStyle}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="always"
      >
        <GradientBackground
          colors={Gradients.card}
          style={headerCardStyle}
          onLayout={registerAnchor('overview')}
        >
          <Pressable
            style={styles.avatarPressable}
            onPress={changeAvatar}
            accessibilityRole="button"
          >
            <View style={styles.avatarWrapper}>
              <Image source={avatarSource} style={styles.avatarImage} />
              <View style={styles.avatarBadge}>
                {updatingAvatar || isSavingAvatar ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.avatarBadgeText}>Changer</Text>
                )}
              </View>
            </View>
          </Pressable>
          <View style={styles.headerMeta}>
            <Text style={styles.headerName}>{firstName}</Text>
            <Text style={styles.headerEmail}>{session.email}</Text>
            <View style={styles.roleBadges}>
              {session.isPassenger ? (
                <Text style={[styles.roleBadge, styles.roleBadgePassenger]}>Passager</Text>
              ) : null}
              {session.isDriver ? (
                <Text style={[styles.roleBadge, styles.roleBadgeDriver]}>Conducteur</Text>
              ) : null}
            </View>
            {session.avatarUrl ? (
              <Pressable
                hitSlop={8}
                onPress={onRemoveAvatar}
                disabled={isSavingAvatar || updatingAvatar}
              >
                <Text style={[styles.avatarRemoveLink, (isSavingAvatar || updatingAvatar) && styles.linkDisabled]}>
                  Supprimer la photo
                </Text>
              </Pressable>
            ) : null}
          </View>
        </GradientBackground>

        <GradientBackground
          colors={Gradients.card}
          style={styles.securityCard}
          onLayout={registerAnchor('security')}
        >
          <View style={styles.securityHeader}>
            <IconSymbol name="shield.checkerboard" size={22} color={driverSecurityStatus.color} />
            <View style={{ flex: 1 }}>
              <Text style={styles.securityTitle}>Sécurité CampusRide</Text>
              <Text style={[styles.securityBadge, { color: driverSecurityStatus.color }]}>
                {driverSecurityStatus.label}
              </Text>
            </View>
          </View>
          <Text style={styles.securityDescription}>{driverSecurityStatus.description}</Text>
          <View style={styles.securityHighlights}>
            {securityHighlights.map((item) => (
              <View key={item.key} style={styles.securityRow}>
                <IconSymbol
                  name={item.done ? 'checkmark.seal.fill' : 'exclamationmark.triangle'}
                  size={16}
                  color={item.done ? C.success : C.warning}
                />
                <Text style={styles.securityRowText}>{item.label}</Text>
              </View>
            ))}
          </View>
          {nextSelfieLabel ? (
            <Text style={styles.securityFooter}>
              Prochain selfie de vérification : {nextSelfieLabel}.
            </Text>
          ) : null}
          <GradientButton
            title={
              driverSecurity && !driverSecurity.blockers.requiresLicense && !needsFreshSelfie(driverSecurity)
                ? 'Consulter mes documents'
                : 'Compléter ma vérification'
            }
            onPress={openDriverVerification}
            size="sm"
            variant="cta"
            style={styles.securityButton}
          />
        </GradientBackground>

        <View style={styles.statsRow}>
          <GradientBackground colors={Gradients.card} style={styles.statCard}>
            <IconSymbol name="paperplane.fill" size={26} color={C.primary} />
            <Text style={styles.statValue}>{upcoming.length}</Text>
            <Text style={styles.statLabel}>Trajets planifiés</Text>
          </GradientBackground>
          <GradientBackground colors={Gradients.card} style={styles.statCard}>
            <IconSymbol name="car.fill" size={26} color={C.secondary} />
            <Text style={styles.statValue}>{occupancy}%</Text>
            <Text style={styles.statLabel}>Taux de remplissage</Text>
          </GradientBackground>
          <GradientBackground colors={Gradients.card} style={styles.statCard}>
            <IconSymbol name="eurosign.circle.fill" size={26} color={C.primaryDark} />
            <Text style={styles.statValue}>€{avgPrice.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Tarif moyen</Text>
          </GradientBackground>
        </View>

        <GradientBackground
          colors={session.isDriver ? Gradients.card : Gradients.cta}
          style={styles.driverPromoCard}
        >
          <View style={styles.driverPromoHeader}>
            <View style={styles.driverPromoIcon}>
              <IconSymbol
                name="car.fill"
                size={26}
                color={session.isDriver ? C.primary : '#FFFFFF'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverPromoTitle}>
                {session.isDriver ? 'Conducteur CampusRide' : 'Passe côté conducteur'}
              </Text>
              <Text style={styles.driverPromoSubtitle}>
                {session.isDriver
                  ? 'Publie un trajet, fixe ton prix et suis tes gains en direct.'
                  : 'Gagne jusqu’à 120 € / mois en partageant tes trajets retour. CampusRide te trouve des passagers en quelques minutes.'}
              </Text>
            </View>
          </View>
          <View style={styles.driverPromoBenefits}>
            <Text style={styles.driverPromoBullet}>• Alertes instantanées aux passagers proches</Text>
            <Text style={styles.driverPromoBullet}>• Retrait prioritaire dès 7 jours</Text>
            <Text style={styles.driverPromoBullet}>• Assistance 7j/7 pour tes trajets</Text>
          </View>
          <GradientButton
            title={session.isDriver ? 'Publier un trajet' : 'Activer le mode conducteur'}
            variant="cta"
            fullWidth
            onPress={enableDriverMode}
            accessibilityRole="button"
          />
          <View style={styles.driverPromoFooter}>
            <Pressable onPress={togglePassengerRole} accessibilityRole="button">
              <Text style={styles.driverPromoFooterLink}>
                {session.isPassenger ? 'Passager actif ✔' : 'Activer le mode passager'}
              </Text>
            </Pressable>
            {session.isDriver ? (
              <Pressable onPress={disableDriverMode} accessibilityRole="button">
                <Text style={styles.driverPromoFooterLinkMuted}>Mettre en pause le mode conducteur</Text>
              </Pressable>
            ) : null}
          </View>
        </GradientBackground>

        <GradientBackground colors={Gradients.card} style={styles.mapCard}>
          <View style={styles.mapHeader}>
            <IconSymbol name="map.fill" size={22} color={C.primary} />
            <Text style={styles.mapTitle}>Carte de mes trajets</Text>
          </View>
          <Text style={styles.mapSubtitle}>
            Retrouve l’ensemble de tes trajets (actifs et passés). Les itinéraires en pointillé
            indiquent les suggestions CampusRide lorsqu’il n’y a pas encore de réservation.
          </Text>
          <View style={styles.mapContainer}>
            <ProfileRideMap rides={myRides.length > 0 ? myRides : rides} />
          </View>
        </GradientBackground>

        <GradientBackground
          colors={Gradients.card}
          style={styles.walletCard}
          onLayout={(event) => {
            setWalletSectionY(event.nativeEvent.layout.y - Spacing.xl);
            registerAnchor('wallet')(event);
          }}
        >
          <View style={styles.walletHeader}>
            <IconSymbol name="creditcard.fill" size={24} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.walletTitle}>Ton wallet CampusRide</Text>
              <Text style={styles.walletSubtitle}>{lastWalletTransactionLabel}</Text>
              <Text style={styles.walletSubtitle}>
                {hasPayoutMethod
                  ? `Versements vers ${payoutLabel}`
                  : 'Ajoute une carte pour activer les virements automatiques.'}
              </Text>
            </View>
          </View>
          <View style={walletBalanceRowStyle}>
            <View>
              <Text style={styles.walletBalanceLabel}>Solde disponible</Text>
              <Text style={styles.walletBalanceValue}>€{walletBalance.toFixed(2)}</Text>
            </View>
            <GradientButton
              title={canWithdraw ? 'Retirer mes gains' : 'Ouvrir le wallet'}
              onPress={() => router.push('/wallet')}
              variant={canWithdraw ? 'cta' : 'lavender'}
            />
          </View>
          <View style={styles.walletStats}>
            <View style={styles.walletStatItem}>
              <Text style={styles.walletStatLabel}>Points fidélité</Text>
              <Text style={styles.walletStatValue}>{walletPoints}</Text>
            </View>
            <View style={styles.walletStatItem}>
              <Text style={styles.walletStatLabel}>Gains cumulés</Text>
              <Text style={styles.walletStatValue}>€{walletTotals.earned.toFixed(2)}</Text>
            </View>
            <View style={styles.walletStatItem}>
              <Text style={styles.walletStatLabel}>Retraits</Text>
              <Text style={styles.walletStatValue}>€{walletTotals.withdrawn.toFixed(2)}</Text>
            </View>
            <View style={styles.walletStatItem}>
              <Text style={styles.walletStatLabel}>Crédits trajet</Text>
              <Text style={styles.walletStatValue}>{walletCredits}</Text>
            </View>
            <View style={styles.walletStatItem}>
              <Text style={styles.walletStatLabel}>Retrait possible</Text>
              <Text style={styles.walletStatValue}>{nextWithdrawalLabel}</Text>
            </View>
          </View>
          <View style={styles.walletActionsInline}>
            <GradientButton
              title="Gérer mes cartes"
              variant="lavender"
              size="sm"
              onPress={() => router.push('/wallet')}
            />
            <GradientButton
              title="Historique complet"
              size="sm"
              onPress={() => router.push('/wallet')}
            />
          </View>
          <Text style={styles.walletNotice}>
            Toutes les conversations et paiements restent dans l’application. Partager ton numéro
            ou être payé en dehors de CampusRide peut mener à un bannissement immédiat.
          </Text>
        </GradientBackground>

      {checklist.length > 0 ? (
        <GradientBackground colors={Gradients.card} style={styles.checklistCard}>
          <View style={styles.checklistHeader}>
            <Text style={styles.checklistTitle}>Checklist conducteur</Text>
            <Text style={styles.checklistSubtitle}>
              {checklist.every((item) => item.done)
                ? 'Tout est prêt pour maximiser tes gains 💪'
                : 'Coche les étapes pour booster ta visibilité.'}
            </Text>
            <Pressable onPress={scrollToWallet} style={styles.checklistLink}>
              <Text style={styles.checklistLinkText}>Gérer mon wallet</Text>
            </Pressable>
          </View>
          <View style={styles.checklistItems}>
            {checklist.map((item) => (
              <View key={item.id} style={styles.checklistItem}>
                <View
                  style={[styles.checklistBullet, item.done && styles.checklistBulletDone]}
                >
                  {item.done ? <Text style={styles.checklistBulletIcon}>✓</Text> : null}
                </View>
                <Text
                  style={[styles.checklistLabel, item.done && styles.checklistLabelDone]}
                >
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </GradientBackground>
      ) : null}

      {rewardSnapshot ? (
        <RewardBadge
          snapshot={rewardSnapshot}
          actionLabel={
            reviews.length > 0 ? (showAllReviews ? 'Réduire les avis' : 'Voir tous les avis') : undefined
          }
          onPressAction={reviews.length > 0 ? onToggleReviews : undefined}
        />
      ) : null}

        <View style={styles.actionsRow}>
          <Pressable style={styles.actionCard} onPress={() => router.push('/(tabs)/explore')}>
            <GradientBackground colors={Gradients.card} style={styles.actionCardInner}>
              <IconSymbol name="plus.circle.fill" size={28} color={C.primary} />
              <Text style={styles.actionTitle}>Publier un trajet</Text>
              <Text style={styles.actionSubtitle}>Planifie un nouveau covoiturage</Text>
            </GradientBackground>
          </Pressable>
          <Pressable style={styles.actionCard} onPress={scrollToWallet}>
            <GradientBackground colors={Gradients.card} style={styles.actionCardInner}>
              <IconSymbol name="creditcard.fill" size={28} color={C.secondary} />
              <Text style={styles.actionTitle}>Voir mon wallet</Text>
              <Text style={styles.actionSubtitle}>Gestion des versements</Text>
            </GradientBackground>
          </Pressable>
        </View>

        <GradientBackground
          colors={Gradients.card}
          style={styles.sectionCard}
          onLayout={registerAnchor('rides')}
        >
          <Text style={styles.sectionTitle}>Trajets à venir</Text>
          {upcoming.length > 0 ? (
            upcoming.slice(0, 3).map((ride) => (
              <View key={ride.id} style={styles.upcomingRow}>
                <IconSymbol name="clock.fill" size={20} color={C.secondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.upcomingTitle}>
                    {ride.depart} → {ride.destination}
                  </Text>
                  <Text style={styles.upcomingMeta}>
                    {ride.time} •{' '}
                    {new Date(ride.departureAt).toLocaleDateString('fr-BE', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>
              Aucun trajet planifié pour le moment. Publie un trajet depuis l’onglet Explore.
            </Text>
          )}
        </GradientBackground>

        <GradientBackground
          colors={Gradients.card}
          style={styles.sectionCard}
          onLayout={registerAnchor('reviews')}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Avis passagers</Text>
            <Pressable style={styles.ratingSummaryBox} onPress={openReviewsScreen}>
              <RatingStars
                value={ratingSummary.count > 0 ? ratingSummary.average : 0}
                size={16}
                editable={false}
              />
              <Text style={styles.ratingValue}>{ratingSummary.average.toFixed(1)}</Text>
              <Text style={styles.ratingCount}>({ratingSummary.count})</Text>
            </Pressable>
          </View>
          {ratingSummary.count > 0 ? (
            <>
              <Text style={styles.ratingConfidence}>
                Indice de confiance {ratingConfidence}% • {completed.length} trajet(s) terminé(s)
              </Text>
              <View style={styles.reviewsList}>
                {visibleReviews.map((review) => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    onRespond={openRespondModal}
                    onReport={handleReportReview}
                  />
                ))}
              </View>
              {hasMoreReviews ? (
                <Pressable style={styles.reviewsToggle} onPress={onToggleReviews}>
                  <Text style={styles.reviewsToggleText}>
                    {showAllReviews ? 'Afficher moins' : `Voir tous les avis (${reviews.length})`}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Text style={styles.emptyText}>
              Tu n’as pas encore reçu d’avis. Encourage tes passagers à noter leur trajet terminé.
            </Text>
          )}
        </GradientBackground>

        <GradientBackground
          colors={Gradients.card}
          style={styles.sectionCard}
          onLayout={registerAnchor('alerts')}
        >
          <Text style={styles.sectionTitle}>Alertes récentes</Text>
          {recentNotifications.length > 0 ? (
            recentNotifications.map((notif) => (
              <View key={notif.id} style={styles.notificationRow}>
                <IconSymbol name={notificationIcon(notif)} size={20} color={C.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.notificationTitle}>{notif.title}</Text>
                  <Text style={styles.notificationBody}>{notif.body}</Text>
                </View>
                <Text style={styles.notificationTime}>
                  {new Date(notif.createdAt).toLocaleTimeString('fr-BE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Aucune alerte récente.</Text>
          )}
        </GradientBackground>

        <GradientBackground
          colors={Gradients.card}
          style={styles.sectionCard}
          onLayout={registerAnchor('reputation')}
        >
          <Text style={styles.sectionTitle}>Ma réputation en tant que passager</Text>
          <Text style={styles.sectionSubtitleSmall}>
            {passengerReputation.count > 0
              ? `${passengerReputation.average.toFixed(1)}/5 • ${passengerReputation.count} avis conducteur(s)`
              : 'Pas encore d’avis laissé par les conducteurs.'}
          </Text>
          {passengerFeedback.length > 0 ? (
            passengerFeedback.slice(0, 3).map((entry) => {
              const driverAliasRaw = entry.driverEmail.split('@')[0] ?? entry.driverEmail;
              const driverAlias = driverAliasRaw
                .replace(/[._-]+/g, ' ')
                .split(/\s+/)
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                .join(' ');
              return (
                <View key={entry.id} style={styles.passengerFeedbackRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.passengerFeedbackTitle}>{driverAlias}</Text>
                    <Text style={styles.passengerFeedbackMeta}>
                      {new Date(entry.createdAt).toLocaleDateString('fr-BE', {
                        day: 'numeric',
                        month: 'short',
                      })} • {entry.rating.toFixed(1)}/5
                    </Text>
                    {entry.comment ? (
                      <Text style={styles.passengerFeedbackComment}>{entry.comment}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => handleReportPassengerFeedback(entry)}
                    style={styles.passengerFeedbackReport}
                  >
                    <Text style={styles.passengerFeedbackReportText}>Signaler</Text>
                  </Pressable>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyText}>Tes conducteurs pourront te noter après vos trajets communs.</Text>
          )}
        </GradientBackground>
      </ScrollView>

      <Modal
        visible={!!previewAvatarUri}
        transparent
        animationType="fade"
        onRequestClose={cancelAvatarPreview}
      >
        <View style={styles.avatarModalBackdrop}>
          <View style={styles.avatarModalCard}>
            <Text style={styles.avatarModalTitle}>Aperçu de ta nouvelle photo</Text>
            <Text style={styles.avatarModalHint}>Vérifie que ton visage est bien visible avant de confirmer.</Text>
            {previewAvatarUri ? (
              <Image source={{ uri: previewAvatarUri }} style={styles.avatarPreviewImage} />
            ) : null}
            <View style={styles.avatarModalButtons}>
              <Pressable
                onPress={cancelAvatarPreview}
                disabled={isSavingAvatar}
                style={styles.avatarModalSecondary}
              >
                <Text
                  style={[
                    styles.avatarModalSecondaryText,
                    isSavingAvatar && styles.avatarModalDisabledText,
                  ]}
                >
                  Annuler
                </Text>
              </Pressable>
              <GradientButton
                title={isSavingAvatar ? 'Enregistrement…' : 'Confirmer'}
                onPress={confirmAvatarPreview}
                disabled={isSavingAvatar}
                style={styles.avatarModalPrimary}
              >
                {isSavingAvatar ? <ActivityIndicator color="#FFFFFF" /> : null}
              </GradientButton>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!respondTarget}
        animationType="slide"
        transparent
        onRequestClose={closeRespondModal}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                Répondre à {respondTarget?.passengerName ?? 'ton passager'}
              </Text>
              <Text style={styles.modalSubtitle}>
                Ton message sera visible sur ta fiche conducteur.
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Merci pour ton avis !"
                value={responseDraft}
                onChangeText={setResponseDraft}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoFocus
              />
              {aiSuggestions.length > 0 ? (
                <>
                  <Text style={styles.modalAiLabel}>Suggestions IA</Text>
                  <View style={styles.modalAiChips}>
                    {aiSuggestions.map((suggestion) => (
                      <Pressable
                        key={suggestion}
                        onPress={() => applyAiSuggestion(suggestion)}
                        style={styles.modalAiChip}
                      >
                        <Text style={styles.modalAiChipText}>{suggestion}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
              <Pressable style={styles.modalAiButton} onPress={refreshAiSuggestions}>
                <Text style={styles.modalAiButtonText}>
                  {aiSuggestions.length ? 'Autres suggestions IA' : 'Générer des suggestions IA'}
                </Text>
              </Pressable>
              <View style={styles.modalActions}>
                <GradientButton
                  title="Annuler"
                  size="sm"
                  variant="lavender"
                  onPress={closeRespondModal}
                  style={styles.modalActionButton}
                  accessibilityRole="button"
                />
                <GradientButton
                  title={isPublishingResponse ? 'Envoi…' : 'Publier'}
                  size="sm"
                  variant="cta"
                  onPress={onSubmitResponse}
                  disabled={disableSubmit}
                  style={styles.modalActionButton}
                  accessibilityRole="button"
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  scroll: {
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  sideNav: {
    position: 'absolute',
    right: Spacing.sm,
    top: Spacing.xl,
    gap: Spacing.sm,
    zIndex: 5,
  },
  sideNavButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: R.pill,
  },
  sideNavButtonDisabled: {
    opacity: 0.4,
  },
  sideNavText: { color: 'rgba(16,32,48,0.65)', fontSize: 11, fontWeight: '700' },
  sideNavTextActive: { color: C.primaryDark },
  headerCard: {
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: 'transparent',
  },
  headerCardStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  avatarWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: C.gray150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPressable: {
    borderRadius: 40,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  headerMeta: { gap: Spacing.xs },
  headerName: { fontSize: 20, fontWeight: '800', color: C.ink },
  headerEmail: { color: C.gray600, fontSize: 13 },
  roleBadges: { flexDirection: 'row', gap: 8, marginTop: Spacing.xs },
  roleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: R.pill,
    fontWeight: '700',
    fontSize: 11,
  },
  avatarRemoveLink: {
    marginTop: Spacing.xs,
    color: C.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  linkDisabled: {
    opacity: 0.6,
  },
  roleBadgePassenger: {
    backgroundColor: C.secondaryLight,
    color: C.secondary,
  },
  roleBadgeDriver: {
    backgroundColor: C.primaryLight,
    color: C.primaryDark,
  },
  securityCard: {
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    padding: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: 'transparent',
  },
  securityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  securityTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.ink,
  },
  securityBadge: {
    fontWeight: '700',
    fontSize: 13,
  },
  securityDescription: {
    color: C.gray600,
    fontSize: 12,
    lineHeight: 18,
  },
  securityHighlights: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  securityRowText: {
    color: C.gray700,
    fontSize: 12,
    flex: 1,
  },
  securityFooter: {
    color: C.gray500,
    fontSize: 11,
    marginTop: Spacing.xs,
  },
  securityButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: R.lg,
    padding: Spacing.lg,
    gap: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'flex-start',
    backgroundColor: 'transparent',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: C.ink },
  statLabel: { color: C.gray600, fontSize: 12 },

  driverPromoCard: {
    borderRadius: R.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  driverPromoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  driverPromoIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverPromoTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: C.ink,
  },
  driverPromoSubtitle: {
    color: C.gray600,
    fontSize: 13,
    marginTop: 2,
  },
  driverPromoBenefits: {
    gap: 4,
  },
  driverPromoBullet: {
    color: 'rgba(16,32,48,0.78)',
    fontSize: 12,
  },
  driverPromoFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  driverPromoFooterLink: {
    color: C.secondary,
    fontWeight: '700',
    fontSize: 12,
  },
  driverPromoFooterLinkMuted: {
    color: 'rgba(16,32,48,0.55)',
    fontSize: 12,
    fontWeight: '600',
  },

  mapCard: {
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    padding: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: 'transparent',
  },
  mapHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  mapTitle: { fontWeight: '700', fontSize: 16, color: C.ink },
  mapSubtitle: { color: C.gray600, fontSize: 12, lineHeight: 18 },
  mapContainer: {
    height: 220,
    borderRadius: R.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(35,75,124,0.2)',
  },

  walletCard: {
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    padding: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: 'transparent',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  walletTitle: { fontWeight: '800', fontSize: 18, color: C.ink },
  walletSubtitle: { color: C.gray600, fontSize: 12, lineHeight: 16 },
  walletBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletBalanceRowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  walletBalanceLabel: {
    color: C.gray600,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  walletBalanceValue: { color: C.ink, fontSize: 28, fontWeight: '800' },
  walletStats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.md },
  walletStatItem: {
    flex: 1,
    minWidth: 140,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: R.md,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  walletStatLabel: { color: C.gray600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 },
  walletStatValue: { color: C.ink, fontWeight: '700', fontSize: 14 },
  walletActionsInline: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  walletNotice: { color: C.gray500, fontSize: 12, lineHeight: 18 },
  avatarModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  avatarModalCard: {
    width: '100%',
    borderRadius: R.lg,
    padding: Spacing.lg,
    backgroundColor: '#FFFFFF',
    gap: Spacing.md,
  },
  avatarModalTitle: { fontSize: 18, fontWeight: '800', color: C.ink },
  avatarModalHint: { color: C.gray600, fontSize: 13, lineHeight: 18 },
  avatarPreviewImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: R.lg,
    backgroundColor: C.gray150,
  },
  avatarModalButtons: { flexDirection: 'row', gap: Spacing.sm },
  avatarModalSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.gray300,
    alignItems: 'center',
  },
  avatarModalSecondaryText: { color: C.gray700, fontWeight: '700', fontSize: 14 },
  avatarModalPrimary: { flex: 1 },
  avatarModalDisabledText: { opacity: 0.5 },
  checklistCard: {
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    padding: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: 'transparent',
  },
  checklistHeader: { gap: Spacing.xs },
  checklistTitle: { fontWeight: '700', color: C.ink, fontSize: 16 },
  checklistSubtitle: { color: C.gray600, fontSize: 13 },
  checklistLink: { alignSelf: 'flex-start', marginTop: Spacing.xs },
  checklistLinkText: { color: C.secondary, fontWeight: '700', fontSize: 12 },
  checklistItems: { gap: Spacing.sm, marginTop: Spacing.sm },
  checklistItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  checklistBullet: {
    width: 22,
    height: 22,
    borderRadius: R.pill,
    borderWidth: 2,
    borderColor: C.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistBulletDone: { backgroundColor: C.primary, borderColor: C.primary },
  checklistBulletIcon: { color: '#fff', fontWeight: '800', fontSize: 14 },
  checklistLabel: { color: C.gray700, fontSize: 13, flex: 1 },
  checklistLabelDone: { textDecorationLine: 'line-through', color: C.gray500 },

  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionCard: {
    flex: 1,
    borderRadius: R.lg,
    overflow: 'hidden',
  },
  actionCardInner: {
    borderRadius: R.lg,
    padding: Spacing.lg,
    gap: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'transparent',
  },
  actionTitle: { fontWeight: '700', color: C.ink },
  actionSubtitle: { color: C.gray600, fontSize: 12 },

  sectionCard: {
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    padding: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: 'transparent',
  },
  sectionTitle: { fontWeight: '700', fontSize: 16, color: C.ink },
  sectionSubtitleSmall: { color: C.gray600, fontSize: 12, marginBottom: Spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  ratingSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  ratingValue: { color: C.ink, fontWeight: '700', fontSize: 14 },
  ratingCount: { color: C.gray600, fontSize: 12 },
  ratingConfidence: { color: C.gray600, fontSize: 12 },
  reviewsList: { gap: Spacing.md },
  reviewsToggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.gray300,
  },
  reviewsToggleText: { color: C.secondary, fontWeight: '700', fontSize: 12 },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 6,
  },
  upcomingTitle: { color: C.ink, fontWeight: '600' },
  upcomingMeta: { color: C.gray600, fontSize: 12 },
  emptyText: { color: C.gray600, fontSize: 13 },

  notificationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  notificationTitle: { color: C.ink, fontWeight: '600' },
  notificationBody: { color: C.gray600, fontSize: 12 },
  notificationTime: { color: C.gray500, fontSize: 11 },
  passengerFeedbackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  passengerFeedbackTitle: { color: C.ink, fontWeight: '600' },
  passengerFeedbackMeta: { color: C.gray600, fontSize: 12 },
  passengerFeedbackComment: { color: C.gray700, fontSize: 13, marginTop: 4 },
  passengerFeedbackReport: {
    alignSelf: 'center',
    backgroundColor: C.dangerLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  passengerFeedbackReportText: { color: C.danger, fontSize: 11, fontWeight: '700' },

  tipsCard: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.gray200,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  tipsTitle: { color: C.ink, fontWeight: '700', fontSize: 16 },
  tip: { color: C.gray600, fontSize: 13, lineHeight: 18 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(16, 32, 48, 0.55)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  modalTitle: {
    color: C.ink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: Typography.heading.letterSpacing,
  },
  modalSubtitle: {
    color: C.gray600,
    fontSize: 13,
  },
  modalInput: {
    minHeight: 120,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.gray300,
    padding: Spacing.md,
    color: C.ink,
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: C.gray50,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  modalAiButton: {
    alignSelf: 'flex-start',
    backgroundColor: C.gray200,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: R.pill,
  },
  modalAiLabel: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    color: C.gray600,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  modalAiChips: {
    alignSelf: 'stretch',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  modalAiChip: {
    backgroundColor: C.gray150,
    borderRadius: R.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  modalAiChipText: {
    color: C.ink,
    fontSize: 12,
    lineHeight: 18,
  },
  modalAiButtonText: {
    color: C.secondary,
    fontWeight: '700',
    fontSize: 12,
  },
  modalActionButton: {
    minWidth: 110,
  },
});

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  toggleChecklistItem,
  type WalletSnapshot,
} from '@/app/services/wallet';
import {
  getNextSelfieLabel,
  needsFreshSelfie,
} from '@/app/services/security';
import { getAvatarUrl } from '@/app/ui/avatar';
import { Colors, Gradients, Radius, Spacing, Typography } from '@/app/ui/theme';
import { buildSmartReplies } from '@/app/utils/ai-reply';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useDriverSecurity } from '@/hooks/use-driver-security';
import { useBreakpoints } from '@/hooks/use-breakpoints';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { AvatarCropperModal } from '@/components/avatar-cropper';
import { captureProfilePhoto, pickProfileImage, pickProfileDocument, persistAvatarImage } from '@/app/utils/image-picker';

const C = Colors;
const R = Radius;


export default function ProfileScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const [rides, setRides] = useState<Ride[]>(getRides());
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rewardSnapshot, setRewardSnapshot] = useState<RewardSnapshot | null>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [respondTarget, setRespondTarget] = useState<Review | null>(null);
  const [responseDraft, setResponseDraft] = useState('');
  const [isPublishingResponse, setIsPublishingResponse] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const checklist = wallet?.checklist ?? [];
  const [passengerFeedback, setPassengerFeedback] = useState<PassengerFeedback[]>([]);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const driverSecurity = useDriverSecurity(session.email);
  const {
    isDesktop,
    isTablet,
    responsiveSpacing,
    maxContentWidth,
    width: viewportWidth,
  } = useBreakpoints();
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

  const toggleChecklist = useCallback(
    (id: string, nextState: boolean) => {
      if (!session.email) return;
      toggleChecklistItem(session.email, id, nextState);
    },
    [session.email]
  );

  const toggleFaqItem = useCallback((id: string) => {
    setActiveFaq((prev) => (prev === id ? null : id));
  }, []);

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
  const [cropSourceUri, setCropSourceUri] = useState<string | null>(null);
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
          setCropSourceUri(uri);
        }
      } finally {
        setUpdatingAvatar(false);
      }
    },
    [updatingAvatar, isSavingAvatar]
  );

  const changeAvatar = useCallback(() => {
    if (!session.email || updatingAvatar || isSavingAvatar) return;

    if (Platform.OS === 'web') {
      void startAvatarSelection('files');
      return;
    }

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

  const onCropperCancel = useCallback(() => {
    if (isSavingAvatar) return;
    setCropSourceUri(null);
  }, [isSavingAvatar]);

  const onCropperConfirm = useCallback(
    async (uri: string) => {
      try {
        const stored = await persistAvatarImage(uri);
        setPreviewAvatarUri(stored);
      } catch (err) {
        console.warn('persist avatar failed', err);
        Alert.alert('Erreur', 'Impossible de sauvegarder la photo recadrée.');
      } finally {
        setCropSourceUri(null);
      }
    },
    []
  );

  const handleEditProfile = useCallback(() => {
    router.push('/complete-profile');
  }, [router]);

  const handleOpenSettings = useCallback(() => {
    Alert.alert('Paramètres', 'Personnalise ton expérience prochainement dans cette section.');
  }, []);

  const handleOpenWallet = useCallback(() => {
    router.push('/wallet');
  }, [router]);

  const handleOpenHelp = useCallback(() => {
    router.push('/help');
  }, [router]);

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
        done: !!(driverSecurity?.driverLicenseFrontUrl && driverSecurity?.driverLicenseBackUrl),
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

  const avatarSource = session.avatarUrl
    ? { uri: session.avatarUrl }
    : { uri: getAvatarUrl(session.email ?? session.name ?? 'driver', 128) };
  const profileDisplayName = useMemo(() => {
    if (session.name && session.name.trim().length > 0) {
      return session.name.toUpperCase();
    }
    if (session.email) {
      const handle = session.email.split('@')[0];
      return handle.toUpperCase();
    }
    return 'CAMPUSRIDE';
  }, [session.name, session.email]);
  const avatarActionsDisabled = updatingAvatar || isSavingAvatar;
  const canRemoveAvatar = !!session.avatarUrl;
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

  const profileHeroStyle = useMemo(
    () => [
      styles.profileHero,
      !(isDesktop || isTablet) && styles.profileHeroStacked,
    ],
    [isDesktop, isTablet]
  );

  const profileActions = useMemo(
    () => [
      {
        key: 'edit',
        label: 'Modifier le profil',
        icon: 'pencil.tip.crop.circle',
        image: require('@/assets/images/crayon.png'),
        tint: 'rgba(255,131,71,0.15)',
        iconColor: Colors.primary,
        onPress: handleEditProfile,
      },
      {
        key: 'settings',
        label: 'Paramètres',
        icon: 'gearshape.fill',
        image: require('@/assets/images/Paramètres.png'),
        tint: 'rgba(58,76,110,0.12)',
        iconColor: Colors.gray600,
        onPress: handleOpenSettings,
      },
      {
        key: 'wallet',
        label: 'Wallet',
        icon: 'wallet.pass.fill',
        image: require('@/assets/images/Wallet.png'),
        tint: 'rgba(191,157,117,0.18)',
        iconColor: '#B48A61',
        onPress: handleOpenWallet,
      },
      {
        key: 'help',
        label: 'Aide',
        icon: 'questionmark.circle',
        tint: 'rgba(241,107,107,0.15)',
        iconColor: Colors.danger,
        onPress: handleOpenHelp,
      },
    ],
    [handleEditProfile, handleOpenSettings, handleOpenWallet, handleOpenHelp]
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

  const onSignOut = useCallback(() => {
    Auth.signOut();
    router.replace('/welcome');
  }, [router]);

  return (
    <AppBackground style={styles.screen}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={scrollContentStyle}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="always"
        >
        <GradientBackground colors={Gradients.ocean} style={profileHeroStyle}>
          <View style={styles.profileHeroCard}>
            <View style={styles.profileAvatarSection}>
              <Pressable
                style={styles.profileAvatarPressable}
                onPress={changeAvatar}
                onLongPress={session.avatarUrl ? onRemoveAvatar : undefined}
                accessibilityRole="button"
              >
                <Image source={avatarSource} style={styles.profileAvatarImage} />
                <View style={styles.profileAvatarBadge}>
                  {updatingAvatar || isSavingAvatar ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <IconSymbol name="camera.fill" size={16} color="#FFFFFF" />
                  )}
                </View>
              </Pressable>
              <Text style={styles.profileHeroName}>{profileDisplayName}</Text>
              <View style={styles.profilePhotoActions}>
                <Pressable
                  style={styles.photoLink}
                  onPress={changeAvatar}
                  disabled={avatarActionsDisabled}
                  accessibilityRole="button"
                >
                  <IconSymbol
                    name="arrow.triangle.2.circlepath.camera"
                    size={14}
                    color={avatarActionsDisabled ? C.gray400 : C.primary}
                  />
                  <Text
                    style={[
                      styles.photoLinkText,
                      avatarActionsDisabled && styles.photoLinkTextDisabled,
                    ]}
                  >
                    Mettre à jour ma photo
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.photoDeleteLink}
                  onPress={onRemoveAvatar}
                  disabled={!canRemoveAvatar || avatarActionsDisabled}
                  accessibilityRole="button"
                >
                  <IconSymbol
                    name="trash"
                    size={14}
                    color={!canRemoveAvatar || avatarActionsDisabled ? C.gray400 : C.danger}
                  />
                  <Text
                    style={[
                      styles.photoDeleteText,
                      (!canRemoveAvatar || avatarActionsDisabled) && styles.photoDeleteTextDisabled,
                    ]}
                  >
                    Supprimer la photo
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.profileActionsList}>
              {profileActions.map((action) => (
                <Pressable
                  key={action.key}
                  style={styles.profileActionRow}
                  onPress={action.onPress}
                  accessibilityRole="button"
                >
                  <View style={[styles.profileActionIcon, { backgroundColor: action.tint }]}>
                    {action.image ? (
                      <Image source={action.image} style={styles.profileActionImage} />
                    ) : (
                      <IconSymbol name={action.icon} size={18} color={action.iconColor} />
                    )}
                  </View>
                  <Text style={styles.profileActionLabel}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.driverModeButton}
              onPress={openDriverVerification}
              accessibilityRole="button"
            >
              <IconSymbol name="steeringwheel" size={18} color="#FFFFFF" />
              <Text style={styles.driverModeText}>Passer en mode conducteur</Text>
              <IconSymbol name="chevron.right" size={16} color="#FFFFFF" />
            </Pressable>
            <Pressable
              style={[styles.photoDeleteLink, styles.logoutInline]}
              onPress={onSignOut}
              accessibilityRole="button"
              hitSlop={12}
            >
              <IconSymbol name="arrow.right.to.line.alt" size={14} color={C.danger} />
              <Text style={styles.logoutInlineText}>Se déconnecter</Text>
            </Pressable>
          </View>
        </GradientBackground>

        </ScrollView>

      <AvatarCropperModal
        uri={cropSourceUri}
        visible={!!cropSourceUri}
        onCancel={onCropperCancel}
        onConfirm={onCropperConfirm}
      />

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
  profileHero: {
    borderRadius: 36,
    padding: 2,
    backgroundColor: 'transparent',
    width: '100%',
  },
  profileHeroStacked: {
    marginBottom: Spacing.lg,
  },
  profileHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: Spacing.xl,
    gap: Spacing.lg,
    width: '100%',
    shadowColor: '#310F4C',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  profileAvatarSection: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  profileAvatarPressable: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  profileAvatarImage: {
    width: '100%',
    height: '100%',
  },
  profileAvatarBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F1784A',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  profileHeroName: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
    textAlign: 'center',
  },
  profilePhotoActions: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  photoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  photoLinkText: {
    fontWeight: '700',
    color: C.primary,
    fontSize: 13,
  },
  photoLinkTextDisabled: {
    color: C.gray400,
  },
  photoDeleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  photoDeleteText: {
    fontWeight: '600',
    color: C.danger,
  },
  photoDeleteTextDisabled: {
    color: C.gray400,
  },
  profileActionsList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8EAF4',
  },
  profileActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 14,
  },
  profileActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileActionImage: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  profileActionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: C.ink,
  },
  logoutInline: {
    marginTop: Spacing.xs,
    alignSelf: 'center',
  },
  logoutInlineText: {
    fontWeight: '700',
    color: C.danger,
    fontSize: 13,
  },
  driverModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    backgroundColor: C.primary,
    borderRadius: 36,
    paddingHorizontal: 24,
    paddingVertical: 16,
    marginTop: Spacing.sm,
  },
  driverModeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  driverModeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
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
  logoutButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: 'rgba(241,107,107,0.4)',
    backgroundColor: 'rgba(241,107,107,0.08)',
  },
  logoutButtonText: {
    color: C.danger,
    fontWeight: '700',
    fontSize: 15,
  },
  logoutHint: {
    color: C.gray600,
    fontSize: 12,
  },
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
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
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
  checklistLabel: { color: C.gray700, fontSize: 13, flex: 1, fontWeight: '600' },
  checklistLabelDone: { textDecorationLine: 'line-through', color: C.gray500 },
  checklistHint: { color: C.gray500, fontSize: 12, marginTop: 2 },

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

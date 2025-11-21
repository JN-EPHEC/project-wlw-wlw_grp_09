import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { RideMap } from '../../components/ride-map';
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
import type { PaymentMethod } from '@/app/services/payments';
import { getWallet, subscribeWallet, type WalletSnapshot } from '@/app/services/wallet';
import {
  subscribeDriverReviews,
  subscribeRideReviews,
  type Review,
} from '@/app/services/reviews';
import { evaluateRewards } from '@/app/services/rewards';
import { Colors, Shadows, Spacing, Radius, Typography } from '@/app/ui/theme';
import { getAvatarColor, getAvatarUrl } from '@/app/ui/avatar';
import {
  submitPassengerFeedback,
  subscribeDriverFeedback,
  type PassengerFeedback,
} from '@/app/services/passenger-feedback';
import { createReport } from '@/app/services/reports';
import { GradientButton } from '@/components/ui/gradient-button';

const C = Colors;
const S = Shadows;

export default function RideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAuthSession();
  const [ride, setRide] = useState<Ride | null>(() => (id ? getRide(String(id)) ?? null : null));
  const [driverCompleted, setDriverCompleted] = useState(0);
  const [driverRating, setDriverRating] = useState<{ average: number; count: number }>({
    average: 0,
    count: 0,
  });
  const [wallet, setWallet] = useState<WalletSnapshot | null>(() =>
    session.email ? getWallet(session.email) : null
  );
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [driverFeedback, setDriverFeedback] = useState<PassengerFeedback[]>([]);
  const [feedbackTarget, setFeedbackTarget] = useState<{ email: string; alias: string } | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(4.5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

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


  useEffect(() => {
    if (!ride?.id || !session.email) {
      setMyReview(null);
      return;
    }
    const unsubscribe = subscribeRideReviews(ride.id, (items) => {
      const mine = items.find((review) => review.passengerEmail === session.email) ?? null;
      setMyReview(mine);
    });
    return unsubscribe;
  }, [ride?.id, session.email]);

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
  const reward = useMemo(
    () =>
      evaluateRewards({
        completedRides: driverCompleted,
        averageRating: driverRating.average,
        reviewCount: driverRating.count,
      }),
    [driverCompleted, driverRating.average, driverRating.count]
  );
  const hasReview = !!myReview;
  const reviewDisabled = !departed || !amPassenger;
  const reviewLabel = hasReview ? 'Mettre à jour mon avis' : 'Laisser un avis';
  const reviewHint = !amPassenger
    ? 'Seuls les passagers peuvent noter ce trajet.'
    : !departed
    ? 'Disponible une fois le trajet terminé.'
    : '';
  const walletBalance = wallet?.balance ?? 0;
  const rideCredits = wallet?.rideCredits ?? 0;
  const hasWalletBalance = ride ? walletBalance >= ride.price : false;
  const hasRideCredits = rideCredits > 0;

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

  const confirmReservation = (method: PaymentMethod) => {
    if (!session.email || !ride) return router.push('/sign-up');
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
          return Alert.alert('Solde insuffisant', 'Recharge ton wallet ou sélectionne un autre moyen de paiement.');
        case 'PAYMENT_PASS':
          return Alert.alert('Crédits épuisés', 'Achète un nouveau pack CampusRide pour continuer à en profiter.');
        default:
          return Alert.alert('Paiement impossible', 'Le paiement n’a pas abouti. Réessaie dans un instant.');
      }
    }
    const methodLabel =
      method === 'wallet'
        ? 'via ton wallet'
        : method === 'pass'
        ? 'avec un crédit CampusRide'
        : 'par carte bancaire';
    Alert.alert(
      'Réservation confirmée ✅',
      `Paiement ${methodLabel} accepté. Tu recevras un rappel avant le départ.`
    );
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
      'Sélectionne ton mode de paiement pour valider ce trajet.',
      [
        { text: 'Annuler', style: 'cancel' },
        ...options.map((option) => ({
          text: option.label,
          onPress: () => confirmReservation(option.method),
        })),
      ]
    );
  };

  const onCancel = () => {
    if (!session.email) return;
    Alert.alert(
      'Annuler ma réservation',
      'Confirme l’annulation ? Le conducteur sera notifié immédiatement.',
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

  const onOpenReview = () => {
    router.push({ pathname: '/review/[rideId]', params: { rideId: ride.id } });
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

  const reportPassenger = (passengerEmail: string) => {
    if (!session.email || !ride) return;
    const alias = formatAlias(passengerEmail);
    const reasons = [
      { label: 'Comportement inapproprié', value: 'inappropriate-behaviour' },
      { label: 'Absence au rendez-vous', value: 'no-show' },
      { label: 'Annulation tardive', value: 'late-cancellation' },
      { label: 'Autre', value: 'other' },
    ];
    Alert.alert(
      `Signaler ${alias}`,
      'Choisis la raison du signalement.',
      [
        { text: 'Annuler', style: 'cancel' },
        ...reasons.map((reason) => ({
          text: reason.label,
          onPress: () =>
            createReport({
              reporterEmail: session.email!,
              targetEmail: passengerEmail,
              rideId: ride.id,
              reason: reason.value as any,
              metadata: { context: 'driver-report' },
            }),
        })),
      ]
    );
  };

  const reportDriver = () => {
    if (!session.email || !ride) return;
    const reasons = [
      { label: 'Comportement inapproprié', value: 'inappropriate-behaviour' },
      { label: 'Conduite dangereuse', value: 'unsafe-driving' },
      { label: 'Retard important', value: 'late-cancellation' },
      { label: 'Autre', value: 'other' },
    ];
    Alert.alert(
      'Signaler ce conducteur',
      'Choisis la raison du signalement.',
      [
        { text: 'Annuler', style: 'cancel' },
        ...reasons.map((reason) => ({
          text: reason.label,
          onPress: () =>
            createReport({
              reporterEmail: session.email!,
              targetEmail: ride.ownerEmail,
              rideId: ride.id,
              reason: reason.value as any,
              metadata: { context: 'passenger-report' },
            }),
        })),
      ]
    );
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.header}> 
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </Pressable>
        <Text style={styles.title}>Trajet vers {ride.destination}</Text>
        <Text style={styles.subtitle}>
          {ride.depart} • {ride.time} • {departureDayLabel}
        </Text>
      </View>

      <View style={styles.driverCard}>
        <View style={[styles.driverAvatar, { backgroundColor: driverAvatarBg }]}>
          <Image source={{ uri: driverAvatarUri }} style={styles.driverAvatarImage} />
        </View>
        <View style={styles.driverInfo}>
          <Text style={styles.driverName}>{ride.driver}</Text>
          <View style={styles.driverRatingRow}>
            <RatingStars value={driverRating.count > 0 ? driverRating.average : 0} size={20} editable={false} />
            <Text style={styles.driverRatingText}>{driverMetaLabel}</Text>
          </View>
          <Text style={styles.driverMeta}>{driverCompletedLabel}</Text>
          {reward.badgeLabel ? (
            <View style={styles.driverBadge}>
              <Text style={styles.driverBadgeText}>{reward.badgeLabel}</Text>
            </View>
          ) : null}
          {reward.highlight ? <Text style={styles.driverHighlight}>{reward.highlight}</Text> : null}
          <Pressable style={styles.driverReviewsLink} onPress={() => router.push({ pathname: '/reviews/[email]', params: { email: ride.ownerEmail } })}>
            <Text style={styles.driverReviewsText}>Voir les avis du conducteur</Text>
          </Pressable>
        </View>
        {!amOwner ? (
          <Pressable style={styles.driverReportButton} onPress={reportDriver}>
            <Text style={styles.driverReportText}>Signaler ce conducteur</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Conducteur</Text>
          <Text style={styles.infoValue}>{ride.driver}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Plaque</Text>
          <Text style={styles.infoValue}>{ride.plate}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Départ</Text>
          <Text style={styles.infoValue}>{ride.depart}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Destination</Text>
          <Text style={styles.infoValue}>{ride.destination}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Tarif indicatif</Text>
          <Text style={styles.infoValue}>€{ride.price.toFixed(2)} / passager</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Places</Text>
          <Text style={styles.infoValue}>
            {ride.passengers.length}/{ride.seats} ({seatsLeft}{' '}
            restante{seatsLeft > 1 ? 's' : ''})
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Statut</Text>
          <Text style={styles.infoValue}>{departed ? 'Trajet terminé' : seatsLeft > 0 ? 'Places disponibles' : 'Complet'}</Text>
        </View>
      </View>

      <View style={styles.mapCard}>
        <RideMap rides={[ride]} />
      </View>

      <View style={styles.actions}>
        {departed ? (
          <Text style={styles.statusText}>Ce trajet est terminé.</Text>
        ) : amOwner ? (
          <>
            <GradientButton
              title="Modifier"
              size="sm"
              variant="lavender"
              fullWidth
              style={styles.actionButton}
              onPress={() => router.push({ pathname: '/explore', params: { edit: ride.id } })}
              accessibilityRole="button"
            />
            <GradientButton
              title="Supprimer"
              size="sm"
              variant="danger"
              fullWidth
              style={styles.actionButton}
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
            style={styles.actionButton}
            onPress={onCancel}
            accessibilityRole="button"
          />
        ) : (
          <GradientButton
            title={seatsLeft > 0 ? 'Réserver ma place' : 'Complet'}
            size="sm"
            variant="cta"
            fullWidth
            style={styles.actionButton}
            onPress={onReserve}
            disabled={seatsLeft <= 0}
            accessibilityRole="button"
          />
        )}
      </View>

      {session.email && (amPassenger || hasReview) ? (
        <View style={styles.reviewCard}>
          <Text style={styles.reviewTitle}>Ton avis</Text>
          <Text style={styles.reviewSubtitle}>
            {hasReview
              ? 'Merci ! Tu peux mettre à jour ton commentaire à tout moment.'
              : 'Partage ton expérience avec les prochains passagers.'}
          </Text>
          <Pressable
            style={[styles.reviewButton, reviewDisabled && styles.reviewButtonDisabled]}
            onPress={onOpenReview}
            disabled={reviewDisabled}
          >
            <Text
              style={[
                styles.reviewButtonText,
                reviewDisabled && styles.reviewButtonTextDisabled,
              ]}
            >
              {reviewDisabled ? reviewHint : reviewLabel}
            </Text>
          </Pressable>
          {!reviewDisabled && !hasReview ? (
            <Text style={styles.reviewHint}>{'Prends une minute pour laisser un commentaire détaillé.'}</Text>
          ) : reviewHint && reviewDisabled ? (
            <Text style={styles.reviewHint}>{reviewHint}</Text>
          ) : null}
          {hasReview && myReview ? (
            <View style={styles.reviewPreview}>
              <View style={styles.reviewPreviewHeader}>
                <RatingStars value={myReview.rating} size={16} editable={false} />
                <Text style={styles.reviewPreviewMeta}>
                  {myReview.rating.toFixed(1)}/5 • {new Date(myReview.updatedAt).toLocaleDateString('fr-BE', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
              </View>
              {myReview.comment ? (
                <Text style={styles.reviewPreviewText}>{myReview.comment}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.passengersCard}>
        <Text style={styles.passengerTitle}>Passagers confirmés</Text>
        {ride.passengers.length === 0 ? (
          <Text style={styles.passengerEmpty}>Personne n’a encore réservé. Sois le premier !</Text>
        ) : (
          ride.passengers.map((mail) => {
            const alias = formatAlias(mail);
            const feedback = passengerFeedbackMap.get(mail);
            const canEvaluate = amOwner && departed;
            return (
              <View key={mail} style={styles.passengerRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.passengerName}>{alias}</Text>
                  <Text style={styles.passengerMeta}>
                    {feedback
                      ? `${feedback.rating.toFixed(1)}/5 • ${new Date(feedback.updatedAt).toLocaleDateString('fr-BE', {
                          day: 'numeric',
                          month: 'short',
                        })}`
                      : 'Pas encore évalué'}
                  </Text>
                  {feedback?.comment ? (
                    <Text style={styles.passengerComment}>{feedback.comment}</Text>
                  ) : null}
                </View>
                {amOwner ? (
                  <View style={styles.passengerActions}>
                    <Pressable
                      style={[
                        styles.passengerActionPrimary,
                        !canEvaluate && styles.passengerActionDisabled,
                      ]}
                      onPress={() => openPassengerFeedbackModal(mail)}
                      disabled={!canEvaluate}
                    >
                      <Text style={styles.passengerActionPrimaryText}>
                        {feedback ? 'Modifier' : 'Noter'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.passengerActionSecondary}
                      onPress={() => reportPassenger(mail)}
                    >
                      <Text style={styles.passengerActionSecondaryText}>Signaler</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
      <Modal
        visible={!!feedbackTarget}
        animationType="slide"
        transparent
        onRequestClose={closeFeedbackModal}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={styles.modalCard}>
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
  scroll: {
    padding: Spacing.xl,
    backgroundColor: C.gray50,
    gap: Spacing.lg,
  },
  header: {
    gap: Spacing.sm,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  backButtonText: {
    color: C.secondary,
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    fontWeight: Typography.heading.fontWeight,
    color: C.ink,
    letterSpacing: Typography.heading.letterSpacing,
  },
  subtitle: {
    color: C.gray600,
    fontSize: 14,
  },
  driverCard: {
    backgroundColor: C.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.gray200,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    ...(S.card as object),
  },
  driverAvatar: {
    width: 72,
    height: 72,
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
  driverName: {
    fontSize: 18,
    fontWeight: '700',
    color: C.ink,
  },
  driverRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  driverRatingText: {
    color: C.gray600,
    fontSize: 12,
  },
  driverMeta: {
    color: C.gray600,
    fontSize: 12,
  },
  driverBadge: {
    alignSelf: 'flex-start',
    backgroundColor: C.primaryLight,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  driverBadgeText: {
    color: C.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  driverHighlight: {
    color: C.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  driverReviewsLink: { marginTop: Spacing.xs },
  driverReviewsText: { color: C.secondary, fontWeight: '700', fontSize: 12 },
  driverReportButton: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: C.danger,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  driverReportText: { color: C.danger, fontWeight: '700', fontSize: 12 },
  infoCard: {
    backgroundColor: C.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.gray200,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...(S.card as object),
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    color: C.gray600,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoValue: {
    color: C.ink,
    fontWeight: '700',
    fontSize: 15,
  },
  mapCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.gray200,
    overflow: 'hidden',
    ...(S.card as object),
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  actionButton: {
    flexGrow: 1,
    minWidth: 150,
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
  passengersCard: {
    backgroundColor: C.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.gray200,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...(S.card as object),
  },
  passengerTitle: {
    fontWeight: '700',
    color: C.ink,
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
  passengerName: { color: C.ink, fontWeight: '600' },
  passengerMeta: { color: C.gray600, fontSize: 12 },
  passengerComment: { color: C.gray700, fontSize: 13, marginTop: 4 },
  passengerActions: { gap: Spacing.xs, justifyContent: 'center' },
  passengerActionPrimary: {
    backgroundColor: C.secondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  passengerActionPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  passengerActionSecondary: {
    borderWidth: 1,
    borderColor: C.danger,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  passengerActionSecondaryText: { color: C.danger, fontWeight: '700', fontSize: 12 },
  passengerActionDisabled: { opacity: 0.4 },
  reviewCard: {
    backgroundColor: C.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.gray200,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...(S.card as object),
  },
  reviewTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: C.ink,
  },
  reviewSubtitle: {
    color: C.gray600,
    fontSize: 13,
  },
  reviewButton: {
    backgroundColor: C.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  reviewButtonDisabled: {
    backgroundColor: C.gray200,
  },
  reviewButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  reviewButtonTextDisabled: {
    color: C.gray600,
  },
  reviewHint: {
    color: C.gray500,
    fontSize: 12,
  },
  reviewPreview: {
    backgroundColor: C.gray150,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  reviewPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reviewPreviewMeta: {
    color: C.gray600,
    fontSize: 12,
  },
  reviewPreviewText: {
    color: C.gray700,
    fontSize: 13,
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(16, 32, 48, 0.55)',
    padding: Spacing.xl,
    justifyContent: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: C.card,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
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

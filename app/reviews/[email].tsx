import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';

import { ReviewCard } from '@/components/review-card';
import { PassengerFeedbackCard } from '@/components/passenger-feedback-card';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RatingStars } from '@/components/ui/rating-stars';
import { useAuthSession } from '@/hooks/use-auth-session';
import {
  respondToReview,
  submitReview,
  subscribeDriverReviews,
  type Review,
} from '@/app/services/reviews';
import {
  subscribePassengerFeedback,
  type PassengerFeedback,
} from '@/app/services/passenger-feedback';
import { createReport } from '@/app/services/reports';
import {
  Colors,
  Gradients,
  Radius,
  Shadows,
  Spacing,
  Typography,
} from '@/app/ui/theme';
import { buildSmartReplies } from '@/app/utils/ai-reply';
import { getAvatarUrl } from '@/app/ui/avatar';

const C = Colors;

export default function DriverReviewsScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const session = useAuthSession();
  const driverEmail = (email ?? '').toLowerCase();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [passengerFeedback, setPassengerFeedback] = useState<PassengerFeedback[]>([]);
  const [respondTarget, setRespondTarget] = useState<Review | null>(null);
  const [responseDraft, setResponseDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [newReviewVisible, setNewReviewVisible] = useState(false);
  const [newReviewRating, setNewReviewRating] = useState(4.5);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [newReviewError, setNewReviewError] = useState<string | null>(null);
  const [isPublishingReview, setIsPublishingReview] = useState(false);

  useEffect(() => {
    if (!driverEmail) return;
    const unsubscribe = subscribeDriverReviews(driverEmail, setReviews);
    return unsubscribe;
  }, [driverEmail]);

  useEffect(() => {
    if (!driverEmail) return;
    const unsubscribe = subscribePassengerFeedback(driverEmail, setPassengerFeedback);
    return unsubscribe;
  }, [driverEmail]);

  const driverSummary = useMemo(() => {
    if (reviews.length === 0) return { average: 0, count: 0 };
    const total = reviews.reduce((acc, review) => acc + review.rating, 0);
    const average = Math.round((total / reviews.length) * 10) / 10;
    return { average, count: reviews.length };
  }, [reviews]);

  const passengerSummary = useMemo(() => {
    if (passengerFeedback.length === 0) return { average: 0, count: 0 };
    const total = passengerFeedback.reduce((acc, entry) => acc + entry.rating, 0);
    const average = Math.round((total / passengerFeedback.length) * 10) / 10;
    return { average, count: passengerFeedback.length };
  }, [passengerFeedback]);

  const aggregatedSummary = useMemo(() => {
    const totalCount = driverSummary.count + passengerSummary.count;
    if (totalCount === 0) return { average: 0, count: 0 };
    const totalScore =
      driverSummary.average * driverSummary.count +
      passengerSummary.average * passengerSummary.count;
    const average = Math.round((totalScore / totalCount) * 10) / 10;
    return { average, count: totalCount };
  }, [driverSummary, passengerSummary]);

  const driverAlias = driverEmail
    ? (driverEmail.split('@')[0] ?? driverEmail).replace(/[._-]+/g, ' ')
    : 'Conducteur';
  const driverDisplay = driverAlias
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
  const driverAvatar = getAvatarUrl(driverEmail || driverDisplay || 'driver', 160);

  const canRespond = session.email?.toLowerCase() === driverEmail;

  const openRespondModal = (review: Review) => {
    setRespondTarget(review);
    setResponseDraft(review.response?.body ?? 'Merci pour ton avis !');
    setAiSuggestions(buildSmartReplies(review));
  };

  const closeRespondModal = () => {
    setRespondTarget(null);
    setResponseDraft('');
    setIsSubmitting(false);
    setAiSuggestions([]);
  };

  const applyAiSuggestion = (suggestion: string) => {
    setResponseDraft(suggestion);
  };

  const refreshAiSuggestions = () => {
    if (!respondTarget) return;
    setAiSuggestions(buildSmartReplies(respondTarget));
  };

  const submitResponse = () => {
    if (!respondTarget) return;
    const message = responseDraft.trim();
    if (message.length < 3) {
      Alert.alert('Réponse trop courte', 'Ajoute au moins 3 caractères.');
      return;
    }
    try {
      setIsSubmitting(true);
      respondToReview(respondTarget.id, message);
      Alert.alert('Réponse publiée', 'Ton message est visible par la communauté.');
      closeRespondModal();
    } catch (error) {
      const err = error instanceof Error ? error.message : 'Impossible de publier la réponse.';
      Alert.alert('Erreur', err);
      setIsSubmitting(false);
    }
  };

  const reportReview = (review: Review) => {
    if (!session.email) {
      router.push('/sign-up');
      return;
    }
    const reasons = [
      { label: 'Contenu inapproprié', value: 'inappropriate-behaviour' },
      { label: 'Spam / fake', value: 'other' },
    ];
    Alert.alert(
      'Signaler cet avis',
      'Sélectionne la raison du signalement.',
      [
        { text: 'Annuler', style: 'cancel' },
        ...reasons.map((reason) => ({
          text: reason.label,
          onPress: () =>
            createReport({
              reporterEmail: session.email!,
              targetEmail: review.passengerEmail,
              rideId: review.rideId,
              reason: reason.value as any,
              metadata: { context: 'driver-review', driverEmail },
            }),
        })),
      ]
    );
  };

  const openNewReviewModal = () => {
    if (!session.email) {
      router.push('/sign-up');
      return;
    }
    setNewReviewVisible(true);
    setNewReviewRating(4.5);
    setNewReviewComment('');
    setNewReviewError(null);
  };

  const closeNewReviewModal = () => {
    setNewReviewVisible(false);
    setNewReviewComment('');
    setNewReviewError(null);
    setIsPublishingReview(false);
  };

  const submitNewReview = () => {
    if (!session.email) {
      router.push('/sign-up');
      return;
    }
    if (newReviewRating < 1) {
      setNewReviewError('Choisis une note entre 1 et 5.');
      return;
    }
    const trimmed = newReviewComment.trim();
    if (trimmed.length > 0 && trimmed.length < 5) {
      setNewReviewError('Ajoute au moins 5 caractères ou laisse vide.');
      return;
    }
    try {
      setIsPublishingReview(true);
      submitReview({
        rideId: `manual-${Date.now()}`,
        driverEmail,
        driverName: driverDisplay,
        passengerEmail: session.email,
        passengerName: session.name ?? undefined,
        rating: newReviewRating,
        comment: trimmed,
      });
      Alert.alert('Merci pour ton avis', 'Ton expérience vient d’être partagée à la communauté.');
      closeNewReviewModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de publier l’avis.';
      Alert.alert('Erreur', message);
      setIsPublishingReview(false);
    }
  };

  const reportDriver = () => {
    if (!session.email) {
      router.push('/sign-up');
      return;
    }
    Alert.alert(
      'Signaler ce conducteur',
      'Explique brièvement ce qui s’est passé.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Signaler',
          style: 'destructive',
          onPress: () =>
            createReport({
              reporterEmail: session.email!,
              targetEmail: driverEmail,
              reason: 'inappropriate-behaviour',
              metadata: { context: 'driver-profile' },
            }),
        },
      ]
    );
  };

  const overviewStats = [
    {
      label: 'Note globale',
      value: aggregatedSummary.count > 0 ? `${aggregatedSummary.average.toFixed(1)}/5` : '—',
    },
    {
      label: 'Avis conducteur',
      value: driverSummary.count,
    },
    {
      label: 'Avis passager',
      value: passengerSummary.count,
    },
  ];

  return (
    <AppBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
        <GradientBackground colors={Gradients.background} style={styles.hero}>
          <View style={styles.heroNav}>
            <Pressable style={styles.backPill} onPress={() => router.back()}>
              <IconSymbol name="chevron.left" size={18} color={Colors.white} />
              <Text style={styles.backText}>Retour</Text>
            </Pressable>
          </View>
          <View style={styles.heroContent}>
            <Image source={{ uri: driverAvatar }} style={styles.heroAvatar} />
            <View style={styles.heroInfo}>
              <Text style={styles.heroTitle}>{driverDisplay}</Text>
              <Text style={styles.heroSubtitle}>{driverEmail || 'Email indisponible'}</Text>
              <View style={styles.heroRatingRow}>
                <RatingStars value={aggregatedSummary.average} size={20} />
                <Text style={styles.heroRatingValue}>
                  {aggregatedSummary.count > 0
                    ? `${aggregatedSummary.average.toFixed(1)}/5 • ${aggregatedSummary.count} avis`
                    : 'Aucun avis pour le moment.'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.heroActions}>
            <Pressable
              style={[
                styles.heroPrimaryButton,
                !session.email && styles.heroPrimaryButtonDisabled,
              ]}
              onPress={session.email ? openNewReviewModal : () => router.push('/sign-up')}
            >
              <Text style={styles.heroPrimaryText}>
                {session.email ? 'Ajouter un avis' : 'Connecte-toi pour noter'}
              </Text>
            </Pressable>
            <Pressable style={styles.heroSecondaryButton} onPress={reportDriver}>
              <IconSymbol name="exclamationmark.triangle" size={16} color={Colors.primary} />
              <Text style={styles.heroSecondaryText}>Signaler</Text>
            </Pressable>
          </View>
        </GradientBackground>

        <View style={styles.statsRow}>
          {overviewStats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Expérience en tant que conducteur</Text>
              <Text style={styles.sectionSubtitle}>
                {driverSummary.count > 0
                  ? `${driverSummary.average.toFixed(1)}/5 • ${driverSummary.count} avis`
                  : 'Pas encore de note côté conducteur'}
              </Text>
            </View>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{driverSummary.count}</Text>
            </View>
          </View>
          <View style={styles.sectionBody}>
            {reviews.length > 0 ? (
              reviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  onRespond={canRespond ? openRespondModal : undefined}
                  onReport={reportReview}
                />
              ))
            ) : (
              <Text style={styles.empty}>Ce conducteur n’a pas encore reçu d’avis.</Text>
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Fiabilité en tant que passager</Text>
              <Text style={styles.sectionSubtitle}>
                {passengerSummary.count > 0
                  ? `${passengerSummary.average.toFixed(1)}/5 • ${passengerSummary.count} avis`
                  : 'Pas encore d’avis côté passager'}
              </Text>
            </View>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{passengerSummary.count}</Text>
            </View>
          </View>
          <View style={styles.sectionBody}>
            {passengerFeedback.length > 0 ? (
              passengerFeedback.map((entry) => (
                <PassengerFeedbackCard
                  key={entry.id}
                  feedback={entry}
                  onReport={(feedback) => {
                    if (!session.email) {
                      router.push('/sign-up');
                      return;
                    }
                    createReport({
                      reporterEmail: session.email,
                      targetEmail: feedback.driverEmail,
                      rideId: feedback.rideId,
                      reason: 'inappropriate-behaviour',
                      metadata: { context: 'passenger-feedback', driverEmail },
                    });
                    Alert.alert('Signalement envoyé', 'Notre équipe va analyser cet avis.');
                  }}
                />
              ))
            ) : (
              <Text style={styles.empty}>Aucun avis laissé par les conducteurs pour ce membre.</Text>
            )}
          </View>
        </View>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={newReviewVisible}
        transparent
        animationType="fade"
        onRequestClose={closeNewReviewModal}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Partager mon avis</Text>
              <Text style={styles.modalSubtitle}>
                Donne une note à {driverDisplay} sur ton dernier trajet.
              </Text>
              <RatingStars
                value={newReviewRating}
                onChange={(value) => {
                  setNewReviewRating(value);
                  if (newReviewError) setNewReviewError(null);
                }}
                editable
                size={32}
              />
              <TextInput
                value={newReviewComment}
                onChangeText={(value) => {
                  setNewReviewComment(value);
                  if (newReviewError) setNewReviewError(null);
                }}
                placeholder="Partage ton ressenti (facultatif)…"
                placeholderTextColor={C.gray400}
                style={styles.modalInput}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              {newReviewError ? <Text style={styles.errorText}>{newReviewError}</Text> : null}
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={closeNewReviewModal}
                >
                  <Text style={styles.modalButtonSecondaryText}>Annuler</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    isPublishingReview && styles.modalButtonDisabled,
                  ]}
                  onPress={submitNewReview}
                  disabled={isPublishingReview}
                >
                  <Text style={styles.modalButtonPrimaryText}>
                    {isPublishingReview ? 'Envoi…' : 'Publier'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={!!respondTarget}
        transparent
        animationType="slide"
        onRequestClose={closeRespondModal}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                Répondre à {respondTarget?.passengerName ?? 'ce passager'}
              </Text>
              <Text style={styles.modalSubtitle}>
                Ta réponse est publique et visible par tous.
              </Text>
              <TextInput
                value={responseDraft}
                onChangeText={setResponseDraft}
                style={styles.modalInput}
                multiline
                numberOfLines={4}
                placeholder="Merci pour ton retour !"
                placeholderTextColor={C.gray400}
                textAlignVertical="top"
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
                <Pressable style={[styles.modalButton, styles.modalButtonSecondary]} onPress={closeRespondModal}>
                  <Text style={styles.modalButtonSecondaryText}>Annuler</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    isSubmitting && styles.modalButtonDisabled,
                  ]}
                  onPress={submitResponse}
                  disabled={isSubmitting}
                >
                  <Text style={styles.modalButtonPrimaryText}>
                    {isSubmitting ? 'Envoi…' : 'Publier'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    padding: Spacing.xl,
    gap: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  hero: {
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  heroNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  backText: {
    color: Colors.white,
    fontWeight: '700',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: C.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  heroContent: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  heroAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  heroInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.white,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
  },
  heroRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heroRatingValue: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
  heroActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  heroPrimaryButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  heroPrimaryButtonDisabled: {
    opacity: 0.6,
  },
  heroPrimaryText: {
    color: Colors.white,
    fontWeight: '700',
  },
  heroSecondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  heroSecondaryText: {
    color: Colors.white,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: Radius.lg,
    backgroundColor: Colors.card,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadows.card,
  },
  statValue: {
    fontWeight: '800',
    fontSize: 18,
    color: C.ink,
  },
  statLabel: {
    color: C.gray600,
    fontSize: 12,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.card,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.ink,
  },
  sectionSubtitle: {
    color: C.gray600,
    fontSize: 13,
  },
  sectionBadge: {
    borderRadius: Radius.pill,
    backgroundColor: C.gray100,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  sectionBadgeText: {
    color: C.gray700,
    fontWeight: '700',
  },
  sectionBody: {
    gap: Spacing.md,
  },
  empty: {
    color: C.gray500,
    fontSize: 14,
  },
  errorText: {
    color: C.danger,
    fontSize: 12,
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
  },
  modalSubtitle: {
    color: C.gray600,
    fontSize: 13,
  },
  modalInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.gray300,
    padding: Spacing.md,
    backgroundColor: C.gray50,
    minHeight: 120,
    color: C.ink,
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
    borderRadius: Radius.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  modalAiChipText: {
    color: C.ink,
    fontSize: 12,
    lineHeight: 18,
  },
  modalAiButton: {
    alignSelf: 'flex-start',
    backgroundColor: C.gray200,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  modalAiButtonText: { color: Colors.secondary, fontWeight: '700', fontSize: 12 },
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
  modalButtonPrimaryText: { color: '#fff', fontWeight: '700' },
  modalButtonSecondaryText: { color: C.gray600, fontWeight: '700' },
  modalButtonDisabled: { opacity: 0.6 },
});

import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { AppBackground } from '@/components/ui/app-background';
import { useAuthSession } from '@/hooks/use-auth-session';
import {
  respondToReview,
  subscribeDriverReviews,
  type Review,
} from '@/app/services/reviews';
import { createReport } from '@/app/services/reports';
import {
  Colors,
  Radius,
  Spacing,
  Typography,
} from '@/app/ui/theme';
import { buildSmartReplies } from '@/app/utils/ai-reply';

const C = Colors;

export default function DriverReviewsScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const session = useAuthSession();
  const driverEmail = (email ?? '').toLowerCase();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [respondTarget, setRespondTarget] = useState<Review | null>(null);
  const [responseDraft, setResponseDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (!driverEmail) return;
    const unsubscribe = subscribeDriverReviews(driverEmail, setReviews);
    return unsubscribe;
  }, [driverEmail]);

  const ratingSummary = useMemo(() => {
    if (reviews.length === 0) return { average: 0, count: 0 };
    const total = reviews.reduce((acc, review) => acc + review.rating, 0);
    const average = Math.round((total / reviews.length) * 10) / 10;
    return { average, count: reviews.length };
  }, [reviews]);

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

  const driverAlias = driverEmail
    ? (driverEmail.split('@')[0] ?? driverEmail).replace(/[._-]+/g, ' ')
    : 'Conducteur';
  const driverDisplay = driverAlias
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

  return (
    <AppBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.header}>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>← Retour</Text>
          </Pressable>
          <Text style={styles.title}>Avis sur {driverDisplay}</Text>
          <Text style={styles.subtitle}>
            {ratingSummary.count > 0
              ? `${ratingSummary.average.toFixed(1)}/5 • ${ratingSummary.count} avis`
              : 'Aucun avis pour le moment.'}
          </Text>
        </View>

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
        </ScrollView>
      </SafeAreaView>

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
    gap: Spacing.lg,
  },
  header: {
    gap: Spacing.sm,
  },
  backLink: {
    alignSelf: 'flex-start',
  },
  backLinkText: {
    color: C.secondary,
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: Typography.heading.letterSpacing,
  },
  subtitle: {
    color: C.gray600,
    fontSize: 14,
  },
  empty: {
    color: C.gray600,
    fontSize: 14,
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

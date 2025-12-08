import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { RatingStars } from '@/components/ui/rating-stars';
import { useAuthSession } from '@/hooks/use-auth-session';
import {
  getRide,
  hasRideDeparted,
  subscribeRides,
  type Ride,
} from '@/app/services/rides';
import {
  submitReview,
  subscribeRideReviews,
  type Review,
} from '@/app/services/reviews';
import { Colors, Radius, Spacing, Typography } from '@/app/ui/theme';

const C = Colors;

export default function ReviewRideScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const session = useAuthSession();
  const [ride, setRide] = useState<Ride | null>(() =>
    rideId ? getRide(String(rideId)) ?? null : null
  );
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [existingReview, setExistingReview] = useState<Review | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);

  useEffect(() => {
    if (!rideId) return;
    const unsubscribe = subscribeRides((rides) => {
      const next = rides.find((item) => item.id === rideId) ?? null;
      setRide(next);
    });
    return unsubscribe;
  }, [rideId]);

  useEffect(() => {
    if (!rideId || !session.email) {
      setExistingReview(null);
      return;
    }
    const unsubscribe = subscribeRideReviews(rideId, (items) => {
      const mine = items.find((review) => review.passengerEmail === session.email) ?? null;
      if (!mine) {
        setExistingReview(null);
        return;
      }
      setExistingReview(mine);
      setRating(mine.rating);
      setComment(mine.comment);
      setRatingError(null);
    });
    return unsubscribe;
  }, [rideId, session.email]);

  const departed = useMemo(() => (ride ? hasRideDeparted(ride) : false), [ride]);

  const onSubmit = () => {
    if (!rideId || !ride) {
      return Alert.alert('Trajet introuvable', 'Impossible de retrouver ce trajet.');
    }
    if (!session.email) {
      router.push('/sign-up');
      return;
    }
    if (rating < 0.5) {
      setRatingError('Sélectionne une note entre 1 et 5.');
      return;
    }
    if (!departed) {
      return Alert.alert('Trajet non terminé', 'Tu pourras laisser un avis une fois le trajet terminé.');
    }
    const trimmed = comment.trim();
    if (trimmed.length > 0 && trimmed.length < 5) {
      setError('Ajoute au moins 5 caractères ou laisse le champ vide.');
      return;
    }
    try {
      setSubmitting(true);
      submitReview({
        rideId,
        driverEmail: ride.ownerEmail,
        driverName: ride.driver,
        passengerEmail: session.email,
        passengerName: session.name ?? undefined,
        rating,
        comment: trimmed,
      });
      Alert.alert('Avis envoyé', 'Ton retour aide la communauté CampusRide.', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Impossible d’enregistrer ton avis pour le moment.';
      Alert.alert('Erreur', message);
    } finally {
      setSubmitting(false);
    }
  };

  const onChangeComment = (value: string) => {
    if (error) setError(null);
    setComment(value);
  };

  const onChangeRating = (value: number) => {
    if (ratingError) setRatingError(null);
    setRating(value);
  };

  if (!rideId) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Aucun trajet sélectionné</Text>
            <Text style={styles.errorSubtitle}>Reviens en arrière puis sélectionne un trajet.</Text>
            <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
              <Text style={styles.secondaryButtonText}>Retour</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </AppBackground>
    );
  }

  if (!ride) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Trajet introuvable</Text>
            <Text style={styles.errorSubtitle}>
              Ce trajet a peut-être été supprimé par le conducteur.
            </Text>
            <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
              <Text style={styles.secondaryButtonText}>Retour</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </AppBackground>
    );
  }

  if (!session.email) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Connecte-toi pour noter</Text>
            <Text style={styles.errorSubtitle}>
              Tu dois avoir un compte CampusRide pour laisser un avis sur un conducteur.
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/sign-up')}>
              <Text style={styles.primaryButtonText}>Créer mon compte</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </AppBackground>
    );
  }

  return (
    <AppBackground>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Noter {ride.driver}</Text>
            <Text style={styles.subtitle}>
              Partage ton expérience sur le trajet {ride.depart} → {ride.destination}.
            </Text>
          </View>

          <View style={styles.rideCard}>
            <Text style={styles.rideMeta}>
              Départ {ride.depart} • {new Date(ride.departureAt).toLocaleDateString('fr-BE', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </Text>
            <Text style={styles.rideMeta}>Heure {ride.time}</Text>
            <Text style={styles.rideMeta}>Plaque {ride.plate}</Text>
          </View>

          {existingReview ? (
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerTitle}>Tu as déjà noté ce trajet</Text>
              <Text style={styles.infoBannerText}>
                Modifie ton avis si tu souhaites ajouter des précisions.
              </Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ta note</Text>
            <RatingStars value={rating} editable onChange={onChangeRating} size={32} />
            <Text style={styles.sectionHint}>
              {rating >= 0.5
                ? `${rating.toFixed(1)}/5 • 1 = trajet à améliorer, 5 = expérience parfaite`
                : 'Choisis entre 1 et 5 étoiles'}
            </Text>
            {ratingError ? <Text style={styles.errorText}>{ratingError}</Text> : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ton commentaire (facultatif)</Text>
            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              placeholder="Parle de la ponctualité, de l’ambiance, de la conduite..."
              placeholderTextColor={C.gray400}
              value={comment}
              onChangeText={onChangeComment}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              (submitting || rating < 0.5) && styles.buttonDisabled,
            ]}
            onPress={onSubmit}
            disabled={submitting || rating < 0.5}
          >
            <Text style={styles.primaryButtonText}>
              {submitting
                ? 'Envoi en cours…'
                : existingReview
                ? 'Mettre à jour mon avis'
                : 'Publier mon avis'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  title: {
    color: C.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: Typography.heading.letterSpacing,
  },
  subtitle: {
    color: C.gray600,
    fontSize: 14,
    lineHeight: 20,
  },
  rideCard: {
    backgroundColor: C.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: C.gray200,
    gap: Spacing.xs,
  },
  rideMeta: {
    color: C.gray600,
    fontSize: 13,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    color: C.ink,
    fontWeight: '700',
    fontSize: 16,
  },
  sectionHint: {
    color: C.gray500,
    fontSize: 12,
  },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.gray300,
    backgroundColor: C.gray50,
    padding: Spacing.md,
    minHeight: 140,
    fontSize: 14,
    color: C.ink,
    lineHeight: 20,
  },
  inputError: {
    borderColor: C.danger,
  },
  errorText: {
    color: C.danger,
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: C.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: C.gray50,
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    marginTop: Spacing.lg,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: C.gray300,
  },
  secondaryButtonText: {
    color: C.gray700,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  errorTitle: {
    color: C.ink,
    fontSize: 20,
    fontWeight: '800',
  },
  errorSubtitle: {
    color: C.gray600,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  infoBanner: {
    backgroundColor: C.primaryLight,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  infoBannerTitle: {
    color: C.primaryDark,
    fontWeight: '700',
    fontSize: 13,
  },
  infoBannerText: {
    color: C.primaryDark,
    fontSize: 12,
  },
});

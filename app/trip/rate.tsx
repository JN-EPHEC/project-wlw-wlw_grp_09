import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RatingStars } from '@/components/ui/rating-stars';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { useAuthSession } from '@/hooks/use-auth-session';
import {
  listBookingsByPassenger,
  patchBooking,
  subscribeBookingsByPassenger,
  type Booking,
} from '@/app/services/booking-store';

const C = Colors;
const TAG_OPTIONS = [
  'Ponctuel',
  'Conduite agréable',
  'Voiture propre',
  'Communication',
  'Respect',
  'Sécurité',
];

const formatLongDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('fr-BE', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('fr-BE', {
    hour: '2-digit',
    minute: '2-digit',
  });

export default function TripRatingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = Array.isArray(params.bookingId) ? params.bookingId[0] : params.bookingId;
  const session = useAuthSession();
  const [bookings, setBookings] = useState<Booking[]>(() =>
    session.email ? listBookingsByPassenger(session.email) : []
  );
  const [loaded, setLoaded] = useState<boolean>(() => !session.email);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!session.email) {
      setBookings([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    const unsubscribe = subscribeBookingsByPassenger(session.email, (items) => {
      setBookings(items);
      setLoaded(true);
    });
    return unsubscribe;
  }, [session.email]);

  const booking = useMemo(
    () => (bookingId ? bookings.find((entry) => entry.id === bookingId) ?? null : null),
    [bookingId, bookings]
  );

  useEffect(() => {
    console.debug('[Rate] mounted');
  }, []);

  useEffect(() => {
    if (!bookingId) return;
    console.debug('[TripRate] open bookingId=%s', bookingId);
  }, [bookingId]);

  const seededBookingId = useRef<string | null>(null);
  useEffect(() => {
    if (!booking) return;
    const isFreshBooking = seededBookingId.current !== booking.id;
    if (isFreshBooking) {
      seededBookingId.current = booking.id;
    }
    console.debug('[TripRate] booking loaded', booking);
    setRating((prev) => prev || booking.rating || 0);
    if (isFreshBooking) {
      setComment(booking.reviewComment ?? '');
      setSelectedTags(booking.reviewTags ?? []);
    }
  }, [booking]);

  useEffect(() => {
    console.debug('[Rate] comment length', comment.length);
  }, [comment.length]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]
    );
  }, []);

  const handleCommentChange = useCallback((next: string) => {
    console.debug('[Rate] change', next.length);
    setComment(next);
  }, []);

  const handleCommentFocus = useCallback(() => {
    console.debug('[Rate] focus');
    setIsTyping(true);
  }, []);

  const handleCommentBlur = useCallback(() => {
    console.debug('[Rate] blur');
    setIsTyping(false);
  }, []);

  const handleSubmit = async () => {
    if (!bookingId || !booking || !session.email) {
      setError('Ce trajet est introuvable.');
      return;
    }
    if (rating < 1) {
      setError('Donne une note entre 1 et 5.');
      return;
    }
    setIsSaving(true);
    setError(null);
    console.debug('[TripRate] submit', {
      bookingId,
      rating,
      tagsCount: selectedTags.length,
      hasComment: Boolean(comment.trim()),
    });
    try {
      const result = patchBooking(session.email, bookingId, {
        status: 'completed',
        completedAt: Date.now(),
        rating,
        reviewComment: comment.trim() ? comment.trim() : null,
        reviewTags: selectedTags.length ? selectedTags : null,
      });
      if (!result.ok) {
        setError('Impossible d’enregistrer ton avis.');
        return;
      }
      console.debug('[TripRate] saved status=completed', { bookingId, rating });
      console.debug('[TripRate] navigate trips history');
      router.replace({ pathname: '/trips', params: { initialTab: 'history' } });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const renderContent = () => {
    if (!bookingId) {
      return (
        <CardShell>
          <Text style={styles.fallbackTitle}>Trajet introuvable</Text>
          <Text style={styles.fallbackSubtitle}>Aucun identifiant fourni.</Text>
        </CardShell>
      );
    }
    if (!loaded) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={C.white} />
          <Text style={styles.loadingLabel}>Préparation de ton avis…</Text>
        </View>
      );
    }
    if (!booking) {
      return (
        <CardShell>
          <Text style={styles.fallbackTitle}>Trajet introuvable</Text>
          <Text style={styles.fallbackSubtitle}>
            Cette réservation n’est plus disponible dans ton historique.
          </Text>
        </CardShell>
      );
    }
    const departureTimestamp = booking.departureAt ?? booking.createdAt ?? Date.now();
    const amountPaid = booking.pricePaid ?? booking.amount;
    const meetingPoint = booking.meetingPoint ?? booking.depart;
    return (
      <CardShell>
        <View style={styles.header}>
          <Text style={styles.cardTitle}>Évalue ton conducteur</Text>
          <Text style={styles.cardSubtitle}>
            {booking.depart} → {booking.destination}
          </Text>
        </View>
        <View style={styles.tripSummary}>
          <View style={styles.summaryRow}>
            <IconSymbol name="person.crop.circle" size={18} color={C.primary} />
            <View style={styles.summaryText}>
              <Text style={styles.summaryLabel}>Conducteur</Text>
              <Text style={styles.summaryValue}>{booking.driver}</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <IconSymbol name="location.fill" size={18} color={C.secondary} />
            <View style={styles.summaryText}>
              <Text style={styles.summaryLabel}>Itinéraire</Text>
              <Text style={styles.summaryValue}>
                {booking.depart} → {booking.destination}
              </Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <IconSymbol name="mappin.and.ellipse" size={18} color={C.accent} />
            <View style={styles.summaryText}>
              <Text style={styles.summaryLabel}>Point de rencontre</Text>
              <Text style={styles.summaryValue}>{meetingPoint}</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <IconSymbol name="clock" size={18} color={C.gray500} />
            <View style={styles.summaryText}>
              <Text style={styles.summaryLabel}>Date & heure</Text>
              <Text style={styles.summaryValue}>
                {formatLongDate(departureTimestamp)} · {formatTime(departureTimestamp)}
              </Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <IconSymbol name="creditcard.fill" size={18} color={C.secondaryDark} />
            <View style={styles.summaryText}>
              <Text style={styles.summaryLabel}>Montant payé</Text>
              <Text style={styles.summaryValue}>€{amountPaid.toFixed(2)}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.sectionLabel}>Note (obligatoire)</Text>
        <RatingStars value={rating} onChange={setRating} size={36} editable />
        <Text style={styles.sectionLabel}>Commentaire (facultatif)</Text>
        <TextInput
          style={styles.commentInput}
          multiline
          numberOfLines={4}
          placeholder="Écris ton commentaire ici..."
          placeholderTextColor={C.gray400}
          value={comment}
          onChangeText={handleCommentChange}
          blurOnSubmit={false}
          returnKeyType="default"
          autoFocus={false}
          importantForAutofill="no"
          textAlignVertical="top"
          onFocus={handleCommentFocus}
          onBlur={handleCommentBlur}
        />
        <Text style={styles.sectionLabel}>Tags rapides</Text>
        <View style={styles.tagsRow}>
          {TAG_OPTIONS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <Pressable
                key={tag}
                onPress={() => toggleTag(tag)}
                style={[
                  styles.tag,
                  active ? styles.tagActive : styles.tagInactive,
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.tagText, active && styles.tagTextActive]}>{tag}</Text>
              </Pressable>
            );
          })}
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <GradientButton
          title={isSaving ? 'Enregistrement…' : 'Envoyer mon avis'}
          variant="cta"
          fullWidth
          disabled={isSaving || rating < 1}
          onPress={handleSubmit}
          accessibilityRole="button"
        >
          {isSaving ? <ActivityIndicator color="#fff" /> : null}
        </GradientButton>
        <Pressable style={styles.cancelButton} onPress={handleCancel} accessibilityRole="button">
          <Text style={styles.cancelText}>Annuler</Text>
        </Pressable>
      </CardShell>
    );
  };

  const scrollStyle = Platform.OS === 'web'
    ? [{ flex: 1 }, { overflowY: 'auto' as const, pointerEvents: 'auto' }]
    : { flex: 1 };

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          style={scrollStyle}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.backRow}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityRole="button"
              disabled={isTyping}
              pointerEvents={isTyping ? 'none' : 'auto'}
            >
              <IconSymbol name="chevron.left" size={20} color={C.white} />
            </Pressable>
            <Text style={styles.pageTitle}>Trajet terminé</Text>
          </View>
          {renderContent()}
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: Spacing.lg,
  },
  scroll: {
    flexGrow: 1,
    gap: Spacing.lg,
    pointerEvents: 'auto',
    paddingBottom: Spacing.xl,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    color: C.white,
    fontSize: 20,
    fontWeight: '700',
  },
  cardWrapper: {
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    position: 'relative',
    ...Shadows.card,
  },
  cardBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  cardContent: {
    padding: Spacing.xl,
    gap: Spacing.md,
    pointerEvents: 'auto',
    position: 'relative',
    zIndex: 1,
  },
  tripSummary: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    backgroundColor: C.gray50,
    gap: Spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  summaryText: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 10,
    color: C.gray500,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 14,
    color: C.ink,
    fontWeight: '600',
  },
  header: {
    gap: Spacing.xs,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
  },
  cardSubtitle: {
    fontSize: 14,
    color: C.gray500,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: C.gray500,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    minHeight: 120,
    backgroundColor: 'rgba(255,255,255,0.92)',
    position: 'relative',
    zIndex: 10,
    pointerEvents: 'auto',
    width: '100%',
    textAlignVertical: 'top',
    color: C.ink,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  tagActive: {
    borderColor: C.primary,
    backgroundColor: C.primaryLight,
  },
  tagInactive: {
    borderColor: C.gray200,
    backgroundColor: C.white,
  },
  tagText: {
    fontSize: 12,
    color: C.gray600,
  },
  tagTextActive: {
    color: C.primaryDark,
    fontWeight: '700',
  },
  errorText: {
    color: C.danger,
    fontSize: 13,
    textAlign: 'center',
  },
  cancelButton: {
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: C.gray300,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    fontWeight: '700',
    color: C.gray600,
  },
  loadingState: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingLabel: {
    color: C.gray200,
    fontSize: 14,
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
    textAlign: 'center',
  },
  fallbackSubtitle: {
    color: C.gray600,
    textAlign: 'center',
  },
});

function CardShell({ children }: { children: ReactNode }) {
  return (
    <View style={styles.cardWrapper}>
      <GradientBackground
        colors={Gradients.card}
        style={styles.cardBackground}
        pointerEvents="none"
      />
      <View style={styles.cardContent}>{children}</View>
    </View>
  );
}

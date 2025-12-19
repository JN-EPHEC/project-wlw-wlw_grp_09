import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { Review } from '@/app/services/reviews';
import { Colors, Radius, Spacing } from '@/app/ui/theme';
import { RatingStars } from '@/components/ui/rating-stars';

type ReviewCardProps = {
  review: Review;
  onRespond?: (review: Review) => void;
  onReport?: (review: Review) => void;
  actionSlot?: ReactNode;
  style?: ViewStyle;
};

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('fr-BE', {
    day: 'numeric',
    month: 'short',
  });

const initial = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
};

function ReviewCardComponent({ review, onRespond, onReport, actionSlot, style }: ReviewCardProps) {
  const responseAvailable = !!review.response;
  const canRespond = !!onRespond && !responseAvailable;
  const avatarColor = review.passengerAvatarColor ?? Colors.secondaryLight;
  const canReport = !!onReport;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{initial(review.passengerName)}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.name}>{review.passengerName}</Text>
          <Text style={styles.date}>
            {formatDate(review.createdAt)} • {review.rating.toFixed(1)}/5
          </Text>
        </View>
        <RatingStars value={review.rating} size={18} editable={false} color={Colors.secondary} />
      </View>

      {review.comment ? (
        <Text style={styles.comment}>{review.comment}</Text>
      ) : (
        <Text style={styles.commentMuted}>Aucun commentaire ajouté.</Text>
      )}

      {responseAvailable ? (
        <View style={styles.responseBox}>
          <Text style={styles.responseLabel}>Réponse conducteur</Text>
          <Text style={styles.responseText}>{review.response?.body}</Text>
          <Text style={styles.responseMeta}>
            {formatDate(review.response?.createdAt ?? review.updatedAt)}
          </Text>
        </View>
      ) : null}

      {canRespond ? (
        <Pressable style={styles.respondButton} onPress={() => onRespond?.(review)}>
          <Text style={styles.respondText}>Répondre</Text>
        </Pressable>
      ) : null}

      {canReport ? (
        <Pressable style={styles.reportButton} onPress={() => onReport?.(review)}>
          <Text style={styles.reportText}>Signaler ce trajet</Text>
        </Pressable>
      ) : null}

      {actionSlot}
    </View>
  );
}

export const ReviewCard = memo(ReviewCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.gray50,
    fontWeight: '700',
    fontSize: 18,
  },
  meta: {
    flex: 1,
  },
  name: {
    color: Colors.ink,
    fontWeight: '700',
    fontSize: 16,
  },
  date: {
    color: Colors.gray600,
    fontSize: 12,
  },
  comment: {
    color: Colors.gray700,
    fontSize: 14,
    lineHeight: 20,
  },
  commentMuted: {
    color: Colors.gray500,
    fontSize: 13,
    fontStyle: 'italic',
  },
  responseBox: {
    backgroundColor: Colors.gray150,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  responseLabel: {
    color: Colors.secondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  responseText: {
    color: Colors.gray700,
    fontSize: 14,
    lineHeight: 20,
  },
  responseMeta: {
    color: Colors.gray500,
    fontSize: 11,
  },
  respondButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.secondary,
  },
  respondText: {
    color: Colors.secondary,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  reportButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dangerLight,
  },
  reportText: {
    color: Colors.danger,
    fontWeight: '700',
    fontSize: 12,
  },
});

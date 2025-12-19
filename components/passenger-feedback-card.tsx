import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PassengerFeedback } from '@/app/services/passenger-feedback';
import { Colors, Radius, Spacing } from '@/app/ui/theme';
import { RatingStars } from '@/components/ui/rating-stars';

type Props = {
  feedback: PassengerFeedback;
  onReport?: (feedback: PassengerFeedback) => void;
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

function PassengerFeedbackCardComponent({ feedback, onReport }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: feedback.driverAvatarColor }]}>
          <Text style={styles.avatarText}>{initial(feedback.driverName)}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.name}>{feedback.driverName}</Text>
          <Text style={styles.date}>
            {formatDate(feedback.createdAt)} • {feedback.rating.toFixed(1)}/5
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Conducteur</Text>
        </View>
      </View>
      <RatingStars value={feedback.rating} size={18} editable={false} color={Colors.primary} />
      {feedback.comment ? (
        <Text style={styles.comment}>{feedback.comment}</Text>
      ) : (
        <Text style={styles.commentMuted}>Aucun commentaire ajouté.</Text>
      )}

      {onReport ? (
        <Pressable style={styles.reportButton} onPress={() => onReport(feedback)}>
          <Text style={styles.reportText}>Signaler cet avis</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const PassengerFeedbackCard = memo(PassengerFeedbackCardComponent);

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
    gap: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.gray50,
    fontWeight: '700',
    fontSize: 16,
  },
  meta: {
    flex: 1,
  },
  name: {
    color: Colors.ink,
    fontWeight: '700',
    fontSize: 15,
  },
  date: {
    color: Colors.gray600,
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    backgroundColor: Colors.gray150,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.gray700,
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

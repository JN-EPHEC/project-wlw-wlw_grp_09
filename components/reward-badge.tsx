import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RewardSnapshot } from '@/app/services/rewards';
import { Colors, Radius, Spacing, Typography } from '@/app/ui/theme';

type RewardBadgeProps = {
  snapshot: RewardSnapshot;
  onPressAction?: () => void;
  actionLabel?: string;
};

function RewardBadgeComponent({ snapshot, onPressAction, actionLabel }: RewardBadgeProps) {
  const { stats, badgeLabel, highlight, withdrawalDelayDays, next } = snapshot;
  const ratingLabel = `${stats.averageRating.toFixed(1)}⭐`;
  const reviewsLabel = `${stats.reviewCount} avis`;
  const ridesLabel = `${stats.completedRides} trajets`;
  const showAction = !!onPressAction && !!actionLabel;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        {badgeLabel ? <Text style={styles.badge}>{badgeLabel}</Text> : null}
        <Text style={styles.delayLabel}>Retrait {withdrawalDelayDays} j</Text>
      </View>

      <Text style={styles.title}>{snapshot.label}</Text>
      {highlight ? <Text style={styles.highlight}>{highlight}</Text> : null}

      <View style={styles.statsRow}>
        <Text style={styles.statChip}>{ratingLabel}</Text>
        <Text style={styles.statChip}>{reviewsLabel}</Text>
        <Text style={styles.statChip}>{ridesLabel}</Text>
      </View>

      {next ? (
        <View style={styles.nextBox}>
          <Text style={styles.nextTitle}>Prochain palier : {next.label}</Text>
          <Text style={styles.nextText}>
            {next.ridesGap > 0 ? `${next.ridesGap} trajet(s)` : 'Trajets OK'} •{' '}
            {next.ratingGap > 0 ? `Note +${next.ratingGap.toFixed(1)}` : 'Note OK'} •{' '}
            {next.reviewsGap > 0 ? `${next.reviewsGap} avis` : 'Avis OK'}
          </Text>
        </View>
      ) : (
        <Text style={styles.maxedText}>Tu es au niveau maximum 👑</Text>
      )}

      {showAction ? (
        <Pressable style={styles.actionBtn} onPress={onPressAction}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const RewardBadge = memo(RewardBadgeComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    backgroundColor: Colors.primary,
    color: Colors.gray50,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  delayLabel: {
    color: Colors.primaryDark,
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: Colors.ink,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: Typography.heading.letterSpacing,
  },
  highlight: {
    color: Colors.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statChip: {
    backgroundColor: Colors.gray50,
    color: Colors.gray700,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    fontSize: 12,
    fontWeight: '700',
  },
  nextBox: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  nextTitle: {
    color: Colors.gray700,
    fontWeight: '700',
    fontSize: 13,
  },
  nextText: {
    color: Colors.gray600,
    fontSize: 12,
  },
  maxedText: {
    color: Colors.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  actionLabel: {
    color: Colors.gray50,
    fontWeight: '700',
    fontSize: 14,
  },
});

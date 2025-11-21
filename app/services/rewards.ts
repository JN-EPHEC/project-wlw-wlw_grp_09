// app/services/rewards.ts
// Calcul du système de récompenses conducteur (badges + délai de retrait réduit).

import { pushNotification } from './notifications';
import { updateWithdrawalDelay } from './wallet';

export type RewardTierId = 'none' | 'bronze' | 'silver' | 'gold';

type RewardTierDefinition = {
  id: RewardTierId;
  label: string;
  badgeLabel: string | null;
  minRating: number;
  minCompletedRides: number;
  minReviews: number;
  highlight: string | null;
  description: string;
  withdrawalDelayDays: number;
};

export type RewardStats = {
  completedRides: number;
  averageRating: number;
  reviewCount: number;
};

export type RewardSnapshot = {
  tierId: RewardTierId;
  label: string;
  badgeLabel: string | null;
  highlight: string | null;
  description: string;
  withdrawalDelayDays: number;
  stats: RewardStats;
  next?: {
    label: string;
    minRating: number;
    minCompletedRides: number;
    minReviews: number;
    ratingGap: number;
    ridesGap: number;
    reviewsGap: number;
  };
};

const REWARD_TIERS_DESC: RewardTierDefinition[] = [
  {
    id: 'gold',
    label: 'Niveau Gold',
    badgeLabel: 'Top conducteur',
    minRating: 4.8,
    minCompletedRides: 20,
    minReviews: 8,
    highlight: 'Récompense : retrait prioritaire (7 jours au lieu de 30)',
    description: 'Tu bénéficies du délai de retrait minimal et d’une visibilité maximale dans les recommandations.',
    withdrawalDelayDays: 7,
  },
  {
    id: 'silver',
    label: 'Niveau Silver',
    badgeLabel: 'Conducteur confirmé',
    minRating: 4.5,
    minCompletedRides: 10,
    minReviews: 5,
    highlight: 'Récompense : retrait accéléré (14 jours)',
    description: 'Maintiens une excellente note pour progresser vers le badge Gold.',
    withdrawalDelayDays: 14,
  },
  {
    id: 'bronze',
    label: 'Niveau Bronze',
    badgeLabel: 'Conducteur fiable',
    minRating: 4.0,
    minCompletedRides: 5,
    minReviews: 3,
    highlight: 'Récompense : retrait prioritaire (21 jours)',
    description: 'Encore quelques trajets 5⭐ pour viser le palier Silver.',
    withdrawalDelayDays: 21,
  },
  {
    id: 'none',
    label: 'Programme fidélité',
    badgeLabel: null,
    minRating: 0,
    minCompletedRides: 0,
    minReviews: 0,
    highlight: null,
    description:
      'Complète tes trajets et récolte des avis positifs pour débloquer les récompenses conducteur.',
    withdrawalDelayDays: 30,
  },
];

const REWARD_TIERS_ASC = [...REWARD_TIERS_DESC].reverse();

const normaliseEmail = (value: string) => value.trim().toLowerCase();

const meetsTier = (stats: RewardStats, tier: RewardTierDefinition) => {
  if (stats.reviewCount < tier.minReviews) return false;
  if (stats.completedRides < tier.minCompletedRides) return false;
  if (stats.averageRating < tier.minRating) return false;
  return true;
};

const resolveTier = (stats: RewardStats): RewardTierDefinition => {
  for (const tier of REWARD_TIERS_DESC) {
    if (meetsTier(stats, tier)) {
      return tier;
    }
  }
  return REWARD_TIERS_DESC[REWARD_TIERS_DESC.length - 1];
};

const computeNextTier = (current: RewardTierDefinition): RewardTierDefinition | null => {
  const index = REWARD_TIERS_ASC.findIndex((tier) => tier.id === current.id);
  if (index < 0) return null;
  return REWARD_TIERS_ASC[index + 1] ?? null;
};

const toSnapshot = (tier: RewardTierDefinition, stats: RewardStats): RewardSnapshot => {
  const nextTier = computeNextTier(tier);
  const snapshot: RewardSnapshot = {
    tierId: tier.id,
    label: tier.label,
    badgeLabel: tier.badgeLabel,
    highlight: tier.highlight,
    description: tier.description,
    withdrawalDelayDays: tier.withdrawalDelayDays,
    stats,
  };
  if (nextTier) {
    snapshot.next = {
      label: nextTier.label,
      minRating: nextTier.minRating,
      minCompletedRides: nextTier.minCompletedRides,
      minReviews: nextTier.minReviews,
      ratingGap: Math.max(0, parseFloat((nextTier.minRating - stats.averageRating).toFixed(1))),
      ridesGap: Math.max(0, nextTier.minCompletedRides - stats.completedRides),
      reviewsGap: Math.max(0, nextTier.minReviews - stats.reviewCount),
    };
  }
  return snapshot;
};

const driverTiers: Record<string, RewardTierId> = {};
const driverSnapshots: Record<string, RewardSnapshot> = {};

const tierLabelForNotification = (tier: RewardTierDefinition) => {
  switch (tier.id) {
    case 'bronze':
      return 'Badge Bronze';
    case 'silver':
      return 'Badge Silver';
    case 'gold':
      return 'Badge Gold';
    default:
      return 'Programme récompenses';
  }
};

export const getRewardSnapshot = (email: string) => {
  const key = normaliseEmail(email);
  return driverSnapshots[key] ?? null;
};

export const getAssignedTier = (email: string): RewardTierId => {
  const key = normaliseEmail(email);
  return driverTiers[key] ?? 'none';
};

export const evaluateRewards = (stats: RewardStats) => {
  const tier = resolveTier(stats);
  return toSnapshot(tier, stats);
};

export const applyRewards = (email: string, stats: RewardStats) => {
  if (!email) {
    return evaluateRewards(stats);
  }
  const key = normaliseEmail(email);
  const tier = resolveTier(stats);
  const snapshot = toSnapshot(tier, stats);
  const previousTier = driverTiers[key] ?? 'none';
  driverTiers[key] = tier.id;
  driverSnapshots[key] = snapshot;
  const delayChanged = updateWithdrawalDelay(email, tier.withdrawalDelayDays);
  const tierChanged = previousTier !== tier.id;
  if (tierChanged && tier.id !== 'none') {
    pushNotification({
      to: email,
      title: tierLabelForNotification(tier),
      body:
        tier.id === 'gold'
          ? 'Félicitations ! Tu obtiens le badge Gold et le délai de retrait minimum.'
          : `Bravo ! Tu débloques ${tier.label.toLowerCase()} : ${tier.highlight ?? 'nouvelle récompense disponible.'}`,
      metadata: {
        action: 'driver-reward',
        tier: tier.id,
        delayDays: tier.withdrawalDelayDays,
      },
    });
  }
  if (delayChanged && !tierChanged) {
    pushNotification({
      to: email,
      title: 'Retrait accéléré',
      body: `Ton délai de retrait passe à ${tier.withdrawalDelayDays} jour(s).`,
      metadata: { action: 'driver-reward', tier: tier.id, delayDays: tier.withdrawalDelayDays },
    });
  }
  return snapshot;
};

export const resetRewards = () => {
  Object.keys(driverTiers).forEach((key) => delete driverTiers[key]);
  Object.keys(driverSnapshots).forEach((key) => delete driverSnapshots[key]);
};

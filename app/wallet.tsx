import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuthSession } from '@/hooks/use-auth-session';
import {
  getWallet,
  requestMonthlyWithdrawal,
  setPayoutMethod,
  subscribeWallet,
  toggleChecklistItem,
  type WalletSnapshot,
} from '@/app/services/wallet';
import { listRidePacks, purchasePack, type RidePack } from '@/app/services/passes';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';

const C = Colors;

const FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'credit', label: 'Crédits' },
  { id: 'debit', label: 'Débits' },
] as const;

const POINT_TIERS = [
  { id: 'bronze', label: 'Badge Bronze', threshold: 300, reward: 'Retrait sous 21 jours' },
  { id: 'silver', label: 'Badge Silver', threshold: 600, reward: 'Retrait sous 14 jours' },
  { id: 'gold', label: 'Badge Gold', threshold: 900, reward: 'Retrait sous 7 jours' },
] as const;

export default function WalletScreen() {
  const session = useAuthSession();
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [showPointsDetails, setShowPointsDetails] = useState(false);

  useEffect(() => {
    if (!session.email) {
      setWallet(null);
      return;
    }
    setWallet(getWallet(session.email));
    const unsubscribe = subscribeWallet(session.email, setWallet);
    return unsubscribe;
  }, [session.email]);

  const balance = wallet?.balance ?? 0;
  const lastWithdrawalAt = wallet?.lastWithdrawalAt ?? null;
  const DAY = 1000 * 60 * 60 * 24;
  const withdrawalDelayDays = wallet?.withdrawalDelayDays ?? 30;
  const withdrawalWindowMs = withdrawalDelayDays * DAY;
  const now = Date.now();
  const packs = useMemo(() => listRidePacks(), []);
  const firstName = useMemo(() => {
    const raw = session.name ? session.name.split(' ')[0] : 'toi';
    if (!raw) return 'Toi';
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }, [session.name]);
  const walletPoints = wallet?.points ?? 0;
  const checklist = wallet?.checklist ?? [];
  const payoutLabel = wallet?.payoutMethod
    ? `${wallet.payoutMethod.brand} ••••${wallet.payoutMethod.last4}`
    : 'Aucune carte enregistrée';
  const hasPayoutMethod = !!wallet?.payoutMethod;

  const canWithdraw = useMemo(() => {
    if (!wallet) return false;
    if (wallet.balance <= 0) return false;
    if (!wallet.lastWithdrawalAt) return true;
    return now - wallet.lastWithdrawalAt >= withdrawalWindowMs;
  }, [wallet, now, withdrawalWindowMs]);

  const nextWithdrawalDate = useMemo(() => {
    if (!lastWithdrawalAt) return null;
    const next = lastWithdrawalAt + withdrawalWindowMs;
    if (next <= now) return null;
    return new Date(next);
  }, [lastWithdrawalAt, withdrawalWindowMs, now]);

  const filteredTransactions = useMemo(() => {
    if (!wallet) return [];
    if (filter === 'all') return wallet.transactions;
    return wallet.transactions.filter((tx) => tx.type === filter);
  }, [wallet, filter]);

  const { currentTier, nextTier, pointsToNext } = useMemo(() => {
    let current: (typeof POINT_TIERS)[number] | null = null;
    for (const tier of POINT_TIERS) {
      if (walletPoints >= tier.threshold) {
        current = tier;
      }
    }
    const next = POINT_TIERS.find((tier) => walletPoints < tier.threshold) ?? null;
    const remaining = next ? next.threshold - walletPoints : 0;
    return { currentTier: current, nextTier: next, pointsToNext: remaining };
  }, [walletPoints]);

  const currentTierLabel = currentTier ? currentTier.label : 'Objectif Bronze';
  const currentTierReward = currentTier
    ? currentTier.reward
    : 'Atteins 300 pts pour activer le badge Bronze.';

  const onWithdraw = () => {
    if (!session.email) return;
    const result = requestMonthlyWithdrawal(session.email);
    if (!result.ok) {
      if (result.reason === 'empty') {
        return Alert.alert('Solde insuffisant', 'Attend d’avoir réalisé des trajets rémunérés.');
      }
      if (result.reason === 'no-payout-method') {
        return Alert.alert(
          'Ajoute ta carte',
          'Enregistre ta carte bancaire pour activer le virement en un clic.'
        );
      }
      if (result.reason === 'too-soon' && result.next) {
        const date = new Date(result.next);
        return Alert.alert(
          'Retrait déjà effectué',
          `Tu pourras effectuer un nouveau retrait à partir du ${date.toLocaleDateString('fr-BE', {
            day: 'numeric',
            month: 'long',
          })}.`
        );
      }
      return Alert.alert('Retrait indisponible', 'Réessaie plus tard.');
    }
    const label = wallet?.payoutMethod
      ? `${wallet.payoutMethod.brand} ••••${wallet.payoutMethod.last4}`
      : 'ta carte enregistrée';
    Alert.alert(
      'Retrait programmé',
      `Ton retrait de €${result.amount.toFixed(2)} est en cours vers ${label}.`
    );
  };

  const registerPayoutCard = (brand: string) => {
    if (!session.email) return;
    const last4 = Math.floor(1000 + Math.random() * 9000)
      .toString()
      .padStart(4, '0');
    setPayoutMethod(session.email, { brand, last4, addedAt: Date.now() });
    Alert.alert('Carte enregistrée', `Les retraits se feront automatiquement sur ${brand} ••••${last4}.`);
  };

  const onRegisterPayoutMethod = () => {
    Alert.alert(
      'Ajouter une carte de versement',
      'Choisis le réseau utilisé pour tes versements CampusRide.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Visa', onPress: () => registerPayoutCard('Visa') },
        { text: 'Mastercard', onPress: () => registerPayoutCard('Mastercard') },
        { text: 'Maestro', onPress: () => registerPayoutCard('Maestro') },
        { text: 'Revolut', onPress: () => registerPayoutCard('Revolut') },
      ]
    );
  };

  const handlePurchasePack = (pack: RidePack, channel: 'card' | 'wallet') => {
    if (!session.email) return;
    if (channel === 'wallet' && balance < pack.price) {
      return Alert.alert(
        'Solde insuffisant',
        'Recharge ton wallet ou choisis un paiement par carte pour activer ce pack.'
      );
    }

    const result = purchasePack(pack.id, {
      email: session.email,
      channel,
    });

    if (!result.ok) {
      return Alert.alert(
        result.reason === 'payment-failed' ? 'Paiement refusé' : 'Achat impossible',
        result.message ?? 'Réessaie dans un instant.'
      );
    }

    Alert.alert('Pack activé ✅', `Ton pack ${pack.name} est disponible dans ton wallet.`);
  };

  const toggleChecklist = (id: string) => {
    if (!session.email) return;
    toggleChecklistItem(session.email, id);
  };

  return (
    <AppBackground style={styles.screen}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <GradientBackground colors={Gradients.card} style={styles.headerCard}>
            <View style={styles.headerTexts}>
              <Text style={styles.headerGreeting}>Ton wallet CampusRide</Text>
              <Text style={styles.headerSub}>
                {`Hey ${firstName}, voici un aperçu en temps réel de tes gains et crédits.`}
              </Text>
            </View>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Solde disponible</Text>
              <Text style={styles.balanceValue}>€{balance.toFixed(2)}</Text>
              <GradientButton
                title="Retirer mon solde"
                onPress={onWithdraw}
                size="sm"
                disabled={!canWithdraw}
                style={styles.balanceButton}
              />
              {!canWithdraw && lastWithdrawalAt ? (
                <Text style={styles.balanceHint}>
                  Prochain retrait possible {nextWithdrawalDate?.toLocaleDateString('fr-BE', {
                    day: 'numeric',
                    month: 'long',
                  }) ?? 'bientôt'}.
                </Text>
              ) : null}
            </View>
            <View style={styles.payoutRow}>
              <Text style={styles.payoutLabel}>Carte de versement</Text>
              <Pressable onPress={onRegisterPayoutMethod} hitSlop={12}>
                <Text style={styles.payoutValue}>
                  {hasPayoutMethod ? payoutLabel : 'Ajouter une carte'}
                </Text>
              </Pressable>
            </View>
          </GradientBackground>

          <GradientBackground colors={Gradients.card} style={styles.pointsCard}>
            <View style={styles.pointsHeader}>
              <Text style={styles.pointsTitle}>Points CampusRide</Text>
              <Pressable onPress={() => setShowPointsDetails((prev) => !prev)}>
                <Text style={styles.pointsToggle}>
                  {showPointsDetails ? 'Masquer les paliers' : 'Voir les paliers'}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.pointsValue}>{walletPoints} pts</Text>
            <Text style={styles.pointsSub}>
              {currentTierLabel} • {currentTierReward}
            </Text>
            {showPointsDetails ? (
              <View style={styles.pointsList}>
                {POINT_TIERS.map((tier) => (
                  <View key={tier.id} style={styles.pointsRow}>
                    <Text style={styles.pointsRowLabel}>{tier.label}</Text>
                    <Text style={styles.pointsRowValue}>{tier.threshold} pts</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {nextTier ? (
              <Text style={styles.pointsHint}>
                Plus que {pointsToNext} pts pour atteindre {nextTier.label}.
              </Text>
            ) : (
              <Text style={styles.pointsHint}>Tu as débloqué tous les paliers, bravo !</Text>
            )}
          </GradientBackground>

          <GradientBackground colors={Gradients.card} style={styles.checklistCard}>
            <Text style={styles.sectionTitle}>Checklist conducteur</Text>
            <Text style={styles.sectionSubtitle}>
              Complète ces actions pour obtenir des bonus de visibilité et des retraits accélérés.
            </Text>
            {checklist.map((item) => (
              <Pressable
                key={item.id}
                style={styles.checklistRow}
                onPress={() => toggleChecklist(item.id)}
              >
                <View style={[styles.checklistCheckbox, item.done && styles.checklistCheckboxDone]}>
                  {item.done ? <Text style={styles.checklistMark}>✓</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checklistLabel}>{item.label}</Text>
                  {item.hint ? <Text style={styles.checklistHint}>{item.hint}</Text> : null}
                </View>
              </Pressable>
            ))}
          </GradientBackground>

          <GradientBackground colors={Gradients.card} style={styles.packCard}>
            <Text style={styles.sectionTitle}>Packs de trajets</Text>
            <Text style={styles.sectionSubtitle}>
              Achète des packs pour réduire l’impact des frais CampusRide et remercier tes passagers fidèles.
            </Text>
            {packs.map((pack) => (
              <View key={pack.id} style={styles.packRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.packTitle}>{pack.name}</Text>
                  <Text style={styles.packSubtitle}>{pack.description}</Text>
                </View>
                <View style={styles.packActions}>
                  <GradientButton
                    title="Carte"
                    size="sm"
                    onPress={() => handlePurchasePack(pack, 'card')}
                    variant="cta"
                  />
                  <GradientButton
                    title="Wallet"
                    size="sm"
                    onPress={() => handlePurchasePack(pack, 'wallet')}
                    disabled={balance < pack.price}
                  />
                </View>
              </View>
            ))}
          </GradientBackground>

          <GradientBackground colors={Gradients.card} style={styles.transactionsCard}>
            <View style={styles.transactionHeader}>
              <Text style={styles.sectionTitle}>Historique</Text>
              <View style={styles.filterRow}>
                {FILTERS.map((option) => {
                  const selected = option.id === filter;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => setFilter(option.id)}
                      style={[
                        styles.filterChip,
                        selected ? styles.filterChipSelected : styles.filterChipIdle,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          selected ? styles.filterChipTextSelected : styles.filterChipTextIdle,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {filteredTransactions.map((tx) => (
              <View key={tx.id} style={styles.transactionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.transactionDescription}>{tx.description}</Text>
                  <Text style={styles.transactionMeta}>
                    {new Date(tx.createdAt).toLocaleDateString('fr-BE', {
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    • Solde €{tx.balanceAfter.toFixed(2)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.transactionAmount,
                    tx.type === 'credit' ? styles.transactionCredit : styles.transactionDebit,
                  ]}
                >
                  {tx.type === 'credit' ? '+' : '-'}€{tx.amount.toFixed(2)}
                </Text>
              </View>
            ))}
            {filteredTransactions.length === 0 ? (
              <Text style={styles.emptyTransactions}>Aucune transaction pour le moment.</Text>
            ) : null}
          </GradientBackground>
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  headerCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  headerTexts: { gap: Spacing.xs },
  headerGreeting: { fontSize: 20, fontWeight: '800', color: C.ink },
  headerSub: { color: C.gray600, fontSize: 13, lineHeight: 18 },
  balanceCard: {
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.85)',
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  balanceLabel: { color: C.gray600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  balanceValue: { fontSize: 28, fontWeight: '800', color: C.ink },
  balanceButton: { alignSelf: 'flex-start', marginTop: Spacing.sm },
  balanceHint: { color: C.gray500, fontSize: 12 },
  payoutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payoutLabel: { color: C.gray600, fontSize: 13 },
  payoutValue: { color: C.primary, fontWeight: '700' },
  pointsCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  pointsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pointsTitle: { fontWeight: '800', color: C.ink, fontSize: 16 },
  pointsToggle: { color: C.primary, fontWeight: '700' },
  pointsValue: { fontSize: 32, fontWeight: '800', color: C.secondary },
  pointsSub: { color: C.gray600, fontSize: 12 },
  pointsList: { gap: Spacing.xs, marginTop: Spacing.sm },
  pointsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: C.gray100,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  pointsRowLabel: { color: C.gray600, fontWeight: '700' },
  pointsRowValue: { color: C.gray600 },
  pointsHint: { color: C.gray500, fontSize: 12 },
  checklistCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sectionTitle: { fontWeight: '800', color: C.ink, fontSize: 16 },
  sectionSubtitle: { color: C.gray600, fontSize: 12, lineHeight: 18 },
  checklistRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  checklistCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.gray400,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  checklistCheckboxDone: {
    backgroundColor: C.successLight,
    borderColor: C.success,
  },
  checklistMark: { color: C.success, fontWeight: '800', fontSize: 12 },
  checklistLabel: { color: C.gray700, fontSize: 13, fontWeight: '600' },
  checklistHint: { color: C.gray500, fontSize: 12 },
  packCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  packTitle: { fontWeight: '700', color: C.ink },
  packSubtitle: { color: C.gray600, fontSize: 12 },
  packActions: { flexDirection: 'row', gap: Spacing.sm },
  transactionsCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  transactionHeader: { gap: Spacing.sm },
  filterRow: { flexDirection: 'row', gap: Spacing.sm },
  filterChip: {
    borderRadius: Radius.pill,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
  },
  filterChipIdle: { borderColor: C.gray300, backgroundColor: 'rgba(255,255,255,0.75)' },
  filterChipSelected: { borderColor: C.primary, backgroundColor: C.primaryLight },
  filterChipText: { fontSize: 12, fontWeight: '700' },
  filterChipTextIdle: { color: C.gray600 },
  filterChipTextSelected: { color: C.primaryDark },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  transactionDescription: { color: C.ink, fontWeight: '600' },
  transactionMeta: { color: C.gray500, fontSize: 12 },
  transactionAmount: { fontWeight: '700', fontSize: 13 },
  transactionCredit: { color: C.success },
  transactionDebit: { color: C.danger },
  emptyTransactions: { color: C.gray500, fontSize: 12 },
});

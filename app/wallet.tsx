import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  creditWallet,
  getWallet,
  setPayoutMethod,
  subscribeWallet,
  withdrawAmount,
  type WalletSnapshot,
} from '@/app/services/wallet';
import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { useAuthSession } from '@/hooks/use-auth-session';
import { IconSymbol } from '@/components/ui/icon-symbol';

const C = Colors;

type WalletView = 'home' | 'add' | 'withdraw';
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(value);

const ADD_PRESETS = [10, 20, 50, 100];
const WITHDRAW_PRESETS = [10, 20, 30];

export default function WalletScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [view, setView] = useState<WalletView>('home');
  const [addAmount, setAddAmount] = useState('20');
  const [withdrawValue, setWithdrawValue] = useState('0');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!session.email) return setWallet(null);
    setWallet(getWallet(session.email));
    const unsubscribe = subscribeWallet(session.email, setWallet);
    return unsubscribe;
  }, [session.email]);

  const balance = wallet?.balance ?? 0;
  const payoutMethod = wallet?.payoutMethod ?? null;
  const transactions = wallet?.transactions ?? [];

  const goBack = useCallback(() => {
    if (view === 'home') {
      router.replace('/(tabs)/profile');
      return;
    }
    setView('home');
  }, [router, view]);

  const onRegisterPayoutMethod = useCallback(() => {
    if (!session.email) return;
    const options = ['Annuler', 'Visa', 'Mastercard', 'Maestro', 'Revolut'];
    const handleSelection = (brand?: string) => {
      if (!brand) return;
      registerMethod(session.email!, brand);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          userInterfaceStyle: 'light',
        },
        (index) => {
          if (index <= 0) return;
          handleSelection(options[index]);
        }
      );
      return;
    }
    Alert.alert(
      'Ajouter une méthode',
      'Choisis le réseau pour tes paiements et retraits.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Visa', onPress: () => handleSelection('Visa') },
        { text: 'Mastercard', onPress: () => handleSelection('Mastercard') },
        { text: 'Maestro', onPress: () => handleSelection('Maestro') },
        { text: 'Revolut', onPress: () => handleSelection('Revolut') },
      ],
      { cancelable: true }
    );
  }, [session.email]);

  const onAddFunds = useCallback(() => {
    if (!session.email) return;
    const amount = parseFloat(addAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Montant invalide', 'Choisis un montant supérieur à 0 €.');
      return;
    }
    setProcessing(true);
    try {
      creditWallet(session.email, amount, { description: 'Recharge wallet' });
      Alert.alert('Recharge confirmée', `${formatCurrency(amount)} ajoutés à ton wallet.`);
      setAddAmount('0');
      setView('home');
    } finally {
      setProcessing(false);
    }
  }, [addAmount, session.email]);

  const onWithdrawFunds = useCallback(() => {
    if (!session.email) return;
    const amountValue = parseFloat(withdrawValue.replace(',', '.'));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      Alert.alert('Montant invalide', 'Choisis un montant supérieur à 0 €.');
      return;
    }
    if (amountValue > balance) {
      Alert.alert('Montant trop élevé', 'Le montant dépasse ton solde disponible.');
      return;
    }
    setProcessing(true);
    try {
      const result = withdrawAmount(session.email, amountValue, { description: 'Retrait manuel' });
      if (!result.ok) {
        switch (result.reason) {
          case 'no-payout-method':
            Alert.alert('Ajoute un compte bancaire', 'Enregistre un compte pour recevoir tes retraits.');
            break;
          case 'too-soon':
            Alert.alert(
              'Retrait indisponible',
              `Tu pourras retirer à partir du ${result.next
                ? new Date(result.next).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })
                : 'prochain cycle'}.`
            );
            break;
          case 'empty':
            Alert.alert('Solde insuffisant', 'Ton solde doit être supérieur à 0 €.');
            break;
          case 'invalid-amount':
            Alert.alert('Montant invalide', 'Entre un montant valide.');
            break;
          case 'insufficient':
            Alert.alert('Montant trop élevé', 'Ton solde ne permet pas ce retrait.');
            break;
          default:
            Alert.alert('Retrait impossible', 'Réessaie dans un instant.');
        }
      } else {
        Alert.alert(
          'Retrait envoyé',
          `${formatCurrency(result.amount)} sont en route vers ton compte bancaire.`
        );
        setWithdrawValue('0');
        setView('home');
      }
    } finally {
      setProcessing(false);
    }
  }, [balance, session.email, withdrawValue]);

  const renderAmountInput = (
    label: string,
    amount: string,
    setAmount: (value: string) => void,
    presets: number[],
    highlight?: number
  ) => (
    <View style={styles.inputCard}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.amountField}>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          style={styles.amountInput}
          placeholder="0"
          placeholderTextColor={C.gray400}
        />
        <Text style={styles.amountSuffix}>€</Text>
      </View>
      <View style={styles.chipRow}>
        {presets.map((value) => {
          const selected = highlight === value || parseFloat(amount) === value;
          return (
            <Pressable
              key={value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setAmount(String(value))}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {value}€
              </Text>
            </Pressable>
          );
        })}
        {label.toLowerCase().includes('retirer') ? (
          <Pressable style={styles.chip} onPress={() => setAmount(balance.toFixed(2))}>
            <Text style={styles.chipText}>Tout</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const renderPaymentMethodCard = (actionLabel: string) => (
    <View style={styles.paymentCard}>
      <Text style={styles.paymentTitle}>Méthode de paiement</Text>
      {payoutMethod ? (
        <View style={styles.paymentDetail}>
          <IconSymbol name="creditcard.fill" size={28} color={C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentName}>{payoutMethod.brand}</Text>
            <Text style={styles.paymentHint}>•••• {payoutMethod.last4}</Text>
          </View>
          <Pressable onPress={onRegisterPayoutMethod}>
            <Text style={styles.paymentAction}>Modifier</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.paymentSelector} onPress={onRegisterPayoutMethod}>
          <View style={styles.paymentSelectorIcon} />
          <Text style={styles.paymentSelectorText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );

  const renderSummary = (label: string, amount: number, highlight?: string) => (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Récapitulatif</Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{formatCurrency(amount)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Frais de transaction</Text>
        <Text style={[styles.summaryValue, styles.summarySuccess]}>Gratuit</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, styles.summaryHighlight]}>
          {highlight ?? 'Montant total'}
        </Text>
        <Text style={[styles.summaryValue, styles.summaryHighlight]}>
          {formatCurrency(amount)}
        </Text>
      </View>
    </View>
  );

  const renderTransactions = () => (
    <View style={styles.transactionsCard}>
      <Text style={styles.sectionTitle}>Historique des transactions</Text>
      {transactions.length === 0 ? (
        <Text style={styles.emptyTransactions}>Aucun mouvement pour le moment.</Text>
      ) : (
        transactions.slice(0, 5).map((tx) => {
          const isCredit = tx.type === 'credit';
          return (
            <View key={tx.id} style={styles.transactionRow}>
              <View style={[styles.transactionIcon, isCredit ? styles.iconCredit : styles.iconDebit]}>
                <IconSymbol
                  name={isCredit ? 'arrow.down.left' : 'arrow.up.right'}
                  size={16}
                  color={isCredit ? '#1F9D55' : '#D33F3F'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.transactionDescription}>{tx.description}</Text>
                <Text style={styles.transactionMeta}>
                  {new Date(tx.createdAt).toLocaleDateString('fr-BE', {
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  • Solde {formatCurrency(tx.balanceAfter)}
                </Text>
              </View>
              <Text style={[styles.transactionAmount, isCredit ? styles.amountCredit : styles.amountDebit]}>
                {isCredit ? '+' : '-'}
                {formatCurrency(tx.amount)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );

  const renderHome = () => (
    <>
      <GradientBackground colors={Gradients.background} style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button">
            <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.heroTitleRow}>
            <Image source={require('@/assets/images/Wallet.png')} style={styles.heroLogo} />
            <Text style={styles.heroTitle}>Wallet</Text>
          </View>
        </View>
        <Text style={styles.heroSubtitle}>Solde disponible</Text>
        <Text style={styles.heroBalance}>{formatCurrency(balance)}</Text>
        <View style={styles.heroActions}>
          <Pressable style={styles.heroActionPrimary} onPress={() => setView('add')}>
            <Text style={styles.heroActionPrimaryText}>+ Ajouter</Text>
          </Pressable>
          <Pressable style={styles.heroActionSecondary} onPress={() => setView('withdraw')}>
            <Text style={styles.heroActionSecondaryText}>Retirer</Text>
          </Pressable>
        </View>
      </GradientBackground>

      <View style={styles.contentCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Moyens de paiement</Text>
          <Pressable onPress={onRegisterPayoutMethod} hitSlop={12} accessibilityRole="button">
            <Text style={styles.cardAction}>+</Text>
          </Pressable>
        </View>
        {payoutMethod ? (
          <View style={styles.cardList}>
            <View style={styles.methodRow}>
              <View
                style={[
                  styles.methodBadge,
                  { backgroundColor: getBrandColors(payoutMethod.brand).background },
                ]}
              >
                <Text
                  style={[
                    styles.methodBadgeText,
                    { color: getBrandColors(payoutMethod.brand).text },
                  ]}
                >
                  {payoutMethod.brand}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.methodLabel}>Carte •••• {payoutMethod.last4}</Text>
                <Text style={styles.methodHint}>
                  Ajoutée le {new Date(payoutMethod.addedAt ?? Date.now()).toLocaleDateString('fr-BE')}
                </Text>
              </View>
              <Text style={styles.methodDefault}>Par défaut</Text>
            </View>
          </View>
        ) : (
            <Pressable
              style={styles.methodEmpty}
              onPress={onRegisterPayoutMethod}
              accessibilityRole="button"
            >
            <Text style={styles.methodEmptyText}>Ajouter une carte</Text>
          </Pressable>
        )}
      </View>

      {renderTransactions()}
    </>
  );

  const renderAddFunds = () => (
    <>
      <GradientBackground colors={Gradients.background} style={styles.flowHero}>
        <View style={styles.heroHeader}>
          <Pressable onPress={goBack} hitSlop={12}>
            <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.heroTitle}>Ajouter des fonds</Text>
        </View>
        <Text style={styles.flowSubtitle}>Rechargez votre wallet CampusRide</Text>
      </GradientBackground>
      {renderAmountInput('Montant à ajouter', addAmount, setAddAmount, ADD_PRESETS)}
      {renderPaymentMethodCard('Sélectionner une méthode de paiement')}
      {renderSummary('Montant', parseFloat(addAmount.replace(',', '.')) || 0, 'Total à payer')}
      <Pressable
        style={styles.primaryButton}
        onPress={onAddFunds}
        disabled={processing}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Continuer</Text>
      </Pressable>
    </>
  );

  const renderWithdrawFunds = () => (
    <>
      <GradientBackground colors={Gradients.background} style={styles.flowHero}>
        <View style={styles.heroHeader}>
          <Pressable onPress={goBack} hitSlop={12}>
            <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.heroTitle}>Retirer des fonds</Text>
        </View>
        <Text style={styles.flowSubtitle}>Transférez vos gains vers votre compte bancaire</Text>
      </GradientBackground>
      <View style={styles.balanceSummary}>
        <Text style={styles.balanceSummaryLabel}>Solde disponible</Text>
        <Text style={styles.balanceSummaryValue}>{formatCurrency(balance)}</Text>
      </View>
      {renderAmountInput(
        'Montant à retirer',
        withdrawValue,
        setWithdrawValue,
        WITHDRAW_PRESETS
      )}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Compte bancaire</Text>
        {payoutMethod ? (
          <View style={styles.paymentDetail}>
            <IconSymbol name="building.columns" size={28} color="#1F9D55" />
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentName}>Compte principal</Text>
              <Text style={styles.paymentHint}>•••• {payoutMethod.last4}</Text>
            </View>
            <Pressable onPress={onRegisterPayoutMethod}>
              <Text style={styles.paymentAction}>Modifier</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.paymentSelector} onPress={onRegisterPayoutMethod}>
            <View style={styles.paymentSelectorIcon} />
            <Text style={styles.paymentSelectorText}>Ajouter un compte bancaire</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.noticeCard}>
        <IconSymbol name="info.circle" size={18} color="#1F5FD0" />
        <View>
          <Text style={styles.noticeTitle}>Délai de traitement</Text>
          <Text style={styles.noticeText}>
            Les retraits sont généralement traités sous 2-3 jours ouvrables.
          </Text>
        </View>
      </View>
      {renderSummary(
        'Montant du retrait',
        parseFloat(withdrawValue.replace(',', '.')) || 0,
        'Montant à recevoir'
      )}
      <Pressable
        style={styles.primaryButton}
        onPress={onWithdrawFunds}
        disabled={processing}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Continuer</Text>
      </Pressable>
    </>
  );

  return (
    <AppBackground colors={Gradients.background} style={styles.screen}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {view === 'home' ? renderHome() : null}
          {view === 'add' ? renderAddFunds() : null}
          {view === 'withdraw' ? renderWithdrawFunds() : null}
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

const registerMethod = (email: string, brand: string) => {
  const last4 = Math.floor(1000 + Math.random() * 9000)
    .toString()
    .slice(-4);
  setPayoutMethod(email, { brand, last4, addedAt: Date.now() });
  Alert.alert('Carte enregistrée', `${brand} ••••${last4} est prête à être utilisée.`);
};

const getBrandColors = (brand: string) => {
  switch (brand.toLowerCase()) {
    case 'visa':
      return { background: '#0D47A1', text: '#FFFFFF' };
    case 'mastercard':
      return { background: '#FF6F00', text: '#1F1F1F' };
    case 'maestro':
      return { background: '#006DB3', text: '#FFFFFF' };
    case 'revolut':
      return { background: '#1BC8FF', text: '#0F2240' };
    default:
      return { background: '#3C7CFF', text: '#FFFFFF' };
  }
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safe: { flex: 1 },
  scroll: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  heroCard: {
    borderRadius: 32,
    padding: Spacing.lg,
    gap: Spacing.sm,
    elevation: 8,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  heroLogo: { width: 28, height: 28, resizeMode: 'contain' },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  heroSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  heroBalance: { fontSize: 36, fontWeight: '800', color: '#FFFFFF' },
  heroActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  heroActionPrimary: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  heroActionPrimaryText: { color: C.ink, fontWeight: '700' },
  heroActionSecondary: {
    flex: 1,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.8)',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  heroActionSecondaryText: { color: '#FFFFFF', fontWeight: '700' },
  contentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.ink },
  cardAction: { fontSize: 22, color: C.primary },
  cardList: { gap: Spacing.sm },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(248,249,255,0.95)',
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  methodBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
  },
  methodBadgeText: { fontWeight: '800', fontSize: 14 },
  methodLabel: { fontWeight: '700', color: C.ink },
  methodHint: { color: C.gray500, fontSize: 12 },
  methodDefault: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(103,195,135,0.2)',
    color: '#1F9D55',
    fontWeight: '700',
    fontSize: 12,
  },
  methodEmpty: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(21,23,43,0.15)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  methodEmptyText: { color: C.primary, fontWeight: '700' },
  transactionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.ink },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  transactionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCredit: { backgroundColor: 'rgba(92,225,143,0.25)' },
  iconDebit: { backgroundColor: 'rgba(241,107,107,0.2)' },
  transactionDescription: { color: C.ink, fontWeight: '600' },
  transactionMeta: { color: C.gray500, fontSize: 12 },
  transactionAmount: { fontWeight: '700', fontSize: 14 },
  amountCredit: { color: '#1F9D55' },
  amountDebit: { color: '#D33F3F' },
  emptyTransactions: { textAlign: 'center', color: C.gray500 },
  flowHero: {
    borderRadius: 32,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  flowSubtitle: { color: 'rgba(255,255,255,0.9)' },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  inputLabel: { fontWeight: '700', color: C.ink },
  amountField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.gray100,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '800', color: C.ink },
  amountSuffix: { fontSize: 20, fontWeight: '700', color: C.gray600 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  chipSelected: { borderColor: C.primary, backgroundColor: 'rgba(255,131,71,0.15)' },
  chipText: { color: C.gray700, fontWeight: '600' },
  chipTextSelected: { color: C.primary },
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  paymentTitle: { fontWeight: '700', color: C.ink },
  paymentDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(248,249,255,0.95)',
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  paymentName: { fontWeight: '700', color: C.ink },
  paymentHint: { color: C.gray500, fontSize: 12 },
  paymentAction: { color: C.primary, fontWeight: '700' },
  paymentSelector: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(21,23,43,0.15)',
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  paymentSelectorIcon: {
    width: 36,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,131,71,0.4)',
  },
  paymentSelectorText: { color: C.gray600, fontWeight: '700' },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  summaryTitle: { fontWeight: '800', color: C.ink },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: { color: C.gray600 },
  summaryValue: { color: C.ink, fontWeight: '700' },
  summarySuccess: { color: '#1F9D55' },
  summaryHighlight: { color: C.primary },
  primaryButton: {
    borderRadius: Radius.pill,
    backgroundColor: C.primary,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700' },
  balanceSummary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  balanceSummaryLabel: { color: C.gray600, fontSize: 12 },
  balanceSummaryValue: { fontSize: 32, fontWeight: '800', color: C.ink },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  infoTitle: { fontWeight: '700', color: C.ink },
  noticeCard: {
    backgroundColor: 'rgba(231,237,255,0.9)',
    borderRadius: 20,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  noticeTitle: { fontWeight: '700', color: '#1F5FD0' },
  noticeText: { color: '#1F5FD0', fontSize: 12 },
});

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

import {
  creditWallet,
  getWallet,
  selectPaymentMethod,
  setPayoutAccount,
  setPayoutMethod,
  subscribeWallet,
  withdrawAmount,
  type PayoutMethod,
  type WalletSnapshot,
} from '@/app/services/wallet';
import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuthSession } from '@/hooks/use-auth-session';
import * as Auth from '@/app/services/auth';
import { deleteAccountData } from '@/app/services/account';

const C = Colors;

type WalletView = 'home' | 'add' | 'withdraw';
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(value);

const ADD_PRESETS = [10, 20, 50, 100];
const WITHDRAW_PRESETS = [10, 20, 30];
const buildCardFormState = () => ({
  holder: '',
  number: '',
  expMonth: '',
  expYear: '',
  cvc: '',
});
const buildBankFormState = () => ({
  label: 'Compte principal',
  iban: '',
});
type CardFormState = ReturnType<typeof buildCardFormState>;
type BankFormState = ReturnType<typeof buildBankFormState>;

export default function WalletScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [view, setView] = useState<WalletView>('home');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [addAmount, setAddAmount] = useState('20');
  const [withdrawValue, setWithdrawValue] = useState('0');
  const [processing, setProcessing] = useState(false);
  const [methodPickerVisible, setMethodPickerVisible] = useState(false);
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [bankModalVisible, setBankModalVisible] = useState(false);
  const [cardForm, setCardForm] = useState(buildCardFormState);
  const [bankForm, setBankForm] = useState(buildBankFormState);

  const updateCardForm = useCallback((patch: Partial<CardFormState>) => {
    setCardForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateBankForm = useCallback((patch: Partial<BankFormState>) => {
    setBankForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetCardForm = useCallback(() => {
    setCardForm(buildCardFormState());
  }, []);

  const resetBankForm = useCallback(() => {
    setBankForm(buildBankFormState());
  }, []);

  useEffect(() => {
    if (!session.email) return setWallet(null);
    setWallet(getWallet(session.email));
    const unsubscribe = subscribeWallet(session.email, setWallet);
    return unsubscribe;
  }, [session.email]);

  useEffect(() => {
    if (session.email) return;
    setMethodPickerVisible(false);
    setCardModalVisible(false);
    setBankModalVisible(false);
    resetCardForm();
    resetBankForm();
  }, [resetBankForm, resetCardForm, session.email]);

  const balance = wallet?.balance ?? 0;
  const payoutMethod = wallet?.payoutMethod ?? null;
  const paymentMethods = useMemo(() => wallet?.paymentMethods ?? [], [wallet?.paymentMethods]);
  const defaultPaymentMethodId = wallet?.defaultPaymentMethodId ?? null;
  const payoutAccount = wallet?.payoutAccount ?? null;
  const transactions = wallet?.transactions ?? [];

  const goBack = useCallback(() => {
    if (view === 'home') {
      router.replace('/(tabs)/profile');
      return;
    }
    setView('home');
  }, [router, view]);

type NativePayOption = { label: string; type: 'apple-pay' | 'google-pay' };

  const nativePayOptions = useMemo<NativePayOption[]>(() => {
    const options: NativePayOption[] = [];
    if (Platform.OS === 'ios') {
      options.push({ label: 'Apple Pay', type: 'apple-pay' });
    }
    options.push({ label: 'Google Pay', type: 'google-pay' });
    return options;
  }, []);
  const primaryNativePayOption = nativePayOptions[0] ?? null;
  const secondaryNativePayOption = nativePayOptions[1] ?? null;

  const handleRegisterNativePay = useCallback(
    (option: NativePayOption) => {
      if (!session.email) return;
      registerNativePayMethod(session.email, option);
      Alert.alert(
        `${option.label} activé`,
        `${option.label} est prêt pour tes paiements CampusRide.`
      );
      setMethodPickerVisible(false);
      setCardModalVisible(false);
    },
    [session.email]
  );

  const handleUseNativePay = useCallback(
    (option: NativePayOption) => {
      if (!session.email) return;
      const existing = paymentMethods.find((method) => method.type === option.type);
      if (existing) {
        selectPaymentMethod(session.email, existing.id);
        Alert.alert(
          `${option.label} sélectionné`,
          `${option.label} est défini pour cette recharge.`
        );
        return;
      }
      registerNativePayMethod(session.email, option);
      Alert.alert(
        `${option.label} activé`,
        `${option.label} est prêt pour tes paiements CampusRide.`
      );
    },
    [paymentMethods, session.email]
  );

  const promptAddPaymentMethod = useCallback(() => {
    if (!session.email) {
      Alert.alert('Connexion requise', 'Connecte-toi pour gérer tes cartes.');
      return;
    }
    if (nativePayOptions.length) {
      Alert.alert(
        'Ajouter un moyen de paiement',
        'Choisis comment tu souhaites payer sur CampusRide.',
        [
          { text: 'Annuler', style: 'cancel' },
          ...nativePayOptions.map((option) => ({
            text: option.label,
            onPress: () => handleRegisterNativePay(option),
          })),
          { text: 'Ajouter une carte', onPress: () => setCardModalVisible(true) },
        ],
        { cancelable: true }
      );
      return;
    }
    setCardModalVisible(true);
  }, [handleRegisterNativePay, nativePayOptions, session.email]);

  const openPaymentMethodPicker = useCallback(() => {
    if (!session.email) {
      Alert.alert('Connexion requise', 'Connecte-toi pour gérer tes cartes.');
      return;
    }
    if (paymentMethods.length === 0) {
      promptAddPaymentMethod();
      return;
    }
    setMethodPickerVisible(true);
  }, [paymentMethods.length, promptAddPaymentMethod, session.email]);

  const openBankModal = useCallback(() => {
    if (!session.email) {
      Alert.alert('Connexion requise', 'Connecte-toi pour gérer tes comptes.');
      return;
    }
    setBankModalVisible(true);
  }, [session.email]);

  const handleSelectPaymentMethod = useCallback(
    (methodId: string) => {
      if (!session.email) return;
      selectPaymentMethod(session.email, methodId);
      setMethodPickerVisible(false);
    },
    [session.email]
  );

  const handleSaveCard = useCallback(() => {
    if (!session.email) return;
    const holder = cardForm.holder.trim();
    const sanitizedNumber = cardForm.number.replace(/\s+/g, '');
    const expMonth = parseInt(cardForm.expMonth, 10);
    const expYear = parseInt(cardForm.expYear, 10);
    const cvc = cardForm.cvc.trim();
    if (!holder) {
      Alert.alert('Nom du titulaire requis', 'Entre le nom figurant sur la carte.');
      return;
    }
    if (!/^\d{12,19}$/.test(sanitizedNumber)) {
      Alert.alert('Numéro invalide', 'Entre un numéro de carte valide.');
      return;
    }
    if (!Number.isFinite(expMonth) || expMonth < 1 || expMonth > 12) {
      Alert.alert('Expiration invalide', 'Renseigne un mois valide (01-12).');
      return;
    }
    if (!Number.isFinite(expYear) || expYear < 24) {
      Alert.alert('Expiration invalide', 'Renseigne une année valide (>= 24).');
      return;
    }
    if (!/^\d{3,4}$/.test(cvc)) {
      Alert.alert('CVC invalide', 'Vérifie le cryptogramme au dos de la carte.');
      return;
    }
    registerCardMethod(session.email, {
      holderName: holder,
      number: sanitizedNumber,
      expMonth,
      expYear,
    });
    Alert.alert('Carte enregistrée', 'Ton moyen de paiement est prêt à être utilisé.');
    setCardModalVisible(false);
    setMethodPickerVisible(false);
    resetCardForm();
  }, [cardForm, resetCardForm, session.email]);

  const handleSaveBankAccount = useCallback(() => {
    if (!session.email) return;
    const label = bankForm.label.trim() || 'Compte principal';
    const sanitizedIban = bankForm.iban.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(sanitizedIban)) {
      Alert.alert('IBAN invalide', 'Vérifie ton IBAN avant de continuer.');
      return;
    }
    setPayoutAccount(session.email, {
      iban: sanitizedIban,
      label,
      addedAt: Date.now(),
    });
    Alert.alert('Compte enregistré', `${label} est prêt pour tes retraits.`);
    resetBankForm();
    setBankModalVisible(false);
  }, [bankForm, resetBankForm, session.email]);

  const onAddFunds = useCallback(() => {
    if (!session.email) return;
    if (!payoutMethod) {
      Alert.alert(
        'Ajoute une carte',
        'Sélectionne un moyen de paiement avant de continuer.',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: primaryNativePayOption?.label ?? 'Ajouter une carte',
            onPress: () => {
              if (primaryNativePayOption) {
                handleRegisterNativePay(primaryNativePayOption);
              } else {
                setCardModalVisible(true);
              }
            },
          },
        ]
      );
      return;
    }
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
  }, [addAmount, handleRegisterNativePay, primaryNativePayOption, payoutMethod, session.email]);

  const onWithdrawFunds = useCallback(() => {
    if (!session.email) return;
    if (!payoutAccount && !payoutMethod) {
      Alert.alert(
        'Ajoute un compte bancaire',
        'Enregistre un compte pour recevoir tes retraits.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Ajouter un compte', onPress: openBankModal },
        ]
      );
      return;
    }
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
  }, [balance, openBankModal, payoutAccount, payoutMethod, session.email, withdrawValue]);

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
        <>
          <View style={styles.paymentDetail}>
            <IconSymbol name="creditcard.fill" size={28} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentName}>{payoutMethod.brand}</Text>
              <Text style={styles.paymentHint}>{describeMethodHint(payoutMethod)}</Text>
            </View>
            <Pressable onPress={openPaymentMethodPicker}>
              <Text style={styles.paymentAction}>Modifier</Text>
            </Pressable>
          </View>
          {primaryNativePayOption && payoutMethod.type !== primaryNativePayOption.type ? (
            <Pressable
              style={styles.nativePayButton}
              onPress={() => handleRegisterNativePay(primaryNativePayOption)}
            >
              <IconSymbol name="wave.3.forward" size={18} color="#fff" />
              <Text style={styles.nativePayButtonText}>
                Activer {primaryNativePayOption.label}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <Pressable style={styles.paymentSelector} onPress={promptAddPaymentMethod}>
            <View style={styles.paymentSelectorIcon} />
            <Text style={styles.paymentSelectorText}>{actionLabel}</Text>
          </Pressable>
          {primaryNativePayOption ? (
            <Pressable
              style={styles.nativePayButton}
              onPress={() => handleRegisterNativePay(primaryNativePayOption)}
            >
              <IconSymbol name="wave.3.forward" size={18} color="#fff" />
              <Text style={styles.nativePayButtonText}>
                Activer {primaryNativePayOption.label}
              </Text>
            </Pressable>
          ) : null}
        </>
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

  const roleLabel = useMemo(() => {
    if (!session.email) return 'membre Campus Ride';
    if (session.isDriver && session.isPassenger) return 'conducteur et passager';
    if (session.isDriver) return 'conducteur';
    if (session.isPassenger) return 'passager';
    return 'membre Campus Ride';
  }, [session.email, session.isDriver, session.isPassenger]);

  const handleConfirmDeleteAccount = useCallback(async () => {
    if (!session.email || isDeletingAccount) return;
    setIsDeletingAccount(true);
    try {
      deleteAccountData(session.email);
      await Auth.signOut();
      router.replace('/welcome');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Impossible de supprimer ton compte pour le moment.';
      Alert.alert('Erreur', message);
    } finally {
      setIsDeletingAccount(false);
    }
  }, [isDeletingAccount, router, session.email]);

  const promptDeleteAccount = useCallback(() => {
    if (!session.email || isDeletingAccount) return;
    Alert.alert(
      'Supprimer mon compte',
      'Tous tes trajets, messages, avis, wallet et préférences seront effacés. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            void handleConfirmDeleteAccount();
          },
        },
      ],
      { cancelable: true }
    );
  }, [handleConfirmDeleteAccount, isDeletingAccount, session.email]);

  const renderDeleteAccountSection = () => (
    <View style={styles.deleteSection}>
      <Text style={styles.deleteTitle}>Supprimer mon compte {roleLabel}</Text>
      <Text style={styles.deleteDescription}>
        Toutes tes données de {roleLabel} (trajets, messages, avis, wallet) seront retirées de CampusRide.
      </Text>
      <Pressable
        style={[
          styles.deleteButton,
          (!session.email || isDeletingAccount) && styles.deleteButtonDisabled,
        ]}
        onPress={promptDeleteAccount}
        disabled={!session.email || isDeletingAccount}
      >
        <Text style={styles.deleteButtonText}>
          {isDeletingAccount ? 'Suppression en cours…' : 'Supprimer mon compte'}
        </Text>
      </Pressable>
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
          <Pressable onPress={promptAddPaymentMethod} hitSlop={12} accessibilityRole="button">
            <Text style={styles.cardAction}>+</Text>
          </Pressable>
        </View>
        {paymentMethods.length ? (
          <View style={styles.cardList}>
            {paymentMethods.map((method) => {
              const isDefault = defaultPaymentMethodId === method.id;
              return (
                <Pressable
                  key={method.id}
                  style={styles.methodRow}
                  onPress={() => handleSelectPaymentMethod(method.id)}
                >
                  <View
                    style={[
                      styles.methodBadge,
                      { backgroundColor: getBrandColors(method.brand).background },
                    ]}
                  >
                    <Text
                      style={[
                        styles.methodBadgeText,
                        { color: getBrandColors(method.brand).text },
                      ]}
                    >
                      {method.brand}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.methodLabel}>{describeMethodLabel(method)}</Text>
                    <Text style={styles.methodHint}>{describeMethodHint(method)}</Text>
                  </View>
                  {isDefault ? (
                    <Text style={styles.methodDefault}>Par défaut</Text>
                  ) : (
                    <Text style={styles.methodSelect}>Utiliser</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Pressable
            style={styles.methodEmpty}
            onPress={promptAddPaymentMethod}
            accessibilityRole="button"
          >
            <Text style={styles.methodEmptyText}>
              {primaryNativePayOption ? `Activer ${primaryNativePayOption.label}` : 'Ajouter une carte'}
            </Text>
          </Pressable>
        )}
        {primaryNativePayOption &&
        !paymentMethods.some((m) => m.type === primaryNativePayOption.type) ? (
          <Pressable
            style={[styles.nativePayButton, styles.nativePayButtonOutline]}
            onPress={() => handleRegisterNativePay(primaryNativePayOption)}
          >
            <IconSymbol name="wave.3.forward" size={18} color={C.primary} />
            <Text style={[styles.nativePayButtonText, { color: C.primary }]}>
              Activer {primaryNativePayOption.label}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {renderTransactions()}
      {renderDeleteAccountSection()}
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
      {renderPaymentMethodCard(
        primaryNativePayOption
          ? `Activer ${primaryNativePayOption.label}`
          : 'Sélectionner une méthode de paiement'
      )}
      {primaryNativePayOption ? (
        <Pressable
          style={styles.nativePayCTA}
          onPress={() => handleUseNativePay(primaryNativePayOption)}
        >
          <IconSymbol name="wave.3.forward" size={20} color="#fff" />
          <Text style={styles.nativePayCTAPlay}>
            Utiliser {primaryNativePayOption.label} pour cette recharge
          </Text>
        </Pressable>
      ) : null}
      {secondaryNativePayOption ? (
        <Pressable
          style={[styles.nativePayCTA, styles.nativePaySecondaryCTA]}
          onPress={() => handleUseNativePay(secondaryNativePayOption)}
        >
          <View style={styles.nativePaySecondaryLogo}>
            <Text style={styles.nativePaySecondaryLogoText}>G</Text>
          </View>
          <Text style={[styles.nativePayCTAPlay, styles.nativePaySecondaryCTAPlay]}>
            Utiliser {secondaryNativePayOption.label} pour cette recharge
          </Text>
        </Pressable>
      ) : null}
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
        {payoutAccount || payoutMethod ? (
          <View style={styles.paymentDetail}>
            <IconSymbol name="building.columns" size={28} color="#1F9D55" />
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentName}>
                {payoutAccount ? payoutAccount.label : 'Compte principal'}
              </Text>
              <Text style={styles.paymentHint}>
                {payoutAccount
                  ? formatIbanDisplay(payoutAccount.iban)
                  : payoutMethod
                  ? describeMethodHint(payoutMethod)
                  : ''}
              </Text>
            </View>
            <Pressable onPress={openBankModal}>
              <Text style={styles.paymentAction}>Modifier</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.paymentSelector} onPress={openBankModal}>
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

  const renderMethodPicker = () => (
    <Modal
      visible={methodPickerVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setMethodPickerVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Sélectionne un moyen</Text>
          {paymentMethods.length === 0 ? (
            <Text style={styles.modalEmpty}>Aucun moyen enregistré.</Text>
          ) : (
            paymentMethods.map((method) => (
              <Pressable
                key={method.id}
                style={[
                  styles.selectorRow,
                  defaultPaymentMethodId === method.id && styles.selectorRowActive,
                ]}
                onPress={() => handleSelectPaymentMethod(method.id)}
              >
                <View>
                  <Text style={styles.selectorLabel}>{method.brand}</Text>
                  <Text style={styles.selectorHint}>{describeMethodHint(method)}</Text>
                </View>
                {defaultPaymentMethodId === method.id ? (
                  <Text style={styles.selectorBadge}>Par défaut</Text>
                ) : null}
              </Pressable>
            ))
          )}
          <View style={styles.modalActionsColumn}>
            {primaryNativePayOption ? (
              <Pressable
                style={styles.modalSecondaryButton}
                onPress={() => handleRegisterNativePay(primaryNativePayOption)}
              >
                <Text style={styles.modalSecondaryButtonText}>
                  Activer {primaryNativePayOption.label}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.modalSecondaryButton}
              onPress={() => {
                setMethodPickerVisible(false);
                setCardModalVisible(true);
              }}
            >
              <Text style={styles.modalSecondaryButtonText}>Ajouter une carte</Text>
            </Pressable>
          </View>
          <Pressable style={styles.modalLink} onPress={() => setMethodPickerVisible(false)}>
            <Text style={styles.modalLinkText}>Fermer</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  const renderCardModal = () => (
    <Modal
      visible={cardModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setCardModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalCard}
        >
          <Text style={styles.modalTitle}>Ajouter une carte</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Nom du titulaire"
            placeholderTextColor={C.gray400}
            value={cardForm.holder}
            onChangeText={(value) => updateCardForm({ holder: value })}
          />
          <TextInput
            style={styles.modalInput}
            placeholder="Numéro de carte"
            placeholderTextColor={C.gray400}
            keyboardType="number-pad"
            value={cardForm.number}
            onChangeText={(value) => updateCardForm({ number: value })}
            maxLength={19}
          />
          <View style={styles.modalRow}>
            <TextInput
              style={[styles.modalInput, styles.modalInputHalf]}
              placeholder="MM"
              placeholderTextColor={C.gray400}
              keyboardType="number-pad"
              value={cardForm.expMonth}
              onChangeText={(value) => updateCardForm({ expMonth: value })}
              maxLength={2}
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputHalf]}
              placeholder="AA"
              placeholderTextColor={C.gray400}
              keyboardType="number-pad"
              value={cardForm.expYear}
              onChangeText={(value) => updateCardForm({ expYear: value })}
              maxLength={2}
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputHalf]}
              placeholder="CVC"
              placeholderTextColor={C.gray400}
              keyboardType="number-pad"
              value={cardForm.cvc}
              onChangeText={(value) => updateCardForm({ cvc: value })}
              maxLength={4}
            />
          </View>
          <View style={styles.modalActions}>
            <Pressable
              style={styles.modalSecondaryButton}
              onPress={() => {
                resetCardForm();
                setCardModalVisible(false);
              }}
            >
              <Text style={styles.modalSecondaryButtonText}>Annuler</Text>
            </Pressable>
            <Pressable style={styles.modalPrimaryButton} onPress={handleSaveCard}>
              <Text style={styles.modalPrimaryButtonText}>Enregistrer</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  const renderBankModal = () => (
    <Modal
      visible={bankModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setBankModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalCard}
        >
          <Text style={styles.modalTitle}>Compte bancaire</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Nom du compte"
            placeholderTextColor={C.gray400}
            value={bankForm.label}
            onChangeText={(value) => updateBankForm({ label: value })}
          />
          <TextInput
            style={styles.modalInput}
            placeholder="IBAN"
            placeholderTextColor={C.gray400}
            autoCapitalize="characters"
            keyboardType="default"
            value={bankForm.iban}
            onChangeText={(value) => updateBankForm({ iban: value })}
          />
          <View style={styles.modalActions}>
            <Pressable
              style={styles.modalSecondaryButton}
              onPress={() => {
                resetBankForm();
                setBankModalVisible(false);
              }}
            >
              <Text style={styles.modalSecondaryButtonText}>Annuler</Text>
            </Pressable>
            <Pressable style={styles.modalPrimaryButton} onPress={handleSaveBankAccount}>
              <Text style={styles.modalPrimaryButtonText}>Enregistrer</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
      {renderMethodPicker()}
      {renderCardModal()}
      {renderBankModal()}
    </AppBackground>
  );
}

const registerCardMethod = (
  email: string,
  card: { holderName: string; number: string; expMonth: number; expYear: number }
) => {
  const last4 = card.number.slice(-4);
  const brand = detectCardBrand(card.number);
  setPayoutMethod(email, {
    brand,
    last4,
    holderName: card.holderName,
    expMonth: card.expMonth,
    expYear: card.expYear,
    addedAt: Date.now(),
  });
};

const registerNativePayMethod = (
  email: string,
  option: { label: string; type: 'apple-pay' | 'google-pay' }
) => {
  const fallbackLast4 = option.type === 'apple-pay' ? 'APAY' : 'GPAY';
  setPayoutMethod(email, {
    brand: option.label,
    last4: fallbackLast4,
    type: option.type,
    addedAt: Date.now(),
  });
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
    case 'apple pay':
      return { background: '#000000', text: '#FFFFFF' };
    case 'google pay':
      return { background: '#1F1F1F', text: '#FFFFFF' };
    default:
      return { background: '#3C7CFF', text: '#FFFFFF' };
  }
};

const detectCardBrand = (number: string) => {
  if (/^4/.test(number)) return 'Visa';
  if (/^5[1-5]/.test(number)) return 'Mastercard';
  if (/^(5018|5020|5038|56|57|58|6304|6759|676[1-3])/.test(number)) return 'Maestro';
  if (/^3[47]/.test(number)) return 'Amex';
  if (/^6(?:011|5)/.test(number)) return 'Discover';
  return 'Carte';
};

const formatIbanDisplay = (value: string) => value.replace(/(.{4})/g, '$1 ').trim();

const describeMethodHint = (method: PayoutMethod) => {
  const type = method.type ?? 'card';
  if (type === 'apple-pay') return 'Paiement mobile (Apple Pay)';
  if (type === 'google-pay') return 'Paiement mobile (Google Pay)';
  return `•••• ${method.last4}`;
};

const describeMethodLabel = (method: PayoutMethod) => {
  const type = method.type ?? 'card';
  if (type === 'card') return `Carte •••• ${method.last4}`;
  return method.brand;
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
  deleteSection: {
    borderRadius: 28,
    backgroundColor: '#FFF3F2',
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  deleteTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.danger,
  },
  deleteDescription: {
    color: Colors.gray600,
    fontSize: 13,
    lineHeight: 18,
  },
  deleteButton: {
    marginTop: Spacing.sm,
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.danger,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    opacity: 0.7,
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
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
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.gray900 },
  modalInput: {
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: C.gray900,
  },
  modalRow: { flexDirection: 'row', gap: Spacing.sm },
  modalInputHalf: { flex: 1 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  modalPrimaryButton: {
    backgroundColor: C.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  modalPrimaryButtonText: { color: '#fff', fontWeight: '700' },
  modalSecondaryButton: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: C.gray300,
  },
  modalSecondaryButtonText: { color: C.gray700, fontWeight: '600' },
  modalActionsColumn: { gap: Spacing.sm },
  modalEmpty: { color: C.gray500, textAlign: 'center', marginVertical: Spacing.sm },
  modalLink: { marginTop: Spacing.sm, alignItems: 'center' },
  modalLinkText: { color: C.primary, fontWeight: '600' },
  selectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.gray100,
  },
  selectorRowActive: {
    backgroundColor: C.gray50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
  },
  selectorLabel: { fontWeight: '600', color: C.gray900 },
  selectorHint: { color: C.gray500, fontSize: 12 },
  selectorBadge: { color: C.primary, fontWeight: '700', fontSize: 12 },
  nativePayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: C.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  nativePayButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.primary,
  },
  nativePayButtonText: { color: '#fff', fontWeight: '700' },
  methodSelect: { color: C.primary, fontWeight: '700' },
  nativePayCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: '#000',
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    marginVertical: Spacing.sm,
  },
  nativePayCTAPlay: { color: '#fff', fontWeight: '700' },
  nativePaySecondaryCTA: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  nativePaySecondaryCTAPlay: { color: '#1F1F1F' },
  nativePaySecondaryLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativePaySecondaryLogoText: {
    color: '#fff',
    fontWeight: '800',
  },
});

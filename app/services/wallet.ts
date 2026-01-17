// app/services/wallet.ts

import { pushNotification } from './notifications';
import { loadStoredWallet, persistStoredWallet } from './local-wallet-store';
import type { WalletStoreRecord } from './local-wallet-store';

type TransactionType = 'credit' | 'debit' | 'info';

export type WalletTransaction = {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  createdAt: number;
  balanceAfter: number;
  metadata?: Record<string, unknown>;
};

export type PaymentMethodType = 'card' | 'apple-pay' | 'google-pay';

export type PayoutMethod = {
  id: string;
  type: PaymentMethodType;
  brand: string;
  last4: string;
  addedAt: number;
  holderName?: string;
  expMonth?: number;
  expYear?: number;
};

export type PayoutAccount = {
  iban: string;
  label: string;
  addedAt: number;
};

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  hint?: string;
};

export type WalletSnapshot = {
  balance: number;
  lastWithdrawalAt: number | null;
  transactions: WalletTransaction[];
  withdrawalDelayDays: number;
  points: number;
  rideCredits: number;
  payoutMethod: PayoutMethod | null;
  paymentMethods: PayoutMethod[];
  defaultPaymentMethodId: string | null;
  payoutAccount: PayoutAccount | null;
  checklist: ChecklistItem[];
};

type Wallet = {
  balance: number;
  lastWithdrawalAt: number | null;
  transactions: WalletTransaction[];
  withdrawalDelayDays: number;
  points: number;
  rideCredits: number;
  payoutMethod: PayoutMethod | null;
  paymentMethods: PayoutMethod[];
  defaultPaymentMethodId: string | null;
  payoutAccount: PayoutAccount | null;
  checklist: ChecklistItem[];
  seeded?: boolean;
};

type Listener = (wallet: WalletSnapshot) => void;

const wallets: Record<string, Wallet> = {};
const listeners: Record<string, Listener[]> = {};

const randomId = () => Math.random().toString(36).slice(2, 9);
const normalizeEmail = (email: string) => email.trim().toLowerCase();

const DEFAULT_WITHDRAWAL_DELAY_DAYS = 30;
const MIN_WITHDRAWAL_DELAY_DAYS = 7;

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  {
    id: 'complete-profile',
    label: 'Compléter mon profil conducteur (nom + plaque)',
    done: false,
  },
  {
    id: 'add-payout-method',
    label: 'Ajouter ma carte bancaire pour les versements',
    done: false,
  },
  {
    id: 'publish-first-ride',
    label: 'Publier un premier trajet',
    done: false,
  },
  {
    id: 'share-link',
    label: 'Partager mon lien de trajet à 3 camarades',
    done: false,
  },
];

const cloneChecklist = (items: ChecklistItem[]) => items.map((item) => ({ ...item }));

const walletRecordToWallet = (record: WalletStoreRecord): Wallet => ({
  balance: record.balance ?? 0,
  lastWithdrawalAt: record.lastWithdrawalAt ?? null,
  transactions: record.transactions?.map((transaction) => ({ ...transaction })) ?? [],
  withdrawalDelayDays: record.withdrawalDelayDays ?? DEFAULT_WITHDRAWAL_DELAY_DAYS,
  points: record.points ?? 0,
  rideCredits: record.rideCredits ?? 0,
  payoutMethod: record.payoutMethod ?? null,
  paymentMethods: record.paymentMethods ?? [],
  defaultPaymentMethodId: record.defaultPaymentMethodId ?? null,
  payoutAccount: record.payoutAccount ?? null,
  checklist: cloneChecklist(record.checklist ?? DEFAULT_CHECKLIST),
  seeded: true,
});

const walletToRecord = (wallet: Wallet): WalletStoreRecord => ({
  balance: wallet.balance,
  lastWithdrawalAt: wallet.lastWithdrawalAt,
  transactions: wallet.transactions.map((transaction) => ({ ...transaction })),
  withdrawalDelayDays: wallet.withdrawalDelayDays,
  points: wallet.points,
  rideCredits: wallet.rideCredits,
  payoutMethod: wallet.payoutMethod,
  paymentMethods: wallet.paymentMethods,
  defaultPaymentMethodId: wallet.defaultPaymentMethodId,
  payoutAccount: wallet.payoutAccount,
  checklist: wallet.checklist,
});

import type { WalletStoreRecord } from './local-wallet-store';

const clone = (wallet: Wallet): WalletSnapshot => ({
  balance: wallet.balance,
  lastWithdrawalAt: wallet.lastWithdrawalAt,
  transactions: wallet.transactions.map((tx) => ({ ...tx })),
  withdrawalDelayDays: wallet.withdrawalDelayDays,
  points: wallet.points,
  rideCredits: wallet.rideCredits,
  payoutMethod: wallet.payoutMethod ? { ...wallet.payoutMethod } : null,
  paymentMethods: wallet.paymentMethods.map((method) => ({ ...method })),
  defaultPaymentMethodId: wallet.defaultPaymentMethodId,
  payoutAccount: wallet.payoutAccount ? { ...wallet.payoutAccount } : null,
  checklist: cloneChecklist(wallet.checklist),
});

const ensureWallet = (email: string) => {
  const key = normalizeEmail(email);
  if (!wallets[key]) {
    const stored = loadStoredWallet(email);
    if (stored) {
      wallets[key] = walletRecordToWallet(stored);
    } else {
      wallets[key] = {
        balance: 0,
        lastWithdrawalAt: null,
        transactions: [],
        withdrawalDelayDays: DEFAULT_WITHDRAWAL_DELAY_DAYS,
        points: 0,
        rideCredits: 0,
        payoutMethod: null,
        paymentMethods: [],
        defaultPaymentMethodId: null,
        payoutAccount: null,
        checklist: cloneChecklist(DEFAULT_CHECKLIST),
        seeded: false,
      };
    }
  }
  if (!listeners[key]) listeners[key] = [];
  if (!wallets[key].seeded) {
    seedDemoWallet(email, wallets[key]);
  }
  return key;
};

const notify = (email: string) => {
  const key = ensureWallet(email);
  const snapshot = clone(wallets[key]);
  listeners[key].forEach((listener) => listener(snapshot));
  persistStoredWallet(email, walletToRecord(wallets[key]));
};

const pushTransaction = (wallet: Wallet, transaction: WalletTransaction) => {
  wallet.transactions = [transaction, ...wallet.transactions.slice(0, 49)];
};

export const creditWallet = (
  email: string,
  amount: number,
  metadata: { description: string; rideId?: string } & Record<string, unknown>
) => {
  if (!email || amount <= 0) return null;
  const key = ensureWallet(email);
  const wallet = wallets[key];
  wallet.balance += amount;
  const transaction: WalletTransaction = {
    id: randomId(),
    type: 'credit',
    amount,
    description: metadata.description,
    createdAt: Date.now(),
    balanceAfter: wallet.balance,
    metadata,
  };
  pushTransaction(wallet, transaction);
  notify(email);
  return transaction;
};

export const debitWallet = (
  email: string,
  amount: number,
  description: string,
  metadata?: Record<string, unknown>
) => {
  if (!email || amount <= 0) return null;
  const key = ensureWallet(email);
  const wallet = wallets[key];
  if (wallet.balance < amount) return null;
  wallet.balance -= amount;
  const transaction: WalletTransaction = {
    id: randomId(),
    type: 'debit',
    amount,
    description,
    createdAt: Date.now(),
    balanceAfter: wallet.balance,
    metadata,
  };
  pushTransaction(wallet, transaction);
  notify(email);
  return transaction;
};

export const recordWalletActivity = (
  email: string,
  description: string,
  metadata?: Record<string, unknown>
) => {
  const key = ensureWallet(email);
  const wallet = wallets[key];
  const transaction: WalletTransaction = {
    id: randomId(),
    type: 'info',
    amount: 0,
    description,
    createdAt: Date.now(),
    balanceAfter: wallet.balance,
    metadata,
  };
  pushTransaction(wallet, transaction);
  notify(email);
  return transaction;
};

export const canPayWithWallet = (email: string, amount: number) => {
  const key = ensureWallet(email);
  return wallets[key].balance >= amount;
};

export const payWithWallet = (
  email: string,
  amount: number,
  description: string,
  metadata?: Record<string, unknown>
) => debitWallet(email, amount, description, { ...(metadata ?? {}), method: 'wallet' });

export const getRideCredits = (email: string) => {
  const key = ensureWallet(email);
  return wallets[key].rideCredits;
};

export const grantRideCredits = (
  email: string,
  credits: number,
  metadata?: Record<string, unknown>
) => {
  if (!email || credits <= 0) return null;
  const key = ensureWallet(email);
  const wallet = wallets[key];
  wallet.rideCredits += credits;
  recordWalletActivity(email, `Pack CampusRide (+${credits} trajets)`, {
    ...(metadata ?? {}),
    rideCredits: wallet.rideCredits,
  });
  return wallet.rideCredits;
};

export const consumeRideCredit = (email: string) => {
  const key = ensureWallet(email);
  const wallet = wallets[key];
  if (wallet.rideCredits <= 0) return false;
  wallet.rideCredits -= 1;
  recordWalletActivity(email, 'Trajet réglé via pack CampusRide', {
    rideCredits: wallet.rideCredits,
  });
  return true;
};

export const addPoints = (email: string, points: number, reason: string) => {
  if (!email || points <= 0) return null;
  const key = ensureWallet(email);
  const wallet = wallets[key];
  wallet.points += points;
  recordWalletActivity(email, `${points} CampusPoints gagnés`, { reason, points: wallet.points });
  notify(email);
  return wallet.points;
};

export const redeemPoints = (email: string, points: number, reason: string) => {
  if (!email || points <= 0) return null;
  const key = ensureWallet(email);
  const wallet = wallets[key];
  if (wallet.points < points) return null;
  wallet.points -= points;
  recordWalletActivity(email, `${points} CampusPoints utilisés`, { reason, points: wallet.points });
  notify(email);
  return wallet.points;
};

type PayoutMethodInput = Omit<PayoutMethod, 'id' | 'type' | 'addedAt'> & {
  id?: string;
  type?: PaymentMethodType;
  addedAt?: number;
};

export const setPayoutMethod = (email: string, method: PayoutMethodInput) => {
  const key = ensureWallet(email);
  const wallet = wallets[key];
  const entry: PayoutMethod = {
    id: method.id ?? randomId(),
    type: method.type ?? 'card',
    brand: method.brand,
    last4: method.last4,
    addedAt: method.addedAt ?? Date.now(),
    holderName: method.holderName,
    expMonth: method.expMonth,
    expYear: method.expYear,
  };
  wallet.payoutMethod = { ...entry };
  wallet.defaultPaymentMethodId = entry.id;
  wallet.paymentMethods = [entry, ...wallet.paymentMethods.filter((item) => item.id !== entry.id)];
  const checklistItem = wallet.checklist.find((item) => item.id === 'add-payout-method');
  if (checklistItem) checklistItem.done = true;
  recordWalletActivity(email, 'Carte de versement enregistrée', {
    brand: wallet.payoutMethod.brand,
    last4: wallet.payoutMethod.last4,
  });
  notify(email);
  return wallet.payoutMethod;
};

export const selectPaymentMethod = (email: string, methodId: string) => {
  const key = ensureWallet(email);
  const wallet = wallets[key];
  const method = wallet.paymentMethods.find((entry) => entry.id === methodId);
  if (!method) return null;
  wallet.payoutMethod = { ...method };
  wallet.defaultPaymentMethodId = method.id;
  notify(email);
  return wallet.payoutMethod;
};

export const setPayoutAccount = (email: string, account: PayoutAccount) => {
  const key = ensureWallet(email);
  const wallet = wallets[key];
  wallet.payoutAccount = {
    ...account,
    addedAt: account.addedAt ?? Date.now(),
    iban: account.iban,
    label: account.label,
  };
  recordWalletActivity(email, 'Compte bancaire mis à jour', {
    label: wallet.payoutAccount.label,
    iban: wallet.payoutAccount.iban,
  });
  notify(email);
  return wallet.payoutAccount;
};

export const getChecklist = (email: string) => {
  const key = ensureWallet(email);
  return cloneChecklist(wallets[key].checklist);
};

export const toggleChecklistItem = (email: string, id: string, done: boolean) => {
  const key = ensureWallet(email);
  const wallet = wallets[key];
  const item = wallet.checklist.find((entry) => entry.id === id);
  if (!item) return false;
  item.done = done;
  notify(email);
  return true;
};

export const markChecklist = (email: string, id: string) => toggleChecklistItem(email, id, true);

export const requestMonthlyWithdrawal = (email: string) => {
  const key = ensureWallet(email);
  const wallet = wallets[key];
  const payoutTarget = wallet.payoutAccount ?? wallet.payoutMethod;
  if (!payoutTarget) {
    return { ok: false as const, reason: 'no-payout-method' as const };
  }
  const now = Date.now();
  const delayDays = wallet.withdrawalDelayDays ?? DEFAULT_WITHDRAWAL_DELAY_DAYS;
  if (wallet.lastWithdrawalAt && now - wallet.lastWithdrawalAt < delayMs) {
    return {
      ok: false as const,
      reason: 'too-soon' as const,
      next: wallet.lastWithdrawalAt + delayMs,
      delayDays,
    };
  }
  const amount = wallet.balance;
  if (amount <= 0) {
    return { ok: false as const, reason: 'empty' as const };
  }
  const description =
    delayDays === DEFAULT_WITHDRAWAL_DELAY_DAYS
      ? 'Retrait mensuel'
      : `Retrait prioritaire (${delayDays} jours)`;
  debitWallet(email, amount, description, {
    type: 'monthly-withdrawal',
    delayDays,
  });
  wallet.lastWithdrawalAt = now;
  notify(email);
  pushNotification({
    to: email,
    title: 'Retrait en cours',
    body: `Ton retrait de €${amount.toFixed(2)} sera versé sur ton compte bancaire sous peu.`,
    metadata: { action: 'wallet-withdrawal', amount, delayDays },
  });
  return { ok: true, amount };
};

const seedDemoWallet = (email: string, wallet: Wallet) => {
  wallet.balance = 45.5;
  wallet.points = 420;
  wallet.rideCredits = 3;
  wallet.withdrawalDelayDays = 14;
  const defaultCard: PayoutMethod = {
    id: randomId(),
    type: 'card',
    brand: 'Visa',
    last4: '4532',
    addedAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
    holderName: 'Lina Dupont',
    expMonth: 8,
    expYear: 27,
  };
  wallet.paymentMethods = [defaultCard];
  wallet.defaultPaymentMethodId = defaultCard.id;
  wallet.payoutMethod = { ...defaultCard };
  wallet.payoutAccount = {
    iban: 'BE63 5100 0754 7061',
    label: 'Compte principal',
    addedAt: Date.now() - 1000 * 60 * 60 * 24 * 28,
  };
  wallet.transactions = [
    {
      id: randomId(),
      type: 'credit',
      amount: 5.5,
      description: 'Trajet EPHEC Woluwe → EPHEC Delta',
      createdAt: Date.now() - 1000 * 60 * 30,
      balanceAfter: 45.5,
    },
    {
      id: randomId(),
      type: 'debit',
      amount: 3,
      description: 'Trajet Ixelles → EPHEC Delta',
      createdAt: Date.now() - 1000 * 60 * 60 * 24,
      balanceAfter: 40,
    },
    {
      id: randomId(),
      type: 'credit',
      amount: 4,
      description: 'Trajet EPHEC Schaerbeek → EPHEC Delta',
      createdAt: Date.now() - 1000 * 60 * 60 * 48,
      balanceAfter: 43,
    },
    {
      id: randomId(),
      type: 'debit',
      amount: 2.5,
      description: 'Trajet EPHEC Woluwe → EPHEC LLN',
      createdAt: Date.now() - 1000 * 60 * 60 * 72,
      balanceAfter: 39,
    },
    {
      id: randomId(),
      type: 'credit',
      amount: 6,
      description: 'Trajet EPHEC Delta → EPHEC Schaerbeek',
      createdAt: Date.now() - 1000 * 60 * 60 * 96,
      balanceAfter: 41.5,
    },
  ];
  wallet.lastWithdrawalAt = Date.now() - 1000 * 60 * 60 * 24 * 10;
  wallet.seeded = true;
  notify(email);
};

export const withdrawAmount = (
  email: string,
  amount: number,
  options?: { description?: string }
) => {
  const key = ensureWallet(email);
  const wallet = wallets[key];
  const payoutTarget = wallet.payoutAccount ?? wallet.payoutMethod;
  if (!payoutTarget) {
    return { ok: false as const, reason: 'no-payout-method' as const };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, reason: 'invalid-amount' as const };
  }
  if (wallet.balance <= 0) {
    return { ok: false as const, reason: 'empty' as const };
  }
  if (amount > wallet.balance) {
    return { ok: false as const, reason: 'insufficient' as const };
  }
  const now = Date.now();
  const delayDays = wallet.withdrawalDelayDays ?? DEFAULT_WITHDRAWAL_DELAY_DAYS;
  debitWallet(email, amount, options?.description ?? 'Retrait manuel', {
    type: 'manual-withdrawal',
    delayDays,
  });
  wallet.lastWithdrawalAt = now;
  notify(email);
  pushNotification({
    to: email,
    title: 'Retrait en cours',
    body: `Ton retrait de €${amount.toFixed(2)} sera versé sur ton compte bancaire sous peu.`,
    metadata: { action: 'wallet-withdrawal', amount, delayDays },
  });
  return { ok: true as const, amount };
};

export const getWallet = (email: string) => {
  if (!email) return null;
  const key = ensureWallet(email);
  return clone(wallets[key]);
};

export const subscribeWallet = (email: string, cb: Listener) => {
  if (!email) return () => undefined;
  const key = ensureWallet(email);
  listeners[key].push(cb);
  cb(clone(wallets[key]));
  return () => {
    const bucket = listeners[key];
    const idx = bucket.indexOf(cb);
    if (idx >= 0) bucket.splice(idx, 1);
  };
};

export const initWallet = (email: string) => {
  if (!email) return;
  ensureWallet(email);
  notify(email);
};

export const resetWallets = () => {
  Object.keys(wallets).forEach((key) => {
    wallets[key] = {
      balance: 0,
      lastWithdrawalAt: null,
      transactions: [],
      withdrawalDelayDays: DEFAULT_WITHDRAWAL_DELAY_DAYS,
      points: 0,
      rideCredits: 0,
      payoutMethod: null,
      paymentMethods: [],
      defaultPaymentMethodId: null,
      payoutAccount: null,
      checklist: cloneChecklist(DEFAULT_CHECKLIST),
    };
    notify(key);
  });
};

const buildEmptyWallet = (): Wallet => ({
  balance: 0,
  lastWithdrawalAt: null,
  transactions: [],
  withdrawalDelayDays: DEFAULT_WITHDRAWAL_DELAY_DAYS,
  points: 0,
  rideCredits: 0,
  payoutMethod: null,
  paymentMethods: [],
  defaultPaymentMethodId: null,
  payoutAccount: null,
  checklist: cloneChecklist(DEFAULT_CHECKLIST),
  seeded: true,
});

export const clearWalletData = (email: string) => {
  if (!email) return;
  const key = email.toLowerCase();
  if (wallets[key]) {
    wallets[key] = buildEmptyWallet();
    notify(email);
  }
  delete wallets[key];
};

export const getWithdrawalDelayDays = (email: string) => {
  const key = ensureWallet(email);
  return wallets[key].withdrawalDelayDays;
};

export const updateWithdrawalDelay = (email: string, days: number) => {
  const key = ensureWallet(email);
  const wallet = wallets[key];
  const next = Math.min(
    DEFAULT_WITHDRAWAL_DELAY_DAYS,
    Math.max(MIN_WITHDRAWAL_DELAY_DAYS, Math.round(days))
  );
  if (wallet.withdrawalDelayDays === next) {
    return false;
  }
  wallet.withdrawalDelayDays = next;
  notify(email);
  return true;
};

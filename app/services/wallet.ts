// app/services/wallet.ts

import { pushNotification } from './notifications';

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

export type PayoutMethod = {
  brand: string;
  last4: string;
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
  checklist: ChecklistItem[];
};

type Listener = (wallet: WalletSnapshot) => void;

const wallets: Record<string, Wallet> = {};
const listeners: Record<string, Listener[]> = {};

const randomId = () => Math.random().toString(36).slice(2, 9);

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

const cloneChecklist = (items: ChecklistItem[]) =>
  items.map((item) => ({ ...item }));

const clone = (wallet: Wallet): WalletSnapshot => ({
  balance: wallet.balance,
  lastWithdrawalAt: wallet.lastWithdrawalAt,
  transactions: wallet.transactions.map((tx) => ({ ...tx })),
  withdrawalDelayDays: wallet.withdrawalDelayDays,
  points: wallet.points,
  rideCredits: wallet.rideCredits,
  payoutMethod: wallet.payoutMethod ? { ...wallet.payoutMethod } : null,
  checklist: cloneChecklist(wallet.checklist),
});

const ensureWallet = (email: string) => {
  const key = email.toLowerCase();
  if (!wallets[key]) {
    wallets[key] = {
      balance: 0,
      lastWithdrawalAt: null,
      transactions: [],
      withdrawalDelayDays: DEFAULT_WITHDRAWAL_DELAY_DAYS,
      points: 0,
      rideCredits: 0,
      payoutMethod: null,
      checklist: cloneChecklist(DEFAULT_CHECKLIST),
    };
  }
  if (!listeners[key]) listeners[key] = [];
  return key;
};

const notify = (email: string) => {
  const key = ensureWallet(email);
  const snapshot = clone(wallets[key]);
  listeners[key].forEach((listener) => listener(snapshot));
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
  const debitAmount = Math.min(amount, wallet.balance);
  if (debitAmount <= 0) return null;
  wallet.balance -= debitAmount;
  const transaction: WalletTransaction = {
    id: randomId(),
    type: 'debit',
    amount: debitAmount,
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

export const setPayoutMethod = (email: string, method: PayoutMethod) => {
  const key = ensureWallet(email);
  const wallet = wallets[key];
  wallet.payoutMethod = { ...method, addedAt: method.addedAt ?? Date.now() };
  const checklistItem = wallet.checklist.find((item) => item.id === 'add-payout-method');
  if (checklistItem) checklistItem.done = true;
  recordWalletActivity(email, 'Carte de versement enregistrée', {
    brand: wallet.payoutMethod.brand,
    last4: wallet.payoutMethod.last4,
  });
  notify(email);
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
  if (!wallet.payoutMethod) {
    return { ok: false as const, reason: 'no-payout-method' as const };
  }
  const now = Date.now();
  const delayDays = wallet.withdrawalDelayDays ?? DEFAULT_WITHDRAWAL_DELAY_DAYS;
  const delayMs = delayDays * 24 * 60 * 60 * 1000;
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
      checklist: cloneChecklist(DEFAULT_CHECKLIST),
    };
    notify(key);
  });
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

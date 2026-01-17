const STORAGE_KEY = 'campusride_wallets_v1';

type WalletStoreRecord = {
  balance: number;
  lastWithdrawalAt: number | null;
  transactions: WalletTransactionRecord[];
  withdrawalDelayDays: number;
  points: number;
  rideCredits: number;
  payoutMethod: WalletPayoutMethod | null;
  paymentMethods: WalletPayoutMethod[];
  defaultPaymentMethodId: string | null;
  payoutAccount: WalletPayoutAccount | null;
  checklist: WalletChecklistItem[];
};

export type WalletPayoutMethod = {
  id: string;
  type: 'card' | 'apple-pay' | 'google-pay';
  brand: string;
  last4: string;
  addedAt: number;
  holderName?: string;
  expMonth?: number;
  expYear?: number;
};

export type WalletPayoutAccount = {
  iban: string;
  label: string;
  addedAt: number;
};

export type WalletChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  hint?: string;
};

export type WalletTransactionRecord = {
  id: string;
  type: 'credit' | 'debit' | 'info';
  amount: number;
  description: string;
  createdAt: number;
  balanceAfter: number;
  metadata?: Record<string, unknown>;
};

const safeParse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const readStorage = (): Record<string, WalletStoreRecord> => {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  return safeParse<Record<string, WalletStoreRecord>>(window.localStorage.getItem(STORAGE_KEY), {});
};

const writeStorage = (state: Record<string, WalletStoreRecord>) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const loadStoredWallet = (email: string): WalletStoreRecord | null => {
  const key = normalizeEmail(email);
  const state = readStorage();
  return state[key] ?? null;
};

export const persistStoredWallet = (email: string, payload: WalletStoreRecord) => {
  const key = normalizeEmail(email);
  const state = readStorage();
  state[key] = payload;
  writeStorage(state);
};

export const clearStoredWallet = (email: string) => {
  const key = normalizeEmail(email);
  const state = readStorage();
  delete state[key];
  writeStorage(state);
};

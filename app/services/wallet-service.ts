import {
  collection,
  doc,
  DocumentData,
  DocumentSnapshot,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

import { auth, db } from '@/src/firebase';

const WALLET_COLLECTION = 'wallets';

const walletDocRef = (uid: string) => doc(db, WALLET_COLLECTION, uid);

export type WalletAdjustBalancePayload = {
  amountCents: number;
  reason: 'topup' | 'withdraw' | 'ride_payment' | 'ride_payout';
  idempotencyKey: string;
  description?: string;
  metadata?: Record<string, unknown> | null;
};

export type WalletSnapshot = {
  balanceCents: number;
  balance: number;
  currency: string | null;
  updatedAt: number | null;
};

export type WalletTransaction = {
  id: string;
  amount: number;
  amountCents: number;
  balanceAfter: number;
  balanceAfterCents: number;
  createdAt: number;
  description: string | null;
  reason: string | null;
  status: string;
  type: 'credit' | 'debit';
  idempotencyKey: string | null;
  metadata: Record<string, unknown> | null;
};

const normalizeTimestamp = (value: unknown): number => {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'object' && value && 'toMillis' in value && typeof (value as any).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === 'number') return value;
  return Number.NaN;
};

const mapWalletSnapshot = (snapshot: DocumentSnapshot<DocumentData>): WalletSnapshot => {
  const data = snapshot.data() ?? {};
  const balanceCents = typeof data.balanceCents === 'number' ? data.balanceCents : 0;
  const currency = data.currency ?? null;
  const updatedAt = normalizeTimestamp(data.updatedAt);
  return {
    balanceCents,
    balance: balanceCents / 100,
    currency: typeof currency === 'string' ? currency : null,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
  };
};

const mapTransactionSnapshot = (snapshot: DocumentSnapshot<DocumentData>): WalletTransaction => {
  const data = snapshot.data() ?? {};
  const amountCents = typeof data.amountCents === 'number' ? data.amountCents : 0;
  const balanceAfterCents = typeof data.balanceAfterCents === 'number' ? data.balanceAfterCents : 0;
  return {
    id: snapshot.id,
    amountCents,
    amount: Math.abs(amountCents) / 100,
    balanceAfterCents,
    balanceAfter: balanceAfterCents / 100,
    createdAt: normalizeTimestamp(data.createdAt),
    description: typeof data.description === 'string' ? data.description : null,
    reason: typeof data.reason === 'string' ? data.reason : null,
    status: typeof data.status === 'string' ? data.status : 'succeeded',
    type: amountCents >= 0 ? 'credit' : 'debit',
    idempotencyKey: typeof data.idempotencyKey === 'string' ? data.idempotencyKey : null,
    metadata: (data.metadata ?? null) as Record<string, unknown> | null,
  };
};

const buildIdempotencyKey = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

export const adjustBalance = async (payload: WalletAdjustBalancePayload) => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    const error = new Error('Connexion requise.');
    (error as { code?: string }).code = 'AUTH_REQUIRED';
    throw error;
  }
  const uid = currentUser.uid;
  const walletRef = walletDocRef(uid);
  const txRef = doc(collection(walletRef, 'transactions'), payload.idempotencyKey);
  const balanceCents = await runTransaction(db, async (transaction) => {
    const existingTx = await transaction.get(txRef);
    if (existingTx.exists()) {
      const existingData = existingTx.data();
      return typeof existingData?.balanceAfterCents === 'number'
        ? existingData.balanceAfterCents
        : 0;
    }
    const walletSnap = await transaction.get(walletRef);
    const walletData = walletSnap.data() ?? {};
    const currentBalanceCents =
      typeof walletData.balanceCents === 'number' ? walletData.balanceCents : 0;
    const newBalanceCents = currentBalanceCents + payload.amountCents;
    if (newBalanceCents < 0) {
      const error = new Error('Solde insuffisant.');
      (error as { code?: string }).code = 'INSUFFICIENT_FUNDS';
      throw error;
    }
    transaction.set(
      walletRef,
      {
        balanceCents: newBalanceCents,
        ownerUid: uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    transaction.set(txRef, {
      uid,
      amountCents: payload.amountCents,
      type: payload.amountCents >= 0 ? 'credit' : 'debit',
      reason: payload.reason,
      description: payload.description ?? null,
      metadata: payload.metadata ?? null,
      createdAt: serverTimestamp(),
      balanceAfterCents: newBalanceCents,
      idempotencyKey: payload.idempotencyKey,
    });
    return newBalanceCents;
  });
  return { balanceCents, txId: payload.idempotencyKey };
};

export const creditWallet = async (
  amount: number,
  options?: {
    description?: string;
    reason?: WalletAdjustBalancePayload['reason'];
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string;
  }
) => {
  const payload: WalletAdjustBalancePayload = {
    amountCents: Math.round(Math.abs(amount) * 100),
    reason: options?.reason ?? 'ride_payout',
    idempotencyKey: options?.idempotencyKey ?? buildIdempotencyKey('credit'),
    description: options?.description,
    metadata: options?.metadata ?? null,
  };
  return adjustBalance(payload);
};

export const debitWallet = async (
  amount: number,
  options?: {
    description?: string;
    reason?: WalletAdjustBalancePayload['reason'];
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string;
  }
) => {
  const payload: WalletAdjustBalancePayload = {
    amountCents: -Math.round(Math.abs(amount) * 100),
    reason: options?.reason ?? 'ride_payment',
    idempotencyKey: options?.idempotencyKey ?? buildIdempotencyKey('debit'),
    description: options?.description,
    metadata: options?.metadata ?? null,
  };
  return adjustBalance(payload);
};

export const subscribeWallet = (
  uid: string | null,
  listener: (snapshot: WalletSnapshot | null) => void
): Unsubscribe => {
  if (!uid) {
    listener(null);
    return () => undefined;
  }
  const ref = walletDocRef(uid);
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        listener(null);
        return;
      }
      listener(mapWalletSnapshot(snapshot));
    },
    (error) => {
      console.warn('[wallet-service] wallet listener failed', error);
      listener(null);
    }
  );
};

export const subscribeTransactions = (
  uid: string | null,
  listener: (transactions: WalletTransaction[]) => void
): Unsubscribe => {
  if (!uid) {
    listener([]);
    return () => undefined;
  }
  const txQuery = query(
    collection(walletDocRef(uid), 'transactions'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    txQuery,
    (snapshot) => {
      const entries = snapshot.docs.map(mapTransactionSnapshot);
      listener(entries);
    },
    (error) => {
      console.warn('[wallet-service] transactions listener failed', error);
      listener([]);
    }
  );
};

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentReference,
} from 'firebase/firestore';

import { db } from './firebase';

export type WalletTransactionRecord = {
  id: string;
  type: 'credit' | 'debit' | 'info';
  amount: number;
  description: string;
  createdAt: number;
  balanceAfter: number;
  metadata?: Record<string, unknown> | null;
};

export type WalletSnapshotRecord = {
  balance: number;
  transactions: WalletTransactionRecord[];
  payoutMethod: {
    id?: string;
    brand?: string;
    last4?: string;
    expMonth?: number;
    expYear?: number;
    holderName?: string;
    addedAt?: number;
    type?: string;
  } | null;
};

const walletsCol = collection(db, 'wallets');
const usersCol = collection(db, 'users');
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const walletOwnerCache = new Map<string, string>();

const resolveWalletRef = async (email: string): Promise<DocumentReference | null> => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (walletOwnerCache.has(normalized)) {
    return doc(walletsCol, walletOwnerCache.get(normalized)!);
  }
  const result = await getDocs(query(usersCol, where('email', '==', normalized)));
  const docSnap = result.docs[0];
  if (!docSnap) return null;
  walletOwnerCache.set(normalized, docSnap.id);
  return doc(walletsCol, docSnap.id);
};

const sanitizeMetadata = (metadata?: Record<string, unknown> | null) => {
  if (!metadata) return null;
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch {
    return null;
  }
};

export const persistWalletSnapshot = async (
  email: string,
  snapshot: WalletSnapshotRecord
) => {
  if (!email) return;
  const ref = await resolveWalletRef(email);
  if (!ref) return;
  await setDoc(
    ref,
    {
      email: normalizeEmail(email),
      ownerUid: ref.id,
      balance: snapshot.balance,
      payoutMethod: snapshot.payoutMethod
        ? {
            id: snapshot.payoutMethod.id ?? null,
            brand: snapshot.payoutMethod.brand ?? null,
            last4: snapshot.payoutMethod.last4 ?? null,
            expMonth: snapshot.payoutMethod.expMonth ?? null,
            expYear: snapshot.payoutMethod.expYear ?? null,
            holderName: snapshot.payoutMethod.holderName ?? null,
            addedAt: snapshot.payoutMethod.addedAt ?? null,
            type: snapshot.payoutMethod.type ?? null,
          }
        : null,
      transactions: snapshot.transactions.map((tx) => ({
        ...tx,
        metadata: sanitizeMetadata(tx.metadata),
      })),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

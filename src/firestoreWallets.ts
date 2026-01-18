import { serverTimestamp, setDoc } from "firebase/firestore";

import { userDocRef } from "./firestore/userDocumentHelpers";

export type WalletTransactionRecord = {
  id: string;
  type: "credit" | "debit" | "info";
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

const WALLET_COLLECTION = "wallets";

const normalizeEmail = (value?: string | null) => {
  if (!value) return null;
  return value.trim().toLowerCase();
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
  uid: string | null | undefined,
  snapshot: WalletSnapshotRecord,
  email?: string | null
) => {
  if (!uid) return;
  const normalizedEmail = normalizeEmail(email ?? null);
  const ref = userDocRef(WALLET_COLLECTION, uid);
  await setDoc(
    ref,
    {
      email: normalizedEmail,
      ownerUid: uid,
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

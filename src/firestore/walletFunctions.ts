import { httpsCallable } from 'firebase/functions';
import { functions } from '@/src/firebase';

export type AdjustBalancePayload = {
  amountCents: number;
  direction: 'credit' | 'debit';
  description?: string;
  rideId?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
};

export const callAdjustBalance = async (payload: AdjustBalancePayload) => {
  const callable = httpsCallable(functions, 'adjustBalance');
  const result = await callable(payload);
  return result.data as { balanceCents: number };
};

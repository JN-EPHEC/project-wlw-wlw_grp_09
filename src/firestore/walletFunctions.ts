import { httpsCallable } from 'firebase/functions';
import { functions } from '@/src/firebase';

export type AdjustBalancePayload = {
  amountCents: number;
  reason: 'topup' | 'withdraw' | 'ride_payment' | 'ride_payout';
  description?: string;
  metadata?: Record<string, unknown> | null;
  idempotencyKey: string;
};

export const callAdjustBalance = async (payload: AdjustBalancePayload) => {
  const callable = httpsCallable(functions, 'walletAdjustBalance');
  const result = await callable(payload);
  return result.data as { balanceCents: number; txId: string };
};

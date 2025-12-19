// app/services/payments.ts
import { pushNotification } from './notifications';
import { consumeRideCredit, getRideCredits, payWithWallet } from './wallet';
import type { Ride } from './rides';

export type PaymentStatus = 'paid';

export type Payment = {
  id: string;
  rideId: string;
  passengerEmail: string;
  amount: number;
  status: PaymentStatus;
  createdAt: number;
  method: PaymentMethod;
};

export type PaymentMethod = 'card' | 'wallet' | 'pass';
export type PaymentOptions = {
  method?: PaymentMethod;
};

type Listener = (payments: Payment[]) => void;

const payments: Payment[] = [];
const listeners: Listener[] = [];

const randomId = () => Math.random().toString(36).slice(2, 10);

const clone = (items: Payment[]) => items.map((item) => ({ ...item }));

const notify = () => {
  const snapshot = clone(payments);
  listeners.forEach((listener) => listener(snapshot));
};

export const processPayment = (ride: Ride, passengerEmail: string, options: PaymentOptions = {}) => {
  const email = passengerEmail.trim().toLowerCase();
  const alias = email.split('@')[0] ?? '';
  const passengerDisplay = alias
    ? alias
        .replace(/[._-]+/g, ' ')
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ')
    : 'Passager';
  const method: PaymentMethod = options.method ?? 'card';

  if (method === 'wallet') {
    const debit = payWithWallet(email, ride.price, `Trajet ${ride.depart} → ${ride.destination}`, {
      rideId: ride.id,
      type: 'ride-payment',
    });
    if (!debit) {
      throw new Error('WALLET_INSUFFICIENT_FUNDS');
    }
  } else if (method === 'pass') {
    const success = consumeRideCredit(email);
    if (!success) {
      throw new Error('NO_PASS_CREDIT');
    }
  }

  const payment: Payment = {
    id: randomId(),
    rideId: ride.id,
    passengerEmail: email,
    amount: ride.price,
    status: 'paid',
    createdAt: Date.now(),
    method,
  };
  payments.unshift(payment);
  notify();
  pushNotification({
    to: email,
    title: 'Paiement confirmé',
    body:
      method === 'pass'
        ? `1 crédit trajet utilisé pour ${ride.depart} → ${ride.destination}.`
        : `€${ride.price.toFixed(2)} débité pour le trajet ${ride.depart} → ${ride.destination}.`,
    metadata: { action: 'payment-confirmed', rideId: ride.id, amount: ride.price, method },
  });
  pushNotification({
    to: ride.ownerEmail,
    title: 'Réservation payée',
    body: `${passengerDisplay} a payé €${ride.price.toFixed(2)} pour ton trajet ${ride.depart} → ${ride.destination}.`,
    metadata: {
      action: 'payment-received',
      rideId: ride.id,
      amount: ride.price,
      passenger: passengerDisplay,
      method,
      remainingCredits: method === 'pass' ? getRideCredits(email) : undefined,
    },
  });
  return payment;
};

export const getPaymentsForPassenger = (email: string) =>
  clone(payments.filter((payment) => payment.passengerEmail === email.toLowerCase()));

export const subscribePayments = (listener: Listener) => {
  listeners.push(listener);
  listener(clone(payments));
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
};

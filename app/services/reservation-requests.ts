import type { Ride } from '@/app/services/rides';
import type { PaymentMethod } from '@/app/services/payments';

export type ReservationRequestEntry = {
  id: string;
  rideId: string;
  driver: string;
  driverEmail: string;
  depart: string;
  destination: string;
  price: number;
  createdAt: number;
  status: 'pending' | 'accepted';
  timeLabel: string;
  paymentMethod: PaymentMethod | null;
};

type Listener = (entries: ReservationRequestEntry[]) => void;

const store: Record<string, ReservationRequestEntry[]> = {};
const listeners: Record<string, Listener[]> = {};
const AUTO_ACCEPT_DELAY_MS = 10_000;
const autoAcceptTimers: Record<string, ReturnType<typeof setTimeout>> = {};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const timerKeyFor = (email: string, rideId: string) => `${normalizeEmail(email)}::${rideId}`;

const ensureBucket = (email: string) => {
  const key = normalizeEmail(email);
  if (!store[key]) store[key] = [];
  if (!listeners[key]) listeners[key] = [];
  return key;
};

const emit = (email: string) => {
  const key = ensureBucket(email);
  const snapshot = store[key].map((entry) => ({ ...entry }));
  listeners[key].forEach((listener) => listener(snapshot));
};

const clearAutoAcceptTimer = (email: string, rideId: string) => {
  const timerKey = timerKeyFor(email, rideId);
  const timer = autoAcceptTimers[timerKey];
  if (timer) {
    clearTimeout(timer);
    delete autoAcceptTimers[timerKey];
  }
};

const scheduleAutoAcceptance = (email: string, rideId: string) => {
  clearAutoAcceptTimer(email, rideId);
  const timerKey = timerKeyFor(email, rideId);
  autoAcceptTimers[timerKey] = setTimeout(() => {
    const key = ensureBucket(email);
    const entry = store[key].find((item) => item.rideId === rideId);
    if (!entry || entry.status !== 'pending') {
      delete autoAcceptTimers[timerKey];
      return;
    }
    entry.status = 'accepted';
    delete autoAcceptTimers[timerKey];
    emit(email);
  }, AUTO_ACCEPT_DELAY_MS);
};

export const logReservationRequest = (email: string, ride: Ride, paymentMethod: PaymentMethod | null) => {
  if (!email) return null;
  const key = ensureBucket(email);
  const existing = store[key].find((entry) => entry.rideId === ride.id);
  const entry: ReservationRequestEntry = existing
    ? { ...existing, status: 'pending', createdAt: Date.now(), paymentMethod }
    : {
        id: `${ride.id}:${Date.now()}`,
        rideId: ride.id,
        driver: ride.driver,
        driverEmail: ride.ownerEmail,
        depart: ride.depart,
        destination: ride.destination,
        price: ride.price,
        createdAt: Date.now(),
        status: 'pending',
        timeLabel: new Date(ride.departureAt).toLocaleString('fr-BE', {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
        paymentMethod,
      };
  if (existing) {
    const idx = store[key].findIndex((item) => item.rideId === ride.id);
    store[key][idx] = entry;
  } else {
    store[key] = [entry, ...store[key]];
  }
  emit(email);
  scheduleAutoAcceptance(email, ride.id);
  return entry;
};

export const markReservationAccepted = (email: string, rideId: string) => {
  if (!email) return;
  const key = ensureBucket(email);
  const entry = store[key].find((item) => item.rideId === rideId);
  if (!entry) return;
  entry.status = 'accepted';
  clearAutoAcceptTimer(email, rideId);
  emit(email);
};

export const removeReservationRequest = (email: string, rideId: string) => {
  if (!email) return;
  const key = ensureBucket(email);
  const next = store[key].filter((entry) => entry.rideId !== rideId);
  if (next.length === store[key].length) return;
  store[key] = next;
  clearAutoAcceptTimer(email, rideId);
  emit(email);
};

export const subscribeReservationRequests = (email: string | null, listener: Listener) => {
  if (!email) {
    listener([]);
    return () => undefined;
  }
  const key = ensureBucket(email);
  listeners[key].push(listener);
  listener(store[key].map((entry) => ({ ...entry })));
  return () => {
    const bucket = listeners[key];
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  };
};

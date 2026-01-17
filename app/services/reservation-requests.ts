import type { Ride } from '@/app/services/rides';
import type { PaymentMethod } from '@/app/services/payments';

export type ReservationStatus = 'pending' | 'accepted' | 'rejected';

export type ReservationRequestEntry = {
  id: string;
  rideId: string;
  driver: string;
  driverEmail: string;
  passenger: string;
  passengerEmail: string;
  depart: string;
  destination: string;
  price: number;
  createdAt: number;
  status: ReservationStatus;
  timeLabel: string;
  paymentMethod: PaymentMethod | null;
};

type Listener = (entries: ReservationRequestEntry[]) => void;

const passengerStore: Record<string, ReservationRequestEntry[]> = {};
const passengerListeners: Record<string, Listener[]> = {};
const driverStore: Record<string, ReservationRequestEntry[]> = {};
const driverListeners: Record<string, Listener[]> = {};
const AUTO_ACCEPT_DELAY_MS = 10_000;
const autoAcceptTimers: Record<string, ReturnType<typeof setTimeout>> = {};

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const buildRequestId = (rideId: string, email: string) => `${rideId}:${normalizeEmail(email)}`;
const timerKeyFor = (email: string, rideId: string) => `${normalizeEmail(email)}:${rideId}`;

const ensurePassengerBucket = (email: string) => {
  const key = normalizeEmail(email);
  if (!key) return '';
  if (!passengerStore[key]) passengerStore[key] = [];
  if (!passengerListeners[key]) passengerListeners[key] = [];
  return key;
};

const ensureDriverBucket = (email: string) => {
  const key = normalizeEmail(email);
  if (!key) return '';
  if (!driverStore[key]) driverStore[key] = [];
  if (!driverListeners[key]) driverListeners[key] = [];
  return key;
};

const emitPassenger = (email: string) => {
  const key = ensurePassengerBucket(email);
  if (!key) return;
  const snapshot = passengerStore[key].map((entry) => ({ ...entry }));
  passengerListeners[key].forEach((listener) => listener(snapshot));
};

const emitDriver = (email: string) => {
  const key = ensureDriverBucket(email);
  if (!key) return;
  const snapshot = driverStore[key].map((entry) => ({ ...entry }));
  driverListeners[key].forEach((listener) => listener(snapshot));
};

const upsertEntry = (bucket: ReservationRequestEntry[], entry: ReservationRequestEntry) => {
  const index = bucket.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    bucket[index] = entry;
  } else {
    bucket.unshift(entry);
  }
};

const clearAutoAcceptTimer = (email: string, rideId: string) => {
  const timerKey = timerKeyFor(email, rideId);
  const timer = autoAcceptTimers[timerKey];
  if (timer) {
    clearTimeout(timer);
    delete autoAcceptTimers[timerKey];
  }
};

const updateStatus = (passengerEmail: string, rideId: string, status: ReservationStatus) => {
  const key = normalizeEmail(passengerEmail);
  const bucket = passengerStore[key];
  if (!bucket) return;
  const entry = bucket.find((item) => item.rideId === rideId);
  if (!entry) return;
  entry.status = status;
  emitPassenger(passengerEmail);
  if (entry.driverEmail) {
    const driverKey = normalizeEmail(entry.driverEmail);
    const driverBucket = driverStore[driverKey];
    if (driverBucket) {
      const driverEntry = driverBucket.find((item) => item.id === entry.id);
      if (driverEntry) {
        driverEntry.status = status;
        emitDriver(entry.driverEmail);
      }
    }
  }
  if (status !== 'pending') {
    clearAutoAcceptTimer(passengerEmail, rideId);
  }
};

const scheduleAutoAcceptance = (email: string, rideId: string) => {
  clearAutoAcceptTimer(email, rideId);
  const timerKey = timerKeyFor(email, rideId);
  autoAcceptTimers[timerKey] = setTimeout(() => {
    updateStatus(email, rideId, 'accepted');
    delete autoAcceptTimers[timerKey];
  }, AUTO_ACCEPT_DELAY_MS);
};

export const logReservationRequest = (
  passengerEmail: string,
  ride: Ride,
  paymentMethod: PaymentMethod | null,
  passengerName?: string
) => {
  if (!passengerEmail) return null;
  const driverEmail = ride.ownerEmail ?? '';
  const id = buildRequestId(ride.id, passengerEmail);
  const timestamp = Date.now();
  const entry: ReservationRequestEntry = {
    id,
    rideId: ride.id,
    driver: ride.driver,
    driverEmail,
    passenger: passengerName ? passengerName : passengerEmail,
    passengerEmail,
    depart: ride.depart,
    destination: ride.destination,
    price: ride.price,
    createdAt: timestamp,
    status: 'pending',
    timeLabel: new Date(ride.departureAt).toLocaleString('fr-BE', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    paymentMethod,
  };

  const passengerKey = ensurePassengerBucket(passengerEmail);
  if (passengerKey) {
    upsertEntry(passengerStore[passengerKey], { ...entry });
    emitPassenger(passengerEmail);
  }

  if (driverEmail) {
    const driverKey = ensureDriverBucket(driverEmail);
    if (driverKey) {
      upsertEntry(driverStore[driverKey], { ...entry });
      emitDriver(driverEmail);
    }
  }

  scheduleAutoAcceptance(passengerEmail, ride.id);
  return entry;
};

export const markReservationAccepted = (email: string, rideId: string) => {
  updateStatus(email, rideId, 'accepted');
};

export const removeReservationRequest = (email: string, rideId: string) => {
  const key = normalizeEmail(email);
  const bucket = passengerStore[key];
  if (!bucket) return;
  const entry = bucket.find((item) => item.rideId === rideId);
  if (!entry) return;
  passengerStore[key] = bucket.filter((item) => item.rideId !== rideId);
  emitPassenger(email);
  clearAutoAcceptTimer(email, rideId);

  if (entry.driverEmail) {
    const driverKey = normalizeEmail(entry.driverEmail);
    const driverBucket = driverStore[driverKey];
    if (driverBucket) {
      driverStore[driverKey] = driverBucket.filter((item) => item.id !== entry.id);
      emitDriver(entry.driverEmail);
    }
  }
};

export const subscribeReservationRequests = (email: string | null, listener: Listener) => {
  if (!email) {
    listener([]);
    return () => undefined;
  }
  const key = ensurePassengerBucket(email);
  passengerListeners[key].push(listener);
  listener(passengerStore[key].map((entry) => ({ ...entry })));
  return () => {
    const bucket = passengerListeners[key];
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  };
};

export const subscribeDriverReservationRequests = (email: string | null, listener: Listener) => {
  if (!email) {
    listener([]);
    return () => undefined;
  }
  const key = ensureDriverBucket(email);
  driverListeners[key].push(listener);
  listener(driverStore[key].map((entry) => ({ ...entry })));
  return () => {
    const bucket = driverListeners[key];
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  };
};

export const acceptDriverReservationRequest = (email: string | null, requestId: string) => {
  if (!email) return;
  const key = normalizeEmail(email);
  const bucket = driverStore[key];
  if (!bucket) return;
  const entry = bucket.find((item) => item.id === requestId);
  if (!entry) return;
  updateStatus(entry.passengerEmail, entry.rideId, 'accepted');
};

export const rejectDriverReservationRequest = (email: string | null, requestId: string) => {
  if (!email) return;
  const key = normalizeEmail(email);
  const bucket = driverStore[key];
  if (!bucket) return;
  const entry = bucket.find((item) => item.id === requestId);
  if (!entry) return;
  updateStatus(entry.passengerEmail, entry.rideId, 'rejected');
};

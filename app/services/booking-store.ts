import { creditWallet } from './wallet';
import type { LatLng } from '@/app/services/location';

const STORAGE_KEY = 'campusride_bookings_v1';

export type BookingStatus = 'pending' | 'accepted' | 'paid' | 'cancelled' | 'completed';

export type BookingPaymentMethod = 'wallet' | 'cash' | 'card' | 'pass' | 'none';

export type BookingPaymentStatus = 'unpaid' | 'paid' | 'refunded';

const validStatuses: BookingStatus[] = ['pending', 'accepted', 'paid', 'cancelled', 'completed'];
const PAID_STATUSES: BookingStatus[] = ['paid', 'completed'];
const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['pending', 'accepted', 'paid'];
const normalizeStatus = (status?: string): BookingStatus => {
  if (!status) return 'pending';
  if (status === 'confirmed') return 'paid';
  if (status === 'awaiting_payment') return 'accepted';
  if (validStatuses.includes(status as BookingStatus)) return status as BookingStatus;
  return 'pending';
};

const normalizeBooking = (booking: Booking): Booking => {
  const status = normalizeStatus(booking.status);
  const isPaidStatus = PAID_STATUSES.includes(status);
  const amountPaid = booking.amountPaid ?? booking.pricePaid;
  const paymentMethod = booking.paymentMethod ?? 'none';
  const paid = booking.paid ?? isPaidStatus;
  const paymentStatus =
    booking.paymentStatus ?? (isPaidStatus ? 'paid' : 'unpaid');

  if (
    status !== booking.status ||
    amountPaid !== booking.amountPaid ||
    paymentMethod !== booking.paymentMethod ||
    paid !== booking.paid ||
    paymentStatus !== booking.paymentStatus
  ) {
    return {
      ...booking,
      status,
      amountPaid,
      paymentMethod,
      paid,
      paymentStatus,
    };
  }

  return booking;
};

const sanitizeBucket = (bucket: Booking[]) => {
  let dirty = false;
  const normalized = bucket.map((booking) => {
    const sanitized = normalizeBooking(booking);
    if (sanitized !== booking) {
      dirty = true;
    }
    return sanitized;
  });
  return dirty ? normalized : bucket;
};

const hydrateState = (state: Record<string, Booking[]>) => {
  const nextState: Record<string, Booking[]> = {};
  let dirty = false;
  Object.keys(state).forEach((key) => {
    const bucket = state[key] ?? [];
    const normalized = sanitizeBucket(bucket);
    if (normalized !== bucket) {
      dirty = true;
    }
    nextState[key] = normalized;
  });
  if (dirty) {
    writeStorage(nextState);
    return nextState;
  }
  return state;
};

export type Booking = {
  id: string;
  rideId: string;
  passengerEmail: string;
  status: BookingStatus;
  paid: boolean;
  paymentMethod?: BookingPaymentMethod;
  amount: number;
  amountPaid?: number;
  pricePaid?: number;
  paidAt?: number;
  paymentStatus?: BookingPaymentStatus;
  createdAt: number;
  depart: string;
  destination: string;
  driver: string;
  ownerEmail: string;
  departureAt: number;
  meetingPoint?: string | null;
  time?: string;
  dateLabel?: string;
  plate?: string | null;
  driverPlate?: string | null;
  maskedPlate?: string | null;
  meetingPointAddress?: string | null;
  meetingPointLatLng?: LatLng | null;
  cancelledAt?: number;
  refundedAt?: number;
  completedAt?: number;
  acceptedAt?: number;
  rating?: number;
  reviewComment?: string | null;
  reviewTags?: string[] | null;
};

type Listener = (bookings: Booking[]) => void;

const safeParse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const readStorage = (): Record<string, Booking[]> => {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  const raw = safeParse<Record<string, Booking[]>>(window.localStorage.getItem(STORAGE_KEY), {});
  return hydrateState(raw);
};

const writeStorage = (state: Record<string, Booking[]>) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const listeners: Record<string, Listener[]> = {};

const emit = (email: string) => {
  const key = normalizeEmail(email);
  const state = readStorage();
  const bucket = state[key] ?? [];
  listeners[key]?.forEach((listener) => listener([...bucket]));
};

export const listBookingsByPassenger = (email: string) => {
  const key = normalizeEmail(email);
  const state = readStorage();
  return [...(state[key] ?? [])];
};

export const getBookingById = (email: string, bookingId: string) => {
  if (!email) return null;
  const key = normalizeEmail(email);
  if (!key) return null;
  const state = readStorage();
  const bucket = state[key] ?? [];
  return bucket.find((booking) => booking.id === bookingId) ?? null;
};

export const getLatestBookingForRide = (email: string | null, rideId: string) => {
  if (!email || !rideId) return null;
  const key = normalizeEmail(email);
  if (!key) return null;
  const state = readStorage();
  const bucket = state[key] ?? [];
  const bookingsForRide = bucket.filter((booking) => booking.rideId === rideId);
  if (!bookingsForRide.length) return null;
  return bookingsForRide.reduce((latest, candidate) =>
    candidate.createdAt > latest.createdAt ? candidate : latest
  );
};

export const isActiveBookingStatus = (status: BookingStatus) =>
  ACTIVE_BOOKING_STATUSES.includes(status);

export const getActiveBookingForRide = (email: string, rideId: string) => {
  if (!email || !rideId) return null;
  const key = normalizeEmail(email);
  if (!key) return null;
  const state = readStorage();
  const bucket = state[key] ?? [];
  const activeBookings = bucket.filter(
    (booking) => booking.rideId === rideId && isActiveBookingStatus(booking.status)
  );
  if (!activeBookings.length) return null;
  return activeBookings.reduce((latest, candidate) =>
    candidate.createdAt > latest.createdAt ? candidate : latest
  );
};

export const getBookingForRide = (email: string, rideId: string) => {
  if (!email || !rideId) return null;
  const key = normalizeEmail(email);
  if (!key) return null;
  const state = readStorage();
  const bucket = state[key] ?? [];
  const bookingsForRide = bucket.filter((booking) => booking.rideId === rideId);
  if (!bookingsForRide.length) return null;
  return bookingsForRide.reduce((latest, candidate) =>
    candidate.createdAt > latest.createdAt ? candidate : latest
  );
};

export const isActiveRequest = (booking: Booking) =>
  booking.status === 'pending' || booking.status === 'accepted';

export const isBlockingReservation = (booking: Booking) =>
  ['pending', 'accepted', 'paid'].includes(booking.status);

export const isHistoryBooking = (booking: Booking) =>
  booking.status === 'completed' || booking.status === 'cancelled';

export const removeBookingsByRide = (rideId: string) => {
  if (!rideId) return;
  const state = readStorage();
  const dirtyKeys: string[] = [];
  Object.keys(state).forEach((key) => {
    const bucket = state[key] ?? [];
    const filtered = bucket.filter((booking) => booking.rideId !== rideId);
    if (filtered.length !== bucket.length) {
      state[key] = filtered;
      dirtyKeys.push(key);
    }
  });
  if (!dirtyKeys.length) return;
  writeStorage(state);
  dirtyKeys.forEach((key) => emit(key));
};

export const createBooking = (booking: Booking) => {
  const key = normalizeEmail(booking.passengerEmail);
  if (!key) {
    return { ok: false, reason: 'missing_email' };
  }
  const storedBooking: Booking = normalizeBooking({
    ...booking,
    amountPaid: booking.amountPaid ?? booking.pricePaid,
    paymentMethod: booking.paymentMethod ?? 'none',
  });
  console.log('[Booking] created', {
    id: storedBooking.id,
    rideId: storedBooking.rideId,
    status: storedBooking.status,
    passengerEmail: storedBooking.passengerEmail,
  });
  console.debug('[BookingStore] stored booking', storedBooking);
  const state = readStorage();
  const bucket = state[key] ?? [];
  const existsIndex = bucket.findIndex((item) => item.id === storedBooking.id);
  if (existsIndex >= 0) {
    bucket[existsIndex] = storedBooking;
  } else {
    bucket.unshift(storedBooking);
  }
  state[key] = bucket;
  writeStorage(state);
  emit(booking.passengerEmail);
  return { ok: true };
};

export const patchBooking = (
  passengerEmail: string,
  bookingId: string,
  patch: Partial<Booking>
) => {
  const key = normalizeEmail(passengerEmail);
  if (!key) return { ok: false, reason: 'missing_email' as const };
  const state = readStorage();
  const bucket = state[key] ?? [];
  const index = bucket.findIndex((entry) => entry.id === bookingId);
  if (index < 0) {
    return { ok: false, reason: 'not_found' as const };
  }
  const updated = normalizeBooking({ ...bucket[index], ...patch });
  bucket[index] = updated;
  state[key] = bucket;
  writeStorage(state);
  emit(passengerEmail);
  return { ok: true, booking: updated };
};

export const updateBooking = (
  passengerEmail: string,
  bookingId: string,
  patch: Partial<Booking>
) => patchBooking(passengerEmail, bookingId, patch);

export const cancelBooking = async (
  bookingId: string,
  options?: { refundWallet?: boolean }
) => {
  const state = readStorage();
  const keys = Object.keys(state);
  for (const key of keys) {
    const bucket = state[key];
    const index = bucket.findIndex((entry) => entry.id === bookingId);
    if (index < 0) continue;
    const entry = bucket[index];
    console.debug('[CancelBooking] start', {
      bookingId,
      amountPaid: entry.amountPaid,
      paymentMethod: entry.paymentMethod,
    });
    if (entry.status === 'cancelled') {
      console.debug('[CancelBooking] done', { bookingId, reason: 'already_cancelled' });
      return;
    }
    let refunded = false;
    if (
      options?.refundWallet &&
      entry.paymentMethod === 'wallet' &&
      entry.amountPaid &&
      entry.amountPaid > 0
    ) {
      creditWallet(entry.passengerEmail, entry.amountPaid, {
        description: `Remboursement trajet ${entry.depart} → ${entry.destination}`,
        rideId: entry.rideId,
      });
      refunded = true;
      console.debug('[CancelBooking] refunded', { bookingId, amount: entry.amountPaid });
    }
    const updated: Booking = {
      ...entry,
      status: 'cancelled',
      cancelledAt: Date.now(),
      refundedAt: refunded ? Date.now() : entry.refundedAt,
      paid: false,
      paymentStatus: refunded ? 'refunded' : 'unpaid',
    };
    bucket[index] = updated;
    state[key] = bucket;
    writeStorage(state);
    emit(entry.passengerEmail);
    console.debug('[CancelBooking] done', { bookingId });
    console.debug('[Cancel] booking cancelled', bookingId);
    return;
  }
  throw new Error('booking_not_found');
};

export const subscribeBookingsByPassenger = (email: string | null, listener: Listener) => {
  if (!email) {
    listener([]);
    return () => undefined;
  }
  const key = normalizeEmail(email);
  if (!listeners[key]) listeners[key] = [];
  listeners[key].push(listener);
  listener(listBookingsByPassenger(email));
  return () => {
    const bucket = listeners[key];
    const index = bucket ? bucket.indexOf(listener) : -1;
    if (index >= 0) bucket.splice(index, 1);
  };
};

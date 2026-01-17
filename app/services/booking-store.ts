const STORAGE_KEY = 'campusride_bookings_v1';

export type Booking = {
  id: string;
  rideId: string;
  passengerEmail: string;
  status: 'confirmed' | 'paid' | 'completed';
  paid: boolean;
  paymentMethod: 'wallet' | 'card' | 'pass';
  paidAt: number;
  amount: number;
  pricePaid?: number;
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
  completedAt?: number;
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
  return safeParse<Record<string, Booking[]>>(window.localStorage.getItem(STORAGE_KEY), {});
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
  return state[key] ?? [];
};

export const createBooking = (booking: Booking) => {
  console.debug('[BookingStore] stored booking', booking);
  const key = normalizeEmail(booking.passengerEmail);
  if (!key) {
    return { ok: false, reason: 'missing_email' };
  }
  const state = readStorage();
  const bucket = state[key] ?? [];
  const existsIndex = bucket.findIndex((item) => item.rideId === booking.rideId && item.passengerEmail === key);
  if (existsIndex >= 0) {
    bucket[existsIndex] = booking;
  } else {
    bucket.unshift(booking);
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
  const updated = { ...bucket[index], ...patch };
  bucket[index] = updated;
  state[key] = bucket;
  writeStorage(state);
  emit(passengerEmail);
  return { ok: true, booking: updated };
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

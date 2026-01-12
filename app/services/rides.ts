// app/services/rides.ts
import { resolveAreaFromPlace } from '../constants/areas';
import {
  CAMPUSPOINTS_PER_PASSENGER,
  CAMPUSRIDE_COMMISSION_RATE,
} from '../constants/fuel';
import {
  cancelNotificationSchedule,
  getAreaSubscribers,
  pushNotification,
} from './notifications';
import { processPayment, type Payment, type PaymentMethod } from './payments';
import { creditWallet, addPoints } from './wallet';
import { recordCommission } from './platform';
import {
  markRideCancelledRecord,
  persistRideRecord,
} from '@/src/firestoreRides';
import { recordPublishedRide, recordReservedRide } from '@/src/firestoreTrips';
import { maskPlate } from '@/app/utils/plate';
import { getDistanceKm } from './distance';
import { buildPriceBand, roughKmFromText } from './pricing';
export type Ride = {
  id: string;
  driver: string;
  plate: string;
  depart: string;
  destination: string;
  time: string;   // HH:MM
  seats: number;  // 1..3
  price: number;  // € / passager
  pricingMode: 'single' | 'double';
  createdAt: number;
  ownerEmail: string;
  passengers: string[];
  canceledPassengers: string[];
  updatedAt: number;
  departureAt: number;
  payoutProcessed: boolean;
};

let rides: Ride[] = [];
type Listener = (items: Ride[]) => void;
const listeners: Listener[] = [];

const clone = (data: Ride[]) =>
  data.map((item) => ({ ...item, passengers: [...item.passengers], canceledPassengers: [...item.canceledPassengers] }));

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const normalizeEmail = (value: string) => value.trim().toLowerCase();

const persistRideSnapshot = (ride: Ride) => {
  void persistRideRecord(ride).catch((error) => {
    console.warn('[rides][firestore] sync failed', error);
  });
};

const cancelRideSnapshot = (ride: Ride, reason?: string) => {
  void markRideCancelledRecord(ride, reason).catch((error) => {
    console.warn('[rides][firestore] cancel failed', error);
  });
};

export type RidePayload = {
  id: string;
  driver: string;
  plate: string;
  depart: string;
  destination: string;
  time: string;
  seats: number;
  price: number;
  ownerEmail: string;
  pricingMode?: 'single' | 'double';
};

const capitalise = (segment: string) =>
  segment ? segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase() : segment;

const sanitiseText = (label: keyof Pick<RidePayload, 'driver' | 'depart' | 'destination'>, value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Champ ${label} invalide`);
  }
  return trimmed
    .split(/\s+/)
    .map((part) => capitalise(part))
    .join(' ');
};

const sanitiseTime = (value: string) => {
  if (!TIME_PATTERN.test(value)) {
    throw new Error('Heure invalide (attendu HH:MM)');
  }
  return value;
};

const sanitisePlate = (value: string) => {
  const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!/^[0-9][A-Z]{3}[0-9]{3}$/.test(clean)) {
    throw new Error('Plaque invalide (ex. 2-EEE-222)');
  }
  return `${clean.slice(0, 1)}-${clean.slice(1, 4)}-${clean.slice(4, 7)}`;
};

const sanitiseSeats = (value: number) => {
  if (!Number.isInteger(value) || value < 1 || value > 3) {
    throw new Error('Places disponibles hors limites (1-3)');
  }
  return value;
};

const computeDepartureAt = (time: string, reference = Date.now()) => {
  const now = new Date(reference);
  const departure = new Date(reference);
  const [hours, minutes] = time.split(':').map((part) => parseInt(part, 10));
  departure.setHours(hours, minutes, 0, 0);
  if (departure.getTime() <= now.getTime()) {
    departure.setDate(departure.getDate() + 1);
  }
  return departure.getTime();
};

const resolveDistanceKm = (depart: string, destination: string) => {
  const distance = getDistanceKm(depart, destination);
  if (!Number.isFinite(distance) || distance <= 0) {
    return roughKmFromText(depart, destination);
  }
  return distance;
};

const computeRidePrice = (
  depart: string,
  destination: string,
  seats: number,
  mode: 'single' | 'double'
) => {
  const distanceKm = resolveDistanceKm(depart, destination);
  const band = buildPriceBand(distanceKm, seats);
  const raw = mode === 'double' ? band.double : band.suggested;
  return Number(raw.toFixed(2));
};

export const hasRideDeparted = (ride: Ride, now = Date.now()) => now >= ride.departureAt;

const reminderKey = (rideId: string, email: string, role: 'driver' | 'passenger') =>
  `${rideId}:${email.toLowerCase()}:${role}:reminder`;

const REMINDER_OFFSET_MINUTES = 30;

const scheduleRideReminder = (ride: Ride, email: string, role: 'driver' | 'passenger') => {
  const scheduleAt = ride.departureAt - REMINDER_OFFSET_MINUTES * 60 * 1000;
  if (scheduleAt <= Date.now() + 1000) {
    return;
  }
  const scheduleKey = reminderKey(ride.id, email, role);
  cancelNotificationSchedule(scheduleKey);
  pushNotification({
    to: email,
    title: 'Rappel trajet',
    body:
      role === 'driver'
        ? `Tu pars bientôt vers ${ride.destination}. Pense à prévenir tes passagers.`
        : `Ton trajet ${ride.depart} → ${ride.destination} démarre dans ${REMINDER_OFFSET_MINUTES} min.`,
    metadata: {
      action: 'ride-reminder',
      rideId: ride.id,
      role,
      depart: ride.depart,
      destination: ride.destination,
      time: ride.time,
    },
    scheduleAt,
    scheduleKey,
  });
};

const cancelRideReminder = (rideId: string, email: string, role: 'driver' | 'passenger') => {
  cancelNotificationSchedule(reminderKey(rideId, email, role));
};

const formatPassengerDisplay = (email: string) => {
  const alias = email.split('@')[0] ?? email;
  return alias
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const buildRide = (payload: RidePayload): Ride => {
  const driver = sanitiseText('driver', payload.driver);
  const depart = sanitiseText('depart', payload.depart);
  const destination = sanitiseText('destination', payload.destination);
  const plate = sanitisePlate(payload.plate);
  const time = sanitiseTime(payload.time);
  const seats = sanitiseSeats(payload.seats);
  const ownerEmail = payload.ownerEmail.trim().toLowerCase();
  const pricingMode = payload.pricingMode ?? 'single';
  const price = computeRidePrice(depart, destination, seats, pricingMode);

  const createdAt = Date.now();
  const departureAt = computeDepartureAt(time, createdAt);

  return {
    id: payload.id,
    driver,
    plate,
    depart,
    destination,
    time,
    seats,
    price,
    ownerEmail,
    pricingMode,
    passengers: [],
    canceledPassengers: [],
    createdAt,
    updatedAt: createdAt,
    departureAt,
    payoutProcessed: false,
  };
};

const updateRideFromPatch = (ride: Ride, patch: Partial<RidePayload>): Ride => {
  if (hasRideDeparted(ride)) {
    throw new Error('Impossible de modifier un trajet déjà parti.');
  }

  const next: Ride = { ...ride };

  if (patch.driver !== undefined) next.driver = sanitiseText('driver', patch.driver);
  if (patch.plate !== undefined) next.plate = sanitisePlate(patch.plate);
  if (patch.depart !== undefined) next.depart = sanitiseText('depart', patch.depart);
  if (patch.destination !== undefined) next.destination = sanitiseText('destination', patch.destination);
  if (patch.ownerEmail !== undefined) next.ownerEmail = patch.ownerEmail.trim().toLowerCase();

  if (patch.time !== undefined) {
    const time = sanitiseTime(patch.time);
    next.time = time;
    const reference = Math.max(Date.now(), ride.createdAt);
    next.departureAt = computeDepartureAt(time, reference);
  }

  if (patch.seats !== undefined) {
    const seats = sanitiseSeats(patch.seats);
    if (ride.passengers.length > seats) {
      throw new Error('Impossible de réduire les places en dessous des réservations existantes.');
    }
    next.seats = seats;
  }

  if (patch.pricingMode !== undefined) next.pricingMode = patch.pricingMode;

  next.price = computeRidePrice(next.depart, next.destination, next.seats, next.pricingMode);

  next.updatedAt = Date.now();
  return next;
};

(() => {
  // Jeu de données initial désactivé : la carte reste vide tant qu'aucun trajet réel n'est saisi.
  rides = [];
})();

const processRidePayouts = () => {
  const now = Date.now();
  const updatedRides: Ride[] = [];
  rides = rides.map((ride) => {
    if (ride.payoutProcessed) return ride;
    if (!hasRideDeparted(ride, now)) return ride;
    const passengerCount = ride.passengers.length;
    if (passengerCount <= 0) {
      const nextRide = { ...ride, payoutProcessed: true, updatedAt: now };
      updatedRides.push(nextRide);
      return nextRide;
    }
    const grossAmount = +(ride.price * passengerCount).toFixed(2);
    if (grossAmount > 0) {
      const commission = +(grossAmount * CAMPUSRIDE_COMMISSION_RATE).toFixed(2);
      const driverNet = +(grossAmount - commission).toFixed(2);
      if (driverNet > 0) {
        creditWallet(ride.ownerEmail, driverNet, {
          description: `Trajet ${ride.depart} → ${ride.destination}`,
          rideId: ride.id,
          grossAmount,
          commission,
        });
        addPoints(
          ride.ownerEmail,
          CAMPUSPOINTS_PER_PASSENGER * passengerCount,
          'Trajet complété'
        );
      }
      if (commission > 0) {
        recordCommission(ride.id, commission, {
          passengers: passengerCount,
          depart: ride.depart,
          destination: ride.destination,
        });
      }
      pushNotification({
        to: ride.ownerEmail,
        title: 'Versement reçu',
        body: `€${driverNet.toFixed(2)} crédités suite à ton trajet ${ride.depart} → ${ride.destination}.`,
        metadata: {
          rideId: ride.id,
          action: 'wallet-credit',
          amount: driverNet,
          commission,
        },
      });
    }
    const completedRide = { ...ride, payoutProcessed: true, updatedAt: now };
    updatedRides.push(completedRide);
    return completedRide;
  });
  updatedRides.forEach((ride) => persistRideSnapshot(ride));
};

const notifyRides = () => {
  processRidePayouts();
  const snapshot = clone(rides);
  listeners.forEach((l) => l(snapshot));
};

export const getRides = () => {
  processRidePayouts();
  return clone(rides);
};

export const addRide = (payload: RidePayload) => {
  const ride = buildRide(payload);
  rides = [ride, ...rides];
  scheduleRideReminder(ride, ride.ownerEmail, 'driver');
  const area = resolveAreaFromPlace(ride.depart);
  if (area) {
    const recipients = getAreaSubscribers(area.id).filter((email) => email !== ride.ownerEmail);
    const title = `Nouveau trajet ${area.label}`;
    const body = `${ride.driver} (${maskPlate(ride.plate)}) part vers ${ride.destination} à ${ride.time}.`;
    recipients.forEach((to) =>
      pushNotification({
        to,
        title,
        body,
        metadata: {
          rideId: ride.id,
          action: 'ride-published',
          areaId: area.id,
          driver: ride.driver,
          plate: ride.plate,
          time: ride.time,
          destination: ride.destination,
          depart: ride.depart,
        },
      })
    );
  }
  persistRideSnapshot(ride);
  void recordPublishedRide(ride);
  notifyRides();
  return ride;
};

export const updateRide = (id: string, patch: Partial<RidePayload>) => {
  let updated: Ride | null = null;
  let previous: Ride | null = null;
  rides = rides.map((r) => {
    if (r.id !== id) return r;
    previous = r;
    updated = updateRideFromPatch(r, patch);
    return updated;
  });
  if (!updated) {
    throw new Error('Trajet introuvable');
  }
  notifyRides();
  notifyRideStatusChange(previous, updated);
  persistRideSnapshot(updated);
  return updated;
};

export const removeRide = (id: string) => {
  const target = rides.find((r) => r.id === id);
  if (!target) {
    throw new Error('Trajet introuvable');
  }
  if (hasRideDeparted(target)) {
    throw new Error('Impossible de supprimer un trajet déjà parti.');
  }
  target.passengers.forEach((passengerEmail) => {
    pushNotification({
      to: passengerEmail,
      title: 'Trajet annulé',
      body: `${target.driver} a annulé ${target.depart} → ${target.destination}.`,
      metadata: {
        action: 'ride-cancelled',
        rideId: target.id,
      },
    });
    cancelRideReminder(target.id, passengerEmail, 'passenger');
  });
  cancelRideReminder(target.id, target.ownerEmail, 'driver');
  rides = rides.filter((r) => r.id !== id);
  cancelRideSnapshot(target, 'driver_cancelled');
  notifyRides();
};

export const subscribeRides = (cb: Listener) => {
  listeners.push(cb);
  cb(getRides());
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
};

export type ReservationFailureReason =
  | 'DEPARTED'
  | 'ALREADY_RESERVED'
  | 'FULL'
  | 'PAYMENT_WALLET'
  | 'PAYMENT_PASS'
  | 'PAYMENT_UNKNOWN';

export type ReservationResult =
  | { ok: true; ride: Ride; payment: Payment }
  | { ok: false; reason: ReservationFailureReason; details?: string };

export type ReservationOptions = {
  paymentMethod?: PaymentMethod;
};

export const reserveSeat = (
  rideId: string,
  passengerEmail: string,
  options: ReservationOptions = {}
): ReservationResult => {
  let updated: Ride | null = null;
  let payment: Payment | null = null;
  let failure: ReservationFailureReason | null = null;
  let failureDetails: string | undefined;
  const method = options.paymentMethod;

  rides = rides.map((ride) => {
    if (ride.id !== rideId) return ride;
    if (hasRideDeparted(ride)) {
      failure = 'DEPARTED';
      return ride;
    }
    if (ride.passengers.includes(passengerEmail)) {
      failure = 'ALREADY_RESERVED';
      return ride;
    }
    if (ride.passengers.length >= ride.seats) {
      failure = 'FULL';
      return ride;
    }
    try {
      payment = processPayment(ride, passengerEmail, { method });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown payment error';
      if (message === 'WALLET_INSUFFICIENT_FUNDS') {
        failure = 'PAYMENT_WALLET';
      } else if (message === 'NO_PASS_CREDIT') {
        failure = 'PAYMENT_PASS';
      } else {
        failure = 'PAYMENT_UNKNOWN';
      }
      failureDetails = message;
      return ride;
    }
    updated = {
      ...ride,
      passengers: [...ride.passengers, passengerEmail],
      updatedAt: Date.now(),
    };
    return updated;
  });

  if (updated && payment) {
    notifyRides();
    const passengerDisplay = formatPassengerDisplay(passengerEmail);
    pushNotification({
      to: updated.ownerEmail,
      title: 'Nouvelle réservation confirmée',
      body: `${passengerDisplay} rejoint ton trajet ${updated.depart} → ${updated.destination}.`,
      metadata: {
        action: 'reservation-confirmed',
        rideId: updated.id,
        passenger: passengerDisplay,
      },
    });
    pushNotification({
      to: passengerEmail,
      title: 'Réservation confirmée',
      body: `Ta place pour ${updated.depart} → ${updated.destination} est confirmée.`,
      metadata: {
        action: 'reservation-confirmed',
        rideId: updated.id,
        driver: updated.driver,
      },
    });
    scheduleRideReminder(updated, passengerEmail, 'passenger');
    persistRideSnapshot(updated);
    void recordReservedRide(updated, passengerEmail);
    return { ok: true, ride: updated, payment };
  }

  return { ok: false, reason: failure ?? 'FULL', details: failureDetails };
};

export const confirmReservationWithoutPayment = (rideId: string, passengerEmail: string): Ride | null => {
  const email = passengerEmail.trim().toLowerCase();
  let updated: Ride | null = null;
  rides = rides.map((ride) => {
    if (ride.id !== rideId) return ride;
    if (ride.passengers.includes(email)) return ride;
    if (ride.passengers.length >= ride.seats) return ride;
    updated = {
      ...ride,
      passengers: [...ride.passengers, email],
      updatedAt: Date.now(),
    };
    return updated;
  });
  if (!updated) {
    return null;
  }
  notifyRides();
  const passengerDisplay = formatPassengerDisplay(email);
  pushNotification({
    to: updated.ownerEmail,
    title: 'Réservation confirmée',
    body: `${passengerDisplay} rejoint ton trajet ${updated.depart} → ${updated.destination}.`,
    metadata: {
      action: 'reservation-confirmed',
      rideId: updated.id,
      passenger: passengerDisplay,
    },
  });
  pushNotification({
    to: email,
    title: 'Demande acceptée',
    body: `Ta place pour ${updated.depart} → ${updated.destination} est confirmée.`,
    metadata: {
      action: 'reservation-confirmed',
      rideId: updated.id,
      driver: updated.driver,
    },
  });
  scheduleRideReminder(updated, email, 'passenger');
  return updated;
};

export const cancelReservation = (rideId: string, passengerEmail: string) => {
  let updated: Ride | null = null;
  rides = rides.map((ride) => {
    if (ride.id !== rideId) return ride;
    if (!ride.passengers.includes(passengerEmail)) return ride;
    if (ride.passengers.includes(passengerEmail)) {
      const updatedAt = Date.now();
      const nextPassengers = ride.passengers.filter((mail) => mail !== passengerEmail);
      const nextCanceled = ride.canceledPassengers.includes(passengerEmail)
        ? ride.canceledPassengers
        : [...ride.canceledPassengers, passengerEmail];
      updated = {
        ...ride,
        passengers: nextPassengers,
        canceledPassengers: nextCanceled,
        updatedAt,
      };

      const passengerDisplay = formatPassengerDisplay(passengerEmail);

      pushNotification({
        to: ride.ownerEmail,
        title: 'Réservation annulée',
        body: `${passengerDisplay} a annulé sa place sur ${ride.depart} → ${ride.destination}.`,
        metadata: {
          action: 'reservation-cancelled',
          rideId: ride.id,
          passenger: passengerDisplay,
        },
      });
      pushNotification({
        to: passengerEmail,
        title: 'Réservation annulée',
        body: `Ta réservation pour ${ride.depart} → ${ride.destination} est annulée.`,
        metadata: {
          action: 'reservation-cancelled-confirmation',
          rideId: ride.id,
        },
      });
      cancelRideReminder(ride.id, passengerEmail, 'passenger');
    }
    return updated;
  });
  if (updated) {
    notifyRides();
    persistRideSnapshot(updated);
    return updated;
  }
  return null;
};

export const getRide = (id: string) => {
  processRidePayouts();
  return rides.find((r) => r.id === id);
};

const notifyRideStatusChange = (previous: Ride | null, updated: Ride | null) => {
  if (!previous || !updated) return;
  const changed: string[] = [];
  if (previous.time !== updated.time) changed.push(`heure ${updated.time}`);
  if (previous.depart !== updated.depart || previous.destination !== updated.destination) {
    changed.push('itinéraire mis à jour');
  }
  if (previous.seats !== updated.seats) {
    changed.push(`${updated.seats} place(s) dispo`);
  }
  if (changed.length === 0) return;
  const body = `Le trajet ${updated.depart} → ${updated.destination} a changé (${changed.join(', ')}).`;
  updated.passengers.forEach((email) =>
    pushNotification({
      to: email,
      title: 'Trajet mis à jour',
      body,
      metadata: {
        action: 'ride-status-changed',
        rideId: updated.id,
        depart: updated.depart,
        destination: updated.destination,
        time: updated.time,
      },
    })
  );
  if (previous.departureAt !== updated.departureAt) {
    cancelRideReminder(updated.id, updated.ownerEmail, 'driver');
    scheduleRideReminder(updated, updated.ownerEmail, 'driver');
    updated.passengers.forEach((email) => scheduleRideReminder(updated, email, 'passenger'));
  }
};

export const purgeUserRides = (email: string) => {
  if (!email) return;
  const normalized = normalizeEmail(email);
  let changed = false;

  const owned = rides.filter((ride) => ride.ownerEmail === normalized);
  owned.forEach((ride) => {
    cancelRideReminder(ride.id, ride.ownerEmail, 'driver');
    ride.passengers.forEach((passenger) => cancelRideReminder(ride.id, passenger, 'passenger'));
  });
  if (owned.length) {
    changed = true;
    rides = rides.filter((ride) => ride.ownerEmail !== normalized);
  }

  rides = rides.map((ride) => {
    const hasPassenger = ride.passengers.some((passenger) => normalizeEmail(passenger) === normalized);
    if (!hasPassenger) return ride;
    changed = true;
    cancelRideReminder(ride.id, email, 'passenger');
    return {
      ...ride,
      passengers: ride.passengers.filter((passenger) => normalizeEmail(passenger) !== normalized),
      canceledPassengers: ride.canceledPassengers.filter(
        (passenger) => normalizeEmail(passenger) !== normalized
      ),
      updatedAt: Date.now(),
    };
  });

  if (changed) {
    notifyRides();
  }
};

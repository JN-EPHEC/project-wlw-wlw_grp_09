import {
  collection,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

import { auth, db } from '@/src/firebase';
import type { Timestamp } from 'firebase/firestore';

export type ReservationStatus = 'pending' | 'accepted' | 'paid' | 'cancelled';

export type PassengerReservationIndexEntry = {
  reservationId: string;
  driverUid: string;
  rideId: string;
  status: ReservationStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type RideRecord = {
  depart?: string;
  destination?: string;
  departureAt?: number | Timestamp;
  price?: number;
  availableSeats?: number;
};

const normalizeEmail = (value?: string | null) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const ensurePositiveInteger = (value: number) => {
  if (!Number.isFinite(value) || value < 1 || Math.floor(value) !== value) {
    throw new Error('Nombre de places invalide');
  }
  return value;
};

const ensureRideSnapshot = (ride: RideRecord) => {
  const depart = ride.depart;
  const destination = ride.destination;
  const departureAt = ride.departureAt;
  const price = ride.price;
  if (typeof depart !== 'string' || !depart.trim()) {
    throw new Error('Informations du trajet introuvables');
  }
  if (typeof destination !== 'string' || !destination.trim()) {
    throw new Error('Informations du trajet introuvables');
  }
  if (departureAt == null) {
    throw new Error('Informations du trajet introuvables');
  }
  if (typeof price !== 'number') {
    throw new Error('Informations du trajet introuvables');
  }
  return {
    depart: depart.trim(),
    destination: destination.trim(),
    departureAt,
    price,
  };
};

const generateReservationId = () => {
  const suffix = Math.random().toString(36).substring(2, 8);
  return `res-${Date.now()}-${suffix}`;
};

const isValidReservationStatus = (value: unknown): value is ReservationStatus => {
  return value === 'pending' || value === 'accepted' || value === 'paid' || value === 'cancelled';
};

export const createReservation = async (
  driverUid: string,
  rideId: string,
  seatsRequested: number
): Promise<{ reservationId: string }> => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Utilisateur non connecté');
  }
  if (!driverUid) {
    throw new Error('Identifiant du conducteur invalide');
  }
  if (!rideId) {
    throw new Error('Identifiant du trajet invalide');
  }
  const seats = ensurePositiveInteger(seatsRequested);

  const trajetRef = doc(db, 'trajets', driverUid);
  const trajetSnap = await getDoc(trajetRef);
  if (!trajetSnap.exists()) {
    throw new Error('Conducteur introuvable');
  }

  const trajetData = trajetSnap.data() as Record<string, unknown>;
  const publies = (trajetData.publies ?? {}) as Record<string, RideRecord>;
  const ride = publies[rideId];
  if (!ride) {
    throw new Error('Trajet introuvable');
  }

  const availableSeats =
    typeof ride.availableSeats === 'number' ? ride.availableSeats : Number.POSITIVE_INFINITY;
  if (availableSeats < seats) {
    throw new Error('Pas assez de places disponibles');
  }

  const passengerEmail = normalizeEmail(currentUser.email);
  const rideSnapshot = ensureRideSnapshot(ride);
  const reservationId = generateReservationId();
  const passengerUid = currentUser.uid;
  const now = serverTimestamp();

  const reservationPayload = {
    reservationId,
    rideId,
    driverUid,
    passengerUid,
    passengerEmail,
    seatsRequested: seats,
    status: 'pending' as const,
    createdAt: now,
    updatedAt: now,
    rideSnapshot,
  };

  const passengerReservationRef = doc(db, 'users', passengerUid, 'reservations', reservationId);
  const batch = writeBatch(db);
  const reservationFieldPath = new FieldPath('reservations', reservationId);
  batch.update(trajetRef, {
    [reservationFieldPath]: reservationPayload,
    updatedAt: now,
  });
  batch.set(passengerReservationRef, {
    reservationId,
    driverUid,
    rideId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  await batch.commit();
  return { reservationId };
};

export const listMyReservationsAsPassenger = async (
  passengerUid: string
): Promise<PassengerReservationIndexEntry[]> => {
  if (!passengerUid) {
    throw new Error('Passager non identifié');
  }
  const reservationsCol = collection(db, 'users', passengerUid, 'reservations');
  const reservationsQuery = query(reservationsCol, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(reservationsQuery);
  return snapshot.docs.map((docSnap) => ({
    reservationId: docSnap.id,
    ...(docSnap.data() as Omit<PassengerReservationIndexEntry, 'reservationId'>),
  }));
};

export const driverUpdateReservationStatus = async (
  driverUid: string,
  reservationId: string,
  status: ReservationStatus
) => {
  if (!driverUid) {
    throw new Error('Conducteur non identifié');
  }
  if (!reservationId) {
    throw new Error('Réservation non identifiée');
  }
  if (!isValidReservationStatus(status)) {
    throw new Error('Statut invalide');
  }

  const trajetRef = doc(db, 'trajets', driverUid);
  const trajetSnap = await getDoc(trajetRef);
  if (!trajetSnap.exists()) {
    throw new Error('Conducteur introuvable');
  }
  const trajetData = trajetSnap.data() as Record<string, unknown>;
  const reservations = (trajetData.reservations ?? {}) as Record<string, Record<string, unknown>>;
  const existing = reservations[reservationId];
  if (!existing) {
    throw new Error('Réservation introuvable');
  }
  const passengerUid = typeof existing.passengerUid === 'string' ? existing.passengerUid : null;
  const now = serverTimestamp();
  const batch = writeBatch(db);
  const statusPath = new FieldPath('reservations', reservationId, 'status');
  const entryUpdatedAtPath = new FieldPath('reservations', reservationId, 'updatedAt');
  batch.update(trajetRef, {
    [statusPath]: status,
    [entryUpdatedAtPath]: now,
    updatedAt: now,
  });
  if (passengerUid) {
    const passengerReservationRef = doc(db, 'users', passengerUid, 'reservations', reservationId);
    batch.update(passengerReservationRef, {
      status,
      updatedAt: now,
    });
  }
  await batch.commit();
};

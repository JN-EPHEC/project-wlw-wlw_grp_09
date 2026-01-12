import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebase';

type RideSnapshot = {
  id: string;
  driver: string;
  ownerEmail: string;
  depart: string;
  destination: string;
  time: string;
  seats: number;
  price: number;
  passengers: string[];
  createdAt: number;
  updatedAt: number;
  departureAt: number;
  payoutProcessed?: boolean;
};

const tripsCol = collection(db, 'trajets');
const usersCol = collection(db, 'users');
const emailCache = new Map<string, string>();

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const resolveUserUid = async (email: string) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (emailCache.has(normalized)) {
    return emailCache.get(normalized)!;
  }
  const snapshot = await getDocs(query(usersCol, where('email', '==', normalized)));
  const docSnap = snapshot.docs[0];
  if (!docSnap) return null;
  emailCache.set(normalized, docSnap.id);
  return docSnap.id;
};

const buildRidePayload = (ride: RideSnapshot) => ({
  rideId: ride.id,
  driver: ride.driver,
  driverEmail: normalizeEmail(ride.ownerEmail),
  depart: ride.depart,
  destination: ride.destination,
  time: ride.time,
  price: ride.price,
  seats: ride.seats,
  passengers: ride.passengers.map(normalizeEmail),
  createdAt: ride.createdAt,
  updatedAt: ride.updatedAt,
  departureAt: ride.departureAt,
  payoutProcessed: !!ride.payoutProcessed,
  availableSeats: Math.max(ride.seats - ride.passengers.length, 0),
});

const persistTripRecord = async (
  uid: string,
  category: 'publies' | 'reservations',
  rideId: string,
  payload: Record<string, unknown>
) => {
  const userDoc = doc(tripsCol, uid);
  await setDoc(
    userDoc,
    {
      [category]: {
        [rideId]: {
          ...payload,
          syncedAt: serverTimestamp(),
        },
      },
    },
    { merge: true }
  );
};

export const recordPublishedRide = async (ride: RideSnapshot) => {
  try {
    const uid = await resolveUserUid(ride.ownerEmail);
    if (!uid) return;
    const payload = {
      type: 'published' as const,
      role: 'driver' as const,
      ...buildRidePayload(ride),
    };
    await persistTripRecord(uid, 'publies', ride.id, payload);
  } catch (error) {
    console.warn('[firestoreTrips] published ride sync failed', error);
  }
};

export const recordReservedRide = async (ride: RideSnapshot, passengerEmail: string) => {
  try {
    const uid = await resolveUserUid(passengerEmail);
    if (!uid) return;
    const payload = {
      type: 'reserved' as const,
      role: 'passenger' as const,
      passengerEmail: normalizeEmail(passengerEmail),
      ...buildRidePayload(ride),
      reservedAt: Date.now(),
      status: ride.departureAt <= Date.now() ? 'departed' : 'upcoming',
    };
    await persistTripRecord(uid, 'reservations', ride.id, payload);
  } catch (error) {
    console.warn('[firestoreTrips] reservation sync failed', error);
  }
};

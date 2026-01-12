import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  type DocumentReference,
} from 'firebase/firestore';

import { db } from './firebase';

export type RideRecordPayload = {
  id: string;
  driver: string;
  plate: string;
  depart: string;
  destination: string;
  time: string;
  seats: number;
  price: number;
  pricingMode: 'single' | 'double';
  ownerEmail: string;
  passengers: string[];
  canceledPassengers: string[];
  createdAt: number;
  updatedAt: number;
  departureAt: number;
  payoutProcessed: boolean;
};

export type RideRecordStatus = 'scheduled' | 'ongoing' | 'completed' | 'cancelled';

type PersistOptions = {
  status?: RideRecordStatus;
  cancellationReason?: string | null;
};

const ridesCol = collection(db, 'rides');
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizeEmails = (list: string[]) => list.map((email) => normalizeEmail(email));

const deriveStatus = (ride: RideRecordPayload): RideRecordStatus => {
  if (ride.payoutProcessed) return 'completed';
  if (ride.departureAt <= Date.now()) return 'ongoing';
  return 'scheduled';
};

const ensureRef = (rideId: string): DocumentReference => doc(ridesCol, rideId);

export const persistRideRecord = async (
  ride: RideRecordPayload,
  options: PersistOptions = {}
) => {
  if (!ride?.id) return;
  const status = options.status ?? deriveStatus(ride);
  const ref = ensureRef(ride.id);
  await setDoc(
    ref,
    {
      rideId: ride.id,
      ownerEmail: normalizeEmail(ride.ownerEmail),
      driver: ride.driver,
      vehiclePlate: ride.plate,
      depart: ride.depart,
      destination: ride.destination,
      time: ride.time,
      departureAt: ride.departureAt,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
      seats: ride.seats,
      price: ride.price,
      pricingMode: ride.pricingMode,
      passengers: normalizeEmails(ride.passengers),
      canceledPassengers: normalizeEmails(ride.canceledPassengers),
      passengerCount: ride.passengers.length,
      availableSeats: Math.max(ride.seats - ride.passengers.length, 0),
      payoutProcessed: ride.payoutProcessed,
      status,
      cancellationReason: status === 'cancelled' ? options.cancellationReason ?? null : null,
      firestoreUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const markRideCancelledRecord = async (
  ride: RideRecordPayload,
  reason: string | null = 'driver_cancelled'
) => persistRideRecord(ride, { status: 'cancelled', cancellationReason: reason });

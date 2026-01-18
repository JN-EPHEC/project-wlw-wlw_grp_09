import {
  addDoc,
  collection,
  DocumentData,
  orderBy,
  onSnapshot,
  QueryDocumentSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
  where,
} from 'firebase/firestore';

import { db } from '@/app/services/firebase';
import type { LatLng } from '@/app/services/location';
import type { Ride } from '@/app/services/rides';

const ridesCollection = collection(db, 'rides');

const toMillis = (value?: number | Timestamp | null): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return Date.now();
};

const formatTimeFromTimestamp = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('fr-BE', {
    hour: '2-digit',
    minute: '2-digit',
  });

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

const mapRideSnapshot = (snapshot: QueryDocumentSnapshot<DocumentData>): Ride => {
  const data = snapshot.data();
  const departureAt = toMillis(data.departureAt);
  const createdAt = toMillis(data.createdAt);
  const updatedAt = toMillis(data.updatedAt);
  const seats = typeof data.seats === 'number' ? data.seats : 1;
  const price = typeof data.price === 'number' ? data.price : 0;
  const time = typeof data.time === 'string' ? data.time : formatTimeFromTimestamp(departureAt);
  return {
    id: snapshot.id,
    driver: data.driver ?? '',
    plate: typeof data.vehiclePlate === 'string'
      ? data.vehiclePlate
      : typeof data.plate === 'string'
      ? data.plate
      : '',
    depart: data.depart ?? '',
    destination: data.destination ?? '',
    time,
    seats,
    price,
    pricingMode: (data.pricingMode === 'double' ? 'double' : 'single'),
    tripType: (data.tripType === 'round_trip' ? 'round_trip' : 'one_way'),
    createdAt,
    ownerEmail: (data.ownerEmail ?? '').trim().toLowerCase(),
    ownerUid: data.ownerUid ?? '',
    passengers: toStringArray(data.passengers),
    canceledPassengers: toStringArray(data.canceledPassengers),
    updatedAt,
    departureAt,
    payoutProcessed: Boolean(data.payoutProcessed),
  };
};

export type FirestoreRidePayload = {
  ownerEmail: string;
  ownerUid?: string;
  driver: string;
  depart: string;
  destination: string;
  departureAt: number;
  price: number;
  seats: number;
  plate?: string;
  vehiclePlate?: string;
  departLatLng?: LatLng | null;
  destinationLatLng?: LatLng | null;
  pricingMode?: 'single' | 'double';
  tripType?: 'one_way' | 'round_trip';
  passengers?: string[];
};

export const publishRide = async (payload: FirestoreRidePayload) => {
  const normalizedOwnerEmail = payload.ownerEmail.trim().toLowerCase();
  const rideData: DocumentData = {
    ownerEmail: normalizedOwnerEmail,
    ownerUid: payload.ownerUid ?? null,
    driver: payload.driver,
    depart: payload.depart,
    destination: payload.destination,
    departureAt: payload.departureAt,
    departLatLng: payload.departLatLng ?? null,
    destinationLatLng: payload.destinationLatLng ?? null,
    price: payload.price,
    seats: payload.seats,
    plate: payload.plate ?? payload.vehiclePlate ?? '',
    vehiclePlate: payload.vehiclePlate ?? payload.plate ?? '',
    pricingMode: payload.pricingMode ?? 'single',
    tripType: payload.tripType ?? 'one_way',
    status: 'published',
    passengers: payload.passengers ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const docRef = await addDoc(ridesCollection, rideData);
  console.info(`[Firestore:Rides] publish rideId=${docRef.id}`);
  return docRef.id;
};

export const subscribePublishedRides = (listener: (rides: Ride[]) => void): Unsubscribe => {
  const ridesQuery = query(ridesCollection, where('status', '==', 'published'), orderBy('departureAt', 'asc'));
  return onSnapshot(
    ridesQuery,
    (snapshot) => {
      const items = snapshot.docs.map(mapRideSnapshot);
      console.debug(`[Firestore:Rides] snapshot count=${items.length}`);
      listener(items);
    },
    (error) => {
      console.warn('[Firestore:Rides] realtime snapshot error', error);
      listener([]);
    }
  );
};

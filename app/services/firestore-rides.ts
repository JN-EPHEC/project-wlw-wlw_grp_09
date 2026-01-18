import {
  collectionGroup,
  DocumentData,
  orderBy,
  onSnapshot,
  QueryDocumentSnapshot,
  query,
  Timestamp,
  type Unsubscribe,
  where,
} from 'firebase/firestore';

import { db } from '@/app/services/firebase';
import type { Ride } from '@/app/services/rides';

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
  const totalSeats = typeof data.totalSeats === 'number' ? data.totalSeats : 1;
  const seats = totalSeats;
  const price = typeof data.price === 'number' ? data.price : 0;
  const time = typeof data.time === 'string' ? data.time : formatTimeFromTimestamp(departureAt);
  return {
    id: snapshot.id,
    driver: data.driverName ?? '',
    plate: typeof data.plate === 'string' ? data.plate : '',
    depart: data.depart ?? '',
    destination: data.destination ?? '',
    time,
    seats,
    price,
    pricingMode: data.pricingMode === 'double' ? 'double' : 'single',
    tripType: data.tripType === 'round_trip' ? 'round_trip' : 'one_way',
    createdAt,
    ownerEmail: (data.ownerEmail ?? '').trim().toLowerCase(),
    ownerUid: data.ownerUid ?? '',
    passengers: toStringArray(data.passengers),
    canceledPassengers: toStringArray(data.canceledPassengers),
    updatedAt,
    departureAt,
    payoutProcessed: data.status === 'completed',
  };
};

export const subscribePublishedRides = (listener: (rides: Ride[]) => void): Unsubscribe => {
  const ridesQuery = query(
    collectionGroup(db, 'published'),
    where('status', '==', 'active'),
    orderBy('departureAt', 'asc')
  );
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

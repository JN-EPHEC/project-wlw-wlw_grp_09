import {
  collection,
  collectionGroup,
  doc,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

import { auth, db } from '@/src/firebase';
import type { PaymentMethod } from '@/app/services/payments';
import type { Ride } from '@/app/services/rides';
import {
  createRideRequest,
  respondToRequest,
  type RidePaymentStatus,
  type RideRequestStatus,
} from '@/src/firestoreRides';

type Listener = (entries: ReservationRequestEntry[]) => void;

export type ReservationRequestEntry = {
  id: string;
  rideId: string;
  ridePath: string;
  driverUid: string;
  driver: string;
  driverEmail: string;
  passengerUid: string;
  passengerEmail: string;
  passenger: string;
  passengerName?: string;
  seatsRequested: number;
  depart: string;
  destination: string;
  price: number;
  createdAt: number;
  updatedAt: number;
  status: RideRequestStatus;
  requestStatus: RideRequestStatus;
  paymentStatus: RidePaymentStatus;
  paymentRef: string | null;
  paidAt: number | null;
  timeLabel: string;
  message?: string;
  paymentMethod: PaymentMethod | null;
};

const normalizeEmail = (value?: string | null) => (value ?? '').trim().toLowerCase();

const formatPassengerLabel = (email: string, alias?: string) => {
  if ((alias ?? '').trim()) {
    return alias!.trim();
  }
  const fallback = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  return fallback || email;
};

const formatTimeLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleString('fr-BE', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const toMillis = (value?: { toMillis: () => number } | number | null) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof (value as Timestamp).toMillis === 'function') {
    return (value as Timestamp).toMillis();
  }
  return Date.now();
};

const mapRequestDoc = (snapshot: QueryDocumentSnapshot<DocumentData>): ReservationRequestEntry => {
  const data = snapshot.data();
  const createdAt = toMillis(data.createdAt);
  const updatedAt = toMillis(data.updatedAt);
  const timeLabel =
    typeof data.timeLabel === 'string' ? data.timeLabel : formatTimeLabel(createdAt);
  return {
    id: snapshot.id,
    rideId: data.rideId ?? '',
    ridePath: data.ridePath ?? '',
    driverUid: data.driverUid ?? '',
    driver: data.driverName ?? '',
    driverEmail: data.driverEmail ?? '',
    passengerUid: data.passengerUid ?? '',
    passengerEmail: data.passengerEmail ?? '',
    passengerName: data.passengerName ?? undefined,
    passenger: formatPassengerLabel(data.passengerEmail ?? '', data.passengerName),
    seatsRequested: typeof data.seatsRequested === 'number' ? data.seatsRequested : 1,
    depart: data.depart ?? '',
    destination: data.destination ?? '',
    price: typeof data.price === 'number' ? data.price : 0,
    createdAt,
    updatedAt,
    status: data.requestStatus ?? 'pending',
    requestStatus: data.requestStatus ?? 'pending',
    paymentStatus: data.paymentStatus ?? 'unpaid',
    paymentRef: typeof data.paymentRef === 'string' ? data.paymentRef : null,
    paidAt: data.paidAt ? toMillis(data.paidAt) : null,
    timeLabel,
    message: data.message ?? undefined,
    paymentMethod: null,
  };
};

const subscribeToQuery = (reference: ReturnType<typeof query>, listener: Listener) => {
  return onSnapshot(
    reference,
    (snapshot) => {
      const entries = snapshot.docs.map(mapRequestDoc);
      listener(entries);
    },
    (error) => {
      console.warn('[firestore-reservation-requests] realtime error', error);
      listener([]);
    }
  );
};

const resolveRidePath = (driverUid: string | null, rideId: string) =>
  driverUid ? `rides/${driverUid}/published/${rideId}` : `rides/${rideId}`;

export const logReservationRequest = async (
  passengerEmail: string,
  ride: Ride,
  paymentMethod: PaymentMethod | null,
  passengerName?: string
): Promise<ReservationRequestEntry | null> => {
  const passengerUid = auth.currentUser?.uid;
  if (!passengerEmail || !passengerUid || !ride.ownerUid) {
    return null;
  }
  const normalizedEmail = normalizeEmail(passengerEmail);
  const timeLabel = formatTimeLabel(ride.departureAt);
  const requestId = await createRideRequest({
    driverUid: ride.ownerUid,
    rideId: ride.id,
    passengerUid,
    passengerEmail: normalizedEmail,
    seatsRequested: 1,
    driverName: ride.driver,
    driverEmail: ride.ownerEmail,
    depart: ride.depart,
    destination: ride.destination,
    price: ride.price,
    timeLabel,
    passengerName,
  });
  const passengerLabel = formatPassengerLabel(normalizedEmail, passengerName);
  return {
    id: requestId,
    rideId: ride.id,
    ridePath: resolveRidePath(ride.ownerUid, ride.id),
    driverUid: ride.ownerUid,
    driver: ride.driver,
    driverEmail: ride.ownerEmail,
    passengerUid,
    passengerEmail: normalizedEmail,
    passengerName,
    passenger: passengerLabel,
    seatsRequested: 1,
    depart: ride.depart,
    destination: ride.destination,
    price: ride.price,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'pending',
    requestStatus: 'pending',
    paymentStatus: 'unpaid',
    paymentRef: null,
    paidAt: null,
    timeLabel,
    message: passengerName,
    paymentMethod,
  };
};

export const subscribeReservationRequests = (passengerUid: string | null, listener: Listener) => {
  if (!passengerUid) {
    listener([]);
    return () => undefined;
  }
  const requestQuery = query(
    collectionGroup(db, 'requests'),
    where('passengerUid', '==', passengerUid),
    orderBy('createdAt', 'desc')
  );
  return subscribeToQuery(requestQuery, listener);
};

export const subscribeDriverReservationRequests = (driverUid: string | null, listener: Listener) => {
  if (!driverUid) {
    listener([]);
    return () => undefined;
  }
  const requestQuery = query(
    collectionGroup(db, 'requests'),
    where('driverUid', '==', driverUid),
    orderBy('createdAt', 'desc')
  );
  return subscribeToQuery(requestQuery, listener);
};

const findRequestPath = async (requestId: string) => {
  const requestQuery = query(
    collectionGroup(db, 'requests'),
    where(documentId(), '==', requestId),
    limit(1)
  );
  const snapshot = await getDocs(requestQuery);
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  const rideDoc = docSnap.ref.parent.parent;
  const driverUid = rideDoc?.parent?.id ?? '';
  const rideId = rideDoc?.id ?? '';
  return { driverUid, rideId };
};

export const acceptDriverReservationRequest = async (driverUid: string | null, requestId: string) => {
  if (!driverUid) return;
  const path = await findRequestPath(requestId);
  if (!path || !path.driverUid || !path.rideId) return;
  await respondToRequest(path.driverUid, path.rideId, requestId, 'accept');
};

export const rejectDriverReservationRequest = async (driverUid: string | null, requestId: string) => {
  if (!driverUid) return;
  const path = await findRequestPath(requestId);
  if (!path || !path.driverUid || !path.rideId) return;
  await respondToRequest(path.driverUid, path.rideId, requestId, 'reject');
};

export const removeReservationRequest = async (passengerUid: string | null, rideId: string) => {
  if (!passengerUid || !rideId) return;
  const requestQuery = query(
    collectionGroup(db, 'requests'),
    where('passengerUid', '==', passengerUid),
    where('rideId', '==', rideId)
  );
  const snapshot = await getDocs(requestQuery);
  if (snapshot.empty) return;
  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
    batch.delete(doc(collection(db, 'users', passengerUid, 'rideRequests'), docSnap.id));
  });
  await batch.commit();
};

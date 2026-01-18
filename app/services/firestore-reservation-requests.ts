import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  where,
} from 'firebase/firestore';

import { auth, db } from '@/src/firebase';
import type { Ride } from '@/app/services/rides';
import type { PaymentMethod } from '@/app/services/payments';
import {
  acceptRequest,
  createRequest,
  declineRequest,
  type TrajetRequestDoc,
  type TrajetRequestStatus,
} from '@/src/firestoreTrajets';

export type ReservationStatus = TrajetRequestStatus;

export type ReservationRequestEntry = {
  id: string;
  rideId: string;
  trajetId: string;
  driver: string;
  driverEmail: string;
  passenger: string;
  passengerEmail: string;
  passengerUid: string;
  depart: string;
  destination: string;
  price: number;
  createdAt: number;
  status: ReservationStatus;
  timeLabel: string;
  seatsRequested: number;
  message?: string;
  paymentMethod: PaymentMethod | null;
};

type Listener = (entries: ReservationRequestEntry[]) => void;

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const formatPassengerLabel = (email: string, name?: string) => {
  const fallback = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if ((name ?? '').trim()) {
    return name!.trim();
  }
  return fallback || email;
};

const formatTimeLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleString('fr-BE', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const toMillis = (value?: { toMillis: () => number } | null) => (value ? value.toMillis() : Date.now());

const mapRequestDoc = (snapshot: QueryDocumentSnapshot<TrajetRequestDoc>): ReservationRequestEntry => {
  const data = snapshot.data();
  const trajetId = snapshot.ref.parent.parent?.id ?? '';
  return {
    id: snapshot.id,
    trajetId,
    rideId: data.rideId ?? trajetId,
    driver: data.driverName ?? '',
    driverEmail: data.driverEmail ?? '',
    passenger: formatPassengerLabel(data.passengerEmail),
    passengerEmail: data.passengerEmail,
    passengerUid: data.passengerUid,
    depart: data.depart ?? '',
    destination: data.destination ?? '',
    price: data.price ?? 0,
    createdAt: toMillis(data.createdAt),
    status: data.status,
    timeLabel: data.timeLabel ?? formatTimeLabel(toMillis(data.createdAt)),
    seatsRequested: data.seatsRequested,
    message: data.message,
    paymentMethod: null,
  };
};

const subscribeToQuery = (reference: ReturnType<typeof query>, listener: Listener) => {
  return onSnapshot(
    reference,
    (snapshot) => {
      const entries = snapshot.docs.map((docSnap) =>
        mapRequestDoc(docSnap as QueryDocumentSnapshot<TrajetRequestDoc>)
      );
      listener(entries);
    },
    (error) => {
      console.warn('[firestore-reservation-requests] realtime error', error);
      listener([]);
    }
  );
};

export const logReservationRequest = async (
  passengerEmail: string,
  ride: Ride,
  paymentMethod: PaymentMethod | null,
  passengerName?: string
): Promise<ReservationRequestEntry | null> => {
  const passengerUid = auth.currentUser?.uid;
  if (!passengerEmail || !passengerUid) {
    return null;
  }
  const requestId = await createRequest(ride.id, {
    passengerUid,
    passengerEmail: normalizeEmail(passengerEmail),
    seatsRequested: 1,
    driverUid: ride.ownerUid || undefined,
    driverName: ride.driver,
    driverEmail: ride.ownerEmail,
    rideId: ride.id,
    depart: ride.depart,
    destination: ride.destination,
    price: ride.price,
    timeLabel: formatTimeLabel(ride.departureAt),
    message: passengerName,
  });
  return {
    id: requestId,
    rideId: ride.id,
    trajetId: ride.id,
    driver: ride.driver,
    driverEmail: ride.ownerEmail,
    passenger: formatPassengerLabel(passengerEmail, passengerName),
    passengerEmail,
    passengerUid,
    depart: ride.depart,
    destination: ride.destination,
    price: ride.price,
    createdAt: Date.now(),
    status: 'pending',
    timeLabel: formatTimeLabel(ride.departureAt),
    seatsRequested: 1,
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
  const docSnap = snapshot.docs[0];
  if (!docSnap) return null;
  const trajetId = docSnap.ref.parent.parent?.id;
  if (!trajetId) return null;
  return { trajetId, requestId: docSnap.id };
};

export const acceptDriverReservationRequest = async (driverUid: string | null, requestId: string) => {
  if (!driverUid) return;
  const target = await findRequestPath(requestId);
  if (!target) return;
  await acceptRequest(target.trajetId, target.requestId, driverUid);
};

export const rejectDriverReservationRequest = async (driverUid: string | null, requestId: string) => {
  if (!driverUid) return;
  const target = await findRequestPath(requestId);
  if (!target) return;
  await declineRequest(target.trajetId, target.requestId, driverUid);
};

export const removeReservationRequest = async (passengerUid: string | null, trajetId: string) => {
  if (!passengerUid) return;
  const requestsRef = collection(doc(db, 'trajets', trajetId), 'requests');
  const snapshot = await getDocs(query(requestsRef, where('passengerUid', '==', passengerUid)));
  await Promise.all(snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));
};

import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  Transaction,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebase';

export type TrajetStatus = 'published' | 'cancelled' | 'completed';
export type TrajetRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type TrajetReservationStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'completed';

export type TrajetSearchIndex = {
  departLower: string;
  destinationLower: string;
  dayKey: string;
};

export type TrajetDoc = {
  ownerUid: string;
  driverName: string;
  driverEmail: string;
  depart: string;
  destination: string;
  departureAt: Timestamp;
  availableSeats: number;
  totalSeats: number;
  price: number;
  campus?: string;
  status: TrajetStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  search?: TrajetSearchIndex;
};

export type TrajetRequestDoc = {
  passengerUid: string;
  passengerEmail: string;
  seatsRequested: number;
  message?: string;
  status: TrajetRequestStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type TrajetReservationDoc = {
  rideId?: string;
  passengerUid: string;
  passengerEmail: string;
  seats: number;
  status: TrajetReservationStatus;
  reservedAt: Timestamp;
  updatedAt: Timestamp;
  payoutProcessed?: boolean;
  syncedAt?: Timestamp;
};

const trajetsCol = collection(db, 'trajets');

const normalizeText = (value: string) => value.trim().toLowerCase();

const toTimestamp = (value?: number | Date | Timestamp) => {
  if (!value) {
    return Timestamp.now();
  }
  if (value instanceof Timestamp) {
    return value;
  }
  if (value instanceof Date) {
    return Timestamp.fromMillis(value.getTime());
  }
  return Timestamp.fromMillis(value);
};

const buildSearchIndex = (depart: string, destination: string, departureAt?: number | Date | Timestamp) => {
  const departLower = normalizeText(depart);
  const destinationLower = normalizeText(destination);
  const dayKey = toTimestamp(departureAt).toDate().toISOString().slice(0, 10);
  return { departLower, destinationLower, dayKey };
};

const logHistoryEvent = async (
  trajetId: string,
  type: string,
  actorUid: string,
  metadata?: Record<string, unknown>,
  tx?: Transaction
) => {
  const historyRef = doc(collection(doc(trajetsCol, trajetId), 'history'));
  const payload = {
    type,
    actorUid,
    createdAt: serverTimestamp(),
    metadata: metadata ?? {},
  };
  if (tx) {
    tx.set(historyRef, payload);
    return;
  }
  await setDoc(historyRef, payload);
};

export const createTrajet = async (
  trajetId: string,
  data: Partial<TrajetDoc> & {
    ownerUid: string;
    driverName: string;
    driverEmail: string;
    depart: string;
    destination: string;
    departureAt: number | Date | Timestamp;
    totalSeats: number;
    price: number;
  }
) => {
  const now = serverTimestamp();
  const departureTimestamp = toTimestamp(data.departureAt);
  const availableSeats = data.availableSeats ?? data.totalSeats;
  const payload = {
    ownerUid: data.ownerUid,
    driverName: data.driverName,
    driverEmail: normalizeText(data.driverEmail),
    depart: data.depart,
    destination: data.destination,
    departureAt: departureTimestamp,
    availableSeats,
    totalSeats: data.totalSeats,
    price: data.price,
    campus: data.campus ?? null,
    status: data.status ?? 'published',
    createdAt: data.createdAt ?? now,
    updatedAt: now,
    search: buildSearchIndex(data.depart, data.destination, data.departureAt),
  };
  const docRef = doc(trajetsCol, trajetId);
  await setDoc(docRef, payload, { merge: true });
  await logHistoryEvent(trajetId, 'TRAJET_CREATED', data.ownerUid, { payload });
};

export const createRequest = async (
  trajetId: string,
  requestId: string,
  payload: {
    passengerUid: string;
    passengerEmail: string;
    seatsRequested: number;
    message?: string;
  }
) => {
  const requestRef = doc(collection(doc(trajetsCol, trajetId), 'requests'), requestId);
  const now = serverTimestamp();
  const requestPayload: TrajetRequestDoc = {
    passengerUid: payload.passengerUid,
    passengerEmail: normalizeText(payload.passengerEmail),
    seatsRequested: payload.seatsRequested,
    message: payload.message,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(requestRef, requestPayload);
  await logHistoryEvent(trajetId, 'REQUEST_CREATED', payload.passengerUid, {
    requestId,
    seatsRequested: payload.seatsRequested,
  });
};

export const declineRequest = async (
  trajetId: string,
  requestId: string,
  driverUid: string
) => {
  const requestRef = doc(collection(doc(trajetsCol, trajetId), 'requests'), requestId);
  await updateDoc(requestRef, {
    status: 'declined',
    updatedAt: serverTimestamp(),
  });
  await logHistoryEvent(trajetId, 'REQUEST_DECLINED', driverUid, { requestId });
};

export const createReservation = async (
  trajetId: string,
  reservationId: string,
  payload: {
    rideId?: string;
    passengerUid: string;
    passengerEmail: string;
    seats: number;
    status?: TrajetReservationStatus;
    payoutProcessed?: boolean;
    syncedAt?: Timestamp;
  }
) => {
  const reservationRef = doc(collection(doc(trajetsCol, trajetId), 'reservations'), reservationId);
  const now = serverTimestamp();
  const reservationPayload: TrajetReservationDoc = {
    rideId: payload.rideId,
    passengerUid: payload.passengerUid,
    passengerEmail: normalizeText(payload.passengerEmail),
    seats: payload.seats,
    status: payload.status ?? 'accepted',
    reservedAt: now,
    updatedAt: now,
    payoutProcessed: payload.payoutProcessed,
    syncedAt: payload.syncedAt,
  };
  await setDoc(reservationRef, reservationPayload, { merge: true });
  await logHistoryEvent(trajetId, 'RESERVATION_CREATED', payload.passengerUid, {
    reservationId,
    seats: payload.seats,
  });
};

export const acceptRequest = async (trajetId: string, requestId: string, driverUid: string) => {
  const trajetRef = doc(trajetsCol, trajetId);
  const requestRef = doc(collection(trajetRef, 'requests'), requestId);
  const reservationRef = doc(collection(trajetRef, 'reservations'), requestId);

  await runTransaction(db, async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists()) {
      throw new Error('Request not found');
    }
    const requestData = requestSnap.data() as TrajetRequestDoc;
    if (requestData.status !== 'pending') {
      throw new Error('Request already handled');
    }
    const trajetSnap = await tx.get(trajetRef);
    if (!trajetSnap.exists()) {
      throw new Error('Trajet does not exist');
    }
    const trajetData = trajetSnap.data() as TrajetDoc;
    const seats = requestData.seatsRequested;
    const nextAvailable = Math.max(trajetData.availableSeats - seats, 0);

    tx.update(trajetRef, {
      availableSeats: nextAvailable,
      updatedAt: serverTimestamp(),
      status: trajetData.status === 'cancelled' ? 'cancelled' : trajetData.status,
    });
    tx.update(requestRef, {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
    const reservationPayload: TrajetReservationDoc = {
      passengerUid: requestData.passengerUid,
      passengerEmail: requestData.passengerEmail,
      seats,
      status: 'accepted',
      reservedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    tx.set(reservationRef, reservationPayload, { merge: true });
    await logHistoryEvent(trajetId, 'REQUEST_ACCEPTED', driverUid, { requestId, seats }, tx);
  });
};

export const listMyTrips = async (ownerUid: string) => {
  const q = query(trajetsCol, where('ownerUid', '==', ownerUid), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    data: docSnap.data() as TrajetDoc,
  }));
};

export const listMyRequests = async (passengerUid: string) => {
  const q = query(
    collectionGroup(db, 'requests'),
    where('passengerUid', '==', passengerUid),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    trajetId: docSnap.ref.parent.parent?.id ?? null,
    requestId: docSnap.id,
    data: docSnap.data() as TrajetRequestDoc,
  }));
};

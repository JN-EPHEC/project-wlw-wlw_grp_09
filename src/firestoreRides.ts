import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
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
  ownerUid: string;
  passengers: string[];
  canceledPassengers: string[];
  createdAt: number;
  updatedAt: number;
  departureAt: number;
  payoutProcessed: boolean;
  tripType?: 'one_way' | 'round_trip';
};

export type RideRequestStatus = 'pending' | 'accepted' | 'paid' | 'rejected' | 'cancelled';
export type RidePaymentStatus = 'unpaid' | 'processing' | 'paid' | 'failed' | 'refunded';

export type RideRequestDoc = {
  requestId: string;
  rideId: string;
  driverUid: string;
  passengerUid: string;
  passengerEmail: string;
  seatsRequested: number;
  requestStatus: RideRequestStatus;
  paymentStatus: RidePaymentStatus;
  paymentRef: string | null;
  paidAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  driverName?: string;
  driverEmail?: string;
  depart?: string;
  destination?: string;
  price?: number;
  timeLabel?: string;
  passengerName?: string;
};

type RideDocStatus = 'active' | 'completed' | 'cancelled';

type RideDocData = {
  rideId: string;
  ownerUid: string;
  ownerEmail: string;
  driverName: string;
  depart: string;
  destination: string;
  departureAt: number;
  availableSeats: number;
  totalSeats: number;
  passengerCount: number;
  price: number;
  status: RideDocStatus;
  passengers: string[];
  canceledPassengers: string[];
  plate: string;
  time: string;
  pricingMode: 'single' | 'double';
  tripType: 'one_way' | 'round_trip';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type RideRequestMirrorDoc = RideRequestDoc & {
  ridePath: string;
};

const normalizeEmail = (value?: string | null) => (value ?? '').trim().toLowerCase();
const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

const randomShort = (length: number) =>
  Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

const randomIdSuffix = () => randomShort(4 + Math.floor(Math.random() * 3));

const buildRidePath = (driverUid: string, rideId: string) => `rides/${driverUid}/published/${rideId}`;

const driverRidesCollection = (driverUid: string) => collection(db, 'rides', driverUid, 'published');
const driverRideDoc = (driverUid: string, rideId: string) => doc(driverRidesCollection(driverUid), rideId);
const driverRequestDoc = (driverUid: string, rideId: string, requestId: string) =>
  doc(driverRideDoc(driverUid, rideId), 'requests', requestId);
const passengerRequestDoc = (passengerUid: string, requestId: string) =>
  doc(collection(db, 'users', passengerUid, 'rideRequests'), requestId);

const mapRideStatus = (ride: RideRecordPayload): RideDocStatus => {
  if (ride.payoutProcessed) return 'completed';
  return 'active';
};

const normalizeEmails = (list: string[] | undefined) =>
  (list ?? []).map((email) => normalizeEmail(email));

const mapRidePayload = (ride: RideRecordPayload): Partial<RideDocData> => {
  const passengerCount = ride.passengers.length;
  const availableSeats = Math.max(ride.seats - passengerCount, 0);
  return {
    rideId: ride.id,
    ownerUid: ride.ownerUid ?? '',
    ownerEmail: normalizeEmail(ride.ownerEmail),
    driverName: ride.driver,
    depart: ride.depart,
    destination: ride.destination,
    departureAt: ride.departureAt,
    totalSeats: ride.seats,
    availableSeats,
    passengerCount,
    price: ride.price,
    status: mapRideStatus(ride),
    passengers: normalizeEmails(ride.passengers),
    canceledPassengers: normalizeEmails(ride.canceledPassengers),
    plate: ride.plate,
    time: ride.time,
    pricingMode: ride.pricingMode,
    tripType: ride.tripType ?? 'one_way',
  };
};

export const buildRideId = () => `ride-${Date.now()}-${randomIdSuffix()}`;
export const buildRequestId = () => `req-${Date.now()}-${randomIdSuffix()}`;

export const persistRideRecord = async (ride: RideRecordPayload) => {
  if (!ride?.id || !ride.ownerUid) return;
  const ref = driverRideDoc(ride.ownerUid, ride.id);
  const snapshot = await getDoc(ref);
  const payload = {
    ...mapRidePayload(ride),
    updatedAt: serverTimestamp(),
  };
  if (!snapshot.exists()) {
    (payload as RideDocData).createdAt = serverTimestamp();
  }
  await setDoc(ref, payload, { merge: true });
};

export const createRide = async (payload: Omit<RideDocData, 'createdAt' | 'updatedAt'>) => {
  const ref = driverRideDoc(payload.ownerUid, payload.rideId);
  const now = serverTimestamp();
  await setDoc(ref, {
    ...payload,
    ownerEmail: normalizeEmail(payload.ownerEmail),
    passengers: payload.passengers ?? [],
    canceledPassengers: payload.canceledPassengers ?? [],
    createdAt: now,
    updatedAt: now,
  });
  return payload.rideId;
};

export const updateRide = async (
  driverUid: string,
  rideId: string,
  partial: Partial<Omit<RideDocData, 'rideId' | 'ownerUid' | 'createdAt'>>
) => {
  const ref = driverRideDoc(driverUid, rideId);
  await updateDoc(ref, {
    ...partial,
    updatedAt: serverTimestamp(),
  });
};

export const deleteRide = async (driverUid: string, rideId: string) => {
  const ref = driverRideDoc(driverUid, rideId);
  await deleteDoc(ref);
};

const buildRequestPayload = (
  driverUid: string,
  rideId: string,
  params: {
    passengerUid: string;
    passengerEmail: string;
    seatsRequested?: number;
    driverName?: string;
    driverEmail?: string;
    depart?: string;
    destination?: string;
    price?: number;
    timeLabel?: string;
    passengerName?: string;
  }
): RideRequestDoc => ({
  requestId: buildRequestId(),
  rideId,
  driverUid,
  passengerUid: params.passengerUid,
  passengerEmail: normalizeEmail(params.passengerEmail),
  seatsRequested: params.seatsRequested ?? 1,
  requestStatus: 'pending',
  paymentStatus: 'unpaid',
  paymentRef: null,
  paidAt: null,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  driverName: params.driverName,
  driverEmail: params.driverEmail ? normalizeEmail(params.driverEmail) : undefined,
  depart: params.depart,
  destination: params.destination,
  price: params.price,
  timeLabel: params.timeLabel,
  passengerName: params.passengerName,
});

export const createRideRequest = async (params: {
  driverUid: string;
  rideId: string;
  passengerUid: string;
  passengerEmail: string;
  seatsRequested?: number;
  driverName?: string;
  driverEmail?: string;
  depart?: string;
  destination?: string;
  price?: number;
  timeLabel?: string;
  passengerName?: string;
}) => {
  const requestData = buildRequestPayload(params.driverUid, params.rideId, params);
  const requestRef = driverRequestDoc(params.driverUid, params.rideId, requestData.requestId);
  const batch = writeBatch(db);
  batch.set(requestRef, requestData);
  const mirrorPayload = {
    ...requestData,
    ridePath: buildRidePath(params.driverUid, params.rideId),
  } as RideRequestMirrorDoc;
  const mirrorRef = passengerRequestDoc(params.passengerUid, requestData.requestId);
  batch.set(mirrorRef, mirrorPayload);
  await batch.commit();
  return requestData.requestId;
};

export const respondToRequest = async (
  driverUid: string,
  rideId: string,
  requestId: string,
  decision: 'accept' | 'reject'
) => {
  const rideRef = driverRideDoc(driverUid, rideId);
  const requestRef = driverRequestDoc(driverUid, rideId, requestId);
  await runTransaction(db, async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists()) {
      throw new Error('Request introuvable');
    }
    const requestData = requestSnap.data() as RideRequestDoc;
    if (requestData.requestStatus !== 'pending') {
      return;
    }
    const passengerUid = requestData.passengerUid;
    const mirrorRef = passengerRequestDoc(passengerUid, requestId);
    if (decision === 'accept') {
      const rideSnap = await tx.get(rideRef);
      if (!rideSnap.exists()) {
        throw new Error('Trajet introuvable');
      }
      const rideData = rideSnap.data() as RideDocData;
      const seats = requestData.seatsRequested;
      const availableSeats = rideData.availableSeats ?? 0;
      if (availableSeats < seats) {
        throw new Error('Plus assez de places disponibles');
      }
      const passengerCount = (rideData.passengerCount ?? 0) + seats;
      tx.update(rideRef, {
        availableSeats: Math.max(availableSeats - seats, 0),
        passengerCount,
        updatedAt: serverTimestamp(),
      });
      tx.update(requestRef, {
        requestStatus: 'accepted',
        paymentStatus: 'unpaid',
        updatedAt: serverTimestamp(),
      });
      tx.set(
        mirrorRef,
        {
          ...requestData,
          requestStatus: 'accepted',
          paymentStatus: 'unpaid',
          updatedAt: serverTimestamp(),
          ridePath: buildRidePath(driverUid, rideId),
        },
        { merge: true }
      );
    } else {
      tx.update(requestRef, {
        requestStatus: 'rejected',
        updatedAt: serverTimestamp(),
      });
      tx.set(
        mirrorRef,
        {
          requestStatus: 'rejected',
          updatedAt: serverTimestamp(),
          ridePath: buildRidePath(driverUid, rideId),
        },
        { merge: true }
      );
    }
  });
};

export const markRequestPaid = async (
  driverUid: string,
  rideId: string,
  requestId: string,
  paymentRef?: string
) => {
  const requestRef = driverRequestDoc(driverUid, rideId, requestId);
  await runTransaction(db, async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists()) {
      throw new Error('Request introuvable');
    }
    const requestData = requestSnap.data() as RideRequestDoc;
    const passengerUid = requestData.passengerUid;
    const mirrorRef = passengerRequestDoc(passengerUid, requestId);
    tx.update(requestRef, {
      requestStatus: 'paid',
      paymentStatus: 'paid',
      paymentRef: paymentRef ?? null,
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.set(
      mirrorRef,
      {
        requestStatus: 'paid',
        paymentStatus: 'paid',
        paymentRef: paymentRef ?? null,
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
          ridePath: buildRidePath(driverUid, rideId),
      },
      { merge: true }
    );
  });
};

export const subscribeRideRequests = (
  driverUid: string | null,
  rideId: string | null,
  listener: (requests: RideRequestDoc[]) => void
) => {
  if (!driverUid || !rideId) {
    listener([]);
    return () => {};
  }
  const requestsCollection = collection(driverRideDoc(driverUid, rideId), 'requests');
  const requestsQuery = query(requestsCollection, orderBy('createdAt', 'desc'));
  const unsubscribe = onSnapshot(
    requestsQuery,
    (snapshot) => {
      listener(snapshot.docs.map((docSnap) => docSnap.data() as RideRequestDoc));
    },
    (error) => {
      console.warn('[firestoreRides][requests] subscription failed', error);
      listener([]);
    }
  );
  return unsubscribe;
};

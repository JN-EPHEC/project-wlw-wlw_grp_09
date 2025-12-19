// app/services/passenger-feedback.ts
// Notes laissées par le conducteur à destination des passagers.

import { getRide, hasRideDeparted } from './rides';
import { moderateComment } from './review-moderation';

export type PassengerFeedback = {
  id: string;
  rideId: string;
  passengerEmail: string;
  driverEmail: string;
  rating: number;
  comment: string | null;
  createdAt: number;
  updatedAt: number;
  driverName: string;
  driverAvatarColor: string;
};

type Listener = (feedback: PassengerFeedback[]) => void;

const feedbackStore: PassengerFeedback[] = [];
const passengerListeners: Record<string, Listener[]> = {};
const driverListeners: Record<string, Listener[]> = {};

const randomId = () => Math.random().toString(36).slice(2, 11);

const normaliseEmail = (value: string) => value.trim().toLowerCase();

const clone = (items: PassengerFeedback[]) => items.map((item) => ({ ...item }));
const sortFeedback = (items: PassengerFeedback[]) =>
  [...items].sort((a, b) => b.createdAt - a.createdAt);

const validateRating = (rating: number) => {
  if (!Number.isFinite(rating)) throw new Error('Note invalide');
  const rounded = Math.round(rating * 10) / 10;
  if (rounded < 1 || rounded > 5) throw new Error('La note doit être comprise entre 1 et 5');
  return rounded;
};

const sanitiseComment = (comment: string | undefined) => moderateComment(comment);

const AVATAR_COLORS = ['#8F8DFF', '#FF9EBB', '#FFD18C', '#4FC1A6', '#91CBFF', '#C898F9'];

const buildAvatarColor = (email: string) => {
  const key = normaliseEmail(email);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
};

const ensureRideEligibility = (rideId: string, driverEmail: string, passengerEmail: string) => {
  const ride = getRide(rideId);
  if (!ride) {
    throw new Error('Trajet introuvable pour noter ce passager.');
  }
  if (!hasRideDeparted(ride)) {
    throw new Error('Attends la fin du trajet pour le noter.');
  }
  const rideOwner = normaliseEmail(ride.ownerEmail);
  if (rideOwner !== driverEmail) {
    throw new Error('Seul le conducteur peut noter ses passagers.');
  }
  const passengerExists = ride.passengers.map(normaliseEmail).includes(passengerEmail);
  if (!passengerExists) {
    throw new Error('Impossible de noter un étudiant qui n’était pas sur ce trajet.');
  }
};

const ensurePassengerListeners = (email: string) => {
  const key = normaliseEmail(email);
  if (!passengerListeners[key]) passengerListeners[key] = [];
  return key;
};

const ensureDriverListeners = (email: string) => {
  const key = normaliseEmail(email);
  if (!driverListeners[key]) driverListeners[key] = [];
  return key;
};

const notifyPassenger = (email: string) => {
  const key = ensurePassengerListeners(email);
  passengerListeners[key].forEach((listener) =>
    listener(getFeedbackForPassenger(email))
  );
};

const notifyDriver = (email: string) => {
  const key = ensureDriverListeners(email);
  driverListeners[key].forEach((listener) => listener(getFeedbackByDriver(email)));
};

export const submitPassengerFeedback = (params: {
  rideId: string;
  passengerEmail: string;
  driverEmail: string;
  rating: number;
  comment?: string;
}) => {
  const passengerEmail = normaliseEmail(params.passengerEmail);
  const driverEmail = normaliseEmail(params.driverEmail);
  ensureRideEligibility(params.rideId, driverEmail, passengerEmail);
  const rating = validateRating(params.rating);
  const comment = sanitiseComment(params.comment);
  const now = Date.now();
  const ride = getRide(params.rideId);
  const driverName = ride?.driver ?? params.driverEmail.split('@')[0] ?? 'Conducteur';
  const driverAvatarColor = buildAvatarColor(driverEmail);

  const existing = feedbackStore.find(
    (entry) =>
      entry.rideId === params.rideId &&
      entry.passengerEmail === passengerEmail &&
      entry.driverEmail === driverEmail
  );

  if (existing) {
    existing.rating = rating;
    existing.comment = comment;
    existing.updatedAt = now;
    existing.driverName = driverName;
    existing.driverAvatarColor = driverAvatarColor;
    notifyPassenger(passengerEmail);
    notifyDriver(driverEmail);
    return existing;
  }

  const feedback: PassengerFeedback = {
    id: randomId(),
    rideId: params.rideId,
    passengerEmail,
    driverEmail,
    rating,
    comment,
    createdAt: now,
    updatedAt: now,
    driverName,
    driverAvatarColor,
  };
  feedbackStore.unshift(feedback);
  notifyPassenger(passengerEmail);
  notifyDriver(driverEmail);
  return feedback;
};

export const getFeedbackForPassenger = (passengerEmail: string) => {
  const key = normaliseEmail(passengerEmail);
  return clone(sortFeedback(feedbackStore.filter((entry) => entry.passengerEmail === key)));
};

export const getFeedbackByDriver = (driverEmail: string) => {
  const key = normaliseEmail(driverEmail);
  return clone(sortFeedback(feedbackStore.filter((entry) => entry.driverEmail === key)));
};

export const getPassengerFeedbackSummary = (passengerEmail: string) => {
  const items = getFeedbackForPassenger(passengerEmail);
  if (items.length === 0) {
    return { average: 0, count: 0 };
  }
  const total = items.reduce((acc, entry) => acc + entry.rating, 0);
  const average = Math.round((total / items.length) * 10) / 10;
  return { average, count: items.length };
};

export const subscribePassengerFeedback = (email: string, listener: Listener) => {
  const key = ensurePassengerListeners(email);
  passengerListeners[key].push(listener);
  listener(getFeedbackForPassenger(email));
  return () => {
    const bucket = passengerListeners[key];
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  };
};

export const subscribeDriverFeedback = (email: string, listener: Listener) => {
  const key = ensureDriverListeners(email);
  driverListeners[key].push(listener);
  listener(getFeedbackByDriver(email));
  return () => {
    const bucket = driverListeners[key];
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  };
};

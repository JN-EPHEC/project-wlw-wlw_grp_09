// app/services/reviews.ts
// Service en mémoire pour gérer les avis conducteurs côté client.

import { pushNotification } from './notifications';

export type Review = {
  id: string;
  rideId: string;
  driverEmail: string;
  driverName: string;
  passengerEmail: string;
  passengerName: string;
  rating: number; // 1..5
  comment: string | null;
  createdAt: number;
  updatedAt: number;
  response?: {
    body: string;
    createdAt: number;
  };
  passengerAvatarColor?: string;
};

type Listener = (reviews: Review[]) => void;

let reviews: Review[] = [];

const driverListeners: Record<string, Listener[]> = {};
const rideListeners: Record<string, Listener[]> = {};
const passengerListeners: Record<string, Listener[]> = {};

const randomId = () => Math.random().toString(36).slice(2, 11);

const normaliseEmail = (value: string) => value.trim().toLowerCase();

const clone = (items: Review[]): Review[] =>
  items.map((item) => ({
    ...item,
    response: item.response ? { ...item.response } : undefined,
  }));

const AVATAR_COLORS = ['#8F8DFF', '#FF9EBB', '#FFD18C', '#4FC1A6', '#91CBFF', '#C898F9'];

const toDisplayName = (value: string) =>
  value
    .trim()
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

const fallbackAvatarColor = (value: string) => {
  const key = normaliseEmail(value);
  if (!key) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
};

const ensureDriverBucket = (email: string) => {
  const key = normaliseEmail(email);
  if (!driverListeners[key]) driverListeners[key] = [];
  return key;
};

const ensureRideBucket = (rideId: string) => {
  const key = rideId.trim();
  if (!rideListeners[key]) rideListeners[key] = [];
  return key;
};

const ensurePassengerBucket = (email: string) => {
  const key = normaliseEmail(email);
  if (!passengerListeners[key]) passengerListeners[key] = [];
  return key;
};

const notifyDriver = (email: string) => {
  const key = ensureDriverBucket(email);
  const snapshot = clone(getReviewsForDriver(key));
  driverListeners[key].forEach((listener) => listener(snapshot));
};

const notifyRide = (rideId: string) => {
  const key = ensureRideBucket(rideId);
  const snapshot = clone(getReviewsForRide(key));
  rideListeners[key].forEach((listener) => listener(snapshot));
};

const notifyPassenger = (email: string) => {
  const key = ensurePassengerBucket(email);
  const snapshot = clone(getReviewsForPassenger(key));
  passengerListeners[key].forEach((listener) => listener(snapshot));
};

const buildPassengerName = (email: string, fallback: string | undefined) => {
  if (fallback && fallback.trim()) return fallback.trim();
  const alias = email.split('@')[0] ?? '';
  if (!alias) return 'Passager';
  return toDisplayName(alias);
};

const validateRating = (rating: number) => {
  if (!Number.isFinite(rating)) {
    throw new Error('Note invalide');
  }
  const rounded = Math.round(rating * 10) / 10;
  if (rounded < 1 || rounded > 5) {
    throw new Error('La note doit être comprise entre 1 et 5');
  }
  return rounded;
};

const sanitiseComment = (comment: string | undefined) => {
  if (comment == null) return null;
  const value = comment.trim();
  if (!value) {
    return null;
  }
  if (value.length > 600) {
    return value.slice(0, 600);
  }
  return value;
};

export const getAllReviews = () => clone(reviews);

export const getReviewsForDriver = (driverEmail: string) => {
  const key = normaliseEmail(driverEmail);
  return clone(reviews.filter((review) => review.driverEmail === key));
};

export const getReviewsForRide = (rideId: string) => {
  const key = rideId.trim();
  return clone(reviews.filter((review) => review.rideId === key));
};

export const getReviewsForPassenger = (passengerEmail: string) => {
  const key = normaliseEmail(passengerEmail);
  return clone(reviews.filter((review) => review.passengerEmail === key));
};

export const findReview = (rideId: string, passengerEmail: string) => {
  const key = normaliseEmail(passengerEmail);
  return (
    reviews.find(
      (review) => review.rideId === rideId.trim() && review.passengerEmail === key
    ) ?? null
  );
};

export const getDriverRatingSummary = (driverEmail: string) => {
  const driverReviews = getReviewsForDriver(driverEmail);
  if (driverReviews.length === 0) {
    return { average: 0, count: 0 };
  }
  const total = driverReviews.reduce((acc, review) => acc + review.rating, 0);
  const average = Math.round((total / driverReviews.length) * 10) / 10;
  return { average, count: driverReviews.length };
};

export const subscribeDriverReviews = (driverEmail: string, listener: Listener) => {
  const key = ensureDriverBucket(driverEmail);
  driverListeners[key].push(listener);
  listener(clone(getReviewsForDriver(key)));
  return () => {
    const bucket = driverListeners[key];
    const index = bucket.indexOf(listener);
    if (index >= 0) {
      bucket.splice(index, 1);
    }
  };
};

export const subscribeRideReviews = (rideId: string, listener: Listener) => {
  const key = ensureRideBucket(rideId);
  rideListeners[key].push(listener);
  listener(clone(getReviewsForRide(key)));
  return () => {
    const bucket = rideListeners[key];
    const index = bucket.indexOf(listener);
    if (index >= 0) {
      bucket.splice(index, 1);
    }
  };
};

export const subscribePassengerReviews = (passengerEmail: string, listener: Listener) => {
  const key = ensurePassengerBucket(passengerEmail);
  passengerListeners[key].push(listener);
  listener(clone(getReviewsForPassenger(key)));
  return () => {
    const bucket = passengerListeners[key];
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  };
};

type ReviewPayload = {
  rideId: string;
  driverEmail: string;
  driverName: string;
  passengerEmail: string;
  passengerName?: string;
  rating: number;
  comment: string;
  passengerAvatarColor?: string;
};

export const submitReview = (payload: ReviewPayload) => {
  const rideId = payload.rideId.trim();
  const driverEmail = normaliseEmail(payload.driverEmail);
  const passengerEmail = normaliseEmail(payload.passengerEmail);
  const rating = validateRating(payload.rating);
  const comment = sanitiseComment(payload.comment);
  const passengerName = buildPassengerName(passengerEmail, payload.passengerName);
  const driverName = payload.driverName?.trim() || 'Conducteur';
  const baseAvatarColor = payload.passengerAvatarColor ?? fallbackAvatarColor(passengerEmail);
  const now = Date.now();

  const existing = reviews.find(
    (review) => review.rideId === rideId && review.passengerEmail === passengerEmail
  );

  if (existing) {
    const updated: Review = {
      ...existing,
      rating,
      comment,
      updatedAt: now,
      passengerName,
      passengerAvatarColor: payload.passengerAvatarColor ?? existing.passengerAvatarColor ?? baseAvatarColor,
      driverName,
    };
    reviews = reviews.map((item) => (item.id === existing.id ? updated : item));
    notifyDriver(driverEmail);
    notifyRide(rideId);
    notifyPassenger(passengerEmail);
    return updated;
  }

  const review: Review = {
    id: randomId(),
    rideId,
    driverEmail,
    driverName,
    passengerEmail,
    passengerName,
    rating,
    comment,
    createdAt: now,
    updatedAt: now,
    passengerAvatarColor: baseAvatarColor,
  };
  reviews = [review, ...reviews];
  notifyDriver(driverEmail);
  notifyRide(rideId);
  notifyPassenger(passengerEmail);
  pushNotification({
    to: driverEmail,
    title: 'Nouvel avis reçu',
    body: `${passengerName} a noté ton trajet ${rating.toFixed(1)}/5.`,
    metadata: {
      action: 'driver-review',
      rideId,
      rating,
      passenger: passengerName,
    },
  });
  return review;
};

export const respondToReview = (reviewId: string, response: string) => {
  const body = response.trim();
  if (!body) {
    throw new Error('La réponse ne peut pas être vide');
  }
  const target = reviews.find((review) => review.id === reviewId);
  if (!target) {
    throw new Error('Avis introuvable');
  }
  const now = Date.now();
  const updated: Review = {
    ...target,
    response: { body, createdAt: now },
    updatedAt: now,
  };
  reviews = reviews.map((item) => (item.id === reviewId ? updated : item));
  notifyDriver(updated.driverEmail);
  notifyRide(updated.rideId);
  notifyPassenger(updated.passengerEmail);
  pushNotification({
    to: updated.passengerEmail,
    title: 'Réponse conductrice',
    body: `${updated.driverName} a répondu à ton avis.`,
    metadata: {
      action: 'review-response',
      rideId: updated.rideId,
      driver: updated.driverName,
    },
  });
  return updated;
};

export const removeReview = (reviewId: string) => {
  const target = reviews.find((item) => item.id === reviewId);
  if (!target) return;
  reviews = reviews.filter((item) => item.id !== reviewId);
  notifyDriver(target.driverEmail);
  notifyRide(target.rideId);
  notifyPassenger(target.passengerEmail);
};

type RatingInput = {
  completedRides: number;
  averageRating: number;
};

export const estimateRatingConfidence = ({ completedRides, averageRating }: RatingInput) => {
  if (completedRides <= 0 || averageRating <= 0) {
    return 0;
  }
  const cappedRides = Math.min(completedRides, 20);
  return Math.round((cappedRides / 20) * 100);
};

(() => {
  const now = Date.now();
  reviews = [
    {
      id: 'review-seed-1',
      rideId: 'seed-1',
      driverEmail: 'lina.dupont@ephec.be',
      driverName: 'Lina Dupont',
      passengerEmail: 'marc.durand@ephec.be',
      passengerName: 'Marc',
      rating: 4.8,
      comment: 'Trajet très agréable, véhicule propre et arrivée à l’heure.',
      createdAt: now - 1000 * 60 * 60 * 24 * 4,
      updatedAt: now - 1000 * 60 * 60 * 24 * 4,
      response: {
        body: 'Merci Marc ! Au plaisir de te reconduire 😊',
        createdAt: now - 1000 * 60 * 60 * 24 * 3,
      },
      passengerAvatarColor: '#8F8DFF',
    },
    {
      id: 'review-seed-2',
      rideId: 'seed-2',
      driverEmail: 'bilal.nasser@ephec.be',
      driverName: 'Bilal Nasser',
      passengerEmail: 'lea.fernandez@ephec.be',
      passengerName: 'Léa',
      rating: 4.6,
      comment: 'Bonne ambiance dans la voiture, Bilal est très sympa.',
      createdAt: now - 1000 * 60 * 60 * 24 * 2,
      updatedAt: now - 1000 * 60 * 60 * 24 * 2,
      passengerAvatarColor: '#FF9EBB',
    },
  ];
})();

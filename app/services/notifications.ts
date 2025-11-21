// app/services/notifications.ts
// Service en mémoire pour simuler l'envoi d'une notification au conducteur.

export type Notification = {
  id: string;
  to: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  metadata?: Record<string, unknown>;
};

type Listener = (items: Notification[]) => void;

const listeners: Record<string, Listener[]> = {};
const store: Record<string, Notification[]> = {};
const areaSubscriptions: Record<string, Set<string>> = {};

const clone = (items: Notification[]) => items.map((item) => ({ ...item }));

const randomId = () => Math.random().toString(36).slice(2, 10);

const ensureBucket = (email: string) => {
  const key = email.toLowerCase();
  if (!store[key]) store[key] = [];
  if (!listeners[key]) listeners[key] = [];
  return key;
};

export const pushNotification = (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => {
  const key = ensureBucket(notification.to);
  const payload: Notification = {
    ...notification,
    id: randomId(),
    createdAt: Date.now(),
    read: false,
  };
  store[key] = [payload, ...store[key]];
  listeners[key].forEach((cb) => cb(clone(store[key])));
  return payload;
};

export const subscribeNotifications = (email: string, cb: Listener) => {
  const key = ensureBucket(email);
  listeners[key].push(cb);
  cb(clone(store[key]));
  return () => {
    const bucket = listeners[key];
    const idx = bucket.indexOf(cb);
    if (idx >= 0) bucket.splice(idx, 1);
  };
};

export const markAsRead = (email: string, notificationId: string) => {
  const key = ensureBucket(email);
  store[key] = store[key].map((notif) =>
    notif.id === notificationId ? { ...notif, read: true } : notif
  );
  listeners[key].forEach((cb) => cb(clone(store[key])));
};

export const clearNotifications = (email: string) => {
  const key = ensureBucket(email);
  store[key] = [];
  listeners[key].forEach((cb) => cb([]));
};

const ensureAreaBucket = (areaId: string) => {
  if (!areaSubscriptions[areaId]) {
    areaSubscriptions[areaId] = new Set<string>();
  }
  return areaSubscriptions[areaId];
};

export const registerAreaInterest = (email: string, areaId: string) => {
  if (!email) return;
  const bucket = ensureAreaBucket(areaId);
  bucket.add(email.toLowerCase());
};

export const getAreaSubscribers = (areaId: string) => {
  const bucket = ensureAreaBucket(areaId);
  return Array.from(bucket.values());
};
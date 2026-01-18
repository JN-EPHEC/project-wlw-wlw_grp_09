const STORAGE_KEY = 'campusride_notifications_v1';

export type NotificationEntry = {
  id: string;
  userEmail: string;
  type: 'ride_published' | 'ride_deleted' | string;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
};

type Listener = (items: NotificationEntry[]) => void;

const safeParse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const readStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {} as Record<string, NotificationEntry[]>;
  }
  return safeParse<Record<string, NotificationEntry[]>>(window.localStorage.getItem(STORAGE_KEY), {});
};

const writeStorage = (state: Record<string, NotificationEntry[]>) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const listeners: Record<string, Listener[]> = {};

const ensureBucket = (email: string) => {
  const key = normalizeEmail(email);
  if (!listeners[key]) listeners[key] = [];
  const state = readStorage();
  if (!state[key]) state[key] = [];
  return { key, state };
};

const emit = (email: string) => {
  const key = normalizeEmail(email);
  const state = readStorage();
  const bucket = state[key] ?? [];
  listeners[key]?.forEach((listener) => listener([...bucket]));
};

const clone = (items: NotificationEntry[]) => items.map((item) => ({ ...item }));

const ensureReadyBucket = (email: string) => {
  const key = normalizeEmail(email);
  const state = readStorage();
  if (!state[key]) state[key] = [];
  return { key, state };
};

export const createNotification = (
  userEmail: string,
  type: NotificationEntry['type'],
  title: string,
  message: string
) => {
  if (!userEmail) return null;
  const normalized = normalizeEmail(userEmail);
  if (!normalized) return null;
  const { key, state } = ensureReadyBucket(normalized);
  const entry: NotificationEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userEmail: normalized,
    type,
    title,
    message,
    read: false,
    createdAt: Date.now(),
  };
  state[key] = [entry, ...state[key]];
  writeStorage(state);
  emit(normalized);
  console.debug('[Notifications] create', entry);
  return entry;
};

export const listNotificationsByUser = (userEmail: string) => {
  if (!userEmail) return [];
  const { key } = ensureReadyBucket(userEmail);
  const state = readStorage();
  return [...(state[key] ?? [])];
};

export const subscribeNotificationsByUser = (userEmail: string, listener: Listener) => {
  if (!userEmail) return () => undefined;
  const { key } = ensureBucket(userEmail);
  listeners[key].push(listener);
  const state = readStorage();
  listener(clone(state[key]));
  return () => {
    const bucket = listeners[key];
    const idx = bucket.indexOf(listener);
    if (idx >= 0) bucket.splice(idx, 1);
  };
};

export const markAsRead = (userEmail: string, notificationId: string) => {
  if (!userEmail) return;
  const { key, state } = ensureReadyBucket(userEmail);
  state[key] = state[key].map((item) =>
    item.id === notificationId ? { ...item, read: true } : item
  );
  writeStorage(state);
  emit(key);
};

export const markAllAsRead = (userEmail: string) => {
  if (!userEmail) return;
  const { key, state } = ensureReadyBucket(userEmail);
  state[key] = state[key].map((item) => ({ ...item, read: true }));
  writeStorage(state);
  emit(key);
};

export const deleteNotification = (userEmail: string, notificationId: string) => {
  if (!userEmail) return;
  const { key, state } = ensureReadyBucket(userEmail);
  state[key] = state[key].filter((item) => item.id !== notificationId);
  writeStorage(state);
  emit(key);
};

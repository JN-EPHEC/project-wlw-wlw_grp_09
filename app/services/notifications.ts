// app/services/notifications.ts
// Service en mémoire pour simuler l'envoi d'une notification au conducteur.

import {
  persistNotificationEventRecord,
  persistNotificationPreferencesRecord,
  persistPushTokenRecord,
} from '@/src/firestoreNotifications';

export type Notification = {
  id: string;
  to: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  metadata?: Record<string, unknown>;
};

export type NotificationPreferences = {
  pushEnabled: boolean;
  remindersEnabled: boolean;
  soundEnabled: boolean;
  pushToken: string | null;
  platform?: 'ios' | 'android' | 'web' | 'unknown';
  lastRegisteredAt: number | null;
};

export type NotificationRequest = Omit<Notification, 'id' | 'createdAt' | 'read'> & {
  scheduleAt?: number | null;
  scheduleKey?: string;
};

type PreferenceListener = (preferences: NotificationPreferences) => void;

type Listener = (items: Notification[]) => void;

const listeners: Record<string, Listener[]> = {};
const store: Record<string, Notification[]> = {};
const areaSubscriptions: Record<string, Set<string>> = {};
const preferenceStore: Record<string, NotificationPreferences> = {};
const preferenceListeners: Record<string, PreferenceListener[]> = {};
const scheduledByEmail: Record<string, Set<string>> = {};
const scheduledOwners: Record<string, string> = {};

type PushDeliverer = (input: {
  notification: Notification;
  scheduleAt?: number | null;
  scheduleKey?: string;
  preference: NotificationPreferences;
}) => void | Promise<void>;

type ScheduleCanceler = (scheduleKey: string) => void | Promise<void>;

let deliverer: PushDeliverer | null = null;
let scheduleCanceler: ScheduleCanceler | null = null;

const clone = (items: Notification[]) => items.map((item) => ({ ...item }));

const randomId = () => Math.random().toString(36).slice(2, 10);

const ensureBucket = (email: string) => {
  const key = email.toLowerCase();
  if (!store[key]) store[key] = [];
  if (!listeners[key]) listeners[key] = [];
  return key;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const defaultPreferences = (): NotificationPreferences => ({
  pushEnabled: true,
  remindersEnabled: true,
  soundEnabled: true,
  pushToken: null,
  platform: undefined,
  lastRegisteredAt: null,
});

const ensurePreferences = (email: string) => {
  const key = normalizeEmail(email);
  if (!preferenceStore[key]) {
    preferenceStore[key] = defaultPreferences();
  }
  if (!preferenceListeners[key]) {
    preferenceListeners[key] = [];
  }
  return { key, preferences: preferenceStore[key] };
};

const notifyPreferenceListeners = (email: string) => {
  const key = normalizeEmail(email);
  const bucket = preferenceListeners[key];
  if (!bucket || bucket.length === 0) return;
  const prefs = { ...preferenceStore[key] };
  bucket.forEach((listener) => listener(prefs));
};

const trackScheduleKey = (email: string, scheduleKey: string) => {
  const key = normalizeEmail(email);
  if (!scheduledByEmail[key]) {
    scheduledByEmail[key] = new Set();
  }
  scheduledByEmail[key]?.add(scheduleKey);
  scheduledOwners[scheduleKey] = key;
};

const dropScheduleKey = (scheduleKey: string) => {
  const owner = scheduledOwners[scheduleKey];
  if (owner) {
    scheduledByEmail[owner]?.delete(scheduleKey);
  }
  delete scheduledOwners[scheduleKey];
};

const clearSchedulesForEmailInternal = (email: string) => {
  const key = normalizeEmail(email);
  const entries = scheduledByEmail[key];
  if (!entries || entries.size === 0) return;
  const identifiers = Array.from(entries);
  entries.clear();
  delete scheduledByEmail[key];
  identifiers.forEach((identifier) => {
    delete scheduledOwners[identifier];
    scheduleCanceler?.(identifier);
  });
};

export const pushNotification = (request: NotificationRequest) => {
  const { scheduleAt, scheduleKey, ...notification } = request;
  const key = ensureBucket(notification.to);
  const payload: Notification = {
    ...notification,
    id: randomId(),
    createdAt: Date.now(),
    read: false,
  };
  store[key] = [payload, ...store[key]];
  listeners[key].forEach((cb) => cb(clone(store[key])));
  void persistNotificationEventRecord({
    ...payload,
    scheduleAt: scheduleAt ?? null,
    scheduleKey: scheduleKey ?? null,
  });

  const preference = getNotificationPreferences(notification.to);
  const wantsReminder = !scheduleAt || preference.remindersEnabled;
  if (
    deliverer &&
    preference.pushEnabled &&
    preference.pushToken &&
    wantsReminder &&
    (!scheduleAt || scheduleAt > Date.now())
  ) {
    if (scheduleAt && scheduleKey) {
      trackScheduleKey(notification.to, scheduleKey);
    }
    deliverer({
      notification: payload,
      scheduleAt,
      scheduleKey: scheduleAt ? scheduleKey : undefined,
      preference,
    });
  }
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

export const getNotificationPreferences = (email: string): NotificationPreferences => {
  const key = ensurePreferences(email).key;
  return { ...preferenceStore[key] };
};

export const subscribeNotificationPreferences = (
  email: string,
  listener: PreferenceListener
) => {
  const { key, preferences } = ensurePreferences(email);
  preferenceListeners[key].push(listener);
  listener({ ...preferences });
  return () => {
    const bucket = preferenceListeners[key];
    const idx = bucket.indexOf(listener);
    if (idx >= 0) {
      bucket.splice(idx, 1);
    }
  };
};

export const updateNotificationPreferences = (
  email: string,
  updates: Partial<NotificationPreferences>
) => {
  const { key, preferences } = ensurePreferences(email);
  const next: NotificationPreferences = {
    ...preferences,
    ...updates,
  };
  preferenceStore[key] = next;
  if (!next.pushEnabled || !next.remindersEnabled) {
    clearSchedulesForEmailInternal(email);
  }
  void persistNotificationPreferencesRecord(key, next);
  notifyPreferenceListeners(email);
  return next;
};

export const registerPushToken = (
  email: string,
  token: string,
  platform?: NotificationPreferences['platform']
) => {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  const result = updateNotificationPreferences(normalized, {
    pushToken: token,
    platform: platform ?? undefined,
    lastRegisteredAt: Date.now(),
  });
  void persistPushTokenRecord({ email: normalized, token, platform });
  return result;
};

export const setNotificationDeliverer = (
  nextDeliverer: PushDeliverer | null,
  nextCanceler?: ScheduleCanceler
) => {
  deliverer = nextDeliverer;
  scheduleCanceler = nextCanceler ?? null;
};

export const cancelNotificationSchedule = (scheduleKey: string) => {
  if (!scheduleKey) return;
  dropScheduleKey(scheduleKey);
  scheduleCanceler?.(scheduleKey);
};

export const clearScheduledNotificationsForEmail = (email: string) => {
  clearSchedulesForEmailInternal(email);
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

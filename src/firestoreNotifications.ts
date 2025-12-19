import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  type DocumentReference,
} from 'firebase/firestore';

import { db } from './firebase';

type NotificationPreferencesDocument = {
  pushEnabled: boolean;
  remindersEnabled: boolean;
  soundEnabled: boolean;
  pushToken: string | null;
  platform?: string;
  lastRegisteredAt: number | null;
};

type PushTokenRecord = {
  email: string;
  token: string;
  platform?: string | null;
};

type NotificationEventRecord = {
  id: string;
  to: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  metadata?: Record<string, unknown> | undefined;
  scheduleAt?: number | null;
  scheduleKey?: string | null;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const notificationTokensCol = collection(db, 'notificationTokens');
const notificationPreferencesCol = collection(db, 'notificationPreferences');
const notificationsCol = collection(db, 'notifications');

const sanitizeMetadata = (metadata?: Record<string, unknown>) => {
  if (!metadata) return null;
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch (error) {
    console.warn('[notifications][firestore] unable to serialise metadata', error);
    return null;
  }
};

const safeSetDoc = async (
  ref: DocumentReference,
  data: Record<string, unknown>
) => {
  try {
    await setDoc(ref, data, { merge: true });
  } catch (error) {
    console.warn('[notifications][firestore] persist failed', error);
  }
};

export const persistPushTokenRecord = async ({
  email,
  token,
  platform,
}: PushTokenRecord) => {
  if (!email || !token) return;
  const normalized = normalizeEmail(email);
  const ref = doc(notificationTokensCol, normalized);
  await safeSetDoc(ref, {
    email: normalized,
    token,
    platform: platform ?? 'unknown',
    updatedAt: serverTimestamp(),
  });
};

export const persistNotificationPreferencesRecord = async (
  email: string,
  preferences: NotificationPreferencesDocument
) => {
  if (!email) return;
  const normalized = normalizeEmail(email);
  const ref = doc(notificationPreferencesCol, normalized);
  await safeSetDoc(ref, {
    email: normalized,
    ...preferences,
    updatedAt: serverTimestamp(),
  });
};

export const persistNotificationEventRecord = async (
  event: NotificationEventRecord
) => {
  if (!event?.id) return;
  try {
    await addDoc(notificationsCol, {
      notificationId: event.id,
      to: normalizeEmail(event.to),
      title: event.title,
      body: event.body,
      metadata: sanitizeMetadata(event.metadata),
      createdAt: event.createdAt,
      read: event.read,
      scheduleAt: event.scheduleAt ?? null,
      scheduleKey: event.scheduleKey ?? null,
      persistedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('[notifications][firestore] persist event failed', error);
  }
};

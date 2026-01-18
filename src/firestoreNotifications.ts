import { addDoc, collection, serverTimestamp, setDoc } from 'firebase/firestore';

import { userDocRef, requireUid } from './firestore/userDocumentHelpers';
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
  uid: string | null | undefined;
  email?: string | null;
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

const normalizeEmail = (value?: string | null) => {
  if (!value) return null;
  return value.trim().toLowerCase();
};

const NOTIFICATION_TOKENS_COLLECTION = 'notificationTokens';
const NOTIFICATION_PREFERENCES_COLLECTION = 'notificationPreferences';
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

const safeSetDoc = async (ref: ReturnType<typeof userDocRef>, data: Record<string, unknown>) => {
  try {
    await setDoc(ref, data, { merge: true });
  } catch (error) {
    console.warn('[notifications][firestore] persist failed', error);
  }
};

export const persistPushTokenRecord = async ({
  uid,
  email,
  token,
  platform,
}: PushTokenRecord) => {
  if (!token) return;
  const userId = requireUid(uid);
  const normalized = normalizeEmail(email);
  const ref = userDocRef(NOTIFICATION_TOKENS_COLLECTION, userId);
  await safeSetDoc(ref, {
    email: normalized,
    ownerUid: userId,
    token,
    platform: platform ?? 'unknown',
    updatedAt: serverTimestamp(),
  });
};

export const persistNotificationPreferencesRecord = async (
  uid: string | null | undefined,
  preferences: NotificationPreferencesDocument,
  email?: string | null
) => {
  const userId = requireUid(uid);
  const normalized = normalizeEmail(email ?? null);
  const ref = userDocRef(NOTIFICATION_PREFERENCES_COLLECTION, userId);
  await safeSetDoc(ref, {
    email: normalized,
    ownerUid: userId,
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

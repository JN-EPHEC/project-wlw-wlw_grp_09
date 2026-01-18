import AsyncStorage from '@react-native-async-storage/async-storage';

export type LocalNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  metadata?: {
    action?: string;
    driver?: string;
    passenger?: string;
    amount?: number;
    threadId?: string;
    [k: string]: unknown;
  } | null;
};

type LocalNotificationInput = {
  title: string;
  body: string;
  metadata?: LocalNotification['metadata'];
};

const STORAGE_KEY = '@campusrider/local-notifications';

let notifications: LocalNotification[] = [];
const listeners = new Set<(items: LocalNotification[]) => void>();
let initialized = false;
let initializationPromise: Promise<void> | null = null;

const normalizeMetadata = (value: unknown): LocalNotification['metadata'] | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as LocalNotification['metadata'];
};

const normalizeNotification = (value: unknown): LocalNotification | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const entry = value as Record<string, unknown>;
  const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id : null;
  const title = typeof entry.title === 'string' ? entry.title.trim() : null;
  const body = typeof entry.body === 'string' ? entry.body.trim() : null;
  const read = typeof entry.read === 'boolean' ? entry.read : false;
  const timestamp =
    typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
      ? entry.createdAt
      : Date.now();

  if (!id || !title || !body) {
    return null;
  }

  return {
    id,
    title,
    body,
    read,
    createdAt: timestamp,
    metadata: normalizeMetadata(entry.metadata),
  };
};

const generateId = () => {
  const randomUUID =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID.bind(globalThis.crypto)
      : null;
  if (randomUUID) {
    return randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

const persistNotifications = async () => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch (error) {
    console.warn('[localNotifications] persist failed', error);
  }
};

const emit = () => {
  const snapshot = notifications.slice();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn('[localNotifications] listener error', error);
    }
  });
};

const loadNotifications = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      notifications = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      notifications = [];
      return;
    }
    const normalized = parsed
      .map((item) => normalizeNotification(item))
      .filter((item): item is LocalNotification => item !== null);
    notifications = normalized;
  } catch (error) {
    console.warn('[localNotifications] hydrate failed', error);
    notifications = [];
  }
};

const ensureInitialized = async () => {
  if (initialized) {
    return;
  }
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await loadNotifications();
      initialized = true;
      initializationPromise = null;
      emit();
    })();
  }
  await initializationPromise;
};

const withInitialized = async (action: () => Promise<void>) => {
  await ensureInitialized();
  await action();
};

export const subscribeLocalNotifications = (listener: (items: LocalNotification[]) => void) => {
  let active = true;
  const cleanup = () => {
    active = false;
    listeners.delete(listener);
  };

  ensureInitialized().then(() => {
    if (!active) return;
    listeners.add(listener);
    listener(notifications.slice());
  });
  return cleanup;
};

export const pushLocalNotification = async (input: LocalNotificationInput) => {
  await withInitialized(async () => {
    const notification: LocalNotification = {
      id: generateId(),
      title: input.title,
      body: input.body,
      metadata: normalizeMetadata(input.metadata ?? null),
      createdAt: Date.now(),
      read: false,
    };
    notifications = [notification, ...notifications];
    await persistNotifications();
    emit();
  });
};

export const markLocalAsRead = async (id: string) => {
  await withInitialized(async () => {
    let changed = false;
    notifications = notifications.map((item) => {
      if (item.id === id && !item.read) {
        changed = true;
        return { ...item, read: true };
      }
      return item;
    });
    if (!changed) {
      return;
    }
    await persistNotifications();
    emit();
  });
};

export const markAllLocalAsRead = async () => {
  await withInitialized(async () => {
    const next = notifications.map((item) => (item.read ? item : { ...item, read: true }));
    const changed = next.some((item, index) => item !== notifications[index]);
    if (!changed) {
      return;
    }
    notifications = next;
    await persistNotifications();
    emit();
  });
};

export const clearLocalNotifications = async () => {
  await withInitialized(async () => {
    notifications = [];
    await AsyncStorage.removeItem(STORAGE_KEY);
    emit();
  });
};

void ensureInitialized();

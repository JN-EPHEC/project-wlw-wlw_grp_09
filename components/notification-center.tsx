import { useCallback, useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

import { useAuthSession } from '@/hooks/use-auth-session';
import {
  getNotificationPreferences,
  registerPushToken,
  setNotificationDeliverer,
  subscribeNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
  type Notification as CampusNotification,
} from '@/app/services/notifications';

const DEFAULT_CHANNEL = 'campusride-default';
const TOKEN_REFRESH_INTERVAL = 1000 * 60 * 60 * 24; // 24h

const resolvePlatform = (): NotificationPreferences['platform'] => {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return 'unknown';
};

const buildNotificationContent = (
  notification: CampusNotification,
  preference: NotificationPreferences,
  scheduleKey?: string
): Notifications.NotificationContentInput => {
  const data = {
    ...(notification.metadata ?? {}),
    notificationId: notification.id,
    scheduleKey,
  };
  const base: Notifications.NotificationContentInput = {
    title: notification.title,
    body: notification.body,
    data,
    sound: preference.soundEnabled ? 'default' : undefined,
  };
  if (Platform.OS === 'android') {
    base.android = {
      channelId: DEFAULT_CHANNEL,
      priority: Notifications.AndroidNotificationPriority.HIGH,
      sound: preference.soundEnabled ? 'default' : undefined,
    };
  }
  return base;
};

const shouldRefreshToken = (prefs: NotificationPreferences) => {
  if (!prefs.pushEnabled) return false;
  if (!prefs.pushToken) return true;
  if (!prefs.lastRegisteredAt) return true;
  return Date.now() - prefs.lastRegisteredAt > TOKEN_REFRESH_INTERVAL;
};

export default function NotificationCenter() {
  const session = useAuthSession();
  const router = useRouter();
  const scheduledMap = useRef(new Map<string, string>());
  const registeringRef = useRef(false);

  const navigateFromNotification = useCallback(
    (data: Record<string, unknown> | undefined) => {
      if (!data) return;
      const threadId = typeof data.threadId === 'string' ? data.threadId : undefined;
      const rideId = typeof data.rideId === 'string' ? data.rideId : undefined;
      const action = typeof data.action === 'string' ? data.action : undefined;

      const openRide = () => {
        if (rideId) {
          router.push({ pathname: '/ride/[id]', params: { id: rideId } });
        } else {
          router.push('/(tabs)/index');
        }
      };

      if (threadId) {
        router.push({ pathname: '/(tabs)/messages', params: { thread: threadId } });
        return;
      }

      if (action === 'wallet-credit' || action === 'wallet-withdrawal') {
        router.push('/wallet');
        return;
      }

      if (action === 'driver-review') {
        if (session.email) {
          router.push({ pathname: '/reviews/[email]', params: { email: session.email } });
        } else {
          router.push('/(tabs)/profile');
        }
        return;
      }

      if (action === 'driver-reward') {
        router.push('/(tabs)/profile');
        return;
      }

      const rideActions = new Set([
        'ride-published',
        'ride-cancelled',
        'ride-status-changed',
        'ride-reminder',
        'reservation-confirmed',
        'reservation-cancelled',
        'reservation-cancelled-confirmation',
        'payment-confirmed',
        'payment-received',
        'review-response',
      ]);

      if (action && rideActions.has(action)) {
        openRide();
        return;
      }

      if (rideId) {
        openRide();
        return;
      }

      router.push('/(tabs)/index');
    },
    [router, session.email]
  );

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL, {
        name: 'CampusRide',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        enableLights: true,
        lightColor: '#FF8B78',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      }).catch(() => null);
    }
  }, []);

  useEffect(() => {
    const handleResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateFromNotification(response.notification.request.content.data as Record<string, unknown>);
    });
    return () => handleResponse.remove();
  }, [navigateFromNotification]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last) {
        navigateFromNotification(last.notification.request.content.data as Record<string, unknown>);
      }
    })();
  }, [navigateFromNotification]);

  useEffect(() => {
    const listener = Notifications.addNotificationReceivedListener((event) => {
      const key = typeof event.request.content.data?.scheduleKey === 'string'
        ? (event.request.content.data.scheduleKey as string)
        : null;
      if (key) {
        scheduledMap.current.delete(key);
      }
    });
    return () => listener.remove();
  }, []);

  useEffect(() => {
    const mapStore = scheduledMap.current;
    const deliverer = async ({
      notification,
      scheduleAt,
      scheduleKey,
      preference,
    }: {
      notification: CampusNotification;
      scheduleAt?: number | null;
      scheduleKey?: string;
      preference: NotificationPreferences;
    }) => {
      if (!preference.pushEnabled) return;
      const content = buildNotificationContent(notification, preference, scheduleKey);
      try {
        if (scheduleAt && scheduleKey) {
          const identifier = await Notifications.scheduleNotificationAsync({
            content,
            trigger: new Date(scheduleAt),
          });
          scheduledMap.current.set(scheduleKey, identifier);
        } else {
          await Notifications.presentNotificationAsync(content);
        }
      } catch (error) {
        console.warn('[notifications] delivery failed', error);
      }
    };
    const canceler = async (scheduleKey?: string) => {
      if (!scheduleKey) return;
      const identifier = scheduledMap.current.get(scheduleKey);
      if (!identifier) return;
      scheduledMap.current.delete(scheduleKey);
      try {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      } catch (error) {
        console.warn('[notifications] cancel failed', error);
      }
    };
    setNotificationDeliverer(deliverer, canceler);
    return () => {
      setNotificationDeliverer(null);
      mapStore.clear();
    };
  }, []);

  const refreshToken = useCallback(
    async (prefs: NotificationPreferences) => {
      if (!session.email || registeringRef.current) return;
      if (!shouldRefreshToken(prefs)) return;
      registeringRef.current = true;
      try {
        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
          const request = await Notifications.requestPermissionsAsync();
          status = request.status;
        }
        if (status !== 'granted') {
          Alert.alert(
            'Notifications désactivées',
            'Active les notifications dans les réglages de ton appareil pour les recevoir.'
          );
          updateNotificationPreferences(session.email, { pushEnabled: false });
          return;
        }
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        const tokenResponse = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );
        registerPushToken(session.email, tokenResponse.data, resolvePlatform());
      } catch (error) {
        console.warn('[notifications] token registration failed', error);
      } finally {
        registeringRef.current = false;
      }
    },
    [session.email]
  );

  useEffect(() => {
    if (!session.email) return;
    const initial = getNotificationPreferences(session.email);
    void refreshToken(initial);
    const unsubscribe = subscribeNotificationPreferences(session.email, (next) => {
      void refreshToken(next);
    });
    return unsubscribe;
  }, [session.email, refreshToken]);

  return null;
}

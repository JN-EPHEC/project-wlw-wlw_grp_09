import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { useAuthSession } from '@/hooks/use-auth-session';
import {
  markAsRead as markNotificationAsRead,
  subscribeNotifications,
  type Notification,
} from '@/app/services/notifications';
import { getAvatarUrl } from '@/app/ui/avatar';

const C = Colors;

type IconTheme = {
  icon: Parameters<typeof IconSymbol>[0]['name'];
  tint: string;
  background: string;
  accentLabel: string;
  avatarSeed?: string | null;
};

const ACTION_THEMES: Record<string, IconTheme> = {
  'ride-reminder': {
    icon: 'clock',
    tint: C.warning,
    background: C.warningLight,
    accentLabel: 'Rappel de trajet',
  },
  'reservation-confirmed': {
    icon: 'checkmark.circle.fill',
    tint: C.success,
    background: C.successLight,
    accentLabel: 'Trajet confirmé',
  },
  'reservation-cancelled': {
    icon: 'exclamationmark.triangle',
    tint: C.danger,
    background: C.dangerLight,
    accentLabel: 'Réservation',
  },
  'reservation-cancelled-confirmation': {
    icon: 'exclamationmark.triangle',
    tint: C.danger,
    background: C.dangerLight,
    accentLabel: 'Réservation',
  },
  'ride-cancelled': {
    icon: 'exclamationmark.triangle',
    tint: C.danger,
    background: C.dangerLight,
    accentLabel: 'Trajet annulé',
  },
  'ride-status-changed': {
    icon: 'car.fill',
    tint: C.primary,
    background: C.primaryLight,
    accentLabel: 'Trajet mis à jour',
  },
  'ride-published': {
    icon: 'sparkles',
    tint: C.accent,
    background: C.accentSoft,
    accentLabel: 'Nouveau trajet',
  },
  'wallet-credit': {
    icon: 'creditcard.fill',
    tint: C.success,
    background: C.successLight,
    accentLabel: 'Versement reçu',
  },
  'wallet-topup': {
    icon: 'creditcard.fill',
    tint: C.primary,
    background: C.primaryLight,
    accentLabel: 'Recharge wallet',
  },
  'wallet-withdrawal': {
    icon: 'creditcard.fill',
    tint: C.primary,
    background: C.primaryLight,
    accentLabel: 'Virement en cours',
  },
  'payment-confirmed': {
    icon: 'creditcard.fill',
    tint: C.primary,
    background: C.primaryLight,
    accentLabel: 'Paiement effectué',
  },
  'payment-received': {
    icon: 'creditcard.fill',
    tint: C.success,
    background: C.successLight,
    accentLabel: 'Paiement reçu',
  },
  'driver-review': {
    icon: 'star.fill',
    tint: C.accent,
    background: C.accentSoft,
    accentLabel: 'Nouveau avis',
  },
  'review-response': {
    icon: 'bubble.left.and.bubble.right.fill',
    tint: C.secondaryDark,
    background: C.secondaryLight,
    accentLabel: 'Réponse reçue',
  },
  'driver-reward': {
    icon: 'star.fill',
    tint: C.secondaryDark,
    background: C.secondaryLight,
    accentLabel: 'Récompense',
  },
};

const formatRelative = (timestamp: number) => {
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'À l’instant';
  if (diff < hour) {
    const value = Math.floor(diff / minute);
    return `Il y a ${value} min`;
  }
  if (diff < day) {
    const value = Math.floor(diff / hour);
    return `Il y a ${value} h`;
  }
  if (diff < day * 2) return 'Hier';
  const days = Math.floor(diff / day);
  return `Il y a ${days} j`;
};

const getAccent = (notification: Notification): IconTheme => {
  const action = typeof notification.metadata?.action === 'string' ? notification.metadata.action : null;
  const hint = action ? ACTION_THEMES[action] : undefined;
  if (hint) {
    const avatarSeed =
      typeof notification.metadata?.passenger === 'string'
        ? notification.metadata.passenger
        : typeof notification.metadata?.driver === 'string'
          ? notification.metadata.driver
          : null;
    return { ...hint, avatarSeed };
  }
  if (notification.title.toLowerCase().includes('message')) {
    return {
      icon: 'bubble.left.and.bubble.right.fill',
      tint: C.primary,
      background: C.primaryLight,
      accentLabel: notification.title,
      avatarSeed: notification.metadata && typeof notification.metadata.threadId === 'string' ? notification.metadata.threadId : null,
    };
  }
  return {
    icon: 'bell.fill',
    tint: C.primary,
    background: C.primaryLight,
    accentLabel: notification.title,
    avatarSeed: null,
  };
};

const NotificationCard = ({
  notification,
  onMarkAsRead,
}: {
  notification: Notification;
  onMarkAsRead?: (notification: Notification) => void;
}) => {
  const accent = useMemo(() => getAccent(notification), [notification]);
  const relative = useMemo(() => formatRelative(notification.createdAt), [notification.createdAt]);
  const showAvatar = !!accent.avatarSeed;
  const avatarSource = showAvatar ? { uri: getAvatarUrl(accent.avatarSeed ?? 'notification', 96) } : null;

  return (
    <View style={styles.cardRow}>
      {showAvatar && avatarSource ? (
        <Image
          source={avatarSource}
          style={styles.cardAvatar}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.cardIcon, { backgroundColor: accent.background }]}>
          <IconSymbol name={accent.icon} size={22} color={accent.tint} />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{accent.accentLabel}</Text>
          <Text style={styles.cardTime}>{relative}</Text>
        </View>
        <Text style={styles.cardSubtitle} numberOfLines={2}>
          {notification.body}
        </Text>
      </View>
      {!notification.read ? (
        <Pressable
          onPress={() => onMarkAsRead?.(notification)}
          hitSlop={8}
          style={styles.cardAction}
        >
          <IconSymbol name="xmark" size={18} color={C.gray500} />
        </Pressable>
      ) : null}
    </View>
  );
};

export default function NotificationsScreen() {
  const session = useAuthSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  useEffect(() => {
    if (!session.email) return;
    const unsubscribe = subscribeNotifications(session.email, (items) => {
      setNotifications(items);
    });
    return unsubscribe;
  }, [session.email]);

  const unread = useMemo(() => notifications.filter((notif) => !notif.read), [notifications]);
  const older = useMemo(() => notifications.filter((notif) => notif.read), [notifications]);
  const isDriver = session.isDriver;

  const handleMarkAsRead = useCallback(
    (notif: Notification) => {
      if (!session.email) return;
      markNotificationAsRead(session.email, notif.id);
    },
    [session.email]
  );

  const markAllAsRead = useCallback(() => {
    if (!session.email) return;
    unread.forEach((notif) => markNotificationAsRead(session.email!, notif.id));
  }, [session.email, unread]);

  return (
    <AppBackground colors={isDriver ? Gradients.driver : Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.pageHeader, isDriver && styles.pageHeaderDriver]}>
            <Pressable style={[styles.backButton, isDriver && styles.backButtonDriver]} onPress={() => router.back()}>
              <IconSymbol name="chevron.left" size={20} color={C.white} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Notifications</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {unread.length > 0
                  ? `${unread.length} notification${unread.length > 1 ? 's' : ''} non lue${unread.length > 1 ? 's' : ''}`
                  : 'Notifications'}
              </Text>
              {unread.length > 0 ? (
                <Pressable onPress={markAllAsRead} style={styles.sectionActionButton}>
                  <Text style={[styles.sectionAction, isDriver && styles.sectionActionDriver]}>
                    Tout marquer comme lu
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.sectionDivider} />
            {unread.length > 0 ? (
              unread.map((notif) => (
                <NotificationCard key={notif.id} notification={notif} onMarkAsRead={handleMarkAsRead} />
              ))
            ) : (
              <View style={styles.emptyState}>
                <IconSymbol name="sparkles" size={28} color={C.primary} />
                <Text style={styles.emptyTitle}>Rien à signaler</Text>
              </View>
            )}
          </View>

          {older.length > 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Plus anciennes</Text>
              <View style={styles.sectionDivider} />
              {older.map((notif) => (
                <NotificationCard key={notif.id} notification={notif} onMarkAsRead={handleMarkAsRead} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageHeaderDriver: {
    backgroundColor: 'transparent',
  },
  backButtonDriver: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  heroTitle: {
    color: C.white,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionCard: {
    backgroundColor: C.white,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.card,
  },
  sectionHeader: {
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
  },
  sectionSubtitle: {
    color: C.gray600,
    fontSize: 13,
    marginTop: 4,
  },
  sectionAction: {
    color: C.primary,
    fontWeight: '600',
  },
  sectionActionButton: {
    alignSelf: 'flex-start',
  },
  sectionActionDriver: {
    color: Colors.accent,
  },
  cardRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 15,
    color: C.ink,
  },
  cardTime: {
    fontSize: 12,
    color: C.gray500,
  },
  cardSubtitle: {
    color: C.gray700,
    fontSize: 13,
  },
  cardAction: {
    padding: 4,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: C.gray150,
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  emptyTitle: {
    fontWeight: '700',
    color: C.ink,
  },
});

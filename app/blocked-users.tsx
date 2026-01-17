import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { unblockUser } from '@/app/services/blocked-users';
import { Colors, Gradients, Radius, Shadows, Spacing, Typography } from '@/app/ui/theme';
import { GradientBackground } from '@/components/ui/gradient-background';
import { HeaderBackButton } from '@/components/ui/header-back-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useBlockedUsers } from '@/hooks/use-blocked-users';
import { useTranslation } from '@/hooks/use-language';

const C = Colors;

export default function BlockedUsersScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const blockedUsers = useBlockedUsers(session.email);
  const t = useTranslation();
  const backgroundColors = session.isDriver ? Gradients.driver : Gradients.twilight;

  const handleUnblock = useCallback(
    (email: string) => {
      if (!session.email) return;
      unblockUser(session.email, email);
    },
    [session.email]
  );

  return (
    <GradientBackground colors={backgroundColors} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <HeaderBackButton onPress={() => router.back()} />
          <Text style={styles.headerTitle}>{t('blockedUsersTitle')}</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {blockedUsers.length === 0 ? (
            <Text style={styles.empty}>{t('blockedUsersEmpty')}</Text>
          ) : (
            blockedUsers.map((email) => (
              <View key={email} style={styles.row}>
                <Text style={styles.rowEmail}>{email}</Text>
                <Pressable style={styles.unblockButton} onPress={() => handleUnblock(email)}>
                  <Text style={styles.unblockText}>Débloquer</Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.xl,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: Typography.heading.letterSpacing,
  },
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  empty: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  rowEmail: {
    fontWeight: '600',
    color: C.gray700,
    flex: 1,
  },
  unblockButton: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: C.secondaryDark,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  unblockText: {
    color: C.secondaryDark,
    fontWeight: '700',
  },
});

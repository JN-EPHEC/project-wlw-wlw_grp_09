import { router } from 'expo-router';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { GradientBackground } from '@/components/ui/gradient-background';
import { Colors, Gradients, Radius, Shadows, Spacing, Typography } from '@/app/ui/theme';
import PrivacyPolicyModal from '@/components/privacy-policy-modal';
import { useAuthSession } from '@/hooks/use-auth-session';
import {
  getNotificationPreferences,
  subscribeNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '@/app/services/notifications';
import { useBlockedUsers } from '@/hooks/use-blocked-users';

const C = Colors;

const useSettingSwitch = (initial: boolean): [boolean, (value: boolean) => void] => {
  const [value, setValue] = useState(initial);
  const toggle = (next: boolean) => setValue(next);
  return [value, toggle];
};

export default function SettingsScreen() {
  const session = useAuthSession();
  const email = session.email;
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences | null>(null);
  const [soundEnabledLocal, setSoundEnabledLocal] = useState(true);
  const [remindersEnabledLocal, setRemindersEnabledLocal] = useState(true);

  useEffect(() => {
    if (!email) {
      setNotificationPrefs(null);
      setSoundEnabledLocal(true);
      setRemindersEnabledLocal(true);
      return;
    }
    const current = getNotificationPreferences(email);
    setNotificationPrefs(current);
    setSoundEnabledLocal(current.soundEnabled);
    setRemindersEnabledLocal(current.remindersEnabled);
    const unsubscribe = subscribeNotificationPreferences(email, (prefs) => {
      setNotificationPrefs(prefs);
      setSoundEnabledLocal(prefs.soundEnabled);
      setRemindersEnabledLocal(prefs.remindersEnabled);
    });
    return unsubscribe;
  }, [email]);

  const [locationSharing, setLocationSharing] = useSettingSwitch(true);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const blockedUsers = useBlockedUsers(session.email);

  const handleOpenBlockedUsers = useCallback(() => {
    router.push('/blocked-users');
  }, []);

  const aboutVersion = useMemo(() => '1.0.0', []);

  const openChangePassword = () => router.push('/change-password');

  const openPrivacyPolicy = () => setPrivacyVisible(true);
  const closePrivacyPolicy = () => setPrivacyVisible(false);

  const openLanguageSelector = () =>
    Alert.alert('Langue', 'Les autres langues arrivent prochainement.');

  const openTerms = () =>
    Alert.alert('Conditions d’utilisation', 'Document disponible prochainement.');

  const handlePushChange = (value: boolean) => {
    if (!email) {
      Alert.alert('Connexion requise', 'Connecte-toi pour modifier les notifications.');
      return;
    }
    updateNotificationPreferences(email, { pushEnabled: value });
  };

  const handleSoundChange = (value: boolean) => {
    if (!email) {
      Alert.alert('Connexion requise', 'Connecte-toi pour modifier les notifications.');
      return;
    }
    setSoundEnabledLocal(value);
    updateNotificationPreferences(email, { soundEnabled: value });
  };

  const handleReminderChange = (value: boolean) => {
    if (!email) {
      Alert.alert('Connexion requise', 'Connecte-toi pour modifier les notifications.');
      return;
    }
    setRemindersEnabledLocal(value);
    updateNotificationPreferences(email, { remindersEnabled: value });
  };

  const pushEnabled = notificationPrefs?.pushEnabled ?? false;
  const remindersEnabled = notificationPrefs?.remindersEnabled ?? remindersEnabledLocal;

  return (
    <GradientBackground colors={Gradients.background} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <IconSymbol name="chevron.left" size={22} color="#fff" />
            </Pressable>
            <Text style={styles.headerTitle}>Paramètres</Text>
          </View>

          {blockedUsers.length === 0 ? (
            <Text style={styles.blockedStatus}>Tu n’as bloqué personne pour le moment.</Text>
          ) : null}
          <View style={styles.card}>
            <SettingsSection
              title="Notifications"
              icon="bell.fill"
              iconTint="#FF9D5C"
            >
              <ToggleCard
                icon="bell.fill"
                title="Notifications push"
                subtitle={
                  email
                    ? 'Recevoir les alertes de trajets'
                    : 'Connecte-toi pour activer'
                }
                value={pushEnabled}
                onChange={handlePushChange}
                disabled={!email}
              />
              <ToggleCard
                icon="clock"
                title="Rappels de trajet"
                subtitle="Notification 30 min avant le départ"
                value={remindersEnabled && pushEnabled}
                onChange={handleReminderChange}
                disabled={!email || !pushEnabled}
              />
              <ToggleCard
                icon="speaker.wave.2.fill"
                title="Sons"
                subtitle="Sons des notifications"
                value={soundEnabledLocal && pushEnabled}
                onChange={handleSoundChange}
                disabled={!email || !pushEnabled}
              />
            </SettingsSection>

            <SettingsSection
              title="Confidentialité et sécurité"
              icon="shield.fill"
              iconTint="#FF8B78"
            >
              <NavigationRow
                icon="lock.fill"
                title="Changer le mot de passe"
                onPress={openChangePassword}
              />
              <ToggleCard
                icon="eye.fill"
                title="Partage de localisation"
                subtitle="Pendant les trajets actifs"
                value={locationSharing}
                onChange={setLocationSharing}
              />
              <NavigationRow
                icon="shield.fill"
                title="Politique de confidentialité"
                onPress={openPrivacyPolicy}
              />
              <NavigationRow
                icon="slash.circle"
                iconColor={C.danger}
                title="Utilisateurs bloqués"
                value={
                  blockedUsers.length
                    ? `${blockedUsers.length} bloqué${blockedUsers.length > 1 ? 's' : ''}`
                    : undefined
                }
                onPress={handleOpenBlockedUsers}
              />
            </SettingsSection>

            <SettingsSection title="Apparence" icon="iphone" iconTint="#FF9D5C">
              <ToggleCard
                icon="moon.stars.fill"
                title="Mode sombre"
                subtitle="Bientôt disponible"
                value={false}
                onChange={() => null}
                disabled
              />
              <NavigationRow
                icon="globe"
                title="Langue"
                value="Français"
                onPress={openLanguageSelector}
              />
            </SettingsSection>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>À propos</Text>
              <StaticRow label="Version de l'application" value={aboutVersion} />
              <NavigationRow title="Conditions d'utilisation" onPress={openTerms} />
            </View>
          </View>
          <PrivacyPolicyModal visible={privacyVisible} onClose={closePrivacyPolicy} />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const SettingsSection = ({
  title,
  icon,
  iconTint,
  children,
}: {
  title: string;
  icon: Parameters<typeof IconSymbol>[0]['name'];
  iconTint?: string;
  children: ReactNode;
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <IconSymbol name={icon} size={20} color={iconTint ?? C.primary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const ToggleCard = ({
  icon,
  title,
  subtitle,
  value,
  onChange,
  disabled,
}: {
  icon: Parameters<typeof IconSymbol>[0]['name'];
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) => (
  <View style={styles.toggleCard}>
    <View style={styles.toggleContent}>
      <IconSymbol name={icon} size={20} color={C.gray600} />
      <View style={styles.toggleText}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ true: '#FFA774', false: '#D9DEE7' }}
      thumbColor={value ? '#fff' : '#f4f5f7'}
    />
  </View>
);

const NavigationRow = ({
  icon,
  iconColor,
  title,
  value,
  onPress,
}: {
  icon?: Parameters<typeof IconSymbol>[0]['name'];
  iconColor?: string;
  title: string;
  value?: string;
  onPress?: () => void;
}) => (
  <Pressable style={styles.navRow} onPress={onPress}>
    {icon ? (
      <IconSymbol name={icon} size={20} color={iconColor ?? C.gray600} />
    ) : (
      <View style={{ width: 20 }} />
    )}
    <Text style={styles.navTitle}>{title}</Text>
    {value ? <Text style={styles.navValue}>{value}</Text> : null}
    <IconSymbol name="chevron.right" size={18} color={C.gray400} />
  </Pressable>
);

const StaticRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.staticRow}>
    <Text style={styles.staticLabel}>{label}</Text>
    <Text style={styles.staticValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: Typography.heading.letterSpacing,
  },
  blockedStatus: {
    color: '#fff',
    fontSize: 13,
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.xl,
  },
  card: {
    marginTop: Spacing.xxl,
    backgroundColor: '#fff',
    borderRadius: 36,
    padding: Spacing.xl,
    gap: Spacing.xl,
    ...Shadows.card,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.gray700,
  },
  sectionBody: {
    gap: Spacing.md,
  },
  toggleCard: {
    backgroundColor: '#F5F6FB',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  toggleText: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
  },
  toggleSubtitle: {
    color: C.gray500,
    fontSize: 12,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  navTitle: {
    flex: 1,
    color: C.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  navValue: {
    color: C.gray500,
    fontWeight: '600',
    marginRight: Spacing.sm,
  },
  staticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  staticLabel: {
    color: C.gray600,
    fontSize: 14,
  },
  staticValue: {
    color: C.ink,
    fontWeight: '700',
  },
  blockedEmpty: {
    color: C.gray500,
    fontSize: 12,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECEFFD',
  },
  blockedEmail: {
    fontWeight: '600',
    color: C.gray700,
    flex: 1,
  },
  blockedAction: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs / 2,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: C.danger,
  },
  blockedActionText: {
    color: C.danger,
    fontWeight: '700',
    fontSize: 12,
  },
});

import { router } from 'expo-router';
import { ReactNode, useMemo, useState } from 'react';
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

const C = Colors;

const useSettingSwitch = (initial: boolean): [boolean, (value: boolean) => void] => {
  const [value, setValue] = useState(initial);
  const toggle = (next: boolean) => setValue(next);
  return [value, toggle];
};

export default function SettingsScreen() {
  const [pushEnabled, setPushEnabled] = useSettingSwitch(true);
  const [soundEnabled, setSoundEnabled] = useSettingSwitch(true);
  const [locationSharing, setLocationSharing] = useSettingSwitch(true);

  const aboutVersion = useMemo(() => '1.0.0', []);

  const openChangePassword = () =>
    Alert.alert('Changer le mot de passe', 'Fonctionnalité disponible très bientôt.');

  const openPrivacyPolicy = () =>
    Alert.alert('Politique de confidentialité', 'Retrouve toutes les infos très bientôt.');

  const openLanguageSelector = () =>
    Alert.alert('Langue', 'Les autres langues arrivent prochainement.');

  const openTerms = () =>
    Alert.alert('Conditions d’utilisation', 'Document disponible prochainement.');

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

          <View style={styles.card}>
            <SettingsSection
              title="Notifications"
              icon="bell.fill"
              iconTint="#FF9D5C"
            >
              <ToggleCard
                icon="bell.fill"
                title="Notifications push"
                subtitle="Recevoir les alertes de trajets"
                value={pushEnabled}
                onChange={setPushEnabled}
              />
              <ToggleCard
                icon="speaker.wave.2.fill"
                title="Sons"
                subtitle="Sons des notifications"
                value={soundEnabled}
                onChange={setSoundEnabled}
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
  title,
  value,
  onPress,
}: {
  icon?: Parameters<typeof IconSymbol>[0]['name'];
  title: string;
  value?: string;
  onPress?: () => void;
}) => (
  <Pressable style={styles.navRow} onPress={onPress}>
    {icon ? (
      <IconSymbol name={icon} size={20} color={C.gray600} />
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
  card: {
    marginTop: Spacing.xl,
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
});

import { router } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';

const C = Colors;

export default function SettingsScreen() {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);

  return (
    <GradientBackground colors={Gradients.background} style={styles.gradient}>
      <AppBackground style={styles.screen}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}>
              <IconSymbol name="chevron.left" size={20} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.title}>Paramètres</Text>
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.section}>
              <SectionHeader icon="bell.fill" color="#FF8F5C" label="Notifications" />
              <View style={styles.sectionCard}>
                <SettingToggleCard
                  icon="bell"
                  title="Notifications push"
                  subtitle="Recevoir les alertes de trajets"
                  value={pushEnabled}
                  onValueChange={setPushEnabled}
                />
                <SettingToggleCard
                  icon="speaker.wave.2.fill"
                  title="Sons"
                  subtitle="Sons des notifications"
                  value={soundEnabled}
                  onValueChange={setSoundEnabled}
                />
              </View>
            </View>

            <View style={styles.section}>
              <SectionHeader icon="lock.fill" color="#FC935C" label="Confidentialité et sécurité" />
              <View style={styles.sectionCard}>
                <SettingLinkCard
                  icon="key.fill"
                  title="Changer le mot de passe"
                  onPress={() => router.push('/sign-in')}
                />
                <SettingToggleCard
                  icon="eye.fill"
                  title="Partage de localisation"
                  subtitle="Pendant les trajets actifs"
                  value={locationEnabled}
                  onValueChange={setLocationEnabled}
                />
                <SettingLinkCard
                  icon="shield.lefthalf.fill"
                  title="Politique de confidentialité"
                  onPress={() => router.push('/help')}
                />
              </View>
            </View>

            <View style={styles.section}>
              <SectionHeader icon="iphone.rear.camera" color="#FD8C43" label="Apparence" />
              <View style={styles.sectionCard}>
                <SettingToggleCard
                  icon="moon.fill"
                  title="Mode sombre"
                  subtitle="Bientôt disponible"
                  value={false}
                  disabled
                  onValueChange={() => undefined}
                />
                <SettingLinkCard
                  icon="globe"
                  title="Langue"
                  value="Français"
                  onPress={() => undefined}
                />
              </View>
            </View>

            <View style={styles.section}>
              <SectionHeader icon="info.circle.fill" color="#FD8C43" label="À propos" />
              <View style={styles.sectionCard}>
                <SettingStaticRow label="Version de l'application" value="1.0.0" />
                <SettingLinkCard
                  icon="doc.text"
                  title="Conditions d'utilisation"
                  onPress={() => router.push('/help')}
                />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </AppBackground>
    </GradientBackground>
  );
}

const SectionHeader = ({ icon, color, label }: { icon: string; color: string; label: string }) => (
  <View style={styles.sectionHeader}>
    <IconSymbol name={icon} size={18} color={color} />
    <Text style={styles.sectionLabel}>{label}</Text>
  </View>
);

const SettingToggleCard = ({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
}: {
  icon: string;
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
}) => (
  <View style={[styles.settingCard, disabled && styles.settingCardDisabled]}>
    <View style={styles.settingIconWrapper}>
      <IconSymbol name={icon} size={18} color="#4A5667" />
    </View>
    <View style={styles.settingTexts}>
      <Text style={styles.settingTitle}>{title}</Text>
      <Text style={styles.settingSubtitle}>{subtitle}</Text>
    </View>
    <Switch
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      trackColor={{ false: 'rgba(15,22,40,0.12)', true: '#FFD7C1' }}
      thumbColor={value ? C.primary : '#FFFFFF'}
    />
  </View>
);

const SettingLinkCard = ({
  icon,
  title,
  value,
  onPress,
}: {
  icon: string;
  title: string;
  value?: string;
  onPress?: () => void;
}) => (
  <Pressable style={styles.linkRow} onPress={onPress} accessibilityRole="button">
    <View style={styles.settingIconWrapper}>
      <IconSymbol name={icon} size={18} color="#4A5667" />
    </View>
    <View style={styles.linkTexts}>
      <Text style={styles.settingTitle}>{title}</Text>
      {value ? <Text style={styles.linkValue}>{value}</Text> : null}
    </View>
    <IconSymbol name="chevron.right" size={16} color="rgba(15,25,40,0.3)" />
  </Pressable>
);

const SettingStaticRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.staticRow}>
    <Text style={styles.staticLabel}>{label}</Text>
    <Text style={styles.staticValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  screen: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.sm,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xl,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  sectionLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
    shadowColor: '#0B2545',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 2,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(252, 245, 255, 0.6)',
  },
  settingCardDisabled: { opacity: 0.6 },
  settingIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F2F4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTexts: { flex: 1 },
  settingTitle: { fontWeight: '700', color: C.ink },
  settingSubtitle: { color: C.gray600, fontSize: 12, marginTop: 2 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(250,250,255,0.9)',
  },
  linkTexts: { flex: 1 },
  linkValue: { color: C.primaryDark, fontWeight: '700', marginTop: 2 },
  staticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(250,250,255,0.9)',
    borderRadius: Radius.md,
  },
  staticLabel: { color: C.gray600, fontWeight: '600' },
  staticValue: { color: C.ink, fontWeight: '700' },
});

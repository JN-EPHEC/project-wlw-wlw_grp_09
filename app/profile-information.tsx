import { useRouter } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { HeaderBackButton } from '@/components/ui/header-back-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Spacing, Shadows } from '@/app/ui/theme';
import { useAuthSession } from '@/hooks/use-auth-session';

const getRoleLabel = (session: ReturnType<typeof useAuthSession>) => {
  if (!session) return 'Profil inconnu';
  if (session.isDriver && session.isPassenger) return 'Conducteur & passager';
  if (session.isDriver) return 'Conducteur';
  if (session.isPassenger) return 'Passager';
  return 'Profil inactif';
};

export default function ProfileInformationScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const campusLabel = session.address?.trim() ?? 'Campus non renseigné';
  const emailLabel = session.email ?? 'E-mail indisponible';
  const roleLabel = getRoleLabel(session);
  const [firstName, lastName] = (session.name ?? '')
    .trim()
    .split(/\s+/)
    .concat(['', ''])
    .slice(0, 2);

  const infoRows = [
    { label: 'Nom', value: lastName || '—' },
    { label: 'Prénom', value: firstName || '—' },
    { label: 'Campus', value: campusLabel },
    { label: 'E-mail', value: emailLabel },
    { label: 'Rôle', value: roleLabel },
  ];

  const backgroundColors = session.isDriver ? Gradients.driver : Gradients.twilight;

  return (
    <AppBackground colors={backgroundColors}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <HeaderBackButton onPress={() => router.back()} />
          <View>
            <Text style={styles.title}>Mes informations</Text>
            <Text style={styles.subtitle}>Les données liées à ton profil CampusRide</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <IconSymbol name="person.fill" size={32} color={Colors.primary} style={styles.cardIcon} />
              <Text style={styles.cardTitle}>Informations principales</Text>
            </View>
            {infoRows.map((row) => (
              <View key={row.label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderBottomLeftRadius: Radius['2xl'],
    borderBottomRightRadius: Radius['2xl'],
    backgroundColor: 'transparent',
    ...Shadows.card,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 13,
    marginTop: Spacing.xs / 2,
  },
  content: {
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.lg,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 30,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardIcon: {
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  infoRow: {
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.gray100,
    paddingTop: Spacing.md,
  },
  infoLabel: {
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gray500,
    letterSpacing: 0.4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
    marginTop: Spacing.xs,
  },
});

import { useRouter } from 'expo-router';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Radius, Spacing, Shadows } from '@/app/ui/theme';
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

  return (
    <AppBackground colors={['#F3E8FF', '#F9F4FF']}>
      <SafeAreaView style={styles.safe}>
        <LinearGradient colors={['#8E6CFF', '#F16BFF']} style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <IconSymbol name="chevron.left" size={24} color="#fff" />
          </Pressable>
          <View>
            <Text style={styles.title}>Mes informations</Text>
            <Text style={styles.subtitle}>Les données liées à ton profil CampusRide</Text>
          </View>
        </LinearGradient>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <LinearGradient colors={['#FFA15A', '#FF6C29']} style={styles.iconCircle}>
                <Image
                  source={require('@/assets/images/Personne.png')}
                  style={styles.iconImage}
                />
              </LinearGradient>
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
    ...Shadows.card,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink,
  },
  subtitle: {
    color: Colors.gray600,
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
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImage: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
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

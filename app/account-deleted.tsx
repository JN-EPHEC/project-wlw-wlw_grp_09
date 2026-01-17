import { useRouter } from 'expo-router';
import { Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { Colors, Gradients, Radius, Spacing, Typography } from '@/app/ui/theme';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';

export default function AccountDeletedScreen() {
  const router = useRouter();
  const carIllustration = require('@/assets/images/Bienvenue.png');
  const handleReconnect = () => {
    router.replace('/sign-in');
  };

  return (
    <GradientBackground colors={Gradients.twilight} style={styles.background}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.card}>
          <Text style={styles.title}>Compte supprimé</Text>
          <Text style={styles.subtitle}>À bientôt.</Text>
          <Image source={carIllustration} style={styles.image} resizeMode="contain" />
          <Text style={styles.description}>
            Ton compte a bien été supprimé. Merci d’avoir utilisé CampusRide.
          </Text>
          <GradientButton
            title="Me reconnecter"
            onPress={handleReconnect}
            fullWidth
            variant="cta"
            style={styles.button}
          />
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  card: {
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: 32,
    fontWeight: Typography.heading.fontWeight,
    color: Colors.ink,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: Typography.heading.fontWeight,
    color: Colors.secondary,
    marginTop: Spacing.xs,
  },
  image: {
    width: 220,
    height: 220,
    marginVertical: Spacing.md,
  },
  description: {
    fontSize: 16,
    color: Colors.gray600,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    marginTop: Spacing.md,
  },
});

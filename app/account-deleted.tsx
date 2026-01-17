import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { Colors, Gradients, Radius, Spacing, Typography } from '@/app/ui/theme';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';

const BACKGROUND_MODES: Record<'driver' | 'passenger', keyof typeof Gradients> = {
  driver: 'driver',
  passenger: 'twilight',
};

export default function AccountDeletedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const mode = params.mode === 'driver' ? 'driver' : 'passenger';
  const backgroundColors = Gradients[BACKGROUND_MODES[mode]];

  const goHome = () => {
    router.replace('/welcome');
  };

  return (
    <GradientBackground colors={backgroundColors} style={styles.background}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <IconSymbol name="checkmark.seal.fill" size={72} color={Colors.white} />
          <Text style={styles.title}>Compte supprimé</Text>
          <Text style={styles.description}>
            Ton compte a bien été supprimé. Tu peux créer un nouveau compte ou te reconnecter.
          </Text>
          <GradientButton
            title="Retour à l’accueil"
            onPress={goHome}
            fullWidth
            variant="cta"
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
  content: {
    flex: 1,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  title: {
    color: Colors.white,
    fontSize: 28,
    fontWeight: Typography.heading.fontWeight,
  },
  description: {
    color: Colors.white,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
});

import { router } from 'expo-router';
import { Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { Colors, Gradients, Radius, Spacing, Typography } from '@/app/ui/theme';

export default function WelcomeScreen() {
  const goToSignUp = () => router.push('/sign-up');
  const goToSignIn = () => router.push('/sign-in');
  const carIllustration = require('@/assets/images/Bienvenue.png');
  const logo = require('@/assets/images/logo.png');

  return (
    <AppBackground colors={Gradients.twilight}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Facilitez vos trajets vers le campus</Text>
          <Text style={styles.subtitle}>
            CampusRide connecte les étudiants conducteurs et passagers en quelques minutes.
          </Text>
          <View style={styles.illustration}>
            <Image source={carIllustration} style={styles.heroImage} resizeMode="contain" />
          </View>
          <View style={styles.actions}>
            <GradientButton
              title="S’inscrire"
              variant="cta"
              onPress={goToSignUp}
              fullWidth
              accessibilityRole="button"
              textStyle={styles.primaryText}
            />
            <Pressable onPress={goToSignIn} style={styles.secondaryButton} accessibilityRole="button">
              <Text style={styles.secondaryLabel}>Se connecter</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: Typography.heading.fontWeight,
    letterSpacing: Typography.heading.letterSpacing,
    color: Colors.white,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: Spacing.sm,
  },
  illustration: {
    width: '100%',
    alignItems: 'center',
  },
  heroImage: {
    width: '90%',
    maxWidth: 320,
    height: undefined,
    aspectRatio: 1,
  },
  actions: {
    width: '100%',
    gap: Spacing.md,
  },
  primaryText: {
    color: Colors.white,
    fontWeight: '800',
  },
  secondaryButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.secondary,
  },
  secondaryLabel: {
    color: Colors.secondary,
    fontWeight: '800',
    fontSize: 16,
  },
});

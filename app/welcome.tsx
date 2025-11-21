import { router } from 'expo-router';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Spacing, Typography } from '@/app/ui/theme';

export default function WelcomeScreen() {
  const goToSignUp = () => router.push('/sign-up');
  const goToSignIn = () => router.push('/sign-in');

  return (
    <AppBackground colors={Gradients.twilight}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.badge}>
            <IconSymbol name="graduationcap.fill" size={26} color={Colors.secondary} />
            <IconSymbol name="mappin.and.ellipse" size={20} color={Colors.primary} />
          </View>
          <Text style={styles.title}>Facilitez vos trajets vers le campus</Text>
          <Text style={styles.subtitle}>
            CampusRide connecte les étudiants conducteurs et passagers en quelques minutes.
          </Text>
          <View style={styles.illustration}>
            <View style={styles.illustrationCar}>
              <IconSymbol name="person.fill" size={26} color={Colors.white} />
              <IconSymbol name="car.fill" size={40} color={Colors.white} />
              <IconSymbol name="person.fill" size={26} color={Colors.white} />
            </View>
            <View style={styles.illustrationDots}>
              <View style={styles.dot} />
              <View style={[styles.dot, styles.dotMedium]} />
              <View style={[styles.dot, styles.dotSmall]} />
            </View>
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
  },
  content: {
    flex: 1,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  illustration: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
  },
  illustrationCar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  illustrationDots: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotMedium: {
    width: 16,
    height: 16,
  },
  dotSmall: {
    width: 8,
    height: 8,
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

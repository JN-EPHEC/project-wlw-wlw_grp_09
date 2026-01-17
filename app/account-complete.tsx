import { router } from 'expo-router';
import { Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';
import { GradientButton } from '@/components/ui/gradient-button';
import { useAuthSession } from '@/hooks/use-auth-session';

export default function AccountCompleteScreen() {
  const session = useAuthSession();
  const backgroundColors = session.isDriver ? Gradients.driver : Gradients.twilight;

  return (
    <AppBackground colors={backgroundColors}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.card}>
          <View style={styles.heroTexts}>
            <Text style={styles.title}>Profil modifié</Text>
            <Text style={styles.subtitle}>Ton profil CampusRide est prêt. Bienvenue à bord !</Text>
          </View>
          <Image source={require('@/assets/images/Bienvenue.png')} style={styles.image} resizeMode="contain" />
          <GradientButton
            title="Terminer"
            onPress={() => router.replace('/(tabs)/profile')}
            fullWidth
            style={styles.button}
            textStyle={styles.buttonText}
          />
        </View>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 32,
    backgroundColor: '#fff',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.lg,
  },
  heroTexts: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  button: {
    alignSelf: 'stretch',
    marginTop: Spacing.sm,
    borderRadius: Radius.pill,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: Colors.gray700,
    lineHeight: 22,
  },
  image: {
    width: '100%',
    height: 240,
  },
  buttonText: {
    fontWeight: '800',
  },
});

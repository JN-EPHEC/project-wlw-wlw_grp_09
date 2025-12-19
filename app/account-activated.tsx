import { router } from 'expo-router';
import { Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';

export default function AccountActivatedScreen() {
  return (
    <AppBackground colors={Gradients.twilight}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.card}>
          <Image source={require('@/assets/images/Bienvenue.png')} style={styles.image} resizeMode="contain" />
          <Text style={styles.subtitleTop}>Bienvenue à bord !</Text>
          <Text style={styles.title}>Compte activé</Text>
          <Text style={styles.subtitle}>
            Ton e-mail est confirmé. Il ne te reste plus qu’à compléter ton profil pour rejoindre la communauté CampusRide.
          </Text>
          <Pressable
            style={styles.button}
            onPress={() => router.replace('/complete-profile')}
          >
            <Text style={styles.buttonLabel}>Compléter mon profil</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xxl * 3.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    maxWidth: 320,
    backgroundColor: '#fff',
    borderRadius: 44,
    paddingHorizontal: Spacing.xxl * 1.5,
    paddingVertical: Spacing.xxl * 1.5,
    alignItems: 'center',
    gap: Spacing.lg,
    alignSelf: 'center',
    marginHorizontal: Spacing.lg,
  },
  image: {
    width: '100%',
    height: 260,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.ink,
    textAlign: 'center',
  },
  subtitleTop: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: Colors.gray600,
    lineHeight: 20,
  },
  button: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.pill,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '800',
  },
});

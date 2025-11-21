import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import * as Auth from '@/app/services/auth';
import { Colors, Gradients } from '@/app/ui/theme';
import { isStudentEmail, sanitizeEmail } from '@/app/validators';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { useAuthSession } from '@/hooks/use-auth-session';

export default function SignInScreen() {
  const session = useAuthSession();
  const [emailRaw, setEmailRaw] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const email = useMemo(() => sanitizeEmail(emailRaw), [emailRaw]);

  if (session.email && session.verified) {
    return <Redirect href="/" />;
  }

  const onSubmit = async () => {
    if (!email || !isStudentEmail(email)) {
      return Alert.alert('Adresse invalide', 'Utilise ton e-mail universitaire pour te connecter.');
    }
    if (!password.trim()) {
      return Alert.alert('Mot de passe manquant', 'Entre ton mot de passe pour poursuivre.');
    }
    try {
      setLoading(true);
      const snapshot = await Auth.authenticate(email, password);
      if (!snapshot.verified) {
        router.replace({ pathname: '/verify-email', params: { email } } as any);
        return;
      }
      router.replace('/');
    } catch (err: any) {
      switch (err?.code) {
        case 'USER_NOT_FOUND':
          Alert.alert(
            'Compte introuvable',
            'Aucun compte ne correspond à cet e-mail. Vérifie l’adresse ou inscris-toi.'
          );
          break;
        case 'INVALID_CREDENTIALS':
          Alert.alert('Connexion refusée', 'Le mot de passe est incorrect. Réessaie.');
          break;
        default:
          Alert.alert(
            'Erreur',
            'Impossible de te connecter pour le moment. Vérifie ta connexion et réessaie.'
          );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppBackground style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <GradientBackground colors={Gradients.card} style={styles.card}>
            <Text style={styles.title}>Connexion</Text>
            <Text style={styles.subtitle}>
              Reprends ta place dans la communauté CampusRide en te connectant à ton compte.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>E-mail universitaire</Text>
              <TextInput
                placeholder="HE123456@students.ephec.be"
                value={emailRaw}
                onChangeText={setEmailRaw}
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                keyboardType="email-address"
                placeholderTextColor={Colors.gray500}
                style={styles.input}
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Mot de passe</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  placeholder="••••••••"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholderTextColor={Colors.gray500}
                  style={[styles.input, { paddingRight: 90 }]}
                  returnKeyType="done"
                />
                <Pressable
                  style={styles.toggle}
                  onPress={() => setShowPassword((prev) => !prev)}
                  accessibilityRole="button"
                >
                  <Text style={styles.toggleText}>{showPassword ? 'Masquer' : 'Afficher'}</Text>
                </Pressable>
              </View>
            </View>

            <GradientButton
              title="Se connecter"
              onPress={onSubmit}
              disabled={loading}
              accessibilityRole="button"
              fullWidth
            >
              {loading ? <ActivityIndicator color="#fff" /> : null}
            </GradientButton>

            <Pressable
              onPress={() => router.push('/sign-up')}
              style={styles.footerLink}
              accessibilityRole="button"
            >
              <Text style={styles.footerText}>Pas encore inscrit ? Créer un compte</Text>
            </Pressable>
          </GradientBackground>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  keyboard: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: 28,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 24,
    padding: 24,
    gap: 20,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.ink },
  subtitle: { color: Colors.gray600, fontSize: 14, lineHeight: 20 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.ink, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: Colors.gray100,
    color: Colors.ink,
  },
  passwordWrapper: { position: 'relative' },
  toggle: { position: 'absolute', right: 12, top: 12, paddingHorizontal: 4, paddingVertical: 8 },
  toggleText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  footerLink: { alignItems: 'center', marginTop: 4 },
  footerText: { color: Colors.primaryDark, fontWeight: '700' },
});

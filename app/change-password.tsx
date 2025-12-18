import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import * as Auth from '@/app/services/auth';
import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';
import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuthSession } from '@/hooks/use-auth-session';

const C = Colors;

export default function ChangePasswordScreen() {
  const session = useAuthSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const goBack = useCallback(() => {
    try {
      router.back();
    } catch {
      router.push('/settings');
    }
  }, []);

  const onSubmit = async () => {
    if (!session.email) {
      Alert.alert('Connexion requise', 'Connecte-toi pour modifier ton mot de passe.');
      router.push('/sign-in');
      return;
    }
    if (!currentPassword.trim()) {
      Alert.alert('Mot de passe actuel', 'Entre ton mot de passe actuel.');
      return;
    }
    if (!nextPassword.trim()) {
      Alert.alert('Nouveau mot de passe', 'Entre un nouveau mot de passe.');
      return;
    }
    if (nextPassword !== confirmPassword) {
      Alert.alert('Confirmation', 'Les nouveaux mots de passe ne correspondent pas.');
      return;
    }
    try {
      setSubmitting(true);
      await Auth.changePassword(currentPassword, nextPassword);
      Alert.alert('Mot de passe mis à jour', 'Tu peux utiliser ton nouveau mot de passe dès maintenant.');
      goBack();
    } catch (error: any) {
      const message =
        error?.message ??
        "Impossible de modifier ton mot de passe pour l'instant. Réessaie dans quelques instants.";
      Alert.alert('Erreur', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GradientBackground colors={Gradients.background} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.select({ ios: 'padding', android: undefined })}
        >
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Pressable style={styles.backButton} onPress={goBack}>
                <IconSymbol name="chevron.left" size={22} color={C.white} />
              </Pressable>
              <Text style={styles.headerTitle}>Modifier mon mot de passe</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.helperText}>
                Pour protéger ton compte, entre ton mot de passe actuel puis choisis un nouveau mot de passe
                fort (8 caractères minimum, une majuscule et un chiffre).
              </Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Mot de passe actuel</Text>
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={C.gray400}
                  style={styles.input}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Nouveau mot de passe</Text>
                <TextInput
                  value={nextPassword}
                  onChangeText={setNextPassword}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={C.gray400}
                  style={styles.input}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirmer le mot de passe</Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={C.gray400}
                  style={styles.input}
                  autoCapitalize="none"
                />
              </View>
              <Pressable
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={onSubmit}
                disabled={submitting}
              >
                <Text style={styles.submitText}>
                  {submitting ? 'Mise à jour en cours…' : 'Valider'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: C.white,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  helperText: {
    color: C.gray600,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: 13,
    textTransform: 'uppercase',
    color: C.gray500,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    fontSize: 16,
    color: C.ink,
    backgroundColor: C.white,
  },
  submitButton: {
    backgroundColor: C.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: C.white,
    fontWeight: '800',
    fontSize: 16,
  },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { isStrongPassword } from '@/app/validators';
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
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNextPwd, setShowNextPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [currentTouched, setCurrentTouched] = useState(false);
  const [nextTouched, setNextTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const errors = useMemo(() => {
    const map: Partial<Record<'current' | 'next' | 'confirm', string>> = {};
    if (!currentPassword.trim()) {
      map.current = 'Mot de passe actuel requis';
    }
    if (!nextPassword.trim()) {
      map.next = 'Nouveau mot de passe requis';
    } else if (!isStrongPassword(nextPassword)) {
      map.next = 'Min. 8 caractères, 1 majuscule et 1 chiffre.';
    }
    if (!confirmPassword.trim()) {
      map.confirm = 'Confirme ton nouveau mot de passe';
    } else if (confirmPassword !== nextPassword) {
      map.confirm = 'Les nouveaux mots de passe doivent être identiques';
    }
    return map;
  }, [confirmPassword, currentPassword, nextPassword]);

  const formValid = Object.keys(errors).length === 0;
  const showCurrentError = !!errors.current && (currentTouched || attemptedSubmit);
  const showNextError = !!errors.next && (nextTouched || attemptedSubmit);
  const showConfirmError = !!errors.confirm && (confirmTouched || attemptedSubmit);

  const goBack = useCallback(() => {
    try {
      router.back();
    } catch {
      router.push('/settings');
    }
  }, []);

  const onSubmit = async () => {
    setAttemptedSubmit(true);
    if (!session.email) {
      Alert.alert('Connexion requise', 'Connecte-toi pour modifier ton mot de passe.');
      router.push('/sign-in');
      return;
    }
    if (!formValid) {
      const firstError = errors.current ?? errors.next ?? errors.confirm;
      if (firstError) {
        Alert.alert('Formulaire incomplet', firstError);
      }
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
                fort.
              </Text>
              <View style={styles.criteriaList}>
                <Text style={styles.criteriaTitle}>Ton nouveau mot de passe doit contenir :</Text>
                <Text style={styles.criteriaItem}>• 8 caractères minimum</Text>
                <Text style={styles.criteriaItem}>• au moins 1 lettre majuscule</Text>
                <Text style={styles.criteriaItem}>• au moins 1 chiffre</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Mot de passe actuel</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    value={currentPassword}
                    onChangeText={(value) => {
                      setCurrentPassword(value);
                      if (!currentTouched) setCurrentTouched(true);
                    }}
                    secureTextEntry={!showCurrentPwd}
                    placeholder="••••••••"
                    placeholderTextColor={C.gray400}
                    style={[styles.input, showCurrentError && styles.inputError]}
                    autoCapitalize="none"
                  />
                  <Pressable style={styles.togglePwd} onPress={() => setShowCurrentPwd((prev) => !prev)}>
                    <Ionicons
                      name={showCurrentPwd ? 'eye-off' : 'eye'}
                      size={20}
                      color={C.primary}
                    />
                  </Pressable>
                </View>
                {showCurrentError ? <Text style={styles.errorText}>{errors.current}</Text> : null}
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Nouveau mot de passe</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    value={nextPassword}
                    onChangeText={(value) => {
                      setNextPassword(value);
                      if (!nextTouched) setNextTouched(true);
                    }}
                    secureTextEntry={!showNextPwd}
                    placeholder="••••••••"
                    placeholderTextColor={C.gray400}
                    style={[styles.input, showNextError && styles.inputError]}
                    autoCapitalize="none"
                  />
                  <Pressable style={styles.togglePwd} onPress={() => setShowNextPwd((prev) => !prev)}>
                    <Ionicons
                      name={showNextPwd ? 'eye-off' : 'eye'}
                      size={20}
                      color={C.primary}
                    />
                  </Pressable>
                </View>
                {showNextError ? <Text style={styles.errorText}>{errors.next}</Text> : null}
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirmer le mot de passe</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={(value) => {
                      setConfirmPassword(value);
                      if (!confirmTouched) setConfirmTouched(true);
                    }}
                    secureTextEntry={!showConfirmPwd}
                    placeholder="••••••••"
                    placeholderTextColor={C.gray400}
                    style={[styles.input, showConfirmError && styles.inputError]}
                    autoCapitalize="none"
                  />
                  <Pressable
                    style={styles.togglePwd}
                    onPress={() => setShowConfirmPwd((prev) => !prev)}
                  >
                    <Ionicons
                      name={showConfirmPwd ? 'eye-off' : 'eye'}
                      size={20}
                      color={C.primary}
                    />
                  </Pressable>
                </View>
                {showConfirmError ? <Text style={styles.errorText}>{errors.confirm}</Text> : null}
              </View>
              <Pressable
                style={[
                  styles.submitButton,
                  (submitting || !formValid) && styles.submitButtonDisabled,
                ]}
                onPress={onSubmit}
                disabled={submitting || !formValid}
              >
                <Text style={styles.submitText}>
                  {submitting ? 'Mise à jour en cours…' : 'Enregistrer'}
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
  inputError: {
    borderColor: C.danger,
  },
  passwordWrapper: {
    position: 'relative',
  },
  togglePwd: {
    position: 'absolute',
    right: Spacing.sm,
    top: Spacing.sm,
    padding: Spacing.xs,
  },
  errorText: {
    color: C.danger,
    fontSize: 12,
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
  criteriaList: {
    backgroundColor: 'rgba(129,129,155,0.08)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  criteriaTitle: {
    fontWeight: '700',
    color: C.gray600,
  },
  criteriaItem: {
    color: C.gray600,
    fontSize: 13,
  },
});

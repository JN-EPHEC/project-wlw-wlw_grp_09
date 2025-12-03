import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Auth from './services/auth';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { Colors, Gradients } from './ui/theme';

export default function VerifyEmail() {
  const { email } = useLocalSearchParams() as { email?: string };
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [status, setStatus] = useState<'pending' | 'checked' | 'verified'>('pending');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const codeInputRef = useRef<TextInput>(null);
  const CODE_LENGTH = 4;
  const RESEND_DELAY = 29;
  const [resendTimer, setResendTimer] = useState(RESEND_DELAY);

  const normalizedEmail = useMemo(() => (email ? String(email).trim().toLowerCase() : ''), [email]);

  useEffect(() => {
    if (!normalizedEmail) {
      Alert.alert(
        'E-mail manquant',
        'Nous ne trouvons pas ton adresse. Recommence le processus d’inscription.'
      );
      router.replace('/sign-up');
    }
  }, [normalizedEmail]);

  useEffect(() => {
    if (!__DEV__ || !normalizedEmail) return;
    setDevCode(Auth.getPendingVerificationCode(normalizedEmail));
  }, [normalizedEmail]);
  useEffect(() => {
    let mounted = true;
    const check = () => {
      if (!normalizedEmail) return;
      const v = Auth.isVerified(normalizedEmail);
      if (!mounted) return;
      setStatus(v ? 'verified' : 'pending');
    };
    check();
    const t = setInterval(check, 2000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [normalizedEmail]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  useEffect(() => {
    if (status !== 'verified') return;
    router.replace('/account-activated');
  }, [status]);

  const onSimulateConfirm = async () => {
    if (!normalizedEmail) return;
    if (code.length !== CODE_LENGTH) {
      setCodeError(`Entre le code à ${CODE_LENGTH} chiffres reçu par e-mail.`);
      return;
    }
    try {
      setLoading(true);
      await Auth.verifyEmail(normalizedEmail, code);
      setStatus('verified');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Compte activé', "Ton e-mail a été confirmé. Tu es maintenant connecté.");
    } catch (err: any) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err?.code === 'INVALID_CODE') {
        setCodeError('Code incorrect ou expiré. Vérifie ton e-mail.');
      } else {
        Alert.alert(
          'Erreur',
          err?.code === 'USER_NOT_FOUND'
            ? 'Impossible de confirmer ce compte. Vérifie ton adresse universitaire.'
            : 'Impossible de confirmer pour le moment. Réessaie dans un instant.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const onResendEmail = async () => {
    if (!normalizedEmail) return;
    try {
      void Haptics.selectionAsync();
      setResending(true);
      const result = await Auth.sendVerificationEmail(normalizedEmail);
      if (__DEV__) setDevCode(result.code);
      setCode('');
      setCodeError(null);
      setResendTimer(RESEND_DELAY);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'E-mail renvoyé',
        `Un nouveau message vient d’être envoyé vers ${normalizedEmail}. Vérifie ton dossier spam.`
      );
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Envoi impossible',
        'Nous ne parvenons pas à renvoyer l’e-mail. Vérifie ta connexion et réessaie.'
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <AppBackground style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <GradientBackground colors={Gradients.card} style={styles.container}>
          <Text style={styles.h1}>Vérifie ton e-mail</Text>
          <Text style={styles.text}>Nous avons envoyé un code de sécurité à</Text>
          <Text style={styles.email}>{normalizedEmail || '—'}</Text>
          <Text style={styles.text}>Entre les 4 chiffres reçus (@students.ephec.be).</Text>

          <Pressable
            style={styles.codeBoxes}
            onPress={() => codeInputRef.current?.focus()}
            accessibilityRole="button"
          >
            {Array.from({ length: CODE_LENGTH }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.codeBox,
                  code[index] && styles.codeBoxFilled,
                  codeError && styles.codeBoxError,
                ]}
              >
                <Text style={styles.codeDigit}>{code[index] ?? ''}</Text>
              </View>
            ))}
            <TextInput
              ref={codeInputRef}
              value={code}
              onChangeText={(value) => {
                const sanitized = value.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
                setCode(sanitized);
                if (codeError && sanitized.length === CODE_LENGTH) setCodeError(null);
              }}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={CODE_LENGTH}
              style={styles.codeHiddenInput}
              autoFocus
            />
          </Pressable>
          {codeError ? <Text style={styles.error}>{codeError}</Text> : null}
          {__DEV__ && devCode ? <Text style={styles.devHint}>Code DEV : {devCode}</Text> : null}

          {status === 'verified' ? (
            <View style={styles.feedbackBox}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.feedbackText}>Compte confirmé, redirection…</Text>
            </View>
          ) : (
            <>
              <GradientButton
                title="Confirmer le code"
                onPress={onSimulateConfirm}
                disabled={loading}
                style={styles.cta}
                accessibilityRole="button"
              >
                {loading ? <ActivityIndicator color="#fff" /> : null}
              </GradientButton>
              <PressableSecondary
                onPress={onResendEmail}
                disabled={resending || resendTimer > 0}
                loading={resending}
                label={
                  resendTimer > 0
                    ? `Renvoyer dans ${resendTimer}s`
                    : 'Renvoyer le code'
                }
              />
            </>
          )}

          <Text style={styles.note}>
            Besoin d’aide ? Contacte privacy@campusride.app avec ton identifiant HE.
          </Text>
        </GradientBackground>
      </SafeAreaView>
    </AppBackground>
  );
}

const PressableSecondary = ({
  onPress,
  disabled,
  label,
  loading,
}: {
  onPress: () => void;
  disabled?: boolean;
  label: string;
  loading?: boolean;
}) => (
  <Pressable
    onPress={disabled ? undefined : onPress}
    style={[
      styles.secondaryButton,
      disabled && styles.secondaryButtonDisabled,
    ]}
    accessibilityRole="button"
    accessibilityState={{ disabled: !!disabled }}
  >
    {loading ? (
      <ActivityIndicator color={Colors.primaryDark} />
    ) : (
      <Text style={styles.secondaryLabel}>{label}</Text>
    )}
  </Pressable>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  safeArea: {
    flex: 1,
    paddingVertical: 24,
    paddingHorizontal: 72,
    justifyContent: 'center',
  },
  container: {
    borderRadius: 24,
    padding: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch',
    marginHorizontal: 16,
  },
  h1: { fontSize: 24, fontWeight: '800', color: Colors.ink },
  text: { color: Colors.gray700, marginBottom: 4, textAlign: 'center' },
  email: { color: Colors.ink, fontWeight: '700', marginBottom: 12 },
  cta: { marginTop: 8, alignSelf: 'stretch' },
  feedbackBox: {
    marginTop: 16,
    alignItems: 'center',
    gap: 8,
  },
  feedbackText: { color: Colors.gray600, fontSize: 13 },
  note: { color: 'rgba(16,32,48,0.65)', marginTop: 12, fontSize: 12, textAlign: 'center' },
  secondaryButton: {
    marginTop: 8,
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,131,71,0.55)',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  secondaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryLabel: {
    color: Colors.primaryDark,
    fontWeight: '700',
    fontSize: 14,
  },
  codeBoxes: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    marginTop: 12,
  },
  codeBox: {
    width: 52,
    height: 60,
    borderRadius: 10,
    borderWidth: 1.25,
    borderColor: 'rgba(15,25,40,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  codeBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(255,131,71,0.2)',
  },
  codeBoxError: {
    borderColor: Colors.danger,
  },
  codeDigit: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.ink,
  },
  codeHiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  error: { color: Colors.danger, marginTop: 6 },
  devHint: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.gray500,
  },
});

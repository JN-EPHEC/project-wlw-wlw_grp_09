import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import * as Auth from '@/app/services/auth';
import { Colors, Gradients, Radius, Spacing, Typography } from '@/app/ui/theme';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuthSession } from '@/hooks/use-auth-session';

export default function ConfirmDeleteAccountScreen() {
  const session = useAuthSession();
  const [optInText, setOptInText] = useState('');
  const [optInChecked, setOptInChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauthNeeded, setReauthNeeded] = useState(false);
  const canSubmit =
    optInChecked && optInText.trim().toUpperCase() === 'SUPPRIMER' && !!session.email;
  const mode = session.roleMode ?? 'passenger';
  const gradient = Gradients[mode === 'driver' ? 'driver' : 'twilight'];

  const handleCancel = useCallback(() => {
    router.back();
  }, []);

  const handleReauth = useCallback(async () => {
    setLoading(true);
    try {
      await Auth.signOut();
    } finally {
      router.replace('/sign-in');
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || loading || !session.email) return;
    setLoading(true);
    setError(null);
    try {
      await Auth.deleteCurrentAccount();
      router.replace({
        pathname: '/account-deleted',
        params: { mode },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Impossible de supprimer ton compte pour le moment.';
      setError(message);
      if (err instanceof Error && err.message.includes('Reconnecte-toi')) {
        setReauthNeeded(true);
      }
    } finally {
      setLoading(false);
    }
  }, [canSubmit, loading, mode, session.email]);

  const introText = useMemo(
    () =>
      session.email
        ? `Tu es connecté(e) en tant que ${session.email}.`
        : 'Connecte-toi pour supprimer ton compte.',
    [session.email]
  );

  return (
    <GradientBackground colors={gradient} style={styles.background}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <IconSymbol name="trash.fill" size={32} color="#fff" />
            <Text style={styles.title}>Supprimer le compte ?</Text>
          </View>
          <Text style={styles.subtitle}>
            Cette action est irréversible. Toutes tes données seront supprimées.
          </Text>
          <Text style={styles.intro}>{introText}</Text>
          <View style={styles.inputRow}>
            <Pressable
              style={[styles.checkbox, optInChecked ? styles.checkboxActive : null]}
              onPress={() => setOptInChecked((prev) => !prev)}
            >
              {optInChecked ? (
                <IconSymbol name="checkmark" size={16} color="#fff" />
              ) : null}
            </Pressable>
            <Text style={styles.checkboxLabel}>Je comprends que cette action est irréversible.</Text>
          </View>
          <TextInput
            style={styles.confirmInput}
            value={optInText}
            onChangeText={setOptInText}
            autoCapitalize="characters"
            placeholder="Tape SUPPRIMER pour confirmer"
            placeholderTextColor="rgba(0,0,0,0.3)"
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {reauthNeeded ? (
            <Pressable style={styles.reauthRow} onPress={handleReauth}>
              <IconSymbol name="lock.fill" size={16} color={Colors.primary} />
              <Text style={styles.reauthLabel}>Se reconnecter</Text>
            </Pressable>
          ) : null}
          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={handleCancel} disabled={loading}>
              <Text style={styles.cancelLabel}>Annuler</Text>
            </Pressable>
            <GradientButton
              title={loading ? 'Suppression en cours…' : 'Supprimer définitivement'}
              onPress={handleSubmit}
              disabled={!canSubmit || loading}
              fullWidth
              variant="danger"
            />
          </View>
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
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
  },
  card: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    gap: Spacing.md,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: Typography.heading.fontWeight,
  },
  subtitle: {
    color: Colors.gray600,
    lineHeight: 20,
  },
  intro: {
    fontSize: 14,
    color: Colors.gray700,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.gray400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxLabel: {
    flex: 1,
    color: Colors.gray800,
  },
  confirmInput: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: 14,
    letterSpacing: 1.5,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  reauthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  reauthLabel: {
    color: Colors.primary,
    fontWeight: '700',
  },
  actions: {
    gap: Spacing.sm,
  },
  cancelButton: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  cancelLabel: {
    color: Colors.gray600,
    fontWeight: '700',
  },
});

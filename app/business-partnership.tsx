import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';

const C = Colors;

export default function BusinessPartnershipScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { width } = useWindowDimensions();
  const isWide = width >= 860;

  const goBack = () => {
    try {
      router.back();
    } catch {
      router.replace('/(tabs)/profile');
    }
  };

  const onSubmit = () => {
    const nextErrors: Record<string, string> = {};
    if (!firstName.trim()) nextErrors.firstName = 'Ajoute ton prénom.';
    if (!lastName.trim()) nextErrors.lastName = 'Ajoute ton nom.';
    if (!company.trim()) nextErrors.company = 'Ajoute ta société.';
    if (!email.trim() || !email.includes('@')) nextErrors.email = 'Ajoute un e-mail valide.';
    if (!message.trim()) nextErrors.message = 'Décris ton besoin.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      Alert.alert('Formulaire incomplet', 'Merci de compléter les champs requis.');
      return;
    }
    setSubmitting(true);
    const subject = encodeURIComponent('Demande partenariat CampusRide');
    const body = encodeURIComponent(
      `Prénom : ${firstName}\nNom : ${lastName}\nSociété : ${company}\nE-mail : ${email}\n\n${message}\n\nBusiness model : CampusRide prélève 20% sur chaque trajet et propose des formats publicitaires intégrés. Je souhaite en savoir plus.`
    );
    const mailto = `mailto:business@campusride.app?subject=${subject}&body=${body}`;
    Linking.openURL(mailto).catch(() =>
      Alert.alert(
        'Envoi impossible',
        'Nous n’avons pas pu ouvrir ton application mail. Écris-nous directement sur business@campusride.app.'
      )
    );
    setSubmitting(false);
  };

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={goBack}
            style={styles.backButton}
            accessibilityRole="button"
            hitSlop={12}
          >
            <IconSymbol name="chevron.left.circle.fill" size={32} color={C.primary} />
            <Text style={styles.backLabel}>Retour</Text>
          </Pressable>
          <View style={[styles.blocksContainer, isWide && styles.blocksContainerWide]}>
            <View style={[styles.highlightCard, isWide && styles.highlightCardWide]}>
              <Text style={styles.highlightTitle}>Pourquoi CampusRide ?</Text>
              <View style={[styles.highlightSplit, isWide && styles.highlightSplitWide]}>
                <View style={styles.highlightColumn}>
                  <View style={styles.highlightPill}>
                    <Text style={styles.highlightPillTitle}>Audience étudiante</Text>
                    <Text style={styles.highlightPillText}>+15k étudiants actifs</Text>
                  </View>
                  <View style={styles.highlightPill}>
                    <Text style={styles.highlightPillTitle}>Formats premium</Text>
                    <Text style={styles.highlightPillText}>Cartes sponsorisées</Text>
                  </View>
                </View>
                <View style={styles.highlightColumn}>
                  <View style={styles.highlightPill}>
                    <Text style={styles.highlightPillTitle}>Engagement quotidien</Text>
                    <Text style={styles.highlightPillText}>Trajets & push ciblés</Text>
                  </View>
                  <View style={styles.highlightPill}>
                    <Text style={styles.highlightPillTitle}>100% campus</Text>
                    <Text style={styles.highlightPillText}>EPHEC Bruxelles</Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={[styles.formCard, isWide && styles.formCardWide]}>
              <Text style={styles.formIntro}>
                Laisse-nous tes coordonnées et notre équipe pub te recontacte pour en parler.
              </Text>
            <Text style={styles.formLabel}>Prénom</Text>
            <TextInput
              style={[styles.input, errors.firstName && styles.inputError]}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Prénom"
              placeholderTextColor={C.gray400}
            />
            {errors.firstName ? <Text style={styles.errorText}>{errors.firstName}</Text> : null}
            <Text style={styles.formLabel}>Nom</Text>
            <TextInput
              style={[styles.input, errors.lastName && styles.inputError]}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Nom"
              placeholderTextColor={C.gray400}
            />
            {errors.lastName ? <Text style={styles.errorText}>{errors.lastName}</Text> : null}
            <Text style={styles.formLabel}>Votre entreprise</Text>
            <TextInput
              style={[styles.input, errors.company && styles.inputError]}
              value={company}
              onChangeText={setCompany}
              placeholder="Nom de la société"
              placeholderTextColor={C.gray400}
            />
            {errors.company ? <Text style={styles.errorText}>{errors.company}</Text> : null}
            <Text style={styles.formLabel}>E-mail professionnel</Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              value={email}
              onChangeText={setEmail}
              placeholder="contact@entreprise.com"
              placeholderTextColor={C.gray400}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
            <Text style={styles.formLabel}>Message</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline, errors.message && styles.inputError]}
              value={message}
              onChangeText={setMessage}
              placeholder="Parlez-nous de votre projet publicitaire ou de vos besoins."
              placeholderTextColor={C.gray400}
              multiline
              numberOfLines={5}
            />
            {errors.message ? <Text style={styles.errorText}>{errors.message}</Text> : null}
              <Pressable
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={onSubmit}
                disabled={submitting}
                accessibilityRole="button"
              >
                <Text style={styles.submitText}>{submitting ? 'Envoi…' : 'Prendre rendez-vous'}</Text>
              </Pressable>
              <Text style={styles.footerText}>
                Ou écrivez-nous directement : business@campusride.app
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: Spacing.lg,
  },
  scroll: {
    gap: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  backLabel: { color: C.primary, fontWeight: '700', fontSize: 16 },
  blocksContainer: {
    gap: Spacing.lg,
  },
  blocksContainerWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  highlightCard: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 28,
    padding: Spacing.lg,
  },
  highlightTitle: { fontSize: 20, fontWeight: '800', color: C.ink, marginBottom: Spacing.sm },
  highlightSplit: {
    flexDirection: 'column',
    gap: Spacing.md,
  },
  highlightSplitWide: {
    flexDirection: 'row',
  },
  highlightColumn: {
    flex: 1,
    gap: Spacing.sm,
  },
  highlightPill: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    backgroundColor: 'rgba(255,131,71,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,131,71,0.15)',
  },
  highlightPillTitle: { color: C.ink, fontWeight: '800', fontSize: 15 },
  highlightPillText: { color: C.gray600, fontSize: 13 },
  highlightCardWide: { flex: 0.9 },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  formCardWide: { flex: 1.1 },
  formIntro: {
    color: C.gray600,
    marginBottom: Spacing.xs,
  },
  formLabel: { fontWeight: '700', color: C.ink },
  input: {
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: C.ink,
  },
  inputError: { borderColor: C.danger },
  errorText: { color: C.danger, fontSize: 12, marginTop: -Spacing.xs },
  inputMultiline: { height: 120, textAlignVertical: 'top' },
  submitButton: {
    marginTop: Spacing.sm,
    backgroundColor: C.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  footerText: { textAlign: 'center', color: C.gray500, fontSize: 12 },
});

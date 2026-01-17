import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Constants from 'expo-constants';

import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';
import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { budgetOptions, formatOptions, steps } from '@/app/business-quote/constants';
import { auth } from '@/src/firebase';
import { persistBusinessQuote } from '@/src/firestoreBusinessQuotes';
import { useAuthSession } from '@/hooks/use-auth-session';

const C = Colors;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PHONE_DIGITS = 8;

const ensureWebsiteUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

export default function BusinessQuoteScreen() {
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [formatChoice, setFormatChoice] = useState(formatOptions[0]);
  const [budgetChoice, setBudgetChoice] = useState(budgetOptions[0]);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formatDropdownOpen, setFormatDropdownOpen] = useState(false);
  const [budgetDropdownOpen, setBudgetDropdownOpen] = useState(false);
  const session = useAuthSession();
  const platformLabel = Platform.OS;
  const appVersion =
    Constants.expoConfig?.version ?? Constants.manifest?.version ?? null;
  const userId = auth.currentUser?.uid ?? null;
  const userEmail = session.email ?? null;
  const role = session.isDriver ? "driver" : session.isPassenger ? "passenger" : null;
  const isFormComplete =
    company.trim().length > 0 &&
    contactName.trim().length > 0 &&
    message.trim().length > 0 &&
    email.trim().length > 0 &&
    EMAIL_PATTERN.test(email.trim());

  const resetForm = () => {
    setCompany('');
    setContactName('');
    setEmail('');
    setPhone('');
    setWebsite('');
    setMessage('');
    setFormatChoice(formatOptions[0]);
    setBudgetChoice(budgetOptions[0]);
    setErrors({});
  };

  const goBack = () => {
    try {
      router.back();
    } catch {
      router.replace('/(tabs)/profile');
    }
  };

  const cycleOption = (options: string[], current: string, setter: (value: string) => void) => {
    const currentIndex = options.indexOf(current);
    const nextIndex = (currentIndex + 1) % options.length;
    setter(options[nextIndex]);
  };

  const onSend = async () => {
    if (submitting) return;
    const trimmedCompany = company.trim();
    const trimmedContactName = contactName.trim();
    const trimmedMessage = message.trim();
    const trimmedEmail = email.trim();
    const normalizedEmail = trimmedEmail.toLowerCase();
    const trimmedPhone = phone.trim();
    const digitOnlyPhone = trimmedPhone ? trimmedPhone.replace(/\D/g, '') : '';
    const sanitizedPhone = trimmedPhone ? trimmedPhone.replace(/\s+/g, '') : null;
    const nextErrors: Record<string, string> = {};

    if (!trimmedCompany) nextErrors.company = 'Ajoute le nom de ton entreprise.';
    if (!trimmedContactName) nextErrors.contactName = 'Ajoute ton nom.';
    if (!trimmedMessage) nextErrors.message = 'Décris tes objectifs.';
    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      nextErrors.email = 'Ajoute un e-mail valide.';
    }
    if (trimmedPhone && digitOnlyPhone.length < MIN_PHONE_DIGITS) {
      nextErrors.phone = 'Ajoute un numéro belge d’au moins 8 chiffres.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      Alert.alert('Formulaire incomplet', 'Merci de remplir les champs obligatoires.');
      return;
    }

    setSubmitting(true);
    const formattedWebsite = ensureWebsiteUrl(website);
    const subject = encodeURIComponent('Demande de devis CampusRide');
    const body = encodeURIComponent(
      `Nom entreprise : ${trimmedCompany}\nContact : ${trimmedContactName}\nEmail : ${normalizedEmail}\nTéléphone : ${trimmedPhone || 'N/A'}\nSite web : ${formattedWebsite || 'N/A'}\nFormat : ${formatChoice}\nBudget : ${budgetChoice}\n\n${trimmedMessage}`
    );
    const mailto = `mailto:business@campusride.app?subject=${subject}&body=${body}`;

    try {
      await persistBusinessQuote({
        companyName: trimmedCompany,
        contactName: trimmedContactName,
        contactEmail: normalizedEmail,
        contactPhone: sanitizedPhone,
        website: formattedWebsite,
        desiredFormat: formatChoice,
        estimatedMonthlyBudget: budgetChoice,
        messageObjectives: trimmedMessage,
        appVersion,
        platform: platformLabel,
        userId,
        userEmail,
        role,
        consent: true,
        originRoute: '/business-quote',
        clientTimestamp: Date.now(),
      });

      setErrors({});
      resetForm();
      router.push('/business-quote/confirmation');
      void Linking.openURL(mailto).catch(() =>
        Alert.alert(
          'Envoi impossible',
          'Ton application mail est indisponible, ta demande a bien été enregistrée.'
        )
      );
    } catch (error) {
      console.warn('[business-quote] persist failed', error);
      Alert.alert(
        'Erreur',
        'Impossible d’enregistrer ta demande pour le moment. Réessaye dans quelques instants.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable onPress={goBack} style={styles.backRow} accessibilityRole="button" hitSlop={12}>
            <IconSymbol name="chevron.left" size={24} color={C.white} />
            <Text style={styles.backLabel}>Retour</Text>
          </Pressable>

          <View style={styles.headerBlock}>
            <Text style={styles.pageTitle}>Demande de devis</Text>
            <Text style={styles.pageSubtitle}>Parlez-nous de votre projet</Text>
          </View>

          <>
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <IconSymbol name="doc.text" size={20} color={C.primary} />
                <Text style={styles.sectionTitle}>Informations entreprise</Text>
              </View>
                <Text style={styles.fieldLabel}>Nom de l'entreprise *</Text>
                <TextInput
                  style={[styles.input, errors.company && styles.inputError]}
                  value={company}
                  onChangeText={setCompany}
                  placeholder="Ex: Pizza Student"
                  placeholderTextColor={C.gray400}
                />
                {errors.company ? <Text style={styles.errorText}>{errors.company}</Text> : null}
                <Text style={styles.fieldLabel}>Nom du contact *</Text>
                <TextInput
                  style={[styles.input, errors.contactName && styles.inputError]}
                  value={contactName}
                  onChangeText={setContactName}
                  placeholder="Votre nom"
                  placeholderTextColor={C.gray400}
                />
                {errors.contactName ? <Text style={styles.errorText}>{errors.contactName}</Text> : null}
                <Text style={styles.fieldLabel}>Email *</Text>
                <View style={styles.inputWithIcon}>
                  <IconSymbol name="envelope.fill" size={18} color={C.gray500} />
                  <TextInput
                    style={styles.iconTextInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="contact@entreprise.be"
                    placeholderTextColor={C.gray400}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
                <Text style={styles.fieldLabel}>Téléphone</Text>
                <View style={styles.inputWithIcon}>
                  <IconSymbol name="phone.fill" size={18} color={C.gray500} />
                  <TextInput
                    style={styles.iconTextInput}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+32 471 23 45 67"
                    placeholderTextColor={C.gray400}
                    keyboardType="phone-pad"
                  />
                </View>
                {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
                <Text style={styles.fieldLabel}>Site web</Text>
                <View style={styles.inputWithIcon}>
                  <IconSymbol name="globe" size={18} color={C.gray500} />
                  <TextInput
                    style={styles.iconTextInput}
                    value={website}
                    onChangeText={setWebsite}
                    placeholder="https://www.entreprise.be"
                    placeholderTextColor={C.gray400}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={[styles.sectionCard, styles.preferenceCard]}>
                <Text style={styles.sectionTitle}>Préférences publicitaires</Text>
                <Text style={styles.fieldLabel}>Format souhaité</Text>
                <Pressable
                  style={styles.selectField}
                  onPress={() => setFormatDropdownOpen((prev) => !prev)}
                  accessibilityRole="button"
                >
                  <Text style={styles.selectValue}>{formatChoice}</Text>
                  <IconSymbol
                    name={formatDropdownOpen ? 'chevron.up' : 'chevron.down'}
                    size={18}
                    color={C.gray500}
                  />
                </Pressable>
                {formatDropdownOpen ? (
                  <View style={styles.dropdownList}>
                    {formatOptions.map((option) => (
                      <Pressable
                        key={option}
                        onPress={() => {
                          setFormatChoice(option);
                          setFormatDropdownOpen(false);
                        }}
                        style={styles.dropdownItem}
                      >
                        <Text style={styles.dropdownText}>{option}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.fieldLabel}>Budget mensuel estimé</Text>
                <Pressable
                  style={styles.selectField}
                  onPress={() => setBudgetDropdownOpen((prev) => !prev)}
                  accessibilityRole="button"
                >
                  <Text style={styles.selectValue}>{budgetChoice}</Text>
                  <IconSymbol
                    name={budgetDropdownOpen ? 'chevron.up' : 'chevron.down'}
                    size={18}
                    color={C.gray500}
                  />
                </Pressable>
                {budgetDropdownOpen ? (
                  <View style={styles.dropdownList}>
                    {budgetOptions.map((option) => (
                      <Pressable
                        key={option}
                        onPress={() => {
                          setBudgetChoice(option);
                          setBudgetDropdownOpen(false);
                        }}
                        style={styles.dropdownItem}
                      >
                        <Text style={styles.dropdownText}>{option}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.fieldLabel}>Message / Objectifs *</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline, errors.message && styles.inputError]}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Décrivez vos objectifs publicitaires, votre audience cible, etc."
                  placeholderTextColor={C.gray400}
                  multiline
                  numberOfLines={5}
                />
                {errors.message ? <Text style={styles.errorText}>{errors.message}</Text> : null}
              </View>

              <View style={[styles.sectionCard, styles.stepsCard]}>
                <Text style={styles.sectionTitle}>Que se passe-t-il ensuite ?</Text>
                {steps.map((step, index) => (
                  <View key={step} style={styles.stepRow}>
                    <Text style={styles.stepIndex}>{index + 1}.</Text>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            <View style={styles.ctaSection}>
              <Pressable
                style={({ pressed }) => {
                  const active = isFormComplete && !submitting;
                  return [
                    styles.sendButton,
                    active ? styles.sendButtonActive : styles.sendButtonDisabled,
                    pressed && active ? styles.sendButtonPressed : null,
                  ];
                }}
                onPress={onSend}
                disabled={!isFormComplete || submitting}
                accessibilityRole="button"
              >
                {submitting ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={C.white} />
                    <Text style={styles.sendButtonText}>Envoi en cours…</Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.sendButtonText,
                      !isFormComplete && styles.sendButtonTextDisabled,
                    ]}
                  >
                    Envoyer ma demande
                  </Text>
                )}
              </Pressable>
              {!isFormComplete && (
                <Text style={styles.formHint}>
                  Complète tous les champs obligatoires pour activer le bouton.
                </Text>
              )}
              <Text style={styles.requiredText}>* Champs obligatoires</Text>
            </View>
          </>
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    gap: Spacing.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  backLabel: {
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
  },
  headerBlock: {
    marginTop: Spacing.sm,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: C.white,
  },
  pageSubtitle: {
    color: C.white,
    marginTop: Spacing.xs,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    padding: Spacing.lg,
    gap: Spacing.sm,
    shadowColor: '#0B2545',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.ink,
  },
  fieldLabel: {
    marginTop: Spacing.sm,
    fontWeight: '700',
    color: C.ink,
  },
  input: {
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 18,
    padding: Spacing.md,
    color: C.ink,
  },
  inputMultiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  inputWithIcon: {
    marginTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 18,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  iconTextInput: {
    flex: 1,
    borderWidth: 0,
    paddingVertical: Spacing.sm,
    color: C.ink,
  },
  inputError: {
    borderColor: C.danger,
  },
  errorText: {
    color: C.danger,
    fontSize: 12,
  },
  preferenceCard: {
    borderRadius: 30,
  },
  selectField: {
    marginTop: Spacing.xs,
    padding: Spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.gray200,
    backgroundColor: C.gray50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValue: {
    color: C.ink,
  },
  dropdownList: {
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 18,
    backgroundColor: C.white,
    maxHeight: 160,
    overflow: 'hidden',
    paddingVertical: Spacing.xs,
  },
  dropdownItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dropdownText: {
    color: C.gray700,
  },
  stepsCard: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  stepIndex: {
    color: C.primary,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    color: C.gray700,
  },
  ctaSection: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sendButton: {
    width: '100%',
    backgroundColor: C.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  sendButtonPressed: {
    opacity: 0.9,
  },
  sendButtonText: {
    color: C.white,
    fontWeight: '700',
    fontSize: 16,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  requiredText: {
    color: C.white,
    fontSize: 12,
    opacity: 0.8,
  },
  formHint: {
    color: C.white,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: Spacing.xs,
  },
  sendButtonActive: {
    backgroundColor: C.primary,
  },
  sendButtonDisabled: {
    backgroundColor: C.gray200,
  },
  sendButtonTextDisabled: {
    color: C.gray600,
  },
  successNote: {
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  confirmationGrid: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  confirmationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    shadowColor: '#0B2545',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
  },
  confirmationIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationTitle: {
    fontWeight: '700',
    color: C.ink,
  },
  confirmationDescription: {
    flex: 1,
    color: C.gray600,
  },
});

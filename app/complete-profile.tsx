import { Redirect, router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import * as Auth from '@/app/services/auth';
import { Colors, Gradients, Spacing } from '@/app/ui/theme';
import { pickKycImage, pickProfileDocument, pickProfileImage } from '@/app/utils/image-picker';
import { AppBackground } from '@/components/ui/app-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuthSession } from '@/hooks/use-auth-session';

const splitName = (fullName: string | null | undefined) => {
  const safe = fullName?.trim();
  if (!safe) {
    return { first: '', last: '' };
  }
  const [first, ...rest] = safe.split(/\s+/);
  return { first: first ?? '', last: rest.join(' ') };
};

const ILLUSTRATION_RATIO = 226 / 339;
const CAMPUS_OPTIONS = [
  'Haute École EPHEC Woluwe-Saint-Lambert',
  'Haute École EPHEC Delta',
  'Haute École EPHEC Louvain-la-Neuve',
  'Haute École EPHEC Schaerbeek',
];
const normalizeCampusValue = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const preserveValue = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

export default function CompleteProfile() {
  const session = useAuthSession();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  // local illustration of a student on a laptop for the onboarding card
  const heroImage = require('@/assets/images/Etudiant.png');
  const parsedName = splitName(session.name);
  const savedStudentCard = preserveValue(session.studentCardUrl);
  const savedSelfie = savedStudentCard ? preserveValue(session.avatarUrl) : null;
  const [firstName, setFirstName] = useState(parsedName.first);
  const [lastName, setLastName] = useState(parsedName.last);
  const [campus, setCampus] = useState(session.address ?? '');
  const [campusFocused, setCampusFocused] = useState(false);
  const campusBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const campusInputRef = useRef<TextInput>(null);
  const [phone, setPhone] = useState(() => {
    const existing = session.phone?.trim() ?? '';
    if (existing.startsWith('+32')) return existing;
    if (existing) return `+32${existing.replace(/^0+/, '')}`;
    return '+32';
  });
  const [step, setStep] = useState<1 | 2>(1);
  const [studentCardUri, setStudentCardUri] = useState<string | null>(savedStudentCard);
  const [selfieUri, setSelfieUri] = useState<string | null>(savedSelfie);
  const [studentCardLoading, setStudentCardLoading] = useState(false);
  const [selfieLoading, setSelfieLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const phoneValid = useMemo(() => /^(\+?\d{8,15})$/.test(phone.trim()), [phone]);
  const infoValid =
    firstName.trim().length > 1 &&
    lastName.trim().length > 1 &&
    campus.trim().length > 2 &&
    phoneValid;
  const documentsValid = !!studentCardUri && !!selfieUri;
  const formValid = infoValid && documentsValid;

  if (!session.email) {
    return <Redirect href="/sign-in" />;
  }

  const chooseStudentCard = async () => {
    if (studentCardLoading) return;
    setStudentCardLoading(true);
    try {
      const uri = await pickKycImage('files', 'student-card');
      if (uri) {
        setStudentCardUri(uri);
        return;
      }
      const gallery = await pickKycImage('gallery', 'student-card');
      if (gallery) setStudentCardUri(gallery);
    } finally {
      setStudentCardLoading(false);
    }
  };

  const chooseSelfie = async () => {
    if (selfieLoading) return;
    setSelfieLoading(true);
    try {
      const fromDocs = await pickProfileDocument();
      if (fromDocs) {
        setSelfieUri(fromDocs);
        return;
      }
      const fromGallery = await pickProfileImage();
      if (fromGallery) setSelfieUri(fromGallery);
    } finally {
      setSelfieLoading(false);
    }
  };

  const goToDocumentsStep = () => {
    if (!infoValid) return;
    setStep(2);
  };

  const onSubmit = async () => {
    if (!session.email || !formValid) return;
    try {
      setSubmitting(true);
      await Auth.updateProfile(session.email, {
        name: `${firstName.trim()} ${lastName.trim()}`,
        address: campus.trim(),
        phone: phone.trim(),
        studentCardUrl: studentCardUri ?? '',
        avatarUrl: selfieUri ?? '',
      });
      router.replace('/profile-welcome');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de mettre à jour le profil.';
      Alert.alert('Erreur', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppBackground colors={Gradients.twilight}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <SafeAreaView style={styles.safe}>
          <ScrollView
            contentContainerStyle={[styles.scroll, isCompact && styles.scrollCompact]}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.card, isCompact && styles.cardCompact]}>
              <View style={styles.headerRow}>
                <Pressable style={styles.backLink} hitSlop={16} onPress={() => router.back()}>
                  <IconSymbol name="chevron.left.circle.fill" size={28} color={Colors.primary} />
                  <Text style={styles.backLinkText}>Retour</Text>
                </Pressable>
                <View style={{ flex: 1 }} />
              </View>
              <Text style={styles.title}>Compléter ton{'\n'}profil</Text>
              {step === 1 ? (
                <Image
                  source={heroImage}
                  style={[styles.heroImage, isCompact && styles.heroImageCompact]}
                  resizeMode="contain"
                />
              ) : null}
              {step === 1 ? (
                <>
                  <View style={[styles.row, isCompact && styles.rowStack]}>
                    <TextInput
                      placeholder="Nom"
                      value={lastName}
                      onChangeText={setLastName}
                      style={[styles.input, styles.rowInput]}
                      placeholderTextColor={Colors.gray500}
                      autoCapitalize="words"
                    />
                    <TextInput
                      placeholder="Prénom"
                      value={firstName}
                      onChangeText={setFirstName}
                      style={[styles.input, styles.rowInput]}
                      placeholderTextColor={Colors.gray500}
                      autoCapitalize="words"
                    />
                  </View>
                  <View style={styles.campusField}>
                    <TextInput
                      ref={campusInputRef}
                      placeholder="Campus"
                      value={campus}
                      onChangeText={setCampus}
                      style={[styles.input, styles.singleInput]}
                      placeholderTextColor={Colors.gray500}
                      onFocus={() => {
                        if (campusBlurTimeout.current) {
                          clearTimeout(campusBlurTimeout.current);
                          campusBlurTimeout.current = null;
                        }
                        setCampusFocused(true);
                      }}
                      onBlur={() => {
                        campusBlurTimeout.current = setTimeout(() => {
                          setCampusFocused(false);
                          campusBlurTimeout.current = null;
                        }, 120);
                      }}
                    />
                    {campusFocused && (
                      <View style={styles.campusOptions}>
                        {CAMPUS_OPTIONS.filter((option) =>
                        normalizeCampusValue(option).includes(
                          normalizeCampusValue(campus.trim() || '')
                        )
                      ).map((option) => (
                        <Pressable
                            key={option}
                            style={styles.campusOption}
                            onPress={() => {
                              setCampus(option);
                              setCampusFocused(false);
                              campusInputRef.current?.blur();
                            }}
                          >
                            <Text style={styles.campusOptionText}>{option}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={styles.phoneRow}>
                    <Text style={styles.phonePrefix}>+32</Text>
                    <TextInput
                      placeholder="Numéro de téléphone"
                      value={phone.replace('+32', '')}
                      onChangeText={(text) => {
                        const digits = text.replace(/[^0-9]/g, '');
                        setPhone(`+32${digits}`);
                      }}
                      style={[
                        styles.input,
                        styles.singleInput,
                        phone && !phoneValid && styles.inputError,
                        styles.phoneInput,
                      ]}
                      placeholderTextColor={Colors.gray500}
                      keyboardType="phone-pad"
                    />
                  </View>
                </>
              ) : null}

              {step === 1 ? (
                <GradientButton
                  title="Continuer"
                  onPress={goToDocumentsStep}
                  disabled={!infoValid}
                  fullWidth
                  style={styles.cta}
                />
              ) : (
                <>
                  <View style={styles.uploadSection}>
                    <Pressable
                      style={[
                        styles.uploadBox,
                        studentCardLoading && styles.uploadDisabled,
                        studentCardUri && styles.uploadBoxValid,
                      ]}
                      onPress={chooseStudentCard}
                      disabled={studentCardLoading}
                    >
                      {studentCardUri ? (
                        <IconSymbol
                          name="checkmark.circle.fill"
                          size={38}
                          color={Colors.success}
                          style={styles.uploadIconTop}
                        />
                      ) : (
                        <View style={[styles.uploadIcon, styles.uploadIconTop]}>
                          <IconSymbol name="camera.fill" size={22} color={Colors.secondary} />
                        </View>
                      )}
                      <Text style={styles.uploadBoxLabel}>
                        {studentCardLoading
                          ? 'Chargement…'
                          : studentCardUri
                          ? 'Carte étudiante importée'
                          : 'Importer ma carte étudiante'}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.uploadSection}>
                    <Pressable
                      style={[
                        styles.uploadBox,
                        selfieLoading && styles.uploadDisabled,
                        selfieUri && styles.uploadBoxValid,
                      ]}
                      onPress={chooseSelfie}
                      disabled={selfieLoading}
                    >
                      {selfieUri ? (
                        <IconSymbol
                          name="checkmark.circle.fill"
                          size={38}
                          color={Colors.success}
                          style={styles.uploadIconTop}
                        />
                      ) : (
                        <View style={[styles.uploadIcon, styles.uploadIconTop]}>
                          <IconSymbol name="camera.fill" size={22} color={Colors.secondary} />
                        </View>
                      )}
                      <Text style={styles.uploadBoxLabel}>
                        {selfieLoading
                          ? 'Chargement…'
                          : selfieUri
                          ? 'Selfie importé'
                          : 'Importer un selfie récent'}
                      </Text>
                      {!selfieUri ? (
                        <Text style={styles.uploadHint}>Ajoute une photo récente pour la vérification</Text>
                      ) : null}
                    </Pressable>
                  </View>

                  <View style={styles.stepActions}>
                    <Pressable style={styles.backButton} onPress={() => setStep(1)} disabled={submitting}>
                      <Text style={styles.backButtonText}>Retour</Text>
                    </Pressable>
                    <GradientButton
                      title={submitting ? 'Enregistrement…' : 'Valider'}
                      onPress={onSubmit}
                      disabled={!formValid || submitting}
                      fullWidth
                      style={styles.cta}
                    >
                      {submitting ? <ActivityIndicator color="#fff" /> : null}
                    </GradientButton>
                  </View>
                </>
              )}

              <View style={styles.stepFooter}>
                <View style={styles.stepIndicator}>
                  <View style={[styles.stepCircle, step === 1 && styles.stepCircleActive]}>
                    <Text style={[styles.stepNumber, step === 1 && styles.stepNumberActive]}>1</Text>
                  </View>
                  <View style={styles.stepLine} />
                  <View style={[styles.stepCircle, step === 2 && styles.stepCircleActive]}>
                    <Text style={[styles.stepNumber, step === 2 && styles.stepNumberActive]}>2</Text>
                  </View>
                </View>
                <Text style={styles.stepCaption}>
                  {step === 1 ? 'Infos personnelles' : 'Documents de vérification'}
                </Text>
              </View>

            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  scrollCompact: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  card: {
    width: '100%',
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  cardCompact: {
    paddingHorizontal: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  stepFooter: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backLinkText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  stepNumber: {
    fontWeight: '700',
    color: Colors.gray400,
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.gray200,
  },
  stepCaption: {
    fontWeight: '600',
    color: Colors.gray600,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  rowStack: {
    flexDirection: 'column',
    gap: Spacing.xs,
  },
  rowInput: {
    flex: 1,
    minWidth: 0,
  },
  heroImage: {
    width: '68%',
    aspectRatio: ILLUSTRATION_RATIO,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  heroImageCompact: {
    width: '82%',
    marginBottom: Spacing.lg,
  },
  input: {
    flex: 1,
    backgroundColor: '#F6F6F8',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#C5C6D0',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    color: Colors.ink,
  },
  singleInput: { width: '100%' },
  phoneRow: {
    width: '100%',
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  phonePrefix: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: '#EFEFFD',
  },
  phonePrefixText: {
    fontWeight: '700',
    color: Colors.secondary,
  },
  phoneInput: {
    flex: 1,
  },
  inputError: { borderWidth: 1, borderColor: Colors.danger },
  error: { color: Colors.danger, fontSize: 12 },
  uploadBox: {
    borderWidth: 2,
    borderColor: '#B79BFF',
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,239,255,0.8)',
    gap: Spacing.sm,
    width: '100%',
    minHeight: 150,
  },
  uploadBoxValid: {
    borderColor: Colors.success,
  },
  uploadBoxLabel: {
    color: Colors.gray700,
    fontWeight: '700',
    fontSize: 15,
  },
  uploadIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#B79BFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadIconTop: {
    marginBottom: Spacing.sm,
  },
  campusOptionText: {
    color: Colors.gray700,
    fontWeight: '600',
  },
  campusOptions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 16,
    backgroundColor: '#fff',
    overflow: 'hidden',
    zIndex: 10,
    elevation: 6,
  },
  campusOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray200,
  },
  campusField: {
    width: '100%',
    position: 'relative',
    zIndex: 10,
  },
  uploadHint: {
    color: Colors.gray500,
    fontSize: 12,
  },
  uploadSection: {
    width: '100%',
    alignItems: 'center',
    marginVertical: Spacing.xs,
  },
  uploadDisabled: { opacity: 0.5 },
  stepActions: {
    width: '100%',
    gap: Spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  backButtonText: {
    color: Colors.gray600,
    fontWeight: '600',
  },
  cta: { marginTop: Spacing.xs },
});

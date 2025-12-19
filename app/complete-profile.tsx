import { Redirect, router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
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
import { updatePassengerProfile } from '@/src/firestoreUsers';
import { uploadProfileSelfie, uploadStudentCard } from '@/src/storageUploads';

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

const isRemoteUri = (uri: string | null | undefined) =>
  typeof uri === 'string' && /^https?:\/\//.test(uri);

export default function CompleteProfile() {
  const session = useAuthSession();
  const { width, height } = useWindowDimensions();
  const isCompact = width < 360;
  const showUploadGrid = width >= 420;
  // local illustration of a student on a laptop for the onboarding card
  const heroImage = require('@/assets/images/Etudiant.png');
  const emailAlias =
    session.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim().toLowerCase() ?? '';
  const rawName = session.name?.trim() ?? '';
  const isAutoName = emailAlias && rawName && rawName.toLowerCase() === emailAlias;
  const parsedName = splitName(isAutoName ? '' : rawName);
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
  const studentCardAttemptRef = useRef(0);
  const selfieAttemptRef = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

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

  const resetStudentCardSelection = () => {
    studentCardAttemptRef.current += 1;
    setStudentCardLoading(false);
    setStudentCardUri(null);
  };

  const resetSelfieSelection = () => {
    selfieAttemptRef.current += 1;
    setSelfieLoading(false);
    setSelfieUri(null);
  };

  const pickStudentCardFrom = useCallback(
    async (source: 'files' | 'gallery') => {
      if (studentCardLoading) return;
      const attempt = ++studentCardAttemptRef.current;
      setStudentCardLoading(true);
      try {
        const uri =
          source === 'files'
            ? await pickKycImage('files', 'student-card')
            : await pickKycImage('gallery', 'student-card');
        if (uri && studentCardAttemptRef.current === attempt) {
          setStudentCardUri(uri);
        }
      } finally {
        if (studentCardAttemptRef.current === attempt) {
          setStudentCardLoading(false);
        }
      }
    },
    [studentCardLoading]
  );

  const pickSelfieFrom = useCallback(
    async (source: 'files' | 'gallery') => {
      if (selfieLoading) return;
      const attempt = ++selfieAttemptRef.current;
      setSelfieLoading(true);
      try {
        const uri = source === 'files' ? await pickProfileDocument() : await pickProfileImage();
        if (uri && selfieAttemptRef.current === attempt) {
          setSelfieUri(uri);
        }
      } finally {
        if (selfieAttemptRef.current === attempt) {
          setSelfieLoading(false);
        }
      }
    },
    [selfieLoading]
  );

  const chooseStudentCard = () => {
    if (studentCardLoading) return;
    if (Platform.OS === 'web') {
      void pickStudentCardFrom('files');
      return;
    }
    const openFiles = () => void pickStudentCardFrom('files');
    const openGallery = () => void pickStudentCardFrom('gallery');
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Annuler', 'Mes fichiers', 'Ma galerie'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) openFiles();
          if (index === 2) openGallery();
        }
      );
      return;
    }
    Alert.alert('Importer ta carte étudiante', 'Choisis la source de la photo.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Mes fichiers', onPress: openFiles },
      { text: 'Ma galerie', onPress: openGallery },
    ]);
  };

  const chooseSelfie = () => {
    if (selfieLoading) return;
    if (Platform.OS === 'web') {
      void pickSelfieFrom('files');
      return;
    }
    const openFiles = () => void pickSelfieFrom('files');
    const openGallery = () => void pickSelfieFrom('gallery');
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Annuler', 'Importer un fichier', 'Choisir dans ma galerie'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) openFiles();
          if (index === 2) openGallery();
        }
      );
      return;
    }
    Alert.alert('Importer ton selfie', 'Choisis la source de ta photo.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Importer un fichier', onPress: openFiles },
      { text: 'Galerie', onPress: openGallery },
    ]);
  };

  const goToDocumentsStep = () => {
    if (!infoValid) return;
    setStep(2);
  };

  const onSubmit = async () => {
    if (!session.email || !formValid) return;
    const pendingStudentCard = studentCardUri;
    const pendingSelfie = selfieUri;
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedName = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const normalizedCampus = campus.trim();
    const normalizedPhone = phone.trim();
    const userEmail = session.email;

    const uploadIfNeeded = async (
      uri: string | null,
      uploader: (localUri: string) => Promise<string>
    ) => {
      if (!uri) return null;
      if (isRemoteUri(uri)) return uri;
      return uploader(uri);
    };

    const finalizeDocuments = async () => {
      if (!userEmail) return;
      try {
        const [studentCardUrl, profileSelfieUrl] = await Promise.all([
          uploadIfNeeded(pendingStudentCard, (uri) => uploadStudentCard({ email: userEmail, uri })),
          uploadIfNeeded(pendingSelfie, (uri) => uploadProfileSelfie({ email: userEmail, uri })),
        ]);

        if (!studentCardUrl && !profileSelfieUrl) return;

        await Auth.updateProfile(userEmail, {
          name: normalizedName,
          address: normalizedCampus,
          phone: normalizedPhone,
          studentCardUrl: studentCardUrl ?? undefined,
          avatarUrl: profileSelfieUrl ?? undefined,
        });

        await updatePassengerProfile({
          email: userEmail,
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          campus: normalizedCampus,
          phone: normalizedPhone,
          studentCardUrl: studentCardUrl ?? undefined,
          selfieUrl: profileSelfieUrl ?? undefined,
        });
      } catch (error) {
        console.warn('Failed to upload verification documents', error);
        Alert.alert(
          'Synchronisation retardée',
          'Tes documents seront téléversés dès que possible. Réessaie depuis ton profil si nécessaire.'
        );
      }
    };

    try {
      setSubmitting(true);
      setUploadMessage('Préparation de ton profil…');

      await Auth.updateProfile(userEmail, {
        name: normalizedName,
        address: normalizedCampus,
        phone: normalizedPhone,
      });

      await updatePassengerProfile({
        email: userEmail,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        campus: normalizedCampus,
        phone: normalizedPhone,
      });

      setUploadMessage('Téléversement de tes documents…');
      void finalizeDocuments();

      router.replace('/profile-welcome');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Impossible de mettre à jour le profil. Vérifie ta connexion et réessaie.';
      console.warn('Failed to compléter le profil', error);
      Alert.alert(
        'Envoi interrompu',
        `${message}\nAssure-toi d’avoir une bonne connexion puis relance l’enregistrement.`
      );
    } finally {
      setUploadMessage(null);
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      return;
    }
    router.replace('/(tabs)/profile');
  };

  const primaryActionLabel = step === 1 ? 'Continuer' : submitting ? 'Enregistrement…' : 'Valider';

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
            bounces={false}
          >
            <View
              style={[
                styles.card,
                isCompact && styles.cardCompact,
                step === 2 && { minHeight: Math.max(540, height - Spacing.lg * 2) },
              ]}
            >
              <View style={styles.headerRow}>
                <Pressable style={styles.backLink} hitSlop={16} onPress={handleBack}>
                  <IconSymbol name="chevron.left.circle.fill" size={40} color={Colors.primary} />
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
                        styles.phoneInput,
                      ]}
                      placeholderTextColor={Colors.gray500}
                      keyboardType="phone-pad"
                    />
                  </View>
                </>
              ) : null}

              {step === 2 ? (
                <View style={styles.documentSection}>
                  <View style={styles.documentColumns}>
                    <View style={styles.documentCard}>
                      <View style={styles.documentHeader}>
                        <IconSymbol name="idcard" size={20} color={Colors.primary} />
                        <Text style={styles.documentTitle}>Carte étudiante</Text>
                        {(studentCardLoading || studentCardUri) && (
                          <Pressable
                            onPress={resetStudentCardSelection}
                            hitSlop={8}
                            style={styles.resetLink}
                          >
                            <Text style={styles.resetLinkText}>
                              {studentCardLoading ? 'Annuler' : 'Réinitialiser'}
                            </Text>
                          </Pressable>
                        )}
                      </View>
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

                    <View style={styles.documentCard}>
                      <View style={styles.documentHeader}>
                        <IconSymbol name="person.crop.square" size={20} color={Colors.primary} />
                        <Text style={styles.documentTitle}>Selfie de vérification</Text>
                        {(selfieLoading || selfieUri) && (
                          <Pressable
                            onPress={resetSelfieSelection}
                            hitSlop={8}
                            style={styles.resetLink}
                          >
                            <Text style={styles.resetLinkText}>
                              {selfieLoading ? 'Annuler' : 'Réinitialiser'}
                            </Text>
                          </Pressable>
                        )}
                      </View>
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
                  </View>
                </View>
              ) : null}
              <View style={styles.actionRow}>
                <GradientButton
                  title={primaryActionLabel}
                  onPress={step === 1 ? goToDocumentsStep : onSubmit}
                  disabled={step === 1 ? !infoValid : !formValid || submitting}
                  fullWidth
                  style={styles.cta}
                >
                  {step === 2 && submitting ? <ActivityIndicator color="#fff" /> : null}
                </GradientButton>
              </View>
              {uploadMessage ? (
                <Text style={styles.uploadMessage}>{uploadMessage}</Text>
              ) : null}

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
    flexGrow: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    alignItems: 'stretch',
    gap: Spacing.md,
  },
  scrollCompact: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cardCompact: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  stepFooter: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
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
    paddingVertical: 6,
    paddingHorizontal: 8,
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
    gap: Spacing.sm,
    width: '100%',
    marginTop: Spacing.xs,
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
    width: '120%',
    maxWidth: 420,
    aspectRatio: ILLUSTRATION_RATIO,
    alignSelf: 'center',
    marginBottom: Spacing.xs,
  },
  heroImageCompact: {
    width: '100%',
    marginBottom: Spacing.xs,
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
    marginTop: Spacing.xs,
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
  error: { color: Colors.danger, fontSize: 12 },
  uploadBox: {
    borderWidth: 2,
    borderColor: '#B79BFF',
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,239,255,0.8)',
    gap: Spacing.sm,
    width: '100%',
    minHeight: 110,
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
    marginTop: Spacing.xs,
  },
  uploadHint: {
    color: Colors.gray500,
    fontSize: 12,
  },
  resetLink: {
    marginLeft: 'auto',
  },
  resetLinkText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  actionRow: {
    width: '100%',
    marginTop: Spacing.sm,
  },
  documentSection: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  documentColumns: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    alignItems: 'stretch',
  },
  documentCard: {
    flex: 1,
    minWidth: 220,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(122,95,255,0.3)',
    padding: Spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.95)',
    gap: Spacing.md,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  documentTitle: {
    fontWeight: '700',
    color: Colors.ink,
  },
  uploadDisabled: { opacity: 0.5 },
  stepActions: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
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
  uploadMessage: {
    marginTop: Spacing.xs,
    textAlign: 'center',
    color: Colors.gray600,
  },
  validateButton: { flex: 1 },
});

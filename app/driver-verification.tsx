import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import * as Auth from '@/app/services/auth';
import { uploadDriverDocument } from '@/app/services/driver-documents';
import { updateDriverLicense, updateVehicleInfo } from '@/app/services/security';
import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { DocumentRow } from '@/components/documents/document-row';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { HeaderBackButton } from '@/components/ui/header-back-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { pickProfileDocument } from '@/app/utils/image-picker';
import { useAuthSession } from '@/hooks/use-auth-session';
import { SharedDocumentKey, useDocumentStore } from '@/hooks/use-document-store';
import { useDriverSecurity } from '@/hooks/use-driver-security';
import { uploadDriverLicense } from '@/src/storageUploads';
import { updateUserDocuments } from '@/src/firestoreUsers';
import { db } from '@/src/firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

const formatPlateInput = (value: string) => {
  const cleaned = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!cleaned) return '';
  const part1 = cleaned.slice(0, 1);
  const part2 = cleaned.slice(1, 4);
  const part3 = cleaned.slice(4, 7);
  let result = part1;
  if (part2) {
    result += `-${part2}`;
  }
  if (part3) {
    result += `-${part3}`;
  }
  return result;
};

const parseExpiryDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parts = value.match(/\d+/g);
  if (!parts?.length) return null;
  let day = 1;
  let month = Number(parts[0]);
  let year = parts.length >= 2 ? Number(parts[1]) : null;
  if (parts.length === 3) {
    day = Number(parts[0]);
    month = Number(parts[1]);
    year = Number(parts[2]);
  }
  if (!year) return null;
  if (year < 100) {
    year += year < 70 ? 2000 : 1900;
  }
  if (!month || month < 1 || month > 12) {
    return null;
  }
  return new Date(year, month - 1, day);
};

const isExpiryValid = (value: string | null | undefined) => {
  const date = parseExpiryDate(value);
  if (!date) return false;
  const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  return endOfMonth >= new Date();
};

export default function DriverVerificationScreen() {
  const session = useAuthSession();
  const security = useDriverSecurity(session.email);
  const backgroundColors = session.isDriver ? Gradients.driver : Gradients.twilight;
  const driverModeActive = session.roleMode === 'driver';
  const isVerifiedDriver = session.isDriver && driverModeActive;

  type PreviewPayload = {
    title: string;
    url: string;
    sideKey: SharedDocumentKey;
    onReplace?: () => void;
  };
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const { documents: storedDocuments, setDocumentEntry } = useDocumentStore();
  const [plateValue, setPlateValue] = useState('');
  const [plateTouched, setPlateTouched] = useState(false);
  const [isConfirmingPlate, setIsConfirmingPlate] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [plateError, setPlateError] = useState<string | null>(null);
  const [vehicleConfirmed, setVehicleConfirmed] = useState(false);

  const updateRoles = useCallback(
    async (changes: { driver?: boolean; passenger?: boolean }) => {
      if (!session.email) return false;
      try {
        await Auth.updateProfile(session.email, changes);
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Modification impossible pour le moment.';
        Alert.alert('Erreur', message);
        return false;
      }
    },
    [session.email]
  );

  const closePreview = () => {
    setPreview(null);
    setLoadingPreview(false);
  };

  const openPreview = useCallback(
    (payload: PreviewPayload) => {
      setLoadingPreview(true);
      setPreview(payload);
    },
    []
  );

  const [loadingDocument, setLoadingDocument] = useState<'licenseRecto' | 'licenseVerso' | null>(
    null
  );

  const handlePickLicenseSide = useCallback(
    async (key: 'licenseRecto' | 'licenseVerso') => {
      setLoadingDocument(key);
      try {
        const uri = await pickProfileDocument();
        if (!uri) {
          return;
        }
        const name =
          key === 'licenseRecto'
            ? 'Permis de conduire — Recto'
            : 'Permis de conduire — Verso';
        setDocumentEntry(key, { uri, name });

        if (!session.email || !session.uid) {
          return;
        }

        const side = key === 'licenseRecto' ? 'front' : 'back';
        const licenseUpload = uploadDriverLicense({
          uid: session.uid,
          uri,
          side,
        });
        const reviewUpload = uploadDriverDocument({
          email: session.email,
          documentType: side === 'front' ? 'license_front' : 'license_back',
          uri,
        });

        const [licenseResult] = await Promise.all([licenseUpload, reviewUpload]);

        const previewUrl = licenseResult.downloadURL;
        updateDriverLicense(session.email, { side, url: previewUrl });
        await updateUserDocuments(
          session.email,
          side === 'front'
            ? { driverLicenseRecto: previewUrl }
            : { driverLicenseVerso: previewUrl }
        );

        if (session.uid) {
          const licenseDocRef = doc(db, 'users', session.uid);
          await setDoc(
            licenseDocRef,
            {
              driverLicense: {
                ...(side === 'front'
                  ? {
                      frontUrl: licenseResult.downloadURL,
                      frontPath: licenseResult.path,
                    }
                  : {
                      backUrl: licenseResult.downloadURL,
                      backPath: licenseResult.path,
                    }),
                updatedAt: serverTimestamp(),
              },
            },
            { merge: true }
          );
        }
      } catch (error) {
        console.warn('driver document upload failed', error);
        Alert.alert('Erreur', 'Impossible d’envoyer ce document pour le moment.');
      } finally {
        setLoadingDocument((current) => (current === key ? null : current));
      }
    },
    [session.email, session.uid, setDocumentEntry, updateDriverLicense, updateUserDocuments]
  );

  const licenseRecto = storedDocuments.licenseRecto;
  const licenseVerso = storedDocuments.licenseVerso;
  const studentCard = storedDocuments.studentCard;

  const documentRows = useMemo(() => {
    return [
      {
        key: 'license-front',
        title: 'Permis de conduire — Recto',
        subtitle: 'Recto du permis',
        icon: 'doc.text',
        hasDocument: Boolean(licenseRecto?.uri),
        statusText: licenseRecto ? 'Document enregistré' : undefined,
        actionLoading: loadingDocument === 'licenseRecto',
        onAdd: licenseRecto ? undefined : () => handlePickLicenseSide('licenseRecto'),
        onPreview: licenseRecto
          ? () =>
              openPreview({
                title: 'Permis de conduire — Recto',
                url: licenseRecto.uri,
                sideKey: 'licenseRecto',
                onReplace: () => handlePickLicenseSide('licenseRecto'),
              })
          : undefined,
      },
      {
        key: 'license-back',
        title: 'Permis de conduire — Verso',
        subtitle: 'Verso du permis',
        icon: 'doc.text',
        hasDocument: Boolean(licenseVerso?.uri),
        statusText: licenseVerso ? 'Document enregistré' : undefined,
        actionLoading: loadingDocument === 'licenseVerso',
        onAdd: licenseVerso ? undefined : () => handlePickLicenseSide('licenseVerso'),
        onPreview: licenseVerso
          ? () =>
              openPreview({
                title: 'Permis de conduire — Verso',
                url: licenseVerso.uri,
                sideKey: 'licenseVerso',
                onReplace: () => handlePickLicenseSide('licenseVerso'),
              })
          : undefined,
      },
      {
        key: 'student-card',
        title: 'Carte étudiant',
        subtitle: 'Carte liée à ton profil',
        icon: 'graduationcap.fill',
        hasDocument: Boolean(studentCard?.uri),
        statusText: studentCard ? 'Enregistrée' : undefined,
        onPreview: studentCard
          ? () =>
              openPreview({
                title: 'Carte étudiant',
                url: studentCard.uri,
                sideKey: 'studentCard',
              })
          : undefined,
      },
    ];
  }, [handlePickLicenseSide, licenseRecto, licenseVerso, loadingDocument, openPreview, studentCard]);

  useEffect(() => {
    if (!plateTouched) {
      setPlateValue(formatPlateInput(security?.vehicle.plate ?? ''));
    }
  }, [security?.vehicle.plate, plateTouched]);

  const isLicenseReady = Boolean(licenseRecto?.uri && licenseVerso?.uri);
  const missingItems = useMemo(() => {
    const items: string[] = [];
    if (!isLicenseReady) items.push('le permis');
    if (!vehicleConfirmed) items.push('la confirmation de ton véhicule');
    return items;
  }, [isLicenseReady, vehicleConfirmed]);
  const readinessMessage = missingItems.length
    ? `Complète ${missingItems.join(', ')}`
    : 'Tous les documents sont prêts pour activer le mode conducteur.';
  const canFinish = isLicenseReady && vehicleConfirmed;

  const handleConfirmPlate = useCallback(async () => {
    if (!session.email) return;
    setPlateError(null);
    const cleaned = plateValue.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const plateIsValid = /^[A-Z0-9]{7}$/.test(cleaned);
    if (!cleaned || !plateIsValid) {
      setPlateError('Plaque invalide. Exemple : 1-ABC-123');
      return;
    }
    const formattedPlate = formatPlateInput(cleaned);
    const expiryLabel = security?.licenseExpiryLabel ?? null;
    if (expiryLabel && !isExpiryValid(expiryLabel)) {
      Alert.alert('Date manquante', 'Vérifie la date d’expiration dans tes documents.');
      return;
    }
    setIsConfirmingPlate(true);
    try {
      await updateVehicleInfo(session.email, {
        plate: formattedPlate,
        licenseExpiryLabel: expiryLabel ?? undefined,
      });
      setPlateTouched(false);
      setPlateValue(formattedPlate);
      setVehicleConfirmed(true);
    } catch (error) {
      console.warn('vehicle update failed', error);
      Alert.alert('Erreur', 'Impossible d’enregistrer ta plaque pour le moment.');
    } finally {
      setIsConfirmingPlate(false);
    }
  }, [plateValue, security?.licenseExpiryLabel, session.email]);

  const runFinish = useCallback(async () => {
    setFinishError(null);
    if (!session.email) return;
    setIsFinishing(true);
    try {
      const success = await updateRoles({ driver: true });
      if (success) {
        Auth.setRoleMode('driver');
        router.replace('/');
      }
    } catch (error) {
      console.warn('driver verification finishing failed', error);
      setFinishError('Impossible d’activer le mode conducteur pour le moment.');
    } finally {
      setIsFinishing(false);
    }
  }, [router, session.email, updateRoles]);

  const handleFinish = useCallback(() => {
    if (isFinishing) return;
    setFinishError(null);
    if (!canFinish) {
      Alert.alert('Complète d’abord les informations du véhicule.');
      setFinishError('Complète d’abord les informations du véhicule.');
      return;
    }
    runFinish();
  }, [canFinish, isFinishing, runFinish]);

  return (
    <GradientBackground colors={backgroundColors} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topBar}>
            <HeaderBackButton onPress={() => router.push('/profile')} />
            <Text style={styles.topBarTitle}>Vérification conducteur</Text>
          </View>

          <View style={styles.headerCard}>
            <View style={styles.headerIcon}>
              <IconSymbol name="shield.fill" size={22} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>Sécurité conducteur</Text>
            <Text style={styles.headerTag}>
              {isVerifiedDriver ? 'Sécurité validée' : 'Action requise'}
            </Text>
            <Text style={styles.headerDescription}>
              {isVerifiedDriver
                ? 'Tes documents sont validés. Tu peux publier des trajets.'
                : 'CampusRide vérifie l’identité des conducteurs, leurs documents et un selfie récent. Complète les étapes ci-dessous pour activer le mode conducteur.'}
            </Text>
          </View>

          <View style={[styles.card, styles.documentsCard]}>
            <Text style={styles.sectionTitle}>Permis de conduire</Text>
            {documentRows.map((doc) => (
              <DocumentRow
                key={doc.key}
                title={doc.title}
                subtitle={doc.subtitle}
                icon={doc.icon}
                hasDocument={doc.hasDocument}
                statusText={doc.statusText}
                actionLoading={doc.actionLoading}
                onAdd={doc.onAdd}
                onPreview={doc.onPreview}
              />
            ))}
          </View>

          <View style={[styles.card, styles.vehicleCard]}>
            <Text style={styles.sectionTitle}>Véhicule</Text>
            <Text style={styles.sectionSubtitle}>Indique la plaque de ton véhicule</Text>
            <TextInput
              style={styles.vehicleInput}
              placeholder="Plaque (ex: 0-ABC-123)"
              value={plateValue}
              onChangeText={(value) => {
                setPlateTouched(true);
                setPlateValue(formatPlateInput(value));
              }}
            />
            <Pressable
              style={[
                styles.confirmButton,
                (isConfirmingPlate || !plateValue.trim()) && styles.confirmButtonDisabled,
              ]}
              onPress={handleConfirmPlate}
              disabled={isConfirmingPlate || !plateValue.trim()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              android_ripple={{ color: '#fff' }}
            >
              {isConfirmingPlate ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmButtonLabel}>Confirmer ma plaque</Text>
              )}
            </Pressable>
          </View>

          {!isVerifiedDriver ? (
            <>
              <Text style={styles.noteText}>Documents envoyés. Vérification en cours par CampusRide.</Text>
              <GradientButton
                title="Terminer"
                onPress={handleFinish}
                disabled={!canFinish || isFinishing}
                fullWidth
                style={styles.finishButton}
              />
              <Text style={styles.finishHint}>{finishError ?? readinessMessage}</Text>
            </>
          ) : (
            <Text style={styles.finishHint}>Tu as déjà vérifié tes documents conducteur.</Text>
          )}
        </ScrollView>
        <Modal visible={Boolean(preview)} animationType="fade" transparent>
          <View style={styles.previewOverlay}>
            <View style={styles.previewContent}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>{preview?.title}</Text>
                <Pressable onPress={closePreview} style={styles.previewClose}>
                  <IconSymbol name="xmark" size={20} color={Colors.gray700} />
                </Pressable>
              </View>
              <View style={styles.previewBody}>
                {loadingPreview && <ActivityIndicator color={Colors.primary} size="large" />}
                {preview?.url ? (
                  <Image
                    source={{ uri: preview.url }}
                    style={styles.previewImage}
                    resizeMode="contain"
                    onLoadEnd={() => setLoadingPreview(false)}
                  />
                ) : (
                  <Text style={styles.previewError}>Aucun document disponible.</Text>
                )}
              </View>
              {preview?.onReplace ? (
                <Pressable
                  style={styles.previewReplaceButton}
                  onPress={preview.onReplace}
                  disabled={loadingDocument === preview.sideKey}
                  android_ripple={{ color: Colors.primaryLight }}
                >
                  {loadingDocument === preview.sideKey ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.previewReplaceLabel}>Remplacer</Text>
                  )}
                </Pressable>
              ) : null}
              <Pressable style={styles.previewCloseButton} onPress={closePreview}>
                <Text style={styles.previewCloseLabel}>Fermer</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  headerCard: {
    borderRadius: 24,
    padding: Spacing.lg,
    backgroundColor: '#FFF4F0',
    gap: Spacing.sm,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF7358',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink,
  },
  headerTag: {
    color: Colors.danger,
    fontWeight: '700',
  },
  headerDescription: {
    color: Colors.gray600,
    lineHeight: 20,
  },
  card: {
    borderRadius: 24,
    padding: Spacing.lg,
    backgroundColor: '#fff',
    gap: Spacing.md,
    ...Shadows.card,
  },
  documentsCard: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.gray500,
  },
  vehicleCard: {
    gap: Spacing.sm,
  },
  vehicleInput: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 16,
    padding: Spacing.sm,
    fontSize: 15,
    color: Colors.ink,
    backgroundColor: '#FAFAFB',
  },
  confirmButton: {
    marginTop: Spacing.sm,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: Colors.accent,
  },
  confirmButtonDisabled: {
    opacity: 0.65,
  },
  confirmButtonLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  noteText: {
    color: Colors.success,
    fontWeight: '600',
    textAlign: 'center',
  },
  finishButton: {
    marginTop: Spacing.sm,
  },
  finishHint: {
    color: Colors.gray500,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  previewContent: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: '#fff',
    overflow: 'hidden',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  previewClose: {
    padding: Spacing.xs,
  },
  previewBody: {
    width: '100%',
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5FB',
    borderRadius: 18,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewReplaceButton: {
    alignSelf: 'stretch',
    backgroundColor: Colors.accent,
    borderRadius: Radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  previewReplaceLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  previewCloseButton: {
    alignSelf: 'stretch',
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  previewCloseLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  previewError: {
    color: Colors.gray500,
    textAlign: 'center',
  },
});

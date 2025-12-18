import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Colors, Radius, Spacing } from '@/app/ui/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useDriverSecurity } from '@/hooks/use-driver-security';
import { pickKycImage } from '@/app/utils/image-picker';
import { updateDriverLicense, updateVehicleInfo } from '@/app/services/security';
import { saveDriverDocuments } from '@/src/firestoreUsers';
import { uploadDriverLicenseSide } from '@/src/storageUploads';

const BELGIAN_PLATE_PATTERN = /^[A-Z0-9][A-Z0-9]{3}[A-Z0-9]{3}$/;

export default function DriverVerificationScreen() {
  const session = useAuthSession();
  const security = useDriverSecurity(session.email);
  const [uploadingSide, setUploadingSide] = useState<'front' | 'back' | null>(null);
  const [vehiclePlate, setVehiclePlate] = useState('');
  const lastFrontRef = useRef<string | null>(null);
  const lastBackRef = useRef<string | null>(null);

  const cleanedPlate = useMemo(
    () => vehiclePlate.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
    [vehiclePlate]
  );
  const belgianPlatePattern = useMemo(() => /^[A-Z0-9][A-Z0-9]{3}[A-Z0-9]{3}$/, []);

  const onVehiclePlateChange = (value: string) => {
    const cleaned = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    let formatted = cleaned;
    if (cleaned.length > 4) {
      formatted = `${cleaned.slice(0, 1)}-${cleaned.slice(1, 4)}-${cleaned.slice(4, 7)}`;
    } else if (cleaned.length > 1) {
      formatted = `${cleaned.slice(0, 1)}-${cleaned.slice(1)}`;
    }
    setVehiclePlate(formatted);
  };

  const runLicenseImport = useCallback(
    async (side: 'front' | 'back', source: 'files' | 'gallery') => {
      if (!session.email) return;
      setUploadingSide(side);
      try {
        const uri = await pickKycImage(source, 'driver-license');
        if (!uri) return;
        const otherSideUrl =
          side === 'front'
            ? lastBackRef.current ?? security?.driverLicenseBackUrl
            : lastFrontRef.current ?? security?.driverLicenseFrontUrl;
        if (otherSideUrl && otherSideUrl.trim() === uri.trim()) {
          Alert.alert('Attention', 'Tu ne peux pas utiliser la même photo pour le recto et le verso.');
          return;
        }
        const uploadedUrl = await uploadDriverLicenseSide({
          email: session.email,
          side,
          uri,
        });
        updateDriverLicense(session.email, { side, url: uploadedUrl });
        await saveDriverDocuments(session.email, {
          [side === 'front' ? 'driverLicenseFrontUrl' : 'driverLicenseBackUrl']: uploadedUrl,
        });
        if (side === 'front') {
          lastFrontRef.current = uri;
        } else {
          lastBackRef.current = uri;
        }
        Alert.alert('Permis importé', 'Ton permis est en cours de vérification.');
      } catch (error) {
        Alert.alert('Import impossible', "Nous n'avons pas pu ajouter ton permis. Réessaie.");
      } finally {
        setUploadingSide(null);
      }
    },
    [security?.driverLicenseBackUrl, security?.driverLicenseFrontUrl, session.email]
  );

  const handleUploadLicense = (side: 'front' | 'back') => {
    if (uploadingSide) return;
    if (Platform.OS === 'web') {
      void runLicenseImport(side, 'files');
      return;
    }

    const openFiles = () => void runLicenseImport(side, 'files');
    const openGallery = () => void runLicenseImport(side, 'gallery');

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

    Alert.alert('Importer ton permis', 'Choisis la source de ta photo.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Mes fichiers', onPress: openFiles },
      { text: 'Ma galerie', onPress: openGallery },
    ]);
  };

  const handleAddVehicle = () => {
    if (!session.email) return;
    const normalized = cleanedPlate;
    if (!BELGIAN_PLATE_PATTERN.test(normalized)) {
      Alert.alert(
        'Format invalide',
        'Format attendu : 1-ABC-123 (3 blocs alphanumériques).'
      );
      return;
    }
    const formatted = `${normalized.slice(0, 1)}-${normalized.slice(1, 4)}-${normalized.slice(4)}`;
    updateVehicleInfo(session.email, { plate: formatted });
    Alert.alert('Véhicule enregistré', 'Ta plaque a été sauvegardée.');
    router.replace('/account-complete');
  };

  const hasLicenseFront = !!security?.driverLicenseFrontUrl;
  const hasLicenseBack = !!security?.driverLicenseBackUrl;
  const licenseComplete = hasLicenseFront && hasLicenseBack;

  useEffect(() => {
    if (security?.vehicle.plate) {
      setVehiclePlate(security.vehicle.plate);
    }
  }, [security?.vehicle.plate]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.replace('/profile-welcome')} hitSlop={12}>
            <IconSymbol name="chevron.left" size={26} color={Colors.primary} />
          </Pressable>
          <Text style={styles.topBarTitle}>Vérification conducteur</Text>
        </View>

        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <IconSymbol name="shield.fill" size={22} color="#fff" />
          </View>
          <Text style={styles.headerTitle}>Sécurité conducteur</Text>
          <Text style={styles.headerTag}>Action requise</Text>
          <Text style={styles.headerDescription}>
            CampusRide vérifie l’identité des conducteurs, leur véhicule et un selfie récent.
            Complète les étapes ci-dessous pour publier tes trajets en toute sérénité.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Image source={require('@/assets/images/icon-license.png')} style={styles.cardIconImage} />
            </View>
            <View style={styles.cardTexts}>
              <Text style={styles.cardTitle}>Permis de conduire</Text>
              <Text style={styles.cardSubtitle}>Téléverse ton permis (recto + verso)</Text>
              <View style={styles.licenseUploads}>
                <View style={styles.licenseRow}>
                  <View style={styles.licenseRowInfo}>
                    <Text style={styles.licenseRowLabel}>Recto</Text>
                    {hasLicenseFront ? (
                      <View style={styles.licenseBadge}>
                        <Text style={styles.licenseBadgeText}>V</Text>
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    style={[
                      styles.cardButton,
                      styles.licenseButton,
                      uploadingSide === 'front' && styles.cardButtonDisabled,
                    ]}
                    onPress={() => handleUploadLicense('front')}
                    disabled={uploadingSide === 'front'}
                  >
                    {uploadingSide === 'front' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.cardButtonLabel}>
                        {hasLicenseFront ? 'Remplacer' : 'Importer recto'}
                      </Text>
                    )}
                  </Pressable>
                </View>
                <View style={styles.licenseRow}>
                  <View style={styles.licenseRowInfo}>
                    <Text style={styles.licenseRowLabel}>Verso</Text>
                    {hasLicenseBack ? (
                      <View style={styles.licenseBadge}>
                        <Text style={styles.licenseBadgeText}>V</Text>
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    style={[
                      styles.cardButton,
                      styles.licenseButton,
                      uploadingSide === 'back' && styles.cardButtonDisabled,
                    ]}
                    onPress={() => handleUploadLicense('back')}
                    disabled={uploadingSide === 'back'}
                  >
                    {uploadingSide === 'back' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.cardButtonLabel}>
                        {hasLicenseBack ? 'Remplacer' : 'Importer verso'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.card, styles.cardSpacer]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Image source={require('@/assets/images/icon-car.png')} style={styles.cardIconImage} />
            </View>
            <View style={styles.cardTexts}>
              <Text style={styles.cardTitle}>Véhicule</Text>
              <Text style={styles.cardSubtitle}>Indique la plaque de ton véhicule</Text>
            </View>
          </View>
          {licenseComplete ? (
            <View style={styles.vehicleForm}>
              <TextInput
                placeholder="Ex : 2-GXH-231"
                value={vehiclePlate}
                onChangeText={onVehiclePlateChange}
                style={styles.vehicleInput}
                autoCapitalize="characters"
                placeholderTextColor={Colors.gray400}
              />
              <Pressable style={styles.cardButton} onPress={handleAddVehicle}>
                <Text style={styles.cardButtonLabel}>Confirmer ma plaque</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.vehicleHint}>Importe d'abord le recto et le verso du permis.</Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
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
    color: Colors.ink,
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
    backgroundColor: '#F4EFFF',
    gap: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(122,95,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconImage: { width: 32, height: 32, resizeMode: 'contain' },
  cardTexts: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.ink,
  },
  cardSubtitle: {
    color: Colors.gray600,
    fontSize: 13,
  },
  licenseUploads: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  licenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  licenseRowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  licenseRowLabel: {
    fontWeight: '700',
    color: Colors.ink,
  },
  licenseBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  licenseBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  cardButton: {
    marginTop: Spacing.sm,
    backgroundColor: '#FF9353',
    borderRadius: Radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  licenseButton: {
    marginTop: 0,
    paddingHorizontal: Spacing.md,
    flexBasis: 160,
  },
  cardButtonDisabled: {
    opacity: 0.6,
  },
  cardButtonLabel: {
    color: '#fff',
    fontWeight: '800',
  },
  cardSpacer: {
    marginTop: Spacing.lg,
  },
  vehicleHint: {
    color: Colors.gray500,
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  vehicleForm: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  vehicleInput: {
    borderWidth: 1,
    borderColor: 'rgba(122,95,255,0.4)',
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: Colors.ink,
    backgroundColor: '#fff',
  },
});

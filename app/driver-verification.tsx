import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuthSession } from '@/hooks/use-auth-session';
import { useDriverSecurity } from '@/hooks/use-driver-security';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Spacing, Typography } from '@/app/ui/theme';
import {
  captureSelfie,
  pickKycImage,
  pickVehicleImage,
  type KycDocumentType,
} from '@/app/utils/image-picker';
import {
  getNextSelfieLabel,
  recordSelfie,
  updateDriverLicense,
  updateVehicleInfo,
} from '@/app/services/security';
import {
  getSampleKycImage,
  getSampleSelfieImage,
  getSampleVehicleImage,
} from '@/app/utils/sample-images';

const C = Colors;

const SectionTitle = ({ title, description }: { title: string; description?: string }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {description ? <Text style={styles.sectionSubtitle}>{description}</Text> : null}
  </View>
);

const DocumentThumbnail = ({
  uri,
  placeholder,
}: {
  uri: string | null | undefined;
  placeholder: string;
}) => (
  <View style={styles.thumbWrapper}>
    {uri ? (
      <Image source={{ uri }} style={styles.thumbImage} />
    ) : (
      <View style={styles.thumbPlaceholder}>
        <IconSymbol name="camera.fill" size={20} color={C.primary} />
        <Text style={styles.thumbPlaceholderText}>{placeholder}</Text>
      </View>
    )}
  </View>
);

const StatusRow = ({
  label,
  done,
  description,
}: {
  label: string;
  done: boolean;
  description?: string;
}) => (
  <View style={styles.statusRow}>
    <View style={[styles.statusBullet, { backgroundColor: done ? C.success : C.warning }]}>
      <IconSymbol
        name={done ? 'checkmark.seal.fill' : 'exclamationmark.triangle'}
        color="#fff"
        size={16}
      />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.statusLabel}>{label}</Text>
      {description ? <Text style={styles.statusDescription}>{description}</Text> : null}
    </View>
  </View>
);

const formatPlate = (value: string) =>
  value
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .replace(/(.{1,3})(?=.)/g, '$1 ')
    .trim();

export default function DriverVerificationScreen() {
  const session = useAuthSession();
  const security = useDriverSecurity(session.email);

  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePhoto, setVehiclePhoto] = useState<string | null>(null);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [uploadingLicense, setUploadingLicense] = useState(false);
  const [uploadingVehiclePhoto, setUploadingVehiclePhoto] = useState(false);
  const [capturingSelfieState, setCapturingSelfieState] = useState(false);

  useEffect(() => {
    if (!security) return;
    setVehiclePlate(security.vehicle.plate ?? '');
    setVehicleBrand(security.vehicle.brand ?? '');
    setVehicleModel(security.vehicle.model ?? '');
    setVehicleColor(security.vehicle.color ?? '');
    setVehiclePhoto(security.vehicle.photoUrl ?? null);
  }, [security, security?.vehicle.updatedAt]);

  const statusItems = useMemo(
    () => [
      {
        key: 'identity',
        label: 'Identité étudiante vérifiée',
        done: !!session.idCardUrl && !!session.studentCardUrl,
        description: 'Carte d’identité et carte étudiante ajoutées.',
      },
      {
        key: 'license',
        label: 'Permis de conduire valide',
        done: !!security?.driverLicenseUrl,
        description: security?.licenseUploadedAt
          ? `Téléversé le ${new Date(security.licenseUploadedAt).toLocaleDateString('fr-BE')}`
          : undefined,
      },
      {
        key: 'vehicle',
        label: 'Véhicule confirmé',
        done:
          !!security?.vehicle.plate &&
          !!security.vehicle.brand &&
          !!security.vehicle.photoUrl,
        description:
          security?.vehicle.plate && security.vehicle.brand
            ? `${security.vehicle.brand}${security.vehicle.model ? ` • ${security.vehicle.model}` : ''
              }`
            : undefined,
      },
      {
        key: 'selfie',
        label: 'Selfie récent',
        done: !!security && !security.blockers.requiresSelfie,
        description: security?.selfieCapturedAt
          ? `Réalisé le ${new Date(security.selfieCapturedAt).toLocaleString('fr-BE')}`
          : 'Exigé avant de publier un trajet.',
      },
    ],
    [security, session.idCardUrl, session.studentCardUrl]
  );

  const onUploadKyc = async (type: KycDocumentType) => {
    if (!session.email) return;
    setUploadingLicense(true);
    try {
      const uri = await pickKycImage('files', type);
      if (!uri) return;
      if (type === 'driver-license') {
        updateDriverLicense(session.email, uri);
        Alert.alert('Permis importé', 'Ton permis est en cours de vérification.');
      }
    } finally {
      setUploadingLicense(false);
    }
  };

  const onUploadVehiclePhoto = async () => {
    if (!session.email) return;
    setUploadingVehiclePhoto(true);
    try {
      const uri = await pickVehicleImage('files');
      if (!uri) return;
      const defaultPlate = vehiclePlate || '1ABC234';
      const defaultBrand = vehicleBrand || 'CampusRide';
      const defaultModel = vehicleModel || 'Demo';
      const defaultColor = vehicleColor || 'Bleu';
      setVehiclePlate(defaultPlate);
      setVehicleBrand(defaultBrand);
      setVehicleModel(defaultModel);
      setVehicleColor(defaultColor);
      setVehiclePhoto(uri);
      updateVehicleInfo(session.email, {
        plate: defaultPlate,
        brand: defaultBrand,
        model: defaultModel,
        color: defaultColor,
        photoUrl: uri,
      });
      Alert.alert('Photo enregistrée', 'La photo du véhicule a été ajoutée.');
    } finally {
      setUploadingVehiclePhoto(false);
    }
  };

  const onSaveVehicle = () => {
    if (!session.email) return;
    const plate = vehiclePlate.trim();
    if (!plate || plate.length < 6) {
      Alert.alert('Plaque incomplète', 'Ajoute une plaque complète (min. 6 caractères).');
      return;
    }
    if (!vehicleBrand) {
      Alert.alert('Marque requise', 'Indique la marque de ton véhicule.');
      return;
    }
    if (!vehicleModel) {
      Alert.alert('Modèle requis', 'Indique le modèle pour aider les passagers à identifier la voiture.');
      return;
    }
    setSavingVehicle(true);
    try {
      updateVehicleInfo(session.email, {
        plate,
        brand: vehicleBrand,
        model: vehicleModel,
        color: vehicleColor,
      });
      Alert.alert('Véhicule enregistré', 'Ta voiture a été associée à ton profil conducteur.');
    } finally {
    setSavingVehicle(false);
    }
  };

  const onCaptureSelfie = async () => {
    if (!session.email) return;
    setCapturingSelfieState(true);
    try {
      const uri = await captureSelfie();
      if (uri && session.email) {
        recordSelfie(session.email, uri);
        Alert.alert('Selfie validé', 'Merci ! Tu peux à présent publier tes trajets.');
      }
    } finally {
      setCapturingSelfieState(false);
    }
  };

  const applySampleLicense = () => {
    if (!session.email) return;
    const sample = getSampleKycImage('driver-license');
    updateDriverLicense(session.email, sample);
    Alert.alert('Permis ajouté', 'Un exemple de permis a été appliqué. Remplace-le quand tu seras prêt.');
  };

  const applySampleVehicle = () => {
    if (!session.email) return;
    const sample = getSampleVehicleImage();
    const defaultPlate = vehiclePlate || '1ABC234';
    const defaultBrand = vehicleBrand || 'CampusRide';
    const defaultModel = vehicleModel || 'Demo';
    const defaultColor = vehicleColor || 'Bleu';
    setVehiclePlate(defaultPlate);
    setVehicleBrand(defaultBrand);
    setVehicleModel(defaultModel);
    setVehicleColor(defaultColor);
    setVehiclePhoto(sample);
    updateVehicleInfo(session.email, {
      plate: defaultPlate,
      brand: defaultBrand,
      model: defaultModel,
      color: defaultColor,
      photoUrl: sample,
    });
    Alert.alert('Véhicule prérempli', 'Les informations de démonstration ont été enregistrées.');
  };

  const applySampleSelfie = () => {
    if (!session.email) return;
    const sample = getSampleSelfieImage();
    recordSelfie(session.email, sample);
    Alert.alert('Selfie ajouté', 'Un selfie de démonstration est enregistré.');
  };

  const verificationLabel = useMemo(() => {
    switch (security?.verificationStatus) {
      case 'verified':
        return 'Vérification complète';
      case 'pending':
        return 'Selfie requis';
      default:
        return 'Action requise';
    }
  }, [security?.verificationStatus]);

  const verificationColor = useMemo(() => {
    switch (security?.verificationStatus) {
      case 'verified':
        return C.success;
      case 'pending':
        return C.warning;
      default:
        return C.danger;
    }
  }, [security?.verificationStatus]);

  return (
    <AppBackground style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <GradientBackground colors={Gradients.card} style={styles.summaryCard}>
          <Pressable onPress={() => router.back()} style={styles.backRow} accessibilityRole="button">
            <IconSymbol name="chevron.left.forwardslash.chevron.right" size={14} color={C.primary} />
            <Text style={styles.backText}>Retour</Text>
          </Pressable>
          <View style={styles.summaryHeader}>
            <IconSymbol name="shield.checkerboard" size={28} color={verificationColor} />
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>Sécurité conducteur</Text>
              <Text style={[styles.summaryBadge, { color: verificationColor }]}>{verificationLabel}</Text>
            </View>
          </View>
          <Text style={styles.summaryParagraph}>
            CampusRide vérifie l’identité des conducteurs, leur véhicule et un selfie récent.
            Complète les étapes ci-dessous pour publier tes trajets en toute sérénité.
          </Text>
          <View style={styles.statusList}>
            {statusItems.map((item) => (
              <StatusRow key={item.key} label={item.label} done={item.done} description={item.description} />
            ))}
          </View>
          {security?.nextSelfieDueAt ? (
            <Text style={styles.nextSelfie}>
              Prochain selfie requis avant le {getNextSelfieLabel(security)}.
            </Text>
          ) : null}
        </GradientBackground>

        <GradientBackground colors={Gradients.card} style={styles.sectionCard}>
          <SectionTitle
            title="Permis de conduire"
            description="Importe une photo nette recto-verso. Formats JPG ou PNG acceptés."
          />
          <DocumentThumbnail
            uri={security?.driverLicenseUrl}
            placeholder="Pas encore ajouté"
          />
          <GradientButton
            title={security?.driverLicenseUrl ? 'Mettre à jour ton permis' : 'Importer ton permis'}
            onPress={() => onUploadKyc('driver-license')}
            disabled={uploadingLicense}
            style={styles.cardButton}
          >
            {uploadingLicense ? <ActivityIndicator color="#fff" /> : null}
          </GradientButton>
          <GradientButton
            title="Utiliser un permis de démonstration"
            onPress={applySampleLicense}
            size="sm"
            variant="lavender"
            style={styles.cardButton}
          />
        </GradientBackground>

        <GradientBackground colors={Gradients.card} style={styles.sectionCard}>
          <SectionTitle
            title="Véhicule"
            description="Tes passagers verront ces informations avant de monter à bord."
          />
          <View style={styles.formRow}>
            <Text style={styles.label}>Plaque d’immatriculation</Text>
            <TextInput
              value={formatPlate(vehiclePlate)}
              onChangeText={(value) => setVehiclePlate(value.replace(/\s+/g, '').toUpperCase())}
              autoCapitalize="characters"
              placeholder="Ex. 1ABC234"
              style={styles.input}
              maxLength={9}
            />
          </View>
          <View style={styles.formRow}>
            <Text style={styles.label}>Marque</Text>
            <TextInput
              value={vehicleBrand}
              onChangeText={setVehicleBrand}
              placeholder="Ex. Tesla"
              style={styles.input}
            />
          </View>
          <View style={styles.formRow}>
            <Text style={styles.label}>Modèle</Text>
            <TextInput
              value={vehicleModel}
              onChangeText={setVehicleModel}
              placeholder="Ex. Model 3"
              style={styles.input}
            />
          </View>
          <View style={styles.formRow}>
            <Text style={styles.label}>Couleur (facultatif)</Text>
            <TextInput
              value={vehicleColor}
              onChangeText={setVehicleColor}
              placeholder="Ex. Bleu nuit"
              style={styles.input}
            />
          </View>
          <Text style={styles.label}>Photo du véhicule</Text>
          <DocumentThumbnail
            uri={vehiclePhoto}
            placeholder="Ajoute une photo du véhicule"
          />
          <GradientButton
            title={vehiclePhoto ? 'Mettre à jour la photo du véhicule' : 'Importer la photo du véhicule'}
            onPress={onUploadVehiclePhoto}
            disabled={uploadingVehiclePhoto}
            style={styles.cardButton}
          >
            {uploadingVehiclePhoto ? <ActivityIndicator color="#fff" /> : null}
          </GradientButton>
          <GradientButton
            title="Préremplir avec un exemple"
            onPress={applySampleVehicle}
            size="sm"
            variant="lavender"
            style={styles.cardButton}
          />
          <GradientButton
            title="Enregistrer le véhicule"
            onPress={onSaveVehicle}
            disabled={savingVehicle}
            variant="cta"
            style={styles.cardButton}
          >
            {savingVehicle ? <ActivityIndicator color="#fff" /> : null}
          </GradientButton>
        </GradientBackground>

        <GradientBackground colors={Gradients.card} style={styles.sectionCard}>
          <SectionTitle
            title="Selfie de vérification"
            description="Capture un selfie à la lumière du jour pour confirmer que tu es le conducteur."
          />
          <DocumentThumbnail
            uri={security?.selfieUrl}
            placeholder="Prends un selfie depuis l’appareil photo"
          />
          <GradientButton
            title={capturingSelfieState ? 'Capture en cours…' : 'Prendre un selfie de vérification'}
            onPress={onCaptureSelfie}
            disabled={capturingSelfieState}
            style={styles.cardButton}
          >
            {capturingSelfieState ? <ActivityIndicator color="#fff" /> : null}
          </GradientButton>
          <GradientButton
            title="Utiliser un selfie de démonstration"
            onPress={applySampleSelfie}
            size="sm"
            variant="lavender"
            style={styles.cardButton}
          />
        </GradientBackground>

        <View style={styles.footer}>
          <GradientButton
            title="Retour à mon profil"
            onPress={() => router.push('/(tabs)/profile')}
            variant="lavender"
          />
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  scroll: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xl,
  },
  summaryCard: {
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  backText: {
    color: C.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  summaryHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: Typography.heading.fontWeight,
    color: C.ink,
  },
  summaryBadge: {
    fontSize: 13,
    fontWeight: '700',
  },
  summaryParagraph: {
    color: C.gray600,
    lineHeight: 18,
    fontSize: 13,
  },
  statusList: {
    gap: Spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  statusBullet: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    color: C.ink,
    fontWeight: '700',
    fontSize: 14,
  },
  statusDescription: {
    color: C.gray600,
    fontSize: 12,
    marginTop: 4,
  },
  nextSelfie: {
    marginTop: Spacing.sm,
    color: C.gray600,
    fontSize: 12,
  },
  sectionCard: {
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.ink,
  },
  sectionSubtitle: {
    color: C.gray600,
    fontSize: 13,
  },
  thumbWrapper: {
    height: 160,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.gray200,
    backgroundColor: 'rgba(255,255,255,0.75)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
  },
  thumbPlaceholderText: {
    color: C.gray500,
    fontSize: 12,
    textAlign: 'center',
  },
  cardButton: {
    alignSelf: 'flex-start',
  },
  formRow: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: C.gray600,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: Radius.md,
    padding: Spacing.md,
    backgroundColor: C.gray100,
    fontSize: 15,
    color: C.ink,
  },
  footer: {
    alignItems: 'center',
  },
});

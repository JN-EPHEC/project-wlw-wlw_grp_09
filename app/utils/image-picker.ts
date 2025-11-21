import { Alert, Platform } from 'react-native';
let ImagePicker: typeof import('expo-image-picker') | null = null;
let DocumentPicker: typeof import('expo-document-picker') | null = null;
let FileSystem: typeof import('expo-file-system') | null = null;

const ensureModules = async () => {
  if (!ImagePicker) {
    try {
      ImagePicker = await import('expo-image-picker');
    } catch (error) {
      console.warn('expo-image-picker est requis pour sélectionner une photo.');
      Alert.alert(
        'Module manquant',
        "Le module 'expo-image-picker' n’est pas installé. Exécute `npx expo install expo-image-picker`."
      );
      throw error;
    }
  }
  if (!DocumentPicker) {
    try {
      DocumentPicker = await import('expo-document-picker');
    } catch (error) {
      console.warn('expo-document-picker est requis pour importer un fichier.');
      Alert.alert(
        'Module manquant',
        "Le module 'expo-document-picker' n’est pas installé. Exécute `npx expo install expo-document-picker`."
      );
      throw error;
    }
  }
  if (!FileSystem) {
    try {
      FileSystem = await import('expo-file-system');
    } catch (error) {
      console.warn('expo-file-system est requis pour stocker les images.');
      Alert.alert(
        'Module manquant',
        "Le module 'expo-file-system' n’est pas installé. Exécute `npx expo install expo-file-system`."
      );
      throw error;
    }
  }
};

const getFileSystem = async () => {
  await ensureModules();
  return FileSystem!;
};

const ensureDir = async (folder: string) => {
  const FS = await getFileSystem();
  if (!FS.documentDirectory) return;
  const dir = `${FS.documentDirectory}${folder}/`;
  const info = await FS.getInfoAsync(dir);
  if (!info.exists) {
    await FS.makeDirectoryAsync(dir, { intermediates: true });
  }
};

const cleanExtension = (uri: string) => {
  const sanitized = uri.split('?')[0]?.split('#')[0] ?? '';
  const ext = sanitized.split('.').pop();
  if (!ext || ext.length > 5) return 'jpg';
  return ext;
};

const copyAssetToDocuments = async (uri: string, folder: string, prefix: string) => {
  const FS = await getFileSystem();
  if (!FS.documentDirectory) return uri;
  await ensureDir(folder);
  const dir = `${FS.documentDirectory}${folder}/`;
  const extension = cleanExtension(uri);
  const fileName = `${prefix}-${Date.now()}.${extension}`;
  const dest = `${dir}${fileName}`;
  await FS.copyAsync({ from: uri, to: dest });
  return dest;
};

type GalleryOptions = {
  folder: string;
  prefix: string;
  allowsEditing?: boolean;
  aspect?: [number, number];
};

const pickFromGallery = async ({
  folder,
  prefix,
  allowsEditing = false,
  aspect,
}: GalleryOptions): Promise<string | null> => {
  try {
    await ensureModules();
  } catch {
    return null;
  }

  const permission = await ImagePicker!.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Autorisation requise',
      'Nous avons besoin d’accéder à ta galerie pour sélectionner la photo.'
    );
    return null;
  }

  const result = await ImagePicker!.launchImageLibraryAsync({
    mediaTypes: ImagePicker!.MediaTypeOptions.Images,
    allowsEditing,
    aspect,
    quality: 0.9,
    base64: false,
  });

  if (result.canceled || !result.assets.length) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset.uri) {
    Alert.alert('Import impossible', 'Nous n’avons pas pu récupérer cette image.');
    return null;
  }

  if (Platform.OS === 'web') {
    return asset.uri;
  }

  try {
    return await copyAssetToDocuments(asset.uri, folder, prefix);
  } catch {
    Alert.alert('Erreur', 'Impossible de sauvegarder la photo. Réessaie avec une autre image.');
    return null;
  }
};

type FilePickerOptions = {
  folder: string;
  prefix: string;
};

const pickFromFiles = async ({ folder, prefix }: FilePickerOptions): Promise<string | null> => {
  try {
    await ensureModules();
  } catch {
    return null;
  }

  try {
    const result: any = await DocumentPicker!.getDocumentAsync({
      type: ['image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (!result || result.type === 'cancel' || result.canceled) {
      return null;
    }

    const assetUri =
      Array.isArray(result.assets) && result.assets.length ? result.assets[0]?.uri : result.uri;

    if (!assetUri) {
      Alert.alert('Import impossible', 'Nous n’avons pas pu récupérer ce fichier.');
      return null;
    }

    if (Platform.OS === 'web') {
      return assetUri;
    }

    return await copyAssetToDocuments(assetUri, folder, prefix);
  } catch {
    Alert.alert('Erreur', 'Impossible d’importer ce fichier. Réessaie plus tard.');
    return null;
  }
};

export const pickProfileImage = async (): Promise<string | null> => {
  return pickFromGallery({
    folder: 'avatars',
    prefix: 'avatar',
    allowsEditing: true,
    aspect: [1, 1],
  });
};

export const pickProfileDocument = async (): Promise<string | null> => {
  return pickFromFiles({ folder: 'avatars', prefix: 'avatar' });
};

export const captureProfilePhoto = async (): Promise<string | null> => {
  try {
    await ensureModules();
  } catch {
    return null;
  }

  const permission = await ImagePicker!.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Autorisation requise',
      'Autorise l’appareil photo pour mettre à jour ta photo de profil.'
    );
    return null;
  }

  try {
    const result = await ImagePicker!.launchCameraAsync({
      mediaTypes: ImagePicker!.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: false,
      cameraType: ImagePicker!.CameraType.front,
      presentationStyle: ImagePicker!.UIImagePickerPresentationStyle?.FULL_SCREEN,
    });

    if (result.canceled || !result.assets.length) {
      return null;
    }

    const asset = result.assets[0];
    if (!asset.uri) {
      Alert.alert('Prise impossible', 'Nous n’avons pas pu récupérer cette photo.');
      return null;
    }

    return await copyAssetToDocuments(asset.uri, 'avatars', 'avatar');
  } catch (error) {
    console.warn('camera error, fallback to gallery', error);
    Alert.alert(
      'Caméra indisponible',
      'Impossible d’ouvrir la caméra. Sélectionne ta photo de profil depuis la galerie.'
    );
    return pickFromGallery({
      folder: 'avatars',
      prefix: 'avatar',
      allowsEditing: true,
      aspect: [1, 1],
    });
  }
};

export type KycDocumentType = 'id-card' | 'student-card' | 'driver-license';

export const pickKycImage = async (
  source: 'gallery' | 'files',
  type: KycDocumentType
): Promise<string | null> => {
  const folder = 'kyc';
  const prefix =
    type === 'id-card' ? 'id' : type === 'student-card' ? 'student' : 'license';
  if (source === 'gallery') {
    return pickFromGallery({ folder, prefix, allowsEditing: false });
  }
  return pickFromFiles({ folder, prefix });
};

export const pickVehicleImage = async (
  source: 'gallery' | 'files'
): Promise<string | null> => {
  const folder = 'vehicles';
  const prefix = 'vehicle';
  if (source === 'gallery') {
    return pickFromGallery({ folder, prefix, allowsEditing: false });
  }
  return pickFromFiles({ folder, prefix });
};

export const captureSelfie = async (): Promise<string | null> => {
  try {
    await ensureModules();
  } catch {
    return null;
  }

  const permission = await ImagePicker!.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Autorisation requise',
      'Autorise l’appareil photo pour prendre un selfie de vérification.'
    );
    return null;
  }

  try {
    const result = await ImagePicker!.launchCameraAsync({
      mediaTypes: ImagePicker!.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.9,
      base64: false,
      cameraType: ImagePicker!.CameraType.front,
      presentationStyle: ImagePicker!.UIImagePickerPresentationStyle?.FULL_SCREEN,
    });

    if (result.canceled || !result.assets.length) {
      return null;
    }

    const asset = result.assets[0];
    if (!asset.uri) {
      Alert.alert('Prise impossible', 'Nous n’avons pas pu récupérer cette photo.');
      return null;
    }

    return await copyAssetToDocuments(asset.uri, 'selfies', 'selfie');
  } catch (cameraError) {
    console.warn('Camera capture failed, falling back to gallery', cameraError);
    Alert.alert(
      'Caméra indisponible',
      'Impossible d’ouvrir la caméra. Sélectionne un selfie depuis ta galerie.'
    );
    return pickFromGallery({
      folder: 'selfies',
      prefix: 'selfie',
      allowsEditing: true,
      aspect: [3, 4],
    });
  }
};

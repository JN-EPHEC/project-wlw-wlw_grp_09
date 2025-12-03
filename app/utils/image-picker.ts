import { Alert, Platform } from 'react-native';

import { getSampleAvatarImage, getSampleKycImage } from '@/app/utils/sample-images';
let ImagePicker: typeof import('expo-image-picker') | null = null;
let DocumentPicker: typeof import('expo-document-picker') | null = null;
let FileSystem: typeof import('expo-file-system') | null = null;

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const PROFILE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic']);
const PROFILE_VALIDATION_ERROR = 'profile-photo-invalid';

const getAvatarFallback = () => {
  Alert.alert(
    'Photo simulée',
    'Impossible d’accéder à la caméra ou à la galerie depuis ce simulateur. Nous appliquons un avatar de test.'
  );
  return getSampleAvatarImage();
};

const pickFromWebInput = async (options?: { capture?: 'user' | 'environment' }): Promise<string | null> => {
  if (Platform.OS !== 'web') return null;
  const doc =
    typeof globalThis !== 'undefined' && 'document' in globalThis
      ? (globalThis as any).document
      : null;
  const Reader: typeof FileReader | null =
    typeof globalThis !== 'undefined' && 'FileReader' in globalThis
      ? (globalThis as any).FileReader
      : null;
  if (!doc || !Reader) {
    return null;
  }
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (options?.capture) {
      input.capture = options.capture;
    }
    input.style.display = 'none';
    doc.body?.appendChild(input);
    input.onchange = () => {
      const file = input.files && input.files[0];
      const cleanup = () => {
        input.value = '';
        doc.body?.removeChild(input);
      };
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }
      const reader = new Reader();
      reader.onload = () => {
        cleanup();
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => {
        cleanup();
        resolve(null);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
};

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
  if (folder === 'avatars') {
    try {
      await validateProfilePhoto(dest);
    } catch (error) {
      await FS.deleteAsync(dest, { idempotent: true });
      throw error;
    }
  }
  return dest;
};

const validateProfilePhoto = async (path: string) => {
  const FS = await getFileSystem();
  const extension = cleanExtension(path).toLowerCase();
  if (!PROFILE_FORMATS.has(extension)) {
    Alert.alert(
      'Format non supporté',
      'Choisis une image JPG, PNG ou WEBP pour ta photo de profil.'
    );
    throw new Error(PROFILE_VALIDATION_ERROR);
  }
  const info = await FS.getInfoAsync(path);
  if (info.exists && typeof info.size === 'number' && info.size > MAX_PROFILE_PHOTO_BYTES) {
    Alert.alert('Photo trop lourde', 'Sélectionne une image de moins de 5 Mo.');
    throw new Error(PROFILE_VALIDATION_ERROR);
  }
};

type GalleryOptions = {
  folder: string;
  prefix: string;
  allowsEditing?: boolean;
  aspect?: [number, number];
  fallback?: () => string | null;
};

const pickFromGallery = async ({
  folder,
  prefix,
  allowsEditing = false,
  aspect,
  fallback,
}: GalleryOptions): Promise<string | null> => {
  if (Platform.OS === 'web') {
    const webSelection = await pickFromWebInput();
    if (webSelection) return webSelection;
    return fallback?.() ?? null;
  }

  let modulesReady = true;
  try {
    await ensureModules();
  } catch {
    modulesReady = false;
  }

  if (!modulesReady) {
    return fallback?.() ?? null;
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
  } catch (error) {
    if (!(error instanceof Error && error.message === PROFILE_VALIDATION_ERROR)) {
      Alert.alert('Erreur', 'Impossible de sauvegarder la photo. Réessaie avec une autre image.');
    }
    return null;
  }
};

type FilePickerOptions = {
  folder: string;
  prefix: string;
  sampleType?: KycDocumentType;
  fallback?: () => string | null;
};

const pickFromFiles = async ({ folder, prefix, sampleType, fallback }: FilePickerOptions): Promise<string | null> => {
  const fallbackSample = () => {
    if (sampleType) {
      Alert.alert('Import simulé', 'Ton fichier a été importé pour continuer la vérification.');
      return getSampleKycImage(sampleType);
    }
    return fallback?.() ?? null;
  };

  if (Platform.OS === 'web') {
    const webSelection = await pickFromWebInput();
    if (webSelection) {
      return webSelection;
    }
    return fallbackSample();
  }

  try {
    await ensureModules();
  } catch {
    return fallbackSample();
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
  } catch (error) {
    if (!(error instanceof Error && error.message === PROFILE_VALIDATION_ERROR)) {
      Alert.alert('Erreur', 'Impossible d’importer ce fichier. Réessaie plus tard.');
    }
    return fallbackSample();
  }
};

export const pickProfileImage = async (): Promise<string | null> => {
  return pickFromGallery({
    folder: 'avatars',
    prefix: 'avatar',
    allowsEditing: true,
    aspect: [1, 1],
    fallback: getAvatarFallback,
  });
};

export const pickProfileDocument = async (): Promise<string | null> => {
  return pickFromFiles({ folder: 'avatars', prefix: 'avatar', fallback: getAvatarFallback });
};

export const captureProfilePhoto = async (): Promise<string | null> => {
  try {
    await ensureModules();
  } catch {
    const webSelection = await pickFromWebInput({ capture: 'user' });
    if (webSelection) return webSelection;
    return getAvatarFallback();
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
    if (error instanceof Error && error.message === PROFILE_VALIDATION_ERROR) {
      return null;
    }
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
  return pickFromFiles({ folder, prefix, sampleType: type });
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

export const persistAvatarImage = async (uri: string): Promise<string> => {
  if (!uri || uri.startsWith('data:')) {
    return uri;
  }
  return copyAssetToDocuments(uri, 'avatars', 'avatar');
};

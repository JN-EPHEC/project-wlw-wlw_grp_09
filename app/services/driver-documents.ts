import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { encryptFileUri, encryptStringPayload, type EncryptedPayload } from '@/app/utils/secure-cipher';
import { db } from '@/src/firebase';

const DEFAULT_ENDPOINT = 'https://us-central1-campusride-8b619.cloudfunctions.net/driverDocuments';
const DRIVER_DOCS_ENDPOINT = process.env.EXPO_PUBLIC_DRIVER_DOCS_URL ?? DEFAULT_ENDPOINT;

export type DriverDocumentType = 'license_front' | 'license_back' | 'vehicle_registration';
export type DriverDocumentState = 'missing' | 'pending' | 'approved' | 'rejected';

export type DriverDocumentRecord = {
  status: DriverDocumentState;
  storagePath: string | null;
  uploadedAt: number | null;
  metadata?: Record<string, any> | null;
};

export type DriverDocumentSnapshot = {
  email: string;
  documents: Record<string, DriverDocumentRecord>;
};

type UploadMetadata = {
  mimeType?: string;
  licenseExpiry?: string | null;
  plate?: string | null;
};

type UploadSource =
  | {
      uri: string;
      rawData?: never;
    }
  | {
      uri?: never;
      rawData: string;
    };

type UploadParams = UploadSource & {
  email: string;
  documentType: DriverDocumentType;
  metadata?: UploadMetadata;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

const DEFAULT_MIME = 'application/octet-stream';

const getMimeFromUri = (uri: string) => {
  const clean = uri.split('?')[0]?.split('#')[0] ?? '';
  const ext = clean.split('.').pop()?.toLowerCase();
  if (!ext) return DEFAULT_MIME;
  return MIME_BY_EXTENSION[ext] ?? DEFAULT_MIME;
};

const USERS_COLLECTION = collection(db, 'users');
type DocumentValue = string | { url?: string | null } | null | undefined;

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const findUserDocumentByEmail = async (email: string) => {
  const snapshot = await getDocs(
    query(USERS_COLLECTION, where('email', '==', email))
  );
  return snapshot.docs[0] ?? null;
};

const loadUserDocumentSnapshot = async (email: string, uid?: string) => {
  if (uid) {
    const explicitRef = doc(db, 'users', uid);
    const explicitSnap = await getDoc(explicitRef);
    if (explicitSnap.exists()) {
      return explicitSnap;
    }
  }
  return findUserDocumentByEmail(email);
};

const resolveDocumentUrl = (value: DocumentValue) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.url ?? null;
  }
  return null;
};

const buildDocumentRecord = (hasData: boolean, storagePath: string | null): DriverDocumentRecord => ({
  status: hasData ? 'pending' : 'missing',
  storagePath,
  uploadedAt: null,
  metadata: null,
});

const postJson = async (payload: Record<string, any>) => {
  const response = await fetch(DRIVER_DOCS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let message = `Erreur ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.error) {
        message = errorBody.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return response.json();
};

export const uploadDriverDocument = async (params: UploadParams) => {
  const email = normalizeEmail(params.email);
  if (!email) throw new Error('Adresse e-mail requise');
  let encryption: EncryptedPayload;
  if (params.uri) {
    encryption = await encryptFileUri(params.uri);
  } else if (params.rawData) {
    encryption = encryptStringPayload(params.rawData);
  } else {
    throw new Error('Source de document manquante.');
  }
  const mimeType = params.uri ? getMimeFromUri(params.uri) : 'application/json';
  const metadata = {
    ...(params.metadata ?? {}),
    mimeType,
    byteLength: encryption.byteLength,
  };
  return postJson({
    email,
    documentType: params.documentType,
    ciphertext: encryption.ciphertext,
    nonce: encryption.nonce,
    checksum: encryption.checksum,
    metadata,
  });
};

export const fetchDriverDocumentStatuses = async (
  email: string,
  uid?: string
): Promise<DriverDocumentSnapshot> => {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error('Adresse e-mail requise');
  }
  const snapshot = await loadUserDocumentSnapshot(normalized, uid);
  const payload = snapshot?.data() ?? null;
  const licenseFrontUrl =
    resolveDocumentUrl(payload?.documents?.driverLicenseRecto) ??
    resolveDocumentUrl(payload?.driverLicenseFrontUrl);
  const licenseBackUrl =
    resolveDocumentUrl(payload?.documents?.driverLicenseVerso) ??
    resolveDocumentUrl(payload?.driverLicenseBackUrl);
  const vehiclePhotoUrl = resolveDocumentUrl(payload?.vehiclePhotoUrl);
  const hasVehicle = Boolean(vehiclePhotoUrl || payload?.driverVehiclePlate);

  return {
    email: normalized,
    documents: {
      license_front: buildDocumentRecord(Boolean(licenseFrontUrl), licenseFrontUrl),
      license_back: buildDocumentRecord(Boolean(licenseBackUrl), licenseBackUrl),
      vehicle_registration: buildDocumentRecord(hasVehicle, vehiclePhotoUrl),
    },
  };
};

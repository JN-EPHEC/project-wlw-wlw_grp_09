import { encryptFileUri, encryptStringPayload, type EncryptedPayload } from '@/app/utils/secure-cipher';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/src/firebase';

const DEFAULT_ENDPOINT = 'https://us-central1-campusride-8b619.cloudfunctions.net/driverDocuments';
const DRIVER_DOCS_ENDPOINT = process.env.EXPO_PUBLIC_DRIVER_DOCS_URL ?? DEFAULT_ENDPOINT;
const getDriverDocumentsStatusCallable = httpsCallable(functions, 'getDriverDocumentsStatus');

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

const sanitizeEmail = (value: string) => value.trim().toLowerCase();

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
  const email = sanitizeEmail(params.email);
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

export const fetchDriverDocumentStatuses = async (email: string): Promise<DriverDocumentSnapshot> => {
  const normalized = sanitizeEmail(email);
  if (!normalized) {
    throw new Error('Adresse e-mail requise');
  }
  const result = await getDriverDocumentsStatusCallable({ email: normalized });
  return result.data as DriverDocumentSnapshot;
};

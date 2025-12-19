import { Alert } from 'react-native';

import { fetchDriverDocumentStatuses, type DriverDocumentSnapshot } from '@/app/services/driver-documents';

export type DriverVerificationStatus = 'unverified' | 'pending' | 'verified';
export type DocumentReviewState = 'missing' | 'pending' | 'approved' | 'rejected';

export type VehicleSnapshot = {
  plate: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  photoUrl: string | null;
  updatedAt: number | null;
};

export type DriverSecuritySnapshot = {
  driverLicenseFrontUrl: string | null;
  driverLicenseBackUrl: string | null;
  licenseFrontUploadedAt: number | null;
  licenseBackUploadedAt: number | null;
  licenseExpiryLabel: string | null;
  vehicle: VehicleSnapshot;
  selfieUrl: string | null;
  selfieCapturedAt: number | null;
  verificationStatus: DriverVerificationStatus;
  documents: {
    license: DocumentReviewState;
    vehicle: DocumentReviewState;
    selfie: DocumentReviewState;
  };
  blockers: {
    requiresLicense: boolean;
    requiresVehicle: boolean;
    requiresSelfie: boolean;
  };
  nextSelfieDueAt: number | null;
  lastStatusChange: number | null;
};

type DriverSecurityRecord = {
  driverLicenseFrontUrl: string | null;
  driverLicenseBackUrl: string | null;
  licenseFrontUploadedAt: number | null;
  licenseBackUploadedAt: number | null;
  licenseExpiryLabel: string | null;
  vehicle: {
    plate: string | null;
    brand: string | null;
    model: string | null;
    color: string | null;
    photoUrl: string | null;
    updatedAt: number | null;
  };
  selfieUrl: string | null;
  selfieCapturedAt: number | null;
  verificationStatus: DriverVerificationStatus;
  lastStatusChange: number | null;
};

type Listener = (snapshot: DriverSecuritySnapshot) => void;

const driverSecurity: Record<string, DriverSecurityRecord> = {};
const listeners: Record<string, Listener[]> = {};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const now = () => Date.now();

const cleanText = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const cleanPlate = (value: string | null | undefined) => {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  return cleaned.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
};

const cleanColor = (value: string | null | undefined) => {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
};

const SELFIE_VALIDITY_MS = 1000 * 60 * 60 * 36; // 36 heures

const ensureRecord = (email: string) => {
  const key = normalizeEmail(email);
  if (!driverSecurity[key]) {
    driverSecurity[key] = {
      driverLicenseFrontUrl: null,
      driverLicenseBackUrl: null,
      licenseFrontUploadedAt: null,
      licenseBackUploadedAt: null,
      licenseExpiryLabel: null,
      vehicle: {
        plate: null,
        brand: null,
        model: null,
        color: null,
        photoUrl: null,
        updatedAt: null,
      },
      selfieUrl: null,
      selfieCapturedAt: null,
      verificationStatus: 'unverified',
      lastStatusChange: null,
    };
  }
  if (!listeners[key]) {
    listeners[key] = [];
  }
  return key;
};

const computeBlockers = (record: DriverSecurityRecord, statuses?: DriverDocumentSnapshot | null) => {
  const requiresLicense = !record.driverLicenseFrontUrl || !record.driverLicenseBackUrl;
  const requiresVehicle = !record.vehicle.plate;
  const requiresSelfie =
    !record.selfieCapturedAt || now() - record.selfieCapturedAt > SELFIE_VALIDITY_MS;
  const docStatus = statuses?.documents ?? {};

  const licenseStatus = docStatus['license_front']?.status ?? docStatus['license_back']?.status;
  const vehicleStatus = docStatus['vehicle_registration']?.status;

  const licenseRejected = licenseStatus === 'rejected';
  const vehicleRejected = vehicleStatus === 'rejected';

  return {
    requiresLicense: requiresLicense || licenseRejected,
    requiresVehicle: requiresVehicle || vehicleRejected,
    requiresSelfie,
  };
};

const computeStatus = (record: DriverSecurityRecord): DriverVerificationStatus => {
  const blockers = computeBlockers(record);
  if (blockers.requiresLicense || blockers.requiresVehicle) return 'unverified';
  if (blockers.requiresSelfie) return 'pending';
  return 'verified';
};

const snapshot = (
  record: DriverSecurityRecord,
  statuses?: DriverDocumentSnapshot | null
): DriverSecuritySnapshot => {
  const blockers = computeBlockers(record, statuses);
  const nextSelfieDueAt = record.selfieCapturedAt
    ? record.selfieCapturedAt + SELFIE_VALIDITY_MS
    : null;
  const remoteDocs = statuses?.documents ?? {};
  const documents = {
    license:
      remoteDocs['license_front']?.status ??
      remoteDocs['license_back']?.status ??
      (record.driverLicenseFrontUrl && record.driverLicenseBackUrl ? 'pending' : 'missing'),
    vehicle: remoteDocs['vehicle_registration']?.status ?? (record.vehicle.plate ? 'pending' : 'missing'),
    selfie: blockers.requiresSelfie ? 'pending' : 'approved',
  } as const;
  if (record.selfieUrl && !blockers.requiresSelfie) {
    documents.selfie = 'approved';
  }

  return {
    driverLicenseFrontUrl: record.driverLicenseFrontUrl,
    driverLicenseBackUrl: record.driverLicenseBackUrl,
    licenseFrontUploadedAt: record.licenseFrontUploadedAt,
    licenseBackUploadedAt: record.licenseBackUploadedAt,
    licenseExpiryLabel: record.licenseExpiryLabel,
    vehicle: {
      plate: record.vehicle.plate,
      brand: record.vehicle.brand,
      model: record.vehicle.model,
      color: record.vehicle.color,
      photoUrl: record.vehicle.photoUrl,
      updatedAt: record.vehicle.updatedAt,
    },
    selfieUrl: record.selfieUrl,
    selfieCapturedAt: record.selfieCapturedAt,
    verificationStatus: record.verificationStatus,
    documents,
    blockers,
    nextSelfieDueAt,
    lastStatusChange: record.lastStatusChange,
  };
};

const notify = (email: string, remote?: DriverDocumentSnapshot | null) => {
  const key = ensureRecord(email);
  const current = driverSecurity[key];
  const status = computeStatus(current);
  if (status !== current.verificationStatus) {
    current.verificationStatus = status;
    current.lastStatusChange = now();
  }
  const snap = snapshot(current, remote);
  listeners[key].forEach((listener) => listener(snap));
};

const remoteStatuses: Record<string, DriverDocumentSnapshot | null> = {};
const remoteFetches: Record<string, Promise<DriverDocumentSnapshot | null> | null> = {};

const refreshRemoteStatuses = async (email: string) => {
  const key = normalizeEmail(email);
  if (remoteFetches[key]) return remoteFetches[key];
  const promise = fetchDriverDocumentStatuses(email)
    .then((snapshot) => {
      remoteStatuses[key] = snapshot;
      return snapshot;
    })
    .catch((error) => {
      console.warn('[driver-security] remote status fetch failed', error);
      remoteStatuses[key] = null;
      return null;
    })
    .finally(() => {
      remoteFetches[key] = null;
      notify(email, remoteStatuses[key]);
    });
  remoteFetches[key] = promise;
  return promise;
};

export const initDriverSecurity = (email: string) => {
  ensureRecord(email);
  void refreshRemoteStatuses(email);
  notify(email, remoteStatuses[normalizeEmail(email)] ?? null);
};

export const getDriverSecurity = (email: string | null | undefined) => {
  if (!email) return null;
  const key = ensureRecord(email);
  void refreshRemoteStatuses(email);
  return snapshot(driverSecurity[key], remoteStatuses[key] ?? null);
};

export const subscribeDriverSecurity = (email: string, listener: Listener) => {
  const key = ensureRecord(email);
  const record = driverSecurity[key];
  listeners[key].push(listener);
  listener(snapshot(record, remoteStatuses[key] ?? null));
  void refreshRemoteStatuses(email);
  return () => {
    const index = listeners[key].indexOf(listener);
    if (index >= 0) listeners[key].splice(index, 1);
  };
};

export const updateDriverLicense = (
  email: string,
  payload: { side: 'front' | 'back'; url: string }
) => {
  const key = ensureRecord(email);
  const target = driverSecurity[key];
  const cleaned = payload.url.trim();
  if (payload.side === 'front') {
    target.driverLicenseFrontUrl = cleaned;
    target.licenseFrontUploadedAt = now();
  } else {
    target.driverLicenseBackUrl = cleaned;
    target.licenseBackUploadedAt = now();
  }
  notify(email);
};

type VehicleUpdate = {
  plate?: string;
  brand?: string;
  model?: string;
  color?: string;
  photoUrl?: string;
};

export const updateVehicleInfo = (
  email: string,
  payload: VehicleUpdate & { licenseExpiryLabel?: string }
) => {
  const key = ensureRecord(email);
  const record = driverSecurity[key];
  record.vehicle = {
    plate:
      payload.plate !== undefined ? cleanPlate(payload.plate) : record.vehicle.plate,
    brand:
      payload.brand !== undefined ? cleanText(payload.brand) : record.vehicle.brand,
    model:
      payload.model !== undefined ? cleanText(payload.model) : record.vehicle.model,
    color:
      payload.color !== undefined ? cleanColor(payload.color) : record.vehicle.color,
    photoUrl:
      payload.photoUrl !== undefined ? cleanText(payload.photoUrl) : record.vehicle.photoUrl,
    updatedAt: now(),
  };
  if (payload.licenseExpiryLabel !== undefined) {
    record.licenseExpiryLabel = cleanText(payload.licenseExpiryLabel);
  }
  notify(email);
};

export const recordSelfie = (email: string, url: string) => {
  const key = ensureRecord(email);
  driverSecurity[key].selfieUrl = url.trim();
  driverSecurity[key].selfieCapturedAt = now();
  notify(email, remoteStatuses[key] ?? null);
};

export const clearDriverSecurity = (email: string) => {
  const key = ensureRecord(email);
  driverSecurity[key] = {
    driverLicenseFrontUrl: null,
    driverLicenseBackUrl: null,
    licenseFrontUploadedAt: null,
    licenseBackUploadedAt: null,
    vehicle: {
      plate: null,
      brand: null,
      model: null,
      color: null,
      photoUrl: null,
      updatedAt: null,
    },
    selfieUrl: null,
    selfieCapturedAt: null,
    verificationStatus: 'unverified',
    lastStatusChange: null,
  };
  remoteStatuses[key] = null;
  notify(email, null);
};

export const isVehicleVerified = (email: string, plate?: string | null) => {
  const snapshot = getDriverSecurity(email);
  if (!snapshot) return false;
  if (snapshot.verificationStatus !== 'verified') return false;
  if (!snapshot.vehicle.plate) return false;
  if (!plate) return true;
  return cleanPlate(snapshot.vehicle.plate) === cleanPlate(plate);
};

export const normalizePlate = (plate: string | null | undefined) => cleanPlate(plate);

export const needsFreshSelfie = (security: DriverSecuritySnapshot | null) => {
  if (!security) return true;
  return security.blockers.requiresSelfie;
};

export const getNextSelfieLabel = (security: DriverSecuritySnapshot | null) => {
  if (!security?.nextSelfieDueAt) return 'Dès que possible';
  const date = new Date(security.nextSelfieDueAt);
  return date.toLocaleString('fr-BE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const remindVehicleMismatch = () => {
  Alert.alert(
    'Vérifie ta plaque',
    'Pour des raisons de sécurité, la plaque renseignée doit correspondre à celle validée dans ton profil conducteur.'
  );
};

export { SELFIE_VALIDITY_MS };

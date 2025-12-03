import { Alert } from 'react-native';

export type DriverVerificationStatus = 'unverified' | 'pending' | 'verified';

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
  vehicle: VehicleSnapshot;
  selfieUrl: string | null;
  selfieCapturedAt: number | null;
  verificationStatus: DriverVerificationStatus;
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

const computeBlockers = (record: DriverSecurityRecord) => {
  const requiresLicense = !record.driverLicenseFrontUrl || !record.driverLicenseBackUrl;
  const requiresVehicle = !record.vehicle.plate;
  const requiresSelfie =
    !record.selfieCapturedAt || now() - record.selfieCapturedAt > SELFIE_VALIDITY_MS;

  return { requiresLicense, requiresVehicle, requiresSelfie };
};

const computeStatus = (record: DriverSecurityRecord): DriverVerificationStatus => {
  const blockers = computeBlockers(record);
  if (blockers.requiresLicense || blockers.requiresVehicle) return 'unverified';
  if (blockers.requiresSelfie) return 'pending';
  return 'verified';
};

const snapshot = (record: DriverSecurityRecord): DriverSecuritySnapshot => {
  const blockers = computeBlockers(record);
  const nextSelfieDueAt = record.selfieCapturedAt
    ? record.selfieCapturedAt + SELFIE_VALIDITY_MS
    : null;

  return {
    driverLicenseFrontUrl: record.driverLicenseFrontUrl,
    driverLicenseBackUrl: record.driverLicenseBackUrl,
    licenseFrontUploadedAt: record.licenseFrontUploadedAt,
    licenseBackUploadedAt: record.licenseBackUploadedAt,
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
    blockers,
    nextSelfieDueAt,
    lastStatusChange: record.lastStatusChange,
  };
};

const notify = (email: string) => {
  const key = ensureRecord(email);
  const current = driverSecurity[key];
  const status = computeStatus(current);
  if (status !== current.verificationStatus) {
    current.verificationStatus = status;
    current.lastStatusChange = now();
  }
  const snap = snapshot(current);
  listeners[key].forEach((listener) => listener(snap));
};

export const initDriverSecurity = (email: string) => {
  ensureRecord(email);
  notify(email);
};

export const getDriverSecurity = (email: string | null | undefined) => {
  if (!email) return null;
  const key = ensureRecord(email);
  return snapshot(driverSecurity[key]);
};

export const subscribeDriverSecurity = (email: string, listener: Listener) => {
  const key = ensureRecord(email);
  const record = driverSecurity[key];
  listeners[key].push(listener);
  listener(snapshot(record));
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

export const updateVehicleInfo = (email: string, payload: VehicleUpdate) => {
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
  notify(email);
};

export const recordSelfie = (email: string, url: string) => {
  const key = ensureRecord(email);
  driverSecurity[key].selfieUrl = url.trim();
  driverSecurity[key].selfieCapturedAt = now();
  notify(email);
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
  notify(email);
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

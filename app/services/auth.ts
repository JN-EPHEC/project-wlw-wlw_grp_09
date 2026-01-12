import {
  EmailAuthProvider,
  User,
  UserCredential,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword as firebaseUpdatePassword,
  updateProfile as firebaseUpdateProfile,
} from 'firebase/auth';

import { auth } from '@/src/firebase';
import {
  getPassengerProfile,
  markPassengerVerified,
  savePassenger,
  setPassengerVerificationCode,
  updatePassengerProfile,
  updateUserRoles,
} from '@/src/firestoreUsers';
import { isStrongPassword, isStudentEmail, sanitizeEmail, sanitizeName } from '../validators';
import {
  initDriverSecurity,
  recordSelfie as recordDriverSelfie,
  updateDriverLicense as seedDriverLicense,
  updateVehicleInfo as seedVehicleInfo,
} from './security';

export type AuthSession = {
  email: string | null;
  verified: boolean;
  name: string | null;
  address: string | null;
  phone: string | null;
  studentCardUrl: string | null;
  avatarUrl: string | null;
  isDriver: boolean;
  isPassenger: boolean;
};

export type AuthSnapshot = AuthSession;

type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  avatarUrl?: string | null;
  idCardUrl?: string | null;
  studentCardUrl?: string | null;
  wantsDriver?: boolean;
  wantsPassenger?: boolean;
};

type ProfileChanges = Partial<{
  name: string | null;
  address: string | null;
  phone: string | null;
  studentCardUrl: string | null;
  avatarUrl: string | null;
  driver: boolean;
  passenger: boolean;
}>;

type Listener = (session: AuthSession) => void;

type VerificationState = {
  code: string | null;
  expiresAt: number | null;
  verified: boolean;
};

const listeners = new Set<Listener>();
let currentSession: AuthSession = createEmptySession();
const verificationCache = new Map<string, VerificationState>();

const createEmptyState = (): VerificationState => ({ code: null, expiresAt: null, verified: false });

function createEmptySession(): AuthSession {
  return {
    email: null,
    verified: false,
    name: null,
    address: null,
    phone: null,
    studentCardUrl: null,
    avatarUrl: null,
    isDriver: false,
    isPassenger: false,
  };
}

const cloneSession = (session: AuthSession): AuthSession => ({ ...session });

const authError = (code: string, message: string) => {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
};

const normalizeEmail = (email: string | null | undefined) => sanitizeEmail(email ?? '');

type FirebaseAuthError = Error & { code?: string };

const rethrowFirebaseAuthError = (error: FirebaseAuthError, context: 'sign-in' | 'sign-up'): never => {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (!code.startsWith('auth/')) {
    throw error;
  }

  if (context === 'sign-up') {
    switch (code) {
      case 'auth/email-already-in-use':
        throw authError(
          'EMAIL_IN_USE',
          'Un compte existe déjà avec cette adresse universitaire. Connecte-toi ou choisis-en une autre.'
        );
      case 'auth/invalid-email':
        throw authError(
          'INVALID_EMAIL',
          'Adresse e-mail invalide. Utilise ton format @students.ephec.be pour continuer.'
        );
      case 'auth/weak-password':
      case 'auth/missing-password':
        throw authError(
          'INVALID_PASSWORD',
          'Ton mot de passe doit comporter au moins 8 caractères avec une majuscule et un chiffre.'
        );
      default:
        throw error;
    }
  }

  switch (code) {
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      throw authError(
        'USER_NOT_FOUND',
        'Aucun compte ne correspond à cet e-mail. Vérifie l’adresse ou crée un compte.'
      );
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      throw authError('INVALID_CREDENTIALS', 'Mot de passe incorrect. Réessaie.');
    case 'auth/missing-password':
      throw authError(
        'PASSWORD_NOT_SET',
        'Ton mot de passe doit être réinitialisé. Crée un nouveau compte avec cette adresse.'
      );
    case 'auth/too-many-requests':
      throw authError(
        'INVALID_CREDENTIALS',
        'Tentatives trop nombreuses. Réessaie dans quelques minutes ou réinitialise ton mot de passe.'
      );
    default:
      throw error;
  }
};

const notify = () => {
  const snapshot = cloneSession(currentSession);
  listeners.forEach((listener) => listener(snapshot));
};

const setCurrentSession = (session: AuthSession) => {
  currentSession = session;
  notify();
};

const ensureVerificationEntry = (email: string) => {
  const key = normalizeEmail(email);
  if (!verificationCache.has(key)) {
    verificationCache.set(key, createEmptyState());
  }
  return verificationCache.get(key)!;
};

const updateVerificationEntry = (email: string, updates: Partial<VerificationState>) => {
  const key = normalizeEmail(email);
  const next = { ...ensureVerificationEntry(email), ...updates };
  verificationCache.set(key, next);
  return next;
};

const getVerificationEntry = (email: string) => verificationCache.get(normalizeEmail(email));

const refreshVerificationEntry = async (email: string) => {
  const profile = await getPassengerProfile(email);
  if (profile) {
    updateVerificationEntry(email, {
      code: profile.verificationCode ?? null,
      expiresAt: profile.verificationExpiresAt ?? null,
      verified: !!profile.verified,
    });
  }
};

const seedDriverInfo = (
  email: string,
  profile: { driverVehiclePlate?: string; driverLicenseExpiryLabel?: string | null }
) => {
  const plate = profile.driverVehiclePlate;
  if (!plate) return;
  seedVehicleInfo(email, {
    plate,
    licenseExpiryLabel: profile.driverLicenseExpiryLabel ?? undefined,
  });
};

const splitName = (value: string | null | undefined) => {
  const safe = sanitizeName(value ?? '').trim();
  if (!safe) return { firstName: 'Etudiant', lastName: 'CampusRide' };
  const [first, ...rest] = safe.split(/\s+/);
  return { firstName: first || 'Etudiant', lastName: rest.join(' ') };
};

const hydrateDriverSecurityFromProfile = (email: string, profile: any) => {
  if (!email || !profile) return;
  initDriverSecurity(email);
  if (profile.driverLicenseFrontUrl) {
    seedDriverLicense(email, { side: 'front', url: profile.driverLicenseFrontUrl });
  }
  if (profile.driverLicenseBackUrl) {
    seedDriverLicense(email, { side: 'back', url: profile.driverLicenseBackUrl });
  }
  if (profile.driverVehiclePlate) {
    seedDriverInfo(email, profile);
  } else if (profile.carPlate) {
    seedDriverInfo(email, {
      driverVehiclePlate: profile.carPlate,
      driverLicenseExpiryLabel: profile.driverLicenseExpiryLabel,
    });
  }
  if (profile.driverSelfieUrl) {
    recordDriverSelfie(email, profile.driverSelfieUrl);
  }
};

const buildSessionFromUser = async (user: User | null): Promise<AuthSession> => {
  if (!user || !user.email) {
    return createEmptySession();
  }
  const normalized = normalizeEmail(user.email);
  const profile = await getPassengerProfile(normalized);
  if (!profile) {
    return {
      email: user.email,
      verified: user.emailVerified,
      name: user.displayName,
      address: null,
      phone: null,
      studentCardUrl: null,
      avatarUrl: user.photoURL,
      isDriver: false,
      isPassenger: true,
    };
  }

  updateVerificationEntry(normalized, {
    code: profile.verificationCode ?? null,
    expiresAt: profile.verificationExpiresAt ?? null,
    verified: !!profile.verified,
  });
  hydrateDriverSecurityFromProfile(normalized, profile);

  const fullName = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim();
  const hasDriverFlag = Object.prototype.hasOwnProperty.call(profile, 'isDriver');
  const isDriverFromRole = profile.role === 'driver';
  const hasPassengerFlag = Object.prototype.hasOwnProperty.call(profile, 'isPassenger');
  return {
    email: normalized,
    verified: !!profile.verified,
    name: fullName || user.displayName || null,
    address: profile.campus ?? null,
    phone: profile.phone ?? null,
    studentCardUrl: profile.studentCardUrl ?? null,
    avatarUrl: profile.selfieUrl ?? user.photoURL ?? null,
    isDriver: hasDriverFlag ? !!profile.isDriver : isDriverFromRole,
    isPassenger: hasPassengerFlag ? !!profile.isPassenger : !isDriverFromRole,
  };
};

onAuthStateChanged(auth, async (firebaseUser) => {
  const session = await buildSessionFromUser(firebaseUser);
  setCurrentSession(session);
});

const generateVerificationCode = () => Math.floor(1000 + Math.random() * 9000).toString();

export const getSession = (): AuthSession => cloneSession(currentSession);

export const subscribe = (listener: Listener) => {
  listeners.add(listener);
  listener(getSession());
  return () => {
    listeners.delete(listener);
  };
};

export const createUser = async (payload: CreateUserPayload): Promise<AuthSnapshot> => {
  const email = normalizeEmail(payload.email);
  if (!isStudentEmail(email)) {
    throw authError('INVALID_EMAIL', 'Utilise ton e-mail étudiant (@students.ephec.be) pour créer un compte.');
  }
  if (payload.password !== payload.passwordConfirmation) {
    throw authError('PASSWORD_MISMATCH', 'Les mots de passe doivent être identiques.');
  }
  if (!isStrongPassword(payload.password)) {
    throw authError('INVALID_PASSWORD', 'Ton mot de passe doit contenir 8 caractères, un chiffre et une majuscule.');
  }

  let credential: UserCredential;
  try {
    credential = await createUserWithEmailAndPassword(auth, email, payload.password);
  } catch (err) {
    rethrowFirebaseAuthError(err as FirebaseAuthError, 'sign-up');
  }
  const user = credential.user;
  const cleaned = sanitizeName(payload.name ?? '');
  if (cleaned) {
    await firebaseUpdateProfile(user, { displayName: cleaned });
  }

  const { firstName, lastName } = splitName(cleaned);
  await savePassenger({
    firstName,
    lastName,
    email,
    phone: '',
    campus: '',
    studentCardUrl: payload.studentCardUrl ?? undefined,
    selfieUrl: payload.avatarUrl ?? undefined,
    verified: false,
    uid: user.uid,
  });

  await sendVerificationEmail(email);
  const session = await buildSessionFromUser(user);
  setCurrentSession(session);
  return session;
};

export const authenticate = async (email: string, password: string): Promise<AuthSnapshot> => {
  try {
    const credential = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
    const session = await buildSessionFromUser(credential.user);
    setCurrentSession(session);
    return session;
  } catch (err) {
    rethrowFirebaseAuthError(err as FirebaseAuthError, 'sign-in');
  }
};

export const signOut = async () => {
  await firebaseSignOut(auth);
  setCurrentSession(createEmptySession());
};

export const sendVerificationEmail = async (rawEmail?: string) => {
  const email = normalizeEmail(rawEmail ?? auth.currentUser?.email ?? '');
  if (!email) {
    throw authError('USER_NOT_FOUND', 'Aucun compte connecté pour l’envoi du code.');
  }
  const code = generateVerificationCode();
  const { expiresAt } = await setPassengerVerificationCode(email, code);
  updateVerificationEntry(email, { code, expiresAt, verified: false });
  return { email, code };
};

export const getPendingVerificationCode = (email: string) => {
  const normalized = normalizeEmail(email);
  const entry = getVerificationEntry(normalized);
  if (!entry) {
    void refreshVerificationEntry(normalized);
    return null;
  }
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    updateVerificationEntry(normalized, { code: null, expiresAt: null });
    return null;
  }
  return entry.code;
};

export const isVerified = (email: string) => {
  const normalized = normalizeEmail(email);
  const entry = getVerificationEntry(normalized);
  if (!entry) {
    void refreshVerificationEntry(normalized);
    return false;
  }
  return !!entry.verified;
};

export const verifyEmail = async (email: string, code: string) => {
  const normalized = normalizeEmail(email);
  let entry = getVerificationEntry(normalized);
  if (!entry) {
    await refreshVerificationEntry(normalized);
    entry = getVerificationEntry(normalized);
  }
  if (!entry || !entry.code) {
    throw authError('INVALID_CODE', 'Aucun code actif pour ce compte.');
  }
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    throw authError('INVALID_CODE', 'Code expiré. Demande un nouvel envoi.');
  }
  if (entry.code !== code.trim()) {
    throw authError('INVALID_CODE', 'Code de vérification incorrect.');
  }
  await markPassengerVerified(normalized);
  updateVerificationEntry(normalized, { verified: true, code: null, expiresAt: null });
  const user = auth.currentUser;
  if (user && user.email && normalizeEmail(user.email) === normalized) {
    const session = await buildSessionFromUser(user);
    setCurrentSession(session);
  }
  return getSession();
};

export const changePassword = async (currentPassword: string, nextPassword: string) => {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw authError('USER_NOT_FOUND', 'Connecte-toi pour modifier ton mot de passe.');
  }
  if (!currentPassword) {
    throw authError('PASSWORD_NOT_SET', 'Ton mot de passe actuel est requis.');
  }
  if (!isStrongPassword(nextPassword)) {
    throw authError(
      'INVALID_PASSWORD',
      'Ton nouveau mot de passe doit contenir 8 caractères, une majuscule et un chiffre.'
    );
  }
  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
  } catch {
    throw authError('INVALID_CREDENTIALS', 'Mot de passe actuel incorrect.');
  }
  try {
    await firebaseUpdatePassword(user, nextPassword);
  } catch (error) {
    const code = (error as FirebaseAuthError)?.code ?? '';
    if (code === 'auth/weak-password') {
      throw authError(
        'INVALID_PASSWORD',
        'Ton nouveau mot de passe doit contenir 8 caractères, une majuscule et un chiffre.'
      );
    }
    throw error;
  }
};

export const updateProfile = async (email: string, changes: ProfileChanges) => {
  const normalized = normalizeEmail(email);
  const profile = await getPassengerProfile(normalized);
  if (!profile) {
    throw authError('USER_NOT_FOUND', 'Profil introuvable pour mettre à jour les informations.');
  }

  const next = {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    campus: profile.campus ?? '',
    phone: profile.phone ?? '',
    studentCardUrl: profile.studentCardUrl ?? undefined,
    selfieUrl: profile.selfieUrl ?? undefined,
  };

  if (typeof changes.name === 'string') {
    const { firstName, lastName } = splitName(changes.name);
    next.firstName = firstName;
    next.lastName = lastName;
  }
  if (typeof changes.address === 'string') {
    next.campus = changes.address;
  }
  if (typeof changes.phone === 'string') {
    next.phone = changes.phone;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'studentCardUrl')) {
    next.studentCardUrl = changes.studentCardUrl ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'avatarUrl')) {
    next.selfieUrl = changes.avatarUrl ?? undefined;
  }

  await updatePassengerProfile({
    email: normalized,
    firstName: next.firstName,
    lastName: next.lastName,
    campus: next.campus,
    phone: next.phone,
    studentCardUrl: next.studentCardUrl,
    selfieUrl: next.selfieUrl,
  });

  const roleChanges: { driver?: boolean; passenger?: boolean } = {};
  if (Object.prototype.hasOwnProperty.call(changes, 'driver')) {
    roleChanges.driver = !!changes.driver;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'passenger')) {
    roleChanges.passenger = !!changes.passenger;
  }
  if (Object.keys(roleChanges).length > 0) {
    await updateUserRoles(normalized, roleChanges);
  }

  const user = auth.currentUser;
  if (user && user.email && normalizeEmail(user.email) === normalized) {
    const update: { displayName?: string | null; photoURL?: string | null } = {};
    if (typeof changes.name === 'string') {
      update.displayName = sanitizeName(changes.name ?? '') || null;
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'avatarUrl')) {
      update.photoURL = changes.avatarUrl ?? null;
    }
    if (Object.keys(update).length > 0) {
      await firebaseUpdateProfile(user, update);
    }
    const session = await buildSessionFromUser(user);
    setCurrentSession(session);
  }
};

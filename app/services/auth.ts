import { FirebaseError } from 'firebase/app';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as firebaseUpdateProfile,
} from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type DocumentData } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { auth, db } from '@/firebaseConfig';
import { isStrongPassword, isStudentEmail, sanitizeEmail, sanitizeName } from '@/app/validators';

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
  rgpdAcceptedAt: number | null;
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

type AuthProfileDoc = {
  email: string;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  studentCardUrl?: string | null;
  avatarUrl?: string | null;
  isDriver?: boolean;
  isPassenger?: boolean;
  rgpdAcceptedAt?: number | null;
  campusVerified?: boolean;
};

type Listener = (session: AuthSession) => void;

const USERS_COLLECTION = 'authUsers';
const functionsInstance = getFunctions();
const callRequestVerification = httpsCallable(functionsInstance, 'requestVerificationCode');
const callVerifyEmailCode = httpsCallable(functionsInstance, 'verifyEmailCode');
const FALLBACK_CODE_TTL_MS = 10 * 60 * 1000;
type FallbackCodeEntry = { code: string; expiresAt: number; attempts: number };
const fallbackCodes: Record<string, FallbackCodeEntry> = {};
const fallbackVerifiedEmails = new Set<string>();

let currentUser: User | null = null;
let currentProfile: AuthProfileDoc | null = null;
let currentSession: AuthSession = createEmptySession();
const listeners = new Set<Listener>();
let authListenerStarted = false;
let profileUnsubscribe: (() => void) | null = null;

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
    rgpdAcceptedAt: null,
  };
}

const cloneSession = (session: AuthSession): AuthSession => ({ ...session });

const notify = () => {
  const snapshot = cloneSession(currentSession);
  listeners.forEach((listener) => listener(snapshot));
};

const authError = (code: string, message: string) => {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
};

const timestampToMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null) {
    if (typeof (value as { toMillis?: () => number }).toMillis === 'function') {
      return (value as { toMillis: () => number }).toMillis();
    }
    if (typeof (value as { seconds?: number; nanoseconds?: number }).seconds === 'number') {
      const seconds = (value as { seconds: number }).seconds;
      const nanos = (value as { nanoseconds?: number }).nanoseconds ?? 0;
      return seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  }
  return null;
};

const buildSession = (user: User | null, profile: AuthProfileDoc | null): AuthSession => {
  if (!user) return createEmptySession();
  const email = user.email ?? null;
  const normalizedEmail = email?.toLowerCase() ?? null;
  const name = profile?.name ?? user.displayName ?? null;
  const campusVerified = profile?.campusVerified ?? false;
  const isFallbackVerified = normalizedEmail ? fallbackVerifiedEmails.has(normalizedEmail) : false;
  const emailVerified = !!(user.emailVerified || isFallbackVerified);
  return {
    email,
    verified: !!(emailVerified && campusVerified),
    name,
    address: profile?.address ?? null,
    phone: profile?.phone ?? null,
    studentCardUrl: profile?.studentCardUrl ?? null,
    avatarUrl: profile?.avatarUrl ?? user.photoURL ?? null,
    isDriver: !!profile?.isDriver,
    isPassenger: profile?.isPassenger !== false,
    rgpdAcceptedAt: profile?.rgpdAcceptedAt ?? null,
  };
};

const updateSession = () => {
  currentSession = buildSession(currentUser, currentProfile);
  notify();
};

const getProfileRef = (email: string) => doc(db, USERS_COLLECTION, sanitizeEmail(email));

const parseProfile = (data: DocumentData | undefined): AuthProfileDoc | null => {
  if (!data) return null;
  return {
    email: data.email,
    name: data.name ?? null,
    address: data.address ?? null,
    phone: data.phone ?? null,
    studentCardUrl: data.studentCardUrl ?? null,
    avatarUrl: data.avatarUrl ?? null,
    isDriver: !!data.isDriver,
    isPassenger: data.isPassenger !== false,
    rgpdAcceptedAt: timestampToMillis(data.rgpdAcceptedAt),
    campusVerified: !!data.campusVerified,
  };
};

const ensureProfileListener = (email: string | null) => {
  if (profileUnsubscribe) {
    profileUnsubscribe();
    profileUnsubscribe = null;
  }
  if (!email) {
    currentProfile = null;
    updateSession();
    return;
  }
  const ref = getProfileRef(email);
  profileUnsubscribe = onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        currentProfile = null;
        setDoc(
          ref,
          {
            email: sanitizeEmail(email),
            isPassenger: true,
            isDriver: false,
            campusVerified: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch((error) => console.warn('Unable to scaffold profile document', error));
      } else {
        currentProfile = parseProfile(snapshot.data());
      }
      updateSession();
    },
    (error) => console.error('Profile listener error', error)
  );
};

const ensureAuthListener = () => {
  if (authListenerStarted) return;
  authListenerStarted = true;
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    ensureProfileListener(user?.email ?? null);
    if (!user) {
      currentProfile = null;
      updateSession();
    }
  });
};

const refreshSession = async () => {
  if (auth.currentUser) {
    await auth.currentUser.reload();
    currentUser = auth.currentUser;
  }
  updateSession();
};

const mapFirebaseAuthError = (error: unknown) => {
  const firebaseError = error as FirebaseError | undefined;
  switch (firebaseError?.code) {
    case 'auth/email-already-in-use':
      throw authError('EMAIL_IN_USE', 'Un compte existe déjà avec cette adresse universitaire.');
    case 'auth/invalid-email':
      throw authError('INVALID_EMAIL', 'Adresse e-mail invalide.');
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/user-mismatch':
      throw authError('INVALID_CREDENTIALS', 'Mot de passe incorrect.');
    case 'auth/user-not-found':
      throw authError('USER_NOT_FOUND', 'Aucun compte ne correspond à cet e-mail.');
    case 'auth/weak-password':
      throw authError(
        'INVALID_PASSWORD',
        'Ton mot de passe doit contenir 8 caractères, un chiffre et une majuscule.'
      );
    default:
      throw error instanceof Error
        ? error
        : authError('UNKNOWN', 'Action impossible pour le moment. Réessaie plus tard.');
  }
};

const mapFunctionError = (error: unknown) => {
  const detail =
    typeof (error as { details?: string | undefined })?.details === 'string'
      ? ((error as { details?: string | undefined }).details as string)
      : undefined;
  switch (detail) {
    case 'EMAIL_REQUIRED':
    case 'EMAIL_INVALID':
      throw authError('INVALID_EMAIL', "Utilise ton e-mail étudiant pour continuer.");
    case 'USER_NOT_FOUND':
      throw authError('USER_NOT_FOUND', 'Aucun compte ne correspond à cet e-mail.');
    case 'CODE_NOT_FOUND':
    case 'CODE_NOT_ACTIVE':
    case 'INVALID_CODE':
      throw authError('INVALID_CODE', 'Code incorrect. Vérifie ton e-mail.');
    case 'CODE_LENGTH_INVALID':
    case 'EMAIL_AND_CODE_REQUIRED':
      throw authError('INVALID_CODE', 'Entre le code à 4 chiffres reçu par e-mail.');
    case 'CODE_EXPIRED':
      throw authError('CODE_EXPIRED', 'Ce code a expiré. Demande un nouveau code.');
    case 'TOO_MANY_ATTEMPTS':
      throw authError(
        'TOO_MANY_ATTEMPTS',
        'Nombre de tentatives dépassé. Patiente avant de réessayer.'
      );
    default:
      throw error instanceof Error
        ? error
        : authError('UNKNOWN', "Impossible d'exécuter cette action pour le moment.");
  }
};

const generateLocalCode = () => Math.floor(1000 + Math.random() * 9000).toString();

const storeFallbackCode = (email: string) => {
  const normalized = sanitizeEmail(email);
  const entry: FallbackCodeEntry = {
    code: generateLocalCode(),
    expiresAt: Date.now() + FALLBACK_CODE_TTL_MS,
    attempts: 0,
  };
  fallbackCodes[normalized] = entry;
  return entry;
};

const cleanFallbackCode = (email: string) => {
  const normalized = sanitizeEmail(email);
  const entry = fallbackCodes[normalized];
  if (entry && entry.expiresAt < Date.now()) {
    delete fallbackCodes[normalized];
  }
};

const applyFallbackVerification = async (email: string) => {
  const normalized = sanitizeEmail(email);
  fallbackVerifiedEmails.add(normalized);
  if (currentProfile && currentProfile.email?.toLowerCase() === normalized) {
    currentProfile = { ...currentProfile, campusVerified: true };
  } else if (!currentProfile) {
    currentProfile = { email: normalized, campusVerified: true };
  }
  updateSession();
  try {
    await setDoc(
      getProfileRef(normalized),
      {
        campusVerified: true,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('Unable to persist fallback verification', error);
  }
  await refreshSession();
};

export const getSession = (): AuthSession => cloneSession(currentSession);

export const subscribe = (listener: Listener) => {
  ensureAuthListener();
  listeners.add(listener);
  listener(getSession());
  return () => {
    listeners.delete(listener);
  };
};

export const createUser = async (payload: CreateUserPayload): Promise<AuthSnapshot> => {
  const email = sanitizeEmail(payload.email);
  if (!isStudentEmail(email)) {
    throw authError(
      'INVALID_EMAIL',
      'Utilise ton e-mail étudiant (@students.ephec.be) pour créer un compte.'
    );
  }
  if (payload.password !== payload.passwordConfirmation) {
    throw authError('PASSWORD_MISMATCH', 'Les mots de passe doivent être identiques.');
  }
  if (!isStrongPassword(payload.password)) {
    throw authError(
      'INVALID_PASSWORD',
      'Ton mot de passe doit contenir 8 caractères, un chiffre et une majuscule.'
    );
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, payload.password);
    const displayName = sanitizeName(payload.name ?? '').trim();
    if (displayName) {
      await firebaseUpdateProfile(credential.user, { displayName });
    }

    await setDoc(
      getProfileRef(email),
      {
        email,
        name: displayName || null,
        avatarUrl: payload.avatarUrl ?? null,
        studentCardUrl: payload.studentCardUrl ?? null,
        isDriver: !!payload.wantsDriver,
        isPassenger: payload.wantsPassenger !== false,
        rgpdAcceptedAt: serverTimestamp(),
        campusVerified: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    currentUser = credential.user;
    await refreshSession();
    return getSession();
  } catch (error) {
    mapFirebaseAuthError(error);
    return getSession();
  }
};

export const authenticate = async (email: string, password: string): Promise<AuthSnapshot> => {
  try {
    const credential = await signInWithEmailAndPassword(auth, sanitizeEmail(email), password);
    currentUser = credential.user;
    await refreshSession();
    return getSession();
  } catch (error) {
    mapFirebaseAuthError(error);
    return getSession();
  }
};

export const signOut = async () => {
  await firebaseSignOut(auth);
  currentUser = null;
  currentProfile = null;
  updateSession();
};

export const sendVerificationEmail = async (rawEmail?: string) => {
  const email = sanitizeEmail(rawEmail ?? currentSession.email ?? '');
  if (!email) {
    throw authError('USER_NOT_FOUND', 'Aucun compte connecté pour l’envoi du code.');
  }
  try {
    await callRequestVerification({ email });
    cleanFallbackCode(email);
    return { email };
  } catch (error) {
    console.warn('sendVerificationEmail fallback', error);
    const fallback = storeFallbackCode(email);
    return { email, code: fallback.code };
  }
};

export const verifyEmail = async (email: string, code: string) => {
  const normalized = sanitizeEmail(email);
  if (!normalized) {
    throw authError('INVALID_EMAIL', 'Adresse universitaire manquante.');
  }
  if (!code.trim()) {
    throw authError('INVALID_CODE', 'Entre ton code à 4 chiffres.');
  }
  try {
    await callVerifyEmailCode({ email: normalized, code });
    cleanFallbackCode(normalized);
    await refreshSession();
    return getSession();
  } catch (error) {
    cleanFallbackCode(normalized);
    const fallback = fallbackCodes[normalized];
    if (fallback) {
      if (fallback.expiresAt < Date.now()) {
        delete fallbackCodes[normalized];
        throw authError('CODE_EXPIRED', 'Ce code a expiré. Demande un nouveau code.');
      }
      if (fallback.code !== code.trim()) {
        fallback.attempts += 1;
        throw authError('INVALID_CODE', 'Code incorrect. Vérifie ton e-mail.');
      }
      delete fallbackCodes[normalized];
      await applyFallbackVerification(normalized);
      return getSession();
    }
    mapFunctionError(error);
    return getSession();
  }
};

export const isVerified = (email: string) => {
  const normalized = sanitizeEmail(email);
  return (
    !!currentSession.email &&
    currentSession.email.toLowerCase() === normalized &&
    currentSession.verified
  );
};

export const getPendingVerificationCode = (email?: string) => {
  const normalized = sanitizeEmail(email ?? currentSession.email ?? '');
  if (!normalized) return null;
  cleanFallbackCode(normalized);
  return fallbackCodes[normalized]?.code ?? null;
};

export const updateProfile = async (email: string, changes: ProfileChanges) => {
  const normalized = sanitizeEmail(email);
  if (!normalized) return;
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (Object.prototype.hasOwnProperty.call(changes, 'name')) {
    const cleaned = changes.name ? sanitizeName(changes.name).trim() : null;
    updates.name = cleaned ?? null;
    if (auth.currentUser && auth.currentUser.email?.toLowerCase() === normalized) {
      await firebaseUpdateProfile(auth.currentUser, { displayName: cleaned ?? undefined });
    }
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'address')) {
    updates.address = changes.address ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'phone')) {
    updates.phone = changes.phone ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'studentCardUrl')) {
    updates.studentCardUrl = changes.studentCardUrl ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'avatarUrl')) {
    updates.avatarUrl = changes.avatarUrl ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'driver')) {
    updates.isDriver = !!changes.driver;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'passenger')) {
    updates.isPassenger = !!changes.passenger;
  }

  await updateDoc(getProfileRef(normalized), updates);
};

ensureAuthListener();

import {
  isStrongPassword,
  isStudentEmail,
  sanitizeEmail,
  sanitizeName,
} from '../validators';

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

type AuthAccount = {
  email: string;
  password: string;
  name: string | null;
  address: string | null;
  phone: string | null;
  studentCardUrl: string | null;
  avatarUrl: string | null;
  idCardUrl: string | null;
  isDriver: boolean;
  isPassenger: boolean;
  verified: boolean;
  verificationCode: string | null;
  verificationExpiresAt: number | null;
};

type Listener = (session: AuthSession) => void;

const accounts: Record<string, AuthAccount> = {};
let currentSession: AuthSession = createEmptySession();
const listeners = new Set<Listener>();

const VERIFICATION_EXPIRATION_MS = 1000 * 60 * 10; // 10 minutes

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

const notify = () => {
  const snapshot = cloneSession(currentSession);
  listeners.forEach((listener) => listener(snapshot));
};

const toSession = (account: AuthAccount): AuthSession => ({
  email: account.email,
  verified: account.verified,
  name: account.name,
  address: account.address,
  phone: account.phone,
  studentCardUrl: account.studentCardUrl,
  avatarUrl: account.avatarUrl,
  isDriver: account.isDriver,
  isPassenger: account.isPassenger,
});

const updateSessionFromAccount = (account: AuthAccount | null) => {
  currentSession = account ? toSession(account) : createEmptySession();
  notify();
};

const syncSessionIfNeeded = (account: AuthAccount) => {
  if (currentSession.email && currentSession.email === account.email) {
    updateSessionFromAccount(account);
  }
};

const authError = (code: string, message: string) => {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
};

const normalizeEmail = (email: string) => sanitizeEmail(email);

const getAccount = (email: string) => {
  const normalized = normalizeEmail(email);
  const account = accounts[normalized];
  if (!account) {
    throw authError('USER_NOT_FOUND', 'Aucun compte ne correspond à cet e-mail.');
  }
  return account;
};

const storeAccount = (account: AuthAccount) => {
  accounts[account.email] = account;
};

const generateVerificationCode = () => Math.floor(1000 + Math.random() * 9000).toString();

const refreshVerificationState = (account: AuthAccount) => {
  if (account.verificationExpiresAt && account.verificationExpiresAt < Date.now()) {
    account.verificationCode = null;
    account.verificationExpiresAt = null;
  }
};

const cleanText = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

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
  if (accounts[email]) {
    throw authError('EMAIL_IN_USE', 'Un compte existe déjà avec cette adresse.');
  }

  const cleanedName = sanitizeName(payload.name ?? '').trim();
  const account: AuthAccount = {
    email,
    password: payload.password,
    name: cleanedName || null,
    address: null,
    phone: null,
    studentCardUrl: cleanText(payload.studentCardUrl),
    avatarUrl: cleanText(payload.avatarUrl),
    idCardUrl: cleanText(payload.idCardUrl),
    isDriver: !!payload.wantsDriver,
    isPassenger: payload.wantsPassenger === undefined ? true : !!payload.wantsPassenger,
    verified: false,
    verificationCode: null,
    verificationExpiresAt: null,
  };

  storeAccount(account);
  updateSessionFromAccount(account);
  return toSession(account);
};

export const authenticate = async (email: string, password: string): Promise<AuthSnapshot> => {
  const account = getAccount(email);
  if (account.password !== password) {
    throw authError('INVALID_CREDENTIALS', 'Mot de passe incorrect.');
  }
  updateSessionFromAccount(account);
  return toSession(account);
};

export const signOut = () => {
  updateSessionFromAccount(null);
};

export const sendVerificationEmail = async (rawEmail?: string) => {
  const email = rawEmail ?? currentSession.email;
  if (!email) {
    throw authError('USER_NOT_FOUND', 'Aucun compte connecté pour l’envoi du code.');
  }
  const account = getAccount(email);
  const code = generateVerificationCode();
  account.verificationCode = code;
  account.verificationExpiresAt = Date.now() + VERIFICATION_EXPIRATION_MS;
  return { email: account.email, code };
};

export const getPendingVerificationCode = (email: string) => {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  const account = accounts[normalized];
  if (!account) return null;
  refreshVerificationState(account);
  return account.verificationCode;
};

export const isVerified = (email: string) => {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return accounts[normalized]?.verified ?? false;
};

export const verifyEmail = async (email: string, code: string) => {
  const account = getAccount(email);
  refreshVerificationState(account);
  const expected = account.verificationCode;
  if (!expected || expected !== code.trim()) {
    throw authError('INVALID_CODE', 'Code de vérification incorrect ou expiré.');
  }
  account.verified = true;
  account.verificationCode = null;
  account.verificationExpiresAt = null;
  syncSessionIfNeeded(account);
  return toSession(account);
};

export const updateProfile = async (email: string, changes: ProfileChanges) => {
  const account = getAccount(email);
  if (Object.prototype.hasOwnProperty.call(changes, 'name')) {
    const cleaned = changes.name ? sanitizeName(changes.name) : '';
    account.name = cleaned ? cleaned : null;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'address')) {
    account.address = cleanText(changes.address);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'phone')) {
    account.phone = cleanText(changes.phone);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'studentCardUrl')) {
    account.studentCardUrl = cleanText(changes.studentCardUrl);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'avatarUrl')) {
    account.avatarUrl = cleanText(changes.avatarUrl);
  }
  if (typeof changes.driver === 'boolean') {
    account.isDriver = changes.driver;
  }
  if (typeof changes.passenger === 'boolean') {
    account.isPassenger = changes.passenger;
  }
  syncSessionIfNeeded(account);
  return toSession(account);
};

// Service d'authentification mocké pour le développement local.
// Respecte la User Story #1 : hash des mots de passe + gestion de session.

import {
  documentDirectory,
  EncodingType,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system';

import { initWallet } from './wallet';
import { initDriverSecurity } from './security';

export type AuthSnapshot = {
  email: string | null;
  verified: boolean;
  name: string | null;
  address: string | null;
  phone: string | null;
  avatarUrl: string | null;
  idCardUrl: string | null;
  studentCardUrl: string | null;
  isDriver: boolean;
  isPassenger: boolean;
};

type UserRoles = {
  driver: boolean;
  passenger: boolean;
};

type UserRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  salt: string;
  verified: boolean;
  createdAt: number;
  address: string;
  avatarUrl: string;
  idCardUrl: string;
  studentCardUrl: string;
  roles: UserRoles;
  verificationCode?: string;
};

const users: Record<string, UserRecord> = {};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeName = (raw: string) => raw.trim().replace(/\s+/g, ' ');
const normalizeAddress = (raw: string) => raw.trim().replace(/\s+/g, ' ');

const defaultAvatarUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/initials/svg?backgroundColor=FF8347&seed=${encodeURIComponent(
    seed || 'campusride'
  )}`;

let currentEmail: string | null = null;

const listeners: ((state: AuthSnapshot) => void)[] = [];
const verificationCodes: Record<string, string> = {};

const randomId = () => Math.random().toString(36).slice(2, 9);
const randomSalt = () => Math.random().toString(36).slice(2, 12);
const generateVerificationCode = () => Math.floor(1000 + Math.random() * 9000).toString();

const STORAGE_FILE = documentDirectory ? `${documentDirectory}auth-db.json` : null;

type PersistedAuthState = {
  users: Record<string, UserRecord>;
  currentEmail: string | null;
  verificationCodes: Record<string, string>;
};

let hydrated = false;
let hydrationPromise: Promise<void> | null = null;

const replaceMap = <T>(target: Record<string, T>, source?: Record<string, T>) => {
  Object.keys(target).forEach((key) => delete target[key]);
  if (source) {
    Object.assign(target, source);
  }
};

const hydrateFromDisk = async () => {
  if (!STORAGE_FILE) {
    hydrated = true;
    notify();
    return;
  }
  try {
    const info = await getInfoAsync(STORAGE_FILE);
    if (!info.exists) {
      hydrated = true;
      notify();
      return;
    }
    const raw = await readAsStringAsync(STORAGE_FILE, {
      encoding: EncodingType.UTF8,
    });
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedAuthState>;
      if (parsed.users) {
        replaceMap(users, parsed.users as Record<string, UserRecord>);
      }
      if (typeof parsed.currentEmail === 'string' || parsed.currentEmail === null) {
        currentEmail = parsed.currentEmail ?? null;
      }
      if (parsed.verificationCodes) {
        replaceMap(verificationCodes, parsed.verificationCodes);
      }
    }
  } catch (error) {
    console.warn('auth hydrate failed', error);
  } finally {
    hydrated = true;
    notify();
  }
};

const ensureHydrated = async () => {
  if (hydrated) return;
  if (!hydrationPromise) {
    hydrationPromise = hydrateFromDisk().finally(() => {
      hydrationPromise = null;
    });
  }
  await hydrationPromise;
};

const persistToDisk = async () => {
  if (!STORAGE_FILE) return;
  try {
    const payload: PersistedAuthState = {
      users,
      currentEmail,
      verificationCodes,
    };
    await writeAsStringAsync(STORAGE_FILE, JSON.stringify(payload), {
      encoding: EncodingType.UTF8,
    });
  } catch (error) {
    console.warn('auth persist failed', error);
  }
};

const queuePersist = () => {
  void persistToDisk();
};

// SHA-256 implémentation minimale (pour éviter une dépendance externe)
const sha256 = (input: string) => {
  const utf8 = new TextEncoder().encode(input);
  const words: number[] = [];
  for (let i = 0; i < utf8.length; i += 4) {
    words.push(
      ((utf8[i] ?? 0) << 24) |
        ((utf8[i + 1] ?? 0) << 16) |
        ((utf8[i + 2] ?? 0) << 8) |
        (utf8[i + 3] ?? 0)
    );
  }

  const K = [
    1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748,
    2870763221, 3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206,
    2614888103, 3248222580, 3835390401, 4022224774, 264347078, 604807628, 770255983,
    1249150122, 1555081692, 1996064986, 2554220882, 2821834349, 2952996808, 3210313671,
    3336571891, 3584528711, 113926993, 338241895, 666307205, 773529912, 1294757372,
    1396182291, 1695183700, 1986661051, 2177026350, 2456956037, 2730485921, 2820302411,
    3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344, 430227734,
    506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779,
    1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479,
    3329325298,
  ];
  const H = [
    1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635,
    1541459225,
  ];

  const bitLength = utf8.length * 8;
  const withOne = new Uint8Array([...utf8, 0x80]);
  let paddedLength = withOne.length;
  while ((paddedLength % 64) !== 0) paddedLength++;
  const padded = new Uint8Array(paddedLength + 8);
  padded.set(withOne);
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength + 4, bitLength >>> 0);
  view.setUint32(paddedLength, Math.floor(bitLength / 2 ** 32));

  for (let i = 0; i < padded.length; i += 64) {
    const chunk = padded.subarray(i, i + 64);
    const w = new Uint32Array(64);
    for (let j = 0; j < 16; j++) {
      w[j] = (chunk[j * 4] << 24) | (chunk[j * 4 + 1] << 16) | (chunk[j * 4 + 2] << 8) | chunk[j * 4 + 3];
    }
    for (let j = 16; j < 64; j++) {
      const s0 = ((w[j - 15] >>> 7) | (w[j - 15] << 25)) ^
        ((w[j - 15] >>> 18) | (w[j - 15] << 14)) ^
        (w[j - 15] >>> 3);
      const s1 = ((w[j - 2] >>> 17) | (w[j - 2] << 15)) ^
        ((w[j - 2] >>> 19) | (w[j - 2] << 13)) ^
        (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;

    for (let j = 0; j < 64; j++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return H.map((x) => x.toString(16).padStart(8, '0')).join('');
};

const hashPassword = (password: string, salt: string) => sha256(`${salt}:${password}`);

const snapshot = (): AuthSnapshot => {
  const email = currentEmail;
  const user = email ? users[email] : undefined;
  return {
    email,
    verified: !!user?.verified,
    name: user?.name ?? null,
    address: user?.address ?? null,
    phone: user?.phone ?? null,
    avatarUrl: user?.avatarUrl ?? null,
    idCardUrl: user?.idCardUrl ?? null,
    studentCardUrl: user?.studentCardUrl ?? null,
    isDriver: !!user?.roles.driver,
    isPassenger: !!user?.roles.passenger,
  };
};

const notify = () => {
  const state = snapshot();
  listeners.forEach((listener) => listener(state));
};

export const subscribe = (listener: (state: AuthSnapshot) => void) => {
  listeners.push(listener);
  listener(snapshot());
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
};

ensureHydrated();

type CreateUserOptions = {
  name: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  address?: string;
  phone?: string;
  avatarUrl: string;
  idCardUrl: string;
  studentCardUrl: string;
  wantsDriver: boolean;
  wantsPassenger?: boolean;
};

export const createUser = async ({
  name,
  email,
  password,
  passwordConfirmation,
  address = '',
  phone = '',
  avatarUrl,
  idCardUrl,
  studentCardUrl,
  wantsDriver,
  wantsPassenger,
}: CreateUserOptions) => {
  await ensureHydrated();
  await new Promise((r) => setTimeout(r, 400));
  const key = normalizeEmail(email);
  const safeName = normalizeName(name);
  const safeAddress = normalizeAddress(address);
  const safePhone = phone.trim();
  const trimmedAvatar = avatarUrl?.trim() ?? '';
  const resolvedAvatar = trimmedAvatar || defaultAvatarUrl(safeName || key);
  const safePassword = password.trim();
  if (!safePassword) {
    const err: any = new Error('InvalidPassword');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }
  if (password !== passwordConfirmation) {
    const err: any = new Error('PasswordMismatch');
    err.code = 'PASSWORD_MISMATCH';
    throw err;
  }
  if (!safeName) {
    const err: any = new Error('InvalidName');
    err.code = 'INVALID_NAME';
    throw err;
  }
  if (users[key]) {
    const err: any = new Error('EmailAlreadyInUse');
    err.code = 'EMAIL_IN_USE';
    throw err;
  }
  const driver = !!wantsDriver;
  const passenger = wantsPassenger ?? true;
  const salt = randomSalt();
  const user: UserRecord = {
    id: randomId(),
    name: safeName,
    email: key,
    phone: safePhone,
    passwordHash: hashPassword(safePassword, salt),
    salt,
    verified: false,
    createdAt: Date.now(),
    address: safeAddress,
    avatarUrl: resolvedAvatar,
    idCardUrl: idCardUrl?.trim() ?? '',
    studentCardUrl: studentCardUrl?.trim() ?? '',
    roles: {
      driver,
      passenger,
    },
    verificationCode: generateVerificationCode(),
  };
  users[key] = user;
  verificationCodes[key] = user.verificationCode ?? generateVerificationCode();
  initWallet(key);
  initDriverSecurity(key);
  currentEmail = key;
  notify();
  queuePersist();
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      verified: user.verified,
      createdAt: user.createdAt,
      address: user.address,
      avatarUrl: user.avatarUrl,
      roles: { ...user.roles },
    },
  };
};

export const sendVerificationEmail = async (email: string) => {
  await ensureHydrated();
  const key = email.toLowerCase();
  const user = users[key];
  if (!user) {
    const err: any = new Error('UserNotFound');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  const code = generateVerificationCode();
  verificationCodes[key] = code;
  await new Promise((r) => setTimeout(r, 400));
  queuePersist();
  return { code };
};

export const verifyEmail = async (email: string, code: string) => {
  await ensureHydrated();
  await new Promise((r) => setTimeout(r, 300));
  const key = email.toLowerCase();
  const user = users[key];
  if (!user) {
    const err: any = new Error('UserNotFound');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  const expected = verificationCodes[key];
  if (!expected || expected !== code) {
    const err: any = new Error('InvalidCode');
    err.code = 'INVALID_CODE';
    throw err;
  }
  delete verificationCodes[key];
  user.verified = true;
  notify();
  queuePersist();
  return { ok: true };
};

export const authenticate = async (email: string, password: string) => {
  await ensureHydrated();
  await new Promise((r) => setTimeout(r, 300));
  const key = email.toLowerCase();
  const user = users[key];
  if (!user) {
    const err: any = new Error('UserNotFound');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  if (user.passwordHash !== hashPassword(password, user.salt)) {
    const err: any = new Error('InvalidCredentials');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }
  currentEmail = key;
  notify();
  queuePersist();
  return snapshot();
};

export const isVerified = (email: string) => {
  const user = users[email.toLowerCase()];
  return !!user?.verified;
};

export const getCurrentEmail = () => currentEmail;

export const clearCurrentEmail = () => {
  currentEmail = null;
  notify();
  queuePersist();
};

export const getUser = (email: string) => {
  const user = users[email.toLowerCase()];
  if (!user) return null;
  const { passwordHash, salt, ...safe } = user;
  return safe;
};

export const getSession = () => snapshot();

export const getPendingVerificationCode = (email: string) =>
  verificationCodes[email.toLowerCase()] ?? null;

type UpdateProfileOptions = {
  name?: string;
  address?: string;
  phone?: string;
  avatarUrl?: string;
  idCardUrl?: string;
  studentCardUrl?: string;
  driver?: boolean;
  passenger?: boolean;
};

export const updateProfile = (email: string, options: UpdateProfileOptions) => {
  const key = email.toLowerCase();
  const user = users[key];
  if (!user) {
    const err: any = new Error('UserNotFound');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  if (typeof options.name === 'string') user.name = options.name.trim();
  if (typeof options.address === 'string') user.address = options.address.trim();
  if (typeof options.phone === 'string') user.phone = options.phone.trim();
  if (typeof options.avatarUrl === 'string') {
    const trimmed = options.avatarUrl.trim();
    user.avatarUrl = trimmed || defaultAvatarUrl(user.name || key);
  }
  if (typeof options.idCardUrl === 'string' && options.idCardUrl.trim()) {
    user.idCardUrl = options.idCardUrl.trim();
  }
  if (typeof options.studentCardUrl === 'string' && options.studentCardUrl.trim()) {
    user.studentCardUrl = options.studentCardUrl.trim();
  }
  if (typeof options.driver === 'boolean') user.roles.driver = options.driver;
  if (typeof options.passenger === 'boolean') user.roles.passenger = options.passenger;
  if (options.driver) {
    initDriverSecurity(key);
  }
  if (!user.roles.driver && !user.roles.passenger) {
    user.roles.passenger = true;
  }
  notify();
  queuePersist();
  return getUser(email) as Omit<UserRecord, 'passwordHash' | 'salt'>;
};

export const setDriverMode = (email: string, driver: boolean) => {
  const key = email.toLowerCase();
  const user = users[key];
  if (!user) {
    const err: any = new Error('UserNotFound');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  user.roles.driver = driver;
  if (!user.roles.passenger) {
    user.roles.passenger = true;
  }
  if (driver) {
    initDriverSecurity(key);
  }
  notify();
  queuePersist();
  return getUser(email);
};

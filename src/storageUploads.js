import { ref, uploadString, getDownloadURL } from "firebase/storage";
import * as FileSystem from "expo-file-system";
import Constants from "expo-constants";
import { auth, storage } from "./firebase";

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const EXTENSION_BY_MIME = Object.entries(MIME_BY_EXTENSION).reduce(
  (acc, [ext, mime]) => ({ ...acc, [mime]: ext }),
  {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  }
);

const DEFAULT_MIME = "image/jpeg";

const sanitizeSegment = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

const inferMimeFromPath = (path) => {
  const clean = path.split("?")[0]?.split("#")[0] ?? "";
  const ext = clean.split(".").pop()?.toLowerCase();
  if (ext && MIME_BY_EXTENSION[ext]) {
    return MIME_BY_EXTENSION[ext];
  }
  return DEFAULT_MIME;
};

const parseMimeFromDataUrl = (uri) => {
  const match = uri.match(/^data:(.*?);base64,/);
  if (match && match[1]) {
    return match[1];
  }
  return DEFAULT_MIME;
};

const toDataUrl = async (uri) => {
  if (!uri) throw new Error("Image URI manquante");
  if (uri.startsWith("data:")) {
    const mime = parseMimeFromDataUrl(uri);
    return { dataUrl: uri, mimeType: mime };
  }
  const mimeType = inferMimeFromPath(uri);
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
  };
};

const uploadDataUrl = async (dataUrl, path, mimeType) => {
  const storageRef = ref(storage, path);
  const encryptedDataUrl = buildEncryptedDataUrl(dataUrl, mimeType);
  await uploadString(storageRef, encryptedDataUrl, "data_url");
  return getDownloadURL(storageRef);
};

const requireCurrentUserContext = (email) => {
  const user = auth.currentUser;
  if (!user || !user.uid) {
    throw new Error("Authentification requise pour l'upload.");
  }
  const targetEmail = email?.trim() || user.email;
  if (!targetEmail) {
    throw new Error("Adresse email requise pour l'upload.");
  }
  return { uid: user.uid, email: targetEmail };
};

const buildPath = (uid, folder, label, extension) => {
  const safeFolder = sanitizeSegment(folder);
  const safeLabel = sanitizeSegment(label);
  const timestamp = Date.now();
  return `users/${uid}/${safeFolder}/${safeLabel}-${timestamp}.${extension}`;
};

const STORAGE_ENCRYPTION_SECRET =
  Constants.expoConfig?.extra?.storageEncryptionKey ??
  "campusride-storage-secret";

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const base64EncodeBinary = (input) => {
  let output = "";
  let i = 0;
  while (i < input.length) {
    const byte1 = input.charCodeAt(i++) & 0xff;
    const byte2 = i < input.length ? input.charCodeAt(i++) & 0xff : NaN;
    const byte3 = i < input.length ? input.charCodeAt(i++) & 0xff : NaN;
    const triple = (byte1 << 16) | (isNaN(byte2) ? 0 : byte2 << 8) | (isNaN(byte3) ? 0 : byte3);
    output += BASE64_CHARS[(triple >> 18) & 0x3f];
    output += BASE64_CHARS[(triple >> 12) & 0x3f];
    output += isNaN(byte2) ? "=" : BASE64_CHARS[(triple >> 6) & 0x3f];
    output += isNaN(byte3) ? "=" : BASE64_CHARS[triple & 0x3f];
  }
  return output;
};

const xorEncryptPayload = (payload, key) => {
  let encrypted = "";
  const secret = key || STORAGE_ENCRYPTION_SECRET;
  for (let i = 0; i < payload.length; i += 1) {
    const payloadCode = payload.charCodeAt(i);
    const secretCode = secret.charCodeAt(i % secret.length);
    encrypted += String.fromCharCode(payloadCode ^ secretCode);
  }
  return base64EncodeBinary(encrypted);
};

const buildEncryptedDataUrl = (dataUrl, mimeType) => {
  const [, payload] = dataUrl.split(",");
  if (!payload) {
    throw new Error("Chargement de données invalide pour chiffrement.");
  }
  const cipher = xorEncryptPayload(payload, STORAGE_ENCRYPTION_SECRET);
  return `data:${mimeType};base64,${cipher}`;
};

export const uploadUserDocument = async ({ email, folder, label, uri }) => {
  if (!uri) throw new Error("Fichier manquant.");
  const { uid } = requireCurrentUserContext(email);
  const { dataUrl, mimeType } = await toDataUrl(uri);
  const extension = EXTENSION_BY_MIME[mimeType] ?? "jpg";
  const path = buildPath(uid, folder, label, extension);
  return uploadDataUrl(dataUrl, path, mimeType);
};

export const uploadStudentCard = async ({ email, uri }) =>
  uploadUserDocument({ email, uri, folder: "documents", label: "student-card" });

export const uploadProfileSelfie = async ({ email, uri }) =>
  uploadUserDocument({ email, uri, folder: "selfies", label: "identity-selfie" });

export const uploadDriverLicenseSide = async ({ email, uri, side }) =>
  uploadUserDocument({
    email,
    uri,
    folder: "driver-licenses",
    label: `license-${side}`,
  });

import { ref, uploadString, getDownloadURL } from "firebase/storage";
import * as FileSystem from "expo-file-system";
import { storage } from "./firebase";

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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

const uploadDataUrl = async (dataUrl, path) => {
  const storageRef = ref(storage, path);
  await uploadString(storageRef, dataUrl, "data_url");
  return getDownloadURL(storageRef);
};

const buildPath = (email, folder, label, extension) => {
  const safeEmail = sanitizeSegment(email);
  const safeLabel = sanitizeSegment(label);
  const timestamp = Date.now();
  return `users/${safeEmail}/${folder}/${safeLabel}-${timestamp}.${extension}`;
};

export const uploadUserDocument = async ({ email, folder, label, uri }) => {
  if (!email) throw new Error("Adresse email requise pour l'upload.");
  if (!uri) throw new Error("Fichier manquant.");
  const { dataUrl, mimeType } = await toDataUrl(uri);
  const extension = EXTENSION_BY_MIME[mimeType] ?? "jpg";
  const path = buildPath(email, folder, label, extension);
  return uploadDataUrl(dataUrl, path);
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

const admin = require('firebase-admin');
const { decrypt } = require('./crypto');

const db = admin.firestore();
const bucket = admin.storage().bucket();

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/json',
]);
const DRIVER_DOC_COLLECTION = 'driverDocuments';

const driverDocPath = (email, type) => `driver-docs/${email}/${type}-${Date.now()}`;

const parseMetadata = (payload) => {
  const metadata = payload?.metadata ?? {};
  const mimeType = metadata.mimeType ?? 'application/octet-stream';
  if (!ACCEPTED_TYPES.has(mimeType)) {
    throw new Error('FORMAT_NOT_ALLOWED');
  }
  if (metadata.byteLength && metadata.byteLength > MAX_FILE_SIZE) {
    throw new Error('FILE_TOO_LARGE');
  }
  if (metadata.licenseExpiry) {
    const expiry = new Date(metadata.licenseExpiry);
    if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
      throw new Error('LICENSE_EXPIRED');
    }
  }
  return metadata;
};

const saveEncryptedFile = async ({ email, documentType, ciphertext }) => {
  const buffer = decrypt(ciphertext);
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw new Error('FILE_TOO_LARGE');
  }
  const path = driverDocPath(email, documentType);
  const file = bucket.file(path);
  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: 'application/octet-stream',
      metadata: { owner: email, documentType },
    },
  });
  return path;
};

const docStatusRef = (email, docType) =>
  db.collection(DRIVER_DOC_COLLECTION).doc(`${email.toLowerCase()}-${docType}`);

const requestReview = async (email, documentType, storagePath, metadata) => {
  const ref = docStatusRef(email, documentType);
  await ref.set(
    {
      email,
      documentType,
      storagePath,
      metadata,
      status: 'pending',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
};

const parseEmail = (value) => {
  if (!value || typeof value !== 'string') throw new Error('EMAIL_REQUIRED');
  const normalized = value.trim().toLowerCase();
  if (!normalized) throw new Error('EMAIL_REQUIRED');
  return normalized;
};

const serializeSnapshot = async (email) => {
  const snapshot = await db
    .collection(DRIVER_DOC_COLLECTION)
    .where('email', '==', email)
    .get();
  const documents = {};
  snapshot.forEach((doc) => {
    const data = doc.data();
    documents[data.documentType] = {
      status: data.status,
      storagePath: data.storagePath ?? null,
      metadata: data.metadata ?? null,
      updatedAt: data.updatedAt ? data.updatedAt.toMillis() : null,
    };
  });
  return { email, documents };
};

module.exports = {
  parseMetadata,
  saveEncryptedFile,
  requestReview,
  parseEmail,
  serializeSnapshot,
};

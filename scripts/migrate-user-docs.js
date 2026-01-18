#!/usr/bin/env node
/**
 * Migration helper to move Firestore documents from legacy IDs (emails or random) to
 * user-scoped document paths (collection/{uid}) while keeping the payload intact.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/migrate-user-docs.js
 */
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const normalizeEmail = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }
  return value.trim().toLowerCase();
};

const emailUidCache = new Map();

const fetchUidByEmail = async (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (emailUidCache.has(normalized)) {
    return emailUidCache.get(normalized);
  }
  try {
    const user = await admin.auth().getUserByEmail(normalized);
    emailUidCache.set(normalized, user.uid);
    return user.uid;
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      console.warn(`[migration] user not found for email ${normalized}`);
      return null;
    }
    throw error;
  }
};

const collectionsToMigrate = [
  {
    name: "users",
    uidFields: ["authUid", "uid"],
    emailFields: ["email"],
    uidFieldToSet: "authUid",
  },
  {
    name: "wallets",
    uidFields: ["ownerUid", "authUid", "uid"],
    emailFields: ["email"],
    uidFieldToSet: "ownerUid",
  },
  {
    name: "businessQuotes",
    uidFields: ["createdByUid"],
    emailFields: ["createdByEmail", "email"],
    uidFieldToSet: "createdByUid",
  },
  {
    name: "notificationPreferences",
    uidFields: ["ownerUid", "uid"],
    emailFields: ["email"],
    uidFieldToSet: "ownerUid",
  },
  {
    name: "notificationTokens",
    uidFields: ["ownerUid", "uid"],
    emailFields: ["email"],
    uidFieldToSet: "ownerUid",
  },
];

const resolveUid = async (config, docSnapshot) => {
  const data = docSnapshot.data() ?? {};
  for (const field of config.uidFields ?? []) {
    const candidate = data[field];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  for (const emailField of config.emailFields ?? []) {
    const email = data[emailField];
    const uidByEmail = await fetchUidByEmail(email);
    if (uidByEmail) {
      return uidByEmail;
    }
  }
  return null;
};

const migrateCollection = async (config) => {
  console.log(`[migration] scanning collection ${config.name}`);
  const snapshot = await db.collection(config.name).get();
  let migratedCount = 0;
  for (const docSnapshot of snapshot.docs) {
    const docId = docSnapshot.id;
    const uid = await resolveUid(config, docSnapshot);
    if (!uid) {
      continue;
    }
    if (uid === docId) {
      if (
        config.uidFieldToSet &&
        docSnapshot.data()?.[config.uidFieldToSet] !== uid
      ) {
        await docSnapshot.ref.set(
          { [config.uidFieldToSet]: uid },
          { merge: true }
        );
      }
      continue;
    }
    const targetRef = db.collection(config.name).doc(uid);
    const payload = {
      ...docSnapshot.data(),
      ...(config.uidFieldToSet ? { [config.uidFieldToSet]: uid } : {}),
      migratedFrom: docId,
      migratedAt: FieldValue.serverTimestamp(),
    };
    await targetRef.set(payload, { merge: true });
    await docSnapshot.ref.delete();
    migratedCount += 1;
    console.log(
      `[migration] ${config.name}: ${docId} → ${uid} (deleted source)`
    );
  }
  if (migratedCount === 0) {
    console.log(`[migration] no documents migrated for ${config.name}`);
  } else {
    console.log(
      `[migration] migrated ${migratedCount} documents for ${config.name}`
    );
  }
};

(async () => {
  try {
    console.log("[migration] starting user document normalization");
    for (const config of collectionsToMigrate) {
      await migrateCollection(config);
    }
    console.log("[migration] complete");
  } catch (error) {
    console.error("[migration] failed", error);
    process.exit(1);
  }
})();

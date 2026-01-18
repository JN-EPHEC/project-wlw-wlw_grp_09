const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { parseMetadata, saveEncryptedFile, requestReview, parseEmail, serializeSnapshot } = require('./src/driverDocuments');
const setDriverDocumentsCorsHeaders = (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  const requestHeaders = req.headers['access-control-request-headers'];
  res.set(
    'Access-Control-Allow-Headers',
    requestHeaders ?? 'Content-Type, Authorization'
  );
};

admin.initializeApp();
const db = admin.firestore();

const RESEND_API_KEY =
  process.env.RESEND_API_KEY || functions.config().resend?.api_key || "";
const RESEND_FROM =
  process.env.RESEND_FROM ||
  functions.config().resend?.from ||
  "CampusRide <no-reply@campusride.app>";
const APP_BASE_URL =
  process.env.APP_BASE_URL || functions.config().app?.base_url || "https://campusride.app";

const formatExpiryLabel = (expiresAt) => {
  if (!expiresAt) return "dans les 10 prochaines minutes";
  const expiryDate = new Date(expiresAt);
  if (Number.isNaN(expiryDate.getTime())) return "dans les 10 prochaines minutes";
  return `avant ${expiryDate.toLocaleTimeString("fr-BE", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const buildVerificationEmail = (code, expiresAt) => {
  const safeCode = String(code).padStart(4, "0");
  const expiryLabel = formatExpiryLabel(expiresAt);
  const verifyUrl = `${APP_BASE_URL}/verify-email`;
  const subject = "Ton code de vérification CampusRide";
  const text = `Ton code sécurisé est ${safeCode}. Entre-le dans l’application CampusRide ${expiryLabel} pour valider ton compte.`;
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1C1C1C">
      <p>Bonjour 👋</p>
      <p>Merci d’utiliser CampusRide. Utilise le code ci-dessous pour confirmer ton e-mail.</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0;color:#6C63FF">${safeCode}</p>
      <p>Ce code expire ${expiryLabel}. Clique ci-dessous si tu préfères continuer sur le web :</p>
      <p><a href="${verifyUrl}" style="background:#6C63FF;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Valider mon compte</a></p>
      <p style="margin-top:32px;font-size:13px;color:#6B6B6B">Si tu n’es pas à l’origine de cette demande, tu peux ignorer cet e-mail.</p>
    </div>
  `;
  return { subject, text, html };
};

const sendEmail = async ({ to, subject, text, html }) => {
  if (!RESEND_API_KEY) {
    functions.logger.warn(
      "[email] RESEND_API_KEY manquant. Aucun e-mail n’a été envoyé.",
      { to }
    );
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorText}`);
  }
};

const deliverVerificationEmail = async (email, code, expiresAt) => {
  const template = buildVerificationEmail(code, expiresAt);
  await sendEmail({ to: email, ...template });
};

const shouldSendVerificationEmail = (before, after) => {
  if (!after || !after.verificationCode || !after.email) return false;
  if (!before) return true;
  if (before.verificationCode !== after.verificationCode) return true;
  if (before.verificationExpiresAt !== after.verificationExpiresAt) return true;
  return false;
};

exports.createReceiptOnDriverCreate = functions.firestore
  .document("users/{userId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const userId = context.params.userId;

    if (data.role !== "driver") {
      return null;
    }

    return db.collection("receipts").add({
      userId,
      fullName: data.firstName + " " + data.lastName,
      email: data.email,
      phone: data.phone,
      carPlate: data.carPlate,
      carModel: data.carModel,
      type: "driver_registration",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

exports.notifyVerificationCode = functions.firestore
  .document("users/{userId}")
  .onWrite(async (change) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!shouldSendVerificationEmail(before, after)) {
      return null;
    }
    try {
      await deliverVerificationEmail(
        after.email.toLowerCase(),
        after.verificationCode,
        after.verificationExpiresAt
      );
      functions.logger.info("Verification email sent", {
        email: after.email,
        userId: change.after.id,
      });
    } catch (error) {
      functions.logger.error("Verification email failed", {
        email: after.email,
        error: error.message,
      });
    }
    return null;
  });

exports.driverDocuments = functions.https.onRequest(async (req, res) => {
  setDriverDocumentsCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method === 'GET') {
    try {
      const email = parseEmail(req.query.email);
      const snapshot = await serializeSnapshot(email);
      return res.status(200).json(snapshot);
    } catch (error) {
      const status = error.message === 'EMAIL_REQUIRED' ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { email, documentType, ciphertext, metadata } = req.body || {};
      const normalizedEmail = parseEmail(email);
      if (!documentType) {
        return res.status(400).json({ error: 'DOCUMENT_TYPE_REQUIRED' });
      }
      if (!ciphertext) {
        return res.status(400).json({ error: 'CIPHERTEXT_REQUIRED' });
      }
      const parsedMetadata = parseMetadata({ metadata });
      const storagePath = await saveEncryptedFile({
        email: normalizedEmail,
        documentType,
        ciphertext,
      });
      await requestReview(normalizedEmail, documentType, storagePath, parsedMetadata);
      const snapshot = await serializeSnapshot(normalizedEmail);
      return res.status(200).json(snapshot);
    } catch (error) {
      console.error('[driverDocuments] failed', error);
      const status = ['FORMAT_NOT_ALLOWED', 'FILE_TOO_LARGE', 'LICENSE_EXPIRED'].includes(error.message)
        ? 400
        : 500;
      return res.status(status).json({ error: error.message || 'UNKNOWN_ERROR' });
    }
  }

  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
});

const BATCH_DELETE_LIMIT = 400;

const annotateStep = (error, step, collection = null) => {
  const err = error instanceof Error ? error : new Error(String(error));
  err.step = step;
  if (collection) {
    err.collection = collection;
  }
  return err;
};

async function deleteDocAndSubcollections(docRef) {
  const subcollections = await docRef.listCollections();
  for (const collectionRef of subcollections) {
    await deleteCollectionRecursively(collectionRef);
  }
  await docRef.delete();
}

async function deleteCollectionRecursively(collectionRef) {
  const documentRefs = await collectionRef.listDocuments();
  for (const docRef of documentRefs) {
    await deleteDocAndSubcollections(docRef);
  }
}

const ensureDeletedCountEntry = (deletedCounts, label) => {
  if (deletedCounts[label] === undefined) {
    deletedCounts[label] = 0;
  }
};

const deleteDocIfExists = async (docRef, label, deletedCounts, options = {}) => {
  ensureDeletedCountEntry(deletedCounts, label);
  try {
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return false;
    }
    if (options.deleteSubcollections) {
      await deleteDocAndSubcollections(docRef);
    } else {
      await docRef.delete();
    }
    deletedCounts[label] += 1;
    return true;
  } catch (error) {
    throw annotateStep(error, `firestore:${label}`, label);
  }
};

const deleteQueryBatch = async (label, queryFactory, deletedCounts) => {
  ensureDeletedCountEntry(deletedCounts, label);
  try {
    let deleted = 0;
    while (true) {
      const snapshot = await queryFactory().limit(BATCH_DELETE_LIMIT).get();
      if (snapshot.empty) {
        break;
      }
      const batch = db.batch();
      snapshot.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      deleted += snapshot.size;
    }
    deletedCounts[label] += deleted;
    return deleted;
  } catch (error) {
    throw annotateStep(error, `firestore:${label}`, label);
  }
};

const deleteStorageForUser = async (bucket, uid) => {
  try {
    const [files] = await bucket.getFiles({ prefix: `users/${uid}/`, autoPaginate: true });
    if (!files.length) {
      return 0;
    }
    await bucket.deleteFiles({ prefix: `users/${uid}/`, autoPaginate: true });
    return files.length;
  } catch (error) {
    throw annotateStep(error, 'storage:delete', 'storage');
  }
};

const logAuditRecord = async (uid, email, deletedCounts, status, metadata = {}) => {
  try {
    await db.collection('auditLogs').add({
      uid,
      email,
      action: 'delete-account',
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedCounts,
      status,
      ...metadata,
    });
  } catch (logError) {
    functions.logger.error('Failed to write account deletion audit log', {
      uid,
      error: logError,
    });
  }
};

const normalizeEmail = (value) => {
  if (!value) {
    return null;
  }
  return value.trim().toLowerCase();
};

const isUniversityEmail = (value) => {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return value.toLowerCase().endsWith('@students.ephec.be');
};

exports.deleteAccountAndData = functions.https.onCall(async (_, context) => {
  const deletedCounts = {};
  let uid = null;
  let email = null;
  let step = 'auth-check';
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[backend] 🟢 deleteAccountAndData called');
  console.log('[backend] UID:', context.auth?.uid ?? '(missing)');
  console.log('[backend] Time:', new Date().toISOString());
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const logStep = (nextStep, meta = {}) => {
    step = nextStep;
    console.log(`[deleteAccountAndData] step=${nextStep}`, { uid, email, ...meta });
  };

  try {
    logStep('auth-check');
    if (!context.auth?.uid) {
      console.error('[backend] 🔴 ERROR: Not authenticated');
      throw new functions.https.HttpsError('unauthenticated', 'Connexion requise.', { step });
    }
    uid = context.auth.uid;

    logStep('load-user');
    const userRecord = await admin.auth().getUser(uid);
    console.log('[backend] 🟢 Firestore user loaded for deletion', { uid, email });
    email = normalizeEmail(userRecord.email);
    if (email && !isUniversityEmail(email)) {
      throw new functions.https.HttpsError('permission-denied', 'Ton adresse e-mail n’est pas autorisée à supprimer ce compte.', {
        step,
      });
    }
    functions.logger.info('deleteAccountAndData', { uid, email, step: 'start' });

    logStep('firestore-delete-users-doc');
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      await userRef.delete();
      deletedCounts.usersDoc = 1;
    } else {
      deletedCounts.usersDoc = 0;
    }

    logStep('firestore-delete-related');
    console.log('[backend] 1️⃣ Deleting Firestore related data');
    await deleteQueryBatch(
      'usersAuthUidDocs',
      () => db.collection('users').where('authUid', '==', uid),
      deletedCounts
    );
    await deleteDocIfExists(db.collection('wallets').doc(uid), 'walletsDoc', deletedCounts);
    await deleteQueryBatch(
      'walletsByOwnerUid',
      () => db.collection('wallets').where('ownerUid', '==', uid),
      deletedCounts
    );
    await deleteQueryBatch(
      'trajetsByOwnerUid',
      () => db.collection('trajets').where('ownerUid', '==', uid),
      deletedCounts
    );
    await deleteQueryBatch(
      'trajetsByDriverUid',
      () => db.collection('trajets').where('driverUid', '==', uid),
      deletedCounts
    );
    await deleteQueryBatch(
      'ridesByOwnerUid',
      () => db.collection('rides').where('ownerUid', '==', uid),
      deletedCounts
    );
    await deleteQueryBatch(
      'ridesByPassengerUid',
      () => db.collection('rides').where('passengerUid', '==', uid),
      deletedCounts
    );
    await deleteQueryBatch(
      'notificationsByUserId',
      () => db.collection('notifications').where('userId', '==', uid),
      deletedCounts
    );
    await deleteQueryBatch(
      'notificationsByOwnerUid',
      () => db.collection('notifications').where('ownerUid', '==', uid),
      deletedCounts
    );
    await deleteDocIfExists(
      db.collection('notificationPreferences').doc(uid),
      'notificationPreferencesDoc',
      deletedCounts
    );
    await deleteDocIfExists(
      db.collection('notificationTokens').doc(uid),
      'notificationTokensDoc',
      deletedCounts
    );
    await deleteQueryBatch(
      'notificationTokensByOwnerUid',
      () => db.collection('notificationTokens').where('ownerUid', '==', uid),
      deletedCounts
    );
    await deleteQueryBatch(
      'notificationTokensByAuthUid',
      () => db.collection('notificationTokens').where('authUid', '==', uid),
      deletedCounts
    );
    await deleteQueryBatch(
      'businessQuotesByUid',
      () => db.collection('businessQuotes').where('createdByUid', '==', uid),
      deletedCounts
    );
    await deleteDocIfExists(
      db.collection('driverVerifications').doc(uid),
      'driverVerificationsDoc',
      deletedCounts
    );

    logStep('storage-delete');
    console.log('[backend] 3️⃣ Cleaning up storage');
    let storageCount = 0;
    try {
      const storageBucket = admin.storage().bucket();
      storageCount = await deleteStorageForUser(storageBucket, uid);
      console.log('[backend] 3️⃣ ✅ Storage cleaned', { storageCount });
    } catch (storageError) {
      console.warn('[backend] 3️⃣ ⚠️ Storage cleanup failed (non-fatal)', storageError);
    }
    deletedCounts.storageObjects = storageCount;
    deletedCounts.storageDeleted = storageCount > 0;

    logStep('auth-delete');
    console.log('[backend] 2️⃣ Deleting auth account');
    await admin.auth().deleteUser(uid);
    console.log('[backend] 2️⃣ ✅ Auth account deleted');
    deletedCounts.authDeleted = true;
    deletedCounts.auth = 1;

    logStep('post-delete-check');
    const postCheck = await userRef.get();
    console.log(`[deleteAccountAndData] postDelete usersDoc exists? ${postCheck.exists}`);
    if (postCheck.exists) {
      throw new functions.https.HttpsError(
        'internal',
        'users/{uid} still exists after delete.',
        { step, uid }
      );
    }

    logStep('audit-log');
    await logAuditRecord(uid, email, deletedCounts, 'success', { step });
    functions.logger.info('deleteAccountAndData', { uid, email, step: 'complete', deletedCounts });
    const result = { success: true, deletedCounts };
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[backend] 🎉 SUCCESS - Returning:', JSON.stringify(result));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return result;
  } catch (error) {
    const failingStep = step ?? error?.step ?? 'auth-check';
    logStep('audit-log');
    const errorCode = error instanceof functions.https.HttpsError ? error.code : error?.code ?? 'internal';
    const errorMessage =
      error instanceof functions.https.HttpsError
        ? error.message
        : error?.message || 'Impossible de supprimer ton compte pour le moment.';

    await logAuditRecord(uid, email, deletedCounts, 'error', {
      step: failingStep,
      error: { code: errorCode, message: errorMessage },
    });

    functions.logger.error('deleteAccountAndData failed', {
      uid,
      email,
      step: failingStep,
      error,
    });

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      errorCode,
      errorMessage,
      { step: failingStep, code: errorCode, message: errorMessage, uid }
    );
  }
});

const toCents = (value) => Math.round((Number(value) || 0) * 100);

const buildTransactionData = ({
  amountCents,
  direction,
  type = "adjustment",
  source = "adjustment",
  description = null,
  rideId = null,
  counterpartyUid = null,
  idempotencyKey = null,
  createdByUid,
  balanceBeforeCents,
  balanceAfterCents,
}) => ({
  type,
  direction,
  amountCents,
  balanceBeforeCents,
  balanceAfterCents,
  status: "completed",
  source,
  description,
  rideId,
  counterpartyUid,
  createdAt: admin.firestore.Timestamp.now(),
  createdByUid,
  idempotencyKey,
});

const buildWalletUpdate = (existing, uid, balanceCents, now) => ({
  balanceCents,
  ownerUid: uid,
  currency: existing.currency ?? "EUR",
  payoutMethod: existing.payoutMethod ?? null,
  createdAt: existing.createdAt ?? now,
  updatedAt: now,
});

const getTransactionRef = (walletRef, idempotencyKey) =>
  idempotencyKey
    ? walletRef.collection("transactions").doc(idempotencyKey)
    : walletRef.collection("transactions").doc();

exports.adjustBalance = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
  }
  const amountCents = toCents(data.amountCents ?? 0);
  if (amountCents <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "Montant invalide.");
  }
  const direction = data.direction === "debit" ? "debit" : "credit";
  const walletRef = db.collection("wallets").doc(uid);
  const now = admin.firestore.Timestamp.now();
  const txRef = getTransactionRef(walletRef, data.idempotencyKey);

  return db.runTransaction(async (transaction) => {
    if (data.idempotencyKey) {
      const existingTx = await transaction.get(txRef);
      if (existingTx.exists) {
        return { balanceCents: existingTx.data().balanceAfterCents };
      }
    }
    const walletSnap = await transaction.get(walletRef);
    const walletData = walletSnap.data() ?? {};
    const balanceCents =
      typeof walletData.balanceCents === "number"
        ? walletData.balanceCents
        : toCents(walletData.balance ?? 0);
    const delta = direction === "debit" ? -amountCents : amountCents;
    const newBalance = balanceCents + delta;
    if (newBalance < 0) {
      throw new functions.https.HttpsError("failed-precondition", "Solde insuffisant.");
    }
    const txData = buildTransactionData({
      amountCents,
      direction,
      source: data.source ?? "wallet-adjustment",
      description: data.description ?? null,
      rideId: data.rideId ?? null,
      counterpartyUid: data.counterpartyUid ?? null,
      idempotencyKey: data.idempotencyKey ?? null,
      createdByUid: uid,
      balanceBeforeCents: balanceCents,
      balanceAfterCents: newBalance,
    });
    txData.metadata = data.metadata ?? null;
    transaction.set(walletRef, buildWalletUpdate(walletData, uid, newBalance, now), {
      merge: true,
    });
    transaction.set(txRef, txData, { merge: true });
    return { balanceCents: newBalance };
  });
});

exports.transferForRide = functions.https.onCall(async (data, context) => {
  const initiatorUid = context.auth?.uid;
  if (!initiatorUid) {
    throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
  }
  const passengerUid = data.passengerUid;
  const driverUid = data.driverUid;
  if (!passengerUid || !driverUid) {
    throw new functions.https.HttpsError("invalid-argument", "UID manquant.");
  }
  if (initiatorUid !== passengerUid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Tu dois être le passager pour initier le paiement."
    );
  }
  const amountCents = toCents(data.amountCents ?? 0);
  const feeCents = toCents(data.feeCents ?? 0);
  if (amountCents <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "Montant invalide.");
  }
  if (feeCents < 0 || feeCents > amountCents) {
    throw new functions.https.HttpsError("invalid-argument", "Frais invalides.");
  }
  const passengerRef = db.collection("wallets").doc(passengerUid);
  const driverRef = db.collection("wallets").doc(driverUid);
  const passengerTxRef = getTransactionRef(passengerRef, data.idempotencyKey);
  const driverKey = data.idempotencyKey ? `${data.idempotencyKey}-driver` : undefined;
  const driverTxRef = getTransactionRef(driverRef, driverKey);

  return db.runTransaction(async (transaction) => {
    if (data.idempotencyKey) {
      const existingPassengerTx = await transaction.get(passengerTxRef);
      if (existingPassengerTx.exists) {
        return {
          passengerBalance: existingPassengerTx.data().balanceAfterCents,
          driverBalance: existingPassengerTx.data().counterpartyUid
            ? (await transaction.get(driverRef)).data().balanceCents
            : null,
        };
      }
    }
    const passengerSnap = await transaction.get(passengerRef);
    const driverSnap = await transaction.get(driverRef);
    const passengerData = passengerSnap.data() ?? {};
    const driverData = driverSnap.data() ?? {};
    const passengerBalance =
      typeof passengerData.balanceCents === "number"
        ? passengerData.balanceCents
        : toCents(passengerData.balance ?? 0);
    const driverBalance =
      typeof driverData.balanceCents === "number"
        ? driverData.balanceCents
        : toCents(driverData.balance ?? 0);
    const totalDebit = amountCents + feeCents;
    if (passengerBalance < totalDebit) {
      throw new functions.https.HttpsError("failed-precondition", "Solde insuffisant.");
    }
    const driverCredit = amountCents - feeCents;
    const now = admin.firestore.Timestamp.now();
    const passengerTx = buildTransactionData({
      amountCents: totalDebit,
      direction: "debit",
      source: "ride-payment",
      description: `Ride ${data.rideId}`,
      rideId: data.rideId ?? null,
      counterpartyUid: driverUid,
      idempotencyKey: data.idempotencyKey ?? null,
      createdByUid: passengerUid,
      balanceBeforeCents: passengerBalance,
      balanceAfterCents: passengerBalance - totalDebit,
    });
    const driverTx = buildTransactionData({
      amountCents: driverCredit,
      direction: "credit",
      source: "ride-payment",
      description: `Ride ${data.rideId}`,
      rideId: data.rideId ?? null,
      counterpartyUid: passengerUid,
      idempotencyKey: `${data.idempotencyKey ?? ""}-driver`,
      createdByUid: driverUid,
      balanceBeforeCents: driverBalance,
      balanceAfterCents: driverBalance + driverCredit,
    });
    passengerTx.metadata = data.metadata ?? null;
    driverTx.metadata = data.metadata ?? null;
    transaction.set(
      passengerRef,
      buildWalletUpdate(passengerData, passengerUid, passengerBalance - totalDebit, now),
      { merge: true }
    );
    transaction.set(passengerTxRef, passengerTx, { merge: true });
    transaction.set(
      driverRef,
      buildWalletUpdate(driverData, driverUid, driverBalance + driverCredit, now),
      { merge: true }
    );
    transaction.set(driverTxRef, driverTx, { merge: true });
    return {
      passengerBalance: passengerBalance - totalDebit,
      driverBalance: driverBalance + driverCredit,
    };
  });
});

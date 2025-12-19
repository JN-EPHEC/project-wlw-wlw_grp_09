const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { parseMetadata, saveEncryptedFile, requestReview, parseEmail, serializeSnapshot } = require('./src/driverDocuments');

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
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

const STUDENT_EMAIL_PATTERN = /@students\.ephec\.be$/i;
const VERIFICATION_COLLECTION = "emailVerifications";
const AUTH_USERS_COLLECTION = "authUsers";
const CODE_LENGTH = 4;
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

const smtpConfig = functions.config().smtp || {};
const transporter =
  smtpConfig && smtpConfig.user
    ? nodemailer.createTransport({
        host: smtpConfig.host,
        port: Number(smtpConfig.port || 465),
        secure: smtpConfig.secure !== "false",
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.pass,
        },
      })
    : null;

const sanitizeEmail = (value = "") => value.trim().toLowerCase();
const isStudentEmail = (value) => STUDENT_EMAIL_PATTERN.test(value);
const generateCode = () => Math.floor(10 ** (CODE_LENGTH - 1) + Math.random() * 9 * 10 ** (CODE_LENGTH - 1)).toString();
const hashCode = (code, salt) => crypto.createHash("sha256").update(`${salt}:${code}`).digest("hex");

const throwHttpsError = (status, detail, message) => {
  throw new functions.https.HttpsError(status, message || detail, detail);
};

const sendVerificationEmail = async (to, code) => {
  if (!transporter) {
    functions.logger.warn("SMTP transport not configured. Verification code:", code);
    return;
  }
  const subject = "Code de vérification CampusRide";
  const text = `Ton code de vérification est ${code}. Il expire dans 10 minutes.`;
  const html = `<p>Salut 👋</p><p>Ton code de vérification est <strong style="font-size:18px;">${code}</strong>.</p><p>Il expire dans 10 minutes. Si tu n'es pas à l'origine de cette demande, ignore simplement cet email.</p>`;
  await transporter.sendMail({
    to,
    from: smtpConfig.from || smtpConfig.user,
    subject,
    text,
    html,
  });
};

exports.requestVerificationCode = functions.https.onCall(async (data, context) => {
  const email = sanitizeEmail(data?.email || "");
  if (!email) {
    throwHttpsError("invalid-argument", "EMAIL_REQUIRED");
  }
  if (!isStudentEmail(email)) {
    throwHttpsError("invalid-argument", "EMAIL_INVALID");
  }

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (error) {
    functions.logger.warn("requestVerificationCode.getUser error", error);
    throwHttpsError("not-found", "USER_NOT_FOUND");
  }

  const code = generateCode();
  const salt = crypto.randomBytes(8).toString("hex");
  const expiresAt = Date.now() + CODE_TTL_MS;
  const docRef = db.collection(VERIFICATION_COLLECTION).doc(email);

  await docRef.set(
    {
      email,
      uid: userRecord.uid,
      codeHash: hashCode(code, salt),
      salt,
      expiresAt,
      attempts: 0,
      status: "pending",
      lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db
    .collection(AUTH_USERS_COLLECTION)
    .doc(email)
    .set(
      {
        email,
        campusVerified: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  await sendVerificationEmail(email, code);
  return { success: true };
});

exports.verifyEmailCode = functions.https.onCall(async (data, context) => {
  const email = sanitizeEmail(data?.email || "");
  const code = String(data?.code || "").trim();
  if (!email || !code) {
    throwHttpsError("invalid-argument", "EMAIL_AND_CODE_REQUIRED");
  }
  if (code.length !== CODE_LENGTH) {
    throwHttpsError("invalid-argument", "CODE_LENGTH_INVALID");
  }

  const docRef = db.collection(VERIFICATION_COLLECTION).doc(email);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throwHttpsError("not-found", "CODE_NOT_FOUND");
  }
  const entry = snapshot.data();
  if (!entry?.codeHash || !entry?.salt) {
    throwHttpsError("failed-precondition", "CODE_NOT_ACTIVE");
  }
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    await docRef.update({
      status: "expired",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throwHttpsError("deadline-exceeded", "CODE_EXPIRED");
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    throwHttpsError("resource-exhausted", "TOO_MANY_ATTEMPTS");
  }

  const incomingHash = hashCode(code, entry.salt);
  if (incomingHash !== entry.codeHash) {
    await docRef.update({
      attempts: (entry.attempts || 0) + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throwHttpsError("permission-denied", "INVALID_CODE");
  }

  let uid = entry.uid;
  if (!uid) {
    const userRecord = await admin.auth().getUserByEmail(email);
    uid = userRecord.uid;
  }

  await Promise.all([
    docRef.set(
      {
        status: "verified",
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        codeHash: admin.firestore.FieldValue.delete(),
        salt: admin.firestore.FieldValue.delete(),
        expiresAt: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    ),
    admin.auth().updateUser(uid, { emailVerified: true }),
    db
      .collection(AUTH_USERS_COLLECTION)
      .doc(email)
      .set(
        {
          email,
          campusVerified: true,
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
  ]);

  return { success: true };
});

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

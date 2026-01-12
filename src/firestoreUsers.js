import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";

const usersCol = collection(db, "users");
const VERIFICATION_EXPIRATION_MS = 10 * 60 * 1000;

const normalizeEmail = (value) => value.trim().toLowerCase();

const resolveUserId = (uid) => {
  const currentUid = uid || auth.currentUser?.uid;
  if (!currentUid) {
    throw new Error("AUTH_UID_REQUIRED");
  }
  return currentUid;
};

const userDocRef = (uid) => doc(usersCol, uid);

const hasDriverRole = (data) =>
  data?.role === "driver" || data?.isDriver === true;

const applyCreationTimestamp = (snapshot) =>
  snapshot.exists() ? {} : { createdAt: serverTimestamp() };

const findUserDocByEmail = async (email) => {
  const normalized = normalizeEmail(email);
  const q = query(usersCol, where("email", "==", normalized));
  const snapshot = await getDocs(q);
  const docSnap = snapshot.docs[0];
  if (!docSnap) return null;
  return {
    ref: docSnap.ref,
    id: docSnap.id,
    data: () => docSnap.data(),
  };
};

const ensureUserDocument = async (uid, email) => {
  const ref = userDocRef(uid);
  let snapshot = await getDoc(ref);
  if (snapshot.exists()) {
    return { ref, snapshot };
  }
  const legacy = await findUserDocByEmail(email);
  if (legacy && legacy.ref.id !== ref.id) {
    const legacyData = legacy.data() ?? {};
    await setDoc(ref, legacyData, { merge: true });
    await deleteDoc(legacy.ref);
    snapshot = await getDoc(ref);
  }
  return { ref, snapshot };
};

export async function savePassenger({
  firstName,
  lastName,
  email,
  phone,
  campus = "",
  studentCardUrl,
  selfieUrl,
  verified = false,
  verificationCode = null,
  verificationExpiresAt = null,
  uid = null,
}) {
  const normalizedEmail = normalizeEmail(email);
  const userId = resolveUserId(uid);
  const { ref, snapshot } = await ensureUserDocument(userId, normalizedEmail);
  const existing = snapshot.exists() ? snapshot.data() : null;
  const payload = {
    firstName,
    lastName,
    email: normalizedEmail,
    authUid: userId,
    phone,
    campus,
    role: hasDriverRole(existing) ? "driver" : "passenger",
    isPassenger: true,
    isDriver: existing?.isDriver ?? false,
    verified,
    verificationCode,
    verificationExpiresAt,
    updatedAt: serverTimestamp(),
    ...applyCreationTimestamp(snapshot),
  };

  if (studentCardUrl) payload.studentCardUrl = studentCardUrl;
  if (selfieUrl) payload.selfieUrl = selfieUrl;

  await setDoc(ref, payload, { merge: true });
  return ref.id;
}

export async function saveDriver({
  firstName,
  lastName,
  email,
  phone,
  carPlate,
  carModel,
  licenseExpiryLabel = null,
  uid = null,
}) {
  const normalizedEmail = normalizeEmail(email);
  const userId = resolveUserId(uid);
  const { ref, snapshot } = await ensureUserDocument(userId, normalizedEmail);
  const payload = {
    firstName,
    lastName,
    email: normalizedEmail,
    authUid: userId,
    phone,
    role: "driver",
    isPassenger: true,
    isDriver: true,
    carPlate: carPlate ?? null,
    carModel: carModel ?? null,
    driverVehiclePlate: carPlate ?? null,
    driverLicenseExpiryLabel: licenseExpiryLabel,
    updatedAt: serverTimestamp(),
    ...applyCreationTimestamp(snapshot),
  };

  await setDoc(ref, payload, { merge: true });
  return ref.id;
}

export async function updatePassengerProfile({
  email,
  firstName,
  lastName,
  campus,
  phone,
  studentCardUrl,
  selfieUrl,
}) {
  const existing = await findUserDocByEmail(email);

  if (!existing) {
    return savePassenger({
      firstName,
      lastName,
      email,
      phone,
      campus,
      studentCardUrl,
      selfieUrl,
    });
  }

  const payload = {
    firstName,
    lastName,
    campus,
    phone,
    updatedAt: serverTimestamp(),
  };

  if (studentCardUrl) payload.studentCardUrl = studentCardUrl;
  if (selfieUrl) payload.selfieUrl = selfieUrl;

  await updateDoc(existing.ref, payload);

  return existing.id;
}

export async function getPassengerProfile(email) {
  const existing = await findUserDocByEmail(email);
  if (!existing) return null;
  return { id: existing.id, ...existing.data() };
}

export async function setPassengerVerificationCode(email, code) {
  const existing = await findUserDocByEmail(email);
  if (!existing) throw new Error("Utilisateur introuvable pour la vérification.");
  const expiresAt = Date.now() + VERIFICATION_EXPIRATION_MS;
  await updateDoc(existing.ref, {
    verificationCode: code,
    verificationExpiresAt: expiresAt,
    verified: false,
    updatedAt: serverTimestamp(),
  });
  return { id: existing.id, expiresAt };
}

export async function markPassengerVerified(email) {
  const existing = await findUserDocByEmail(email);
  if (!existing) throw new Error("Utilisateur introuvable pour la vérification.");
  await updateDoc(existing.ref, {
    verified: true,
    verificationCode: null,
    verificationExpiresAt: null,
    updatedAt: serverTimestamp(),
  });
  return { id: existing.id };
}

export async function saveDriverDocuments(email, data) {
  const existing = await findUserDocByEmail(email);
  if (!existing) {
    throw new Error("Utilisateur introuvable pour l'enregistrement des documents.");
  }

  const payload = {
    updatedAt: serverTimestamp(),
    role: "driver",
    isDriver: true,
    isPassenger: true,
  };

  if (data.driverLicenseFrontUrl) {
    payload.driverLicenseFrontUrl = data.driverLicenseFrontUrl;
  }
  if (data.driverLicenseBackUrl) {
    payload.driverLicenseBackUrl = data.driverLicenseBackUrl;
  }
  if (data.vehiclePhotoUrl) {
    payload.vehiclePhotoUrl = data.vehiclePhotoUrl;
  }
  if (data.vehiclePlate) {
    payload.driverVehiclePlate = data.vehiclePlate;
    payload.carPlate = data.vehiclePlate;
  }
  if (data.licenseExpiryLabel) {
    payload.driverLicenseExpiryLabel = data.licenseExpiryLabel;
  }
  if (data.licenseExpiryISO) {
    payload.driverLicenseExpiryISO = data.licenseExpiryISO;
  }
  if (data.selfieUrl) {
    payload.driverSelfieUrl = data.selfieUrl;
  }

  await updateDoc(existing.ref, payload);
  return existing.id;
}

export async function updateUserRoles(email, { driver, passenger }) {
  const existing = await findUserDocByEmail(email);
  if (!existing) {
    throw new Error("Utilisateur introuvable pour la mise à jour des rôles.");
  }
  const payload = {
    updatedAt: serverTimestamp(),
  };
  if (typeof driver === "boolean") {
    payload.isDriver = driver;
    if (driver) {
      payload.role = "driver";
    }
  }
  if (typeof passenger === "boolean") {
    payload.isPassenger = passenger;
  }
  await updateDoc(existing.ref, payload);
  return existing.id;
}

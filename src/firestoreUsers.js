import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const usersCol = collection(db, "users");

export async function savePassenger({
  firstName,
  lastName,
  email,
  phone,
  campus = "",
  studentCardUrl,
  selfieUrl,
}) {
  const payload = {
    firstName,
    lastName,
    email,
    phone,
    campus,
    role: "passenger",
    createdAt: serverTimestamp(),
  };

  if (studentCardUrl) payload.studentCardUrl = studentCardUrl;
  if (selfieUrl) payload.selfieUrl = selfieUrl;

  const docRef = await addDoc(usersCol, payload);

  return docRef.id;
}

export async function saveDriver({
  firstName,
  lastName,
  email,
  phone,
  carPlate,
  carModel,
}) {
  const docRef = await addDoc(usersCol, {
    firstName,
    lastName,
    email,
    phone,
    role: "driver",
    carPlate,
    carModel,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

async function findUserDocByEmail(email) {
  const q = query(usersCol, where("email", "==", email));
  const snapshot = await getDocs(q);
  return snapshot.docs[0] ?? null;
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

export async function saveDriverDocuments(email, data) {
  const existing = await findUserDocByEmail(email);
  if (!existing) {
    throw new Error("Utilisateur introuvable pour l'enregistrement des documents.");
  }

  const payload = {
    updatedAt: serverTimestamp(),
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
  if (data.selfieUrl) {
    payload.driverSelfieUrl = data.selfieUrl;
  }

  await updateDoc(existing.ref, payload);
  return existing.id;
}

import { doc, setDoc, type SetOptions } from "firebase/firestore";

import { auth, db } from "../firebase";

const AUTH_UID_REQUIRED_ERROR = "AUTH_UID_REQUIRED";

export const requireUid = (uid?: string | null): string => {
  const resolvedUid = uid ?? auth.currentUser?.uid;
  if (!resolvedUid) {
    throw new Error(AUTH_UID_REQUIRED_ERROR);
  }
  return resolvedUid;
};

export const userDocRef = (collectionName: string, uid?: string | null) =>
  doc(db, collectionName, requireUid(uid));

export const mergeUserDocument = (
  collectionName: string,
  data: Record<string, unknown>,
  uid?: string | null,
  options?: SetOptions
) =>
  setDoc(userDocRef(collectionName, uid), data, {
    merge: true,
    ...(options ?? {}),
  });

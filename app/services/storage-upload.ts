import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/src/firebase";

function guessExt(uri: string) {
  const clean = uri.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "png";
  if (clean.endsWith(".jpg")) return "jpg";
  if (clean.endsWith(".jpeg")) return "jpeg";
  return "jpeg";
}

function extToContentType(ext: string) {
  if (ext === "png") return "image/png";
  return "image/jpeg";
}

export async function uploadUserImage(options: {
  uid: string;
  uri: string;
  folder: "documents" | "selfies" | "driver_licenses";
  filenamePrefix: string;
}) {
  const { uid, uri, folder, filenamePrefix } = options;

  const ext = guessExt(uri);
  const contentType = extToContentType(ext);

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error("Impossible de lire l’image locale.");
  }
  const blob = await response.blob();

  const path = `users/${uid}/${folder}/${filenamePrefix}-${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType,
    cacheControl: "public,max-age=3600",
  });

  const downloadURL = await getDownloadURL(storageRef);
  return { path, downloadURL, contentType };
}

export async function uploadProfileSelfie(options: { uid: string; uri: string }) {
  const uploaded = await uploadUserImage({
    uid: options.uid,
    uri: options.uri,
    folder: "selfies",
    filenamePrefix: "profile-selfie",
  });

  await setDoc(
    doc(db, "users", options.uid),
    {
      photoUrl: uploaded.downloadURL,
      photoPath: uploaded.path,
      photoUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return uploaded;
}

// firebaseConfig.js (ou firebase.js)

import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { firebaseConfig } from "./firebase_env";

// On évite d'initialiser l'app plusieurs fois
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// ➜ À utiliser partout dans ton app
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
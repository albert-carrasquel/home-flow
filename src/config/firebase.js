/* global __app_id, __firebase_config */
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';

// --- APP ID ---
// Estas variables se proporcionan automáticamente en ciertos entornos.
// En local probablemente NO existan, así que usamos defaults.
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Limpieza del appId para que sea un segmento válido de ruta en Firestore
export const appId = rawAppId.replace(/[.:]/g, '-').replace(/\//g, '-');

// --- FIREBASE CONFIG ---
// - Si __firebase_config existe (entorno "especial" tipo Canvas / Gemini), lo usamos.
// - Si no existe, usamos variables de entorno (más seguro).
const firebaseConfig =
  typeof __firebase_config !== 'undefined' && __firebase_config
    ? JSON.parse(__firebase_config)
    : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

// --- INITIALIZATION ---
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable Firestore debug logging (can be disabled in production)
if (import.meta.env.DEV) {
  setLogLevel('error'); // 'debug' for verbose logs, 'error' for production
}

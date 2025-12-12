// assets/js/firebase-client.js
// Firebase helper focused on Firestore + anonymous auth (NO Storage)
// Usage:
//   import * as FB from './firebase-client.js';
//   FB.initFirebase(firebaseConfig);
//   await FB.signInAnonymouslyIfNeeded();
//   const res = await FB.saveInvoice(metadata);

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  query,
  orderBy,
  limit as qlimit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

let app = null;
let auth = null;
let db = null;
let lastInitConfig = null;

/**
 * Init Firebase app (idempotent)
 */
export function initFirebase(firebaseConfig) {
  if (!firebaseConfig) throw new Error('firebaseConfig required');
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  auth = getAuth(app);
  db = getFirestore(app);
  lastInitConfig = firebaseConfig;
  return { app, auth, db };
}

/**
 * Ensure initialized
 */
export function ensureInit(firebaseConfig) {
  if (!app) return initFirebase(firebaseConfig);
  return { app, auth, db };
}

/**
 * Sign in anonymously if not signed in
 */
export async function signInAnonymouslyIfNeeded() {
  if (!auth) throw new Error('Firebase not initialized. Call initFirebase() first.');
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve, reject) => {
    signInAnonymously(auth)
      .then(() => {
        onAuthStateChanged(auth, user => {
          if (user) resolve(user);
        });
      })
      .catch(reject);
  });
}

/**
 * Save invoice metadata to Firestore (collection: invoices)
 * metadata: { orderName, createdAt, items, ship, discount, total, status }
 * Returns: { id, refPath }
 */
export async function saveInvoice(metadata) {
  if (!db) throw new Error('Firestore not initialized. Call initFirebase() first.');
  if (!metadata || typeof metadata !== 'object') throw new Error('metadata required');

  // attach server timestamp for ordering
  const payload = {
    ...metadata
  };

  const col = collection(db, 'invoices');
  const docRef = await addDoc(col, payload);
  return { id: docRef.id, path: `invoices/${docRef.id}` };
}

/**
 * Get invoice by id
 * Returns document data or null
 */
export async function getInvoice(id) {
  if (!db) throw new Error('Firestore not initialized. Call initFirebase() first.');
  if (!id) throw new Error('id required');
  const d = doc(db, 'invoices', id);
  const snap = await getDoc(d);
  if (!snap.exists()) return null;
  return { id: snap.id, data: snap.data() };
}

/**
 * List recent invoices (simple query)
 * options: { limit: number }
 */
export async function listInvoices(opts = {}) {
  if (!db) throw new Error('Firestore not initialized. Call initFirebase() first.');
  const lim = Number(opts.limit) || 20;
  const q = query(collection(db, 'invoices'), orderBy('createdAtServer', 'desc'), qlimit(lim));
  const snaps = await getDocs(q);
  const rows = [];
  snaps.forEach(s => rows.push({ id: s.id, data: s.data() }));
  return rows;
}

/**
 * Expose basic API globally for non-module code
 */
window.FBClient = {
  initFirebase,
  ensureInit,
  signInAnonymouslyIfNeeded,
  saveInvoice,
  getInvoice,
  listInvoices
};

console.log('[firebase-client] Firestore-only client loaded (no Storage).');

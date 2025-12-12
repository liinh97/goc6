// assets/js/firebase-client.js
// Firebase client helper for uploads, JSON storage, and DOM screenshot capture.

// Import Firebase modules (Firebase Web SDK v12+)
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";

// Internal state
let app = null;
let auth = null;
let storage = null;
let lastInitConfig = null;

/**
 * Initialize Firebase app (if not already).
 */
export function initFirebase(firebaseConfig) {
  if (!firebaseConfig) throw new Error('firebaseConfig required');

  // Warn if storageBucket is suspicious
  if (firebaseConfig.storageBucket && firebaseConfig.storageBucket.includes('firebasestorage')) {
    console.warn('[firebase-client] storageBucket nhìn không chuẩn. Dạng chuẩn: "<project-id>.appspot.com"');
  }

  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }

  auth = getAuth(app);
  storage = getStorage(app);
  lastInitConfig = firebaseConfig;

  return { app, auth, storage };
}

/**
 * Ensure Firebase is initialized.
 */
export function ensureInit(firebaseConfig) {
  if (!app) return initFirebase(firebaseConfig);
  return { app, auth, storage };
}

/**
 * Sign in anonymously if user is not yet signed in.
 */
export async function signInAnonymouslyIfNeeded() {
  if (!auth) throw new Error('Firebase not initialized. Call initFirebase() first.');

  return new Promise((resolve, reject) => {
    if (auth.currentUser) return resolve(auth.currentUser);

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
 * Upload a Blob (file) to Firebase Storage.
 * Returns { path, url }
 */
export function uploadInvoiceBlob(blob, remotePath, onProgress) {
  if (!storage) throw new Error('Firebase Storage not initialized. Call initFirebase() first.');
  if (!blob) throw new Error('blob required for upload');

  const ref = storageRef(storage, remotePath);
  const uploadTask = uploadBytesResumable(ref, blob);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      snapshot => {
        if (onProgress) {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(percent, snapshot);
        }
      },
      error => reject(error),
      async () => {
        try {
          const url = await getDownloadURL(ref);
          resolve({ path: ref.fullPath, url });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

/**
 * Upload JSON metadata as a file.
 */
export async function uploadJSON(obj, remotePath) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  return uploadInvoiceBlob(blob, remotePath);
}

/**
 * Generate a safe invoice filename: invoice_YYYY-MM-DD_HH-mm-ss.pdf
 */
export function invoiceFileName(prefix = 'invoice', ext = 'pdf') {
  const t = new Date();
  const stamp = t.toISOString().replace(/[:.]/g, '-');
  return `${prefix}_${stamp}.${ext}`;
}

/**
 * Convert a DOM node to PNG blob (requires html2canvas).
 */
export async function domNodeToPngBlob(node, scale = 2) {
  if (!node) throw new Error('node required');
  if (typeof html2canvas !== 'function') {
    throw new Error('html2canvas not found. Include html2canvas CDN trước khi gọi domNodeToPngBlob.');
  }

  const canvas = await html2canvas(node, { scale, useCORS: true, logging: false });
  return await new Promise(res => canvas.toBlob(res, 'image/png'));
}

/**
 * Upload blob with anonymous auth auto-handling.
 */
export async function ensureAuthAndUpload(blob, remotePath, onProgress) {
  if (!auth) throw new Error('Firebase not initialized. Call initFirebase() first.');
  if (!auth.currentUser) await signInAnonymouslyIfNeeded();
  return uploadInvoiceBlob(blob, remotePath, onProgress);
}

/**
 * Expose all helpers globally for non-module scripts (app.js)
 */
window.FBClient = {
  initFirebase,
  ensureInit,
  signInAnonymouslyIfNeeded,
  ensureAuthAndUpload,
  uploadInvoiceBlob,
  uploadJSON,
  invoiceFileName,
  domNodeToPngBlob
};

console.log("[firebase-client] Loaded & FBClient exposed.");

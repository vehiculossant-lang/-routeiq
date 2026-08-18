/**
 * auth-snippet.js — RouteIQ
 *
 * ⚠️ ESTO NO ES UN ARCHIVO QUE SE CARGUE SOLO CON <script src="auth-snippet.js">.
 * Es un fragmento para pegar DENTRO del <script type="module"> que ya existe
 * al inicio de index.html (líneas ~9-24), porque necesita la misma variable
 * `app` que ya crea ese bloque con `initializeApp(firebaseConfig)`.
 *
 * NO SE HA APLICADO A index.html TODAVÍA — se integra cuando confirmes que
 * ya activaste "Anonymous" en Firebase Console → Authentication → Sign-in method.
 *
 * ────────────────────────────────────────────────────────────────
 * QUÉ REEMPLAZA (bloque actual en index.html, líneas ~9-24):
 * ────────────────────────────────────────────────────────────────
 *
 *   import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
 *   import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, setDoc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
 *   const firebaseConfig = { ... };
 *   const app = initializeApp(firebaseConfig);
 *   const db = getFirestore(app);
 *   window.db = db;
 *   window.fbFns = { collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, setDoc, getDoc, getDocs };
 *   window.firebaseReady = true;                              // <-- se ELIMINA esta línea
 *   document.dispatchEvent(new Event('firebaseReady'));       // <-- y esta línea se MUEVE dentro de onAuthStateChanged
 *
 * ────────────────────────────────────────────────────────────────
 * BLOQUE NUEVO COMPLETO (sustituye el anterior tal cual):
 * ────────────────────────────────────────────────────────────────
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, setDoc, getDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAjsKAYh9m4M03Uk1zK7VLmJ0vGO1cvcek",
  authDomain: "link-mensajeria-santander.firebaseapp.com",
  projectId: "link-mensajeria-santander",
  storageBucket: "link-mensajeria-santander.firebasestorage.app",
  messagingSenderId: "1055967433955",
  appId: "1:1055967433955:web:89da4572d4b4ecec5061d6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

window.db = db;
window.auth = auth; // necesario más adelante para httpsCallable / getIdToken(true)
window.fbFns = { collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, setDoc, getDoc, getDocs };

// Antes: window.firebaseReady se marcaba true de inmediato, sin esperar nada.
// Ahora: esperamos a que exista una sesión (aunque sea anónima) antes de
// avisarle al resto de la app que puede empezar a leer/escribir Firestore,
// porque las reglas de seguridad ahora exigen isSignedIn().
let firebaseReadyDispatched = false;

onAuthStateChanged(auth, (user) => {
  if (user && !firebaseReadyDispatched) {
    firebaseReadyDispatched = true;
    window.firebaseReady = true;
    document.dispatchEvent(new Event('firebaseReady'));
  }
});

// Dispara el inicio de sesión anónimo. Si falla (ej. sin internet), no se
// marca firebaseReady y la app se queda en la pantalla de carga en vez de
// intentar leer/escribir sin sesión — preferible a un fallo silencioso de
// permission-denied en cada llamada a Firestore.
signInAnonymously(auth).catch((err) => {
  console.error('No se pudo iniciar sesión anónima:', err);
});

/**
 * ────────────────────────────────────────────────────────────────
 * NOTA IMPORTANTE — Custom Claims y refresco de token
 * ────────────────────────────────────────────────────────────────
 * Cuando la Cloud Function `verifyPin` le asigne un rol (mensajero,
 * coordinacion, vehiculos, area) al usuario anónimo autenticado vía
 * `admin.auth().setCustomUserClaims(uid, { role })`, ese rol NO aparece de
 * inmediato en el token de esta sesión — hay que forzar su refresco así,
 * justo después de que la llamada a verifyPin resuelva exitosamente:
 *
 *   await auth.currentUser.getIdToken(true);
 *
 * Esto se muestra en contexto dentro de verify-pin-calls.js.
 */

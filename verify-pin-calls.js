/**
 * verify-pin-calls.js — RouteIQ
 *
 * Ejemplos LIMPIOS (no aplicados a index.html todavía) de cómo reescribir
 * cada función que hoy compara PINs en el cliente, para que en su lugar
 * llame a Cloud Functions. Cada bloque muestra el nombre EXACTO de la
 * función actual en index.html (con su número de línea) para que integrarlo
 * después sea un copy/paste directo.
 *
 * Requiere que en el <script type="module"> (ver auth-snippet.js) exista:
 *   import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
 *   const fns = getFunctions(app);
 *   window.verifyPin          = httpsCallable(fns, "verifyPin");
 *   window.adminGetPinsConfig = httpsCallable(fns, "adminGetPinsConfig");
 *   window.adminSetPinsConfig = httpsCallable(fns, "adminSetPinsConfig");
 */


// ════════════════════════════════════════════════════════════════
// 1) verifyMPin() — hoy en index.html línea 2920-2933 (PIN de mensajero)
// ════════════════════════════════════════════════════════════════

// ANTES (compara en el cliente contra APP.cfgPins, leído sin restricción):
//
// function verifyMPin(){
//   if(checkPinBloqueado('m')){mPinBuf='';updMDots();return;}
//   const who=document.getElementById('mWho').value;
//   if(!who){showPinErr('mPinError','⚠️ Selecciona tu nombre');mPinBuf='';updMDots();return;}
//   const pin=APP.cfgPins[who]||MENSAJEROS_DATA[who]?.pin||'1234';
//   if(mPinBuf===pin){
//     mPinIntentos=0;
//     APP.user={id:who,...MENSAJEROS_DATA[who]};
//     mLoginOk();
//   } else {
//     registrarIntentoPinFallido('m');
//     mPinBuf='';updMDots();
//   }
// }

// DESPUÉS (el servidor compara; el cliente nunca ve ningún PIN real):
async function verifyMPin() {
  const who = document.getElementById('mWho').value;
  if (!who) {
    showPinErr('mPinError', '⚠️ Selecciona tu nombre');
    mPinBuf = ''; updMDots();
    return;
  }
  try {
    await window.verifyPin({ tipo: 'mensajero', pin: mPinBuf, targetId: who });
    await auth.currentUser.getIdToken(true); // refresca el token con el nuevo custom claim
    APP.user = { id: who, ...MENSAJEROS_DATA[who] };
    mLoginOk();
  } catch (e) {
    if (e.code === 'functions/resource-exhausted') {
      showPinErr('mPinError', e.message); // el mensaje de bloqueo ya viene armado del servidor
    } else {
      showPinErr('mPinError', '❌ PIN incorrecto');
    }
    mPinBuf = ''; updMDots();
  }
}
// mPinIntentos/mPinBloqueadoHasta y registrarIntentoPinFallido('m') ya NO
// se usan aquí — el conteo real vive en la Cloud Function (colección
// _pinAttempts), así que sobrevive a un F5 del navegador.


// ════════════════════════════════════════════════════════════════
// 2) verifyAPin() — hoy en index.html línea 3597-3610 (PIN de Coordinación)
// ════════════════════════════════════════════════════════════════

async function verifyAPin() {
  const who = document.getElementById('aWho').value;
  if (!who) {
    showPinErr('aPinError', '⚠️ Selecciona tu nombre');
    aPinBuf = ''; updADots();
    return;
  }
  try {
    await window.verifyPin({ tipo: 'admin', pin: aPinBuf, targetId: who });
    await auth.currentUser.getIdToken(true);
    APP.user = { id: who, ...ADMINS_DATA[who] };
    aLoginOk();
  } catch (e) {
    showPinErr('aPinError', e.code === 'functions/resource-exhausted' ? e.message : '❌ PIN incorrecto');
    aPinBuf = ''; updADots();
  }
}


// ════════════════════════════════════════════════════════════════
// 3) vVerifyPin() — hoy en index.html línea 6794-6809 (PIN de Vehículos)
// ════════════════════════════════════════════════════════════════

async function vVerifyPin() {
  try {
    await window.verifyPin({ tipo: 'vehiculos', pin: vPinBuf });
    await auth.currentUser.getIdToken(true);
    vPinBuf = ''; updVDots();
    document.getElementById('vPinError').style.display = 'none';
    vEntrarPanel();
  } catch (e) {
    vPinBuf = ''; updVDots();
    showPinErr('vPinError', e.code === 'functions/resource-exhausted' ? e.message : '❌ PIN incorrecto');
  }
}


// ════════════════════════════════════════════════════════════════
// 4) verificarAreaPin() — hoy en index.html línea 5959-5994 (número de
//    empleado por área: Paquetería, Compras, Laboratorio, etc.)
// ════════════════════════════════════════════════════════════════

// ANTES leía APP.cfgAreaPins[areaPendingId] completo (nombres, PINs y
// contacto de los 2 usuarios del área) directamente en el cliente.

async function verificarAreaPin() {
  const inputPin = areaPinBuf.trim();
  if (!inputPin) {
    document.getElementById('areaPinError').textContent = 'Ingresa tu número de empleado';
    return;
  }
  try {
    // El servidor responde solo con el nombre/contacto de QUIEN COINCIDIÓ,
    // nunca con el PIN ni los datos del otro usuario autorizado del área.
    const { data } = await window.verifyPin({ tipo: 'area', pin: inputPin, targetId: areaPendingId });
    await auth.currentUser.getIdToken(true);
    areaPinIntentos = 0;
    APP.areaUsuario = { nombre: data.nombre, contacto: data.contacto };
    areaPinReset();
    closeModal('areaPinModal');
    proceedToArea(areaPendingId);
  } catch (e) {
    areaPinReset();
    document.getElementById('areaPinError').textContent =
      e.code === 'functions/resource-exhausted' ? e.message : '❌ PIN incorrecto';
  }
}


// ════════════════════════════════════════════════════════════════
// 5) verifyAccessPin() — hoy en index.html línea 5271-5305 (PIN global de
//    acceso a toda la app)
// ════════════════════════════════════════════════════════════════

async function verifyAccessPin() {
  try {
    await window.verifyPin({ tipo: 'acceso', pin: accessBuf });
    // El acceso global no necesita rol/claim, así que no hace falta
    // refrescar el token aquí.
    accessIntentos = 0;
    try { localStorage.setItem('riq_access', Date.now()); } catch (e) {}
    const screen = document.getElementById('accessScreen');
    if (screen) screen.style.display = 'none';
  } catch (e) {
    accessBuf = '';
    const err = document.getElementById('accessError');
    if (err) err.textContent = e.code === 'functions/resource-exhausted' ? e.message : '❌ Código incorrecto';
  }
}


// ════════════════════════════════════════════════════════════════
// 6) loadConfig() — hoy en index.html línea 3864-3880
//    Alimenta las cajas de texto del panel de Coordinación con los PINs
//    ACTUALES de cada mensajero y de cada área (Paquetería, Compras,
//    Laboratorio, Facturas, Resultados, MMS, RH, Consulta, Enfermería,
//    Cafetería, Otros, Transporte) para que el admin los vea y edite.
//    Esto es exactamente lo que pediste que NO se rompiera visualmente.
// ════════════════════════════════════════════════════════════════

// ANTES hacía getDoc(doc(db,'config','pins')) y getDoc(doc(db,'config','areaPins'))
// directo — con las reglas deny-by-default esto ahora devolvería
// permission-denied y el panel se vería vacío.

async function loadConfig() {
  if (!window.db || !window.fbFns) return;
  try {
    // Solo un usuario con custom claim role=='coordinacion' puede llamar
    // esto exitosamente — la Cloud Function lo verifica server-side
    // (ver funciones adminGetPinsConfig en la guía de Cloud Function).
    const { data } = await window.adminGetPinsConfig();
    Object.assign(APP.cfgPins, data.pins);
    APP.cfgAreaPins = data.areaPins;
  } catch (e) {
    console.log('No autorizado o config no disponible', e);
  }
  // whatsapp/empresa NO son secretos — siguen leyéndose directo de
  // Firestore, tal como hoy, porque firestore.rules ya los permite con
  // solo isSignedIn():
  const { doc, getDoc } = window.fbFns;
  try {
    const snapW = await getDoc(doc(window.db, 'config', 'whatsapp'));
    if (snapW.exists()) Object.assign(APP.cfgWa, snapW.data());
    const snapE = await getDoc(doc(window.db, 'config', 'empresa'));
    if (snapE.exists()) { APP.cfgEmpresa = snapE.data().nombre || ''; }
  } catch (e) { console.log('Config not set'); }
}


// ════════════════════════════════════════════════════════════════
// 7) saveCfg() — hoy en index.html línea 3881-3920
//    El botón "Guardar" del panel de Coordinación, que hoy escribe
//    directo a config/pins y config/areaPins.
// ════════════════════════════════════════════════════════════════

async function saveCfg() {
  const pins = {
    diana: document.getElementById('cfgPinDiana').value || APP.cfgPins.diana,
    ruben: document.getElementById('cfgPinRuben').value || APP.cfgPins.ruben,
    ivan: document.getElementById('cfgPinIvan').value || APP.cfgPins.ivan,
    moises: document.getElementById('cfgPinMoises').value || APP.cfgPins.moises,
    pedro: document.getElementById('cfgPinPedro').value || APP.cfgPins.pedro,
    hugo: document.getElementById('cfgPinHugo').value || APP.cfgPins.hugo,
    victor: document.getElementById('cfgPinVictor').value || APP.cfgPins.victor,
    ebert: document.getElementById('cfgPinEbert').value || APP.cfgPins.ebert,
  };
  const wa = { HES: document.getElementById('cfgWaHES').value, Tram: document.getElementById('cfgWaTram').value };
  const empresa = { nombre: document.getElementById('cfgEmpresa').value };
  Object.assign(APP.cfgPins, pins); Object.assign(APP.cfgWa, wa); APP.cfgEmpresa = empresa.nombre;
  APP.cfgDescansoMins = parseInt(document.getElementById('cfgDescansoMins')?.value) || 60;

  const areaPins = {};
  const areaIds = ['compras','laboratorio','facturas','resultados','mms','rh','consulta','enfermeria','cafeteria','otros','transporte'];
  areaIds.forEach(id => {
    areaPins[id] = {
      u1_nombre: document.getElementById('area_' + id + '_u1_nombre')?.value.trim() || '',
      u1_pin: document.getElementById('area_' + id + '_u1_pin')?.value.trim() || '',
      u1_contacto: document.getElementById('area_' + id + '_u1_contacto')?.value.trim() || '',
      u2_nombre: document.getElementById('area_' + id + '_u2_nombre')?.value.trim() || '',
      u2_pin: document.getElementById('area_' + id + '_u2_pin')?.value.trim() || '',
      u2_contacto: document.getElementById('area_' + id + '_u2_contacto')?.value.trim() || '',
    };
  });
  APP.cfgAreaPins = areaPins;

  try {
    // Una sola llamada gated por rol — reemplaza los dos setDoc(config/pins)
    // y setDoc(config/areaPins) de antes.
    await window.adminSetPinsConfig({ pins, areaPins });
  } catch (e) {
    showToast('❌ No autorizado para guardar PINs');
    return;
  }

  // whatsapp/empresa siguen igual que hoy (no son secretos):
  const { doc, setDoc } = window.fbFns;
  await setDoc(doc(window.db, 'config', 'whatsapp'), wa);
  await setDoc(doc(window.db, 'config', 'empresa'), empresa);

  showToast('✅ Configuración guardada');
}

/**
 * ════════════════════════════════════════════════════════════════
 * ADICIONES NECESARIAS EN functions/index.js (no en este archivo)
 * ════════════════════════════════════════════════════════════════
 * Estas dos funciones son las que loadConfig()/saveCfg() llaman arriba.
 * Van junto a `verifyPin` cuando crees functions/index.js con
 * `firebase init functions` (paso ya descrito en el mensaje anterior).
 *
 * exports.adminGetPinsConfig = functions.https.onCall(async (data, context) => {
 *   if (context.auth?.token?.role !== 'coordinacion') {
 *     throw new functions.https.HttpsError('permission-denied', 'Solo Coordinación.');
 *   }
 *   const pinsSnap = await db.doc('config/pins').get();
 *   const areaSnap = await db.doc('config/areaPins').get();
 *   return {
 *     pins: pinsSnap.exists ? pinsSnap.data() : {},
 *     areaPins: areaSnap.exists ? areaSnap.data() : {},
 *   };
 * });
 *
 * exports.adminSetPinsConfig = functions.https.onCall(async (data, context) => {
 *   if (context.auth?.token?.role !== 'coordinacion') {
 *     throw new functions.https.HttpsError('permission-denied', 'Solo Coordinación.');
 *   }
 *   const { pins, areaPins } = data;
 *   await db.doc('config/pins').set(pins, { merge: true });
 *   await db.doc('config/areaPins').set(areaPins, { merge: true });
 *   return { ok: true };
 * });
 *
 * También hay que ajustar el branch 'area' de checkPinAgainstStore() (en la
 * guía de la Cloud Function) para que devuelva también `contacto`:
 *
 *   if (areaPins.u1_pin === pin) return { ok: true, role: 'area', nombre: areaPins.u1_nombre, contacto: areaPins.u1_contacto };
 *   if (areaPins.u2_pin === pin) return { ok: true, role: 'area', nombre: areaPins.u2_nombre, contacto: areaPins.u2_contacto };
 */

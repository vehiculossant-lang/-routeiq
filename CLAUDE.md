# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RouteIQ is a smart-dispatch messaging platform used internally by **Hospital Santander** to coordinate hospital messengers ("mensajeros") who run errands/deliveries between hospital areas, plus the vehicle fleet they use. It is built and operated by a small non-technical/semi-technical team — there is no CI, no package manager, no build step, and no automated tests. Treat every change as something that must work by simply opening `index.html` in a browser.

- **Repo**: `vehiculossant-lang/-routeiq` on GitHub (**public** — do not add secrets, real PINs, or personal data to committed code or docs; see Security notes below).
- **Deploy**: Vercel (static hosting) behind Cloudflare, custom domain `routeiqs.com`. There is no `vercel.json` — Vercel serves the repo as-is (static file), so a push to `main` is effectively a deploy.
- **Database**: Firebase Firestore (real-time, via `onSnapshot`), project `link-mensajeria-santander`. No Firebase Authentication is used anywhere in the app.

## Repo layout

The entire application is **one file**: `index.html` (~7,700 lines). There is no `src/`, no `package.json`, no bundler, no test runner, no lint config. Everything — markup, CSS, and JS — lives in this single file:

- **Lines 1–~2440**: `<head>`, a `type="module"` `<script>` that initializes Firebase (exposes `window.db` and `window.fbFns` — the Firestore functions used by the rest of the app), then all CSS, then the full HTML body (screens + modals).
- **Line 2444 to EOF**: one giant classic (non-module) `<script>` containing 100% of the application logic. It relies on global scope because HTML elements call it directly via inline `onclick="..."` handlers.

There is no local dev server requirement — open `index.html` directly, or serve the folder with any static file server, to develop and test changes. **There are no build, lint, or test commands** — verify changes by loading the page in a browser and exercising the relevant screen manually.

## Architecture

### Global state: the `APP` object
A single global `APP` object (defined near the start of the main script, ~line 2440s) holds all client-side state: current `role`, `user`, `area`, `mensajero`, in-memory copies of Firestore data (`APP.solicitudes`, `APP.eventos`, `APP.cfgPins`, `APP.cfgAreaPins`, ...), active timers, and Firestore `onSnapshot` unsubscribe handles (`APP.unsubEstatus`, `APP.unsubSolicitudes`). There is no framework/reactivity layer — state changes are followed by explicit `render*()` calls that regenerate the relevant DOM via template strings (`innerHTML =`).

### Screens, not routes
The UI is a single page with many `<div class="screen" id="screen-...">` blocks (home, area-select, area-form, mensajero-*, admin-*, vehiculos-*, cronograma-*, etc.). Navigation is done with `goScreen(id)` / `goRole(role)` / `goTab(tab)`, which toggle the `.active` class — there is no router/URL state. Modals follow the same pattern via `openModal(id)` / `closeModal(id)`.

### Four roles, four PIN gates, no Firebase Auth
The app has no login system beyond numeric PIN screens gating each role. Each role has its own PIN-entry flow and its own render/listener functions:
- **Áreas solicitantes** (hospital departments requesting a messenger) — gated by employee number, checked in `verificarAreaPin()` against `APP.cfgAreaPins` (loaded from Firestore `config/areaPins`).
- **Mensajero** (courier) — PIN checked in `verifyMPin()` against `MENSAJEROS_DATA`/`APP.cfgPins`.
- **Coordinación / Admin** — PIN checked in `verifyAPin()` against `ADMINS_DATA`/`APP.cfgPins`.
- **Vehículos** — separate PIN checked in `vVerifyPin()`.
There is also a single global app-access PIN (`checkAccessPin()`/`verifyAccessPin()`) gating the whole page on first load per 24h (persisted via `localStorage['riq_access']`).

**Firebase Authentication is never imported or used** (only `firebase-firestore.js` is imported at the top of the file). This is the central architectural fact to keep in mind for anything security- or rules-related: Firestore Security Rules have no `request.auth` to key off, so any server-side authorization must go through a different mechanism (see Security notes and `firestore.rules`/Cloud Functions work below).

### Firestore collections (source of truth is the app, not a schema file)
- `solicitudes` — courier requests. Folio format `MSJ-DDMMYY-NNN`. Key fields: `areaId`, `solicitante`, `necesidad`, `destino`, `hora`, `fechaProgramada` (for future-dated requests), `prioridad` (alta/media/baja), `mensajeroId`/`mensajeroNombre`, `codigo` (52 enterado / 58 en ruta / 59 terminada), `status` (pendiente/en_proceso/completada), `resultado` (completada/sin_paquete/cerrado/reprogramada/otro) + `resultadoNota` when not completed.
- `estatus/{mensajeroId}` — live courier status (disponible/ruta/alimentos/fuera_turno/libre), `turnoCheckinKey` (one shift check-in per day), meal/break timer end timestamps.
- `agendas/{mensajeroId}` — array of future assigned runs.
- `flotaMovimientos` — vehicle usage log. Folio format `VEH-YYMMDD-XXXX`. Tracks odometer (`kmSalida`/`kmRegreso`), fuel level at each end, `estado` (fuera/regresado/reservado/cancelada).
- `flotaDocs/main` — expiry dates for `circulacion`, `poliza`, `verificacion` per vehicle.
- `flotaConfig/main` — per-vehicle maintenance flags/counters (`mantenimiento`, `kmUltimoMant`, `mantenimientosCount`), persisted with `setDoc(..., {merge:true})`.
- `config/pins`, `config/areaPins`, `config/whatsapp`, `config/empresa` — runtime-configurable settings (including the *actual* PINs currently in effect), read with plain `getDoc` calls and written from the Coordinación config screen.

### The one non-negotiable Firestore query pattern
**Never chain two `where()` clauses in the same Firestore query.** The codebase deliberately avoids composite indexes: fetch with at most one `where` (or none), and do the rest of the filtering in memory over the already-loaded array (`APP.solicitudes`, `vMovs`, `APP.mensajeroEstatus`, etc. act as the in-memory sources of truth). This is called out explicitly in-repo because violating it produces a Firestore "missing index" runtime error — it has bitten this codebase before, e.g. in the vehicle-return flow (`mRegistrarRegresoVehiculo()`): it does a direct `getDoc` when `APP.vehicle.movId` is known, and falls back to `getDocs` over the whole collection + in-memory filtering when it isn't — it must never be rewritten to use a compound `where`.

### Fleet and messenger reference data
Hardcoded in the script (not in Firestore) as the base catalog, then overlaid with live Firestore state:
- `FLOTA_BASE`: `urban` (Nissan Urban 2022), `figo` (Ford Figo 2019, habitual driver: moises), `np300` (Nissan NP300 2020, habitual: ivan), `aveo` (Aveo 2024, habitual: pedro), `yaris` (Toyota Yaris 2025, editable plates).
- `MENSAJEROS_DATA`: `ivan`/`moises`/`pedro` (matutino), `hugo`/`victor` (nocturno 19:00–06:00).

## Business rules that must not regress

These behaviors are intentional product decisions, not bugs — do not "fix" or simplify them away without checking with the user first:

- **Past date/time is blocked** when requesting a courier: if the chosen date is before today, or it's today but the chosen time has already passed, the request cannot proceed. The error message must say specifically whether it's the date or the time that's wrong.
- **Required-field validation is specific**: the "Ver mensajeros" button must name exactly which field is missing (nombre, prioridad, necesidad, hora, destino), not a generic error.
- **Priority semaphore has fixed criteria**: Red = patient at risk / area can't operate / VIP / direct instruction from management. Amber = needed today and time is closing in, can't wait until end of day. Green = flexible timing.
- **Transporte de Personal is a distinct request type**: one request per day, with trip type, company, multi-point/multi-time itinerary, headcount, status, and a responsible contact. The itinerary is stored in Firestore and must render both on the courier's card and in the generated WhatsApp message.
- **Future-scheduled requests** (`fechaProgramada` after today) show up on Coordinación's calendar and the courier's upcoming events, and auto-activate on the scheduled day.
- **One active courier minimum**: the live-status screen must never let all on-shift couriers go non-disponible simultaneously.
- **Meal timer (30/45/60/90 min)**: auto-reverts the courier to Disponible on expiry with vibration/sound; areas only ever see "🍽️ En alimentos" without a visible countdown.
- **Run progress codes are fixed**: 52 Enterado, 58 En ruta (paints the block proportionally to the estimated duration), 59 Terminada (forces the "resultado real" modal).
- **Non-"completada" results require a note**: closing a run as sin_paquete/cerrado/reprogramada/otro requires a short mandatory note.
- **Odometer/fuel are mandatory on both vehicle checkout and return**: km accepts "N/A" if unreadable; "cannot verify" fuel level requires a written reason. Return km must be ≥ checkout km; a jump >150 km triggers an amber warning and requires confirming the save twice.
- **Only the person who checked a vehicle out can register its return** — enforced by comparing the `folioVeh` the user is asked to re-enter.
- **Maintenance cycles are every 10,000 km**, tracked in `flotaConfig/main`; toggling it on increments `mantenimientosCount`, resets `kmUltimoMant` to the current reading, and resets `avisoSolicitanteVisto`.
- **Requests older than 15 days are auto-archived** to keep the working set light (`checkAutoArchive()`).

## Security notes (see prior conversation for full findings)

This app currently has no Firebase Authentication, and the "real" PINs (`config/pins`, `config/areaPins`) are stored in plain text in Firestore documents readable via a plain `getDoc`. Because the repo is public and there is no `firestore.rules` file checked in, any change touching auth/PINs/Firestore access should be treated as security-sensitive: prefer moving PIN verification server-side (Cloud Functions) over adding new client-side PIN comparisons, and never add new plaintext secrets to this repo.

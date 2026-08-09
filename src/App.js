import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { auth, db } from "./firebase";
import {
  SITE_URL,
  DEFAULT_META,
  DEFAULT_OG_IMAGE as ROUTE_DEFAULT_OG_IMAGE,
  STATIC_SCREEN_BY_PATH,
  STATIC_ROUTE_META,
  PRIVATE_PATHS,
  MAX_PARTICIPANTS,
} from "./routeMeta.mjs";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  ref,
  set,
  get,
  push,
  onValue,
  update,
  remove,
  increment,
  serverTimestamp,
  onDisconnect,
} from "firebase/database";

// Admin-only, so it is code-split: normal visitors never download it.
const AdminDashboard = lazy(() => import("./AdminDashboard"));

// ── ANONYMOUS USAGE ANALYTICS ────────────────────────────────────
// Privacy-first. Daily integer counters at /analytics/daily/{date}/{event}.
// NO personal data, NO user IDs, NO IP addresses, NO third-party scripts.
// Everything here is an aggregate count, which is what makes it disclosable
// in the privacy policy and exempt from consent under PECR.
//
// These counters exist to answer four business questions and nothing else:
//   1. How much is this used?        visit_*, room_created*, joined_*, estimate_recorded
//   2. Who uses it and how?          device_*, table_*, deck_*, feature_*
//   3. Is it sticky?                 visit_return, team_room_reentered, session_*
//   4. Would anyone pay, and for what? pricing_viewed, wtp_* (the one-question poll)
//
// Counters are cheap. Adding an event you will not act on is not free — it is
// noise on the dashboard. Every name below maps to a decision.
const _analyticsDate = () => new Date().toISOString().slice(0, 10); // "2026-08-09"

// Fire-and-forget. Analytics must never block or break a session.
function track(eventName) {
  try {
    set(ref(db, `analytics/daily/${_analyticsDate()}/${eventName}`), increment(1))
      .catch(() => {});
  } catch {
    // Swallow. A broken counter is never worth a broken room.
  }
}

// Some events are only meaningful once per browser (a new visitor) or once per
// day (device mix). localStorage is the dedupe key; it holds no personal data.
function trackOnce(eventName, scope = "ever") {
  const key = `pp_t_${eventName}`;
  const stamp = scope === "daily" ? _analyticsDate() : "1";
  try {
    if (localStorage.getItem(key) === stamp) return false;
    localStorage.setItem(key, stamp);
  } catch {
    return false; // private mode: skip rather than double-count
  }
  track(eventName);
  return true;
}

// Buckets keep the counter set small and the dashboard readable. Exact values
// would mean one counter per possible number, which nobody can chart.
const bucketTableSize = (n) =>
  n <= 1 ? "table_solo" : n <= 4 ? "table_2_4" : n <= 8 ? "table_5_8" : "table_9_20";
const bucketSessionMinutes = (m) =>
  m < 5 ? "session_under_5m" : m < 20 ? "session_5_20m" : m < 60 ? "session_20_60m" : "session_over_60m";

// How long a room stayed open. Ad revenue is a function of time-on-site, so this
// is the difference between "worth running ads" and "not worth the ad tag".
function trackSessionLength(roomData) {
  const startedAt = roomData?.createdAt;
  if (typeof startedAt !== "number") return;
  const minutes = (Date.now() - startedAt) / 60000;
  if (minutes < 0 || minutes > 60 * 24) return; // clock skew guard
  track(bucketSessionMinutes(minutes));
}

// Called once per app load: visitor recency and device mix, the two inputs an
// ad-network RPM estimate actually depends on.
function trackVisit() {
  const isNew = trackOnce("visit_new", "ever");
  if (!isNew) trackOnce("visit_return", "daily");
  const mobile = typeof window !== "undefined"
    && window.matchMedia?.("(max-width: 780px), (pointer: coarse)")?.matches;
  trackOnce(mobile ? "device_mobile" : "device_desktop", "daily");
}

// ── SPRINT HISTORY ────────────────────────────────────────────────
// Saves a session summary to Firebase /history/{uid} when a session ends.
// Requires an authenticated user — anonymous sessions are not recorded.
// Failures are silent so a history error never blocks session teardown.
async function saveSessionHistory(uid, roomData, roomCode) {
  if (!uid || !roomData) return;
  const stories = roomData.stories ? Object.values(roomData.stories) : [];
  const storiesDone  = roomData.storiesDone  || 0;
  const consensusCount = roomData.consensusCount || 0;
  const totalPoints = stories
    .filter(s => s.estimate != null && !isNaN(Number(s.estimate)))
    .reduce((sum, s) => sum + Number(s.estimate), 0);
  const consensusRate = storiesDone > 0
    ? Math.round((consensusCount / storiesDone) * 100) : 0;
  const record = {
    roomCode,
    teamName:     roomData.teamName     || null,
    startedAt:    roomData.createdAt    || Date.now(),
    endedAt:      Date.now(),
    storiesDone,
    totalPoints,
    consensusRate,
    storyCount:   stories.length,
    // Store estimated stories only — keeps payload small
    stories: stories
      .filter(s => s.estimate != null)
      .map(s => ({ name: s.name || "", estimate: s.estimate })),
  };
  try {
    await push(ref(db, `history/${uid}`), record);
  } catch (e) {
    // Swallow — history must never interrupt session teardown
  }
}

// Route metadata and the prerendered content shell live in one module so the
// build-time prerenderer and the runtime app can never drift apart.
const DEFAULT_OG_IMAGE = ROUTE_DEFAULT_OG_IMAGE;

// The app owns scroll position: every route change scrolls to top explicitly.
// Left on "auto", Chrome restores a stale offset and drops people who open a
// shared room link halfway down the marketing copy instead of on the form.
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

function getScreenForPath(pathname) {
  return STATIC_SCREEN_BY_PATH[pathname] || "join";
}

function upsertMeta(selector, createTag, attrs, content) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement(createTag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

function upsertLink(selector, attrs) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("link");
    document.head.appendChild(node);
  }
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
}

function applyRouteMeta(meta) {
  const next = { ...DEFAULT_META, ...meta };
  document.title = next.title;
  upsertMeta('meta[name="description"]', "meta", { name: "description" }, next.description);
  upsertMeta('meta[name="robots"]', "meta", { name: "robots" }, next.robots);
  upsertMeta('meta[property="og:title"]', "meta", { property: "og:title" }, next.title);
  upsertMeta('meta[property="og:description"]', "meta", { property: "og:description" }, next.description);
  upsertMeta('meta[property="og:url"]', "meta", { property: "og:url" }, next.ogUrl || next.canonical);
  upsertMeta('meta[property="og:image"]', "meta", { property: "og:image" }, next.ogImage || DEFAULT_OG_IMAGE);
  upsertMeta('meta[name="twitter:title"]', "meta", { name: "twitter:title" }, next.title);
  upsertMeta('meta[name="twitter:description"]', "meta", { name: "twitter:description" }, next.description);
  upsertMeta('meta[name="twitter:url"]', "meta", { name: "twitter:url" }, next.ogUrl || next.canonical);
  upsertMeta('meta[name="twitter:image"]', "meta", { name: "twitter:image" }, next.ogImage || DEFAULT_OG_IMAGE);
  upsertLink('link[rel="canonical"]', { rel: "canonical", href: next.canonical });
}

// ── CARD DECKS ────────────────────────────────────────────────────
// Each deck is an array of card objects. The facilitator selects a deck
// when creating a room; the choice is stored in Firebase so all players
// see the same cards automatically.
const DECK_DEFINITIONS = {
  fibonacci: {
    label: "Fibonacci",
    desc: "1, 2, 3, 5, 8, 13, 21, 34, ?",
    cards: [
      { val: "1",  suit: "♠", red: false },
      { val: "2",  suit: "♣", red: false },
      { val: "3",  suit: "♠", red: false },
      { val: "5",  suit: "♥", red: true  },
      { val: "8",  suit: "♦", red: true  },
      { val: "13", suit: "♣", red: false },
      { val: "21", suit: "♥", red: true  },
      { val: "34", suit: "♦", red: true  },
      { val: "?",  suit: "★", red: false },
    ],
  },
  tshirt: {
    label: "T-Shirt",
    desc: "XS, S, M, L, XL, XXL",
    cards: [
      { val: "XS",  suit: "♠", red: false },
      { val: "S",   suit: "♣", red: false },
      { val: "M",   suit: "♥", red: true  },
      { val: "L",   suit: "♦", red: true  },
      { val: "XL",  suit: "♠", red: false },
      { val: "XXL", suit: "♣", red: false },
      { val: "?",   suit: "★", red: false },
    ],
  },
  powers: {
    label: "Powers of 2",
    desc: "1, 2, 4, 8, 16, 32, ?",
    cards: [
      { val: "1",  suit: "♠", red: false },
      { val: "2",  suit: "♣", red: false },
      { val: "4",  suit: "♠", red: false },
      { val: "8",  suit: "♥", red: true  },
      { val: "16", suit: "♦", red: true  },
      { val: "32", suit: "♣", red: false },
      { val: "?",  suit: "★", red: false },
    ],
  },
};
const DECK_KEYS = Object.keys(DECK_DEFINITIONS);
// Derive cards for a given deck key, falling back to Fibonacci.
const getCards = (deckKey) =>
  (DECK_DEFINITIONS[deckKey] || DECK_DEFINITIONS.fibonacci).cards;

// ── ESTIMATION MODE ───────────────────────────────────────────────────────────
// Controls whether the team is estimating User Stories or Tasks within stories.
// Stored in Firebase as room.estimationMode. All in-room copy adapts to this setting.
const ESTIMATION_MODES = {
  stories: {
    key: "stories",
    label: "User Stories",
    desc: "Estimate each story as a whole",
    singular: "story",
    plural: "stories",
    queueTitle: "Story Queue",
    progressLabel: "Story",
    bannerLabel: "Estimating",
    allDoneText: "stories estimated",
    backlogLabel: "Sprint backlog",
    toastDone: "✅ Story estimated! Vote on the next story.",
    toastNext: "✅ Estimate recorded. Voting on next story.",
    placeholder: "e.g. User login flow, PROJ-42…",
    hintText: "Add stories to track estimates by name, or just start voting without them. Both work.",
    recordNext: "& Estimate Next Story",
  },
  tasks: {
    key: "tasks",
    label: "Tasks",
    desc: "Estimate tasks within stories",
    singular: "task",
    plural: "tasks",
    queueTitle: "Task Queue",
    progressLabel: "Task",
    bannerLabel: "Estimating task",
    allDoneText: "tasks estimated",
    backlogLabel: "Task list",
    toastDone: "✅ Task estimated! Vote on the next task.",
    toastNext: "✅ Estimate recorded. Voting on next task.",
    placeholder: "e.g. Build login API, Write unit tests, PROJ-42-1…",
    hintText: "Add tasks to track estimates by name, or just start voting without them. Both work.",
    recordNext: "& Estimate Next Task",
  },
};
const getEstMode = (mode) => ESTIMATION_MODES[mode] || ESTIMATION_MODES.stories;
const INVALID_PLACEHOLDER_NAMES = new Set(["alex johnson", "e.g. alex johnson"]);
const CIRC = 201.1;
const uid = () => Math.random().toString(36).slice(2, 10);
const mkCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();
// Derives a stable, human-readable URL slug from a team name.
// "RPA Dev Team" → "rpa-dev-team" — shareable, memorable, consistent.
const teamCode = (name) =>
  name.trim().toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")  // strip special chars but preserve slug hyphens
    .replace(/\s+/g, "-")           // spaces → hyphens
    .replace(/-{2,}/g, "-")         // collapse double-hyphens
    .replace(/^-|-$/g, "")          // trim leading/trailing hyphens
    .slice(0, 24)                   // max 24 chars
  || "team";
const homePath = () => "/";
const roomPath = (code) => `/?room=${encodeURIComponent(code)}`;
const teamRoomPath = (teamNameOrCode) => `/t/${teamCode(teamNameOrCode)}`;
const countParticipants = (players = {}, excludeId = null) =>
  Object.entries(players)
    .filter(([playerId, player]) => !!player && playerId !== excludeId)
    .length;
// Modal plumbing every dialog needs and none of them had: Escape to close,
// focus moved in on open, focus returned to the trigger on close, and Tab kept
// inside the dialog (WCAG 2.1.2 — no keyboard trap means you can also get *out*
// of the modal, which is exactly what returning focus achieves).
// Set by whatever opens a dialog, read by useDialog. Capturing inside the
// dialog's own effect is too late: React commits the re-render first, and an
// autoFocus anywhere on the page behind it has already moved focus.
let _dialogOpener = null;
export function rememberDialogOpener() {
  const el = document.activeElement;
  _dialogOpener = el instanceof HTMLElement && el !== document.body ? el : null;
}

function useDialog(onClose) {
  const ref = useRef(null);
  // Captured once and never overwritten. StrictMode double-invokes effects in
  // development, and re-capturing on the second mount would record the dialog's
  // own close button as the thing to return focus to.
  const openerRef = useRef(_dialogOpener);

  // Restore focus BEFORE React unmounts the dialog. Doing it afterwards means
  // racing the commit: the focused node gets removed, the browser resets focus
  // to <body>, and any timer-based restore lands too late or not at all.
  const close = useCallback(() => {
    const opener = openerRef.current;
    if (opener instanceof HTMLElement && document.body.contains(opener)) {
      opener.focus();
    }
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    const node = ref.current;
    node?.querySelector(
      "[data-autofocus], input:not([type=hidden]), button, [href], select, textarea",
    )?.focus?.();

    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); return; }
      if (e.key !== "Tab" || !node) return;
      const focusable = [...node.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [close]);

  return [ref, close];
}

// Clipboard writes fail on http origins, in some in-app browsers, and when the
// user denies permission. Fall back to a hidden textarea, and always tell the
// caller whether the copy actually happened so the UI never lies.
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
// RFC 4180 escaping — item names routinely contain commas and quotes.
const csvCell = (v = "") => `"${String(v).replace(/"/g, '""')}"`;
// Guests should not retype their name every sprint. Stored locally only —
// never sent anywhere except into the room they choose to join.
const NAME_STORAGE_KEY = "pp_display_name";
const rememberName = (name) => {
  try { localStorage.setItem(NAME_STORAGE_KEY, String(name || "").slice(0, 40)); } catch {}
};
const recallName = () => {
  try { return localStorage.getItem(NAME_STORAGE_KEY) || ""; } catch { return ""; }
};
const ini = (n = "") =>
  n
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();

/* ═══════════════════════════ CSS ═══════════════════════════ */
const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #07110e;
  --bg2:      #0d1d19;
  --surface:  rgba(15,32,27,0.76);
  --surface2: rgba(22,44,38,0.92);
  --surface3: rgba(10,24,20,0.96);
  --border:   rgba(134,198,166,0.12);
  --border2:  rgba(158,234,196,0.22);
  --gold:     #f1b93f;
  --gold2:    #ffd978;
  --gold3:    #fff2be;
  --goldA:    rgba(241,185,63,0.24);
  --goldB:    rgba(241,185,63,0.14);
  --mint:     #72f0b4;
  --mint2:    #bfffe2;
  --aqua:     #7ee6ff;
  --cream:    #f5fbf7;
  --cream2:   #b8d1c2;
  --red:      #e04848;
  --green:    #4bd889;
  --blue:     #6ccff6;
  --ink:      #08110e;
  --card-bg:  #fffdfa;
  --scroll-track: rgba(7,17,14,0.94);
  --scroll-thumb: linear-gradient(180deg, #ffe08f 0%, #f5c659 42%, #dd9c22 100%);
  --scroll-thumb-border: rgba(5,10,9,0.62);
  --radius:   20px;
  --radius-sm:14px;
  --shadow:   0 28px 90px rgba(0,0,0,0.58);
  --shadow-soft: 0 20px 60px rgba(0,0,0,0.34);
}

html { font-size: 16px; scroll-behavior: smooth; background-color: var(--bg); }
html, body, * {
  scrollbar-width: thin;
  scrollbar-color: var(--gold) var(--scroll-track);
}
*::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}
*::-webkit-scrollbar-track {
  background: var(--scroll-track);
  border-radius: 999px;
}
*::-webkit-scrollbar-thumb {
  background: var(--scroll-thumb);
  border-radius: 999px;
  border: 2px solid var(--scroll-thumb-border);
}
*::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #f8da91 0%, #efc45d 48%, #d39c35 100%);
}
*::-webkit-scrollbar-corner { background: transparent; }
body {
  font-family: 'Outfit', sans-serif;
  background:
    radial-gradient(circle at top, rgba(40,124,88,0.24), transparent 34%),
    radial-gradient(circle at 82% 14%, rgba(126,230,255,0.08), transparent 22%),
    linear-gradient(180deg, #091411 0%, #07110e 42%, #06100d 100%);
  min-height: 100vh;
  color: var(--cream);
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Accessible focus ring — visible for keyboard, invisible for mouse */
:focus-visible {
  outline: 2.5px solid var(--gold2);
  outline-offset: 3px;
  border-radius: 6px;
}
:focus:not(:focus-visible) { outline: none; }

/* Subtle felt texture */
body::before {
  content: '';
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image:
    radial-gradient(ellipse 80% 55% at 50% 0%, rgba(34,120,78,0.30) 0%, transparent 62%),
    radial-gradient(ellipse 46% 36% at 88% 92%, rgba(241,185,63,0.11) 0%, transparent 58%),
    url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");
  background-size: cover, cover, 200px 200px;
}

/* .app — child of .page-shell flex column; flex:1 ensures it fills available space */
.app { flex: 1; display: flex; flex-direction: column; position: relative; z-index: 1; }

/* ── ANIMATIONS ── */
@keyframes fadeUp   { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
@keyframes shimmer  { 0% { background-position:-300% center; } 100% { background-position:300% center; } }
@keyframes spin     { to { transform: rotate(360deg); } }
@keyframes pulse    { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
@keyframes flip     { 0% { transform:rotateY(90deg) scale(.85); } 60% { transform:rotateY(-6deg) scale(1.02); } 100% { transform:rotateY(0) scale(1); } }
@keyframes dealIn   { from { opacity:0; transform:translateY(-18px) scale(.9); } to { opacity:1; transform:none; } }
@keyframes glow     { 0%,100% { box-shadow:0 0 20px rgba(201,145,42,.25); } 50% { box-shadow:0 0 40px rgba(201,145,42,.6), 0 0 80px rgba(201,145,42,.15); } }
@keyframes urgentBg { 0%,100% { background:rgba(192,57,43,.1); } 50% { background:rgba(192,57,43,.22); } }
@keyframes heroIn   { from { opacity:0; transform:scale(.92) translateY(12px); } to { opacity:1; transform:none; } }
@keyframes badgePop  { 0% { transform:scale(0.7); opacity:0; } 70% { transform:scale(1.08); } 100% { transform:scale(1); opacity:1; } }
@keyframes consensusIn { 0% { opacity:0; transform:scale(.88) translateY(16px); } 60% { transform:scale(1.03) translateY(-4px); } 100% { opacity:1; transform:scale(1) translateY(0); } }
@keyframes starBurst   { 0% { transform:scale(0) rotate(0deg); opacity:1; } 100% { transform:scale(1.6) rotate(180deg); opacity:0; } }

/* ══════════════════════ CONFETTI CANVAS ══════════════════════ */
.confetti-canvas {
  position: fixed; inset: 0; z-index: 999;
  pointer-events: none; width: 100%; height: 100%;
}

/* ══════════════════════ CONSENSUS OVERLAY ══════════════════════ */
.consensus-overlay {
  position: fixed; inset: 0; z-index: 998;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.consensus-burst {
  text-align: center;
  animation: consensusIn .55s cubic-bezier(.34,1.56,.64,1) both;
}
.consensus-burst-emoji { font-size: 4rem; display: block; margin-bottom: 8px; }
.consensus-burst-text {
  font-family: 'Outfit', sans-serif;
  font-size: 2.4rem; font-weight: 700; color: var(--gold2);
  letter-spacing: -0.02em;
  text-shadow: 0 0 40px rgba(201,145,42,.8), 0 4px 20px rgba(0,0,0,.8);
  line-height: 1.1;
}
.consensus-burst-sub {
  font-size: .9rem; color: rgba(239,242,247,.90);
  margin-top: 6px; font-weight: 300; letter-spacing: .5px;
  text-shadow: 0 2px 8px rgba(0,0,0,.9);
}

/* ══════════════════════ FACILITATOR RESOLUTION OVERLAY ══════════════════════ */
.facilitator-overlay {
  width: min(780px, 100%);
  max-height: min(88vh, 760px);
  overflow-y: auto;
  border-radius: 28px;
  border: 1px solid rgba(241,185,63,.28);
  background:
    radial-gradient(circle at top, rgba(241,185,63,.12), rgba(241,185,63,0) 48%),
    linear-gradient(180deg, rgba(15,32,27,.98), rgba(8,18,15,.98));
  box-shadow: 0 36px 100px rgba(0,0,0,.58), inset 0 1px 0 rgba(255,255,255,.05);
  padding: 28px 28px 24px;
  position: relative;
}
.facilitator-overlay-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(241,185,63,.22);
  background: rgba(241,185,63,.10);
  color: var(--gold2);
  font-size: .66rem;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  margin-bottom: 14px;
}
.facilitator-overlay-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.facilitator-overlay-summary-card {
  padding: 14px 14px 12px;
  border-radius: 16px;
  border: 1px solid rgba(158,234,196,.14);
  background: rgba(255,255,255,.04);
}
.facilitator-overlay-summary-k {
  display: block;
  margin-bottom: 6px;
  font-size: .62rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: rgba(239,242,247,.62);
}
.facilitator-overlay-summary-v {
  display: block;
  color: var(--cream);
  font-size: .98rem;
  font-weight: 600;
  line-height: 1.35;
}
.facilitator-overlay-summary-v.gold { color: var(--gold2); }
.facilitator-overlay-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}
.facilitator-overlay-chip {
  min-width: 68px;
  padding: 13px 16px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.04);
  color: var(--cream);
  font-family: 'Outfit', sans-serif;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all .18s ease;
}
.facilitator-overlay-chip:hover {
  border-color: rgba(241,185,63,.34);
  background: rgba(241,185,63,.10);
  transform: translateY(-1px);
}
.facilitator-overlay-chip.active {
  border-color: rgba(241,185,63,.56);
  background: linear-gradient(180deg, rgba(241,185,63,.22), rgba(241,185,63,.11));
  color: var(--gold3);
  box-shadow: 0 16px 34px rgba(241,185,63,.14), inset 0 1px 0 rgba(255,255,255,.06);
}
.facilitator-overlay-actions {
  display: flex;
  gap: 12px;
  align-items: stretch;
}
.facilitator-overlay-revote {
  flex: 0 0 auto;
  min-width: 180px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(158,234,196,.16);
  background: rgba(255,255,255,.04);
  color: rgba(239,242,247,.86);
  font-family: 'Outfit', sans-serif;
  font-size: .86rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .18s ease;
}
.facilitator-overlay-revote:hover {
  background: rgba(255,255,255,.08);
  border-color: rgba(158,234,196,.26);
}
@media (max-width: 680px) {
  .facilitator-overlay { padding: 22px 18px 20px; }
  .facilitator-overlay-summary { grid-template-columns: 1fr; }
  .facilitator-overlay-actions { flex-direction: column; }
  .facilitator-overlay-revote { width: 100%; min-width: 0; }
}

/* ══════════════════════ JOIN SCREEN ══════════════════════ */
.join-wrap {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  padding: 40px 24px 80px; animation: fadeIn .4s ease; overflow-y: auto;
}
.join-box {
  width: 100%; max-width: 440px;
  background:
    linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0)),
    linear-gradient(155deg, rgba(12,28,23,.95) 0%, rgba(7,15,13,.98) 58%, rgba(4,10,9,1) 100%);
  border: 1px solid rgba(158,234,196,.16);
  border-radius: 28px;
  padding: 48px 40px 44px;
  box-shadow: 0 44px 110px rgba(0,0,0,.64), inset 0 1px 0 rgba(255,255,255,.06), inset 0 0 0 1px rgba(126,230,255,.04);
  position: relative; overflow: hidden;
  animation: fadeUp .45s ease;
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
}
.join-box::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--mint), var(--gold2), var(--aqua), transparent);
  background-size: 300% auto; animation: shimmer 3s linear infinite;
}
.join-suits {
  display: flex; justify-content: center; gap: 16px;
  margin-bottom: 28px; font-size: 1.4rem;
}
.join-suits span { opacity: .12; }
.join-suits span:nth-child(2), .join-suits span:nth-child(4) { color: var(--red); opacity: .18; }
.join-title {
  font-family: 'Outfit', sans-serif;
  font-size: clamp(1.75rem, 4.4vw, 2.35rem); font-weight: 700;
  color: var(--cream); text-align: center;
  margin-bottom: 4px; letter-spacing: -0.03em; line-height: 1.1;
  text-shadow: 0 12px 32px rgba(0,0,0,.42);
}
.join-sub {
  text-align: center; color: rgba(245,251,247,.76);
  font-size: .9rem; margin-bottom: 22px; font-weight: 300; letter-spacing: .5px;
  max-width: 44ch; margin-left: auto; margin-right: auto; line-height: 1.55;
}
.join-sub.workspace {
  margin-bottom: 24px;
  letter-spacing: .2px;
}
/* Card-suit value strip under the hero — replaces the old "compare plans" CTA */
.trust-strip {
  list-style: none; margin: 0 0 26px; padding: 0;
  display: flex; flex-wrap: wrap; justify-content: center; gap: 7px;
}
.trust-strip li {
  font-size: .72rem; font-weight: 500; letter-spacing: .3px;
  color: rgba(239,242,247,.78);
  background: rgba(255,255,255,.045);
  border: 1px solid rgba(158,234,196,.14);
  border-radius: 999px; padding: 5px 11px;
  white-space: nowrap;
}
.workspace-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 22px;
}
.workspace-card {
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px solid rgba(158,234,196,.14);
  background:
    linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01)),
    rgba(255,255,255,.02);
}
.workspace-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.workspace-label {
  font-size: .62rem;
  font-weight: 700;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: rgba(239,242,247,.62);
  margin-bottom: 8px;
}
.workspace-title {
  color: var(--cream);
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -.02em;
}
.workspace-copy {
  margin: 6px 0 0;
  color: rgba(239,242,247,.62);
  font-size: .8rem;
  line-height: 1.55;
}
.workspace-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 11px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.04);
  color: rgba(239,242,247,.70);
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  white-space: nowrap;
}
.workspace-pill.pro {
  color: var(--gold2);
  background: rgba(241,185,63,.10);
  border-color: rgba(241,185,63,.26);
}
.workspace-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.workspace-stat {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(158,234,196,.10);
  background: rgba(255,255,255,.025);
}
.workspace-stat-k {
  display: block;
  margin-bottom: 6px;
  font-size: .62rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: rgba(239,242,247,.62);
}
.workspace-stat-v {
  display: block;
  color: var(--cream);
  font-size: .86rem;
  line-height: 1.45;
}
.workspace-room-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}
.workspace-room-card {
  min-width: 0;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(158,234,196,.10);
  background: rgba(255,255,255,.025);
}
.workspace-room-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.workspace-room-k {
  display: block;
  margin-bottom: 6px;
  font-size: .62rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: rgba(239,242,247,.62);
}
.workspace-room-v {
  display: block;
  color: var(--cream);
  font-size: .9rem;
  font-weight: 600;
  line-height: 1.45;
}
.workspace-room-chip {
  display: inline-flex;
  align-items: center;
  padding: 5px 9px;
  border-radius: 999px;
  border: 1px solid rgba(241,185,63,.18);
  background: rgba(241,185,63,.08);
  color: var(--gold2);
  font-size: .66rem;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  white-space: nowrap;
}
.workspace-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.workspace-action-btn {
  flex: 1;
  min-width: 160px;
  padding: 11px 14px;
  border-radius: 12px;
  border: 1px solid rgba(158,234,196,.14);
  background: rgba(255,255,255,.03);
  color: var(--cream);
  font-family: 'Outfit', sans-serif;
  font-size: .82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .18s ease;
}
.workspace-action-btn:hover {
  background: rgba(255,255,255,.06);
  border-color: rgba(158,234,196,.24);
}
.workspace-action-btn.gold {
  border-color: rgba(241,185,63,.24);
  background: rgba(241,185,63,.08);
  color: var(--gold2);
}
.workspace-team-url {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 12px 14px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border-radius: 14px;
  border: 1px solid rgba(126,230,255,.16);
  background: linear-gradient(180deg, rgba(126,230,255,.08), rgba(241,185,63,.06));
}
.workspace-team-url code {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  font-size: .8rem;
  line-height: 1.45;
  color: var(--mint2);
}
.workspace-team-url button {
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(158,234,196,.16);
  background: rgba(7,17,14,.42);
  color: var(--cream);
  font-family: 'Outfit', sans-serif;
  font-size: .76rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .18s ease;
}
.workspace-team-url button:hover {
  background: rgba(255,255,255,.08);
}
.workspace-team-url button.copied {
  color: var(--gold2);
  border-color: rgba(241,185,63,.28);
  background: rgba(241,185,63,.10);
}
@media (max-width: 900px) {
  .workspace-team-url {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
  .workspace-team-url button {
    width: 100%;
  }
}
.workspace-room-editor {
  margin-top: 16px;
  margin-bottom: 16px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(158,234,196,.10);
  background: rgba(255,255,255,.022);
  transition: border-color .22s ease, box-shadow .22s ease, background .22s ease;
}
.workspace-room-editor.highlight {
  border-color: rgba(241,185,63,.34);
  background: linear-gradient(180deg, rgba(241,185,63,.10), rgba(255,255,255,.025));
  box-shadow: 0 18px 42px rgba(241,185,63,.10);
}
.workspace-room-editor-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.workspace-room-editor-title {
  color: var(--cream);
  font-size: .92rem;
  font-weight: 600;
  line-height: 1.4;
}
.workspace-room-editor-note {
  margin-top: 8px;
}
.workspace-room-editor-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(241,185,63,.22);
  background: rgba(241,185,63,.10);
  color: var(--gold2);
  font-size: .7rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  white-space: nowrap;
}
.workspace-room-editor-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-top: 12px;
}
.workspace-room-editor-row input {
  width: 100%;
  min-width: 0;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(158,234,196,.14);
  background: rgba(7,17,14,.52);
  color: var(--cream);
  font-family: 'Outfit', sans-serif;
  font-size: .92rem;
  outline: none;
}
.workspace-room-editor-row input:focus-visible {
  border-color: rgba(241,185,63,.38);
  box-shadow: 0 0 0 2px rgba(241,185,63,.16);
}
.workspace-room-editor-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  color: rgba(239,242,247,.66);
  font-size: .78rem;
  line-height: 1.45;
  word-break: break-word;
}
.workspace-inline-note {
  margin-top: 10px;
  color: rgba(239,242,247,.68);
  font-size: .76rem;
  line-height: 1.5;
}
.workspace-setup-callout {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(241,185,63,.24);
  background: linear-gradient(180deg, rgba(241,185,63,.12), rgba(255,255,255,.03));
  color: rgba(255,242,205,.92);
  font-size: .8rem;
  line-height: 1.55;
}
.workspace-setup-callout strong {
  color: var(--gold3);
}
.lbl {
  display: block; font-size: .72rem; font-weight: 600;
  letter-spacing: 1.8px; text-transform: uppercase;
  color: rgba(239,242,247,.75); margin-bottom: 8px;
}
.inp {
  width: 100%; padding: 13px 16px;
  background: rgba(255,255,255,.04); border: 1px solid rgba(158,234,196,.14);
  border-radius: var(--radius-sm);
  font-family: 'Outfit', sans-serif; font-size: .95rem;
  color: var(--cream); outline: none; margin-bottom: 20px;
  transition: border-color .2s, box-shadow .2s, background .2s, transform .2s;
}
.inp:focus { border-color: rgba(126,230,255,.55); background: rgba(255,255,255,.07); box-shadow: 0 0 0 4px rgba(126,230,255,.10), 0 14px 32px rgba(0,0,0,.22); }
.inp:hover:not(:focus) { background: rgba(255,255,255,.06); border-color: rgba(158,234,196,.22); }
.inp::placeholder { color: rgba(239,242,247,.66); }
.role-row { display: flex; gap: 10px; margin-bottom: 28px; }
.role-btn {
  flex: 1; padding: 14px 8px; border-radius: var(--radius-sm);
  border: 1px solid rgba(158,234,196,.12); background: rgba(255,255,255,.035);
  font-family: 'Outfit', sans-serif; font-size: .82rem; font-weight: 500;
  cursor: pointer; color: rgba(245,251,247,.82); transition: all .22s ease;
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
}
.role-btn .ri { font-size: 1.25rem; }
.role-btn .rl { font-weight: 600; font-size: .88rem; }
.role-btn .rs { font-size: .78rem; color: rgba(245,251,247,.62); font-weight: 300; }
.role-btn:hover:not(.rv):not(.ro) { background: rgba(255,255,255,.07); color: var(--cream); border-color: rgba(158,234,196,.26); transform: translateY(-1px); }
.role-btn.rv { border-color: rgba(241,185,63,.55); background: linear-gradient(180deg, rgba(241,185,63,.18), rgba(241,185,63,.08)); color: var(--gold2); box-shadow: 0 18px 34px rgba(241,185,63,.10); }
.role-btn.ro { border-color: rgba(126,230,255,.45); background: linear-gradient(180deg, rgba(126,230,255,.16), rgba(126,230,255,.06)); color: var(--aqua); box-shadow: 0 18px 34px rgba(126,230,255,.08); }
.err { color: #e74c3c; font-size: .78rem; margin-bottom: 12px; text-align: center; }
.btn-primary {
  width: 100%; padding: 15px; border: none; border-radius: var(--radius-sm);
  background: linear-gradient(135deg, #f0b43f 0%, #ffd978 55%, #fff0b0 100%);
  color: var(--ink); font-family: 'Outfit', sans-serif;
  font-size: .98rem; font-weight: 700; cursor: pointer;
  letter-spacing: .3px; transition: all .22s ease;
  box-shadow: 0 12px 30px rgba(241,185,63,.30), inset 0 1px 0 rgba(255,255,255,.45);
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 18px 38px rgba(241,185,63,.38), inset 0 1px 0 rgba(255,255,255,.55); }
.btn-primary:active { transform: none; }

/* Tab row on Join screen */
.tab-row { display: flex; gap: 6px; margin-bottom: 22px; }
.tab-btn { flex: 1; padding: 10px; border-radius: var(--radius-sm); border: 1px solid rgba(158,234,196,.10); background: rgba(255,255,255,.025); color: rgba(245,251,247,.72); font-family: 'Outfit', sans-serif; font-size: .875rem; font-weight: 500; cursor: pointer; transition: all .2s; }
.tab-btn.active { background: linear-gradient(180deg, rgba(241,185,63,.16), rgba(241,185,63,.08)); border-color: rgba(241,185,63,.34); color: var(--gold2); box-shadow: inset 0 1px 0 rgba(255,255,255,.05); }
.tab-btn:hover:not(.active) { background: rgba(255,255,255,.06); color: rgba(245,251,247,.92); border-color: rgba(158,234,196,.20); }

/* Team Room preview chip */
.team-room-choice-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}
.team-room-choice-btn {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(158,234,196,.12);
  background: rgba(255,255,255,.03);
  color: rgba(239,242,247,.78);
  font-family: 'Outfit', sans-serif;
  text-align: left;
  cursor: pointer;
  transition: all .18s ease;
}
.team-room-choice-btn:hover {
  background: rgba(255,255,255,.06);
  border-color: rgba(158,234,196,.22);
}
.team-room-choice-btn.active {
  border-color: rgba(241,185,63,.30);
  background: linear-gradient(180deg, rgba(241,185,63,.14), rgba(241,185,63,.06));
  color: var(--gold2);
}
.team-room-choice-label {
  font-size: .62rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: rgba(239,242,247,.62);
}
.team-room-choice-btn.active .team-room-choice-label {
  color: rgba(255,217,120,.82);
}
.team-room-choice-name {
  font-size: .84rem;
  font-weight: 600;
  line-height: 1.4;
}
.team-code-preview { display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(180deg, rgba(126,230,255,.10), rgba(241,185,63,.08)); border: 1px solid rgba(126,230,255,.18); border-radius: 12px; padding: 10px 12px; margin-bottom: 18px; width: 100%; }
.tcp-label { font-size: .62rem; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(239,242,247,.65); white-space: nowrap; }
.tcp-code { font-family: monospace; font-size: .9rem; font-weight: 700; color: var(--mint2); letter-spacing: .1em; flex: 1; }

/* Deck picker on Create tab */
.deck-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 24px; }
.deck-btn { padding: 10px 6px; border-radius: var(--radius-sm); border: 1px solid rgba(158,234,196,.10); background: rgba(255,255,255,.025); color: rgba(245,251,247,.80); font-family: 'Outfit', sans-serif; cursor: pointer; transition: all .2s; text-align: center; }
.deck-btn .dk-label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: 3px; }
.deck-btn .dk-desc  { display: block; font-size: .75rem; color: rgba(239,242,247,.62); }
.deck-btn.active { background: linear-gradient(180deg, rgba(241,185,63,.16), rgba(241,185,63,.08)); border-color: rgba(241,185,63,.34); color: var(--gold2); }
.deck-btn.active .dk-desc { color: rgba(255,217,120,.70); }
.deck-btn:hover:not(.active) { background: rgba(255,255,255,.06); color: rgba(245,251,247,.92); border-color: rgba(158,234,196,.20); }

/* Estimation mode picker on Create / Team tabs */
.estmode-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 24px; }
.estmode-btn { padding: 10px 8px; border-radius: var(--radius-sm); border: 1px solid rgba(158,234,196,.10); background: rgba(255,255,255,.025); color: rgba(245,251,247,.80); font-family: 'Outfit', sans-serif; cursor: pointer; transition: all .2s; text-align: center; }
.estmode-btn .em-label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: 3px; }
.estmode-btn .em-desc  { display: block; font-size: .72rem; color: rgba(239,242,247,.7); line-height: 1.35; }
.estmode-btn.active { background: linear-gradient(180deg, rgba(241,185,63,.16), rgba(241,185,63,.08)); border-color: rgba(241,185,63,.34); color: var(--gold2); }
.estmode-btn.active .em-desc { color: rgba(255,217,120,.65); }
.estmode-btn:hover:not(.active) { background: rgba(255,255,255,.06); color: rgba(245,251,247,.92); border-color: rgba(158,234,196,.20); }

/* ══════════════════════ SEO CONTENT SECTION ══════════════════════ */
.seo-section {
  width: 100%; max-width: 860px; margin-top: 56px;
  color: rgba(239,242,247,.82); font-family: 'Outfit', sans-serif;
}
.seo-section h2.seo-h2 {
  font-family: 'Outfit', sans-serif;
  font-size: 1.85rem; font-weight: 700;
  color: var(--gold2); text-align: center;
  margin-bottom: 16px; letter-spacing: -0.02em; line-height: 1.25;
}
.seo-intro {
  text-align: center; font-size: .95rem; line-height: 1.7;
  color: rgba(239,242,247,.72); max-width: 640px;
  margin: 0 auto 48px; font-weight: 300;
}
.seo-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 44px;
}
.seo-card {
  background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.10);
  border-radius: 16px; padding: 28px 24px;
}
.seo-section h3.seo-h3 {
  font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 700;
  color: var(--gold3); margin-bottom: 12px; letter-spacing: .3px;
}
.seo-section h4.seo-h4 {
  font-family: 'Outfit', sans-serif; font-size: .9rem; font-weight: 600;
  color: rgba(239,242,247,.90); margin-bottom: 8px;
}
.seo-p {
  font-size: .875rem; line-height: 1.75; color: rgba(239,242,247,.68);
  margin-bottom: 0; font-weight: 300;
}
.seo-ol, .seo-ul {
  font-size: .875rem; line-height: 1.8; color: rgba(239,242,247,.68);
  margin: 0; padding-left: 1.3em; font-weight: 300;
}
.seo-ul { list-style: none; padding-left: 0; }
.seo-ul li { padding-left: 1.4em; position: relative; margin-bottom: 6px; }
.seo-ul li::before { content: "♦"; position: absolute; left: 0; color: var(--gold); font-size: .6rem; top: .35em; opacity: .7; }
.seo-ul strong { color: rgba(239,242,247,.88); font-weight: 600; }
.seo-inline-link {
  color: var(--gold2);
  text-decoration: none;
  font-weight: 600;
}
.seo-inline-link:hover { color: var(--gold3); text-decoration: underline; }
.scroll-target { scroll-margin-top: 92px; }
#plans.scroll-target { scroll-margin-top: 72px; }
.seo-plan-section {
  background: rgba(255,255,255,.045);
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 16px;
  padding: 28px 24px;
  margin-bottom: 44px;
}
.seo-plan-intro {
  text-align: center;
  max-width: 640px;
  margin: 0 auto 20px;
}
.seo-plan-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.seo-plan-card {
  padding: 20px;
  border-radius: 16px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.08);
}
.seo-plan-card.pro {
  background: linear-gradient(180deg, rgba(241,185,63,.10), rgba(241,185,63,.04));
  border-color: rgba(241,185,63,.22);
}
.seo-plan-topline {
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: rgba(239,242,247,.66);
  margin-bottom: 10px;
}
.seo-plan-card.pro .seo-plan-topline { color: var(--gold2); }
.seo-plan-price {
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: var(--cream);
  margin-bottom: 12px;
}
.seo-plan-card.pro .seo-plan-price { color: var(--gold2); }
.seo-plan-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: rgba(239,242,247,.78);
  font-size: .86rem;
  line-height: 1.55;
}
.seo-plan-list li::before {
  content: "✓";
  color: var(--gold2);
  margin-right: 10px;
}
.seo-plan-actions {
  display: flex;
  justify-content: center;
  margin-top: 18px;
}
.seo-plan-cta { min-width: 220px; }
.seo-features {
  background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.10);
  border-radius: 16px; padding: 28px 24px; margin-bottom: 44px;
}
.seo-faq { margin-top: 0; }
.seo-faq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
.seo-faq-item {
  background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08);
  border-radius: 12px; padding: 20px 18px;
}
.seo-faq-item .seo-p { margin-top: 4px; }
.seo-divider {
  width: 60px; height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
  margin: 44px auto;
}
@media (max-width: 680px) {
  .seo-grid, .seo-faq-grid, .seo-plan-grid, .workspace-room-grid, .team-room-choice-row { grid-template-columns: 1fr; }
  .seo-section h2.seo-h2 { font-size: 1.5rem; }
  .seo-section { margin-top: 40px; }
  .workspace-grid { grid-template-columns: 1fr; }
  .workspace-top,
  .workspace-actions { flex-direction: column; align-items: stretch; }
  .workspace-action-btn { min-width: 0; width: 100%; }
  .workspace-pill { align-self: flex-start; }
  .workspace-room-editor-top { flex-direction: column; }
  .workspace-room-editor-row { grid-template-columns: 1fr; }
  .workspace-room-editor-row button { width: 100%; }
}

/* ══════════════════════ ROOM HEADER (game view) ══════════════════════
   Sits below the global NavBar — top: 64px keeps it stacked correctly.
   Full .hdr override is in the new CSS block appended at end of CSS string. */
.hdr {
  background: rgba(7,14,8,.95);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(20px);
  position: sticky; top: 64px; z-index: 100; padding: 0 24px;
}
.hdr-in {
  max-width: 1160px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  min-height: 60px; gap: 12px; flex-wrap: wrap; padding: 10px 0;
}
.hdr-l { display: flex; align-items: center; gap: 12px; }
.btn-back {
  display: flex; align-items: center; gap: 5px;
  padding: 8px 14px; border-radius: 12px;
  border: 1px solid rgba(158,234,196,.14); background: rgba(255,255,255,.025);
  color: rgba(245,251,247,.76); font-family: 'Outfit', sans-serif;
  font-size: .78rem; cursor: pointer; transition: all .2s;
}
.btn-back:hover { background: rgba(255,255,255,.07); color: var(--cream); border-color: rgba(158,234,196,.24); }
.logo-txt {
  font-family: 'Outfit', sans-serif;
  font-size: 1.3rem; font-weight: 700; color: var(--cream); letter-spacing: -.02em;
}
.hdr-c { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
.badge {
  background: rgba(255,255,255,.045); border: 1px solid rgba(158,234,196,.15);
  border-radius: 100px; padding: 5px 12px;
  font-size: .68rem; letter-spacing: 1.5px; text-transform: uppercase;
  color: rgba(245,251,247,.82);
}
.badge-gold { background: linear-gradient(180deg, rgba(241,185,63,.16), rgba(241,185,63,.08)); border-color: rgba(241,185,63,.28); color: rgba(255,217,120,.88); }
.hdr-r { display: flex; align-items: center; gap: 8px; min-width: 0; }
.hdr-invite {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid rgba(126,230,255,.16);
  background: linear-gradient(180deg, rgba(126,230,255,.08), rgba(241,185,63,.06));
}
.hdr-invite-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hdr-invite-label {
  font-size: .55rem;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: rgba(239,242,247,.66);
}
.hdr-invite-helper {
  font-size: .66rem;
  color: rgba(239,242,247,.62);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hdr-invite-url {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  font-size: .72rem;
  color: var(--mint2);
}
.btn-sm {
  display: flex; align-items: center; gap: 5px;
  padding: 8px 13px; border-radius: 12px;
  border: 1px solid rgba(158,234,196,.14); background: rgba(255,255,255,.03);
  color: rgba(245,251,247,.82); font-family: 'Outfit', sans-serif;
  font-size: .76rem; cursor: pointer; transition: all .2s;
}
.btn-sm:hover { background: rgba(255,255,255,.08); color: var(--cream); }

/* ══════════════════════ LAYOUT ══════════════════════ */
.game-body { max-width: 1160px; margin: 0 auto; padding: 24px 24px 80px; width: 100%; }
.game-grid { display: grid; grid-template-columns: 1fr 300px; gap: 20px; align-items: start; }
.lcol, .rcol { display: flex; flex-direction: column; gap: 16px; }

/* ══════════════════════ PANEL ══════════════════════ */
.panel {
  background:
    linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0)),
    linear-gradient(180deg, rgba(15,32,27,.84), rgba(9,21,18,.96));
  border: 1px solid rgba(158,234,196,.12); border-radius: var(--radius);
  padding: 20px; backdrop-filter: blur(10px);
  box-shadow: var(--shadow-soft), inset 0 1px 0 rgba(255,255,255,.04);
}
.panel-gold { border-color: rgba(241,185,63,.24); box-shadow: var(--shadow-soft), inset 0 1px 0 rgba(255,255,255,.04), 0 0 0 1px rgba(241,185,63,.04); }
.ptitle {
  font-size: .62rem; font-weight: 600; letter-spacing: 2.5px;
  text-transform: uppercase; color: rgba(239,242,247,.62);
  margin-bottom: 14px; display: block;
}

/* ══════════════════════ TIMER ══════════════════════ */
.start-btn {
  width: 100%; padding: 16px; border: none; border-radius: var(--radius-sm);
  background: linear-gradient(135deg, #f0b43f 0%, #ffd978 58%, #fff0b0 100%);
  color: var(--ink); font-family: 'Outfit', sans-serif;
  font-size: 1rem; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  box-shadow: 0 16px 36px rgba(241,185,63,.28), inset 0 1px 0 rgba(255,255,255,.48);
  transition: all .2s; animation: glow 3s ease infinite; letter-spacing: .3px;
}
.start-btn:hover { transform: translateY(-2px); box-shadow: 0 22px 44px rgba(241,185,63,.34), inset 0 1px 0 rgba(255,255,255,.56); }
.tsel-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.tsel-wrap { position: relative; }
.tsel-wrap::after { content: '▾'; position: absolute; right: 11px; top: 50%; transform: translateY(-50%); color: var(--gold); font-size: .72rem; pointer-events: none; }
.tsel {
  appearance: none; padding: 9px 30px 9px 13px;
  background: rgba(255,255,255,.07); border: 1px solid rgba(201,146,42,.35);
  color: var(--gold2); border-radius: 8px;
  font-family: 'Outfit', sans-serif; font-size: .85rem;
  cursor: pointer; outline: none; transition: border-color .2s, background .2s;
}
.tsel:hover { background: rgba(255,255,255,.10); border-color: rgba(201,146,42,.55); }
.tsel option { background: #122018; }
.ring-area {
  display: flex; align-items: center; gap: 16px;
  padding: 14px; background: rgba(255,255,255,.03);
  border-radius: 16px; border: 1px solid rgba(158,234,196,.10);
}
.ring-area.urgent { animation: urgentBg 1s ease infinite; }
.ring-wrap { position: relative; width: 80px; height: 80px; flex-shrink: 0; }
.rsv { transform: rotate(-90deg); }
.rt { fill: none; stroke: rgba(255,255,255,.05); stroke-width: 6; }
.rp { fill: none; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 1s linear, stroke .3s; }
.rnum { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: 'Outfit', sans-serif; font-size: 1.7rem; font-weight: 700; letter-spacing: -0.03em; color: var(--cream); }
.rnum.urgent { color: #e74c3c; }
.rtxt { flex: 1; }
.rstatus { font-size: .72rem; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 3px; color: rgba(245,251,247,.74); }
.rstatus.warn { color: #e67e22; } .rstatus.danger { color: #e74c3c; }
.rhint { font-size: .7rem; color: rgba(239,242,247,.68); margin-top: 3px; }
.btn-stop { margin-top: 8px; padding: 7px 12px; border-radius: 10px; border: 1px solid rgba(158,234,196,.14); background: rgba(255,255,255,.03); color: rgba(245,251,247,.75); font-family: 'Outfit', sans-serif; font-size: .73rem; cursor: pointer; transition: all .2s; }
.btn-stop:hover { background: rgba(255,255,255,.08); color: var(--cream); }
.waiting-hint { font-size: .8rem; color: rgba(239,242,247,.62); font-style: italic; text-align: center; padding: 8px 0; }

/* ══════════════════════ PLAYING CARDS ══════════════════════ */
.cards-grid { display: flex; flex-wrap: wrap; gap: 12px; padding: 4px 0; }
.pcard {
  width: 96px; height: 136px; position: relative;
  display: block;
  border: none;
  padding: 0;
  background: transparent;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer; user-select: none;
  animation: dealIn .35s ease both;
  transition: transform .2s cubic-bezier(.34,1.56,.64,1), filter .2s;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.pcard:hover:not(.locked) { transform: translateY(-16px) scale(1.06); filter: drop-shadow(0 22px 18px rgba(0,0,0,.55)); }
.pcard:focus-visible { outline: 3px solid rgba(232,184,75,.85); outline-offset: 4px; }
.pcard.sel { transform: translateY(-18px) scale(1.08); filter: drop-shadow(0 0 16px rgba(201,145,42,.9)) drop-shadow(0 20px 22px rgba(0,0,0,.6)); }
.pcard.locked { cursor: default; }
.pcard-inner {
  width: 100%; height: 100%;
  background: linear-gradient(160deg, #ffffff 0%, #fdf6e8 100%);
  border-radius: 12px; border: 1px solid rgba(0,0,0,.12);
  box-shadow: 0 2px 0 rgba(255,255,255,.9) inset, 0 10px 28px rgba(0,0,0,.45);
  position: relative; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  transition: background .15s;
}
.pcard.sel .pcard-inner {
  background: linear-gradient(160deg, #fffde8 0%, #fff6c0 100%);
  border-color: rgba(201,145,42,.65);
  box-shadow: 0 2px 0 rgba(255,255,255,.9) inset, 0 10px 28px rgba(0,0,0,.5), 0 0 0 2.5px rgba(201,145,42,.9);
}
/* Corner pip — top-left */
.pcard-tl {
  position: absolute; top: 7px; left: 8px;
  display: flex; flex-direction: column; align-items: center; line-height: 1;
}
/* Corner pip — bottom-right (rotated) */
.pcard-br {
  position: absolute; bottom: 7px; right: 8px;
  display: flex; flex-direction: column; align-items: center; line-height: 1;
  transform: rotate(180deg);
}
.pcard-num      { font-family: 'Outfit', sans-serif; font-size: .95rem; font-weight: 700; color: #1a1208; line-height: 1; letter-spacing: -0.02em; }
.pcard-suit-sm  { font-size: .78rem; line-height: 1; margin-top: 2px; }
.pcard-center   { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; }
.pcard-bignum   { font-family: 'Outfit', sans-serif; font-size: 2.6rem; font-weight: 700; line-height: 1; color: #1a1208; letter-spacing: -0.04em; }
.pcard-bigsuit  { font-size: 1.3rem; line-height: 1; margin-top: 2px; }
/* Colour variants */
.pcard.red .pcard-num,     .pcard.red .pcard-bignum   { color: #b01020; }
.pcard.red .pcard-suit-sm, .pcard.red .pcard-bigsuit  { color: #b01020; }
.pcard:not(.red) .pcard-suit-sm, .pcard:not(.red) .pcard-bigsuit { color: #1a1208; }
/* Wild (?) card */
.pcard.wild .pcard-bignum  { font-size: 2.2rem; color: #6b3fa0; }
.pcard.wild .pcard-bigsuit { color: #6b3fa0; font-size: 1.1rem; }
.pcard.wild .pcard-num     { color: #6b3fa0; }
.pcard.wild .pcard-suit-sm { color: #6b3fa0; }
.pcard.wild .pcard-inner   { background: linear-gradient(160deg, #fdfaff 0%, #f0e8ff 100%); }
.obs-box { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: rgba(41,128,185,.08); border: 1px solid rgba(41,128,185,.2); border-radius: 10px; color: #5dade2; font-size: .86rem; }
.vstatus { text-align: center; font-size: .82rem; padding: 8px 0; }
.vstatus.voted { color: rgba(201,145,42,.7); }
.vstatus.wait  { color: rgba(239,242,247,.68); font-style: italic; }

/* ══════════════════════ RESULTS HERO ══════════════════════ */
.avg-hero {
  text-align: center; padding: 32px 24px 26px;
  background: linear-gradient(135deg, rgba(201,145,42,.14), rgba(201,145,42,.04));
  border: 1.5px solid rgba(201,145,42,.4); border-radius: 18px;
  margin-bottom: 20px; animation: heroIn .45s ease;
  box-shadow: 0 0 50px rgba(201,145,42,.12), 0 8px 32px rgba(0,0,0,.35);
}
.avg-hero-label {
  font-size: .62rem; font-weight: 600; letter-spacing: 2.5px;
  text-transform: uppercase; color: rgba(239,242,247,.73); margin-bottom: 10px;
}
.avg-hero-num {
  font-family: 'Outfit', sans-serif;
  font-size: 5.5rem; color: var(--gold2); font-weight: 700;
  line-height: 1; letter-spacing: -0.05em; text-shadow: 0 0 50px rgba(201,145,42,.45);
  animation: heroIn .5s ease;
}
.avg-hero-sub { font-size: .8rem; color: rgba(239,242,247,.75); margin-top: 10px; }
.avg-hero-consensus {
  display: inline-block; margin-top: 14px;
  background: rgba(201,145,42,.18); border: 1px solid rgba(201,145,42,.38);
  border-radius: 100px; padding: 6px 20px;
  font-size: .82rem; font-weight: 600; color: var(--gold2);
  animation: badgePop .4s .2s ease both;
}
.avg-hero-range { display: flex; justify-content: center; gap: 32px; margin-top: 18px; }
.avg-hero-stat { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.avg-hero-stat .v { font-family: 'Outfit', sans-serif; font-size: 1.5rem; color: var(--cream); font-weight: 700; letter-spacing: -0.03em; }
.avg-hero-stat .l { font-size: .58rem; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(239,242,247,.62); }

/* ══════════════════════ WHO PICKED WHAT ══════════════════════ */
.who-section { margin-bottom: 8px; }
.revealed-grid { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; padding: 4px 0 16px; }
.rv-card { display: flex; flex-direction: column; align-items: center; gap: 7px; animation: dealIn .4s ease both; }
.rv-card-face {
  width: 70px; height: 96px;
  background: linear-gradient(160deg, #fff 0%, #fdf8ee 100%);
  border-radius: 10px; border: 1px solid rgba(0,0,0,.1);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 18px rgba(0,0,0,.4), 0 2px 0 rgba(255,255,255,.9) inset;
}
.rv-card-face.outlier-high { border: 2px solid #e74c3c; box-shadow: 0 6px 18px rgba(231,76,60,.3); }
.rv-card-face.outlier-low  { border: 2px solid #3498db; box-shadow: 0 6px 18px rgba(52,152,219,.3); }
.rv-card-face.consensus    { border: 2px solid var(--gold); box-shadow: 0 6px 18px rgba(201,145,42,.4); }
.rv-val { font-family: 'Outfit', sans-serif; font-size: 2rem; font-weight: 700; color: var(--ink); letter-spacing: -0.04em; }
.rv-val.red { color: #b01020; }
.rv-name { font-size: .68rem; color: rgba(239,242,247,.84); text-align: center; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.rv-you-tag { font-size: .58rem; color: var(--gold2); font-weight: 700; letter-spacing: .3px; }
.outlier-tag { font-size: .55rem; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; padding: 2px 7px; border-radius: 4px; }
.outlier-tag.high { background: rgba(231,76,60,.18); color: #e74c3c; }
.outlier-tag.low  { background: rgba(52,152,219,.18); color: #3498db; }
.no-vote { text-align: center; color: rgba(239,242,247,.67); font-size: .77rem; padding: 6px 0; }

/* ══════════════════════ OBSERVER CONTROLS ══════════════════════ */
.obs-controls { display: flex; flex-direction: column; gap: 10px; }
/* Danger zone separator — visual break between session management and End Session */
.obs-danger-divider {
  display: flex; align-items: center; gap: 8px; margin: 4px 0 2px;
}
.obs-danger-divider::before, .obs-danger-divider::after {
  content: ''; flex: 1; height: 1px; background: rgba(224,72,72,.12);
}
.obs-danger-divider span {
  font-size: .52rem; letter-spacing: 1.8px; text-transform: uppercase;
  color: rgba(231,76,60,.30); white-space: nowrap;
}
.btn-reveal-primary {
  width: 100%; padding: 16px 20px; border: none; border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--gold), var(--gold2));
  color: var(--ink); font-family: 'Outfit', sans-serif;
  font-size: 1rem; font-weight: 700; cursor: pointer;
  transition: all .2s; letter-spacing: .3px;
  box-shadow: 0 4px 20px rgba(201,145,42,.4);
  display: flex; align-items: center; justify-content: center; gap: 10px;
}
.btn-reveal-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(201,145,42,.55); }
.btn-reveal-primary:disabled { opacity: .3; cursor: not-allowed; transform: none; box-shadow: none; }
.obs-secondary-row { display: flex; gap: 10px; }
.btn-next-round {
  flex: 1; padding: 13px 14px; border-radius: var(--radius-sm);
  background: linear-gradient(180deg, rgba(75,216,137,.14), rgba(75,216,137,.07)); border: 1px solid rgba(75,216,137,.26);
  color: #7df0b3; font-family: 'Outfit', sans-serif; font-size: .86rem; font-weight: 600;
  cursor: pointer; transition: all .2s;
  display: flex; align-items: center; justify-content: center; gap: 7px;
}
.btn-next-round:hover { background: linear-gradient(180deg, rgba(75,216,137,.20), rgba(75,216,137,.10)); border-color: rgba(75,216,137,.42); }
.btn-new-session {
  padding: 13px 14px; border-radius: var(--radius-sm);
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.10);
  color: rgba(239,242,247,.62); font-family: 'Outfit', sans-serif;
  font-size: .86rem; font-weight: 600; cursor: pointer; transition: all .2s;
  display: flex; align-items: center; justify-content: center; gap: 7px; white-space: nowrap;
}
.btn-new-session:hover { background: rgba(255,255,255,.09); border-color: rgba(255,255,255,.18); color: var(--cream); }
/* When New Sprint is the only button in the row, stretch it full-width */
.obs-secondary-row .btn-new-session:only-child { flex: 1; }
.btn-hint { font-size: .6rem; color: rgba(239,242,247,.66); text-align: center; margin-top: 1px; font-style: italic; }
.btn-end-session {
  width: 100%; padding: 12px 16px; border-radius: var(--radius-sm);
  background: rgba(224,72,72,.03); border: 1px solid rgba(224,72,72,.18);
  color: rgba(231,76,60,.55); font-family: 'Outfit', sans-serif;
  font-size: .84rem; font-weight: 500; cursor: pointer; transition: all .2s;
  display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 2px;
}
.btn-end-session:hover { background: rgba(192,57,43,.1); border-color: rgba(192,57,43,.35); color: #e74c3c; }
.end-session-hint { font-size: .58rem; color: rgba(239,242,247,.64); text-align: center; margin-top: 3px; font-style: italic; }

/* Story queue panel */
.story-panel { background: rgba(255,255,255,.03); border: 1px solid rgba(158,234,196,.10); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 10px; }
.story-panel-title { font-size: .65rem; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: rgba(239,242,247,.65); margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
.ptitle-optional, .story-panel-optional { font-size: .58rem; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; color: rgba(201,145,42,.7); background: rgba(201,145,42,.1); border: 1px solid rgba(201,145,42,.2); border-radius: 20px; padding: 1px 7px; }
.story-panel-hint { font-size: .72rem; color: rgba(239,242,247,.64); margin-bottom: 10px; line-height: 1.5; font-style: italic; }
.story-active { font-size: .92rem; font-weight: 600; color: var(--cream); margin-bottom: 6px; line-height: 1.35; }
.story-progress { font-size: .68rem; color: rgba(239,242,247,.65); margin-bottom: 10px; }
.story-add-row { display: flex; gap: 6px; margin-bottom: 8px; }
.story-inp { flex: 1; min-width: 0; padding: 8px 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(158,234,196,.16); border-radius: 10px; color: var(--cream); font-family: 'Outfit', sans-serif; font-size: .8rem; transition: border-color .2s, background .2s; resize: vertical; min-height: 38px; max-height: 160px; line-height: 1.4; }
.story-inp::placeholder { color: rgba(239,242,247,.66); }
.story-inp:focus { outline: none; border-color: var(--gold2); background: rgba(255,255,255,.10); }
.btn-story-add { padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(241,185,63,.26); background: linear-gradient(180deg, rgba(241,185,63,.16), rgba(241,185,63,.08)); color: var(--gold2); font-family: 'Outfit', sans-serif; font-size: .78rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all .2s; }
.btn-story-add:hover { background: linear-gradient(180deg, rgba(241,185,63,.22), rgba(241,185,63,.11)); }
.story-list { max-height: 168px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
.story-item { font-size: .75rem; padding: 4px 8px; border-radius: 6px; display: flex; gap: 8px; justify-content: space-between; align-items: center; }
.story-item.done { color: rgba(239,242,247,.62); text-decoration: line-through; }
.story-item.active { background: var(--goldB); color: var(--gold2); font-weight: 600; }
.story-item.queued { color: rgba(239,242,247,.75); }
.story-item-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.story-est { font-size: .68rem; opacity: .7; flex-shrink: 0; }
.story-item-remove {
  flex-shrink: 0; width: 24px; height: 24px; line-height: 1; /* WCAG 2.5.8 */
  border-radius: 6px; border: 1px solid transparent;
  background: none; color: rgba(239,242,247,.62); cursor: pointer;
  font-size: .7rem; transition: color .15s, background .15s, border-color .15s;
}
.story-item-remove:hover { color: var(--red); background: rgba(214,72,72,.12); border-color: rgba(214,72,72,.28); }
/* Willingness-to-pay poll */
.wtp-panel {
  position: relative; margin-top: 14px; padding: 14px 15px;
  border: 1px solid rgba(201,145,42,.24); border-radius: 12px;
  background: rgba(201,145,42,.05);
}
.wtp-dismiss {
  position: absolute; top: 8px; right: 8px;
  width: 26px; height: 26px; border-radius: 7px;
  background: none; border: 1px solid transparent; cursor: pointer;
  color: rgba(239,242,247,.62); font-size: .74rem; line-height: 1;
}
.wtp-dismiss:hover { color: var(--cream); background: rgba(255,255,255,.06); border-color: rgba(158,234,196,.18); }
.wtp-kicker {
  font-size: .58rem; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase;
  color: rgba(232,184,75,.85); margin-bottom: 6px;
}
.wtp-q { font-size: .84rem; color: var(--cream); line-height: 1.45; margin-bottom: 11px; padding-right: 26px; }
.wtp-options { display: flex; flex-direction: column; gap: 6px; }
.wtp-option {
  text-align: left; padding: 9px 11px; min-height: 36px;
  border-radius: 9px; border: 1px solid rgba(158,234,196,.16);
  background: rgba(255,255,255,.035); color: rgba(239,242,247,.88);
  font-family: 'Outfit', sans-serif; font-size: .78rem; cursor: pointer;
  transition: background .15s, border-color .15s, transform .15s;
}
.wtp-option:hover { background: rgba(201,145,42,.12); border-color: rgba(201,145,42,.4); transform: translateX(2px); }
.wtp-note { margin-top: 9px; font-size: .66rem; color: rgba(239,242,247,.66); }
.wtp-thanks { font-size: .82rem; color: var(--gold2); font-weight: 600; }

.kbd-hint {
  margin-top: 10px; font-size: .68rem; color: rgba(239,242,247,.64);
  text-align: center; letter-spacing: .2px;
}
.kbd-hint kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .64rem; padding: 1px 5px; border-radius: 4px;
  background: rgba(255,255,255,.06); border: 1px solid rgba(158,234,196,.18);
  color: rgba(239,242,247,.72);
}
.story-paste-hint { font-size: .68rem; color: rgba(239,242,247,.62); margin: -2px 0 10px; line-height: 1.5; }
/* Sprint summary */
.summary-rows { display: flex; flex-direction: column; gap: 6px; margin: 6px 0 10px; }
.summary-row {
  display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  padding: 6px 10px; border-radius: 8px;
  background: rgba(255,255,255,.02); border: 1px solid var(--border);
}
.summary-row.sized { background: rgba(201,145,42,.06); border-color: rgba(201,145,42,.14); }
.summary-row-name { font-size: .8rem; color: rgba(239,242,247,.65); flex: 1; line-height: 1.3; overflow-wrap: anywhere; }
.summary-row.sized .summary-row-name { color: var(--cream); }
.summary-row-est { font-size: .88rem; font-weight: 700; color: rgba(239,242,247,.68); white-space: nowrap; }
.summary-row.sized .summary-row-est { color: var(--gold2); }
.summary-total { font-size: .72rem; color: rgba(239,242,247,.7); margin-bottom: 10px; letter-spacing: .3px; }
.summary-actions { display: flex; gap: 8px; }
.summary-actions .btn-inv { flex: 1; }
.btn-record-next { width: 100%; padding: 11px; border-radius: var(--radius-sm); border: none; background: linear-gradient(135deg, rgba(75,216,137,.80), rgba(44,176,112,.62)); color: #04100b; font-family: 'Outfit', sans-serif; font-size: .82rem; font-weight: 700; cursor: pointer; transition: all .2s; margin-top: 4px; box-shadow: 0 12px 28px rgba(75,216,137,.18); }
.btn-record-next:hover { background: linear-gradient(135deg, rgba(95,230,154,.88), rgba(52,194,123,.72)); }
.btn-record-next:disabled { opacity: .3; cursor: not-allowed; }
@keyframes recordGlow { 0%, 100% { box-shadow: 0 12px 28px rgba(75,216,137,.25); } 50% { box-shadow: 0 14px 40px rgba(75,216,137,.60), 0 0 0 5px rgba(75,216,137,.18); } }
.btn-record-next.consensus { padding: 15px 11px; font-size: .94rem; letter-spacing: .01em; background: linear-gradient(135deg, rgba(75,216,137,.95), rgba(44,176,112,.85)); animation: recordGlow 2s ease-in-out infinite; margin-top: 8px; }
.btn-record-next.consensus:hover { background: linear-gradient(135deg, #5fe69a, #34c27b); animation: none; box-shadow: 0 14px 40px rgba(75,216,137,.55); }
.btn-record-next.btn-next-item-cta { margin-top: 18px; padding: 18px 20px; border-radius: 18px; font-size: 1.08rem; font-weight: 800; letter-spacing: -.01em; box-shadow: 0 18px 42px rgba(75,216,137,.28); }
.btn-record-next.btn-next-item-cta:hover { transform: translateY(-1px); box-shadow: 0 20px 46px rgba(95,230,154,.34); }
.btn-record-next.btn-next-item-cta.consensus { padding: 20px 20px; font-size: 1.14rem; margin-top: 18px; }
.final-estimate-panel {
  margin: 4px 0 2px;
  padding: 18px 18px 16px;
  border-radius: 18px;
  border: 1px solid rgba(241,185,63,.26);
  background:
    radial-gradient(circle at top, rgba(241,185,63,.10), rgba(241,185,63,0) 58%),
    linear-gradient(180deg, rgba(241,185,63,.11), rgba(255,255,255,.025));
  box-shadow: 0 18px 38px rgba(241,185,63,.10), inset 0 1px 0 rgba(255,255,255,.05);
}
.final-estimate-kicker {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: .62rem; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase;
  color: var(--gold2);
  padding: 5px 10px; border-radius: 999px;
  background: rgba(241,185,63,.10);
  border: 1px solid rgba(241,185,63,.18);
  margin-bottom: 10px;
}
.final-estimate-title {
  font-size: 1.05rem; font-weight: 700; letter-spacing: -0.02em;
  color: var(--cream); margin-bottom: 8px;
}
.final-estimate-copy {
  font-size: .82rem; line-height: 1.65; color: rgba(239,242,247,.78); margin-bottom: 14px;
}
.final-estimate-copy strong { color: rgba(239,242,247,.92); font-weight: 600; }
.inline-final-decision {
  margin-top: 18px;
  padding: 18px 18px 16px;
  border-radius: 18px;
  border: 1px solid rgba(241,185,63,.24);
  background:
    radial-gradient(circle at top, rgba(241,185,63,.10), rgba(241,185,63,0) 58%),
    linear-gradient(180deg, rgba(241,185,63,.10), rgba(255,255,255,.025));
  box-shadow: 0 18px 38px rgba(241,185,63,.10), inset 0 1px 0 rgba(255,255,255,.05);
}
.inline-final-decision-kicker {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: .62rem; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase;
  color: var(--gold2);
  padding: 5px 10px; border-radius: 999px;
  background: rgba(241,185,63,.10);
  border: 1px solid rgba(241,185,63,.18);
  margin-bottom: 10px;
}
.inline-final-decision-title {
  font-size: 1.05rem; font-weight: 700; letter-spacing: -0.02em;
  color: var(--cream); margin-bottom: 8px;
}
.inline-final-decision-copy {
  font-size: .82rem; line-height: 1.65; color: rgba(239,242,247,.78); margin-bottom: 14px;
}
.inline-final-summary {
  margin-bottom: 14px;
}
.inline-final-actions {
  margin-top: 4px;
}
@media (max-width: 680px) {
}
.story-name-banner { background: linear-gradient(180deg, rgba(126,230,255,.08), rgba(241,185,63,.06)); border: 1px solid rgba(126,230,255,.16); border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 12px; }
.story-name-label { font-size: .58rem; letter-spacing: 2px; text-transform: uppercase; color: rgba(239,242,247,.65); display: block; margin-bottom: 3px; }
.story-name-text { font-size: .9rem; font-weight: 600; color: var(--cream); line-height: 1.3; }

/* ══════════════════════ PLAYERS PANEL ══════════════════════ */
.vp-head { display: flex; justify-content: space-between; font-size: .7rem; color: rgba(239,242,247,.65); margin-bottom: 8px; }
.vp-bar { background: rgba(255,255,255,.05); border-radius: 100px; height: 4px; overflow: hidden; margin-bottom: 14px; }
.vp-fill { height: 100%; border-radius: 100px; background: linear-gradient(90deg, var(--gold), var(--gold2)); transition: width .5s ease; }
.plist { display: flex; flex-direction: column; gap: 6px; }
.prow {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 11px;
  background: rgba(255,255,255,.05); border: 1px solid var(--border);
  transition: all .3s;
}
.prow.voted { background: var(--goldB); border-color: rgba(201,145,42,.15); }
.prow.obs   { background: rgba(41,128,185,.07); border-color: rgba(41,128,185,.12); }
.prow.not-voted-yet { border-color: rgba(255,255,255,.04); opacity: .75; }
.prow.not-voted-yet .pav { background: rgba(255,255,255,.10); color: rgba(239,242,247,.80); }
.pav {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: .72rem; background: #2e6640; color: var(--cream);
}
.prow.voted .pav { background: var(--gold); color: var(--ink); }
.prow.obs   .pav { background: rgba(41,128,185,.4); }
.pname { font-size: .84rem; font-weight: 500; color: var(--cream2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prole { font-size: .72rem; color: rgba(239,242,247,.60); margin-top: 1px; }
.prow.obs .prole { color: rgba(93,173,226,.5); }
.prow-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.pdot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.pdot.v { background: var(--gold); }
.pdot.w { background: rgba(255,255,255,.12); animation: pulse 2s ease infinite; }
.pdot.o { background: rgba(93,173,226,.35); }
.vchip {
  background: var(--card-bg); color: var(--ink);
  font-family: 'Outfit', sans-serif; font-weight: 700; font-size: .95rem;
  border-radius: 6px; padding: 3px 10px;
  border: 1px solid var(--gold); min-width: 32px; text-align: center;
  animation: flip .3s ease both;
}
.voted-label { font-size: .72rem; color: rgba(201,145,42,.7); font-weight: 600; }
.waiting-label { font-size: .72rem; color: rgba(231,76,60,.5); font-style: italic; }
.btn-remove-player {
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid rgba(224,72,72,.18);
  background: rgba(224,72,72,.05);
  color: rgba(231,76,60,.82);
  font-family: 'Outfit', sans-serif;
  font-size: .7rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .18s ease;
}
.btn-remove-player:hover {
  background: rgba(224,72,72,.12);
  border-color: rgba(224,72,72,.32);
  color: #ff8a7d;
}
.sep { border: none; border-top: 1px solid var(--border); margin: 6px 0; }
.nobody { font-size: .78rem; color: rgba(239,242,247,.66); font-style: italic; text-align: center; padding: 10px 0; }

/* ══════════════════════ SESSION STATS ══════════════════════ */
.ss-grid { display: flex; gap: 8px; }
.ss-chip {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 12px 8px; background: rgba(255,255,255,.05);
  border: 1px solid var(--border2); border-radius: 10px;
}
.ss-v { font-family: 'Outfit', sans-serif; font-size: 1.5rem; color: var(--gold2); font-weight: 700; letter-spacing: -0.03em; }
.ss-l { font-size: .6rem; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(239,242,247,.60); text-align: center; }

/* ══════════════════════ SESSION WARNING ══════════════════════ */
.session-warn-banner {
  background: linear-gradient(135deg, rgba(230,126,34,.15), rgba(192,57,43,.1));
  border: 1px solid rgba(230,126,34,.35); border-radius: var(--radius-sm);
  padding: 12px 16px; display: flex; align-items: center; gap: 12px;
  animation: urgentBg 2s ease infinite; margin-bottom: 16px;
}
.session-warn-text { flex: 1; font-size: .8rem; color: rgba(239,242,247,.93); }
.session-warn-text strong { color: #e67e22; }

/* ══════════════════════ SOLO INVITE BANNER ══════════════════════ */
.solo-invite-banner {
  display: flex; align-items: center; gap: 12px;
  background: linear-gradient(135deg, rgba(201,145,42,.14), rgba(201,145,42,.06));
  border: 1px solid rgba(201,145,42,.32); border-radius: var(--radius-sm);
  padding: 12px 16px; margin-bottom: 16px;
}
.solo-invite-icon { font-size: 1.15rem; flex-shrink: 0; }
.solo-invite-body { flex: 1; font-size: .8rem; color: rgba(239,242,247,.9); line-height: 1.4; }
.solo-invite-body strong { color: var(--cream); }
.solo-invite-copy {
  padding: 7px 14px; border-radius: 9px;
  background: rgba(201,145,42,.18); border: 1px solid rgba(201,145,42,.36);
  color: var(--gold2); font-family: 'Outfit', sans-serif;
  font-size: .76rem; font-weight: 600; cursor: pointer; white-space: nowrap;
  transition: all .18s;
}
.solo-invite-copy:hover { background: rgba(201,145,42,.28); }
.solo-invite-dismiss {
  padding: 4px 8px; background: none; border: none;
  color: rgba(239,242,247,.62); font-size: .78rem; cursor: pointer;
  flex-shrink: 0; transition: color .15s;
}
.solo-invite-dismiss:hover { color: rgba(239,242,247,.7); }

/* ══════════════════════ TEAM PRO GATE ══════════════════════ */
.team-pro-gate {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 14px; border-radius: 10px; margin-bottom: 18px;
  background: rgba(201,145,42,.06); border: 1px solid rgba(201,145,42,.20);
}
.team-pro-gate-text {
  flex: 1; font-size: .79rem; color: rgba(239,242,247,.70); line-height: 1.45;
}
.team-pro-gate-link {
  padding: 5px 12px; border-radius: 8px;
  background: rgba(201,145,42,.12); border: 1px solid rgba(201,145,42,.28);
  color: var(--gold2); font-family: 'Outfit', sans-serif;
  font-size: .76rem; font-weight: 600; cursor: pointer; white-space: nowrap;
  transition: all .18s;
}
.team-pro-gate-link:hover { background: rgba(201,145,42,.22); }

/* ══════════════════════ INVITE ══════════════════════ */
.inv-panel { border-style: dashed; border-color: rgba(255,255,255,.07); }
.inv-url { background: rgba(255,255,255,.06); border-radius: 8px; padding: 9px 12px; font-family: monospace; font-size: .7rem; color: rgba(239,242,247,.78); word-break: break-all; margin-bottom: 10px; border: 1px solid var(--border2); }
.btn-inv { width: 100%; padding: 10px; background: var(--goldB); border: 1px solid rgba(201,145,42,.2); border-radius: 9px; color: var(--gold2); font-family: 'Outfit', sans-serif; font-size: .82rem; font-weight: 600; cursor: pointer; transition: all .2s; }
.btn-inv:hover { background: rgba(201,145,42,.14); }

/* ══════════════════════ SESSION ANALYTICS ══════════════════════ */
/* Sprint Snapshot — 3-column KPI row */
.a-kpis { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; margin-top: 4px; }
.a-kpi {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
  border-radius: 10px; padding: 9px 10px;
}
.a-kpi-v { font-size: 1.22rem; font-weight: 700; color: var(--gold2); line-height: 1.1; display: block; }
.a-kpi-l {
  font-size: .60rem; color: rgba(239,242,247,.66); margin-top: 3px; display: block;
  font-weight: 400; text-transform: uppercase; letter-spacing: .05em;
}
/* Team Alignment */
.a-align { margin-top: 14px; }
.a-align-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 5px; }
.a-align-title { font-size: .72rem; font-weight: 500; color: rgba(239,242,247,.72); }
.a-align-score { font-size: 1.08rem; font-weight: 700; }
.a-align-score.good    { color: #2ecc71; }
.a-align-score.ok      { color: var(--gold); }
.a-align-score.low     { color: rgba(230,126,34,.90); }   /* amber — coaching signal, not an error */
.a-align-score.neutral { color: rgba(239,242,247,.62); }  /* muted — not enough data yet */
.a-align-bar-track { height: 5px; border-radius: 3px; background: rgba(255,255,255,.09); overflow: hidden; }
.a-align-bar-fill { height: 100%; border-radius: 3px; transition: width .6s ease; }
.a-align-bar-fill.good    { background: linear-gradient(90deg,#2ecc71,#27ae60); }
.a-align-bar-fill.ok      { background: linear-gradient(90deg,var(--gold),var(--gold2)); }
.a-align-bar-fill.low     { background: linear-gradient(90deg,#e67e22,#d35400); }  /* amber, not red */
.a-align-bar-fill.neutral { background: rgba(255,255,255,.07); }
.a-align-sub  { font-size: .68rem; color: rgba(239,242,247,.66); margin-top: 5px; line-height: 1.4; }
.a-align-note { font-size: .60rem; color: rgba(239,242,247,.62); margin-top: 3px; font-style: italic; }
/* Per-story breakdown */
.a-stories { margin-top: 14px; }
.a-section-title {
  font-size: .65rem; font-weight: 500; letter-spacing: .08em; text-transform: uppercase;
  color: rgba(239,242,247,.62); margin-bottom: 4px;
}
.a-story-list { max-height: 180px; overflow-y: auto; }
.a-story-row { display: flex; align-items: center; padding: 5px 0; border-top: 1px solid rgba(255,255,255,.05); }
.a-story-row:first-child { border-top: none; }
.a-story-idx { font-size: .62rem; color: rgba(239,242,247,.62); width: 16px; flex-shrink: 0; font-weight: 400; text-align: right; }
.a-story-name { flex: 1; font-size: .76rem; color: rgba(239,242,247,.82); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0 8px; }
.a-story-est {
  font-size: .72rem; font-weight: 600; color: var(--gold2);
  background: rgba(232,184,75,.10); border: 1px solid rgba(232,184,75,.22);
  border-radius: 12px; padding: 2px 9px; flex-shrink: 0;
}
.a-empty { font-size: .72rem; color: rgba(239,242,247,.62); font-style: italic; padding: 6px 0; }
/* Estimate distribution chips */
.analytics-breakdown { margin-top: 14px; }
.analytics-breakdown-title {
  font-size: .65rem; font-weight: 500; letter-spacing: .08em;
  text-transform: uppercase; color: rgba(239,242,247,.62); margin-bottom: 7px;
}
.analytics-size-breakdown { margin-top: 14px; }
.analytics-size-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.analytics-size-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 10px;
  border-radius: 12px;
  border: 1px solid rgba(241,185,63,.14);
  background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
}
.analytics-size-label {
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: rgba(239,242,247,.62);
}
.analytics-size-count {
  font-family: 'Outfit', sans-serif;
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: -.04em;
  color: var(--gold2);
  line-height: 1;
}
.analytics-size-copy {
  font-size: .66rem;
  color: rgba(239,242,247,.68);
}
.analytics-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.analytics-chip {
  display: flex; align-items: center; gap: 5px; padding: 4px 11px; border-radius: 20px;
  background: rgba(255,255,255,.05); border: 1px solid var(--border); font-size: .78rem; line-height: 1;
}
.analytics-chip-val { font-weight: 600; color: var(--gold2); }
.analytics-chip-cnt { color: rgba(239,242,247,.66); font-weight: 300; }

/* ══════════════════════ STREAK / ESTIMATION SPREE ══════════════════════ */
.streak-panel {
  background: linear-gradient(135deg, rgba(201,145,42,.09) 0%, rgba(201,145,42,.04) 100%);
  border: 1px solid rgba(201,145,42,.28);
  border-radius: var(--radius);
  padding: 13px 16px;
  display: flex; align-items: center; gap: 12px;
  animation: fadeUp .35s ease;
}
.streak-panel.streak-hot {
  border-color: rgba(230,126,34,.40);
  background: linear-gradient(135deg, rgba(230,126,34,.12) 0%, rgba(201,145,42,.05) 100%);
}
.streak-fire  { font-size: 1.45rem; flex-shrink: 0; line-height: 1; }
.streak-body  { flex: 1; min-width: 0; }
.streak-count { font-size: .88rem; font-weight: 700; color: var(--gold2); letter-spacing: .2px; }
.streak-label { font-size: .72rem; color: rgba(239,242,247,.62); margin-top: 2px; font-weight: 300; }

/* ══════════════════════ TOAST ══════════════════════ */
.toast {
  position: fixed; bottom: 28px; left: 50%;
  transform: translateX(-50%) translateY(70px);
  background: linear-gradient(135deg, rgba(255,244,202,.98), rgba(255,223,128,.96)); color: var(--ink);
  border-radius: 16px; padding: 12px 22px;
  font-size: .86rem; font-weight: 600;
  box-shadow: 0 20px 50px rgba(0,0,0,.42);
  border: 1px solid rgba(255,255,255,.35);
  z-index: 500; white-space: nowrap;
  transition: transform .32s cubic-bezier(.34,1.56,.64,1), opacity .3s; opacity: 0;
}
.toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }

/* ══════════════════════ COOKIE CONSENT ══════════════════════ */
/* Storage notice, not a consent gate: nothing here needs consent under PECR
   (essential storage only), so it stays out of the way of the primary action. */
.cookie-banner {
  position: fixed; bottom: 14px; right: 14px; z-index: 600;
  max-width: 340px;
  background: rgba(6,16,13,.94); backdrop-filter: blur(18px) saturate(1.2);
  border: 1px solid rgba(158,234,196,.14);
  border-radius: 14px;
  padding: 13px 15px;
  box-shadow: 0 18px 42px rgba(0,0,0,.45);
  animation: fadeIn .3s ease;
}
.cookie-inner {
  display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap;
}
.cookie-text {
  flex: 1 1 100%; min-width: 0;
  font-size: .72rem; line-height: 1.55;
  color: rgba(239,242,247,.68); font-weight: 300;
}
.cookie-text strong { color: rgba(239,242,247,.90); font-weight: 600; }
.cookie-actions {
  display: flex; align-items: center; gap: 10px; flex: 1 1 100%; justify-content: flex-end;
}
.cookie-link {
  font-size: .75rem; min-height: 24px; display: inline-flex; align-items: center; color: var(--gold2); text-decoration: underline;
  text-decoration-color: rgba(232,184,75,.4); white-space: nowrap;
  font-family: 'Outfit', sans-serif; cursor: pointer; background: none; border: none;
}
.cookie-link:hover { color: var(--gold3); }
.cookie-accept {
  padding: 7px 16px; border: none; border-radius: 10px;
  background: linear-gradient(135deg, #f0b43f 0%, #ffd978 58%, #fff0b0 100%);
  color: var(--ink); font-family: 'Outfit', sans-serif;
  font-size: .82rem; font-weight: 700; cursor: pointer;
  white-space: nowrap; transition: all .2s;
  box-shadow: 0 10px 24px rgba(241,185,63,.22);
}
.cookie-accept:hover { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(241,185,63,.28); }
@media (max-width: 600px) {
  .cookie-banner { left: 10px; right: 10px; bottom: 10px; max-width: none; }
  .kbd-hint { display: none; }
  .cookie-actions { justify-content: space-between; }
}

/* ══════════════════════ LOADING ══════════════════════ */
.loading { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px; }
.spinner { width: 34px; height: 34px; border: 3px solid rgba(201,145,42,.18); border-top-color: var(--gold); border-radius: 50%; animation: spin .8s linear infinite; }

/* ══════════════════════ PRICING MODAL ══════════════════════ */
/* Billing toggle */
/* Currency switcher */
/* Pricing cards */
.pf-icon { font-size: .85rem; flex-shrink: 0; margin-top: 1px; }
.pf-icon.yes { color: var(--green); }
.pf-icon.no  { color: rgba(239,242,247,.62); }
/* Billing note below price */
/* Trial note below CTA */
/* Account status pill */
/* Pricing button on join screen */
.btn-pricing {
  display: block; margin: 0 auto 20px;
  padding: 8px 20px; border-radius: 100px;
  border: 1px solid rgba(201,146,42,.3); background: var(--goldB);
  color: var(--gold2); font-family: 'Outfit', sans-serif;
  font-size: .78rem; font-weight: 600; cursor: pointer;
  transition: all .2s; letter-spacing: .3px;
}
.btn-pricing:hover { background: var(--goldA); border-color: rgba(201,146,42,.5); }
@media (max-width: 600px) {
}

/* ══════════════════════ RESPONSIVE ══════════════════════ */
@media (max-width: 780px) {
  .game-grid { grid-template-columns: 1fr; }
  /* Voters get the cards first; facilitators get the table and controls first.
     Previously both saw the roster and analytics before anything actionable,
     which on a 375px screen meant scrolling past a full viewport to vote. */
  .game-grid.as-voter .rcol { order: 1; }
  .game-grid.as-facilitator .rcol { order: -1; }
  /* One compact row: back, code, copy. The full URL is not readable or useful
     on a phone, and it was pushing the whole room below the fold. */
  /* In a room the .hdr already carries brand, code, and Leave — stacking the
     marketing navbar on top of it cost 65px of a 812px screen for nothing. */
  .in-room .navbar { display: none; }
  .in-room .hdr { top: 0; }
  .hdr { padding: 0 14px; }
  .hdr-in { min-height: 52px; padding: 7px 0; gap: 8px; flex-wrap: nowrap; }
  .hdr-l .chip-logo { display: none; }
  .hdr-c { order: 0; flex: 1; justify-content: center; gap: 6px; }
  .hdr-c .badge:first-child { display: none; }
  .badge-long { display: none; }
  .hdr-r { order: 0; }
  .hdr-invite { padding: 0; border: none; background: none; gap: 0; }
  .hdr-invite-copy { display: none; }
  .cards-grid { justify-content: center; }
  .pcard { width: 82px; height: 118px; }
  .pcard-bignum { font-size: 2.2rem; }
  .pcard-bigsuit { font-size: 1.1rem; }
  .game-body { padding: 16px 16px 60px; }
  .obs-secondary-row { flex-direction: column; }
  .join-box { padding: 36px 24px 32px; }
  .solo-invite-banner { flex-wrap: wrap; }
}
@media (max-width: 420px) {
  .join-title { font-size: 2.1rem; }
  .pcard { width: 70px; height: 100px; }
  .pcard-bignum { font-size: 1.9rem; }
  .pcard-num { font-size: .82rem; }
  .avg-hero-num { font-size: 4rem; }
}

/* ══════════════════════ PAGE SHELL ══════════════════════ */
.page-shell { min-height: 100vh; display: flex; flex-direction: column; }
.app { flex: 1; display: flex; flex-direction: column; position: relative; z-index: 1; }

/* ══════════════════════ GLOBAL NAVBAR ══════════════════════ */
/* Screen-reader-only text: present in the accessibility tree, invisible on screen. */
.visually-hidden {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
/* WCAG 2.4.11 — a focused element must not be hidden behind the sticky bars. */
:focus-visible { scroll-margin-top: 132px; scroll-margin-bottom: 24px; }
.skip-link {
  position: absolute; left: 12px; top: -60px; z-index: 900;
  padding: 10px 16px; border-radius: 0 0 10px 10px;
  background: var(--gold2); color: var(--ink);
  font-family: 'Outfit', sans-serif; font-weight: 700; font-size: .82rem;
  text-decoration: none; transition: top .18s;
}
.skip-link:focus { top: 0; }
.navbar {
  background: rgba(6,16,13,.84);
  border-bottom: 1px solid rgba(158,234,196,.08);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  position: sticky; top: 0; z-index: 200;
  padding: 0 24px;
}
.navbar-inner {
  max-width: 1160px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  height: 64px; gap: 16px;
}
.navbar-left  { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1 1 auto; }
.navbar-right { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 0 0 auto; }
/* Links scroll horizontally on narrow screens instead of being clipped
   behind the right-hand actions. Scrollbar hidden — the fade edge hints at it. */
.navbar-links {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  scroll-padding-inline: 8px;
}
.navbar-links::-webkit-scrollbar { display: none; }
.navbar-links > * { flex: 0 0 auto; }
.navbar-brand {
  font-family: 'Outfit', sans-serif;
  font-size: 1.22rem; font-weight: 700;
  color: var(--cream); letter-spacing: -.02em;
  cursor: pointer; text-decoration: none;
  background: none; border: none; padding: 0;
  transition: color .2s, transform .2s;
}
.navbar-brand:hover { color: var(--cream); transform: translateY(-1px); }
.brand-wordmark {
  display: inline-flex; align-items: baseline; gap: .28em;
  line-height: 1; white-space: nowrap;
}
.brand-wordmark-point,
.brand-wordmark-poker {
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
}
.brand-wordmark-point { color: var(--cream); }
.brand-wordmark-poker { color: var(--gold2); }
.navbar-brand:hover .brand-wordmark-point { color: var(--mint2); }
.navbar-brand:hover .brand-wordmark-poker { color: var(--gold3); }
.nav-link-btn {
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(158,234,196,.08);
  background: rgba(255,255,255,.02);
  color: rgba(239,242,247,.62);
  font-family: 'Outfit', sans-serif;
  font-size: .76rem;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all .18s ease;
}
.nav-link-btn:hover {
  color: var(--cream);
  background: rgba(255,255,255,.06);
  border-color: rgba(158,234,196,.22);
}

/* Casino chip button */
.chip-logo {
  background: none; border: none; padding: 0;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; flex-shrink: 0;
  transition: transform .22s ease, filter .22s ease, opacity .22s ease;
}
.chip-logo img {
  width: 100%; height: 100%; object-fit: contain; display: block;
  filter: drop-shadow(0 8px 18px rgba(0,0,0,.28));
}
.chip-logo:hover  { transform: translateY(-1px) scale(1.03); filter: drop-shadow(0 0 14px rgba(241,185,63,.24)); }
.chip-logo:active { transform: translateY(0) scale(1.01); }

/* Nav auth buttons */
.nav-btn-login {
  padding: 8px 18px; border-radius: 12px;
  border: 1px solid rgba(158,234,196,.16); background: rgba(255,255,255,.03);
  color: rgba(239,242,247,.80); font-family: 'Outfit', sans-serif;
  font-size: .83rem; font-weight: 500; cursor: pointer;
  transition: all .2s; letter-spacing: .2px;
}
.nav-btn-login:hover { background: rgba(255,255,255,.08); color: var(--cream); border-color: rgba(158,234,196,.28); }
.nav-btn-register {
  padding: 8px 20px; border-radius: 12px; border: none;
  background: linear-gradient(135deg, #f0b43f 0%, #ffd978 55%, #fff0b0 100%);
  color: var(--ink); font-family: 'Outfit', sans-serif;
  font-size: .83rem; font-weight: 700; cursor: pointer;
  transition: all .2s; letter-spacing: .2px;
  box-shadow: 0 12px 26px rgba(241,185,63,.24), inset 0 1px 0 rgba(255,255,255,.48);
}
.nav-btn-register:hover { transform: translateY(-1px); box-shadow: 0 16px 32px rgba(241,185,63,.30), inset 0 1px 0 rgba(255,255,255,.56); }
.nav-btn-register:active { transform: none; }

/* ── Sticky game header top already set in the .hdr block above; kept here for reference ── */

/* ══════════════════════ SITE FOOTER ══════════════════════ */
.site-footer {
  background: linear-gradient(180deg, rgba(6,16,13,.94), rgba(4,10,9,.98));
  border-top: 1px solid rgba(158,234,196,.08);
  padding: 44px 24px 0;
  flex-shrink: 0;
}
.footer-inner {
  max-width: 1160px; margin: 0 auto;
  display: grid; grid-template-columns: 1.6fr 1fr 1fr;
  gap: 40px; padding-bottom: 36px;
}
.footer-col-brand { display: flex; flex-direction: column; gap: 12px; }
.footer-brand-row { display: flex; align-items: center; gap: 10px; }
.footer-brand-name {
  font-family: 'Outfit', sans-serif;
  font-size: 1.08rem; font-weight: 700; color: var(--cream);
  letter-spacing: -.02em;
}
.footer-brand-desc {
  font-size: .78rem; color: rgba(239,242,247,.64); line-height: 1.65;
  font-weight: 300; max-width: 280px;
}
.footer-col-links { display: flex; flex-direction: column; gap: 2px; }
.footer-col-title {
  font-size: .62rem; font-weight: 700; letter-spacing: 2px;
  text-transform: uppercase; color: rgba(239,242,247,.62);
  margin-bottom: 10px;
}
.footer-link {
  color: rgba(239,242,247,.7); font-size: .83rem; text-decoration: none;
  padding: 5px 0; transition: color .15s;
  background: none; border: none; cursor: pointer;
  font-family: 'Outfit', sans-serif; text-align: left;
  display: inline-block;
}
.footer-link:hover { color: var(--mint2); }
.footer-bottom {
  border-top: 1px solid rgba(255,255,255,.06);
  padding: 18px 0 20px;
  max-width: 1160px; margin: 0 auto;
  display: flex; align-items: flex-start; justify-content: space-between;
  flex-wrap: wrap; gap: 12px;
}
.footer-copy {
  font-size: .72rem; color: rgba(239,242,247,.62); font-weight: 300;
  line-height: 1.5;
}
.footer-legal-note {
  font-size: .68rem; color: rgba(239,242,247,.62); line-height: 1.6;
  max-width: 480px; text-align: right;
}

/* ══════════════════════ LOGIN MODAL ══════════════════════ */
.login-modal-backdrop {
  position: fixed; inset: 0; z-index: 900;
  background: rgba(0,0,0,.72); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px; animation: fadeIn .2s ease;
}
.login-modal {
  background:
    linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0)),
    linear-gradient(155deg, rgba(12,28,23,.96) 0%, rgba(7,15,13,.98) 58%, rgba(4,10,9,1) 100%);
  border: 1px solid rgba(158,234,196,.14); border-radius: 24px;
  padding: 38px 34px 32px; width: 100%; max-width: 476px;
  box-shadow: 0 44px 110px rgba(0,0,0,.72), inset 0 1px 0 rgba(255,255,255,.06);
  position: relative; animation: fadeUp .3s ease;
  max-height: min(820px, calc(100vh - 48px));
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--gold) var(--scroll-track);
}
.login-modal::-webkit-scrollbar { width: 10px; }
.login-modal::-webkit-scrollbar-track {
  background: var(--scroll-track);
  border-radius: 999px;
}
.login-modal::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: linear-gradient(180deg, var(--gold2), var(--gold));
  border: 2px solid rgba(255,255,255,.03);
}
.login-modal::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, var(--gold3), var(--gold2));
}
.login-modal::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; border-radius: 20px 20px 0 0;
  background: linear-gradient(90deg, transparent, var(--mint), var(--gold2), var(--aqua), transparent);
  background-size: 300% auto; animation: shimmer 3s linear infinite;
}
.login-modal-close {
  position: absolute; top: 14px; right: 16px;
  background: none; border: none; color: rgba(239,242,247,.64);
  font-size: 1.3rem; cursor: pointer; padding: 4px 8px; border-radius: 6px;
  transition: color .2s, background .2s;
}
.login-modal-close:hover { color: var(--cream); background: var(--surface2); }
.login-modal-chip { display: flex; justify-content: center; margin-bottom: 20px; }
.login-modal-title {
  font-family: 'Outfit', sans-serif;
  font-size: 1.86rem; font-weight: 700; color: var(--cream);
  letter-spacing: -0.03em; text-align: center; margin-bottom: 6px;
}
.login-modal-sub {
  font-size: .84rem; color: rgba(239,242,247,.60); text-align: center;
  margin-bottom: 20px; font-weight: 300; line-height: 1.55;
}
.account-status-card {
  margin-bottom: 14px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(158,234,196,.12);
  border-radius: 14px;
  padding: 13px 16px;
}
.account-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: .82rem;
  color: rgba(239,242,247,.78);
}
.account-status-row + .account-status-row { margin-top: 10px; }
.account-status-label {
  color: rgba(239,242,247,.68);
  text-transform: uppercase;
  letter-spacing: .08em;
  font-size: .66rem;
  font-weight: 700;
}
.account-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.10);
  color: rgba(239,242,247,.72);
  font-size: .7rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.account-status-pill.pro {
  color: var(--gold2);
  border-color: rgba(241,185,63,.30);
  background: rgba(241,185,63,.10);
}
.account-status-copy {
  font-size: .8rem;
  line-height: 1.6;
  color: rgba(239,242,247,.68);
}
.login-mode-hint {
  margin: -2px 0 16px;
  text-align: center;
  font-size: .78rem;
  line-height: 1.5;
  color: rgba(255,217,120,.82);
}
.login-upgrade-card {
  margin-top: 18px;
  padding: 16px 18px 18px;
  border-radius: 16px;
  border: 1px solid rgba(158,234,196,.12);
  background:
    linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01)),
    rgba(255,255,255,.02);
}
.login-upgrade-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.login-upgrade-title {
  color: var(--cream);
  font-size: .92rem;
  font-weight: 600;
  letter-spacing: -.01em;
}
.login-upgrade-sub {
  margin: 5px 0 0;
  color: rgba(239,242,247,.62);
  font-size: .78rem;
  line-height: 1.5;
}
.login-upgrade-note {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(158,234,196,.10);
  background: rgba(255,255,255,.02);
  color: rgba(239,242,247,.60);
  font-size: .78rem;
  line-height: 1.55;
}
.login-upgrade-note strong {
  color: rgba(255,217,120,.92);
  font-weight: 600;
}
.login-modal-divider {
  display: flex; align-items: center; gap: 12px;
  margin: 20px 0; color: rgba(239,242,247,.62); font-size: .72rem;
  letter-spacing: 1px; text-transform: uppercase;
}
.login-modal-divider::before, .login-modal-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--border);
}
.login-modal-coming {
  background: rgba(255,255,255,.04); border: 1px solid var(--border);
  border-radius: 12px; padding: 16px; text-align: center;
  font-size: .82rem; color: rgba(239,242,247,.64); line-height: 1.55;
}
.login-modal-coming strong { color: rgba(239,242,247,.70); font-weight: 600; }
.login-modal-upgrade {
  margin-top: 20px; text-align: center;
  font-size: .82rem; color: rgba(239,242,247,.64);
}
.login-modal-upgrade a {
  color: var(--gold2); text-decoration: none; font-weight: 600;
  border-bottom: 1px solid rgba(201,145,42,.3); transition: border-color .2s;
}
.login-modal-upgrade a:hover { border-bottom-color: var(--gold2); }
.login-secondary-btn {
  width: 100%;
  margin-top: 12px;
  margin-bottom: 8px;
  padding: 11px 14px;
  border-radius: 12px;
  border: 1px solid rgba(158,234,196,.14);
  background: rgba(255,255,255,.03);
  color: var(--cream);
  font-family: 'Outfit', sans-serif;
  font-size: .84rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .18s ease;
}
.login-secondary-btn:hover {
  background: rgba(255,255,255,.06);
  border-color: rgba(158,234,196,.24);
}
.auth-mode-row {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px;
}
.auth-mode-btn {
  appearance: none; border: 1px solid rgba(158,234,196,.12); background: rgba(255,255,255,.03);
  color: rgba(239,242,247,.72); border-radius: 999px; padding: 10px 12px; font: inherit;
  font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; cursor: pointer;
  transition: all .2s ease;
}
.auth-mode-btn.active {
  border-color: rgba(241,185,63,.42); background: linear-gradient(180deg, rgba(241,185,63,.16), rgba(241,185,63,.08)); color: var(--gold2);
}
.auth-status {
  font-size: .82rem; margin-top: 10px; text-align: center; padding: 9px 10px; border-radius: 10px;
}
.auth-status.success { color: #2ecc71; background: rgba(46,204,113,.08); border: 1px solid rgba(46,204,113,.18); }
.auth-status.error   { color: #e74c3c; background: rgba(231,76,60,.06); border: 1px solid rgba(231,76,60,.15); }
.nav-account {
  display: flex; flex-direction: column; align-items: flex-end; gap: 4px; margin-right: 12px;
  min-width: 0;
}
.nav-account-name {
  max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: rgba(239,242,247,.86); font-size: .84rem; font-weight: 500;
}
.nav-account-plan {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05);
  color: rgba(239,242,247,.62); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase;
}
.nav-account-plan.pro {
  color: var(--gold2); border-color: rgba(201,145,42,.32); background: rgba(201,145,42,.12);
}

/* ─── Nav upgrade wrapper ─── */
/* Wrapper is exactly button height so it aligns with sibling buttons in navbar-right.
   The subtitle floats below via absolute positioning and does not affect layout. */
.nav-btn-wrapper {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}
.nav-upgrade-sub {
  position: absolute;
  top: calc(100% + 3px);
  left: 50%;
  transform: translateX(-50%);
  font-size: .58rem; font-weight: 500; color: rgba(239,242,247,.62);
  letter-spacing: .15px; line-height: 1; pointer-events: none;
  white-space: nowrap;
}

/* ─── Game upgrade strip — free users only ─── */

/* ─── Footer plan comparison bar ─── */
.footer-plan-bar {
  max-width: 1160px; margin: 0 auto;
  display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
  border-bottom: 1px solid rgba(255,255,255,.06);
  padding: 16px 0 18px;
}
.footer-plan-item { display: flex; align-items: center; gap: 8px; }
.footer-plan-badge {
  padding: 3px 9px; border-radius: 999px;
  font-size: .6rem; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase;
  white-space: nowrap;
}
.footer-plan-badge.free {
  background: rgba(255,255,255,.07); color: rgba(239,242,247,.66);
  border: 1px solid rgba(255,255,255,.10);
}
.footer-plan-badge.pro {
  background: rgba(201,145,42,.14); color: var(--gold2);
  border: 1px solid rgba(201,145,42,.28);
}
.footer-plan-text { font-size: .76rem; color: rgba(239,242,247,.62); }
.footer-plan-divider {
  width: 1px; height: 18px; background: rgba(255,255,255,.08); flex-shrink: 0;
}
.footer-plan-cta {
  margin-left: auto; padding: 7px 18px; border-radius: 10px; border: none;
  background: linear-gradient(135deg, #f0b43f 0%, #ffd978 55%, #fff0b0 100%);
  color: #1a1208; font-family: 'Outfit', sans-serif;
  font-size: .76rem; font-weight: 700; cursor: pointer;
  transition: all .2s; white-space: nowrap;
  box-shadow: 0 4px 12px rgba(241,185,63,.18);
}
.footer-plan-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(241,185,63,.28); }

/* ══════════════════════ LEGAL PAGES ══════════════════════ */
.legal-page {
  width: 100%; padding: 48px 24px 80px;
  display: flex; justify-content: center;
}
.legal-inner {
  max-width: 760px; width: 100%;
}
.legal-back {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 10px;
  border: 1px solid rgba(158,234,196,.18); background: rgba(255,255,255,.04);
  color: rgba(239,242,247,.72); font-family: 'Outfit', sans-serif;
  font-size: .84rem; font-weight: 500; cursor: pointer;
  transition: all .2s; margin-bottom: 32px;
}
.legal-back:hover { background: rgba(255,255,255,.08); color: var(--cream); }
.legal-h1 {
  font-family: 'Outfit', sans-serif; font-size: 2rem; font-weight: 700;
  color: var(--cream); letter-spacing: -0.03em; margin: 0 0 8px;
}
.legal-updated {
  font-size: .78rem; color: rgba(239,242,247,.62); margin: 0 0 40px;
}
.legal-body h2 {
  font-family: 'Outfit', sans-serif; font-size: 1.08rem; font-weight: 600;
  color: var(--cream); letter-spacing: -0.01em; margin: 36px 0 12px;
  padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,.07);
}
.legal-body p, .legal-body li {
  font-size: .88rem; line-height: 1.75; color: rgba(239,242,247,.74);
  margin: 0 0 12px;
}
.legal-body ul {
  padding-left: 20px; margin: 0 0 12px;
}
.legal-body li { margin-bottom: 6px; }
.legal-body strong { color: rgba(239,242,247,.90); font-weight: 600; }
.legal-body a { color: var(--gold2); text-decoration: underline; }
.legal-body a:hover { color: var(--gold3); }
.legal-body code {
  font-family: 'Courier New', monospace; font-size: .82em;
  background: rgba(255,255,255,.07); padding: 1px 6px; border-radius: 4px;
}

/* ══════════════════════ MARKETING PAGES ══════════════════════ */
.marketing-page {
  width: 100%;
  padding: 48px 24px 88px;
  display: flex;
  justify-content: center;
}
.marketing-inner {
  width: 100%;
  max-width: 1040px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.marketing-hero {
  background:
    linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0)),
    linear-gradient(155deg, rgba(12,28,23,.96) 0%, rgba(7,15,13,.98) 58%, rgba(4,10,9,1) 100%);
  border: 1px solid rgba(158,234,196,.14);
  border-radius: 28px;
  padding: 34px 32px 30px;
  box-shadow: 0 30px 80px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.05);
}
.marketing-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(241,185,63,.24);
  background: rgba(241,185,63,.08);
  color: var(--gold2);
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
}
.marketing-title {
  margin-top: 18px;
  font-family: 'Outfit', sans-serif;
  font-size: clamp(2.1rem, 4.6vw, 3.3rem);
  line-height: 1.02;
  letter-spacing: -0.05em;
  color: var(--cream);
  max-width: 820px;
}
.marketing-intro {
  margin-top: 16px;
  max-width: 760px;
  font-size: 1rem;
  line-height: 1.78;
  color: rgba(239,242,247,.72);
  font-weight: 300;
}
.marketing-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
}
.marketing-btn-primary,
.marketing-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 18px;
  border-radius: 14px;
  text-decoration: none;
  font-family: 'Outfit', sans-serif;
  font-size: .9rem;
  font-weight: 700;
  letter-spacing: .01em;
  transition: all .2s ease;
}
.marketing-btn-primary {
  border: none;
  background: linear-gradient(135deg, #f0b43f 0%, #ffd978 55%, #fff0b0 100%);
  color: var(--ink);
  box-shadow: 0 16px 36px rgba(241,185,63,.22), inset 0 1px 0 rgba(255,255,255,.5);
}
.marketing-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 20px 42px rgba(241,185,63,.28), inset 0 1px 0 rgba(255,255,255,.58);
}
.marketing-btn-secondary {
  border: 1px solid rgba(158,234,196,.16);
  background: rgba(255,255,255,.04);
  color: rgba(239,242,247,.84);
}
.marketing-btn-secondary:hover {
  background: rgba(255,255,255,.08);
  color: var(--cream);
  border-color: rgba(158,234,196,.28);
}
.marketing-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 28px;
}
.marketing-stat {
  background: rgba(255,255,255,.045);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 18px;
  padding: 18px 18px 16px;
}
.marketing-stat-value {
  display: block;
  font-size: 1.65rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: var(--cream);
}
.marketing-stat-label {
  display: block;
  margin-top: 6px;
  font-size: .76rem;
  line-height: 1.55;
  color: rgba(239,242,247,.62);
}
.marketing-section {
  background: rgba(255,255,255,.035);
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 24px;
  padding: 28px;
}
.marketing-section-head {
  margin-bottom: 18px;
  max-width: 760px;
}
.marketing-section-title {
  font-size: 1.32rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--cream);
}
.marketing-section-intro {
  margin-top: 8px;
  font-size: .93rem;
  line-height: 1.75;
  color: rgba(239,242,247,.66);
}
.marketing-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.marketing-card {
  background: rgba(255,255,255,.028);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 18px;
  padding: 20px 18px;
}
.marketing-card-title {
  font-size: .98rem;
  font-weight: 700;
  color: var(--gold3);
}
.marketing-card-copy {
  margin-top: 10px;
  font-size: .88rem;
  line-height: 1.7;
  color: rgba(239,242,247,.68);
}
.marketing-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.marketing-list li {
  position: relative;
  padding-left: 18px;
  font-size: .86rem;
  line-height: 1.6;
  color: rgba(239,242,247,.76);
}
.marketing-list li::before {
  content: "♦";
  position: absolute;
  left: 0;
  top: .22rem;
  color: var(--gold2);
  font-size: .6rem;
}
.marketing-list strong {
  color: rgba(239,242,247,.92);
  font-weight: 600;
}
.marketing-steps {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}
.marketing-step {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: start;
  padding: 16px 16px 15px;
  border-radius: 18px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.08);
}
.marketing-step-num {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(241,185,63,.12);
  border: 1px solid rgba(241,185,63,.22);
  color: var(--gold2);
  font-weight: 700;
  font-size: .88rem;
}
.marketing-step-title {
  font-size: .94rem;
  font-weight: 700;
  color: var(--cream);
}
.marketing-step-copy {
  margin-top: 4px;
  font-size: .86rem;
  line-height: 1.65;
  color: rgba(239,242,247,.68);
}
.marketing-plan-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.marketing-plan-card {
  padding: 22px 20px;
  border-radius: 20px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.08);
}
.marketing-plan-card.pro {
  background: linear-gradient(180deg, rgba(241,185,63,.10), rgba(241,185,63,.04));
  border-color: rgba(241,185,63,.22);
}
.marketing-plan-topline {
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: rgba(239,242,247,.66);
  margin-bottom: 10px;
}
.marketing-plan-card.pro .marketing-plan-topline { color: var(--gold2); }
.marketing-plan-price {
  font-size: 1.95rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: var(--cream);
}
.marketing-plan-card.pro .marketing-plan-price { color: var(--gold2); }
.marketing-plan-sub {
  margin-top: 6px;
  font-size: .82rem;
  color: rgba(239,242,247,.62);
  line-height: 1.6;
}
.marketing-note-panel {
  margin-top: 18px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(126,230,255,.16);
  background: linear-gradient(180deg, rgba(126,230,255,.08), rgba(241,185,63,.05));
  color: rgba(239,242,247,.78);
  font-size: .86rem;
  line-height: 1.65;
}
.marketing-related-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.marketing-link-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100%;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
  text-decoration: none;
  transition: all .18s ease;
}
.marketing-link-card:hover {
  transform: translateY(-1px);
  border-color: rgba(158,234,196,.22);
  background: rgba(255,255,255,.05);
}
.marketing-link-kicker {
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: rgba(239,242,247,.62);
}
.marketing-link-title {
  font-size: .96rem;
  font-weight: 700;
  color: var(--cream);
  letter-spacing: -0.02em;
}
.marketing-link-copy {
  font-size: .83rem;
  line-height: 1.65;
  color: rgba(239,242,247,.66);
}
.marketing-cta-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  padding: 24px 26px;
  border-radius: 24px;
  border: 1px solid rgba(241,185,63,.18);
  background: linear-gradient(135deg, rgba(241,185,63,.10), rgba(126,230,255,.05));
}
.marketing-cta-title {
  font-size: 1.08rem;
  font-weight: 700;
  color: var(--cream);
}
.marketing-cta-copy {
  margin-top: 6px;
  max-width: 620px;
  font-size: .88rem;
  line-height: 1.68;
  color: rgba(239,242,247,.68);
}
@media (max-width: 900px) {
  .marketing-card-grid,
  .marketing-related-grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 680px) {
  .marketing-page { padding: 34px 16px 72px; }
  .marketing-hero,
  .marketing-section { padding: 24px 20px; }
  .marketing-actions,
  .marketing-cta-strip { align-items: stretch; }
  .marketing-btn-primary,
  .marketing-btn-secondary { width: 100%; }
  .marketing-stat-grid,
  .marketing-card-grid,
  .marketing-related-grid,
  .marketing-plan-grid { grid-template-columns: 1fr; }
  .marketing-title { font-size: 2rem; }
}

/* ══════════════════════ HISTORY MODAL ══════════════════════ */
.history-overlay {
  position: fixed; inset: 0; z-index: 950;
  background: rgba(0,0,0,.74); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px; animation: fadeIn .2s ease;
}
.history-modal {
  background:
    linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,0)),
    linear-gradient(155deg, rgba(10,24,20,.97) 0%, rgba(6,14,12,.99) 100%);
  border: 1px solid rgba(158,234,196,.14); border-radius: 24px;
  padding: 36px 32px 32px; width: 100%; max-width: 640px;
  max-height: 88vh; overflow-y: auto;
  box-shadow: 0 44px 110px rgba(0,0,0,.72), inset 0 1px 0 rgba(255,255,255,.06);
  position: relative; animation: fadeUp .28s ease;
}
.history-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 22px;
}
.history-close {
  position: absolute; top: 18px; right: 18px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.10);
  color: rgba(239,242,247,.7); width: 32px; height: 32px;
  border-radius: 10px; cursor: pointer; font-size: .85rem;
  display: flex; align-items: center; justify-content: center;
  transition: all .18s;
}
.history-close:hover { color: var(--cream); background: rgba(255,255,255,.10); }
.history-title {
  font-family: 'Outfit', sans-serif;
  font-size: 1.7rem; font-weight: 700; color: var(--cream);
  letter-spacing: -0.03em; margin-bottom: 4px;
}
.history-sub {
  font-size: .82rem; color: rgba(239,242,247,.66); margin: 0;
}
.history-insights {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 10px; margin-bottom: 24px;
}
.hi-card {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
  border-radius: 16px; padding: 14px 12px; text-align: center;
  display: flex; flex-direction: column; gap: 6px; min-height: 108px;
  justify-content: center;
}
.hi-label {
  font-size: .62rem; letter-spacing: 1.5px; text-transform: uppercase;
  color: rgba(239,242,247,.62);
}
.hi-v {
  font-size: 1.8rem; font-weight: 700; color: var(--gold2);
  letter-spacing: -0.04em; line-height: 1;
}
.hi-unit {
  font-size: .7rem; color: rgba(239,242,247,.62); line-height: 1.35;
}
.hi-trend-up   { color: #4bd889; }
.hi-trend-down { color: #e74c3c; }
.hi-trend-flat { color: rgba(239,242,247,.7); }
.history-list { display: flex; flex-direction: column; gap: 10px; }
.history-item {
  background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
  border-radius: 14px; padding: 16px 18px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  transition: border-color .18s;
}
.history-item:hover { border-color: rgba(158,234,196,.18); }
.hi-item-left { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.hi-sprint-label {
  font-size: .72rem; font-weight: 700; letter-spacing: 1.2px;
  text-transform: uppercase; color: rgba(239,242,247,.62);
}
.hi-sprint-date { font-size: .72rem; color: rgba(239,242,247,.62); }
.hi-item-stats { display: flex; gap: 20px; flex-shrink: 0; }
.hi-stat {
  display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
  min-width: 58px;
}
.hi-stat-val {
  font-size: 1.2rem; font-weight: 700; color: var(--cream);
  letter-spacing: -0.03em; line-height: 1;
}
.hi-stat-val.gold { color: var(--gold2); }
.hi-stat-key {
  font-size: .58rem; letter-spacing: 1.2px; text-transform: uppercase;
  color: rgba(239,242,247,.62);
}
.history-empty {
  text-align: center; padding: 52px 28px 46px; color: rgba(239,242,247,.64);
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015));
}
.history-empty-icon {
  width: 68px; height: 68px; border-radius: 20px;
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
  background: radial-gradient(circle at 30% 20%, rgba(241,185,63,.16), rgba(241,185,63,.04));
  border: 1px solid rgba(241,185,63,.12);
  color: var(--gold2); font-size: 1.8rem;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
}
.history-empty-title {
  font-size: 1.12rem; line-height: 1.3; color: rgba(239,242,247,.86);
  margin: 0 0 8px;
}
.history-empty-copy {
  font-size: .92rem; line-height: 1.7; color: rgba(239,242,247,.62);
  max-width: 520px; margin: 0 auto;
}
.history-empty-copy strong {
  color: rgba(239,242,247,.84);
  font-weight: 600;
}

/* NavBar history button */
.nav-btn-history {
  padding: 8px 14px; border-radius: 12px;
  border: 1px solid rgba(158,234,196,.16); background: rgba(255,255,255,.04);
  color: rgba(239,242,247,.75); font-family: 'Outfit', sans-serif;
  font-size: .82rem; font-weight: 500; cursor: pointer;
  transition: all .2s; letter-spacing: .2px;
  display: flex; align-items: center; gap: 6px;
}
.nav-btn-history:hover { background: rgba(255,255,255,.08); color: var(--cream); border-color: rgba(158,234,196,.28); }

@media (max-width: 780px) {
  .history-insights { grid-template-columns: repeat(2, 1fr); }
  .history-modal { padding: 28px 20px 24px; }
}
@media (max-width: 520px) {
  .navbar:not(.authenticated) .nav-btn-history { display: none; }
  .hi-item-stats { gap: 12px; }
}

/* ══════════════════════ RESPONSIVE — FOOTER + NAV ══════════════════════ */
@media (max-width: 780px) {
  .footer-inner { grid-template-columns: 1fr 1fr; }
  .footer-col-brand { grid-column: 1 / -1; }
  .navbar-brand { display: none; }
  .navbar-links { margin-left: 0; }
  .nav-account-name { max-width: 140px; }
  .footer-plan-bar { gap: 14px; }
  .footer-plan-cta { margin-left: 0; }
}
@media (max-width: 520px) {
  .footer-inner { grid-template-columns: 1fr; }
  .footer-legal-note { text-align: left; max-width: 100%; }
  .navbar { padding: 0 14px; }
  .navbar-inner { gap: 10px; }
  .navbar-right { gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .navbar.authenticated .nav-btn-login { display: inline-flex; padding: 7px 12px; font-size: .74rem; }
  .navbar.authenticated .nav-btn-history { display: inline-flex; padding: 7px 11px; font-size: .72rem; }
  .navbar:not(.authenticated) .nav-btn-login { display: none; }
  .navbar-links { gap: 4px; }
  .nav-link-btn { padding: 6px 10px; font-size: .68rem; }
  .nav-btn-register { font-size: .76rem; padding: 7px 13px; }
  .nav-upgrade-sub { display: none; }
  .login-modal { padding: 34px 22px 26px; max-width: 100%; }
  .auth-mode-row { grid-template-columns: 1fr; }
  .login-upgrade-head { flex-direction: column; align-items: stretch; }
  .navbar.authenticated .nav-account {
    display: flex;
    margin-right: 0;
    align-items: flex-end;
    gap: 3px;
  }
  .navbar.authenticated .nav-account-name { max-width: 104px; font-size: .74rem; }
  .navbar.authenticated .nav-account-plan { font-size: .62rem; padding: 3px 8px; letter-spacing: .1em; }
  .navbar:not(.authenticated) .nav-account { display: none; }
  .footer-plan-item:last-of-type .footer-plan-text { display: none; }
}
/* ══════════════════════ REDUCED MOTION (WCAG 2.3.3) ══════════════════════ */
/* Confetti, card deals, pulses, and smooth scrolling are all decorative.
   Honour the OS setting rather than making people sit through them. */
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
    scroll-behavior: auto !important;
  }
  .confetti-canvas { display: none; }
}

/* ══════════════════════ ADMIN DASHBOARD ══════════════════════ */
.ad-wrap { max-width: 1180px; margin: 0 auto; padding: 28px 22px 72px; width: 100%; }
.ad-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; margin-bottom: 22px; }
.ad-back { background: none; border: none; color: var(--gold2); font-family: 'Outfit', sans-serif; font-size: .78rem; cursor: pointer; padding: 0 0 8px; }
.ad-title { font-size: 1.7rem; font-weight: 700; color: var(--cream); letter-spacing: -.02em; }
.ad-sub { font-size: .78rem; color: rgba(239,242,247,.6); margin-top: 4px; }
.ad-head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ad-window { display: flex; gap: 4px; background: rgba(255,255,255,.04); border: 1px solid rgba(158,234,196,.14); border-radius: 10px; padding: 3px; }
.ad-window-btn { min-height: 32px; padding: 5px 12px; border-radius: 8px; border: none; background: none; color: rgba(239,242,247,.68); font-family: 'Outfit', sans-serif; font-size: .74rem; cursor: pointer; }
.ad-window-btn.active { background: var(--goldB); color: var(--gold2); font-weight: 600; }
.ad-btn { min-height: 34px; padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(158,234,196,.2); background: rgba(255,255,255,.05); color: var(--cream); font-family: 'Outfit', sans-serif; font-size: .76rem; cursor: pointer; }
.ad-btn:hover { background: rgba(255,255,255,.09); }
.ad-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
.ad-kpi { background: var(--bg2); border: 1px solid var(--border); border-radius: 14px; padding: 16px 16px 14px; display: flex; flex-direction: column; gap: 3px; }
.ad-kpi-v { font-size: 1.9rem; font-weight: 700; color: var(--gold2); line-height: 1.05; }
.ad-kpi-l { font-size: .72rem; letter-spacing: .8px; text-transform: uppercase; color: rgba(239,242,247,.62); }
.ad-kpi-s { font-size: .7rem; color: rgba(239,242,247,.64); margin-top: 2px; }
.ad-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.ad-panel { background: var(--bg2); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
.ad-panel.wide { grid-column: 1 / -1; }
.ad-panel-title { font-size: .95rem; font-weight: 700; color: var(--cream); margin-bottom: 4px; }
.ad-panel-hint { font-size: .72rem; color: rgba(239,242,247,.7); line-height: 1.5; margin-bottom: 14px; }
.ad-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 12px; }
.ad-stats > div { background: rgba(255,255,255,.03); border: 1px solid var(--border); border-radius: 10px; padding: 11px 12px; display: flex; flex-direction: column; gap: 2px; }
.ad-stats span { font-size: 1.15rem; font-weight: 700; color: var(--cream); }
.ad-stats em { font-style: normal; font-size: .68rem; color: rgba(239,242,247,.7); line-height: 1.35; }
.ad-bars { display: flex; flex-direction: column; gap: 7px; }
.ad-bar-row { display: grid; grid-template-columns: minmax(84px, 1.1fr) 3fr minmax(74px, auto); align-items: center; gap: 10px; }
.ad-bar-label { font-size: .74rem; color: rgba(239,242,247,.78); }
.ad-bar-track { height: 8px; border-radius: 999px; background: rgba(255,255,255,.06); overflow: hidden; }
.ad-bar-fill { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--gold) 0%, var(--gold3) 100%); }
.ad-bar-value { font-size: .74rem; color: var(--cream); text-align: right; font-variant-numeric: tabular-nums; }
.ad-bar-value em { font-style: normal; color: rgba(239,242,247,.64); margin-left: 6px; font-size: .68rem; }
.ad-empty { font-size: .74rem; color: rgba(239,242,247,.64); font-style: italic; padding: 6px 0; }
.ad-trend { margin-bottom: 16px; }
.ad-trend-head { display: flex; justify-content: space-between; font-size: .72rem; color: rgba(239,242,247,.62); margin-bottom: 7px; }
.ad-trend-max { color: rgba(239,242,247,.62); }
.ad-trend-plot { display: flex; align-items: flex-end; gap: 2px; height: 76px; padding: 0 1px; }
.ad-trend-col { flex: 1; min-width: 2px; border-radius: 2px 2px 0 0; background: linear-gradient(180deg, var(--gold3) 0%, var(--gold) 100%); }
.ad-trend-col.zero { background: rgba(255,255,255,.07); }
.ad-trend-axis { display: flex; justify-content: space-between; font-size: .64rem; color: rgba(239,242,247,.62); margin-top: 5px; }
.ad-inputs { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-bottom: 14px; }
.ad-inputs label { display: flex; flex-direction: column; gap: 5px; font-size: .7rem; color: rgba(239,242,247,.62); }
.ad-inputs input { width: 108px; min-height: 34px; padding: 7px 10px; border-radius: 9px; border: 1px solid rgba(158,234,196,.18); background: rgba(255,255,255,.05); color: var(--cream); font-family: 'Outfit', sans-serif; font-size: .82rem; }
.ad-calc { display: flex; flex-direction: column; gap: 2px; padding: 7px 14px; border-left: 1px solid var(--border); }
.ad-calc span { font-size: 1.15rem; font-weight: 700; color: var(--cream); }
.ad-calc.strong span { color: var(--gold2); font-size: 1.5rem; }
.ad-calc em { font-style: normal; font-size: .66rem; color: rgba(239,242,247,.7); }
.ad-verdict { border-radius: 11px; padding: 12px 14px; font-size: .8rem; line-height: 1.55; border: 1px solid; }
.ad-verdict.good { background: rgba(39,174,96,.07); border-color: rgba(39,174,96,.28); color: rgba(239,242,247,.9); }
.ad-verdict.warn { background: rgba(201,145,42,.07); border-color: rgba(201,145,42,.3); color: rgba(239,242,247,.9); }
.ad-verdict-row { margin: 10px 0; }
.ad-dismissed { font-size: .7rem; color: rgba(239,242,247,.64); }
.ad-foot { margin-top: 22px; font-size: .72rem; color: rgba(239,242,247,.64); line-height: 1.6; }
.ad-gate { max-width: 520px; margin: 60px auto; background: var(--bg2); border: 1px solid var(--border); border-radius: 16px; padding: 30px; text-align: center; }
.ad-gate-title { font-size: 1.25rem; color: var(--cream); margin-bottom: 10px; }
.ad-gate-copy { font-size: .84rem; color: rgba(239,242,247,.7); line-height: 1.65; margin-bottom: 18px; }
.ad-gate-copy code { font-family: ui-monospace, Menlo, monospace; font-size: .78rem; color: var(--gold2); }
@media (max-width: 900px) {
  .ad-kpis { grid-template-columns: repeat(2, 1fr); }
  .ad-grid { grid-template-columns: 1fr; }
}
@media (max-width: 520px) {
  .ad-wrap { padding: 20px 14px 60px; }
  .ad-kpis { grid-template-columns: 1fr; }
  .ad-bar-row { grid-template-columns: minmax(70px, 1fr) 2fr auto; gap: 8px; }
  .ad-calc { border-left: none; padding-left: 0; }
}

`;

/* ═══════════════════════ ROOM CONFIG ═══════════════════════ */
// Dynamic rooms: each Create generates a unique 5-char code.
// URL is updated via replaceState so links can be shared directly.
// ── FREE FOR EVERYONE ────────────────────────────────────────────
// Every feature is unlocked for every user while we grow the user base.
// MAX_PARTICIPANTS is imported from routeMeta.mjs so the marketing copy and the
// enforced cap can never disagree. Rooms in Firebase still carry a `plan` field
// (the security rules require it) but it no longer changes what anyone can do.
const SESSION_MAX_MS  = 5 * 60 * 60 * 1000;          // 5 hours, auto-end + save history
const SESSION_WARN_MS = SESSION_MAX_MS - 10 * 60 * 1000; // warn 10 min before auto-end
const PLAYER_AWAY_TIMEOUT_MS = 60 * 60 * 1000;       // 1 hour, grace period before sweeping disconnected players
const ROOM_SWEEP_INTERVAL_MS = 15 * 60 * 1000;       // Best-effort stale-room cleanup cadence per browser
const ROOM_SWEEP_STORAGE_KEY = "pp_last_room_sweep";
const DEFAULT_TIMER_DURATION = 30;

function hasSweepCooldown() {
  try {
    const last = Number(localStorage.getItem(ROOM_SWEEP_STORAGE_KEY) || 0);
    return Date.now() - last < ROOM_SWEEP_INTERVAL_MS;
  } catch {
    return false;
  }
}

function markRoomSweepRun() {
  try {
    localStorage.setItem(ROOM_SWEEP_STORAGE_KEY, String(Date.now()));
  } catch {
    // Best-effort only — room sweeper must never break app usage.
  }
}

async function sweepStaleRooms() {
  try {
    const snap = await get(ref(db, "rooms"));
    if (!snap.exists()) return 0;
    const rooms = snap.val() || {};
    const now = Date.now();
    const updates = {};

    const buildExpiredTeamRoomState = (roomId, room) => {
      const timerDuration = Number(room?.timer?.duration || DEFAULT_TIMER_DURATION) || DEFAULT_TIMER_DURATION;
      return {
        createdAt: now,
        revealed: false,
        round: 1,
        storiesDone: 0,
        streak: 0,
        consensusCount: 0,
        deck: room?.deck || getFounderDefaultDeck(roomId),
        plan: room?.plan || "pro",
        teamName: room?.teamName || roomId,
        founderRoom: !!room?.founderRoom,
        timer: {
          running: false,
          duration: timerDuration,
          remaining: timerDuration,
          startedBy: null,
        },
        players: {},
      };
    };

    Object.entries(rooms).forEach(([roomId, room]) => {
      const createdAt = Number(room?.createdAt || 0);

      // Sweep players who have been disconnected for more than 1 hour
      Object.entries(room?.players || {}).forEach(([playerId, player]) => {
        const disconnectedAt = Number(player?.disconnectedAt || 0);
        if (disconnectedAt && now - disconnectedAt > PLAYER_AWAY_TIMEOUT_MS) {
          updates[`rooms/${roomId}/players/${playerId}`] = null;
        }
      });

      if (!createdAt || now - createdAt < SESSION_MAX_MS) return;

      const isPersistentTeamRoom = !!room?.teamName || !!room?.founderRoom;

      if (isPersistentTeamRoom) {
        updates[`rooms/${roomId}`] = buildExpiredTeamRoomState(roomId, room);
        return;
      }

      updates[`rooms/${roomId}`] = null;
    });

    const count = Object.keys(updates).length;
    if (count > 0) {
      await update(ref(db), updates);
    }
    return count;
  } catch {
    return 0;
  }
}

// ── FOUNDER DETECTION ────────────────────────────────────────
// Stored encoded so the team codes are not readable as plain text
// in the compiled bundle. Not a guarantee, but raises the bar.
// Encoded values are: btoa("<teamCode>") — never commit the raw names.
const FOUNDER_ROOM_CONFIG = [
  { hash: "cnBhLWJ1aWxkLXRlYW0=", defaultDeck: "fibonacci" },
  { hash: "cnBhLWRpc2NvdmVyeS10ZWFt", defaultDeck: "tshirt" },
];
const getFounderRoomConfig = (code = "") => {
  try {
    const normalized = code.toLowerCase();
    return FOUNDER_ROOM_CONFIG.find(({ hash }) => atob(hash) === normalized) || null;
  } catch {
    return null;
  }
};
const isFounderRoom = (code) => !!getFounderRoomConfig(code);
const getFounderDefaultDeck = (code) => getFounderRoomConfig(code)?.defaultDeck || "fibonacci";

/* ═══════════════════════ CASINO CHIP LOGO ═══════════════════════
   SVG casino chip, 8-segment outer ring, gold inner border, "PP" text.
   Used in NavBar (44px) and LoginModal (52px).
   onClick: optional handler, e.g. navigate home.
═══════════════════════════════════════════════════════════════════ */
function BrandMark({ onClick, size = 44, label = "Go to home" }) {
  return (
    <button className="chip-logo" onClick={onClick} aria-label={label}
      style={{ width: size, height: size }}
    >
      <img src="/brand-mark.png" alt="" aria-hidden="true" />
    </button>
  );
}

function BrandWordmark() {
  return (
    <span className="brand-wordmark" aria-label="Point Poker">
      <span className="brand-wordmark-point">Point</span>
      <span className="brand-wordmark-poker">Poker</span>
    </span>
  );
}

function NavLinkButton({ children, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      className="nav-link-btn"
      onClick={onClick}
      aria-label={ariaLabel || children}
    >
      {children}
    </button>
  );
}

function RouteLink({ href, onNavigate, className, children, ...props }) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (!onNavigate) return;
        e.preventDefault();
        onNavigate(href);
      }}
      {...props}
    >
      {children}
    </a>
  );
}

/* ═══════════════════════ GLOBAL NAVBAR ═══════════════════════
   Persistent top bar shown on all screens.
   - Left:  Brand mark + "pointpoker" brand name
   - Right: Account state + pricing CTA
═══════════════════════════════════════════════════════════════ */
function NavBar({
  onLogoClick,
  onLogin,
  onStartFree,
  onPlans,
  onSupport,
  onTrust,
  onFaq,
  currentUser,
  onLogout,
  onHistory,
  onAdmin,
  showMarketingNav = true,
  inRoom = false,
}) {
  const accountLabel = currentUser?.displayName || currentUser?.email || null;

  return (
    <nav
      className={`navbar${currentUser ? " authenticated" : ""}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="navbar-inner">
        <div className="navbar-left">
          <BrandMark
            onClick={onLogoClick}
            size={44}
            label="pointpoker, go to home"
          />
          <button className="navbar-brand" onClick={onLogoClick}>
            <BrandWordmark />
          </button>
          {showMarketingNav && (
            <div className="navbar-links" aria-label="Marketing sections">
              <NavLinkButton onClick={onPlans} ariaLabel="Go to pricing">
                Pricing
              </NavLinkButton>
              <NavLinkButton onClick={onSupport} ariaLabel="Go to support">
                Support
              </NavLinkButton>
              <NavLinkButton onClick={onTrust} ariaLabel="Go to trust and reliability">
                Trust
              </NavLinkButton>
              <NavLinkButton onClick={onFaq} ariaLabel="Go to frequently asked questions">
                FAQ
              </NavLinkButton>
            </div>
          )}
        </div>
        <div className="navbar-right">
          {currentUser ? (
            <>
              <button
                className="nav-btn-history"
                onClick={onHistory}
                aria-label="View sprint history"
              >
                📊 History
              </button>
              <div className="nav-account" aria-label="Signed-in account">
                <span className="nav-account-name">{accountLabel}</span>
                <span className="nav-account-plan">Free</span>
              </div>
              {onAdmin && (
                <button className="nav-btn-login" onClick={onAdmin} aria-label="Usage dashboard">📈</button>
              )}
              <button className="nav-btn-login" onClick={onLogout}>Sign out</button>
            </>
          ) : (
            <>
              <button className="nav-btn-login" onClick={onLogin}>Sign in</button>
              {!inRoom && (
                <div className="nav-btn-wrapper">
                  <button className="nav-btn-register" onClick={onStartFree}>Start a free room</button>
                  <span className="nav-upgrade-sub">No sign-up · No card · No limits</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════ SITE FOOTER ═══════════════════════
   Three-column footer: brand, legal links, product links.
   onCookieSettings: resets cookie consent so the banner re-appears.
═══════════════════════════════════════════════════════════════ */
function SiteFooter({ onCookieSettings, currentUser, onNavTerms, onNavPrivacy, onNavigate }) {
  const year = new Date().getFullYear();
  const support = process.env.REACT_APP_SUPPORT_EMAIL || "support@pointpoker.app";
  const signedIn = !!currentUser;

  return (
    <footer className="site-footer" aria-label="Site footer">

      {/* ── Free-for-everyone bar ── */}
      <div className="footer-plan-bar">
        <div className="footer-plan-item">
          <span className="footer-plan-badge free">£0</span>
          <span className="footer-plan-text">
            Every feature, every team, no card. Up to {MAX_PARTICIPANTS} people per room, unlimited rounds, unlimited stories, no ads.
          </span>
        </div>
        <div className="footer-plan-divider" aria-hidden="true" />
        <div className="footer-plan-item">
          <span className="footer-plan-badge pro">Later</span>
          <span className="footer-plan-text">
            Paid add-ons may arrive once the tool has a real user base. Everything listed here stays free.
          </span>
        </div>
      </div>

      <div className="footer-inner">

        {/* Column 1, Brand */}
        <div className="footer-col-brand">
          <div className="footer-brand-row">
            <BrandMark size={36} label="pointpoker"/>
            <span className="footer-brand-name"><BrandWordmark /></span>
          </div>
          <p className="footer-brand-desc">
            {signedIn
              ? "Your workspace is live. Reuse either Team Room, share the invite link, and keep sprint history attached to your account."
              : "Free, real-time planning poker for agile and Scrum teams. No sign-up required. Works in any browser."}
          </p>
          {!signedIn && (
            <p className="footer-brand-desc" style={{ marginTop: 4 }}>
              Built for Product Owners, Scrum Masters, and distributed teams
              who need fast, structured story-point consensus.
            </p>
          )}
        </div>

        {/* Column 2, Legal */}
        <div className="footer-col-links">
          <div className="footer-col-title">Legal</div>
          <button className="footer-link" onClick={onNavTerms}>Terms of Service</button>
          <button className="footer-link" onClick={onNavPrivacy}>Privacy Policy</button>
          <button className="footer-link" onClick={onCookieSettings}>Cookie Settings</button>
          <button className="footer-link" onClick={onNavPrivacy}>Data &amp; GDPR</button>
        </div>

        {/* Column 3, Product */}
        <div className="footer-col-links">
          <div className="footer-col-title">{signedIn ? "Account" : "Product"}</div>
          {signedIn ? (
            <>
              <span className="footer-link" style={{ color: "rgba(239,242,247,.62)", cursor: "default" }}>
                Workspace active · Free
              </span>
              <RouteLink href="/features" className="footer-link" onNavigate={onNavigate}>Features</RouteLink>
              <RouteLink href="/support" className="footer-link" onNavigate={onNavigate}>Support</RouteLink>
              <a href={`mailto:${support}`} className="footer-link">Email support</a>
            </>
          ) : (
            <>
              <RouteLink href="/" className="footer-link" onNavigate={onNavigate}>Free Planning Poker</RouteLink>
              <RouteLink href="/about" className="footer-link" onNavigate={onNavigate}>About pointpoker</RouteLink>
              <RouteLink href="/trust" className="footer-link" onNavigate={onNavigate}>Trust &amp; reliability</RouteLink>
              <RouteLink href="/features" className="footer-link" onNavigate={onNavigate}>Features</RouteLink>
              <RouteLink href="/pricing" className="footer-link" onNavigate={onNavigate}>Pricing &amp; plans</RouteLink>
              <RouteLink href="/planning-poker-online" className="footer-link" onNavigate={onNavigate}>Planning poker online</RouteLink>
              <RouteLink href="/support" className="footer-link" onNavigate={onNavigate}>Support &amp; contact</RouteLink>
            </>
          )}
        </div>
      </div>

      {/* Bottom bar, copyright + legal note */}
      <div className="footer-bottom">
        <div className="footer-copy">
          © {year} pointpoker. All rights reserved.
          Registered in England &amp; Wales.
        </div>
        <div className="footer-legal-note">
          pointpoker is provided "as-is" without warranty of any kind.
          Use is subject to our{" "}
          <button
            onClick={onNavTerms}
            style={{ color: "rgba(239,242,247,.62)", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
          >
            Terms of Service
          </button>
          . Firebase and Vercel are third-party services and
          are not affiliated with pointpoker.
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════ LOGIN MODAL ═══════════════════════
   Shown when user clicks "Log in" in the NavBar.
   Supports:
   1. Email/password sign in
   2. Account creation
   3. Password reset
═══════════════════════════════════════════════════════════════ */
function LoginModal({
  onClose,
  onAuthSuccess,
  currentUser,
  initialMode = "signin",
  entryIntent = "general",
}) {
  const [mode, setMode] = useState(currentUser ? "account" : initialMode);
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState(currentUser?.email || "");
  const [passInput, setPassInput] = useState("");
  const [authStatus, setAuthStatus] = useState(null);
  const [authError, setAuthError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState(null);
  // "teamroom" = the user tried to host a Team Room, which needs an owner identity.
  const teamRoomIntent = entryIntent === "teamroom";
  const support = process.env.REACT_APP_SUPPORT_EMAIL || "support@pointpoker.app";
  const [dialogRef, closeDialog] = useDialog(onClose);

  const title = currentUser
    ? "Your account"
    : mode === "register"
      ? "Create your free account"
      : mode === "reset"
        ? "Reset your password"
        : "Sign in";

  const subtitle = currentUser
    ? "Everything on pointpoker is free. This account holds your two Team Rooms and your sprint history."
    : mode === "register"
      ? teamRoomIntent
        ? "Team Rooms are free. The account exists so the room URL is yours and no other team can land in it."
        : "Free, no card, about thirty seconds. You get two permanent Team Room links and your sprint history."
      : mode === "reset"
        ? "Enter your account email and we’ll send a password reset link."
        : "Welcome back. Your Team Rooms and sprint history are waiting.";
  const modeHint = currentUser
    ? "Both Team Rooms and Sprint History are already available on this account."
    : teamRoomIntent
      ? "One free account, then your Team Room links never change again."
      : mode === "register"
        ? "You never need an account to run a room, only to keep permanent Team Room links."
        : mode === "signin"
          ? "Already registered? Sign in to restore your Team Rooms and sprint history."
          : "We’ll email you a reset link for this account.";
  const isRegisterTransition =
    mode === "register" &&
    (authStatus === "loading" ||
      authStatus === "verify" ||
      authStatus === "verify_resent" ||
      authStatus === "verify_error" ||
      authStatus === "verify_resending" ||
      authStatus === "ok");
  const showAuthForm = !currentUser || isRegisterTransition;
  const showSignedInAccount = currentUser && !isRegisterTransition;
  const registerComplete =
    mode === "register" &&
    ["verify", "verify_resent", "verify_error"].includes(authStatus);

  const resetMessages = () => {
    setAuthStatus(null);
    setAuthError("");
    setRegisterSuccess(null);
  };

  const handleRegisterContinue = () => {
    onAuthSuccess?.({
      mode: "register",
      verificationSent: !!registerSuccess?.verificationSent,
    });
  };

  const handleResendVerification = async () => {
    const targetUser = auth.currentUser || currentUser;
    if (!targetUser?.email) {
      setAuthError("This account does not have an email address available for verification.");
      return;
    }
    setAuthStatus("verify_resending");
    setAuthError("");
    try {
      await sendEmailVerification(targetUser, { url: SITE_URL });
      setRegisterSuccess((prev) => ({
        ...(prev || {}),
        email: targetUser.email || prev?.email || "",
        verificationSent: true,
      }));
      setAuthStatus("verify_resent");
    } catch (error) {
      setAuthStatus("verify_error");
      setAuthError(getVerificationErrorMessage(error));
      setRegisterSuccess((prev) => ({
        ...(prev || {}),
        email: targetUser.email || prev?.email || "",
        verificationSent: false,
      }));
    }
  };

  const handleSignIn = async () => {
    if (!emailInput.trim() || !passInput) {
      setAuthError("Enter your email and password.");
      return;
    }
    setAuthStatus("loading");
    setAuthError("");
    try {
      await signInWithEmailAndPassword(auth, emailInput.trim(), passInput);
      setAuthStatus("ok");
      setTimeout(() => onAuthSuccess?.({ mode: "signin" }), 500);
    } catch (error) {
      setAuthStatus(null);
      setAuthError(getAuthErrorMessage(error));
    }
  };

  const handleRegister = async () => {
    if (!nameInput.trim()) {
      setAuthError("Enter your name so teammates can recognise you.");
      return;
    }
    if (!emailInput.trim() || !passInput) {
      setAuthError("Enter your email and password.");
      return;
    }
    setAuthStatus("loading");
    setAuthError("");
    setRegisterSuccess(null);
    try {
      const credential = await createUserWithEmailAndPassword(auth, emailInput.trim(), passInput);
      await updateProfile(credential.user, { displayName: nameInput.trim().slice(0, 40) });
      await saveUserProfile(credential.user, {
        displayName: nameInput.trim().slice(0, 40),
        email: credential.user.email || emailInput.trim(),
        plan: "free",
      });
      let verificationSent = false;
      let verificationError = null;
      try {
        await sendEmailVerification(credential.user, { url: SITE_URL });
        verificationSent = true;
      } catch (error) {
        verificationError = error;
      }
      setRegisterSuccess({
        email: credential.user.email || emailInput.trim(),
        verificationSent,
      });
      setAuthStatus(verificationSent ? "verify" : "verify_error");
      if (verificationError) {
        setAuthError(getVerificationErrorMessage(verificationError));
      }
    } catch (error) {
      setAuthStatus(null);
      setAuthError(getAuthErrorMessage(error));
    }
  };

  const handleReset = async () => {
    if (!emailInput.trim()) {
      setAuthError("Enter your email and we'll send a reset link.");
      return;
    }
    setAuthStatus("loading");
    setAuthError("");
    try {
      await sendPasswordResetEmail(auth, emailInput.trim());
      setAuthStatus("reset");
    } catch (error) {
      setAuthStatus(null);
      setAuthError(getAuthErrorMessage(error));
    }
  };

  const handleSignedInReset = async () => {
    if (!currentUser?.email) {
      setAuthError("This account does not have a password reset email available.");
      return;
    }
    setAuthStatus("loading");
    setAuthError("");
    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      setAuthStatus("reset");
    } catch (error) {
      setAuthStatus(null);
      setAuthError(getAuthErrorMessage(error));
    }
  };

  return (
    <div className="login-modal-backdrop" onClick={(e) => e.target === e.currentTarget && closeDialog()}>
      <div className="login-modal" role="dialog" aria-modal="true" aria-label={title} ref={dialogRef}>
        <button className="login-modal-close" onClick={closeDialog} aria-label="Close">×</button>

        {/* Chip */}
        <div className="login-modal-chip">
          <BrandMark size={52} label="pointpoker"/>
        </div>

        <h2 className="login-modal-title">{title}</h2>
        <p className="login-modal-sub">{subtitle}</p>

        <div className="account-status-card">
          {currentUser ? (
            <>
              <div className="account-status-row">
                <span className="account-status-label">Signed in as</span>
                <strong>{currentUser.displayName || currentUser.email || "Current account"}</strong>
              </div>
              <div className="account-status-row">
                <span className="account-status-label">Plan</span>
                <span className="account-status-pill">Free, everything unlocked</span>
              </div>
            </>
          ) : (
            <p className="account-status-copy">
              You never need an account to run a room. Create one if you want two permanent Team Room links and sprint history that follows you across devices.
            </p>
          )}
        </div>
        <p className="login-mode-hint">{modeHint}</p>

        {showAuthForm && (
          <>
            <div className="auth-mode-row">
              <button
                type="button"
                className={`auth-mode-btn${mode === "signin" ? " active" : ""}`}
                aria-pressed={mode === "signin"}
                onClick={() => { setMode("signin"); resetMessages(); }}
              >
                Sign in
              </button>
              <button
                type="button"
                className={`auth-mode-btn${mode === "register" ? " active" : ""}`}
                aria-pressed={mode === "register"}
                onClick={() => { setMode("register"); resetMessages(); }}
              >
                Create account
              </button>
              <button
                type="button"
                className={`auth-mode-btn${mode === "reset" ? " active" : ""}`}
                aria-pressed={mode === "reset"}
                onClick={() => { setMode("reset"); resetMessages(); }}
              >
                Reset password
              </button>
            </div>

            {mode === "register" && (
              <>
                <label className="lbl">Full Name</label>
                <input
                  className="inp"
                  placeholder="Alex Johnson"
                  value={nameInput}
                  onChange={(e) => { setNameInput(e.target.value); resetMessages(); }}
                  maxLength={40}
                  autoFocus
                />
              </>
            )}

            <label className="lbl">{mode === "reset" ? "Account Email" : "Email"}</label>
            <input
              className="inp"
              type="email"
              placeholder="you@company.com"
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); resetMessages(); }}
              autoFocus={mode !== "register"}
            />

            {mode !== "reset" && (
              <>
                <label className="lbl">Password</label>
                <input
                  className="inp"
                  type="password"
                  placeholder={mode === "register" ? "Minimum 6 characters" : "Your password"}
                  value={passInput}
                  onChange={(e) => { setPassInput(e.target.value); resetMessages(); }}
                  onKeyDown={(e) => e.key === "Enter" && (mode === "register" ? handleRegister() : handleSignIn())}
                />
              </>
            )}

            {authError && <div className="auth-status error">{authError}</div>}
            {authStatus === "ok" && mode !== "register" && (
              <div className="auth-status success">
                {mode === "register" ? "✓ Account created." : "✓ Signed in."}
              </div>
            )}
            {authStatus === "verify" && (
              <div className="auth-status success">
                ✓ Account created. Check {registerSuccess?.email || "your email"} to verify your address.
              </div>
            )}
            {authStatus === "verify_resent" && (
              <div className="auth-status success">
                ✓ Verification email resent to {registerSuccess?.email || "your inbox"}.
              </div>
            )}
            {authStatus === "verify_error" && (
              <div className="auth-status error">
                ✓ Account created, but we could not send the verification email yet. Use resend below.
              </div>
            )}
            {authStatus === "reset" && (
              <div className="auth-status success">✓ Password reset email sent.</div>
            )}

            {mode === "signin" && (
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={handleSignIn} disabled={authStatus === "loading"}>
                {authStatus === "loading" ? "Signing in…" : "Sign in"}
              </button>
            )}
            {mode === "register" && !registerComplete && (
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={handleRegister} disabled={authStatus === "loading"}>
                {authStatus === "loading" ? "Creating account…" : teamRoomIntent ? "Create account & claim my Team Rooms" : "Create free account"}
              </button>
            )}
            {mode === "register" && registerComplete && (
              <>
                <button className="btn-primary" style={{ marginTop: 12 }} onClick={handleRegisterContinue}>
                  {teamRoomIntent ? "Continue to my Team Rooms" : "Continue to workspace"}
                </button>
                <button
                  type="button"
                  className="login-secondary-btn"
                  style={{ marginTop: 12 }}
                  onClick={handleResendVerification}
                  disabled={authStatus === "verify_resending"}
                >
                  {authStatus === "verify_resending" ? "Sending verification…" : "Resend verification email"}
                </button>
              </>
            )}
            {mode === "reset" && (
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={handleReset} disabled={authStatus === "loading"}>
                {authStatus === "loading" ? "Sending reset…" : "Send reset link"}
              </button>
            )}
          </>
        )}

        {showSignedInAccount && (
          <div className="login-modal-coming">
            <strong>{currentUser.displayName || "Signed in"}</strong><br />
            {currentUser.email}
          </div>
        )}

        {showSignedInAccount && authStatus === "reset" && (
          <div className="auth-status success">✓ Password reset email sent.</div>
        )}
        {showSignedInAccount && authError && (
          <div className="auth-status error">{authError}</div>
        )}

        {showSignedInAccount && !currentUser?.emailVerified && (
          <>
            <div className="auth-status error">
              Your email address is not verified yet. Resend the verification email if you still need it.
            </div>
            <button
              type="button"
              className="login-secondary-btn"
              onClick={handleResendVerification}
              disabled={authStatus === "verify_resending"}
            >
              {authStatus === "verify_resending" ? "Sending verification…" : "Resend verification email"}
            </button>
          </>
        )}

        {showSignedInAccount && (
          <button
            type="button"
            className="login-secondary-btn"
            onClick={handleSignedInReset}
            disabled={authStatus === "loading"}
          >
            {authStatus === "loading" ? "Sending reset…" : "Send password reset email"}
          </button>
        )}

        {currentUser ? (
          <div className="login-upgrade-card">
            <div className="login-upgrade-head">
              <div>
                <div className="login-upgrade-title">What this account gives you</div>
                <p className="login-upgrade-sub">
                  Two permanent Team Room links and your sprint history, both already active on this account.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="login-upgrade-card">
            <div className="login-upgrade-head">
              <div>
                <div className="login-upgrade-title">What an account adds</div>
                <p className="login-upgrade-sub">
                  Two permanent Team Room links that never change, plus sprint history so you can see velocity and alignment over time. Both free.
                </p>
              </div>
            </div>
            <div className="login-upgrade-note">
              <strong>Everything else is already free without an account.</strong> Rooms, all card decks, {MAX_PARTICIPANTS} participants, the queue, timer, analytics, and export work for anyone with the link.
            </div>
          </div>
        )}

        <div className="login-modal-upgrade">
          Something not working?{" "}
          <a
            href={`mailto:${support}`}
            style={{ color: "var(--gold2)", textDecoration: "none", fontWeight: 600 }}
          >
            Email support ↗
          </a>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ COOKIE / STORAGE NOTICE ═══════════════════════ */
function CookieBanner({ onAccept }) {
  // Nothing here needs consent, so the notice bows out on its own rather than
  // waiting for a click it does not actually need.
  useEffect(() => {
    const t = setTimeout(onAccept, 12000);
    return () => clearTimeout(t);
  }, [onAccept]);
  return (
    <div className="cookie-banner" role="note" aria-label="Storage notice">
      <div className="cookie-inner">
        <p className="cookie-text">
          <strong>Essential browser storage only.</strong>{" "}
          Firebase keeps your session; your display name and this notice are remembered locally.
          No advertising, tracking, or third-party analytics cookies, nothing to opt out of.
        </p>
        <div className="cookie-actions">
          <a href="/privacy" className="cookie-link" target="_blank" rel="noopener noreferrer">Privacy</a>
          <a href="/terms" className="cookie-link" target="_blank" rel="noopener noreferrer">Terms</a>
          <button className="cookie-accept" onClick={onAccept}>Got it</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ MAIN APP ═══════════════════════ */
export default function App() {
  const [screen, setScreen] = useState(() => getScreenForPath(window.location.pathname));
  // Per-tab identity, persisted so a refresh reconnects as the same player
  // instead of leaving a ghost behind and burning a seat in the room.
  const [myId] = useState(() => {
    try {
      const existing = sessionStorage.getItem("pp_player_id");
      if (existing) return existing;
      const fresh = uid();
      sessionStorage.setItem("pp_player_id", fresh);
      return fresh;
    } catch {
      return uid();
    }
  });
  const [myRole, setMyRole] = useState("voter");
  const [authUser, setAuthUser] = useState(() => auth.currentUser);
  const [accountProfile, setAccountProfile] = useState(null);
  const [cookieAccepted, setCookieAccepted] = useState(
    () => {
      try { return localStorage.getItem("pp_cookie_ok") === "1"; }
      catch { return false; }
    }
  );
  const acceptCookies = useCallback(() => {
    try { localStorage.setItem("pp_cookie_ok", "1"); } catch {}
    setCookieAccepted(true);
  }, []);
  const resetCookieBanner = () => {
    try { localStorage.removeItem("pp_cookie_ok"); } catch {}
    setCookieAccepted(false);
  };
  const [loginModalConfig, setLoginModalConfig] = useState({
    initialMode: "signin",
    entryIntent: "general",
  });
  const [proSetupFocusToken, setProSetupFocusToken] = useState(0);
  // Bumped by the nav CTA to pull focus back to the "create a room" form.
  const [startFocusToken, setStartFocusToken] = useState(0);

  // ── SPA NAVIGATION ────────────────────────────────────────────────
  // Navigate within the SPA without a full-page reload.
  // Used by footer links and the back button on legal pages.
  const navTo = (path) => {
    window.history.pushState({}, "", path);
    setScreen(getScreenForPath(path));
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const openLoginModal = useCallback((initialMode = "signin", entryIntent = "general") => {
    rememberDialogOpener();
    setLoginModalConfig({ initialMode, entryIntent });
    setShowLoginModal(true);
  }, []);
  // No paywall any more — "see the plan" just goes to the pricing page,
  // which explains that everything is free.
  const openPricing = useCallback(() => {
    track("pricing_viewed");
    navTo("/pricing");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const jumpToMarketingSection = useCallback((sectionId) => {
    if (!sectionId) return;
    const focusSection = () => {
      const el = document.getElementById(sectionId);
      if (!el) return;
      el.focus?.({ preventScroll: true });
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    if (screen === "join") {
      window.history.replaceState({}, "", `/#${sectionId}`);
      requestAnimationFrame(focusSection);
      return;
    }
    navTo("/");
    window.history.replaceState({}, "", `/#${sectionId}`);
    setTimeout(focusSection, 40);
  }, [screen]);
  // Global modal states — NavBar triggers these from any screen
  const [showLoginModal,   setShowLoginModal]   = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [sprintHistory,    setSprintHistory]    = useState([]);
  useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname;
      const roomCode = new URLSearchParams(window.location.search).get("room");
      const teamMatch = pathname.match(/^\/t\/([a-z0-9-]+)$/i);
      if (roomCode || teamMatch) return;
      setScreen(getScreenForPath(pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  // Initialise room code and team name synchronously from the URL so JoinScreen
  // receives the correct prefill on the very first render — no flash or double-update.
  // ?room=CODE  → Join Room tab pre-filled with code
  // ?team=NAME  → Team Room tab pre-filled with team name
  const [code, setCode] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get("room");
    return r ? r.toUpperCase() : "";
  });
  const [prefillTeam, setPrefillTeam] = useState(() => {
    // Clean URL: /t/<slug>  e.g. /t/rpa-build-team
    const pathMatch = window.location.pathname.match(/^\/t\/([a-z0-9-]+)$/i);
    if (pathMatch) return pathMatch[1];
    // Query param fallback: ?team=<name>
    const p = new URLSearchParams(window.location.search);
    const t = p.get("team");
    return t ? decodeURIComponent(t) : "";
  });
  const [roomData, setRoomData] = useState(null);
  const [toast, setToast] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);
  const toastRef = useRef(null);
  const sessionCheckRef = useRef(null);
  const pendingSessionNameRef = useRef("");
  const showToast = useCallback((msg) => {
    setToast(msg);
    setToastOn(true);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastOn(false), 3400);
  }, []);

  useEffect(() => {
    const pathname = window.location.pathname;
    const roomCode = new URLSearchParams(window.location.search).get("room");
    const teamMatch = pathname.match(/^\/t\/([a-z0-9-]+)$/i);
    const teamSlug = teamMatch?.[1] || "";

    if (PRIVATE_PATHS.includes(pathname)) {
      applyRouteMeta({
        title: "Usage dashboard | pointpoker",
        description: "Owner-only usage analytics.",
        canonical: `${SITE_URL}/`,
        ogUrl: `${SITE_URL}/`,
        robots: "noindex, nofollow",
      });
      return;
    }

    if (STATIC_ROUTE_META[pathname]) {
      applyRouteMeta(STATIC_ROUTE_META[pathname]);
      return;
    }

    if (teamSlug) {
      applyRouteMeta({
        title: "Team Room | pointpoker",
        description:
          "Join a pointpoker Team Room to estimate stories live with your team. Team Room URLs are for active sessions and are not indexed.",
        canonical: `${SITE_URL}/`,
        ogUrl: `${SITE_URL}/t/${teamSlug}`,
        robots: "noindex, nofollow",
      });
      return;
    }

    if (roomCode || screen === "game") {
      applyRouteMeta({
        title: "Planning Poker Room | pointpoker",
        description:
          "Live pointpoker estimation room for sprint planning. Room URLs are for active sessions and are not indexed.",
        canonical: `${SITE_URL}/`,
        ogUrl: roomCode ? `${SITE_URL}/?room=${encodeURIComponent(roomCode)}` : `${SITE_URL}/`,
        robots: "noindex, nofollow",
      });
      return;
    }

    applyRouteMeta(DEFAULT_META);
  }, [screen, code, prefillTeam]);

  // ── STABLE REFS ──────────────────────────────────────────────────
  // roomDataRef: always holds the latest roomData for use in goBack /
  // beforeunload handlers without creating stale closures.
  const roomDataRef = useRef(null);
  useEffect(() => {
    roomDataRef.current = roomData;
  }, [roomData]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (!user) {
        try { localStorage.removeItem("pp_pro"); } catch {}
        setAccountProfile(null);
        return;
      }
      try {
        const snap = await get(ref(db, `users/${user.uid}`));
        if (!snap.exists()) {
          await saveUserProfile(user, {
            displayName: user.displayName || "",
            email: user.email || "",
            plan: "free",
            billingStatus: "inactive",
            createdAt: Date.now(),
          });
        } else {
          const current = snap.val() || {};
          const teamRooms = resolveDedicatedTeamRooms(current, user);
          await update(ref(db, `users/${user.uid}`), {
            email: user.email || current.email || "",
            displayName: user.displayName || current.displayName || "",
            teamRoomName: teamRooms.primary,
            teamRooms,
            lastLoginAt: Date.now(),
          });
        }
      } catch {
        // Account hydration should not block app use.
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authUser?.uid) return undefined;
    const unsub = onValue(ref(db, `users/${authUser.uid}`), (snap) => {
      setAccountProfile(snap.exists() ? snap.val() : null);
    });
    return () => unsub();
  }, [authUser?.uid]);

  // ── SPRINT HISTORY LISTENER — every signed-in account ──────────
  useEffect(() => {
    if (!authUser?.uid) {
      setSprintHistory([]);
      return undefined;
    }
    const unsub = onValue(ref(db, `history/${authUser.uid}`), (snap) => {
      if (!snap.exists()) { setSprintHistory([]); return; }
      const entries = Object.entries(snap.val())
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0)); // most recent first
      setSprintHistory(entries);
    });
    return () => unsub();
  }, [authUser?.uid]);

  useEffect(() => {
    if (screen !== "join") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const timeout = setTimeout(() => {
      const el = document.getElementById(hash);
      if (!el) return;
      el.focus?.({ preventScroll: true });
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
    return () => clearTimeout(timeout);
  }, [screen]);

  useEffect(() => {
    if (screen !== "join") return;
    if (hasSweepCooldown()) return;

    let cancelled = false;
    markRoomSweepRun();

    (async () => {
      const removed = await sweepStaleRooms();
      if (cancelled || removed <= 0) return;
      showToast(`🧹 Cleared ${removed} stale room${removed === 1 ? "" : "s"} in the background.`);
    })();

    return () => {
      cancelled = true;
    };
  }, [screen, showToast]);

  // One visit ping per app load: new-vs-returning and device mix.
  useEffect(() => { trackVisit(); }, []);

  // ── SEAMLESS REFRESH ─────────────────────────────────────────────
  // myId survives a reload (sessionStorage), so if this browser is still listed
  // as a player in the room named in the URL, walk straight back in instead of
  // showing the join form and asking for a name that is already on file.
  const rejoinAttemptedRef = useRef(false);
  useEffect(() => {
    if (rejoinAttemptedRef.current) return;
    rejoinAttemptedRef.current = true;
    const pathMatch = window.location.pathname.match(/^\/t\/([a-z0-9-]+)$/i);
    const roomCode = pathMatch?.[1] || new URLSearchParams(window.location.search).get("room");
    if (!roomCode) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await get(ref(db, `rooms/${roomCode}/players/${myId}`));
        if (cancelled || !snap.exists()) return;
        const me = snap.val() || {};
        setMyRole(me.role === "observer" ? "observer" : "voter");
        setCode(pathMatch ? pathMatch[1] : roomCode.toUpperCase());
        setScreen("game");
        await update(ref(db, `rooms/${roomCode}/players/${myId}`), {
          online: true,
          disconnectedAt: null,
        });
      } catch {
        // Falling back to the join form is a perfectly good outcome here.
      }
    })();
    return () => { cancelled = true; };
  }, [myId]);

  // sessionWarningRef: prevents the session-check interval from restarting
  // every time the sessionWarning flag flips, eliminating unnecessary churn.
  const sessionWarningRef = useRef(false);
  useEffect(() => {
    sessionWarningRef.current = sessionWarning;
  }, [sessionWarning]);

  useEffect(() => {
    if (!code || screen !== "game") return;
    const unsub = onValue(ref(db, `rooms/${code}`), (snap) => {
      if (snap.exists()) {
        const data = snap.val();

        // ── ORPHANED TIMER GUARD ──────────────────────────────────
        // If the player who started the timer has left the room,
        // stop the timer so remaining participants aren't left with
        // a frozen countdown that never reaches zero.
        if (
          data?.timer?.running &&
          data.timer.startedBy &&
          !data.players?.[data.timer.startedBy]
        ) {
          update(ref(db, `rooms/${code}/timer`), { running: false });
        }

        if (myId && !data.players?.[myId]) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          remainingRef.current = null;
          setRoomData(null);
          setScreen("join");
          setSessionWarning(false);
          setCode("");
          setPrefillTeam("");
          window.history.replaceState({}, "", homePath());
          showToast("You were removed from the room by the facilitator.");
          return;
        }

        setRoomData(data);
      } else {
        // Room deleted (end session / expired) — go home
        setRoomData(null);
        setScreen("join");
        setCode("");
        setPrefillTeam("");
        window.history.replaceState({}, "", homePath());
      }
    });
    return () => unsub();
  }, [code, screen, myId, showToast]); // eslint-disable-line

  useEffect(() => {
    if (screen !== "game" || !code || !myId || !roomData?.players?.[myId]) return;
    const intendedName = (pendingSessionNameRef.current || "").trim();
    if (!intendedName) return;
    const currentPlayerName = (roomData.players[myId]?.name || "").trim();
    if (!currentPlayerName) return;
    if (currentPlayerName === intendedName) {
      pendingSessionNameRef.current = "";
      return;
    }
    update(ref(db, `rooms/${code}/players/${myId}`), { name: intendedName });
  }, [screen, code, myId, roomData]);

  // ── TIMER EFFECT ──────────────────────────────────────────────────
  // Uses refs to avoid the Firebase write → roomData update → effect re-run loop.
  // Only the person who clicked "Start" drives the countdown locally.
  // Everyone else reads Firebase reactively for display.
  const timerRef = useRef(null);
  const remainingRef = useRef(null);

  useEffect(() => {
    const isRunning = roomData?.timer?.running;
    const startedByMe = roomData?.timer?.startedBy === myId;

    if (!isRunning || !startedByMe) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        remainingRef.current = null;
      }
      return;
    }

    // Already ticking locally — don't restart
    if (timerRef.current) return;

    // Seed from Firebase only when starting fresh
    remainingRef.current =
      roomData.timer.remaining ?? roomData.timer.duration ?? 30;

    const iv = setInterval(async () => {
      remainingRef.current = (remainingRef.current ?? 1) - 1;
      const r = remainingRef.current;

      if (r <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        remainingRef.current = null;
        await update(ref(db, `rooms/${code}/timer`), {
          running: false,
          remaining: 0,
        });
        await update(ref(db, `rooms/${code}`), { revealed: true });
        showToast("⏰ Time's up, cards revealed!");
      } else {
        await update(ref(db, `rooms/${code}/timer`), { remaining: r });
      }
    }, 1000);

    timerRef.current = iv;
  }, [roomData?.timer?.running, roomData?.timer?.startedBy]); // eslint-disable-line

  const autoRevealRef = useRef(null);
  useEffect(() => {
    if (!roomData || roomData.revealed) return;
    const voters = Object.values(roomData.players || {}).filter(
      (p) => p.role === "voter",
    );
    if (!voters.length) return;
    if (voters.every((p) => p.voted)) {
      // Small delay so the last voter's card animates before reveal.
      // Use a fresh Firebase read rather than the stale closure value.
      clearTimeout(autoRevealRef.current);
      autoRevealRef.current = setTimeout(async () => {
        const snap = await new Promise((res) =>
          onValue(ref(db, `rooms/${code}`), res, { onlyOnce: true }),
        );
        if (!snap.exists()) return;
        const fresh = snap.val();
        const freshVoters = Object.values(fresh.players || {}).filter(
          (p) => p.role === "voter",
        );
        if (freshVoters.every((p) => p.voted) && !fresh.revealed) {
          await update(ref(db, `rooms/${code}`), { revealed: true });
          await update(ref(db, `rooms/${code}/timer`), {
            running: false,
            remaining: 0,
            startedBy: null,
          });
          showToast("🃏 All voted, revealing cards!");
        }
      }, 700);
    }
    return () => clearTimeout(autoRevealRef.current);
  }, [roomData, code]); // eslint-disable-line

  // Store createdAt in a ref so the interval always has the real value,
  // not a snapshot from when the effect last ran.
  const createdAtRef    = useRef(null);
  // Refs used by endSession and auto-expire so they don't need to be in dep arrays
  const authUserRef     = useRef(null);
  useEffect(() => { if (roomData?.createdAt) createdAtRef.current = roomData.createdAt; }, [roomData?.createdAt]); // eslint-disable-line
  useEffect(() => { authUserRef.current    = authUser;    }, [authUser]);

  // ── SESSION EXPIRY CHECK ──────────────────────────────────────────
  // sessionWarning is intentionally NOT in the dependency array — we
  // read it via sessionWarningRef instead so the interval doesn't
  // restart every time the warning flag flips (previously caused churn).
  useEffect(() => {
    if (screen !== "game" || !roomData?.createdAt) return;
    clearInterval(sessionCheckRef.current);
    sessionCheckRef.current = setInterval(async () => {
      const start = createdAtRef.current;
      if (!start) return;
      const age = Date.now() - start;
      if (age >= SESSION_MAX_MS) {
        clearInterval(sessionCheckRef.current);
        // Save history for signed-in users before tearing down the room
        if (authUserRef.current && roomDataRef.current) {
          await saveSessionHistory(authUserRef.current.uid, roomDataRef.current, code);
        }
        await remove(ref(db, `rooms/${code}`));
        setScreen("join");
        setRoomData(null);
        setSessionWarning(false);
        setCode("");
        setPrefillTeam("");
        window.history.replaceState({}, "", homePath());
        showToast("⏰ Session auto-ended after 5 hours. Sprint data saved to your history.");
      } else if (age >= SESSION_WARN_MS && !sessionWarningRef.current) {
        setSessionWarning(true);
        showToast("⚠️ Session ending in ~10 minutes. Wrap up your planning!");
      }
    }, 60 * 1000);
    return () => clearInterval(sessionCheckRef.current);
  }, [screen, roomData?.createdAt, code]); // eslint-disable-line

  // ── LEAVE / GO BACK ───────────────────────────────────────────────
  // Reads roomDataRef (not roomData) so the callback stays stable —
  // only code + myId in deps — yet always acts on current room state.
  const goBack = useCallback(() => {
    const rd = roomDataRef.current;
    trackSessionLength(rd);

    // Clear local timer interval before leaving
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    remainingRef.current = null;

    if (code && myId) {
      // If this user started the timer, stop it in Firebase so the
      // remaining players aren't stuck watching a frozen countdown.
      if (rd?.timer?.running && rd?.timer?.startedBy === myId) {
        update(ref(db, `rooms/${code}/timer`), { running: false });
      }

      const allPlayerIds = Object.keys(rd?.players || {});
      const remainingAfterLeave = allPlayerIds.filter((id) => id !== myId);

      if (remainingAfterLeave.length === 0) {
        // Last person leaving — remove the entire room to keep Firebase lean.
        remove(ref(db, `rooms/${code}`));
      } else {
        remove(ref(db, `rooms/${code}/players/${myId}`));
      }
    }

    setScreen("join");
    setRoomData(null);
    setCode("");
    setPrefillTeam("");
    window.history.replaceState({}, "", homePath());
  }, [code, myId]);

  // ── BROWSER CLOSE / REFRESH ──────────────────────────────────────
  // Deliberately does NOT delete the room or the player. beforeunload cannot
  // tell a refresh from a tab close, and it does not fire reliably on mobile
  // Safari at all — so deleting here meant a solo facilitator pressing F5 lost
  // their room and their whole story queue. The Firebase onDisconnect handler
  // already marks the player offline the moment the socket drops, and
  // sweepStaleRooms removes rooms whose players have all been away for an hour.
  // All this handler does is release a timer nobody is driving any more.
  useEffect(() => {
    const cleanup = () => {
      const rd = roomDataRef.current;
      if (!code || !myId) return;
      if (rd?.timer?.running && rd?.timer?.startedBy === myId) {
        update(ref(db, `rooms/${code}/timer`), { running: false, startedBy: null });
      }
    };
    window.addEventListener("pagehide", cleanup);
    return () => window.removeEventListener("pagehide", cleanup);
  }, [code, myId]);

  // ── MOBILE RECONNECT PRESENCE ────────────────────────────────────
  // Firebase WebSocket drops when a phone screen goes off or the app
  // backgrounds. onDisconnect marks the player offline (not removed).
  // When Firebase reconnects (screen back on), re-register the handler
  // and mark the player online so they seamlessly re-enter the room.
  useEffect(() => {
    if (screen !== "game" || !code) return;
    const playerRef = ref(db, `rooms/${code}/players/${myId}`);
    const connRef = ref(db, ".info/connected");
    const unsub = onValue(connRef, (snap) => {
      if (snap.val() !== true) return;
      onDisconnect(playerRef).update({ online: false, disconnectedAt: serverTimestamp() });
      update(playerRef, { online: true, disconnectedAt: null });
    });
    return () => unsub();
  }, [screen, code, myId]); // eslint-disable-line

  const handleCreate = async (name, role, deck = "fibonacci", estimationMode = "stories") => {
    pendingSessionNameRef.current = name;
    const c = mkCode();
    setMyRole(role);
    setCode(c);
    setPrefillTeam("");
    await set(ref(db, `rooms/${c}`), {
      createdAt: serverTimestamp(),
      revealed: false,
      round: 1,
      storiesDone: 0,
      streak: 0,
      consensusCount: 0,
      deck,
      estimationMode,
      plan: "free",
      timer: { running: false, duration: 30, remaining: 30 },
      players: { [myId]: { id: myId, name, role, voted: false, vote: null, online: true } },
    });

    // Server-side soft-disconnect: marks offline rather than removing immediately.
    // Stale players (offline > 1hr) are swept by sweepStaleRooms.
    onDisconnect(ref(db, `rooms/${c}/players/${myId}`)).update({ online: false, disconnectedAt: serverTimestamp() });

    // Update URL so the creator can copy/share the link immediately.
    window.history.replaceState({}, "", roomPath(c));
    setScreen("game");
    track("room_created");
    track(`deck_${deck}`);
    track(role === "observer" ? "joined_facilitator" : "joined_voter");
    showToast(`🎲 Room ${c} created! Share this one-off link while the session is active.`);
  };

  const handleJoin = async (name, role, c) => {
    pendingSessionNameRef.current = name;
    const snap = await new Promise((res) =>
      onValue(ref(db, `rooms/${c}`), res, { onlyOnce: true }),
    );
    if (!snap.exists()) {
      showToast(`Room "${c}" not found. If it was a one-off room, ask the host for a fresh link or code.`);
      return;
    }
    const data = snap.val();
    const currentCount = countParticipants(data.players || {}, myId);
    if (currentCount >= MAX_PARTICIPANTS) {
      showToast(`This room is full. ${MAX_PARTICIPANTS} people are already in, including the facilitator. Ask the host to start a second room.`);
      return;
    }
    setMyRole(role);
    setCode(c);
    setPrefillTeam("");
    await update(ref(db, `rooms/${c}/players/${myId}`), {
      id: myId,
      name,
      role,
      voted: false,
      vote: null,
      online: true,
    });
    onDisconnect(ref(db, `rooms/${c}/players/${myId}`)).update({ online: false, disconnectedAt: serverTimestamp() });
    window.history.replaceState({}, "", roomPath(c));
    setScreen("game");
    track(role === "observer" ? "joined_facilitator" : "joined_voter");
    showToast(`🎲 Welcome, ${name}!`);
  };

  // ── TEAM ROOM ─────────────────────────────────────────────────────
  // Team rooms use a stable code derived from the team name so the same
  // team always lands in the same room without needing to share a link.
  // The room is created fresh if nobody is there, or joined if active.
  const handleTeamRoom = async (name, role, teamName, deck = "fibonacci", estimationMode = "stories") => {
    pendingSessionNameRef.current = name;
    const c = teamCode(teamName);
    const founderRoom = isFounderRoom(c);
    const snap = await new Promise((res) =>
      onValue(ref(db, `rooms/${c}`), res, { onlyOnce: true }),
    );
    const existingRoom = snap.exists() ? snap.val() || {} : null;
    // Hosting a Team Room needs a free account: the slug is derived from the
    // account name so two different teams can never collide on the same URL.
    // Joining someone else's shared Team Room stays open to guests.
    if (!existingRoom && !authUser && !founderRoom) {
      openLoginModal("register", "teamroom");
      showToast("Create a free account to host a Team Room, it keeps your room URL yours alone.");
      return;
    }
    const currentCount = existingRoom
      ? countParticipants(existingRoom.players || {}, myId)
      : 0;
    if (currentCount >= MAX_PARTICIPANTS) {
      showToast(`This Team Room is full. ${MAX_PARTICIPANTS} people are already in.`);
      return;
    }
    setMyRole(role);
    setCode(c);
    setPrefillTeam(c);
    if (!snap.exists()) {
      await set(ref(db, `rooms/${c}`), {
        createdAt: serverTimestamp(),
        revealed: false,
        round: 1,
        storiesDone: 0,
        streak: 0,
        consensusCount: 0,
        deck,
        estimationMode,
        // Everything is free — "free" is the only plan new rooms are created with.
        plan: "free",
        teamName,
        founderRoom,
        timer: { running: false, duration: 30, remaining: 30 },
        players: { [myId]: { id: myId, name, role, voted: false, vote: null, online: true } },
      });
    } else {
      // Join existing room. If estimationMode was never set (legacy room or
      // first session after the feature shipped), write the facilitator's
      // chosen mode now. The Firebase rule allows this because !data.exists().
      const upd = {};
      upd[`rooms/${c}/players/${myId}`] = { id: myId, name, role, voted: false, vote: null, online: true };
      if (!existingRoom.estimationMode) {
        upd[`rooms/${c}/estimationMode`] = estimationMode;
      }
      await update(ref(db), upd);
    }
    onDisconnect(ref(db, `rooms/${c}/players/${myId}`)).update({ online: false, disconnectedAt: serverTimestamp() });
    // Keep the clean stable team-room URL so invites and browser refreshes stay consistent.
    window.history.replaceState({}, "", teamRoomPath(c));
    setScreen("game");
    track(role === "observer" ? "joined_facilitator" : "joined_voter");
    // A Team Room that already existed is a returning team — the stickiness signal.
    track(snap.exists() ? "team_room_reentered" : "room_created_team");
    if (!snap.exists()) track(`deck_${deck}`);
    showToast(`🎲 Welcome to ${teamName}!`);
  };

  const selectCard = useCallback(
    async (val) => {
      if (!roomData || roomData.revealed) return;
      const cur = roomData.players?.[myId]?.vote;
      if (cur === val) return;
      await update(ref(db, `rooms/${code}/players/${myId}`), {
        voted: true,
        vote: val,
      });
    },
    [roomData, code, myId],
  );

  const revealVotes = useCallback(async () => {
    // Table size is the single most important input to any per-seat pricing
    // model, so it is sampled once per room at the first reveal.
    if (!roomDataRef.current?.revealed && (roomDataRef.current?.round || 1) === 1) {
      track(bucketTableSize(countParticipants(roomDataRef.current?.players || {})));
    }
    await update(ref(db, `rooms/${code}`), { revealed: true });
    await update(ref(db, `rooms/${code}/timer`), {
      running: false,
      remaining: 0,
      startedBy: null,
    });
  }, [code]);

  // estimate !== null  → story is complete; persist estimate and advance counters
  // estimate === null  → re-vote; clear votes only, counters unchanged
  const newRound = useCallback(async (estimate = null, isConsensus = false) => {
    const players = roomData?.players || {};
    const upd = {};
    Object.keys(players).forEach((id) => {
      upd[`rooms/${code}/players/${id}/voted`] = false;
      upd[`rooms/${code}/players/${id}/vote`] = null;
    });
    upd[`rooms/${code}/revealed`] = false;
    upd[`rooms/${code}/round`] = (roomData?.round || 1) + 1;
    upd[`rooms/${code}/timer/running`] = false;
    upd[`rooms/${code}/timer/remaining`] = roomData?.timer?.duration || 30;
    upd[`rooms/${code}/timer/startedBy`] = null;

    if (estimate !== null) {
      // Story complete — record estimate, advance counters, update alignment stats
      const done = roomData?.storiesDone || 0;
      upd[`rooms/${code}/storiesDone`] = done + 1;
      upd[`rooms/${code}/streak`] = isConsensus ? (roomData?.streak || 0) + 1 : 0;
      upd[`rooms/${code}/consensusCount`] = (roomData?.consensusCount || 0) + (isConsensus ? 1 : 0);
      // Always persist the estimate so analytics shows SP totals even without a named queue
      upd[`rooms/${code}/rounds/${done}`] = { estimate: String(estimate), isConsensus };
    } else {
      // Re-vote — reset streak (team didn't agree on this story)
      upd[`rooms/${code}/streak`] = 0;
    }

    try {
      await update(ref(db), upd);
      if (estimate !== null) {
        track("estimate_recorded");
        if (isConsensus) track("consensus_first_vote");
        showToast(getEstMode(roomData?.estimationMode).toastDone);
      }
      return true;
    } catch (err) {
      console.error("[pointpoker] newRound write failed", err);
      showToast("Could not save that estimate, check your connection and try again.");
      return false;
    }
  }, [code, roomData, showToast]);

  // ── STORY QUEUE ───────────────────────────────────────────────────
  // Stories can be added at any time before or during a session.
  // Stored in Firebase so all players see the active story name live.
  // Accepts one name or a list. A list is written in a single multi-path update
  // so pasting a 30-line backlog cannot race itself into overwriting index 0.
  const addStory = useCallback(async (nameOrNames) => {
    // Firebase returns stories as {0:{...}, 1:{...}} — an object, not an array.
    // .length on an object is undefined, so use Object.keys to get the count.
    const names = (Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames])
      .map((n) => String(n ?? "").trim().slice(0, 200)) // enforce the 200-char rule
      .filter(Boolean);
    if (!names.length) return;
    const current = roomData?.stories || {};
    const startIdx = Object.keys(current).length;
    // Track the first story added — signals the story queue feature is being used
    if (startIdx === 0) track("feature_queue");
    const upd = {};
    names.forEach((name, i) => {
      upd[`rooms/${code}/stories/${startIdx + i}`] = { name, estimate: null };
    });
    await update(ref(db), upd);
  }, [code, roomData]);

  // Drop a queued item. Stories are index-keyed and activeStory is an index into
  // them, so the whole list is rewritten and the pointer shifted to match.
  const removeStory = useCallback(async (idx) => {
    const current = roomData?.stories || {};
    const list = Object.values(current);
    if (idx < 0 || idx >= list.length) return;
    const activeIdx = roomData?.activeStory ?? 0;
    if (idx < activeIdx) return; // already estimated, keep the record honest
    const next = list.filter((_, i) => i !== idx);
    // One write for the whole list — a multi-path update may not mix a parent
    // path with its own children, so `stories` is replaced wholesale.
    await update(ref(db), {
      [`rooms/${code}/stories`]: next.length
        ? Object.fromEntries(next.map((story, i) => [i, story]))
        : null,
      [`rooms/${code}/activeStory`]: Math.min(activeIdx, next.length),
    });
  }, [code, roomData]);

  const recordAndNextStory = useCallback(async (estimate, isConsensus = false) => {
    const idx = roomData?.activeStory ?? 0;
    const players = roomData?.players || {};
    const upd = {};
    upd[`rooms/${code}/stories/${idx}/estimate`] = estimate;
    upd[`rooms/${code}/activeStory`] = idx + 1;
    Object.keys(players).forEach((id) => {
      upd[`rooms/${code}/players/${id}/voted`] = false;
      upd[`rooms/${code}/players/${id}/vote`] = null;
    });
    upd[`rooms/${code}/revealed`] = false;
    upd[`rooms/${code}/round`] = (roomData?.round || 1) + 1;
    upd[`rooms/${code}/storiesDone`] = (roomData?.storiesDone || 0) + 1;
    upd[`rooms/${code}/streak`] = isConsensus ? (roomData?.streak || 0) + 1 : 0;
    upd[`rooms/${code}/consensusCount`] = (roomData?.consensusCount || 0) + (isConsensus ? 1 : 0);
    upd[`rooms/${code}/timer/running`] = false;
    upd[`rooms/${code}/timer/remaining`] = roomData?.timer?.duration || 30;
    upd[`rooms/${code}/timer/startedBy`] = null;
    try {
      await update(ref(db), upd);
      track("estimate_recorded");
      if (isConsensus) track("consensus_first_vote");
      showToast(getEstMode(roomData?.estimationMode).toastNext);
      return true;
    } catch (err) {
      console.error("[pointpoker] recordAndNextStory write failed", err);
      showToast("Could not save that estimate, check your connection and try again.");
      return false;
    }
  }, [code, roomData, showToast]);

  const resetSession = useCallback(async () => {
    const players = roomData?.players || {};
    const upd = {};
    Object.keys(players).forEach((id) => {
      upd[`rooms/${code}/players/${id}/voted`] = false;
      upd[`rooms/${code}/players/${id}/vote`] = null;
    });
    upd[`rooms/${code}/revealed`] = false;
    upd[`rooms/${code}/round`] = 1;
    upd[`rooms/${code}/storiesDone`] = 0;
    upd[`rooms/${code}/streak`] = 0;
    upd[`rooms/${code}/consensusCount`] = 0;
    upd[`rooms/${code}/timer/running`] = false;
    upd[`rooms/${code}/timer/remaining`] = roomData?.timer?.duration || 30;
    upd[`rooms/${code}/timer/startedBy`] = null;
    await update(ref(db), upd);
    showToast("🔄 New sprint session, everyone's votes cleared.");
  }, [code, roomData, showToast]);

  const endSession = useCallback(async () => {
    // Explicitly clear the local timer interval before tearing down the room.
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    remainingRef.current = null;
    clearInterval(sessionCheckRef.current);
    trackSessionLength(roomDataRef.current);
    // Save sprint history for signed-in users
    if (authUserRef.current && roomDataRef.current) {
      await saveSessionHistory(authUserRef.current.uid, roomDataRef.current, code);
    }
    await remove(ref(db, `rooms/${code}`));
    setScreen("join");
    setRoomData(null);
    setSessionWarning(false);
    setCode("");
    setPrefillTeam("");
    window.history.replaceState({}, "", homePath());
  }, [code]);

  const startTimer = useCallback(
    async (sec) => {
      await update(ref(db, `rooms/${code}/timer`), {
        running: true,
        duration: sec,
        remaining: sec,
        startedBy: myId,
      });
      track("feature_timer");
    },
    [code, myId],
  );

  const stopTimer = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    remainingRef.current = null;
    await update(ref(db, `rooms/${code}/timer`), {
      running: false,
      startedBy: null,
    });
  }, [code]);

  const removeParticipant = useCallback(async (targetId, targetName) => {
    if (!code || !targetId || targetId === myId) return;
    const currentRoom = roomDataRef.current;
    if (!currentRoom?.players?.[targetId]) return;

    const confirmed = window.confirm(
      `Remove ${targetName || "this person"} from the room? They will be returned to the home screen immediately.`,
    );
    if (!confirmed) return;

    if (currentRoom?.timer?.running && currentRoom.timer.startedBy === targetId) {
      await update(ref(db, `rooms/${code}/timer`), {
        running: false,
        startedBy: null,
      });
    }

    await remove(ref(db, `rooms/${code}/players/${targetId}`));
    showToast(`${targetName || "Participant"} removed from the room.`);
  }, [code, myId, showToast]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      try { localStorage.removeItem("pp_pro"); } catch {}
      setScreen("join");
      setRoomData(null);
      setSessionWarning(false);
      setCode("");
      setPrefillTeam("");
      window.history.replaceState({}, "", homePath());
      showToast("Signed out.");
    } catch {
      showToast("Could not sign out. Try again.");
    }
  }, [showToast]);

  const shareUrl = roomData?.teamName
    ? `${window.location.origin}${teamRoomPath(code)}`
    : `${window.location.origin}${roomPath(code)}`;

  return (
    <>
      <style>{CSS}</style>

      {/* ── Global shell, NavBar → content → Footer ── */}
      <div className={`page-shell${screen === "game" ? " in-room" : ""}`}>
        <a className="skip-link" href="#main">Skip to main content</a>
        <NavBar
          onLogoClick={() => {
            if (screen === "game") { goBack(); return; }
            if (screen !== "join") { navTo("/"); return; }
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onLogin={()    => { openLoginModal("signin", "general"); track("signup_started"); }}
          onStartFree={() => {
            if (screen !== "join") { navTo("/"); }
            setStartFocusToken((v) => v + 1);
          }}
          onPlans={openPricing}
          onSupport={() => navTo("/support")}
          onTrust={() => navTo("/trust")}
          onFaq={() => jumpToMarketingSection("faq")}
          currentUser={authUser}
          onLogout={handleLogout}
          onHistory={() => { rememberDialogOpener(); setShowHistoryModal(true); }}
          onAdmin={authUser ? () => navTo("/admin") : null}
          showMarketingNav={screen !== "game" && !authUser}
          inRoom={screen === "game"}
        />

        <main className="app" id="main" tabIndex={-1}>
          {screen === "terms" && (
            <TermsPage onBack={() => navTo("/")} />
          )}
          {screen === "privacy" && (
            <PrivacyPage onBack={() => navTo("/")} />
          )}
          {screen === "about" && (
            <AboutPage onNavigate={navTo} />
          )}
          {screen === "support" && (
            <SupportPage onNavigate={navTo} />
          )}
          {screen === "trust" && (
            <TrustPage onNavigate={navTo} />
          )}
          {screen === "whatIsPlanningPoker" && (
            <WhatIsPlanningPokerPage onNavigate={navTo} />
          )}
          {screen === "fibonacciStoryPoints" && (
            <FibonacciStoryPointsPage onNavigate={navTo} />
          )}
          {screen === "agileEstimationTool" && (
            <AgileEstimationToolPage onNavigate={navTo} />
          )}
          {screen === "pricing" && (
            <PricingPage onNavigate={navTo} />
          )}
          {screen === "features" && (
            <FeaturesPage onNavigate={navTo} />
          )}
          {screen === "planningPokerOnline" && (
            <PlanningPokerOnlinePage onNavigate={navTo} />
          )}
          {screen === "scrumPoker" && (
            <ScrumPokerPage onNavigate={navTo} />
          )}
          {screen === "storyPointEstimation" && (
            <StoryPointEstimationPage onNavigate={navTo} />
          )}
          {screen === "remoteSprintPlanning" && (
            <RemoteSprintPlanningPage onNavigate={navTo} />
          )}
          {screen === "admin" && (
            <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
              <AdminDashboard currentUser={authUser} onBack={() => navTo("/")} />
            </Suspense>
          )}
          {screen === "join" && (
            <JoinScreen
              onCreate={handleCreate}
              onJoin={handleJoin}
              onTeamRoom={handleTeamRoom}
              prefillCode={code}
              prefillTeam={prefillTeam}
              currentUser={authUser}
              accountProfile={accountProfile}
              proSetupFocusToken={proSetupFocusToken}
              startFocusToken={startFocusToken}
              onRequireAccount={() => openLoginModal("register", "teamroom")}
              onNavigate={navTo}
            />
          )}
          {screen === "game" && !roomData && (
            <div className="loading">
              <div className="spinner" />
              <div style={{ color: "rgba(239,242,247,.62)", fontSize: ".88rem" }}>
                Connecting…
              </div>
            </div>
          )}
          {screen === "game" && roomData && (
            <GameScreen
              rd={roomData}
              myId={myId}
              myRole={myRole}
              code={code}
              deck={roomData.deck || "fibonacci"}
              shareUrl={shareUrl}
              onBack={goBack}
              onCard={selectCard}
              onReveal={revealVotes}
              onNewRound={newRound}
              onReset={resetSession}
              onEndSession={endSession}
              onStart={startTimer}
              onStop={stopTimer}
              onRemoveParticipant={removeParticipant}
              onAddStory={addStory}
              onRemoveStory={removeStory}
              onRecordStory={recordAndNextStory}
              sessionWarning={sessionWarning}
              toast={showToast}
            />
          )}
          {/* Toasts carry the only confirmation of several actions, so they are
              announced rather than being a purely visual flash. */}
          <div className={`toast${toastOn ? " show" : ""}`} role="status" aria-live="polite">
            {toastOn ? toast : ""}
          </div>
        </main>

        {screen !== "game" && <SiteFooter
          onCookieSettings={resetCookieBanner}
          currentUser={authUser}
          onNavTerms={() => navTo("/terms")}
          onNavPrivacy={() => navTo("/privacy")}
          onNavigate={navTo}
        />}
      </div>

      {/* ── Overlays ── */}
      {!cookieAccepted && <CookieBanner onAccept={acceptCookies} />}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onAuthSuccess={(event) => {
            const wantedTeamRoom = loginModalConfig.entryIntent === "teamroom";
            setShowLoginModal(false);
            if (event?.mode === "register") {
              track("signup_completed");
              showToast(
                event?.verificationSent
                  ? "Account created, check your email to verify the address."
                  : "Account created. Verification email could not be sent yet.",
              );
            } else {
              showToast("Signed in.");
            }
            if (wantedTeamRoom) setProSetupFocusToken((v) => v + 1);
          }}
          currentUser={authUser}
          initialMode={loginModalConfig.initialMode}
          entryIntent={loginModalConfig.entryIntent}
        />
      )}
      {showHistoryModal && (
        <HistoryModal
          onClose={() => setShowHistoryModal(false)}
          history={sprintHistory}
        />
      )}
    </>
  );
}

/* ═══════════════════════ CONFETTI ═══════════════════════
   Pure-canvas confetti, no external deps.
   Fires once, runs for ~4 seconds, then self-destructs.

   Props:
     active  {boolean}  — mount/unmount to trigger a burst
     onDone  {function} — called when animation finishes
═══════════════════════════════════════════════════════════ */
const CONFETTI_COLORS = [
  "#e8b84b",
  "#f5d07a",
  "#c9912a", // golds
  "#e74c3c",
  "#e67e22", // reds/orange
  "#2ecc71",
  "#3498db", // green/blue
  "#9b59b6",
  "#f39c12", // purple/amber
];
const GRAVITY = 0.25;
const DRAG = 0.985;

function Confetti({ onDone, big }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Size canvas to viewport
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // big=true (consensus) → more particles, bigger pieces, faster, longer
    const count    = big ? 220 : 120;
    const FADE_START = big ? 160 : 120;
    const TOTAL      = big ? 310 : 240;

    // Spawn particles from top-centre, two angled cannons
    const particles = Array.from({ length: count }, (_, i) => {
      const fromLeft = i < count / 2;
      const angle = fromLeft
        ? (Math.random() * 60 + 210) * (Math.PI / 180) // left cannon → right-upward
        : (Math.random() * 60 + 270) * (Math.PI / 180); // right cannon → left-upward
      const speed = big
        ? Math.random() * 18 + 12  // big: 12–30
        : Math.random() * 14 + 8;  // normal: 8–22
      return {
        x: fromLeft ? canvas.width * 0.25 : canvas.width * 0.75,
        y: canvas.height * 0.35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: big ? Math.random() * 16 + 10 : Math.random() * 10 + 6,
        h: big ? Math.random() * 10 + 5  : Math.random() * 6 + 3,
        color:
          CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * (big ? 0.32 : 0.25),
        alpha: 1,
        shape: Math.random() > 0.4 ? "rect" : "circle",
      };
    });

    let frame = 0;

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;

      let allGone = true;
      for (const p of particles) {
        if (p.alpha <= 0) continue;
        allGone = false;

        p.vy += GRAVITY;
        p.vx *= DRAG;
        p.vy *= DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotV;

        if (frame > FADE_START) {
          p.alpha = Math.max(
            0,
            1 - (frame - FADE_START) / (TOTAL - FADE_START),
          );
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }

      if (allGone || frame > TOTAL) {
        onDone();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []); // eslint-disable-line

  return (
    <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />
  );
}

function MarketingSection({ title, intro, children }) {
  return (
    <section className="marketing-section">
      <div className="marketing-section-head">
        <h2 className="marketing-section-title">{title}</h2>
        {intro && <p className="marketing-section-intro">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

function MarketingRelatedLinks({ title, intro, links, onNavigate }) {
  return (
    <MarketingSection title={title} intro={intro}>
      <div className="marketing-related-grid">
        {links.map((link) => (
          <RouteLink
            key={link.href}
            href={link.href}
            onNavigate={onNavigate}
            className="marketing-link-card"
          >
            <span className="marketing-link-kicker">{link.kicker}</span>
            <span className="marketing-link-title">{link.title}</span>
            <span className="marketing-link-copy">{link.copy}</span>
          </RouteLink>
        ))}
      </div>
    </MarketingSection>
  );
}

function MarketingPageShell({
  eyebrow,
  title,
  intro,
  highlights,
  primaryHref = "/",
  primaryLabel = "Start free room",
  secondaryHref = "/pricing",
  secondaryLabel = "View pricing",
  onNavigate,
  children,
}) {
  return (
    <div className="marketing-page">
      <div className="marketing-inner">
        <section className="marketing-hero">
          <button className="legal-back" onClick={() => onNavigate("/")}>
            ← Back to home
          </button>
          <span className="marketing-eyebrow">{eyebrow}</span>
          <h1 className="marketing-title">{title}</h1>
          <p className="marketing-intro">{intro}</p>
          <div className="marketing-actions">
            <RouteLink href={primaryHref} onNavigate={onNavigate} className="marketing-btn-primary">
              {primaryLabel}
            </RouteLink>
            <RouteLink href={secondaryHref} onNavigate={onNavigate} className="marketing-btn-secondary">
              {secondaryLabel}
            </RouteLink>
          </div>
          <div className="marketing-stat-grid">
            {highlights.map((item) => (
              <div className="marketing-stat" key={item.label}>
                <span className="marketing-stat-value">{item.value}</span>
                <span className="marketing-stat-label">{item.label}</span>
              </div>
            ))}
          </div>
        </section>
        {children}
      </div>
    </div>
  );
}

function PricingPage({ onNavigate }) {
  return (
    <MarketingPageShell
      eyebrow="Pricing"
      title="Planning poker pricing: everything is free, for every team"
      intro="There is no paid tier, no trial countdown and no credit card field anywhere on pointpoker. All three card decks, the countdown timer, facilitator analytics, story queues, CSV export and two fixed Team Rooms are free for everyone while we grow the user base."
      highlights={[
        { value: "£0", label: "Every feature, every team, no card" },
        { value: `${MAX_PARTICIPANTS}`, label: "Participants per room, facilitators included" },
        { value: "0", label: "Ads, trackers, and usage caps" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Start a free room"
      secondaryHref="/features"
      secondaryLabel="See all features"
    >
      <MarketingSection
        title="One plan. It costs nothing."
        intro="Most planning poker tools give away a stripped-down room and charge for the parts that make the ceremony work. We did the opposite. Ship the whole thing, free, and find out how many teams actually want it."
      >
        <div className="marketing-plan-grid">
          <article className="marketing-plan-card pro">
            <div className="marketing-plan-topline">Everyone</div>
            <div className="marketing-plan-price">£0</div>
            <p className="marketing-plan-sub">
              You do not need an account to run or join a room. A free account reserves your two permanent Team Room URLs and stores your sprint history. That is all it does.
            </p>
            <ul className="marketing-list">
              <li>Up to {MAX_PARTICIPANTS} participants per room, facilitators included</li>
              <li>Unlimited voting rounds and unlimited stories per session</li>
              <li>Fibonacci, T-Shirt, and Powers of 2 decks with simultaneous reveal</li>
              <li>Story or task queue, bulk paste import, countdown timer</li>
              <li>Facilitator mode with consensus rate, spread, and outlier analytics</li>
              <li>Clipboard summary and CSV download for Jira, Linear, or a spreadsheet</li>
              <li>Two fixed Team Rooms and sprint history with a free account</li>
              <li>No ads, no third-party tracking cookies, no data resale</li>
            </ul>
          </article>
          <article className="marketing-plan-card">
            <div className="marketing-plan-topline">What others charge</div>
            <div className="marketing-plan-price">£20–30/mo</div>
            <p className="marketing-plan-sub">
              For context, not as a swipe. These are the limits teams most often run into on other free tiers.
            </p>
            <ul className="marketing-list">
              <li>Free tiers capped at around seven participants</li>
              <li>Free games capped at a handful of votes or issues per session</li>
              <li>Session timer and automatic averages behind a paid plan</li>
              <li>Ad-supported free rooms</li>
              <li>Per-facilitator pricing for one ceremony a fortnight</li>
            </ul>
          </article>
        </div>
        <div className="marketing-note-panel">
          <strong>Why free, and for how long.</strong> A planning poker tool is only useful if the whole team
          will actually open it, and a paywall kills that on the first invite. So the plan is to keep every
          feature free, watch how many teams use it, and only look at paid add-ons once there is a real user
          base to serve. If that day comes, everything on this page stays free. Anything paid would be new
          work on top of it, and we would say so clearly and well in advance.
        </div>
      </MarketingSection>

      <MarketingSection
        title="What free does and does not mean here"
        intro="Free products usually have a catch. Here is exactly where ours sits, so you can decide with your eyes open."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">You are not the product</h3>
            <p className="marketing-card-copy">
              No advertising, no third-party analytics scripts, no session recording, nothing sold on. The only
              usage data collected is an anonymous daily count of events such as "a room was created". No names,
              no room contents, no identifiers of any kind.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Rooms are deliberately temporary</h3>
            <p className="marketing-card-copy">
              A room and its votes are deleted when everyone leaves, and idle rooms get swept automatically.
              That keeps the running cost low enough to stay free, and it means old estimates are not sitting
              somewhere you had forgotten about.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Support is best-effort, and honest about it</h3>
            <p className="marketing-card-copy">
              This is a small, independently run product. Email gets answered by a person, usually quickly, but
              there is no SLA behind it. If you work somewhere that needs one, factor that in before you commit.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingRelatedLinks
        title="See what you get before you invite the team"
        intro="No sign-up wall, so the fastest check is simply to open a room. These pages cover the workflow in more depth."
        onNavigate={onNavigate}
        links={[
          { href: "/features", kicker: "Product", title: "Explore all features", copy: "Simultaneous reveal, facilitator controls, Team Rooms, analytics, and export in detail." },
          { href: "/planning-poker-online", kicker: "Guide", title: "Planning poker online", copy: "How remote estimation works here with no installs and no account friction." },
          { href: "/story-point-estimation", kicker: "Guide", title: "Story point estimation", copy: "How the workflow supports structured estimates and faster team agreement." },
        ]}
      />

      <section className="marketing-cta-strip">
        <div>
          <h2 className="marketing-cta-title">Open a room and try it on a real story</h2>
          <p className="marketing-cta-copy">
            Nothing to sign up for and nothing to compare. Create a room, paste the link into your team chat, and size something you actually have to estimate this sprint.
          </p>
        </div>
        <div className="marketing-actions">
          <RouteLink href="/" onNavigate={onNavigate} className="marketing-btn-primary">Create a free room</RouteLink>
          <RouteLink href="/features" onNavigate={onNavigate} className="marketing-btn-secondary">See feature detail</RouteLink>
        </div>
      </section>
    </MarketingPageShell>
  );
}

function AboutPage({ onNavigate }) {
  return (
    <MarketingPageShell
      eyebrow="About pointpoker"
      title="A planning poker tool built to stay fast, trustworthy, and usable in real sprint planning"
      intro="pointpoker exists for teams that want the useful parts of online estimation without the usual product bloat. The goal is simple: make it easy to open a room, invite the team, vote fairly, discuss clearly, and keep sprint planning moving."
      highlights={[
        { value: "Fast", label: "Browser-first estimation with minimal setup" },
        { value: "Clear", label: "Facilitator-led flow with explicit next steps" },
        { value: "Trusted", label: "Transparent pricing, support, and legal pages" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Start free room"
      secondaryHref="/support"
      secondaryLabel="Get support"
    >
      <MarketingSection
        title="Why pointpoker was built"
        intro="A lot of planning poker tools feel like generic whiteboards or overbuilt agile suites. pointpoker takes the opposite approach: make the estimation ceremony faster, clearer, and easier to repeat."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Less friction to start</h3>
            <p className="marketing-card-copy">
              Free rooms do not force account creation for normal participation, so a facilitator can drop a link into Slack or Teams and start estimating without turning setup into a ceremony of its own.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Better structure once the team is inside</h3>
            <p className="marketing-card-copy">
              Simultaneous reveal, queue-based flow, split-vote resolution, and facilitator-only controls make the session feel purposeful instead of improvised.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">A clean upgrade path when repeatability matters</h3>
            <p className="marketing-card-copy">
              Nothing is locked behind billing. Every feature, decks, timer, queue, analytics, export, Team Rooms, is free for every team while we find out how many teams this is genuinely useful to.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        title="What the product is designed to optimise"
        intro="The product is tuned around the real moments that make planning sessions feel smooth or frustrating."
      >
        <ul className="marketing-list">
          <li><strong>Independent first votes:</strong> teams should see honest spread before the discussion starts.</li>
          <li><strong>Clear facilitator guidance:</strong> reveals, re-votes, moderation, and final estimate capture should be hard to miss and easy to run.</li>
          <li><strong>Low-friction invites:</strong> the share link should always be nearby, copy quickly, and stay understandable to the whole team.</li>
          <li><strong>Trustworthy data:</strong> sprint history and final estimates should reflect actual agreed deck values, not misleading derived numbers.</li>
          <li><strong>Repeatable ceremonies:</strong> teams that estimate together every sprint should be able to keep a stable room and return without re-teaching the workflow.</li>
        </ul>
      </MarketingSection>

      <MarketingSection
        title="Trust and product signals"
        intro="pointpoker is still growing, but the product already exposes the practical signals teams expect before using a lightweight SaaS tool in real ceremonies."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Public legal and privacy pages</h3>
            <p className="marketing-card-copy">
              Terms of Service and Privacy Policy are available on the live domain, with UK GDPR-aware privacy language and clear third-party processor disclosure.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Live support route</h3>
            <p className="marketing-card-copy">
              Support is reachable through a dedicated support page and the published support email, so teams are not left guessing how to get help.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Focused product scope</h3>
            <p className="marketing-card-copy">
              The product is deliberately narrow: run planning poker well, keep the room flow clean, and add only what improves repeat use rather than piling on complexity nobody asked for.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingRelatedLinks
        title="Continue exploring"
        intro="These pages explain the product from the pricing, feature, and remote-team angles so teams can evaluate pointpoker from the perspective that matters most to them."
        onNavigate={onNavigate}
        links={[
          { href: "/trust", kicker: "Trust", title: "Trust and reliability", copy: "Review the support posture, mail authentication, and product safeguards behind the live workflow." },
          { href: "/features", kicker: "Product", title: "Feature breakdown", copy: "See the live room flow, facilitator controls, Team Alignment analytics, and sprint-history layer." },
          { href: "/pricing", kicker: "Pricing", title: "What it costs", copy: "Nothing. Here is exactly what free covers and why the product is built this way." },
          { href: "/remote-sprint-planning", kicker: "Remote", title: "Remote sprint planning", copy: "See how the browser-first workflow fits distributed teams and recurring ceremonies." },
        ]}
      />
    </MarketingPageShell>
  );
}

function SupportPage({ onNavigate }) {
  const support = process.env.REACT_APP_SUPPORT_EMAIL || "support@pointpoker.app";

  return (
    <MarketingPageShell
      eyebrow="Support"
      title="Get help with pointpoker, understand the workflow, and know where to go when your team has questions"
      intro="pointpoker is designed to feel simple in the room, but good support still matters. This page answers the most common product questions and shows you how to reach a person directly."
      highlights={[
        { value: "Email", label: support },
        { value: "Free", label: "Normal room participation without account setup" },
        { value: "£0", label: "Every feature, including Team Rooms and history" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Open the app"
      secondaryHref="/pricing"
      secondaryLabel="Compare plans"
    >
      <MarketingSection
        title="Best place to start when something feels unclear"
        intro="Most support questions fall into one of a few buckets. Starting with the right explanation usually resolves things fast."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Room join questions</h3>
            <p className="marketing-card-copy">
              Free participation does not require an account. Guests can join a shared room with a real name and the correct role, then vote or facilitate straight away.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Account questions</h3>
            <p className="marketing-card-copy">
              A free account exists for one reason: it reserves your two Team Room URLs so no other team can land in your room, and it keeps sprint history tied to you across devices. Everything else works without one.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Workflow questions</h3>
            <p className="marketing-card-copy">
              When votes split, the facilitator can either run another vote or choose the final agreed estimate from the active deck. Averages are shown for discussion only and are not saved automatically.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        title="Contact support"
        intro="If the product behaves unexpectedly or you need help with account access, Team Rooms, or sprint history, contact support directly."
      >
        <div className="marketing-note-panel">
          <strong>Support email:</strong>{" "}
          <a href={`mailto:${support}`} className="seo-inline-link">{support}</a>
          <div style={{ marginTop: 10, color: "rgba(239,242,247,.72)" }}>
            Include the room code or Team Room URL, what you expected to happen, and what you saw instead. That makes it much easier to reproduce and fix the issue quickly.
          </div>
        </div>
      </MarketingSection>

      <MarketingSection
        title="Helpful product guidance"
        intro="These are the explanations that tend to reduce confusion fastest for teams using the product for the first time."
      >
        <ul className="marketing-list">
          <li><strong>Free rooms are for fast ad-hoc estimation:</strong> create a room, invite the team, and run the ceremony without forcing everyone through accounts.</li>
          <li><strong>Accounts are for repeatability:</strong> two fixed Team Rooms and sprint history help when the same team estimates together every sprint. Both are free.</li>
          <li><strong>Facilitators do not need to vote:</strong> the facilitator role exists to manage reveal, re-vote, moderation, and final estimate capture.</li>
          <li><strong>Real names are required:</strong> participants and facilitators must enter a genuine name so the room stays understandable to the whole team.</li>
          <li><strong>Support questions are easier to solve with context:</strong> sharing the room code, team slug, or exact flow that failed usually shortens the back-and-forth significantly.</li>
        </ul>
      </MarketingSection>

      <MarketingRelatedLinks
        title="Related pages"
        intro="If the question is really about plan fit, workflow, or how the product is intended to be used, these pages cover that in more detail."
        onNavigate={onNavigate}
        links={[
          { href: "/trust", kicker: "Trust", title: "Trust and reliability", copy: "Review the public trust signals, support posture, and product safeguards behind the workflow." },
          { href: "/about", kicker: "About", title: "Why pointpoker exists", copy: "Understand the product philosophy and why the workflow is intentionally lightweight." },
          { href: "/pricing", kicker: "Pricing", title: "What it costs", copy: "Nothing, for everyone. Here is what that covers and how long it lasts." },
        ]}
      />
    </MarketingPageShell>
  );
}

function TrustPage({ onNavigate }) {
  const support = process.env.REACT_APP_SUPPORT_EMAIL || "support@pointpoker.app";

  return (
    <MarketingPageShell
      eyebrow="Trust and reliability"
      title="Trust signals for teams that want a lightweight planning poker tool without lightweight operating standards"
      intro="pointpoker is intentionally simple on the surface, but teams still need to know the basics are handled properly. This page brings together the practical trust signals behind the product: clear support, public legal routes, authenticated email, no ads or tracking cookies, and room safeguards that keep live sessions understandable."
      highlights={[
        { value: "Direct", label: `Support at ${support}` },
        { value: "Verified", label: "SPF, DKIM, and DMARC now pass" },
        { value: "No ads", label: "No advertising or third-party tracking cookies" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Open pointpoker"
      secondaryHref="/support"
      secondaryLabel="Get support"
    >
      <MarketingSection
        title="What teams should expect before they rely on a lightweight SaaS tool"
        intro="Trust is not about pretending a planning poker tool is an enterprise suite. It is about getting the operating basics right so teams understand what they are using and how it behaves."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Public support and legal routes</h3>
            <p className="marketing-card-copy">
              pointpoker publishes its support, privacy, and terms surfaces on the live domain so teams can see how the product is operated instead of hunting through a hidden help centre.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Authenticated support email</h3>
            <p className="marketing-card-copy">
              Outbound mail from <a href={`mailto:${support}`} className="seo-inline-link">{support}</a> now passes SPF, DKIM, and DMARC, which improves deliverability and makes support contact look less improvised.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Clear account boundaries</h3>
            <p className="marketing-card-copy">
              Participation stays friction-light and needs no account at all. Team Room ownership is tied to an authenticated account so a room URL stays with the right team.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        title="Product safeguards that reduce avoidable confusion"
        intro="The room flow is designed to stay understandable to the whole team, especially when people join quickly from shared links."
      >
        <ul className="marketing-list">
          <li><strong>Real names are required:</strong> placeholder names are blocked before entry so rooms stay readable to everyone involved.</li>
          <li><strong>Facilitator actions are explicit:</strong> reveal, re-vote, final-estimate capture, and moderation controls are structured so the next step is hard to miss.</li>
          <li><strong>Deck values stay valid:</strong> final saved estimates must match the active deck, which prevents misleading derived values from polluting sprint history.</li>
          <li><strong>Temporary and permanent rooms are described honestly:</strong> ad-hoc rooms now make their session-active nature clear, while Team Rooms keep the reusable wording they deserve.</li>
          <li><strong>Room data is validated server-side:</strong> the Firebase rules layer enforces room shape, name lengths, and deck-safe estimates rather than trusting the browser.</li>
        </ul>
      </MarketingSection>

      <MarketingSection
        title="Operational signals already in place"
        intro="These are the concrete signs that the product is moving beyond a throwaway demo toward something teams can actually use every sprint."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Stable production domain and crawlable support surface</h3>
            <p className="marketing-card-copy">
              The live product, support routes, and educational pages all sit on the production domain with Search Console connected, sitemap submitted, and key routes requested for indexing.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Account-linked Team Rooms</h3>
            <p className="marketing-card-copy">
              Your two fixed Team Room URLs and your sprint history follow your account across devices instead of floating in anonymous browser state that a cleared cache can wipe.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Published data and rules posture</h3>
            <p className="marketing-card-copy">
              Firebase rules validate room shape and deck-safe estimates, while the product exposes its legal, privacy, and support posture publicly rather than hiding it behind a signup wall.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingRelatedLinks
        title="Related pages"
        intro="These pages explain the product philosophy, support path, and commercial fit in more detail."
        onNavigate={onNavigate}
        links={[
          { href: "/about", kicker: "About", title: "Why pointpoker exists", copy: "See the product philosophy behind the lightweight workflow and focused upgrade path." },
          { href: "/support", kicker: "Support", title: "Support and product guidance", copy: "See where to get help, what questions come up most often, and how the workflow is explained." },
          { href: "/pricing", kicker: "Pricing", title: "What it costs", copy: "Nothing, for everyone, and a straight answer on why and for how long." },
        ]}
      />
    </MarketingPageShell>
  );
}

function WhatIsPlanningPokerPage({ onNavigate }) {
  return (
    <MarketingPageShell
      eyebrow="What is planning poker?"
      title="Planning poker is a lightweight way for agile teams to estimate work without letting the loudest voice decide first"
      intro="Planning poker is an estimation method used in sprint planning and backlog refinement. Everyone picks a card privately, the votes reveal together, and the team discusses the spread before agreeing the final estimate. The point is not mathematical precision. The point is better shared understanding."
      highlights={[
        { value: "Fair", label: "Private first votes reduce anchoring bias" },
        { value: "Fast", label: "The team sees disagreement early and discusses only where needed" },
        { value: "Useful", label: "Better scope conversations before sprint commitment" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Try planning poker free"
      secondaryHref="/planning-poker-online"
      secondaryLabel="See the online workflow"
    >
      <MarketingSection
        title="What planning poker actually does"
        intro="The method is simple, but the impact comes from what it prevents: anchoring, hidden uncertainty, and fake consensus."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Everyone estimates independently first</h3>
            <p className="marketing-card-copy">
              Each voter picks a card before seeing anyone else’s choice. That keeps stronger personalities and senior voices from steering the estimate too early.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">The reveal makes uncertainty visible</h3>
            <p className="marketing-card-copy">
              When one person picks 3 and another picks 8, the disagreement is useful. It usually means the team sees different risk, scope, or implementation effort.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Discussion focuses on the gap, not the whole story</h3>
            <p className="marketing-card-copy">
              Teams do not need to debate every item equally. Planning poker helps them spend energy where the spread tells them understanding is still uneven.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        title="How the process normally works"
        intro="A good planning poker session has a clear rhythm, especially when the facilitator keeps the room moving."
      >
        <div className="marketing-steps">
          {[
            ["Read the story together", "Make sure everyone understands the scope, acceptance criteria, and what 'done' means before anyone votes."],
            ["Vote privately", "Each voter chooses a card independently so the first visible estimate does not bias everyone else."],
            ["Reveal the cards", "The team sees the spread, average, and median, but those numbers guide discussion rather than automatically becoming the answer."],
            ["Discuss the difference", "Talk about why the estimates diverged: hidden complexity, dependencies, ambiguity, or assumptions."],
            ["Either re-vote or agree a final estimate", "A facilitator can run another round or record the final agreed deck value once the team is aligned."],
          ].map(([stepTitle, stepCopy], index) => (
            <article className="marketing-step" key={stepTitle}>
              <span className="marketing-step-num">{index + 1}</span>
              <div>
                <h3 className="marketing-step-title">{stepTitle}</h3>
                <p className="marketing-step-copy">{stepCopy}</p>
              </div>
            </article>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection
        title="Why agile teams keep using planning poker"
        intro="The method survives because it helps teams think together, not because the cards themselves are magical."
      >
        <ul className="marketing-list">
          <li><strong>It improves backlog conversations:</strong> hidden ambiguity surfaces earlier, before it turns into sprint risk.</li>
          <li><strong>It makes estimation more participatory:</strong> engineers, product, and delivery can all contribute to the final view of effort and uncertainty.</li>
          <li><strong>It keeps velocity inputs more honest:</strong> final estimates come from agreement, not from a single person’s guess.</li>
          <li><strong>It works well remotely:</strong> browser-based planning poker keeps the same ceremony pattern even when the team is fully distributed.</li>
        </ul>
      </MarketingSection>

      <MarketingRelatedLinks
        title="Go deeper"
        intro="These guides explain how the method works online, how Fibonacci cards fit in, and how pointpoker supports the workflow in practice."
        onNavigate={onNavigate}
        links={[
          { href: "/planning-poker-online", kicker: "Workflow", title: "Planning poker online", copy: "See how the product turns the ceremony into a browser-first, live estimation flow." },
          { href: "/fibonacci-story-points", kicker: "Guide", title: "Fibonacci story points", copy: "Understand why agile teams use Fibonacci numbers and what to do when estimates split." },
          { href: "/features", kicker: "Product", title: "Feature breakdown", copy: "See the facilitator controls, Team Alignment analytics, and Team Room workflow in context." },
        ]}
      />
    </MarketingPageShell>
  );
}

function FibonacciStoryPointsPage({ onNavigate }) {
  return (
    <MarketingPageShell
      eyebrow="Fibonacci story points"
      title="Fibonacci story points help agile teams express uncertainty as work gets bigger"
      intro="Agile teams often use a Fibonacci-style sequence like 1, 2, 3, 5, 8, 13, 21, and 34 because the gaps get wider as work becomes less predictable. That makes it easier to express uncertainty honestly instead of pretending large stories can be sized with the same precision as small ones."
      highlights={[
        { value: "Fibonacci", label: "Default deck for many Scrum teams" },
        { value: "Wider gaps", label: "Larger work carries more uncertainty" },
        { value: "Consensus", label: "Final estimate should be an agreed deck value" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Try Fibonacci planning poker"
      secondaryHref="/story-point-estimation"
      secondaryLabel="See story estimation guide"
    >
      <MarketingSection
        title="Why Fibonacci is used for story points"
        intro="The sequence is useful because it reminds the team that uncertainty increases with scale. A 13-point story is not just a slightly bigger 8. It often means the team knows less, expects more variation, or sees more delivery risk."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Small differences matter less as work grows</h3>
            <p className="marketing-card-copy">
              Teams usually do not need to debate whether something is an 11 or a 12. Fibonacci keeps the choices coarse enough to focus on useful differences rather than false precision.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">The numbers represent relative effort</h3>
            <p className="marketing-card-copy">
              Story points are not hours. They reflect a mix of effort, complexity, risk, and uncertainty, compared against the rest of the backlog.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Agreement matters more than arithmetic</h3>
            <p className="marketing-card-copy">
              If the team splits between 3 and 5, the final answer should be the agreed Fibonacci card, not an invalid middle number like 4.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        title="How to use Fibonacci cards well"
        intro="The deck works best when the team treats it as a conversation tool, not a scoring machine."
      >
        <ul className="marketing-list">
          <li><strong>Pick a baseline story first:</strong> so the team has a shared reference for what a 2, 3, or 5 roughly feels like.</li>
          <li><strong>Use split votes as a signal:</strong> that the story needs discussion, not as a reason to average numbers automatically.</li>
          <li><strong>Record only valid deck values:</strong> so sprint history and throughput stay consistent with the method the team chose.</li>
          <li><strong>Re-vote when the discussion changes understanding:</strong> instead of forcing a conclusion too early.</li>
        </ul>
      </MarketingSection>

      <MarketingSection
        title="How pointpoker handles Fibonacci estimation"
        intro="The product is designed to reinforce good estimation habits rather than bypass them."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Fibonacci is the default deck</h3>
            <p className="marketing-card-copy">
              Teams can start with the familiar sequence immediately, while still having T-shirt and Powers of 2 available for different estimation styles.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Averages stay contextual</h3>
            <p className="marketing-card-copy">
              The app can show average and median after reveal, but those numbers are there to guide discussion rather than silently becoming the recorded estimate.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Final estimate must stay deck-valid</h3>
            <p className="marketing-card-copy">
              When votes differ, the facilitator records the final agreed Fibonacci value or runs another vote. That keeps sprint history and analytics trustworthy.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingRelatedLinks
        title="Related guides"
        intro="These pages explain the broader estimation method, live planning workflow, and feature layer around Fibonacci story points."
        onNavigate={onNavigate}
        links={[
          { href: "/what-is-planning-poker", kicker: "Guide", title: "What is planning poker?", copy: "Understand the method itself and why simultaneous reveal matters for fair estimation." },
          { href: "/story-point-estimation", kicker: "Workflow", title: "Story point estimation", copy: "See how the product supports better estimation conversations and explicit final agreement." },
          { href: "/planning-poker-online", kicker: "Remote", title: "Planning poker online", copy: "See how distributed teams can use the workflow in a browser without setup friction." },
        ]}
      />
    </MarketingPageShell>
  );
}

function AgileEstimationToolPage({ onNavigate }) {
  return (
    <MarketingPageShell
      eyebrow="Agile estimation tool"
      title="An agile estimation tool should help the team reach clearer decisions, not just collect votes"
      intro="pointpoker works as an agile estimation tool for sprint planning and backlog refinement because it gives teams a clear workflow: define the story, vote independently, reveal together, discuss the gap, and record the agreed estimate without losing momentum."
      highlights={[
        { value: "Realtime", label: "Votes, reveals, and room state stay in sync" },
        { value: "Facilitated", label: "Built for the person running the ceremony" },
        { value: "Practical", label: "Works for backlog refinement and sprint planning" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Open estimation room"
      secondaryHref="/features"
      secondaryLabel="See feature detail"
    >
      <MarketingSection
        title="What teams usually expect from an agile estimation tool"
        intro="The tool does not need to be a giant agile suite. It needs to remove the friction around the specific estimation conversation the team is trying to have."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Fast setup</h3>
            <p className="marketing-card-copy">
              Teams should be able to open a room and invite everyone from a browser link, especially when estimation is only one part of a larger planning session.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Unbiased initial estimates</h3>
            <p className="marketing-card-copy">
              Independent first votes and simultaneous reveal help the team see genuine spread before stronger opinions steer the discussion.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Clear facilitator controls</h3>
            <p className="marketing-card-copy">
              Reveal, re-vote, moderation, timer control, and final estimate capture should all be obvious to the facilitator when the room is live.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        title="Where pointpoker fits in the agile workflow"
        intro="The product is narrow by design. It supports the estimation portion of agile planning well, instead of trying to replace your backlog tool, ticketing system, or roadmap process."
      >
        <ul className="marketing-list">
          <li><strong>Backlog refinement:</strong> estimate stories before sprint commitment and surface unclear scope early.</li>
          <li><strong>Sprint planning:</strong> move through the queue, discuss disagreement, and come out with a clearer sense of sprint scope.</li>
          <li><strong>Remote estimation ceremonies:</strong> share one link, keep everyone in sync, and let the facilitator keep momentum.</li>
          <li><strong>Recurring team rituals:</strong> Team Rooms make it easy to reuse the same room every sprint once the team has a repeatable cadence.</li>
        </ul>
      </MarketingSection>

      <MarketingSection
        title="Why this tool works for real estimation conversations"
        intro="A good agile estimation tool should reinforce healthy team behaviour rather than flatten everything into a silent number picker."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">It supports discussion after reveal</h3>
            <p className="marketing-card-copy">
              Split votes do not get averaged into misleading answers. The team can discuss the difference and the facilitator records the final agreed deck value explicitly.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">It keeps the room understandable</h3>
            <p className="marketing-card-copy">
              Real names are required, roles are explicit, and the invite flow stays visible so the meeting does not become confusing for late joiners or mixed-discipline teams.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">It creates reusable context over time</h3>
            <p className="marketing-card-copy">
              Sprint history and two fixed Team Rooms help the same team come back to a consistent estimation workflow instead of starting from scratch every sprint.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingRelatedLinks
        title="Related pages"
        intro="These routes cover the method itself, online workflow, and the story-point side of agile estimation in more detail."
        onNavigate={onNavigate}
        links={[
          { href: "/what-is-planning-poker", kicker: "Method", title: "What is planning poker?", copy: "Understand the estimation ceremony and why simultaneous reveal matters." },
          { href: "/story-point-estimation", kicker: "Workflow", title: "Story point estimation", copy: "See how the product supports relative sizing and explicit final agreement." },
          { href: "/planning-poker-online", kicker: "Remote", title: "Planning poker online", copy: "See the browser-first workflow that makes the tool practical for distributed teams." },
        ]}
      />
    </MarketingPageShell>
  );
}

function FeaturesPage({ onNavigate }) {
  return (
    <MarketingPageShell
      eyebrow="Features"
      title="Everything an agile team needs to estimate clearly, reveal fairly, and keep sprint planning moving"
      intro="pointpoker is built for live estimation, not static voting widgets. It gives facilitators structure, participants a frictionless join flow, and teams enough context to move from discussion to agreement quickly."
      highlights={[
        { value: "3", label: "Card decks: Fibonacci, T-Shirt, Powers of 2" },
        { value: "Live", label: "Realtime reveal, votes, and participant sync" },
        { value: "£0", label: "Team Rooms and sprint history included free" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Start free room"
      secondaryHref="/pricing"
      secondaryLabel="Compare plans"
    >
      <MarketingSection
        title="Core estimation workflow"
        intro="The product is designed around what teams actually do in planning poker: create a room, add items to estimate, stories or tasks, vote simultaneously, discuss differences, and move on without resetting the whole session."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Simultaneous reveal</h3>
            <p className="marketing-card-copy">
              Everyone votes independently first, then cards reveal together. That keeps louder voices from anchoring the team before the conversation has started.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Estimate stories or tasks, your choice</h3>
            <p className="marketing-card-copy">
              Choose whether you are sizing user stories as a whole or individual tasks within them. Add items as you go or preload the queue, record the agreed estimate, and move straight to the next item without rebuilding the room.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Facilitator controls</h3>
            <p className="marketing-card-copy">
              Facilitators can reveal cards, run another vote, record the agreed estimate, moderate participants, manage the timer, and keep the session moving.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        title="Designed for discussion, not just number collection"
        intro="A good planning poker tool helps teams think better. pointpoker adds the structure that makes disagreement productive instead of noisy."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Split-vote resolution</h3>
            <p className="marketing-card-copy">
              When estimates differ, the app keeps averages visible for context but requires the facilitator to record only a valid agreed deck value or run another vote.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Team Alignment analytics</h3>
            <p className="marketing-card-copy">
              Facilitators can see consensus rate, total points, item throughput, and how often the team agrees on the first vote, helping uncover backlog clarity problems early.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Built for remote teams</h3>
            <p className="marketing-card-copy">
              Browser-first join flow, frictionless invite links, and compact facilitator controls make it practical for Slack, Teams, Zoom, and hybrid sprint ceremonies.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        title="Features teams rely on as they grow"
        intro="Everything below is included for every team at no cost, the live planning flow and the repeatable operational layer that brings the same team back sprint after sprint."
      >
        <ul className="marketing-list">
          <li><strong>Dedicated Team Rooms:</strong> two fixed URLs the team can bookmark and reuse every sprint.</li>
          <li><strong>Sprint history:</strong> session summaries stay attached to the account and become a reliable archive.</li>
          <li><strong>Room capacity:</strong> every room supports up to {MAX_PARTICIPANTS} people, facilitators included.</li>
          <li><strong>Name, role, and invite clarity:</strong> participants can still join shared rooms without unnecessary account friction.</li>
        </ul>
      </MarketingSection>

      <MarketingRelatedLinks
        title="Related pages"
        intro="These pages explain the workflow from different angles: search intent, Scrum language, and story-point estimation practice."
        onNavigate={onNavigate}
        links={[
          { href: "/pricing", kicker: "Pricing", title: "What it costs", copy: "Nothing. See exactly what free covers and why it is built this way." },
          { href: "/scrum-poker", kicker: "Scrum", title: "Scrum poker use cases", copy: "See how the same workflow supports Scrum Masters, Product Owners, and remote engineering teams." },
          { href: "/remote-sprint-planning", kicker: "Remote", title: "Remote sprint planning", copy: "Learn how the product fits distributed ceremonies and recurring shared-room workflows." },
        ]}
      />
    </MarketingPageShell>
  );
}

function PlanningPokerOnlinePage({ onNavigate }) {
  return (
    <MarketingPageShell
      eyebrow="Planning poker online"
      title="Run planning poker online without slowing the team down with setup, sign-up friction, or awkward reveal flow"
      intro="pointpoker is built for teams that want to open a room, share a link, vote together, and move through a backlog quickly. It works in any browser, so the whole team can join from desktop or mobile in seconds."
      highlights={[
        { value: "10 sec", label: "Typical time to create and share a room" },
        { value: "Zero", label: "Install or account requirement for free sessions" },
        { value: "Live", label: "Realtime reveal and room sync across the team" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Start free room"
      secondaryHref="/features"
      secondaryLabel="Explore features"
    >
      <MarketingSection
        title="Why teams look for planning poker online"
        intro="Most teams are trying to solve the same problem: they want unbiased estimates, a simple remote join flow, and enough structure that the sprint planning meeting does not drift."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">No install barrier</h3>
            <p className="marketing-card-copy">
              Everyone joins from a browser link. That makes it easy to drop a room into Slack, Teams, Zoom chat, or a calendar invite and start estimating immediately.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Clear reveal flow</h3>
            <p className="marketing-card-copy">
              The room supports true simultaneous reveal, so estimates stay independent until the team is ready to discuss them.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Room stays focused</h3>
            <p className="marketing-card-copy">
              Story queue, timer, facilitator controls, and explicit next-step prompts keep the team in one workflow instead of juggling notes, chat, and spreadsheets.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        title="How a typical online planning poker session runs"
        intro="The product flow stays intentionally simple so the team spends time discussing the backlog, not learning the tool."
      >
        <div className="marketing-steps">
          {[
            ["Create or join the room", "Start a free room instantly or join from a shared link with your name and role."],
            ["Add the story you are estimating", "Work from a backlog queue or estimate one story at a time during refinement."],
            ["Vote privately", "Each voter picks a card before the reveal, which reduces anchoring bias."],
            ["Discuss only when the spread matters", "Facilitators can reveal, time-box discussion, and either re-vote or record the agreed estimate."],
            ["Move straight to the next item", "The room keeps momentum without forcing the team to rebuild context for every story."],
          ].map(([stepTitle, stepCopy], index) => (
            <article className="marketing-step" key={stepTitle}>
              <span className="marketing-step-num">{index + 1}</span>
              <div>
                <h3 className="marketing-step-title">{stepTitle}</h3>
                <p className="marketing-step-copy">{stepCopy}</p>
              </div>
            </article>
          ))}
        </div>
      </MarketingSection>

      <MarketingRelatedLinks
        title="Explore the workflow in more detail"
        intro="If you are evaluating tools for estimation practice, these related pages show the Scrum, story-point, and remote-team angles."
        onNavigate={onNavigate}
        links={[
          { href: "/scrum-poker", kicker: "Scrum", title: "Scrum poker", copy: "See how the same flow supports backlog refinement and sprint planning in Scrum teams." },
          { href: "/story-point-estimation", kicker: "Guide", title: "Story point estimation", copy: "Learn how the product supports Fibonacci-based discussions and facilitator-led agreement." },
          { href: "/pricing", kicker: "Pricing", title: "What it costs", copy: "Nothing, for every team. Read the full pricing promise and what it covers." },
        ]}
      />
    </MarketingPageShell>
  );
}

function ScrumPokerPage({ onNavigate }) {
  return (
    <MarketingPageShell
      eyebrow="Scrum poker"
      title="A scrum poker app that keeps sprint planning focused, fair, and easy to run with remote teams"
      intro="Scrum teams often search for scrum poker when what they really need is a low-friction planning poker workflow. pointpoker supports that exact ceremony pattern: independent voting, reveal, discussion, agreement, then straight into the next story."
      highlights={[
        { value: "Scrum", label: "Built for backlog refinement and sprint planning" },
        { value: "Fair", label: "Votes reveal together to reduce anchoring" },
        { value: "Fast", label: "Facilitator can re-vote or record agreement quickly" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Start scrum poker room"
      secondaryHref="/features"
      secondaryLabel="See facilitator features"
    >
      <MarketingSection
        title="Where scrum poker fits best"
        intro="The tool is most useful in the ceremonies where the team needs shared understanding before committing to sprint scope."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Sprint planning</h3>
            <p className="marketing-card-copy">
              Use the queue, vote through the backlog, and leave the session with a cleaner sense of the sprint’s scope and the stories that still need clarification.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Backlog refinement</h3>
            <p className="marketing-card-copy">
              Smaller estimation sessions still benefit from the same reveal-and-discuss pattern, especially when stories are unclear or acceptance criteria are thin.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Cross-functional alignment</h3>
            <p className="marketing-card-copy">
              Scrum poker surfaces differences between engineering, product, and delivery expectations before those differences become sprint risk.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        title="What Scrum Masters and facilitators need from the tool"
        intro="A usable scrum poker app should help the facilitator manage the flow without dominating the conversation."
      >
        <ul className="marketing-list">
          <li><strong>Role separation:</strong> facilitators can join without casting a vote card.</li>
          <li><strong>Clear post-reveal decisions:</strong> when the team splits, the facilitator can record the agreed deck value or run another vote.</li>
          <li><strong>Moderation controls:</strong> facilitators can manage participants and keep the room focused.</li>
          <li><strong>Lightweight join flow:</strong> guests can enter with a name and role instead of being forced through account creation.</li>
        </ul>
      </MarketingSection>

      <MarketingRelatedLinks
        title="Keep evaluating from the right angle"
        intro="These pages cover the broader online-estimation workflow, pricing, and story-point estimation practice around Scrum poker."
        onNavigate={onNavigate}
        links={[
          { href: "/planning-poker-online", kicker: "Guide", title: "Planning poker online", copy: "See the full browser-first flow for remote teams and ad-hoc sessions." },
          { href: "/story-point-estimation", kicker: "Guide", title: "Story point estimation", copy: "Understand how the tool helps teams converge on meaningful estimates." },
          { href: "/pricing", kicker: "Plans", title: "Pricing and Team Room fit", copy: "See when recurring Scrum teams benefit from two dedicated reusable Team Rooms." },
        ]}
      />
    </MarketingPageShell>
  );
}

function StoryPointEstimationPage({ onNavigate }) {
  return (
    <MarketingPageShell
      eyebrow="Story point estimation"
      title="Use story point estimation to drive better planning conversations, not false precision"
      intro="pointpoker is built around the reality that estimates are a team decision, not a spreadsheet formula. The product helps teams vote independently, expose differences, discuss trade-offs, and record the final agreed value from the active deck."
      highlights={[
        { value: "Fibonacci", label: "Default deck for effort and uncertainty" },
        { value: "3", label: "Deck options for different team habits" },
        { value: "Clear", label: "Facilitator flow for split estimates and agreement" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Try story estimation free"
      secondaryHref="/features"
      secondaryLabel="See the estimation flow"
    >
      <MarketingSection
        title="Why teams use story points instead of hours"
        intro="Story points help teams compare relative effort and uncertainty without pretending the work is already perfectly understood."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Relative sizing beats fake precision</h3>
            <p className="marketing-card-copy">
              Teams can usually agree faster on whether something feels closer to a 3 or an 8 than on whether it will take exactly 9.5 hours.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Fibonacci highlights uncertainty</h3>
            <p className="marketing-card-copy">
              Wider gaps at larger values push the team to acknowledge risk and complexity instead of compressing everything into tiny numeric differences.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Consensus matters more than average</h3>
            <p className="marketing-card-copy">
              The product keeps discussion analytics visible, but it only saves final agreed deck values so sprint history stays trustworthy.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        title="Best-practice estimation flow"
        intro="Good estimation is structured. The app is designed to make the next decision obvious at every stage."
      >
        <div className="marketing-steps">
          {[
            ["Let everyone vote independently", "Private voting reduces anchoring and produces a more honest first signal."],
            ["Reveal the cards together", "Use the spread, average, and median to guide discussion, not as an automatic answer."],
            ["Discuss the differences", "The stories with the widest spread are usually where acceptance criteria or scope still need work."],
            ["Either re-vote or record the agreed estimate", "Facilitators can capture only valid deck values, keeping the estimate aligned with the team’s chosen method."],
          ].map(([stepTitle, stepCopy], index) => (
            <article className="marketing-step" key={stepTitle}>
              <span className="marketing-step-num">{index + 1}</span>
              <div>
                <h3 className="marketing-step-title">{stepTitle}</h3>
                <p className="marketing-step-copy">{stepCopy}</p>
              </div>
            </article>
          ))}
        </div>
      </MarketingSection>

      <MarketingRelatedLinks
        title="Related pages"
        intro="These routes cover the broader estimation workflow, Scrum ceremony context, and pricing trade-offs."
        onNavigate={onNavigate}
        links={[
          { href: "/planning-poker-online", kicker: "Workflow", title: "Planning poker online", copy: "See how the browser-first room flow supports live estimation from anywhere." },
          { href: "/scrum-poker", kicker: "Scrum", title: "Scrum poker", copy: "Understand how the same estimation flow fits sprint planning and backlog refinement." },
          { href: "/pricing", kicker: "Pricing", title: "What it costs", copy: "Nothing, including the fixed Team Rooms recurring ceremonies rely on." },
        ]}
      />
    </MarketingPageShell>
  );
}

function RemoteSprintPlanningPage({ onNavigate }) {
  return (
    <MarketingPageShell
      eyebrow="Remote sprint planning"
      title="Run remote sprint planning with one browser link, structured facilitation, and a room your team can actually reuse"
      intro="Distributed teams need sprint planning tools that are fast to join, easy to facilitate, and reliable enough to reuse every sprint. pointpoker keeps the estimation part of the ceremony compact so the team can focus on scope and delivery decisions."
      highlights={[
        { value: "1 link", label: "Share in Slack, Teams, Zoom, or calendar invites" },
        { value: "Live", label: "Votes, reveals, and story flow sync in real time" },
        { value: "Reuse", label: "2 fixed Team Room URLs, free, every sprint" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Start remote room"
      secondaryHref="/pricing"
      secondaryLabel="See pricing"
    >
      <MarketingSection
        title="What remote teams usually need"
        intro="The biggest friction in remote sprint planning is not estimation itself. It is getting everyone into the same place quickly and keeping the meeting moving."
      >
        <div className="marketing-card-grid">
          <article className="marketing-card">
            <h3 className="marketing-card-title">Fast join flow</h3>
            <p className="marketing-card-copy">
              Participants can join free rooms or shared Team Rooms with a name and role, so the facilitator is not blocked by account setup.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Clear facilitator workflow</h3>
            <p className="marketing-card-copy">
              Reveal, re-vote, timer control, participant moderation, and final estimate capture all sit inside one flow built for the person running the ceremony.
            </p>
          </article>
          <article className="marketing-card">
            <h3 className="marketing-card-title">Persistent room when the team is ready</h3>
            <p className="marketing-card-copy">
              Team Rooms give recurring squads two fixed URLs so nobody recreates and re-shares the same room every sprint.
            </p>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        title="A simple remote planning routine"
        intro="These are the habits that usually make remote sprint planning feel lightweight rather than exhausting."
      >
        <ul className="marketing-list">
          <li><strong>Share the room before the meeting starts:</strong> so people can join as the call opens.</li>
          <li><strong>Keep story names visible and estimates structured:</strong> so discussion stays anchored to one backlog item at a time.</li>
          <li><strong>Use facilitator-only controls:</strong> to keep reveals, re-votes, and final estimate decisions consistent.</li>
          <li><strong>Reuse one of your two dedicated Team Rooms:</strong> when the team estimates together every sprint and wants a stable operating rhythm.</li>
        </ul>
      </MarketingSection>

      <MarketingRelatedLinks
        title="Related pages"
        intro="These links explain the planning-poker workflow, Scrum ceremony angle, and pricing choices for recurring remote teams."
        onNavigate={onNavigate}
        links={[
          { href: "/planning-poker-online", kicker: "Workflow", title: "Planning poker online", copy: "Understand the browser-first room flow and live reveal model." },
          { href: "/features", kicker: "Product", title: "Feature breakdown", copy: "See the facilitator controls, story queue, Team Alignment, and history features." },
          { href: "/pricing", kicker: "Pricing", title: "What it costs remote teams", copy: "Nothing, including the reusable Team Rooms distributed squads rely on." },
        ]}
      />
    </MarketingPageShell>
  );
}

function getAuthErrorMessage(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "That email address already has an account.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email or password not recognised.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    default:
      return "Could not complete that request. Try again.";
  }
}

function getVerificationErrorMessage(error) {
  switch (error?.code) {
    case "auth/too-many-requests":
      return "Too many verification attempts. Wait a moment and try again.";
    case "auth/unauthorized-continue-uri":
    case "auth/invalid-continue-uri":
    case "auth/missing-continue-uri":
      return "We could not send the verification email from this domain right now. Try again shortly or contact support.";
    default:
      return "We could not send the verification email right now. Try again.";
  }
}

function deriveDisplayNameFallback(email = "") {
  const local = (email || "").split("@")[0]?.trim();
  if (!local) return "Alex Johnson";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveTeamRoomName(displayName = "", email = "") {
  const base = (displayName || deriveDisplayNameFallback(email) || "Team").trim();
  if (!base) return "My Team";
  return /team$/i.test(base) ? base : `${base} Team`;
}

function deriveDedicatedRoomOwnerSuffix(profile = {}, user = null) {
  const emailLocal = (profile.email || user?.email || "").split("@")[0]?.trim();
  const displayFallback = profile.displayName || user?.displayName || "";
  const nextValue = teamCode(emailLocal || displayFallback || "team");
  return nextValue || "team";
}

function buildDedicatedRoomLabel(label = "", tail = "", fallback = "My Team") {
  const cleaned = String(label || "").replace(/\s+/g, " ").trim();
  const suffix = tail ? ` ${tail}` : "";
  const baseMax = Math.max(1, 60 - suffix.length);
  const base = (cleaned || fallback).slice(0, baseMax).trim();
  return clampTeamRoomLabel(`${base}${suffix}`, fallback);
}

function clampTeamRoomLabel(name = "", fallback = "My Team") {
  const cleaned = String(name || "").replace(/\s+/g, " ").trim();
  const nextValue = cleaned || fallback;
  return nextValue.length <= 60
    ? nextValue
    : nextValue.slice(0, 60).trim();
}

function deriveSecondaryTeamRoomName(primaryName = "", displayName = "", email = "") {
  const fallbackPrimary = deriveTeamRoomName(displayName, email);
  const primary = clampTeamRoomLabel(primaryName || fallbackPrimary, fallbackPrimary);
  const suffix = " 2";
  const base = primary.replace(/\s+2$/i, "");
  const trimmedBase = base.length + suffix.length <= 60
    ? base
    : base.slice(0, 60 - suffix.length).trim();
  return clampTeamRoomLabel(`${trimmedBase}${suffix}`, "My Team 2");
}

function buildDedicatedTeamRoomsFromLabel(label = "", profile = {}, user = null) {
  const displayName = profile.displayName || user?.displayName || "";
  const email = profile.email || user?.email || "";
  const ownerSuffix = deriveDedicatedRoomOwnerSuffix(profile, user);
  const primaryFallback = deriveTeamRoomName(displayName, email);
  const secondaryFallback = deriveSecondaryTeamRoomName(primaryFallback, displayName, email);
  const primary = buildDedicatedRoomLabel(label, ownerSuffix, primaryFallback);
  let secondary = buildDedicatedRoomLabel(label, `2 ${ownerSuffix}`, secondaryFallback);
  if (secondary === primary) {
    secondary = deriveSecondaryTeamRoomName(primary, displayName, email);
  }
  return { primary, secondary };
}

function deriveDedicatedRoomLabelPrefix(profile = {}, user = null) {
  const displayName = profile.displayName || user?.displayName || "";
  const email = profile.email || user?.email || "";
  const currentPrimary = resolveDedicatedTeamRooms(profile, user).primary;
  const ownerSuffix = deriveDedicatedRoomOwnerSuffix(profile, user);
  let nextValue = currentPrimary.trim();
  const ownerTail = ` ${ownerSuffix}`.toLowerCase();
  if (nextValue.toLowerCase().endsWith(ownerTail)) {
    nextValue = nextValue.slice(0, -ownerTail.length).trim();
  }
  if (/\s+team$/i.test(nextValue)) {
    nextValue = nextValue.replace(/\s+team$/i, "").trim();
  }
  return nextValue || deriveDisplayNameFallback(email || displayName);
}

function resolveDedicatedTeamRooms(profile = {}, user = null) {
  const displayName = profile.displayName || user?.displayName || "";
  const email = profile.email || user?.email || "";
  const primaryFallback = deriveTeamRoomName(displayName, email);
  const primary = clampTeamRoomLabel(
    profile?.teamRooms?.primary || profile.teamRoomName || primaryFallback,
    primaryFallback,
  );
  let secondary = clampTeamRoomLabel(
    profile?.teamRooms?.secondary || deriveSecondaryTeamRoomName(primary, displayName, email),
    deriveSecondaryTeamRoomName(primary, displayName, email),
  );
  if (secondary === primary) {
    secondary = deriveSecondaryTeamRoomName(primary, displayName, email);
  }
  return { primary, secondary };
}

async function saveUserProfile(user, profile = {}) {
  if (!user?.uid) return;
  const teamRooms = resolveDedicatedTeamRooms(profile, user);
  const nextProfile = {
    email: user.email || profile.email || "",
    displayName: profile.displayName || user.displayName || "",
    teamRoomName: teamRooms.primary,
    teamRooms,
    plan: profile.plan || "free",
    billingStatus: profile.billingStatus || "inactive",
    createdAt: profile.createdAt || Date.now(),
    lastLoginAt: Date.now(),
  };
  await update(ref(db, `users/${user.uid}`), nextProfile);
}






/* ═══════════════════════ HISTORY MODAL ═══════════════════════
   Shows all saved sprint sessions with velocity insights, for any signed-in account.
   history: array of session records from Firebase /history/{uid}
═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════ LEGAL PAGE SHELL ═══════════════════════
   Shared layout wrapper for Terms and Privacy pages.
   Renders within the main SPA layout (NavBar + Footer stay visible).
═══════════════════════════════════════════════════════════════ */
function LegalPage({ title, lastUpdated, onBack, children }) {
  return (
    <div className="legal-page">
      <div className="legal-inner">
        <button className="legal-back" onClick={onBack} aria-label="Back to home">
          ← Back
        </button>
        <h1 className="legal-h1">{title}</h1>
        <p className="legal-updated">Last updated: {lastUpdated}</p>
        <div className="legal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ TERMS OF SERVICE ═══════════════════════
   Governed by English law. Protects pointpoker and its operator
   from misuse, liability, and service abuse claims.
═══════════════════════════════════════════════════════════════ */
function TermsPage({ onBack }) {
  const support = process.env.REACT_APP_SUPPORT_EMAIL || "support@pointpoker.app";
  return (
    <LegalPage title="Terms of Service" lastUpdated="29 March 2026" onBack={onBack}>
      <h2>1. Agreement to Terms</h2>
      <p>
        These Terms of Service ("Terms") govern your access to and use of the pointpoker service
        ("Service"), operated by the pointpoker owner ("we", "us", "our"). By accessing or using
        the Service, you agree to be bound by these Terms. If you do not agree, you must not use
        the Service.
      </p>
      <p>
        These Terms constitute a legally binding agreement between you and us. We reserve the right
        to modify these Terms at any time. Continued use of the Service after any change constitutes
        acceptance of the updated Terms. Material changes will be communicated via the Service.
      </p>

      <h2>2. Description of the Service</h2>
      <p>
        pointpoker is a web-based planning poker tool designed to assist agile and Scrum teams in
        collaborative story-point estimation. The Service is currently provided free of charge to all
        users, with no paid tier and no payment taken. We may introduce paid features in future; if we
        do, we will say so in advance and the features available free at that time will remain free.
      </p>
      <p>
        The Service is provided via third-party infrastructure including Google Firebase (real-time
        database and authentication) and Vercel (hosting). These third parties operate independently
        and are subject to their own terms and privacy policies.
      </p>

      <h2>3. Eligibility and Accounts</h2>
      <p>
        You must be at least 16 years of age to use the Service. By using the Service, you represent
        and warrant that you meet this requirement and have the legal capacity to enter into this
        agreement.
      </p>
      <p>
        If you create an account, you are responsible for maintaining the confidentiality of your
        credentials and for all activity that occurs under your account. You must notify us immediately
        at <a href={`mailto:${support}`}>{support}</a> if you suspect any unauthorised use.
      </p>
      <p>
        You may not create accounts by automated means or register under false pretences. We reserve
        the right to terminate accounts that violate these Terms without notice or refund.
      </p>

      <h2>4. Acceptable Use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>Violate any applicable law or regulation, including data protection and privacy laws;</li>
        <li>Transmit any harmful, abusive, defamatory, obscene, or otherwise objectionable content;</li>
        <li>Attempt to gain unauthorised access to any part of the Service, its infrastructure, or another user's data;</li>
        <li>Interfere with or disrupt the integrity or performance of the Service;</li>
        <li>Conduct automated scraping, crawling, or data extraction without our written consent;</li>
        <li>Reverse engineer, decompile, or disassemble any component of the Service;</li>
        <li>Use the Service in any manner that could damage, disable, or impair our infrastructure.</li>
      </ul>
      <p>
        We reserve the right to suspend or terminate your access if we determine, in our sole
        discretion, that you have violated this acceptable use policy.
      </p>

      <h2>5. Charges</h2>
      <p>
        The Service is free of charge. We do not collect payment details, we do not operate a paid
        tier, and no part of the Service is behind a paywall. Because nothing is sold to you, no
        consumer purchase, refund, or cancellation rights arise in respect of the Service.
      </p>
      <p>
        We may introduce optional paid features in future. If we do, they will be additional to the
        functionality that is free at that time, they will be clearly identified before any charge,
        and no payment will ever be taken without your express agreement.
      </p>

      <h2>6. Intellectual Property</h2>
      <p>
        All intellectual property rights in the Service, including but not limited to its software,
        design, visual elements, and content, are owned by us or our licensors. Nothing in these
        Terms grants you any right, title, or interest in the Service other than the limited
        right to use it in accordance with these Terms.
      </p>
      <p>
        You retain ownership of any content you input into the Service (such as story names). You
        grant us a limited, royalty-free licence to store and process such content solely for the
        purpose of providing the Service to you.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS
        OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
        PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, OR UNINTERRUPTED AVAILABILITY.
      </p>
      <p>
        We do not warrant that the Service will be free of errors, viruses, or other harmful components,
        or that any defects will be corrected. We make no warranty as to the reliability, timeliness,
        or accuracy of any results produced by the Service.
      </p>
      <p>
        The Service is intended as a facilitation tool only. Estimates and outputs produced through
        the Service are the sole responsibility of the teams using it. We accept no liability for
        decisions made on the basis of estimates produced using the Service.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL WE BE LIABLE FOR ANY
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED
        TO LOSS OF PROFITS, DATA, GOODWILL, OR BUSINESS INTERRUPTION, ARISING FROM OR IN CONNECTION
        WITH YOUR USE OF OR INABILITY TO USE THE SERVICE, HOWEVER CAUSED AND UNDER ANY THEORY OF
        LIABILITY.
      </p>
      <p>
        OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM OR RELATING TO THESE TERMS
        OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE TWELVE MONTHS
        PRECEDING THE CLAIM, OR (B) £100 (ONE HUNDRED POUNDS STERLING).
      </p>
      <p>
        Nothing in these Terms excludes or limits our liability for death or personal injury caused by
        our negligence, fraud or fraudulent misrepresentation, or any other liability that cannot be
        excluded or limited by English law.
      </p>

      <h2>9. Indemnification</h2>
      <p>
        You agree to indemnify, defend, and hold harmless us and our officers, directors, employees,
        agents, and successors from and against any claims, liabilities, damages, losses, and expenses
        (including reasonable legal fees) arising out of or in connection with your use of the Service,
        your violation of these Terms, or your infringement of any third-party rights.
      </p>

      <h2>10. Third-Party Services</h2>
      <p>
        The Service integrates with third-party services including Google Firebase and Vercel.
        Your use of such services is subject to their respective terms and privacy policies. We are not
        responsible for the practices, content, or availability of any third-party services.
      </p>

      <h2>11. Availability and Changes to the Service</h2>
      <p>
        We reserve the right to modify, suspend, or discontinue the Service (or any part thereof) at
        any time, with or without notice. We shall not be liable to you or any third party for any
        such modification, suspension, or discontinuation.
      </p>
      <p>
        We will make reasonable efforts to provide advance notice of material changes that affect
        how teams use the Service.
      </p>

      <h2>12. Governing Law and Jurisdiction</h2>
      <p>
        These Terms and any dispute or claim arising from or in connection with them (including
        non-contractual disputes or claims) shall be governed by and construed in accordance with
        the laws of England and Wales.
      </p>
      <p>
        You and we irrevocably agree that the courts of England and Wales shall have exclusive
        jurisdiction to settle any dispute or claim arising from or in connection with these Terms
        or their subject matter.
      </p>

      <h2>13. General</h2>
      <p>
        If any provision of these Terms is held to be invalid or unenforceable, the remaining
        provisions shall continue in full force and effect. Our failure to enforce any right or
        provision of these Terms shall not constitute a waiver of that right or provision.
      </p>
      <p>
        These Terms constitute the entire agreement between you and us regarding the Service and
        supersede all prior agreements, representations, and understandings.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions or concerns regarding these Terms should be directed to:{" "}
        <a href={`mailto:${support}`}>{support}</a>
      </p>
    </LegalPage>
  );
}

/* ═══════════════════════ PRIVACY POLICY ═══════════════════════
   GDPR-compliant under UK GDPR and the Data Protection Act 2018.
   Satisfies Article 13 transparency obligations (notice at collection).
═══════════════════════════════════════════════════════════════ */
function PrivacyPage({ onBack }) {
  const support = process.env.REACT_APP_SUPPORT_EMAIL || "support@pointpoker.app";
  return (
    <LegalPage title="Privacy Policy" lastUpdated="29 March 2026" onBack={onBack}>
      <h2>1. Who We Are</h2>
      <p>
        pointpoker ("we", "us", "our") is a planning poker service. The operator is the data controller
        responsible for your personal data processed in connection with the Service. For any
        data-related queries, contact us at <a href={`mailto:${support}`}>{support}</a>.
      </p>

      <h2>2. What Data We Collect</h2>
      <p>We collect and process only the data necessary to provide the Service:</p>
      <ul>
        <li>
          <strong>Account data</strong> If you register, we collect your email address and
          display name. These are required to create and manage your account.
        </li>
        <li>
          <strong>Session data</strong> Room codes, team names, story names, and vote values
          are stored temporarily in Firebase Realtime Database while a session is active.
          Session data is deleted when the session ends. If you are signed in, a summary of the
          session (total points, stories estimated, consensus rate) is retained in your account
          history until you delete it.
        </li>
        <li>
          <strong>Usage analytics</strong> We count anonymised events (e.g. "room created",
          "pricing page viewed") as daily integer totals in Firebase. No personal data, device
          identifiers, or IP addresses are stored in analytics. These counts cannot be linked
          back to any individual.
        </li>
        <li>
          <strong>Technical data</strong> Firebase and Vercel may log standard server data
          (IP addresses, browser type, access timestamps) as part of their infrastructure
          operations. We do not control or access this data outside their platforms.
        </li>
        <li>
          <strong>Payment data</strong> None. The Service is free, we take no payments, and we
          do not collect or store card or billing details of any kind.
        </li>
      </ul>

      <h2>3. Legal Basis for Processing (UK GDPR)</h2>
      <p>
        We process your personal data on the following legal bases under the UK General Data
        Protection Regulation:
      </p>
      <ul>
        <li>
          <strong>Contract performance (Article 6(1)(b))</strong> Processing your account
          data and session data is necessary to deliver the Service you have requested.
        </li>
        <li>
          <strong>Legitimate interests (Article 6(1)(f))</strong> We process anonymised
          usage analytics to understand how the Service is used and to improve it. These
          interests are not overridden by your rights, as no personal data is included.
        </li>
        <li>
          <strong>Consent (Article 6(1)(a))</strong> We rely on your consent for storing
          a preference cookie (cookie consent flag) in your browser. You may withdraw this
          consent at any time via the Cookie Settings link in the footer.
        </li>
      </ul>

      <h2>4. How We Use Your Data</h2>
      <p>We use your data solely for the following purposes:</p>
      <ul>
        <li>To create and authenticate your account;</li>
        <li>To operate and deliver the planning poker Service;</li>
        <li>To store sprint history associated with your account;</li>
        <li>To count anonymised usage events to improve the product;</li>
        <li>To respond to support enquiries you send to us;</li>
        <li>To comply with our legal obligations.</li>
      </ul>
      <p>
        We do not sell, rent, or share your personal data with third parties for marketing
        purposes. We do not use your data for automated decision-making or profiling.
      </p>

      <h2>5. Cookies and Local Storage</h2>
      <p>
        We use browser local storage (not traditional HTTP cookies) for the following purposes:
      </p>
      <ul>
        <li>
          <strong>Firebase authentication persistence</strong> Firebase stores your
          authentication session in IndexedDB or local storage to keep you signed in across
          browser sessions. This is strictly necessary for the authentication feature.
        </li>
        <li>
          <strong>Cookie consent preference</strong> A single flag (<code>pp_cookie_ok</code>)
          is stored in local storage to record that you have accepted this notice. It contains
          no personal data.
        </li>
      </ul>
      <p>
        We do not set advertising, tracking, or third-party marketing cookies. You can reset
        your cookie consent at any time via Cookie Settings in the footer.
      </p>

      <h2>6. Third-Party Processors</h2>
      <p>
        We use the following third-party services that process data on our behalf as data
        processors:
      </p>
      <ul>
        <li>
          <strong>Google Firebase</strong> Provides real-time database (session data) and
          authentication. Data may be stored in Google's data centres, which may be located
          within the EEA and other regions. Google LLC is certified under the EU-US Data
          Privacy Framework. See{" "}
          <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer">
            Firebase Privacy Policy
          </a>.
        </li>
        <li>
          <strong>Vercel Inc.</strong> Hosts and serves the Service. Standard server access
          logs may be retained by Vercel in accordance with their privacy policy. See{" "}
          <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
            Vercel Privacy Policy
          </a>.
        </li>
      </ul>

      <h2>7. Data Retention</h2>
      <p>
        We retain your data for as long as your account is active or as needed to provide the
        Service. Room session data is deleted when the session ends, and rooms left idle are
        removed automatically. Account data (profile and sprint history) is retained while your
        account remains active.
      </p>
      <p>
        If you request account deletion, we will delete your personal data within 30 days, except
        where we are required to retain it by law.
      </p>

      <h2>8. Your Rights Under UK GDPR</h2>
      <p>
        As a data subject under UK GDPR and the Data Protection Act 2018, you have the following
        rights:
      </p>
      <ul>
        <li>
          <strong>Right of access</strong> You may request a copy of the personal data we
          hold about you.
        </li>
        <li>
          <strong>Right to rectification</strong> You may ask us to correct inaccurate or
          incomplete data.
        </li>
        <li>
          <strong>Right to erasure ("right to be forgotten")</strong> You may request that
          we delete your personal data, subject to legal retention requirements.
        </li>
        <li>
          <strong>Right to restriction of processing</strong> You may ask us to restrict
          processing of your data in certain circumstances.
        </li>
        <li>
          <strong>Right to data portability</strong> You may request your data in a
          structured, machine-readable format.
        </li>
        <li>
          <strong>Right to object</strong> You may object to processing based on legitimate
          interests at any time.
        </li>
        <li>
          <strong>Right to withdraw consent</strong> Where processing is based on consent,
          you may withdraw it at any time without affecting the lawfulness of prior processing.
        </li>
      </ul>
      <p>
        To exercise any of these rights, contact us at{" "}
        <a href={`mailto:${support}`}>{support}</a>. We will respond within one calendar month.
        You will not be charged for exercising these rights.
      </p>

      <h2>9. Right to Lodge a Complaint</h2>
      <p>
        If you believe we have processed your data unlawfully or in violation of UK GDPR, you
        have the right to lodge a complaint with the Information Commissioner's Office (ICO),
        the UK supervisory authority for data protection:
      </p>
      <ul>
        <li>Website: <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a></li>
        <li>Helpline: 0303 123 1113</li>
      </ul>
      <p>
        We encourage you to contact us first at <a href={`mailto:${support}`}>{support}</a> so
        we can attempt to resolve your concern directly.
      </p>

      <h2>10. Data Security</h2>
      <p>
        We take reasonable technical and organisational measures to protect your personal data
        against accidental loss, unauthorised access, alteration, or disclosure. These measures
        include Firebase security rules (restricting data access to the owning user),
        HTTPS-enforced transmission, and role-based access controls.
      </p>
      <p>
        No method of transmission over the internet or electronic storage is 100% secure. While
        we strive to use commercially acceptable means to protect your data, we cannot guarantee
        absolute security.
      </p>

      <h2>11. International Transfers</h2>
      <p>
        Your data may be processed in countries outside the United Kingdom, including the United
        States, by our third-party processors (Firebase, Vercel). Each processor has
        appropriate safeguards in place, such as Standard Contractual Clauses or recognised
        certification frameworks, to ensure your data is protected to UK GDPR standards.
      </p>

      <h2>12. Children's Privacy</h2>
      <p>
        The Service is not directed at children under 16 years of age. We do not knowingly
        collect personal data from children under 16. If you believe a child under 16 has
        provided personal data, please contact us and we will delete it promptly.
      </p>

      <h2>13. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes will be indicated
        by updating the "Last updated" date at the top of this page. Continued use of the Service
        after any changes constitutes acceptance of the updated policy.
      </p>

      <h2>14. Contact and Data Controller Details</h2>
      <p>
        For all privacy-related queries, data subject requests, or complaints, contact:{" "}
        <a href={`mailto:${support}`}>{support}</a>
      </p>
      <p id="data">
        We are registered in England and Wales and subject to UK GDPR as implemented by the
        Data Protection Act 2018. We are not currently required to register with the ICO as a
        data controller solely processing data for our own business purposes on a small scale,
        but we operate in full compliance with UK GDPR obligations.
      </p>
    </LegalPage>
  );
}

function HistoryModal({ onClose, history }) {
  const [dialogRef, closeDialog] = useDialog(onClose);
  const totalSprints = history.length;

  // Compute insights from numeric-point sessions only
  const pointSessions = history.filter(h => h.totalPoints > 0);
  const avgVelocity = pointSessions.length > 0
    ? Math.round(pointSessions.reduce((s, h) => s + h.totalPoints, 0) / pointSessions.length)
    : 0;
  const bestSprint = pointSessions.length > 0
    ? Math.max(...pointSessions.map(h => h.totalPoints))
    : 0;
  const avgConsensus = totalSprints > 0
    ? Math.round(history.reduce((s, h) => s + (h.consensusRate || 0), 0) / totalSprints)
    : 0;

  // Trend: compare most recent half vs earlier half (need ≥2 sessions)
  let trend = null;
  if (pointSessions.length >= 2) {
    const half  = Math.ceil(pointSessions.length / 2);
    const recent = pointSessions.slice(0, half);
    const older  = pointSessions.slice(half);
    const recentAvg = recent.reduce((s, h) => s + h.totalPoints, 0) / recent.length;
    const olderAvg  = older.reduce((s, h)  => s + h.totalPoints, 0)  / older.length;
    if (recentAvg > olderAvg * 1.05)      trend = { icon: "↑", label: "Improving", col: "#4ade80" };
    else if (recentAvg < olderAvg * 0.95) trend = { icon: "↓", label: "Declining", col: "#f87171" };
    else                                   trend = { icon: "→", label: "Steady",    col: "var(--gold2)" };
  }

  const fmtDate = (ts) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  const fmtDuration = (start, end) => {
    if (!start || !end) return "";
    const mins = Math.round((end - start) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="history-overlay" role="dialog" aria-modal="true" aria-label="Sprint history" ref={dialogRef}>
      <div className="history-modal">
        <div className="history-header">
          <div>
            <h2 className="history-title">Sprint History</h2>
            <p className="history-sub">
              {totalSprints === 0
                ? "No sprint sessions recorded yet"
                : `${totalSprints} session${totalSprints !== 1 ? "s" : ""} recorded`}
            </p>
          </div>
          <button className="history-close" onClick={closeDialog} aria-label="Close history">✕</button>
        </div>

        {totalSprints === 0 ? (
          <div className="history-empty">
            <div className="history-empty-icon" aria-hidden="true">📋</div>
            <p className="history-empty-title">Your sprint archive is ready</p>
            <p className="history-empty-copy">
              Finish a session while signed in and it will appear here automatically. Sprint history is saved when you
              <strong>end a session</strong> or when a room auto-expires after <strong>5 hours</strong>.
            </p>
          </div>
        ) : (
          <>
            <div className="history-insights">
              <div className="hi-card">
                <span className="hi-label">Avg velocity</span>
                <span className="hi-v">{avgVelocity > 0 ? avgVelocity : "—"}</span>
                <span className="hi-unit">pts / sprint</span>
              </div>
              <div className="hi-card">
                <span className="hi-label">Best sprint</span>
                <span className="hi-v">{bestSprint > 0 ? bestSprint : "—"}</span>
                <span className="hi-unit">story pts</span>
              </div>
              <div className="hi-card">
                <span className="hi-label">Team alignment</span>
                <span className="hi-v">{avgConsensus}%</span>
                <span className="hi-unit">avg consensus</span>
              </div>
              <div className="hi-card">
                <span className="hi-label">Velocity trend</span>
                <span className="hi-v" style={trend ? { color: trend.col } : {}}>
                  {trend ? trend.icon : "—"}
                </span>
                <span className="hi-unit">{trend ? trend.label : "need 2+ sprints"}</span>
              </div>
            </div>

            <div className="history-list">
              {history.map((h, i) => {
                const sprintNum = totalSprints - i;
                const label = h.teamName ? h.teamName : `Sprint ${sprintNum}`;
                return (
                  <div className="history-item" key={h.id || i}>
                    <div className="hi-item-left">
                      <span className="hi-sprint-label">{label}</span>
                      <span className="hi-sprint-date">{fmtDate(h.endedAt)}</span>
                    </div>
                    <div className="hi-item-stats">
                      <div className="hi-stat">
                        <span className="hi-stat-val">{h.totalPoints}</span>
                        <span className="hi-stat-key">pts</span>
                      </div>
                      <div className="hi-stat">
                        <span className="hi-stat-val">{h.storiesDone}</span>
                        <span className="hi-stat-key">stories</span>
                      </div>
                      <div className="hi-stat">
                        <span className="hi-stat-val">{h.consensusRate ?? "—"}%</span>
                        <span className="hi-stat-key">consensus</span>
                      </div>
                      {h.startedAt && h.endedAt && (
                        <div className="hi-stat">
                          <span className="hi-stat-val">{fmtDuration(h.startedAt, h.endedAt)}</span>
                          <span className="hi-stat-key">duration</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════ JOIN SCREEN ═══════════════════════ */
function JoinScreen({
  onCreate,
  onJoin,
  onTeamRoom,
  prefillCode,
  prefillTeam,
  currentUser,
  accountProfile,
  proSetupFocusToken = 0,
  startFocusToken = 0,
  onRequireAccount,
  onNavigate,
}) {
  const signedIn = !!currentUser;
  const teamRouteMatch = window.location.pathname.match(/^\/t\/([a-z0-9-]+)$/i);
  const teamQuery = new URLSearchParams(window.location.search).get("team");
  const defaultName = currentUser?.displayName || deriveDisplayNameFallback(currentUser?.email || "");
  const accountDedicatedRooms = resolveDedicatedTeamRooms(accountProfile || {}, currentUser || {});
  const dedicatedRoomOwnerSuffix = deriveDedicatedRoomOwnerSuffix(accountProfile || {}, currentUser || {});
  const dedicatedRoomLabelSeed = deriveDedicatedRoomLabelPrefix(accountProfile || {}, currentUser || {});
  const dedicatedTeamRooms = [
    {
      key: "primary",
      label: "Dedicated Team Room 1",
      shortLabel: "Room 1",
      name: accountDedicatedRooms.primary,
    },
    {
      key: "secondary",
      label: "Dedicated Team Room 2",
      shortLabel: "Room 2",
      name: accountDedicatedRooms.secondary,
    },
  ].map((room) => ({
    ...room,
    code: teamCode(room.name),
    url: `${window.location.origin}${teamRoomPath(room.name)}`,
  }));
  const matchedDedicatedRoomFromRoute = dedicatedTeamRooms.find(
    (room) => room.code === teamRouteMatch?.[1],
  );
  const isSharedTeamRoomEntry = !!prefillTeam && (!!teamRouteMatch || !!teamQuery);
  // Hosting a Team Room needs a free account so the URL slug is unique to you.
  // Joining a Team Room someone shared works for anyone, signed in or not.
  const canHostPermanentTeamRoom = signedIn;
  const canEnterTeamRoom = canHostPermanentTeamRoom || isSharedTeamRoomEntry;
  const nameSeedKey = signedIn ? `${currentUser?.uid || currentUser?.email || ""}:${defaultName}` : "guest";
  // Priority: ?team= → team tab, ?room= → join tab, otherwise → create tab
  const [tab, setTab] = useState(prefillTeam ? "team" : prefillCode ? "join" : (signedIn ? "team" : "create"));
  const [nameDraft, setNameDraft] = useState(signedIn ? defaultName : recallName());
  const [nameEdited, setNameEdited] = useState(false);
  const [role, setRole] = useState("voter");
  const [deck, setDeck] = useState(() => getFounderDefaultDeck(prefillTeam));
  const [estMode, setEstMode] = useState("stories");
  const [rc, setRc] = useState(prefillCode || "");
  const [selectedDedicatedRoomKey, setSelectedDedicatedRoomKey] = useState(
    matchedDedicatedRoomFromRoute?.key || "primary",
  );
  const selectedDedicatedRoom = dedicatedTeamRooms.find((room) => room.key === selectedDedicatedRoomKey) || dedicatedTeamRooms[0];
  const [teamName, setTeamName] = useState(prefillTeam || (signedIn ? selectedDedicatedRoom?.name || "" : ""));
  const [dedicatedRoomLabel, setDedicatedRoomLabel] = useState(dedicatedRoomLabelSeed);
  const [dedicatedRoomLabelDirty, setDedicatedRoomLabelDirty] = useState(false);
  const [savingDedicatedRoomLabel, setSavingDedicatedRoomLabel] = useState(false);
  const [dedicatedRoomLabelStatus, setDedicatedRoomLabelStatus] = useState("");
  const [highlightWorkspaceSetup, setHighlightWorkspaceSetup] = useState(false);
  const [err, setErr] = useState("");
  const [copiedDedicatedRoomKey, setCopiedDedicatedRoomKey] = useState("");
  const teamEntryRef = useRef(null);
  const workspaceRoomEditorRef = useRef(null);
  const workspaceRoomEditorInputRef = useRef(null);
  // No autoFocus here on purpose. It re-fired on every remount and yanked focus
  // out of whatever the person was doing (including out of an open dialog), it
  // pops the keyboard over the page on mobile, and it skips screen-reader users
  // past the content. The name is remembered locally, so the field is usually
  // already filled anyway.
  const nameInputRef = useRef(null);
  const teamUrlCopiedRef = useRef(null);
  const dedicatedRoomLabelStatusRef = useRef(null);
  const autoEnterOwnTeamRoomRef = useRef(false);
  const lastProSetupFocusTokenRef = useRef(0);
  const lastNameSeedKeyRef = useRef(nameSeedKey);
  const lastNameSeedValueRef = useRef(signedIn ? defaultName : recallName());
  const dedicatedRoomLabelSeedKey = signedIn ? `${currentUser?.uid || ""}:${accountDedicatedRooms.primary}:${accountDedicatedRooms.secondary}` : "guest";
  const lastDedicatedRoomLabelSeedRef = useRef(dedicatedRoomLabelSeedKey);
  const nameEditedRef = useRef(false);
  const nameValueRef = useRef(signedIn ? defaultName : recallName());
  const dedicatedRoomPreview = buildDedicatedTeamRoomsFromLabel(
    dedicatedRoomLabel,
    accountProfile || {},
    currentUser || {},
  );
  const dedicatedRoomPreviewUrls = {
    primary: `${window.location.origin}${teamRoomPath(dedicatedRoomPreview.primary)}`,
    secondary: `${window.location.origin}${teamRoomPath(dedicatedRoomPreview.secondary)}`,
  };

  const clearErr = () => setErr("");
  // Live preview of the room code a team name would produce
  const previewCode = teamName.trim() ? teamCode(teamName.trim()) : null;
  const isOwnDedicatedTeamRoom = signedIn && !!previewCode && dedicatedTeamRooms.some((room) => room.code === previewCode);
  const teamPrimaryLabel = !canEnterTeamRoom
    ? "Create a free account for 2 Team Rooms →"
    : isSharedTeamRoomEntry
      ? "Join Team Room →"
      : "Open selected Team Room →";
  const resolveEnteredName = useCallback(
    () => (nameInputRef.current?.value || nameValueRef.current || "").trim(),
    [],
  );
  const validateEnteredName = useCallback(() => {
    const enteredName = resolveEnteredName();
    if (!enteredName) return { ok: false, message: "Please enter your name." };
    if (INVALID_PLACEHOLDER_NAMES.has(enteredName.toLowerCase())) {
      return { ok: false, message: "Please enter your real name before joining." };
    }
    const name = enteredName.slice(0, 40);
    rememberName(name);
    return { ok: true, name };
  }, [resolveEnteredName]);

  const syncEnteredName = useCallback((nextName) => {
    nameValueRef.current = nextName;
    setNameDraft(nextName);
    setNameEdited(true);
    clearErr();
  }, []);

  useEffect(() => {
    nameEditedRef.current = nameEdited;
  }, [nameEdited]);

  useEffect(() => {
    if (lastNameSeedKeyRef.current !== nameSeedKey) {
      const prevSeedKey = lastNameSeedKeyRef.current;
      const prevUserKey = String(prevSeedKey).split(":")[0];
      const nextUserKey = String(nameSeedKey).split(":")[0];
      const currentVisibleName = (nameInputRef.current?.value || nameValueRef.current || "").trim();
      const previousSeedName = lastNameSeedValueRef.current;
      lastNameSeedKeyRef.current = nameSeedKey;
      const nextName = signedIn ? defaultName : "";
      const sameSignedInUser = !!signedIn && prevUserKey && prevUserKey === nextUserKey;
      const preserveCustomName =
        sameSignedInUser &&
        nameEditedRef.current &&
        !!currentVisibleName &&
        currentVisibleName !== previousSeedName;

      if (preserveCustomName) {
        nameValueRef.current = currentVisibleName;
        setNameDraft(currentVisibleName);
      } else {
        setNameEdited(false);
        nameValueRef.current = nextName;
        setNameDraft(nextName);
        if (nameInputRef.current) nameInputRef.current.value = nextName;
      }
      lastNameSeedValueRef.current = preserveCustomName ? currentVisibleName : nextName;
    }
  }, [nameSeedKey, signedIn, defaultName]);

  useEffect(() => {
    if (lastDedicatedRoomLabelSeedRef.current !== dedicatedRoomLabelSeedKey) {
      lastDedicatedRoomLabelSeedRef.current = dedicatedRoomLabelSeedKey;
      setDedicatedRoomLabel(dedicatedRoomLabelSeed);
      setDedicatedRoomLabelDirty(false);
      setDedicatedRoomLabelStatus("");
      clearTimeout(dedicatedRoomLabelStatusRef.current);
    }
  }, [dedicatedRoomLabelSeed, dedicatedRoomLabelSeedKey]);

  useEffect(() => {
    if (!signedIn) {
      if (!isSharedTeamRoomEntry) setTeamName("");
      return;
    }
    if (!prefillTeam && signedIn) setTeamName(selectedDedicatedRoom?.name || "");
  }, [signedIn, prefillTeam, selectedDedicatedRoom?.name, isSharedTeamRoomEntry]);

  useEffect(() => {
    if (signedIn && isSharedTeamRoomEntry && teamQuery && teamName !== teamQuery) {
      setTeamName(teamQuery);
    }
  }, [signedIn, isSharedTeamRoomEntry, teamQuery, teamName]);

  useEffect(() => {
    if (matchedDedicatedRoomFromRoute?.key && matchedDedicatedRoomFromRoute.key !== selectedDedicatedRoomKey) {
      setSelectedDedicatedRoomKey(matchedDedicatedRoomFromRoute.key);
    }
  }, [matchedDedicatedRoomFromRoute?.key, selectedDedicatedRoomKey]);

  const focusTeamEntry = useCallback(() => {
    setTimeout(() => {
      teamEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 40);
  }, []);

  const go = () => {
    const validatedName = validateEnteredName();
    if (!validatedName.ok) { setErr(validatedName.message); return; }
    const enteredName = validatedName.name;
    if (tab === "create") {
      onCreate(enteredName, role, deck, estMode);
    } else if (tab === "join") {
      if (!rc.trim()) { setErr("Please enter a room code"); return; }
      onJoin(enteredName, role, rc.trim().toUpperCase());
    } else {
      // team room — hosting one needs a free account for a unique URL
      if (!canEnterTeamRoom) {
        onRequireAccount?.();
        return;
      }
      if (!teamName.trim()) { setErr("Please enter your team name"); return; }
      onTeamRoom(enteredName, role, teamName.trim(), deck, estMode);
    }
  };

  const saveDedicatedRoomLabel = async () => {
    if (!currentUser?.uid) return;
    const nextLabel = dedicatedRoomLabel.replace(/\s+/g, " ").trim();
    if (!nextLabel) {
      setErr("Choose a name for your dedicated Team Rooms.");
      setDedicatedRoomLabelStatus("error");
      return;
    }
    const nextRooms = buildDedicatedTeamRoomsFromLabel(nextLabel, accountProfile || {}, currentUser || {});
    setSavingDedicatedRoomLabel(true);
    setDedicatedRoomLabelStatus("");
    clearErr();
    clearTimeout(dedicatedRoomLabelStatusRef.current);
    try {
      await update(ref(db, `users/${currentUser.uid}`), {
        email: currentUser.email || accountProfile?.email || "",
        displayName: currentUser.displayName || accountProfile?.displayName || "",
        teamRoomName: nextRooms.primary,
        teamRooms: nextRooms,
        lastLoginAt: Date.now(),
      });
      setDedicatedRoomLabelDirty(false);
      setDedicatedRoomLabelStatus("saved");
    } catch {
      setErr("Could not save your Team Room names right now. Try again.");
      setDedicatedRoomLabelStatus("error");
    } finally {
      setSavingDedicatedRoomLabel(false);
      dedicatedRoomLabelStatusRef.current = setTimeout(() => setDedicatedRoomLabelStatus(""), 2200);
    }
  };

  const ROLES = [
    { r: "voter",    icon: "🃏", l: "Participant", s: "Votes on each story" },
    { r: "observer", icon: "👁", l: "Facilitator", s: "Runs the session and does not vote" },
  ];

  const copyTeamUrl = async (room) => {
    if (!room?.url) return;
    const ok = await copyText(room.url);
    if (!ok) {
      setErr("Your browser blocked the copy. Select the link above and copy it manually.");
      return;
    }
    setCopiedDedicatedRoomKey(room.key);
    clearErr();
    clearTimeout(teamUrlCopiedRef.current);
    teamUrlCopiedRef.current = setTimeout(() => setCopiedDedicatedRoomKey(""), 1600);
  };

  useEffect(() => () => clearTimeout(teamUrlCopiedRef.current), []);
  useEffect(() => () => clearTimeout(dedicatedRoomLabelStatusRef.current), []);
  useEffect(() => {
    if (!signedIn || !proSetupFocusToken) return;
    if (lastProSetupFocusTokenRef.current === proSetupFocusToken) return;
    lastProSetupFocusTokenRef.current = proSetupFocusToken;
    setHighlightWorkspaceSetup(true);
    setTimeout(() => {
      workspaceRoomEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      workspaceRoomEditorInputRef.current?.focus();
    }, 80);
    const timeout = setTimeout(() => setHighlightWorkspaceSetup(false), 2600);
    return () => clearTimeout(timeout);
  }, [signedIn, proSetupFocusToken]);

  useEffect(() => {
    if (autoEnterOwnTeamRoomRef.current) return;
    if (!signedIn || !isSharedTeamRoomEntry) return;
    if (!teamRouteMatch || !matchedDedicatedRoomFromRoute) return;
    const validatedName = validateEnteredName();
    if (!validatedName.ok) return;
    const nextName = validatedName.name;
    autoEnterOwnTeamRoomRef.current = true;
    onTeamRoom(nextName, role, matchedDedicatedRoomFromRoute.name, deck);
  }, [
    signedIn,
    isSharedTeamRoomEntry,
    teamRouteMatch,
    matchedDedicatedRoomFromRoute,
    role,
    deck,
    onTeamRoom,
    validateEnteredName,
  ]);

  return (
    <div className="join-wrap">
      <div className="join-box">

        {/* Decorative chip, visual anchor inside the card */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <BrandMark size={56} label="pointpoker"/>
        </div>

        <h1 className="join-title">
          {signedIn
            ? `Welcome back${defaultName ? `, ${defaultName.split(" ")[0]}` : ""}`
            : "Free Planning Poker for Agile Teams"}
        </h1>
        <p className={`join-sub${signedIn ? " workspace" : ""}`}>
          {signedIn
            ? "Your workspace is ready. Start a room, open one of your two fixed Team Rooms, or join a shared session."
            : "Deal a room, share the link, everyone reveals at once. Every feature is free, and you do not need an account to play."}
        </p>
        {!signedIn && (
          <ul className="trust-strip" aria-label="What you get">
            <li>♠ Free for everyone</li>
            <li>♥ No sign-up to play</li>
            <li>♦ Up to {MAX_PARTICIPANTS} at the table</li>
            <li>♣ No ads</li>
          </ul>
        )}

        {signedIn ? (
          <div className="workspace-shell">
            <div className="workspace-card">
              <div className="workspace-top">
                <div>
                  <div className="workspace-label">Account workspace</div>
                  <div className="workspace-title">Your workspace is ready</div>
                  <p className="workspace-copy">
                    Use either Team Room for recurring sprint planning, or spin up a one-off room when you just need a quick session.
                  </p>
                </div>
                <span className="workspace-pill">Free · everything on</span>
              </div>
            </div>

            <div className="workspace-grid">
              <div className="workspace-stat">
                <span className="workspace-stat-k">Display name</span>
                <span className="workspace-stat-v">{defaultName}</span>
              </div>
              <div className="workspace-stat">
                <span className="workspace-stat-k">Your Team Rooms</span>
                <span className="workspace-stat-v">2 fixed room URLs ready</span>
              </div>
            </div>

            {signedIn ? (
              <div className="workspace-card">
                <div className="workspace-label">Your Team Rooms</div>
                <div className="workspace-title">Two fixed room URLs tied to your account</div>
                <p className="workspace-copy">
                  Every account includes two Team Rooms, free. Share the links once, bookmark them, and keep separate recurring spaces for different squads, products, or ceremonies.
                </p>
                <div
                  ref={workspaceRoomEditorRef}
                  className={`workspace-room-editor${highlightWorkspaceSetup ? " highlight" : ""}`}
                >
                  <div className="workspace-room-editor-top">
                    <div>
                      <div className="workspace-room-editor-title">Choose the shared Team Room name. We add your username automatically.</div>
                      <p className="workspace-inline-note workspace-room-editor-note">
                        Pick the room name your teams will recognise first. We then append your username <strong>{dedicatedRoomOwnerSuffix}</strong> so both fixed URLs stay unique to your account.
                      </p>
                    </div>
                    {dedicatedRoomLabelStatus === "saved" && <span className="workspace-room-editor-badge">Saved</span>}
                  </div>
                  {highlightWorkspaceSetup && (
                    <div className="workspace-setup-callout">
                      <strong>Next step:</strong> choose the two Team Room names you want, save them, then share the fixed URLs below with your squads.
                    </div>
                  )}
                  <div className="workspace-room-editor-row">
                    <input
                      ref={workspaceRoomEditorInputRef}
                      type="text"
                      value={dedicatedRoomLabel}
                      onChange={(e) => {
                        setDedicatedRoomLabel(e.target.value);
                        setDedicatedRoomLabelDirty(true);
                        setDedicatedRoomLabelStatus("");
                        clearErr();
                      }}
                      maxLength={60}
                      placeholder="e.g. Product Planning"
                      aria-label="Dedicated Team Room name"
                    />
                    <button
                      type="button"
                      className="workspace-action-btn"
                      onClick={saveDedicatedRoomLabel}
                      disabled={savingDedicatedRoomLabel || !dedicatedRoomLabelDirty}
                    >
                      {savingDedicatedRoomLabel ? "Saving…" : "Save room names"}
                    </button>
                  </div>
                  <div className="workspace-room-editor-preview">
                    <span><strong>Final Room 1:</strong> {dedicatedRoomPreview.primary}</span>
                    <span><strong>Final Room 2:</strong> {dedicatedRoomPreview.secondary}</span>
                    <span><strong>Final URLs:</strong> {dedicatedRoomPreviewUrls.primary} · {dedicatedRoomPreviewUrls.secondary}</span>
                  </div>
                </div>
                <div className="workspace-room-grid">
                  {dedicatedTeamRooms.map((room) => (
                    <div className="workspace-room-card" key={room.key}>
                      <div className="workspace-room-top">
                        <div>
                          <div className="workspace-room-k">{room.label}</div>
                          <div className="workspace-room-v">{room.name}</div>
                        </div>
                        <span className="workspace-room-chip">{room.shortLabel}</span>
                      </div>
                      <div className="workspace-team-url">
                        <code>{room.url}</code>
                        <button
                          type="button"
                          className={copiedDedicatedRoomKey === room.key ? "copied" : ""}
                          onClick={() => copyTeamUrl(room)}
                        >
                          {copiedDedicatedRoomKey === room.key ? "✓ Invite link copied!" : "Copy link"}
                        </button>
                      </div>
                      <div className="workspace-actions" style={{ marginTop: 12 }}>
                        <button
                          type="button"
                          className="workspace-action-btn gold"
                          onClick={() => {
                            const validatedName = validateEnteredName();
                            if (!validatedName.ok) { setErr(validatedName.message); setTab("team"); focusTeamEntry(); return; }
                            setSelectedDedicatedRoomKey(room.key);
                            onTeamRoom(validatedName.name, role, room.name, deck, estMode);
                          }}
                        >
                          Open {room.shortLabel} →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="workspace-actions" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="workspace-action-btn"
                    onClick={() => {
                      const validatedName = validateEnteredName();
                      if (!validatedName.ok) { setErr(validatedName.message); setTab("create"); return; }
                      onCreate(validatedName.name, role, deck, estMode);
                    }}
                  >
                    Create one-off room
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Three-tab navigation */}
        <div className="tab-row">
          <button
            type="button"
            className={`tab-btn${tab === "create" ? " active" : ""}`}
            aria-pressed={tab === "create"}
            onClick={() => { setTab("create"); clearErr(); }}
          >
            Create Room
          </button>
          <button
            type="button"
            className={`tab-btn${tab === "join" ? " active" : ""}`}
            aria-pressed={tab === "join"}
            onClick={() => { setTab("join"); clearErr(); }}
          >
            Join Room
          </button>
          <button
            type="button"
            className={`tab-btn${tab === "team" ? " active" : ""}`}
            aria-pressed={tab === "team"}
            onClick={() => { setTab("team"); clearErr(); }}
          >
            Team Room
          </button>
        </div>

        {/* Your Name, always shown */}
        <label className="lbl">Your Name</label>
        <input
          key={`name-${nameSeedKey}`}
          ref={nameInputRef}
          className="inp"
          placeholder="e.g. Alex Johnson"
          defaultValue={nameDraft}
          onInput={(e) => syncEnteredName(e.currentTarget.value)}
          onChange={(e) => syncEnteredName(e.target.value)}
          onBlur={(e) => {
            const liveValue = e.currentTarget.value;
            if (liveValue !== nameValueRef.current) syncEnteredName(liveValue);
          }}
          onKeyDown={(e) => e.key === "Enter" && go()}
          aria-invalid={err ? "true" : undefined}
          aria-describedby={err ? "join-error" : undefined}
        />
        {signedIn && (
          <div className="workspace-inline-note">
            {nameEdited
              ? "Using your custom session name for this room. Clear it if you want to go back to your account name."
              : "Prefilled from your account. Change it only if you want to join this session under a different visible name."}
          </div>
        )}

        {/* Join Room: room code input */}
        {tab === "join" && (
          <>
            <label className="lbl">Room Code</label>
            <input
              className="inp"
              placeholder="e.g. A1B2C"
              value={rc}
              onChange={(e) => { setRc(e.target.value.toUpperCase()); clearErr(); }}
              onKeyDown={(e) => e.key === "Enter" && go()}
              maxLength={12}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              style={{ letterSpacing: "0.12em", fontWeight: 600 }}
            />
          </>
        )}

        {/* Team Room: team name input + live code preview */}
        {tab === "team" && (
          <div ref={teamEntryRef}>
            {signedIn && !isSharedTeamRoomEntry && (
              <>
                <label className="lbl">Choose Team Room</label>
                <div className="team-room-choice-row">
                  {dedicatedTeamRooms.map((room) => (
                    <button
                      key={room.key}
                      type="button"
                      className={`team-room-choice-btn${selectedDedicatedRoomKey === room.key ? " active" : ""}`}
                      aria-pressed={selectedDedicatedRoomKey === room.key}
                      onClick={() => {
                        setSelectedDedicatedRoomKey(room.key);
                        setTeamName(room.name);
                        clearErr();
                      }}
                    >
                      <span className="team-room-choice-label">{room.label}</span>
                      <span className="team-room-choice-name">{room.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <label className="lbl">Team Name</label>
            <input
              className="inp"
              placeholder="e.g. Product Team"
              value={teamName}
              onChange={(e) => { setTeamName(e.target.value); clearErr(); }}
              onKeyDown={(e) => e.key === "Enter" && go()}
              readOnly={isSharedTeamRoomEntry || (signedIn)}
            />
            {previewCode && (
              <div className="team-code-preview">
                <span className="tcp-label">Room code</span>
                <span className="tcp-code">{previewCode}</span>
              </div>
            )}
            {!canEnterTeamRoom ? (
              <div className="team-pro-gate">
                <span className="team-pro-gate-text">
                  Team Rooms are free. They need a free account so that nobody else can claim your room URL, which takes about thirty seconds.
                </span>
                <button type="button" className="team-pro-gate-link" onClick={() => onRequireAccount?.()}>
                  Create a free account →
                </button>
              </div>
            ) : isSharedTeamRoomEntry ? (
              <p style={{ fontSize: ".82rem", color: "rgba(239,242,247,.65)", marginBottom: "18px", lineHeight: 1.6 }}>
                This team's room is ready. Add your name, choose your role, and join the live session, no account needed.
              </p>
            ) : (
              <p style={{ fontSize: ".82rem", color: "rgba(239,242,247,.65)", marginBottom: "18px", lineHeight: 1.6 }}>
                {isOwnDedicatedTeamRoom
                  ? "This Team Room is fixed to your account. Keep the link bookmarked and reuse it whenever this team estimates."
                  : "Your account includes two fixed Team Rooms. Pick the one you want, then keep both links bookmarked for recurring sprint planning."}
              </p>
            )}
          </div>
        )}

        {/* Role picker, always shown */}
        <label className="lbl">Your Role</label>
        <div className="role-row">
          {ROLES.map(({ r, icon, l, s }) => (
            <button
              key={r}
              type="button"
              className={`role-btn${role === r ? (r === "voter" ? " rv" : " ro") : ""}`}
              aria-pressed={role === r}
              aria-label={`${l} role: ${s}`}
              onClick={() => setRole(r)}
            >
              <span className="ri">{icon}</span>
              <span className="rl">{l}</span>
              <span className="rs">{s}</span>
            </button>
          ))}
        </div>

        {/* Deck picker, shown on Create and Team tabs */}
        {(tab === "create" || tab === "team") && (
          <>
            <label className="lbl">Card Deck</label>
            <div className="deck-grid">
              {DECK_KEYS.map((k) => {
                const d = DECK_DEFINITIONS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    className={`deck-btn${deck === k ? " active" : ""}`}
                    aria-pressed={deck === k}
                    aria-label={`${d.label} deck: ${d.desc}`}
                    onClick={() => setDeck(k)}
                  >
                    <span className="dk-label">{d.label}</span>
                    <span className="dk-desc">{d.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Estimation mode picker, what is the team estimating? */}
            <label className="lbl">What Are You Estimating?</label>
            <div className="estmode-grid">
              {Object.values(ESTIMATION_MODES).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`estmode-btn${estMode === m.key ? " active" : ""}`}
                  aria-pressed={estMode === m.key}
                  aria-label={`${m.label}: ${m.desc}`}
                  onClick={() => setEstMode(m.key)}
                >
                  <span className="em-label">{m.label}</span>
                  <span className="em-desc">{m.desc}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {err && <div className="err" id="join-error" role="alert">{err}</div>}
        <button className="btn-primary" onClick={go}>
          {tab === "create" ? "Create Room →"
            : tab === "join" ? "Join Room →"
            : teamPrimaryLabel}
        </button>
        {!signedIn && tab === "create" && (
          <p style={{ fontSize: ".78rem", color: "rgba(239,242,247,.7)", textAlign: "center", marginTop: "10px" }}>
            Free · Up to {MAX_PARTICIPANTS} at the table · Live in ten seconds
          </p>
        )}
        {!signedIn && tab === "join" && (
          <p style={{ fontSize: ".78rem", color: "rgba(239,242,247,.7)", textAlign: "center", marginTop: "10px" }}>
            Got a link instead? Open it and you'll join straight away.
          </p>
        )}
        {!signedIn && tab === "team" && (
          <p style={{ fontSize: ".78rem", color: "rgba(239,242,247,.7)", textAlign: "center", marginTop: "10px" }}>
            Two fixed Team Rooms per account. Same links, every sprint, free.
          </p>
        )}
      </div>

      {!signedIn && (
      <section className="seo-section" aria-label="About pointpoker">
        <h2 className="seo-h2">Free Online Planning Poker for Sprint Planning, Scrum Poker, and Remote Estimation</h2>
        <p className="seo-intro">
          pointpoker gives agile teams a fast, low-friction way to run planning poker online. Create a room,
          share one link in Slack, Teams, or Zoom, and let everyone vote at the same time. No install,
          no training, no ads, and no account needed to play.
        </p>
        <p className="seo-intro">
          <strong>Everything is free right now, every feature, for every team.</strong> Other planning poker
          tools cap your free sessions at a handful of votes, seven participants, or hide the timer and averages
          behind a paid plan. Here you get {MAX_PARTICIPANTS} people per room, unlimited voting rounds,
          unlimited stories, all three card decks, the timer, full analytics, and export, for £0. We are
          focused on being genuinely useful to as many teams as possible first. If paid add-ons ever arrive,
          everything listed on this page stays free.
        </p>

        <div className="seo-grid">
          <div className="seo-card">
            <h3 className="seo-h3">Why Simultaneous Reveal Matters</h3>
            <p className="seo-p">
              Every team member votes independently before estimates are shown. Cards reveal all at once,
              which reduces anchoring bias and leads to better story-point conversations. You get clearer
              estimates, faster discussions, and fewer meetings dominated by the loudest voice.
            </p>
          </div>
          <div className="seo-card">
            <h3 className="seo-h3">How It Works</h3>
            <ol className="seo-ol">
              <li>Create a room or join one from a shared link</li>
              <li>Add the item you are estimating, a user story or a specific task within one</li>
              <li>Vote with Fibonacci, T-Shirt sizing, or Powers of 2</li>
              <li>Reveal cards together and discuss only when estimates differ</li>
              <li>Let the facilitator record the final agreed estimate or run another vote</li>
              <li>Move straight to the next item without resetting the room</li>
            </ol>
          </div>
        </div>

        <div className="seo-plan-section scroll-target" id="plans" tabIndex="-1" aria-label="Pricing overview">
          <h3 className="seo-h3">What it costs: nothing</h3>
          <p className="seo-p seo-plan-intro">
            One product, free for every team, while we find out how many of you there are. No tiers, no trial clock, no card.
          </p>
          <div className="seo-plan-grid">
            <article className="seo-plan-card pro">
              <div className="seo-plan-topline">Everyone</div>
              <div className="seo-plan-price">£0</div>
              <ul className="seo-plan-list">
                <li>Up to {MAX_PARTICIPANTS} participants including facilitators</li>
                <li>Unlimited rounds and unlimited stories per session</li>
                <li>All card decks, story or task queue, countdown timer</li>
                <li>Facilitator mode, live analytics, clipboard and CSV export</li>
                <li>Two fixed Team Rooms and sprint history with a free account</li>
              </ul>
            </article>
            <article className="seo-plan-card">
              <div className="seo-plan-topline">Compared with</div>
              <div className="seo-plan-price">£20–30/mo</div>
              <ul className="seo-plan-list">
                <li>Common free caps elsewhere: 7 participants, or 9 votes per game</li>
                <li>Timers and averages often sit behind a paid tier</li>
                <li>Some free tools are ad-supported</li>
                <li>Per-facilitator pricing adds up fast for one ceremony a sprint</li>
              </ul>
            </article>
          </div>
          <div className="seo-plan-actions">
            <RouteLink href="/pricing" onNavigate={onNavigate} className="btn-pricing seo-plan-cta">
              Read the full pricing promise
            </RouteLink>
          </div>
        </div>

          <div className="seo-features">
          <h3 className="seo-h3">What Makes This Planning Poker Tool Different</h3>
          <ul className="seo-ul">
            <li><strong>Zero setup, every time:</strong> create a room and share the link in under 10 seconds, no account needed</li>
            <li><strong>Simultaneous vote reveal:</strong> prevents anchoring bias so every estimate is honest and independent</li>
            <li><strong>Three card decks:</strong> Fibonacci (1 to 34), T-shirt sizing (XS to XXL), or Powers of 2, whichever matches how your team thinks</li>
            <li><strong>Story or task estimation:</strong> choose whether you are sizing user stories as a whole or individual tasks within them; the queue, banners, and analytics all adapt to your choice</li>
            <li><strong>Item queue:</strong> load your full sprint backlog or task list and work through it in order, one item at a time</li>
            <li><strong>Team Alignment analytics:</strong> facilitators see live consensus rate, total story points, estimate distribution, and re-vote patterns</li>
            <li><strong>Estimation Spree:</strong> a live streak counter celebrates when the team aligns consistently, reinforcing good backlog clarity</li>
            <li><strong>Built-in countdown timer:</strong> keep each estimation round time-boxed and the whole session on track</li>
            <li><strong>Session summary:</strong> copy every estimate to the clipboard or download a CSV for Jira, Linear, Azure DevOps, or a spreadsheet</li>
            <li><strong>Facilitator mode:</strong> join without a vote card and manage reveal, re-votes, participant moderation, and session flow from the analytics view</li>
            <li><strong>Team Rooms:</strong> two fixed URLs your teams reuse every sprint, no fresh setup each time. Free with a free account</li>
            <li><strong>Keyboard shortcuts:</strong> press 1–9 to vote, R to reveal, N for the next item; the whole ceremony without touching the mouse</li>
            <li><strong>No ads and no tracking cookies:</strong> nothing to block, nothing sold, nothing following your team around</li>
          </ul>
          <p className="seo-p" style={{ marginTop: 16 }}>
            Explore the dedicated pages for{" "}
            <RouteLink href="/features" onNavigate={onNavigate} className="seo-inline-link">features</RouteLink>
            {", "}
            <RouteLink href="/planning-poker-online" onNavigate={onNavigate} className="seo-inline-link">planning poker online</RouteLink>
            {", "}
            <RouteLink href="/scrum-poker" onNavigate={onNavigate} className="seo-inline-link">Scrum poker</RouteLink>
            {", "}
            <RouteLink href="/story-point-estimation" onNavigate={onNavigate} className="seo-inline-link">story point estimation</RouteLink>
            {", "}
            <RouteLink href="/what-is-planning-poker" onNavigate={onNavigate} className="seo-inline-link">what planning poker is</RouteLink>
            {", "}
            <RouteLink href="/fibonacci-story-points" onNavigate={onNavigate} className="seo-inline-link">Fibonacci story points</RouteLink>
            {", "}
            <RouteLink href="/agile-estimation-tool" onNavigate={onNavigate} className="seo-inline-link">agile estimation tools</RouteLink>
            {", and "}
            <RouteLink href="/trust" onNavigate={onNavigate} className="seo-inline-link">trust and reliability</RouteLink>
            {" to learn how the workflow fits your team."}
          </p>
        </div>

        <div className="seo-divider" role="separator"></div>

        <div className="seo-faq scroll-target" id="faq" tabIndex="-1">
          <h3 className="seo-h3" style={{ textAlign: "center", marginBottom: "20px" }}>Frequently Asked Questions</h3>
          <div className="seo-faq-grid">
            <div className="seo-faq-item">
              <h4 className="seo-h4">Is this planning poker tool actually free?</h4>
              <p className="seo-p">
                Yes, everything, for everyone, right now. Up to {MAX_PARTICIPANTS} participants, unlimited
                voting rounds, unlimited stories, all three card decks, the queue, the countdown timer,
                facilitator analytics, CSV and clipboard export, and two fixed Team Rooms. No credit card,
                no trial clock, no ads. We are concentrating on growing a real user base first; if paid
                add-ons arrive later, everything described here stays free.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">Do I need to create an account?</h4>
              <p className="seo-p">
                No. Enter your name, create a room, share the link, that is the whole flow. A free account
                only exists so we can reserve two permanent Team Room URLs to you (so no other team can land
                in your room) and keep your sprint history across devices.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">Why use Fibonacci numbers for story points?</h4>
              <p className="seo-p">
                Fibonacci (1, 2, 3, 5, 8, 13, 21, 34) reflects how estimation uncertainty grows with
                complexity. The widening gaps between numbers make it easy for teams to distinguish
                small, medium, and large effort without false precision, and force a real conversation
                when two people are far apart. See the{" "}
                <RouteLink href="/fibonacci-story-points" onNavigate={onNavigate} className="seo-inline-link">full Fibonacci guide</RouteLink>
                {" "}for the reasoning in more depth.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">Does this work for remote and distributed teams?</h4>
              <p className="seo-p">
                Yes. Paste the room link into Slack, Teams, or Zoom and everyone joins from any browser in seconds.
                It works across desktop and mobile, and the facilitator can keep the room moving without asking the team to install anything.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">What is the Team Alignment score?</h4>
              <p className="seo-p">
                The Team Alignment score (visible to facilitators) tracks the percentage of stories
                that reached first-round consensus, where every voter picked the same card.
                A high score means your backlog is well-defined. A low score flags stories that
                need more acceptance criteria before the sprint begins.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">How many people can join a planning poker session?</h4>
              <p className="seo-p">
                Up to {MAX_PARTICIPANTS} people per room, counting facilitators as well as voters. That covers
                a large scrum team plus product, design, and QA in the same session. Bigger group? Run two rooms
                in parallel and merge the results.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">How is this different from other free planning poker tools?</h4>
              <p className="seo-p">
                Most free planning poker apps cap something that matters: seven participants, nine votes per
                game, five issues per session, or they show ads and hide the timer and averages behind a paid
                tier. Nothing here is capped or ad-supported. You also get facilitator analytics —
                consensus rate, spread, outlier highlighting, and re-vote tracking, that normally only
                appears in paid tiers.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">What happens to my session data?</h4>
              <p className="seo-p">
                Rooms are temporary. When everyone leaves, the room and its votes are deleted, and any room
                left idle is swept automatically. No advertising or third-party analytics cookies are used.
                Sprint history is only stored if you are signed in, and only for you.
              </p>
            </div>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}

/* ═══════════════════════ WILLINGNESS-TO-PAY POLL ═══════════════════════
   Usage counters can tell you how much a free product is used. They cannot
   tell you what anyone would pay, revealed preference from a free product is
   silent on price. This is the smallest honest instrument that answers it.

   Rules that keep it from being annoying, and keep the data clean:
     • facilitators only (they are the ones who would hold a budget)
     • only after they have actually recorded 3+ estimates (earned the ask)
     • inline in the summary panel, never a modal, never blocking
     • once per browser, ever, answered or dismissed, it does not come back
═══════════════════════════════════════════════════════════════════════ */
const WTP_STORAGE_KEY = "pp_wtp_answered";
const WTP_OPTIONS = [
  { key: "wtp_zero",  label: "Nothing, free is the reason we use it" },
  { key: "wtp_5",     label: "Up to £5 a month for the team" },
  { key: "wtp_15",    label: "£6–15 a month for the team" },
  { key: "wtp_30",    label: "More than £15 a month for the team" },
];

function WtpPoll({ onDone }) {
  const [answered, setAnswered] = useState(false);
  const answer = (key) => {
    track(key);
    try { localStorage.setItem(WTP_STORAGE_KEY, "1"); } catch {}
    setAnswered(true);
    setTimeout(onDone, 2600);
  };
  const dismiss = () => {
    track("wtp_dismissed");
    try { localStorage.setItem(WTP_STORAGE_KEY, "1"); } catch {}
    onDone();
  };

  if (answered) {
    return (
      <div className="wtp-panel" role="status">
        <div className="wtp-thanks">Thank you, that genuinely shapes what gets built next.</div>
      </div>
    );
  }
  return (
    <div className="wtp-panel" role="group" aria-labelledby="wtp-q">
      <button type="button" className="wtp-dismiss" onClick={dismiss} aria-label="Dismiss this question">✕</button>
      <div className="wtp-kicker">One question, then never again</div>
      <div className="wtp-q" id="wtp-q">
        pointpoker is free and staying free. If it were paid, what would this be worth to your team?
      </div>
      <div className="wtp-options">
        {WTP_OPTIONS.map((o) => (
          <button key={o.key} type="button" className="wtp-option" onClick={() => answer(o.key)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="wtp-note">Anonymous. No email, no follow-up, no change to your access.</div>
    </div>
  );
}

/* ═══════════════════════ GAME SCREEN ═══════════════════════ */
function GameScreen({
  rd,
  myId,
  myRole,
  code,
  deck,
  shareUrl,
  onBack,
  onCard,
  onReveal,
  onNewRound,
  onReset,
  onEndSession,
  onStart,
  onStop,
  onRemoveParticipant,
  onAddStory,
  onRemoveStory,
  onRecordStory,
  sessionWarning,
  toast,
}) {
  const cards = getCards(deck);
  const estMode = getEstMode(rd.estimationMode);
  const [tsel, setTsel] = useState(30);
  const [storyInput, setStoryInput] = useState("");
  const [optimisticVote, setOptimisticVote] = useState(null);
  const [finalEstimate, setFinalEstimate] = useState("");
  const [headerLinkCopied, setHeaderLinkCopied] = useState(false);
  const [solobannerDismissed, setSoloBannerDismissed] = useState(false);
  // Confetti fires once per consensus reveal, keyed by round number
  const [showConfetti, setShowConfetti] = useState(false);
  const [showConsensus, setShowConsensus] = useState(false);
  const confettiFiredForRoundRef = useRef(null);
  const copyFeedbackRef = useRef(null);

  const players = Object.values(rd.players || {});
  const voters = players.filter((p) => p.role === "voter");
  const observers = players.filter((p) => p.role === "observer");
  const remoteVote = rd.players?.[myId]?.vote || null;
  const myVote = optimisticVote ?? remoteVote;
  const isObs = myRole === "observer";
  const revealed = rd.revealed || false;
  const round = rd.round || 1;
  const storiesDone = rd.storiesDone || 0;
  const streak = rd.streak || 0;
  const consensusCount = rd.consensusCount || 0;

  // Story queue — derived from Firebase room data
  const stories = rd.stories ? Object.values(rd.stories) : [];
  const activeStoryIdx = rd.activeStory ?? 0;
  // Recorded rounds — estimates persisted by newRound (no-queue path), sorted by index
  const rounds = rd.rounds
    ? Object.entries(rd.rounds).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, v]) => v)
    : [];
  const activeStory = stories[activeStoryIdx] || null;
  const hasStories = stories.length > 0;
  const allStoriesDone = hasStories && activeStoryIdx >= stories.length;
  const timer = rd.timer || { running: false, duration: 30, remaining: 30 };
  const hasVotes = voters.some((p) => p.voted);
  const isPersistentRoom = !!rd.teamName;
  const inviteLabel = isPersistentRoom ? "Dedicated Team Room link" : "Temporary room link";
  const inviteHelper = isPersistentRoom
    ? "Share once and reuse it every sprint."
    : "Share it while this session is active.";
  const votedCount = voters.filter((p) => p.voted).length;
  const notVoted = voters.filter((p) => !p.voted);

  const voted = voters.filter((p) => p.voted);
  const finalEstimateOptions = cards.map((c) => c.val);
  // Filter to numeric-only votes. T-shirt values (XS/S/M/L/XL/XXL) are
  // intentionally excluded — they would produce NaN and corrupt stats.
  const nums = voted
    .map((p) => p.vote)
    .filter((v) => v !== "?" && !isNaN(Number(v)) && v !== "")
    .map(Number);
  const avg = nums.length
    ? nums.reduce((a, b) => a + b, 0) / nums.length
    : null;
  const avgDisp =
    avg !== null ? (Number.isInteger(avg) ? avg : avg.toFixed(1)) : "—";
  // Everyone who voted picked the same card. "?" is excluded on purpose: a room
  // full of "?" means nobody knows, which is the opposite of agreement.
  const allSame =
    new Set(voted.map((p) => p.vote)).size === 1 &&
    voted.length >= 1 &&
    voted[0]?.vote !== "?";
  // "Agreed" for the alignment metric means the whole table voted and matched —
  // not just the two people who happened to click before the facilitator revealed.
  const isFullTableAgreement = allSame && voted.length === voters.length;
  // Only celebrate when there was actually a table to agree with.
  const isRealConsensus = isFullTableAgreement && voters.length > 1;
  const unanimousUnknown =
    voted.length > 0 && voted.every((p) => p.vote === "?");
  const minV = nums.length ? Math.min(...nums) : null;
  const maxV = nums.length ? Math.max(...nums) : null;
  const medianV = nums.length
    ? (() => {
        const s = [...nums].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
      })()
    : null;
  const medianDisp =
    medianV !== null
      ? Number.isInteger(medianV) ? medianV : medianV.toFixed(1)
      : "—";
  const spread = minV !== null && maxV !== null ? maxV - minV : null;
  const consensusEstimate = allSame ? voted[0]?.vote || "" : "";
  const chosenFinalEstimate = allSame ? consensusEstimate : finalEstimate;
  const requiresManualFinalEstimate = revealed && isObs && voted.length > 0 && !allSame;
  const nextItemButtonLabel = "Next item to Estimate";
  const revealedVotesSummary = voted.map((p) => p.vote).join(" • ");
  const revealHeroLabel = allSame ? "Agreed estimate" : "Average vote";
  const revealHeroHelper = allSame
    ? "Everyone who voted picked the same card."
    : unanimousUnknown
      ? "Everyone played ?. Nobody has enough to size this yet, clarify the item, then re-vote."
      : "Use the range below to guide the discussion. The facilitator records the final agreed estimate next.";

  const saveFinalEstimateAndContinue = useCallback(() => {
    if (!chosenFinalEstimate) return;
    if (hasStories && !allStoriesDone) onRecordStory(chosenFinalEstimate, false);
    else onNewRound(chosenFinalEstimate, false);
  }, [chosenFinalEstimate, hasStories, allStoriesDone, onRecordStory, onNewRound]);

  const handleAdvanceToNextItem = useCallback(() => {
    if (!chosenFinalEstimate) return;
    if (hasStories && !allStoriesDone) onRecordStory(chosenFinalEstimate, isFullTableAgreement);
    else onNewRound(chosenFinalEstimate, isFullTableAgreement);
  }, [chosenFinalEstimate, hasStories, allStoriesDone, onRecordStory, onNewRound, isFullTableAgreement]);

  const handleRevoteStory = useCallback(() => {
    onNewRound(null, false);
  }, [onNewRound]);

  useEffect(() => {
    if (!revealed) {
      setFinalEstimate("");
      return;
    }
    if (allSame) {
      setFinalEstimate(consensusEstimate);
      return;
    }
    setFinalEstimate("");
  }, [revealed, allSame, consensusEstimate, round]);

  // Fire confetti + consensus banner exactly once per consensus reveal
  useEffect(() => {
    if (revealed && isRealConsensus && confettiFiredForRoundRef.current !== round) {
      confettiFiredForRoundRef.current = round;
      setShowConfetti(true);
      setShowConsensus(true);
      // Dismiss the overlay banner after 3.5s — confetti handles its own teardown
      const t = setTimeout(() => setShowConsensus(false), 3500);
      return () => clearTimeout(t);
    }
    // Reset when a new round starts
    if (!revealed) {
      setShowConfetti(false);
      setShowConsensus(false);
    }
  }, [revealed, isRealConsensus, round]);

  useEffect(() => {
    if (revealed) {
      setOptimisticVote(null);
      return;
    }
    if (!remoteVote) {
      setOptimisticVote(null);
      return;
    }
    if (optimisticVote === remoteVote) {
      setOptimisticVote(null);
    }
  }, [remoteVote, revealed, optimisticVote]);

  useEffect(() => {
    setOptimisticVote(null);
  }, [round]);

  useEffect(() => () => {
    clearTimeout(copyFeedbackRef.current);
  }, []);

  const handleCopyLink = useCallback(async () => {
    const ok = await copyText(shareUrl);
    track("feature_invite");
    toast(ok ? "🔗 Link copied!" : "Copy blocked by the browser, select the link above and copy it.");
    if (!ok) return;
    setHeaderLinkCopied(true);
    clearTimeout(copyFeedbackRef.current);
    copyFeedbackRef.current = setTimeout(() => {
      setHeaderLinkCopied(false);
    }, 1600);
  }, [shareUrl, toast]);

  // Accepts a single item or a pasted multi-line backlog. Blank lines and
  // common list prefixes ("1. ", "- ", "* ") are stripped so a copied backlog
  // does not arrive with numbering baked into every name.
  const addStoryLines = useCallback((raw) => {
    const names = String(raw)
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
      .filter(Boolean)
      .slice(0, 200);
    if (!names.length) return;
    if (names.length > 1) track("feature_paste");
    onAddStory(names);
    setStoryInput("");
    if (names.length > 1) toast(`✅ ${names.length} ${estMode.plural} added to the queue.`);
  }, [onAddStory, toast, estMode.plural]);

  // ── SESSION SUMMARY ──────────────────────────────────────────────
  // Works whether or not the facilitator used the named queue: queued items
  // keep their names, un-named rounds fall back to "Story 1", "Story 2"…
  const summaryRows = hasStories
    ? stories.map((st) => ({ name: st.name, estimate: st.estimate ?? null }))
    : rounds.map((r, i) => ({
        name: `${estMode.progressLabel} ${i + 1}`,
        estimate: r?.estimate ?? null,
      }));
  const summarySized = summaryRows.filter((r) => r.estimate != null).length;
  const summaryNumeric = summaryRows
    .filter((r) => r.estimate != null && r.estimate !== "")
    .map((r) => Number(r.estimate))
    .filter((n) => Number.isFinite(n));
  const summaryTotalPoints = summaryNumeric.length
    ? summaryNumeric.reduce((a, b) => a + b, 0)
    : null;

  const summaryTitle = rd.teamName ? `${rd.teamName} — estimates` : "Sprint estimation summary";

  // Ask about price only once the facilitator has got real value out of a session.
  const [wtpDone, setWtpDone] = useState(false);
  const wtpAlreadyAnswered = (() => {
    try { return localStorage.getItem(WTP_STORAGE_KEY) === "1"; } catch { return true; }
  })();
  const showWtpPoll = isObs && !wtpDone && !wtpAlreadyAnswered && summarySized >= 3;

  const copySummary = useCallback(async () => {
    const lines = [summaryTitle, "=".repeat(summaryTitle.length), ""];
    summaryRows.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.name}  →  ${r.estimate != null ? r.estimate : "not estimated"}`);
    });
    lines.push("");
    lines.push(`${estMode.plural}: ${summaryRows.length} · estimated: ${summarySized}`);
    if (summaryTotalPoints !== null) lines.push(`Total points: ${summaryTotalPoints}`);
    track("feature_copy");
    const ok = await copyText(lines.join("\n"));
    toast(ok ? "📋 Summary copied to clipboard!" : "Copy blocked by the browser, use the CSV download instead.");
  }, [summaryRows, summarySized, summaryTotalPoints, summaryTitle, estMode.plural, toast]);

  const downloadSummaryCsv = useCallback(() => {
    track("feature_csv");
    const rows = [["#", "Item", "Estimate"]].concat(
      summaryRows.map((r, i) => [String(i + 1), r.name, r.estimate != null ? String(r.estimate) : ""]),
    );
    const csv = rows.map((cols) => cols.map(csvCell).join(",")).join("\r\n");
    // BOM so Excel opens UTF-8 item names correctly
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pointpoker-${(code || "session").toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("⬇ CSV downloaded.");
  }, [summaryRows, code, toast]);

  // ── KEYBOARD SHORTCUTS ───────────────────────────────────────────
  // Numeric decks match on the card's actual value, so "5" plays 5 and not the
  // fifth card. Multi-digit values work through a short buffer: type "13" and
  // the 13 is played. Non-numeric decks (T-shirt) fall back to 1-N by position,
  // which matches how the sizes are ordered on screen.
  // Facilitator: R reveals, N records and moves on. Ignored while typing.
  const numericDeck = cards.some((c) => !isNaN(Number(c.val)) && c.val !== "?");
  const digitBufferRef = useRef({ text: "", at: 0 });
  useEffect(() => {
    const playCard = (val) => {
      setOptimisticVote(val);
      onCard(val);
    };
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const key = e.key.toLowerCase();

      if (!isObs && !revealed) {
        if (key === "?" || key === "/") {
          const wild = cards.find((c) => c.val === "?");
          if (wild) { e.preventDefault(); playCard(wild.val); }
          return;
        }
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          if (!numericDeck) {
            const idx = Number(e.key) - 1;
            if (idx >= 0 && idx < cards.length) playCard(cards[idx].val);
            return;
          }
          const now = performance.now();
          const buf = digitBufferRef.current;
          const next = now - buf.at < 900 ? buf.text + e.key : e.key;
          // Keep the buffer only while it can still grow into a real card.
          const canExtend = cards.some((c) => c.val.startsWith(next) && c.val !== next);
          const exact = cards.find((c) => c.val === next);
          if (exact && !canExtend) {
            digitBufferRef.current = { text: "", at: 0 };
            playCard(exact.val);
            return;
          }
          if (canExtend) {
            digitBufferRef.current = { text: next, at: now };
            if (exact) playCard(exact.val); // provisional; a second digit refines it
            return;
          }
          digitBufferRef.current = { text: "", at: 0 };
          const fresh = cards.find((c) => c.val === e.key);
          if (fresh) playCard(fresh.val);
          return;
        }
      }
      if (isObs && key === "r" && hasVotes && !revealed) { e.preventDefault(); onReveal(); return; }
      if (isObs && key === "n" && revealed && chosenFinalEstimate) { e.preventDefault(); handleAdvanceToNextItem(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isObs, revealed, cards, numericDeck, onCard, onReveal, hasVotes, chosenFinalEstimate, handleAdvanceToNextItem]);

  const prog = timer.running ? timer.remaining / timer.duration : 1;
  const offset = CIRC * (1 - prog);
  const urgent = timer.remaining <= 5;
  const warn = timer.remaining <= 10 && !urgent;
  const ringClr = urgent ? "#e74c3c" : warn ? "#e67e22" : "var(--gold)";

  return (
    <>
      {/* Confetti, mounts when consensus detected, canvas self-destructs when done */}
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} big={isRealConsensus} />}
      {/* Full-screen burst banner, auto-dismisses after 3.5s */}
      {showConsensus && voted.length > 0 && (
        <div className="consensus-overlay" aria-live="polite">
          <div className="consensus-burst">
            <span className="consensus-burst-emoji">🎉</span>
            <div className="consensus-burst-text">Perfect Consensus!</div>
            <div className="consensus-burst-sub">
              All {voted.length} voters picked {voted[0].vote} — the team agrees
            </div>
          </div>
        </div>
      )}
      <header className="hdr" role="banner">
        <div className="hdr-in">
          <div className="hdr-l">
            <button className="btn-back" onClick={onBack} aria-label="Leave room and return to home">
              ← Leave
            </button>
            <BrandMark size={34} onClick={onBack} label="Return to home"/>
          </div>
          <div className="hdr-c">
            <div className="badge">Round {round}</div>
            <div className="badge badge-gold">
              🎲 {storiesDone} <span className="badge-long">{storiesDone === 1 ? estMode.singular : estMode.plural} </span>done
            </div>
            {code && (
              <div className="badge" style={{ fontFamily: "monospace", letterSpacing: ".12em", fontSize: ".66rem" }}>
                {code}
              </div>
            )}
          </div>
          <div className="hdr-r">
            <div className="hdr-invite" aria-label="Invite team">
              <div className="hdr-invite-copy">
                <span className="hdr-invite-label">{inviteLabel}</span>
                <span className="hdr-invite-helper">{inviteHelper}</span>
                <span className="hdr-invite-url">{shareUrl}</span>
              </div>
              <button
                className="btn-sm"
                onClick={handleCopyLink}
                aria-label="Copy invite link to clipboard"
              >
                {headerLinkCopied ? "✓ Invite link copied!" : "🔗 Copy Invite Link"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="game-body">
        {/* Solo invite banner, shown when creator is alone, dismissed once copied or closed */}
        {players.length === 1 && !solobannerDismissed && (
          <div className="solo-invite-banner" role="status">
            <span className="solo-invite-icon">👥</span>
            <div className="solo-invite-body">
              {isPersistentRoom ? (
                <><strong>Team Room ready.</strong> Share the link once. It stays the same every sprint.</>
              ) : (
                <><strong>Room ready.</strong> Share the link to fill the table.</>
              )}
            </div>
            <button
              type="button"
              className="solo-invite-copy"
              onClick={() => { handleCopyLink(); setSoloBannerDismissed(true); }}
            >
              Copy invite link
            </button>
            <button
              type="button"
              className="solo-invite-dismiss"
              aria-label="Dismiss"
              onClick={() => setSoloBannerDismissed(true)}
            >
              ✕
            </button>
          </div>
        )}
        {sessionWarning && (
          <div className="session-warn-banner">
            <span>⚠️</span>
            <div className="session-warn-text">
              <strong>Session ending soon!</strong> Auto-closes in ~10 minutes.
              Please wrap up your current story.
            </div>
          </div>
        )}

        {/* Current item banner, visible to all players */}
        {activeStory && !allStoriesDone && (
          <div className="story-name-banner">
            <span className="story-name-label">
              Now estimating · {estMode.progressLabel} {activeStoryIdx + 1} of {stories.length}
            </span>
            <div className="story-name-text">{activeStory.name}</div>
          </div>
        )}
        {allStoriesDone && (
          <div className="story-name-banner" style={{ borderColor: "rgba(39,174,96,.3)", background: "rgba(39,174,96,.06)" }}>
            <span className="story-name-label" style={{ color: "rgba(39,174,96,.5)" }}>{estMode.backlogLabel}</span>
            <div className="story-name-text" style={{ color: "#2ecc71" }}>All {stories.length} {estMode.plural} estimated ✓</div>
          </div>
        )}

        <div className={`game-grid ${isObs ? "as-facilitator" : "as-voter"}`}>
          {/* LEFT COLUMN */}
          <div className="lcol">
            {/* Timer */}
            <div className="panel panel-gold">
              <span className="ptitle">Estimation Timer <span className="ptitle-optional">optional</span></span>
              {isObs ? (
                <>
                  {!timer.running && !revealed && (
                    <>
                      <div className="tsel-row">
                        <div className="tsel-wrap">
                          <select
                            className="tsel"
                            value={tsel}
                            onChange={(e) => setTsel(+e.target.value)}
                          >
                            <option value={30}>30 seconds</option>
                            <option value={45}>45 seconds</option>
                            <option value={60}>1 minute</option>
                          </select>
                        </div>
                      </div>
                      <button
                        className="start-btn"
                        onClick={() => onStart(tsel)}
                      >
                        <span>🃏</span> Start {tsel === 60 ? "1 min" : `${tsel}s`} countdown
                      </button>
                      <div className="btn-hint">
                        The team can vote without this. Use it if you want to time-box the round.
                      </div>
                    </>
                  )}
                  {timer.running && (
                    <div className={`ring-area${urgent ? " urgent" : ""}`}>
                      <div className="ring-wrap">
                        <svg
                          className="rsv"
                          width="80"
                          height="80"
                          viewBox="0 0 80 80"
                        >
                          <circle className="rt" cx="40" cy="40" r="32" />
                          <circle
                            className="rp"
                            cx="40"
                            cy="40"
                            r="32"
                            strokeDasharray={CIRC}
                            strokeDashoffset={offset}
                            style={{ stroke: ringClr }}
                          />
                        </svg>
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <span className={`rnum${urgent ? " urgent" : ""}`} aria-hidden="true">
                            {timer.remaining}
                          </span>
                          <span className="visually-hidden">
                            {urgent ? `${timer.remaining} seconds left` : ""}
                          </span>
                        </div>
                      </div>
                      <div className="rtxt">
                        <div
                          className={`rstatus${urgent ? " danger" : warn ? " warn" : ""}`}
                        >
                          {urgent
                            ? "Time's almost up!"
                            : warn
                              ? "Wrapping up…"
                              : "Estimating…"}
                        </div>
                        <div className="rhint">Cards auto-reveal on zero</div>
                        <button className="btn-stop" onClick={onStop}>
                          ✕ Stop Timer
                        </button>
                      </div>
                    </div>
                  )}
                  {revealed && (
                    <div className="waiting-hint">
                      {requiresManualFinalEstimate
                        ? "Votes are split, discuss briefly, then confirm the agreed estimate."
                        : "Round complete, use the Next item to Estimate button below when you are ready to continue."}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {timer.running ? (
                    <div className={`ring-area${urgent ? " urgent" : ""}`}>
                      <div className="ring-wrap">
                        <svg
                          className="rsv"
                          width="80"
                          height="80"
                          viewBox="0 0 80 80"
                        >
                          <circle className="rt" cx="40" cy="40" r="32" />
                          <circle
                            className="rp"
                            cx="40"
                            cy="40"
                            r="32"
                            strokeDasharray={CIRC}
                            strokeDashoffset={offset}
                            style={{ stroke: ringClr }}
                          />
                        </svg>
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <span className={`rnum${urgent ? " urgent" : ""}`} aria-hidden="true">
                            {timer.remaining}
                          </span>
                          <span className="visually-hidden">
                            {urgent ? `${timer.remaining} seconds left` : ""}
                          </span>
                        </div>
                      </div>
                      <div className="rtxt">
                        <div
                          className={`rstatus${urgent ? " danger" : warn ? " warn" : ""}`}
                        >
                          {urgent
                            ? "Pick a card, NOW!"
                            : warn
                              ? "Last few seconds!"
                              : "Pick your card!"}
                        </div>
                        <div className="rhint">
                          Facilitator reveals the cards
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="waiting-hint">
                      {revealed
                        ? allSame
                          ? "✓ Cards revealed, consensus reached"
                          : "✓ Cards revealed, review the spread below"
                        : myVote
                          ? "✓ Card played. The cards flip once everyone has voted."
                          : "Play your card whenever you are ready. The timer is optional, and the cards flip once everyone has voted."}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Cards */}
            <div className="panel">
              <span className="ptitle">
                {isObs ? "Your Role" : "Your Estimate"}
              </span>
              {isObs ? (
                <div className="obs-box">
                  <span style={{ fontSize: "1.3rem" }}>👁</span>
                  <span>
                    You're the facilitator. Use the controls below to manage the
                    session.
                  </span>
                </div>
              ) : (
                <div className="cards-grid">
                  {cards.map((c, i) => {
                    const sel = myVote === c.val;
                    return (
                      <button
                        key={c.val}
                        className={`pcard${c.red ? " red" : ""}${c.val === "?" ? " wild" : ""}${sel ? " sel" : ""}${revealed ? " locked" : ""}`}
                        style={{ animationDelay: `${i * 0.055}s` }}
                        type="button"
                        tabIndex={revealed ? -1 : 0}
                        aria-pressed={sel}
                        aria-label={`Vote ${c.val}`}
                        onClick={() => {
                          if (revealed) return;
                          setOptimisticVote(c.val);
                          onCard(c.val);
                        }}
                        onKeyDown={(e) => {
                          if (!revealed && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            setOptimisticVote(c.val);
                            onCard(c.val);
                          }
                        }}
                      >
                        <div className="pcard-inner">
                          <div className="pcard-tl">
                            <span className="pcard-num">{c.val}</span>
                            <span className="pcard-suit-sm">{c.suit}</span>
                          </div>
                          <div className="pcard-center">
                            <span className="pcard-bignum">{c.val}</span>
                            <span className="pcard-bigsuit">{c.suit}</span>
                          </div>
                          <div className="pcard-br">
                            <span className="pcard-num">{c.val}</span>
                            <span className="pcard-suit-sm">{c.suit}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {!isObs && !revealed && (
                <div className="kbd-hint">
                  {numericDeck
                    ? <>Tip: type the value you want. <kbd>3</kbd>, <kbd>8</kbd>, <kbd>13</kbd>, or <kbd>?</kbd> for the wild card.</>
                    : <>Tip: press <kbd>1</kbd>–<kbd>{Math.min(9, cards.length)}</kbd> for the sizes in order, or <kbd>?</kbd>.</>}
                </div>
              )}
              {!isObs && (
                <div
                  className={`vstatus${myVote && !revealed ? " voted" : " wait"}`}
                  style={{ marginTop: 10 }}
                  role="status"
                  aria-live="polite"
                >
                  {revealed
                    ? allSame
                      ? "⏳ Consensus reached, waiting for the facilitator to record the story and move on."
                      : "💬 Cards are revealed, discuss briefly while the facilitator confirms the final estimate or starts another vote."
                    : myVote
                      ? `✓ You picked ${myVote} — waiting for reveal…`
                      : "Pick a card to cast your vote"}
                </div>
              )}
            </div>

            {/* Results */}
            {revealed && (
              <div className="panel panel-gold" role="region" aria-live="polite" aria-label="Vote results">
                {voted.length > 0 && (
                  <>
                    <div className="avg-hero">
                      <div className="avg-hero-label">
                        {revealHeroLabel}
                      </div>
                      <div className="avg-hero-num">{avgDisp}</div>
                      {allSame ? (
                        <div className="avg-hero-consensus">
                          🎉 {isRealConsensus ? `All ${voted.length} voters picked` : "Everyone who voted picked"} {voted[0].vote}
                        </div>
                      ) : (
                        <div className="avg-hero-sub">
                          {revealHeroHelper}
                        </div>
                      )}
                      {!allSame && minV !== null && (
                        <>
                          <div className="avg-hero-range">
                            <div className="avg-hero-stat">
                              <span className="v">{minV}</span>
                              <span className="l">Min</span>
                            </div>
                            <div className="avg-hero-stat">
                              <span className="v" style={{ color: "rgba(239,242,247,.88)", fontSize: "1.4rem" }}>
                                {medianDisp}
                              </span>
                              <span className="l">Median</span>
                            </div>
                            <div className="avg-hero-stat">
                              <span className="v" style={{ color: "var(--gold2)", fontSize: "1.8rem" }}>
                                {avgDisp}
                              </span>
                              <span className="l">Average</span>
                            </div>
                            <div className="avg-hero-stat">
                              <span className="v">{maxV}</span>
                              <span className="l">Max</span>
                            </div>
                          </div>
                          {spread > 0 && (
                            <div style={{ textAlign: "center", marginTop: "10px", fontSize: ".72rem", color: "rgba(239,242,247,.65)", letterSpacing: ".5px" }}>
                              Spread: {spread} point{spread !== 1 ? "s" : ""} — discuss, then record one final deck value
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="who-section">
                      <span className="ptitle">Who Picked What</span>
                    </div>
                    <div className="revealed-grid">
                      {voted.map((p, i) => {
                        const isHigh =
                          !allSame && p.vote === String(maxV) && maxV !== minV;
                        const isLow =
                          !allSame && p.vote === String(minV) && maxV !== minV;
                        const isMe = p.id === myId;
                        const cardClass = allSame
                          ? "consensus"
                          : isHigh
                            ? "outlier-high"
                            : isLow
                              ? "outlier-low"
                              : "";
                        const isRed = ["♥", "♦"].includes(
                          cards.find((c) => c.val === p.vote)?.suit || "",
                        );
                        return (
                          <div
                            key={p.id}
                            className="rv-card"
                            style={{ animationDelay: `${i * 0.07}s` }}
                          >
                            <div className={`rv-card-face ${cardClass}`}>
                              <span className={`rv-val${isRed ? " red" : ""}`}>
                                {p.vote}
                              </span>
                            </div>
                            <div className="rv-name">{p.name}</div>
                            {isMe && <span className="rv-you-tag">you</span>}
                            {isHigh && (
                              <span className="outlier-tag high">Highest</span>
                            )}
                            {isLow && (
                              <span className="outlier-tag low">Lowest</span>
                            )}
                            {allSame && (
                              <span
                                style={{
                                  fontSize: ".6rem",
                                  color: "var(--gold2)",
                                }}
                              >
                                ✓
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {isObs && requiresManualFinalEstimate && (
                      <div className="inline-final-decision" role="group" aria-label="Facilitator choose final estimate">
                        <div className="inline-final-decision-kicker">Facilitator decision</div>
                        <div className="inline-final-decision-title">
                          {unanimousUnknown
                            ? "Nobody could size this one"
                            : "Choose the agreed estimate for this item"}
                        </div>
                        <div className="inline-final-decision-copy">
                          {unanimousUnknown
                            ? "Every voter played ?. That is a signal the item needs clearer acceptance criteria, not a number. Clarify it and re-vote, or record a placeholder and come back to it."
                            : "The votes are mixed. Select the estimate your team agrees to record, then move straight to the next item. The summary above is only for discussion."}
                        </div>
                        <div className="facilitator-overlay-summary inline-final-summary">
                          <div className="facilitator-overlay-summary-card">
                            <span className="facilitator-overlay-summary-k">Votes shown</span>
                            <span className="facilitator-overlay-summary-v">{revealedVotesSummary || "—"}</span>
                          </div>
                          <div className="facilitator-overlay-summary-card">
                            <span className="facilitator-overlay-summary-k">Average</span>
                            <span className="facilitator-overlay-summary-v gold">{avgDisp}</span>
                          </div>
                          <div className="facilitator-overlay-summary-card">
                            <span className="facilitator-overlay-summary-k">Spread</span>
                            <span className="facilitator-overlay-summary-v">
                              {spread !== null ? `${spread} point${spread !== 1 ? "s" : ""}` : "Different votes"}
                            </span>
                          </div>
                        </div>
                        <div className="facilitator-overlay-grid" role="group" aria-label="Choose final estimate">
                          {finalEstimateOptions.map((val) => (
                            <button
                              key={val}
                              type="button"
                              className={`facilitator-overlay-chip${finalEstimate === val ? " active" : ""}`}
                              aria-pressed={finalEstimate === val}
                              onClick={() => setFinalEstimate(val)}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                        <div className="facilitator-overlay-actions inline-final-actions">
                          <button
                            className="btn-record-next btn-next-item-cta"
                            disabled={!chosenFinalEstimate}
                            onClick={saveFinalEstimateAndContinue}
                          >
                            {chosenFinalEstimate
                              ? `Save selected estimate & ${nextItemButtonLabel}`
                              : "Select the agreed estimate to continue"}
                          </button>
                          <button className="facilitator-overlay-revote" type="button" onClick={handleRevoteStory}>
                            ↺ Re-vote this {estMode.singular}
                          </button>
                        </div>
                      </div>
                    )}
                    {isObs && !requiresManualFinalEstimate && (
                      <button
                        className={`btn-record-next btn-next-item-cta${isRealConsensus ? " consensus" : ""}`}
                        disabled={!chosenFinalEstimate}
                        onClick={handleAdvanceToNextItem}
                      >
                        {nextItemButtonLabel}
                      </button>
                    )}

                    {notVoted.length > 0 && (
                      <div className="no-vote">
                        ⚠️ Didn't vote: {notVoted.map((p) => p.name).join(", ")}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Facilitator Controls */}
            {isObs && (
              <div className="obs-controls">
                {revealed && requiresManualFinalEstimate && (
                  <div className="final-estimate-panel">
                    <div className="final-estimate-kicker">Decision required</div>
                    <div className="final-estimate-title">Pick the agreed estimate in the reveal panel, then move to the next item.</div>
                    <div className="final-estimate-copy">
                      The facilitator controls now sit directly under <strong>Who Picked What:</strong> so you can record the team decision without waiting for a popup.
                    </div>
                  </div>
                )}

                {/* Item queue manager */}
                <div className="story-panel">
                  <div className="story-panel-title">📋 {estMode.queueTitle} <span className="story-panel-optional">optional</span></div>
                  <p className="story-panel-hint">
                    {estMode.hintText}
                  </p>
                  <div className="story-add-row">
                    <textarea
                      className="story-inp"
                      placeholder={estMode.placeholder}
                      value={storyInput}
                      rows={1}
                      onChange={(e) => setStoryInput(e.target.value)}
                      onPaste={(e) => {
                        // Paste a whole backlog: one item per line, straight from
                        // Jira, Linear, a spreadsheet column, or a doc.
                        const text = e.clipboardData?.getData("text") || "";
                        if (!text.includes("\n")) return;
                        e.preventDefault();
                        addStoryLines(text);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          addStoryLines(storyInput);
                        }
                      }}
                    />
                    <button
                      className="btn-story-add"
                      disabled={!storyInput.trim()}
                      onClick={() => addStoryLines(storyInput)}
                    >
                      + Add
                    </button>
                  </div>
                  <div className="story-paste-hint">
                    Paste a whole list, one {estMode.singular} per line, and every line gets queued at once.
                  </div>
                  {hasStories && (
                    <>
                      <div className="story-progress">
                        {estMode.progressLabel} {Math.min(activeStoryIdx + 1, stories.length)} of {stories.length}
                        {allStoriesDone ? ` — all ${estMode.plural} estimated!` : ""}
                      </div>
                      <div className="story-list">
                        {stories.map((s, i) => {
                          const state =
                            i < activeStoryIdx ? "done" :
                            i === activeStoryIdx ? "active" : "queued";
                          const isTshirtDeck = deck === "tshirt";
                          return (
                            <div key={i} className={`story-item ${state}`}>
                              <span className="story-item-name">{i + 1}. {s.name}</span>
                              {s.estimate != null && (
                                <span className="story-est">
                                  {s.estimate}{isTshirtDeck ? "" : " pts"}
                                </span>
                              )}
                              {state !== "done" && (
                                <button
                                  type="button"
                                  className="story-item-remove"
                                  aria-label={`Remove ${s.name} from the queue`}
                                  title="Remove from queue"
                                  onClick={() => onRemoveStory?.(i)}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                <button
                  className="btn-reveal-primary"
                  disabled={!hasVotes || revealed}
                  onClick={onReveal}
                >
                  🂠 Reveal Everyone's Cards
                </button>
                {!revealed && (
                  <div className="btn-hint">
                    {voters.length === 0
                      ? "Nobody can vote yet. Share the invite link to fill the table."
                      : hasVotes
                        ? `${votedCount} of ${voters.length} in, reveal now, or press R`
                        : `Waiting for the first card from ${voters.length === 1 ? "your voter" : `your ${voters.length} voters`}…`}
                  </div>
                )}
                {revealed && (
                  <>
                    {requiresManualFinalEstimate ? (
                      <div className="obs-secondary-row">
                        <button
                          className="btn-new-session"
                          onClick={() => {
                            if (window.confirm("Start a new sprint? This clears all votes and rounds for everyone in the room.")) onReset();
                          }}
                        >
                          🔄 New Sprint
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="obs-secondary-row" style={{ marginTop: 8 }}>
                          <button className="btn-next-round" onClick={handleRevoteStory}>
                            ↺ Re-vote this {estMode.singular}
                          </button>
                          <button
                            className="btn-new-session"
                            onClick={() => {
                              if (window.confirm("Start a new sprint? This clears all votes and rounds for everyone in the room.")) onReset();
                            }}
                          >
                            🔄 New Sprint
                          </button>
                        </div>
                        <div className="btn-hint">
                          "Re-vote" keeps the same {estMode.singular} · "New Sprint" resets everything
                        </div>
                      </>
                    )}
                  </>
                )}

                {!revealed && (round > 1 || storiesDone > 0) && (
                  <div className="obs-secondary-row">
                    <button
                      className="btn-new-session"
                      onClick={() => {
                        if (window.confirm("Start a new sprint? This clears all votes and rounds for everyone in the room.")) onReset();
                      }}
                    >
                      🔄 New Sprint
                    </button>
                  </div>
                )}
                <div className="obs-danger-divider"><span>End session</span></div>
                <button
                  className="btn-end-session"
                  onClick={() => {
                    if (window.confirm("End the session? This disconnects everyone and permanently deletes all session data.")) onEndSession();
                  }}
                >
                  🔴 End Session
                </button>
                <div className="end-session-hint">
                  Disconnects everyone and deletes all session data
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div className="rcol">
            {/* Players */}
            <div className="panel">
              <span className="ptitle">At the Table</span>
              {voters.length > 0 && !revealed && (
                <>
                  <div className="vp-head" role="status" aria-live="polite">
                    <span>
                      {votedCount} of {voters.length} voted
                    </span>
                    <span>{voters.length - votedCount} waiting</span>
                  </div>
                  <div className="vp-bar">
                    <div
                      className="vp-fill"
                      style={{
                        width: `${voters.length ? (votedCount / voters.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </>
              )}
              {players.length === 0 && (
                <div className="nobody">Nobody here yet</div>
              )}
              <div className="plist">
                {voters.map((p) => (
                  <div
                    key={p.id}
                    className={`prow${p.voted ? " voted" : " not-voted-yet"}`}
                  >
                    <div className="pav">{ini(p.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pname">
                        {p.name}
                        {p.id === myId ? " (you)" : ""}
                      </div>
                      <div className="prole">
                        {p.voted ? (
                          <span className="voted-label">✓ Voted</span>
                        ) : (
                          <span className="waiting-label">
                            ⏳ Hasn't voted yet
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="prow-actions">
                      {revealed && p.voted ? (
                        <div className="vchip">{p.vote}</div>
                      ) : (
                        <div className={`pdot${p.voted ? " v" : " w"}`} />
                      )}
                      {isObs && p.id !== myId && (
                        <button
                          type="button"
                          className="btn-remove-player"
                          onClick={() => onRemoveParticipant(p.id, p.name)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {observers.length > 0 && voters.length > 0 && (
                  <div className="sep" />
                )}
                {observers.map((p) => (
                  <div key={p.id} className="prow obs">
                    <div className="pav">{ini(p.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pname">
                        {p.name}
                        {p.id === myId ? " (you)" : ""}
                      </div>
                      <div className="prole">Facilitator · No vote</div>
                    </div>
                    <div className="prow-actions">
                      <div className="pdot o" />
                      {isObs && p.id !== myId && (
                        <button
                          type="button"
                          className="btn-remove-player"
                          onClick={() => onRemoveParticipant(p.id, p.name)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sprint Analytics, facilitator only */}
            {isObs && (() => {
              const isTshirt = deck === "tshirt";
              const tshirtOrder = ["XS", "S", "M", "L", "XL", "XXL"];

              // Stories from the named queue that have been recorded
              const sizedQueueStories = stories.filter((s) => s.estimate != null && s.estimate !== "?");

              // Rounds recorded via newRound (no-queue path).
              // T-shirt sessions still save valid deck values here, so keep both the
              // full set for breakdown/counting and the numeric subset for point KPIs.
              const recordedRounds = rounds.filter(
                (r) => r.estimate != null && r.estimate !== "?"
              );
              const numericRounds = recordedRounds.filter(
                (r) => !isNaN(Number(r.estimate))
              );

              // Prefer queue estimates; fall back to rounds (the two paths are mutually exclusive
              // in normal usage — queue path uses recordAndNextStory, no-queue uses newRound)
              const hasQueueData = sizedQueueStories.length > 0;
              const spStories = hasQueueData
                ? sizedQueueStories.filter((s) => !isNaN(Number(s.estimate)))
                : numericRounds;
              const sizedStories = hasQueueData ? sizedQueueStories : recordedRounds;

              // Total and average story points (numeric decks only)
              const totalSP = spStories.reduce((sum, s) => sum + Number(s.estimate), 0);
              const avgSP = spStories.length
                ? Number((totalSP / spStories.length).toFixed(1))
                : null;

              // Team Alignment — % of stories agreed in the first round
              const consensusRate = storiesDone > 0
                ? Math.round((consensusCount / storiesDone) * 100)
                : null;
              const extraRounds = Math.max(0, round - 1 - storiesDone);

              // fillClass: neutral until 2+ stories are done — avoids alarming red for a single-story mismatch
              const fillClass = (consensusRate === null || storiesDone < 2) ? "neutral"
                : consensusRate >= 70 ? "good"
                : consensusRate >= 40 ? "ok" : "low";

              // alignLabel: suppress until meaningful sample size (2+ stories); avoid judgmental "Needs work"
              const alignLabel = (consensusRate === null || storiesDone < 2) ? null
                : consensusRate >= 80 ? "Excellent"
                : consensusRate >= 60 ? "Good"
                : consensusRate >= 40 ? "Fair"
                : "Low consensus";

              const alignSub = consensusRate === null
                ? "Record your first story to start tracking alignment."
                : `${consensusCount} of ${storiesDone} ${storiesDone === 1 ? "story" : "stories"} agreed first vote`
                  + (extraRounds > 0 ? ` · ${extraRounds} re-vote${extraRounds !== 1 ? "s" : ""}` : "");

              // Deck breakdown — frequency map across all sized stories/rounds
              const freqMap = {};
              sizedStories.forEach((s) => {
                freqMap[s.estimate] = (freqMap[s.estimate] || 0) + 1;
              });
              const breakdown = Object.entries(freqMap).sort((a, b) =>
                isTshirt
                  ? tshirtOrder.indexOf(a[0]) - tshirtOrder.indexOf(b[0])
                  : Number(a[0]) - Number(b[0])
              );
              const tshirtBreakdown = isTshirt
                ? tshirtOrder.map((size) => ({ size, count: freqMap[size] || 0 }))
                : [];
              const deckLabel = deck === "fibonacci" ? "Fibonacci"
                : deck === "tshirt" ? "T-Shirt sizes"
                : "Powers of 2";
              const unitLabel = isTshirt ? "" : " sp";

              // Per-item list — queue names when available, fallback to mode label + index
              const listedStories = sizedStories.map((s, i) => ({
                name: s.name && s.name.trim() ? s.name.trim() : `${estMode.progressLabel} ${i + 1}`,
                estimate: s.estimate,
              }));

              const topTshirtEntry = tshirtBreakdown.reduce(
                (best, entry) => (entry.count > best.count ? entry : best),
                { size: "—", count: 0 },
              );
              const tshirtMostCommon = topTshirtEntry.count > 0 ? topTshirtEntry.size : "—";
              const tshirtSizeMix = breakdown.length > 0 ? `${breakdown.length} used` : "—";

              // Sprint scope display
              const scopeDisp = totalSP > 0
                ? `${totalSP} sp`
                : isTshirt && sizedStories.length > 0
                  ? `${sizedStories.length} sized`
                  : "—";
              const avgDisp2 = avgSP !== null ? `${avgSP} sp` : isTshirt ? "—" : "—";

              // Nothing recorded yet: a full empty dashboard pushes the actual
              // controls a screen further down, so show one line instead.
              if (storiesDone === 0 && sizedStories.length === 0) {
                return (
                  <div className="panel">
                    <span className="ptitle">Sprint Analytics</span>
                    <div className="a-empty" style={{ marginTop: 6 }}>
                      Consensus rate, spread, and {estMode.singular} totals appear here after the first recorded estimate.
                    </div>
                  </div>
                );
              }

              return (
                <div className="panel">
                  <span className="ptitle">Sprint Analytics</span>

                  {/* ── Section 1: Sprint Snapshot ── */}
                  <div className="a-kpis">
                    <div className="a-kpi">
                      <span className="a-kpi-v">{storiesDone}</span>
                      <span className="a-kpi-l">{estMode.plural.charAt(0).toUpperCase() + estMode.plural.slice(1)} sized</span>
                    </div>
                    <div className="a-kpi">
                      <span className="a-kpi-v">{isTshirt ? tshirtMostCommon : scopeDisp}</span>
                      <span className="a-kpi-l">{isTshirt ? "Most used size" : "Sprint scope"}</span>
                    </div>
                    <div className="a-kpi">
                      <span className="a-kpi-v">{isTshirt ? tshirtSizeMix : avgDisp2}</span>
                      <span className="a-kpi-l">{isTshirt ? "Size mix" : `Avg / ${estMode.singular}`}</span>
                    </div>
                  </div>

                  {/* ── Section 2: Team Alignment ── */}
                  <div className="a-align">
                    <div className="a-align-head">
                      <span className="a-align-title">Team Alignment</span>
                      {consensusRate !== null && (
                        <span className={`a-align-score ${fillClass}`}>
                          {alignLabel ? `${alignLabel} · ${consensusRate}%` : `${consensusRate}%`}
                        </span>
                      )}
                    </div>
                    <div className="a-align-bar-track">
                      <div
                        className={`a-align-bar-fill ${fillClass}`}
                        style={{ width: `${consensusRate ?? 0}%` }}
                      ></div>
                    </div>
                    <div className="a-align-sub">{alignSub}</div>
                    <div className="a-align-note">% of {estMode.plural} where all voters agreed on the first vote</div>
                  </div>

                  {/* ── Section 3: T-shirt size breakdown ── */}
                  {isTshirt && tshirtBreakdown.length > 0 && (
                    <div className="analytics-size-breakdown">
                      <div className="analytics-breakdown-title">
                        T-Shirt size breakdown
                      </div>
                      <div className="analytics-size-grid">
                        {tshirtBreakdown.map(({ size, count }) => (
                          <div className="analytics-size-card" key={size}>
                            <span className="analytics-size-label">{size}</span>
                            <span className="analytics-size-count">{count}</span>
                            <span className="analytics-size-copy">
                              {count === 1 ? estMode.singular : estMode.plural}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Section 4: Sized this sprint ── */}
                  <div className="a-stories">
                    <div className="a-section-title">
                      {estMode.plural.charAt(0).toUpperCase() + estMode.plural.slice(1)} sized{listedStories.length > 0 ? ` (${listedStories.length})` : ""}
                    </div>
                    {listedStories.length > 0 ? (
                      <div className="a-story-list">
                        {listedStories.map((s, i) => (
                          <div className="a-story-row" key={i}>
                            <span className="a-story-idx">{i + 1}</span>
                            <span className="a-story-name" title={s.name}>{s.name}</span>
                            <span className="a-story-est">{s.estimate}{unitLabel}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="a-empty">
                        {storiesDone > 0
                          ? `Add ${estMode.singular} names to the queue to track estimates here.`
                          : `No ${estMode.plural} sized yet, estimates will appear here after the first round.`}
                      </div>
                    )}
                  </div>

                  {/* ── Section 5: Estimate distribution ── */}
                  {!isTshirt && breakdown.length > 0 && (
                    <div className="analytics-breakdown">
                      <div className="analytics-breakdown-title">
                        {deckLabel} — point distribution
                      </div>
                      <div className="analytics-chips">
                        {breakdown.map(([val, cnt]) => (
                          <div className="analytics-chip" key={val}>
                            <span className="analytics-chip-val">{val}{unitLabel}</span>
                            <span className="analytics-chip-cnt">×{cnt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Estimation Spree, shown when streak ≥ 1, all players saw same consensus */}
            {streak > 0 && (
              <div className={`streak-panel${streak >= 3 ? " streak-hot" : ""}`}>
                <div className="streak-fire">
                  {streak >= 5 ? "🔥🔥🔥" : streak >= 3 ? "🔥🔥" : "🔥"}
                </div>
                <div className="streak-body">
                  <div className="streak-count">
                    {streak === 1
                      ? "Estimation Spree!"
                      : `${streak}-round spree!`}
                  </div>
                  <div className="streak-label">
                    {streak >= 5
                      ? "Unstoppable, team is perfectly aligned 🚀"
                      : streak >= 3
                      ? "Team is locked in, great backlog clarity"
                      : streak === 2
                      ? "Two in a row, team understands the work"
                      : "First consensus, everyone on the same page"}
                  </div>
                </div>
              </div>
            )}

            {/* Session summary, works with or without a named queue */}
            {summaryRows.length > 0 && (
              <div className="panel">
                <span className="ptitle">Sprint Summary</span>
                <div className="summary-rows">
                  {summaryRows.map((row, i) => (
                    <div key={i} className={`summary-row${row.estimate != null ? " sized" : ""}`}>
                      <span className="summary-row-name">{row.name}</span>
                      <span className="summary-row-est">
                        {row.estimate != null ? row.estimate : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="summary-total">
                  {summarySized} of {summaryRows.length} sized
                  {summaryTotalPoints !== null && ` · ${summaryTotalPoints} points total`}
                </div>
                <div className="summary-actions">
                  <button className="btn-inv" onClick={copySummary}>📋 Copy</button>
                  <button className="btn-inv" onClick={downloadSummaryCsv}>⬇ CSV</button>
                </div>
                {showWtpPoll && <WtpPoll onDone={() => setWtpDone(true)} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

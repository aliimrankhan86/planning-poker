import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
/* The design system. Importing it pulls in tokens.css, base.css and
   components.css, which is what makes every --bg / --gold / --text-2 below
   theme-aware: those names are now aliases of semantic roles defined once for
   dark (the default) and once for light. See src/design-system/README.md.

   The screens below are built from these components, not from a second set of
   local ones. Where a class survives in the CSS block further down it is
   layout that only this product has — the room grid, the playing-card face —
   never a re-implementation of something in here. */
import {
  Accordion,
  Alert,
  Avatar,
  Button,
  Card,
  Chip,
  Choice,
  ChoiceGrid,
  ChoiceRow,
  Container,
  EmptyState,
  Eyebrow,
  Grid,
  Hero,
  Icon as DesignSystemIcon,
  IconButton,
  Modal,
  Progress,
  Prose,
  rememberDialogOpener,
  ResultsTable,
  Row,
  Section,
  SectionHead,
  SegmentedControl,
  Select,
  Stack,
  StatTile,
  TextField,
  ThemeToggle,
  Timer,
  Toast,
  ToastRegion,
  VisuallyHidden,
} from "./design-system";
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
import { tally, showNum, teamCode, sprintResetUpdates } from "./estimation";
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
    toastDone: "Story estimated. Vote on the next story.",
    toastNext: "Estimate recorded. Voting on the next story.",
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
    toastDone: "Task estimated. Vote on the next task.",
    toastNext: "Estimate recorded. Voting on the next task.",
    placeholder: "e.g. Build login API, Write unit tests, PROJ-42-1…",
    hintText: "Add tasks to track estimates by name, or just start voting without them. Both work.",
    recordNext: "& Estimate Next Task",
  },
};
const getEstMode = (mode) => ESTIMATION_MODES[mode] || ESTIMATION_MODES.stories;
const INVALID_PLACEHOLDER_NAMES = new Set(["alex johnson", "e.g. alex johnson"]);
const uid = () => Math.random().toString(36).slice(2, 10);
const mkCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const homePath = () => "/";
const roomPath = (code) => `/?room=${encodeURIComponent(code)}`;
const teamRoomPath = (teamNameOrCode) => `/t/${teamCode(teamNameOrCode)}`;
const countParticipants = (players = {}, excludeId = null) =>
  Object.entries(players)
    .filter(([playerId, player]) => !!player && playerId !== excludeId)
    .length;
/* scrollIntoView({behavior:"smooth"}) beats the CSS scroll-behavior:auto that
   the reduced-motion block sets, so the preference has to be read here. */
const scrollBehavior = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
const revealElement = (el, block = "center") =>
  el?.scrollIntoView({ behavior: scrollBehavior(), block });
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

/* ═══════════════════════════ CSS ═══════════════════════════ */
const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* The token block that used to live here now lives in
   src/design-system/tokens.css, which App.js imports at the top of this file.
   It defines the same names — plus the semantic roles the old palette is now
   an alias of — once for dark (the default, on :root) and once for light
   (opt-in, under [data-theme="light"]). Redeclaring any of them here would
   pin the app to one theme, because this <style> tag is rendered from the
   body and therefore wins over the imported stylesheet in <head>. */

/* ════════════════ ROOM ACTION BAR ════════════════
   The single most important change to the room. Before this, the screen
   offered three full-width calls to action stacked vertically: an optional
   timer styled as a glowing hero, the deck, and the actual primary action
   ("Reveal") buried at the bottom in a muted olive that read as disabled.
   Nothing told you where to look, and the one control that moves the
   session forward was the quietest thing on the page.

   Now there is one primary action, it sits in the same place for the whole
   session, and only its label changes: Reveal → Record → Next. That is the
   pattern the market leader uses, and it is the reason their room feels
   simpler than ours despite having fewer features.

   On phones it sticks to the bottom of the viewport, inside the thumb arc,
   which is where the hand already is.
   ═══════════════════════════════════════════════ */
.action-bar {
  /* The card is the design system's; what is local is that this one sticks to
     the top of the column on a desktop and docks to the bottom on a phone. */
  position: sticky; top: var(--sp-3); z-index: var(--z-sticky);
}
.action-bar-title {
  font-size: var(--fs-1);
  font-weight: var(--fw-semi);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}
.action-bar-hint {
  font-size: var(--fs-2);
  line-height: var(--lh-snug);
  color: var(--text-3);
  text-align: center;
}
.pp-progress.is-complete .pp-progress__bar {
  background: linear-gradient(90deg, var(--mint) 0%, var(--success) 100%);
}

@media (max-width: 780px) {
  .action-bar {
    position: sticky;
    top: auto;
    bottom: 0;
    margin: 0 calc(var(--sp-4) * -1) calc(var(--sp-4) * -1);
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    border-bottom: none;
    /* Clear the iOS home indicator so the CTA is never half under it. */
    padding-bottom: max(var(--sp-4), env(safe-area-inset-bottom));
    box-shadow: var(--elev-3);
  }
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
    radial-gradient(circle at top, var(--page-wash-1), transparent 34%),
    radial-gradient(circle at 82% 14%, var(--page-wash-2), transparent 22%),
    var(--page-ground);
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
    radial-gradient(ellipse 80% 55% at 50% 0%, var(--felt-wash-1) 0%, transparent 62%),
    radial-gradient(ellipse 46% 36% at 88% 92%, var(--felt-wash-2) 0%, transparent 58%),
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
  font-size: 2.4rem; font-weight: 700; color: var(--gold-ink2);
  letter-spacing: -0.02em;
  text-shadow: 0 0 40px rgba(201,145,42,.8), 0 4px 20px rgba(0,0,0,.8);
  line-height: 1.1;
}
.consensus-burst-sub {
  font-size: .9rem; color: var(--text-1);
  margin-top: 6px; font-weight: 300; letter-spacing: .5px;
  text-shadow: 0 2px 8px rgba(0,0,0,.9);
}
.facilitator-overlay-summary-v.gold { color: var(--gold-ink2); }
.facilitator-overlay-chip.active {
  border-color: rgba(241,185,63,.56);
  background: linear-gradient(180deg, rgba(241,185,63,.22), rgba(241,185,63,.11));
  color: var(--gold-ink3);
  box-shadow: 0 16px 34px rgba(241,185,63,.14), inset 0 1px 0 rgba(255,255,255,.06);
}

/* ══════════════════════ JOIN SCREEN ══════════════════════ */
/* Edge to edge, like every band. The gutters belong to the containers inside
   it — the form column and the SEO band each carry their own. */
.join-wrap {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  padding: var(--sp-10) 0 var(--sp-20); animation: fadeIn .4s ease; overflow-y: auto;
}
/* Single column by default — the hero reads first, then the form, which is
   the right order on a phone where they cannot share a row. */
.join-layout { max-width: calc(440px + var(--gutter) * 2); }
.join-mark { display: flex; justify-content: center; margin-bottom: var(--sp-5); }

.join-box {
  width: 100%; max-width: 440px;
  background:
    linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0)),
    linear-gradient(155deg, var(--surface) 0%, var(--surface2) 58%, var(--surface3) 100%);
  border: 1px solid var(--border);
  border-radius: 28px;
  padding: 48px 40px 44px;
  box-shadow: 0 44px 110px var(--shadow-cast), inset 0 1px 0 rgba(255,255,255,.06), inset 0 0 0 1px rgba(126,230,255,.04);
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
.join-title {
  font-family: 'Outfit', sans-serif;
  font-size: clamp(1.75rem, 4.4vw, 2.35rem); font-weight: 700;
  color: var(--cream); text-align: center;
  margin-bottom: 4px; letter-spacing: -0.03em; line-height: 1.1;
  text-shadow: 0 12px 32px rgba(0,0,0,.42);
}
.join-sub {
  text-align: center; color: var(--text-2);
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
  font-size: var(--fs-1); font-weight: 500; letter-spacing: var(--fs-1-tracking);
  color: var(--text-2);
  background: rgba(255,255,255,.045);
  border: 1px solid var(--border);
  border-radius: 999px; padding: 5px 11px;
  white-space: nowrap;
}

/* From 1024px the hero and the form sit side by side. The form column stays
   exactly the card it already was; the hero takes the width that was empty
   margin either side.

   This block sits BELOW every rule it overrides, and that placement is
   load-bearing. It used to sit above them, where — at equal specificity —
   the base rules won on source order and seven of these declarations did
   nothing at all: the title stayed centred while the logo went left, which
   is how the hero shipped with its mark and its headline on two different
   axes. src/designsystem.test.js now fails if any min-width override is
   cancelled by a rule written after it. Do not move this block up.

   Note for anyone editing comments in this CSS block: it is a JS template
   literal, so a backtick here ends the string and breaks the build. */
@media (min-width: 1024px) {
  .join-layout {
    /* The one page measure — the hero's first letter lands on the same line as
       the brand in the header above it. */
    max-width: var(--container);
    display: grid;
    /* 480px, not the old 440: raising the type floor widened every option
       label, and at 440 minus 80px of card padding "Powers of 2" and the
       "Create Room" tab both wrapped to two lines. Widen the container rather
       than shrink the type back — the horizontal space is free here. */
    grid-template-columns: minmax(0, 1fr) 480px;
    gap: var(--block-y);
    align-items: center;
  }
  /* 48px of top padding was sized for a card that opened with a logo and a
     headline. Those moved to the hero column; what is left starts with a tab
     row, which does not need that much air above it. */
  .join-box {
    max-width: 480px;
    padding: var(--sp-6) var(--sp-8) var(--sp-8);
    /* The card animates up on load; the hero should not slide independently. */
    animation: none;
  }
  /* The mark, the headline, the subtitle and the trust strip are one column
     of content and share one alignment axis. Whenever that axis moves, all
     four move together — a logo on a different edge to its own headline is
     the first thing the eye catches. */
  .join-hero { text-align: left; }
  .join-mark { justify-content: flex-start; }
  .join-title { text-align: left; font-size: clamp(2.1rem, 3.2vw, 2.75rem); }
  .join-sub { text-align: left; margin-left: 0; max-width: 40ch; }
  .trust-strip { justify-content: flex-start; }
}

/* ══════════════════ SIGNED-IN WORKSPACE ══════════════════
   The signed-in screen is the same two-column shell as the signed-out one, so
   it does not need a second visual language: the column that carried nothing
   but a four-line hero now carries the two Team Rooms, and the form card on
   the right is the same card a signed-out visitor sees.

   What went, and why: an "Account workspace / Your workspace is ready" card
   restating the headline above it, a "Display name" tile restating the Your
   Name field below it, a "2 fixed room URLs ready" tile restating the panel it
   sat on top of, three "Final Room / Final URLs" preview lines restating the
   two room cards under them, and a "Create one-off room" button restating the
   Create tab. Five cards, one fact each, 1,141px of column.
   ═════════════════════════════════════════════════════════ */
/* Stacked, the panel and the form card are two separate regions and need a gap
   between them; side by side they are two columns and do not. */
.join-side + .join-box { margin-top: var(--sp-6); }
.workspace-panel {
  margin-top: var(--sp-6);
  padding: var(--sp-5);
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01));
}
/* Not a .panel, so it carries its own gap — but the same eyebrow gets the same
   gap under it wherever it appears. */
.workspace-panel .ptitle { margin-bottom: var(--sp-3); }
.workspace-room-card { min-width: 0;
}
.workspace-room-name {
  min-width: 0;
  font-family: 'Outfit', sans-serif;
  font-size: var(--fs-3);
  font-weight: var(--fw-semi);
  line-height: var(--lh-snug);
  letter-spacing: -.01em;
  color: var(--text-1);
  overflow-wrap: anywhere;
}
.workspace-team-url {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
  padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3);
  width: 100%;
  min-width: 0;
  border-radius: var(--r-md);
  border: 1px solid rgba(126,230,255,.16);
  background: linear-gradient(180deg, rgba(126,230,255,.08), rgba(241,185,63,.06));
}
.workspace-team-url code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--fs-1);
  letter-spacing: var(--fs-1-tracking);
  line-height: var(--lh-snug);
  color: var(--mint2);
}
/* Wide enough for both labels, so confirming the copy does not shove the URL
   beside it sideways. */
.workspace-team-url .pp-btn { min-width: 112px; flex: none; }
/* Confirmation is a colour change on the control that was pressed, so the
   label and the state cannot end up disagreeing. */

/* Renaming both rooms happens once per account; opening one happens every
   sprint. A native <details> keeps the rare job on the page, keyboard
   reachable, and out of the way of the frequent one. */
.workspace-rename {
  margin-top: var(--sp-4);
  border-top: 1px solid var(--border);
}
.workspace-rename-summary {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: var(--tap-min);
  list-style: none;
  cursor: pointer;
  color: var(--text-2);
  font-size: var(--fs-2);
  font-weight: var(--fw-medium);
  letter-spacing: var(--fs-2-tracking);
  line-height: var(--lh-snug);
}
.workspace-rename-summary::-webkit-details-marker { display: none; }
.workspace-rename-summary::before {
  content: '';
  flex: none;
  width: 7px; height: 7px;
  border-right: 1.75px solid currentColor;
  border-bottom: 1.75px solid currentColor;
  transform: rotate(-45deg);
  transition: transform var(--dur-fast) var(--ease-out);
}
.workspace-rename[open] .workspace-rename-summary::before { transform: rotate(45deg); }
.workspace-rename-summary:hover { color: var(--text-1); }
.workspace-rename-body { padding-bottom: var(--sp-2); }
/* Reserved whether or not it has anything to say: the confirmation must not
   push the panel down as it arrives and pull it back up as it goes. */
.workspace-rename-status {
  min-height: 1.4em;
  margin-top: var(--sp-1);
  color: var(--mint-ink);
  font-size: var(--fs-1);
  letter-spacing: var(--fs-1-tracking);
  line-height: var(--lh-snug);
}
.workspace-rename.highlight {
  border-radius: var(--r-md);
  border: 1px solid rgba(241,185,63,.34);
  padding: 0 var(--sp-3);
  background: linear-gradient(180deg, rgba(241,185,63,.10), rgba(255,255,255,.025));
}
/* Secondary lines inside the form card: one class instead of the same four
   inline declarations written out four times. */
.join-note {
  margin-bottom: var(--sp-5);
  color: var(--text-3);
  font-size: var(--fs-2);
  letter-spacing: var(--fs-2-tracking);
  line-height: var(--lh-body);
}
/* Helper text belongs to the field above it, so the field gives up its own
   bottom margin and the pair carries one gap instead of two. Browsers without
   :has() just leave the looser spacing, which is not a defect. */
.inp:has(+ .join-note) { margin-bottom: var(--sp-2); }
.join-note--centred { text-align: center; margin: var(--sp-3) 0 0; }

@media (max-width: 560px) {
  .workspace-team-url {
    grid-template-columns: 1fr;
    padding: var(--sp-3);
  }
}

@media (min-width: 1024px) {
  /* Signed in, the left column has real content in it, so the two columns
     start on the same line instead of being centred against each other. */
  .join-layout--workspace { align-items: start; }
  .join-side + .join-box { margin-top: 0; }
}
/* ═══════════════════════════════════════════════
   CHOICE — a selectable option in an exclusive group
   ───────────────────────────────────────────────
   The second primitive, after the design system's Button. A button performs
   an action; a .choice
   holds state. Role, deck, estimation mode and the join tabs are all the
   same shape — label, optional description, selected-or-not — and each had
   grown its own class with its own padding, type and hover treatment.

   Selection is styled off [aria-pressed="true"] rather than an .active class
   so the accessible state and the visual state cannot disagree. One accent
   marks selection: the role picker previously used gold for Participant and
   aqua for Facilitator, which made "selected" look like two different things
   on one screen.
   ═══════════════════════════════════════════════ */
.choice {
  flex: 1;
  min-width: 0;
  min-height: var(--tap-min);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-1);
  padding: var(--sp-3) var(--sp-2);
  font-family: 'Outfit', system-ui, sans-serif;
  color: var(--text-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  text-align: center;
  transition:
    background-color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}
.choice:hover:not([aria-pressed="true"]) {
  background: var(--surface2);
  border-color: var(--border2);
  color: var(--text-1);
}
.choice[aria-pressed="true"] {
  background: linear-gradient(180deg, rgba(241,185,63,.16), rgba(241,185,63,.08));
  border-color: rgba(241,185,63,.34);
  color: var(--gold-ink2);
}
.choice[aria-pressed="true"] .choice-desc { color: var(--gold-ink2); }
.choice > svg { flex: none; }

.err { color: var(--danger); font-size: var(--fs-1); margin-bottom: 12px; text-align: center; }
.inp:has(+ .err--field),
.join-note:has(+ .err--field),
.choice-row:has(+ .err--field),
.workspace-room-list:has(+ .err--field) { margin-bottom: var(--sp-2); }
.tcp-code { font-family: monospace; font-size: .9rem; font-weight: 700; color: var(--mint2); letter-spacing: .1em; flex: 1; }

/* Deck and estimation-mode pickers use .choice-grid; see the CHOICE block. */

/* Both are write-once for the life of the room — database.rules.json validates
   them with "newData.val() === data.val()" because every vote is checked
   against the room's deck. Say so where the choice is made. */
.choice-permanence {
  font-size: var(--fs-2);
  line-height: var(--lh-snug);
  color: var(--text-3);
  margin: calc(var(--sp-5) * -1) 0 var(--sp-5);
  padding-top: var(--sp-2);
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
}
.choice-permanence > svg { flex: none; margin-top: 1px; }

/* ── Session options, side by side (variation B) ───────────────────────
   Two irreversible choices kept visible by halving the space they take,
   rather than by hiding one of them. Stacks below 520px, where two columns
   of three options each would put every label on two lines. */
/* Full width, one group per row. These were side by side while the hero ate
   397px above the form and vertical space was the scarce resource; the
   two-column hero removed that pressure, and at 480px the paired columns gave
   each option 58px of content for an 82px label, so "Powers of 2" and "User
   Stories" both wrapped. Matches the bottom margin .choice-permanence pulls
   back against, so the note sits flush under the group it describes. */
.session-grid { display: grid; gap: var(--sp-3); margin-bottom: var(--sp-5); }
.session-field { min-width: 0; }
.session-field .choice-grid { margin-bottom: var(--sp-3); }
.session-summary-cards { color: var(--text-2); font-weight: var(--fw-semi); }
@media (max-width: 520px) {
  .session-grid { grid-template-columns: 1fr; gap: var(--sp-2); }
}

/* ══════════════════════ SEO CONTENT SECTION ══════════════════════ */
/* A band: full width, its own vertical rhythm from .pp-section, its content
   centred by the .pp-container inside it. It sets no width of its own. */
.seo-section { width: 100%; }
.seo-ol, .seo-ul {
  line-height: var(--lh-body); color: var(--text-2);
  margin: 0; padding-left: 1.3em; font-weight: 300;
}
/* Inside a Card, so it takes the card body's size. */
.seo-ol { font-size: var(--fs-2); }
/* A list of sentences is prose: same size, same reading cap, same centred block
   as the paragraph and the heading around it — at 14px its own 68ch resolved
   89px narrower than theirs and the list sat visibly inset between them. Only
   the card grid gets the full band. */
.seo-ul {
  list-style: none; padding-left: 0; font-size: var(--fs-3);
  max-width: var(--measure); margin-inline: auto;
}
.seo-ul li { padding-left: 1.4em; position: relative; margin-bottom: var(--sp-2); }
.seo-ul li::before { content: "♦"; position: absolute; left: 0; color: var(--gold-ink); font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); top: .35em; opacity: .7; }
.seo-ul strong { color: var(--text-1); font-weight: 600; }
.seo-inline-link {
  color: var(--gold-ink2);
  text-decoration: none;
  font-weight: 600;
}
.seo-inline-link:hover { color: var(--gold-ink3); text-decoration: underline; }
.scroll-target { scroll-margin-top: 92px; }
#plans.scroll-target { scroll-margin-top: 72px; }
.seo-plan-card.pro {
  background: linear-gradient(180deg, rgba(241,185,63,.10), rgba(241,185,63,.04));
  border-color: rgba(241,185,63,.22);
}
.seo-plan-card.pro .seo-plan-topline { color: var(--gold-ink2); }
.seo-plan-card.pro .seo-plan-price { color: var(--gold-ink2); }
.seo-plan-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--text-2);
  font-size: .86rem;
  line-height: 1.55;
}
.seo-plan-list li::before {
  content: "✓";
  color: var(--gold-ink2);
  margin-right: 10px;
}
.seo-plan-actions { justify-content: center; }
/* ══════════════════════ ROOM HEADER (game view) ══════════════════════
   Sits below the global NavBar — top: 64px keeps it stacked correctly.
   Full .hdr override is in the new CSS block appended at end of CSS string. */
.hdr {
  background: var(--surface-bar-solid);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(20px);
  position: sticky; top: 64px; z-index: 100;
}
.hdr-in {
  display: flex; align-items: center; justify-content: space-between;
  min-height: 60px; gap: var(--sp-3); flex-wrap: wrap; padding-block: var(--sp-3);
}
.hdr-l { display: flex; align-items: center; gap: 12px; }
.hdr-c { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
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
  font-size: var(--fs-1);
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--text-3);
}
.hdr-invite-helper {
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking);
  color: var(--text-3);
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
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking);
  color: var(--mint2);
}

/* ══════════════════════ LAYOUT ══════════════════════ */
.game-body { padding-block: var(--sp-6) var(--sp-20); }
.game-grid { display: grid; grid-template-columns: 1fr 300px; gap: var(--gap); align-items: start; }
.lcol, .rcol { display: flex; flex-direction: column; gap: var(--gap); }

/* ══════════════════════ PANEL ══════════════════════ */
.panel {
  background:
    linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0)),
    linear-gradient(180deg, var(--surface), var(--surface2));
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: var(--sp-5); backdrop-filter: blur(10px);
  box-shadow: var(--shadow-soft), inset 0 1px 0 rgba(255,255,255,.04);
}
.panel-gold { border-color: rgba(241,185,63,.24); box-shadow: var(--shadow-soft), inset 0 1px 0 rgba(255,255,255,.04), 0 0 0 1px rgba(241,185,63,.04); }
/* A panel owns its vertical rhythm; its children do not bring their own.
   Every block inside one used to declare a margin of its own — 14px from three
   analytics sections, 0 from the timer's button, 24px from a Grid — so the gap
   above a control and the gap below it were never the same number, and the
   Countdown length hint ended up 8px from the select it describes and 0px from
   the button underneath. Three numbers now, largest last: 12 under the panel's
   own eyebrow, 16 between blocks, 20 to the edge. A block that needs more says
   so after this rule (.round-actions). */
.panel > * + * { margin-top: var(--sp-4); }
.panel > .ptitle + * { margin-top: var(--sp-3); }
.ptitle {
  font-size: var(--fs-1); font-weight: 600; letter-spacing: 2.5px;
  text-transform: uppercase; color: var(--text-3);
  display: block;
}
.ring-area {
  display: flex; align-items: center; gap: var(--sp-4);
  padding: var(--sp-4); background: var(--tint-raise);
  border-radius: var(--r-md); border: 1px solid var(--border);
}
.ring-area.urgent { animation: urgentBg 1s ease infinite; }
.rnum.urgent { color: var(--danger); }
.rtxt { flex: 1; }
.rstatus { font-size: var(--fs-1); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: var(--sp-1); color: var(--text-2); }
.rstatus.warn { color: var(--warning); } .rstatus.danger { color: var(--danger); }
.rhint { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-top: var(--sp-1); }
.waiting-hint { font-size: var(--fs-1); color: var(--text-3); font-style: italic; text-align: center; padding: var(--sp-2) 0; }

/* ══════════════════════ PLAYING CARDS ══════════════════════ */
.cards-grid { display: flex; flex-wrap: wrap; gap: var(--sp-3); padding: var(--sp-1) 0; }
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
  box-shadow: 0 2px 0 rgba(255,255,255,.9) inset, 0 10px 28px var(--shadow-card);
  position: relative; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  transition: background .15s;
}
.pcard.sel .pcard-inner {
  background: linear-gradient(160deg, #fffde8 0%, #fff6c0 100%);
  border-color: rgba(201,145,42,.65);
  box-shadow: 0 2px 0 rgba(255,255,255,.9) inset, 0 10px 28px var(--shadow-card), 0 0 0 2.5px rgba(201,145,42,.9);
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
.pcard-num      { font-family: 'Outfit', sans-serif; font-size: .95rem; font-weight: 700; color: var(--text-on-gold); line-height: 1; letter-spacing: -0.02em; }
.pcard-suit-sm  { font-size: var(--fs-1); line-height: 1; margin-top: 2px; }
.pcard-center   { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; }
.pcard-bignum   { font-family: 'Outfit', sans-serif; font-size: 2.6rem; font-weight: 700; line-height: 1; color: var(--text-on-gold); letter-spacing: -0.04em; }
.pcard-bigsuit  { font-size: 1.3rem; line-height: 1; margin-top: 2px; }
/* Colour variants */
.pcard.red .pcard-num,     .pcard.red .pcard-bignum   { color: #b01020; }
.pcard.red .pcard-suit-sm, .pcard.red .pcard-bigsuit  { color: #b01020; }
.pcard:not(.red) .pcard-suit-sm, .pcard:not(.red) .pcard-bigsuit { color: var(--text-on-gold); }
/* Wild (?) card */
.pcard.wild .pcard-bignum  { font-size: 2.2rem; color: #6b3fa0; }
.pcard.wild .pcard-bigsuit { color: #6b3fa0; font-size: 1.1rem; }
.pcard.wild .pcard-num     { color: #6b3fa0; }
.pcard.wild .pcard-suit-sm { color: #6b3fa0; }
.pcard.wild .pcard-inner   { background: linear-gradient(160deg, #fdfaff 0%, #f0e8ff 100%); }
.vstatus { text-align: center; font-size: .82rem; padding: var(--sp-2) 0; }
.vstatus.voted { color: var(--gold-ink); }
.vstatus.wait  { color: var(--text-3); font-style: italic; }

/* ══════════════════════ RESULTS HERO ══════════════════════ */
.avg-hero {
  text-align: center; padding: var(--sp-8) var(--sp-6);
  background: linear-gradient(135deg, rgba(201,145,42,.14), rgba(201,145,42,.04));
  border: 1.5px solid rgba(201,145,42,.4); border-radius: var(--r-lg);
  margin-bottom: var(--sp-5); animation: heroIn .45s ease;
  box-shadow: 0 0 50px rgba(201,145,42,.12), 0 8px 32px rgba(0,0,0,.35);
}
.avg-hero-label {
  font-size: var(--fs-1); font-weight: 600; letter-spacing: 2.5px;
  text-transform: uppercase; color: var(--text-2); margin-bottom: var(--sp-3);
}
.avg-hero-num {
  font-family: 'Outfit', sans-serif;
  font-size: 5.5rem; color: var(--gold-ink2); font-weight: 700;
  line-height: 1; letter-spacing: -0.05em; text-shadow: 0 0 50px rgba(201,145,42,.45);
  animation: heroIn .5s ease;
}
.avg-hero-sub { font-size: var(--fs-1); color: var(--text-2); margin-top: var(--sp-3); }
.avg-hero-consensus {
  display: inline-block; margin-top: var(--sp-4);
  background: rgba(201,145,42,.18); border: 1px solid rgba(201,145,42,.38);
  border-radius: var(--r-full); padding: var(--sp-2) var(--sp-5);
  font-size: .82rem; font-weight: 600; color: var(--gold-ink2);
  animation: badgePop .4s .2s ease both;
}
.avg-hero-stat .v { font-family: 'Outfit', sans-serif; font-size: 1.5rem; color: var(--cream); font-weight: 700; letter-spacing: -0.03em; }
.avg-hero-stat .l { font-size: var(--fs-1); letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-3); }

/* ══════════════════════ WHO PICKED WHAT ══════════════════════ */
.who-section { margin-bottom: var(--sp-2); }
.revealed-grid { display: flex; flex-wrap: wrap; gap: var(--sp-4); justify-content: center; padding: var(--sp-1) 0 var(--sp-4); }
.rv-card { display: flex; flex-direction: column; align-items: center; gap: var(--sp-2); animation: dealIn .4s ease both; }
.rv-card-face {
  width: 70px; height: 96px;
  background: linear-gradient(160deg, #fff 0%, #fdf8ee 100%);
  border-radius: 10px; border: 1px solid rgba(0,0,0,.1);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 18px var(--shadow-card), 0 2px 0 rgba(255,255,255,.9) inset;
}
.rv-card-face.outlier-high { border: 2px solid #e74c3c; box-shadow: 0 6px 18px rgba(231,76,60,.3); }
.rv-card-face.outlier-low  { border: 2px solid #3498db; box-shadow: 0 6px 18px rgba(52,152,219,.3); }
.rv-card-face.consensus    { border: 2px solid var(--gold); box-shadow: 0 6px 18px rgba(201,145,42,.4); }
.rv-val { font-family: 'Outfit', sans-serif; font-size: 2rem; font-weight: 700; color: var(--ink); letter-spacing: -0.04em; }
.rv-val.red { color: #b01020; }
.rv-name { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-2); text-align: center; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.rv-you-tag { font-size: var(--fs-1); color: var(--gold-ink2); font-weight: 700; letter-spacing: .3px; }
.outlier-tag { font-size: var(--fs-1); font-weight: 700; letter-spacing: .5px; text-transform: uppercase; padding: 2px 7px; border-radius: 4px; }
.outlier-tag.high { background: rgba(231,76,60,.18); color: var(--danger); }
.outlier-tag.low  { background: rgba(52,152,219,.18); color: #3498db; }
.no-vote { text-align: center; color: var(--text-3); font-size: var(--fs-1); padding: var(--sp-2) 0; }

/* ══════════════════════ OBSERVER CONTROLS ══════════════════════ */
.obs-controls { display: flex; flex-direction: column; gap: var(--sp-3); }
/* End session sits apart from the session controls but does not announce
   itself with a divider and a caption. Right-aligned and sized down, it reads
   as the exit it is: findable when wanted, not in the way while running a
   meeting. The separator's caption was .52rem — 8.3px, well under the 12px
   floor of the type scale and effectively unreadable. */
.obs-danger-row {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--sp-4);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--border);
}
/* The room's Reveal control moved into RoomActionBar and onto the design
   system's primary Button; the rule that skinned it outlived its call site
   and was carrying a fourth gold gradient nothing rendered. */
.obs-secondary-row { display: flex; gap: var(--sp-2); }
/* When New Sprint is the only button in the row, stretch it full-width */

/* Story queue panel */
.story-panel { background: var(--tint-raise); border: 1px solid var(--border); border-radius: var(--r-md); padding: var(--sp-3) var(--sp-4); margin-bottom: var(--sp-3); }
.story-panel-title { font-size: var(--fs-1); font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--text-3); margin-bottom: var(--sp-1); display: flex; align-items: center; gap: var(--sp-2); }
.ptitle-optional, .story-panel-optional { font-size: var(--fs-1); font-weight: 500; letter-spacing: 1px; text-transform: uppercase; color: var(--gold-ink3); background: rgba(201,145,42,.1); border: 1px solid rgba(201,145,42,.2); border-radius: 20px; padding: 1px 7px; }
.story-panel-hint { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-bottom: var(--sp-3); line-height: 1.5; font-style: italic; }
.story-progress { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-bottom: var(--sp-3); }
.story-add-row { display: flex; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.story-list { max-height: 168px; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-1); }
.story-item { font-size: var(--fs-1); padding: var(--sp-1) var(--sp-2); border-radius: var(--r-xs); display: flex; gap: var(--sp-2); justify-content: space-between; align-items: center; }
.story-item.done { color: var(--text-3); text-decoration: line-through; }
.story-item.active { background: var(--goldB); color: var(--gold-ink2); font-weight: 600; }
.story-item.queued { color: var(--text-2); }
.story-item-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.story-est { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); opacity: .7; flex-shrink: 0; }
.story-item-remove {
  flex-shrink: 0; width: 24px; height: 24px; line-height: 1; /* WCAG 2.5.8 */
  border-radius: 6px; border: 1px solid transparent;
  background: none; color: var(--text-3); cursor: pointer;
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); transition: color .15s, background .15s, border-color .15s;
}
.story-item-remove:hover { color: var(--red); background: rgba(214,72,72,.12); border-color: rgba(214,72,72,.28); }
/* Willingness-to-pay poll */
.wtp-panel { margin-top: var(--sp-4);
}
.wtp-q { font-size: .84rem; color: var(--cream); line-height: 1.45; margin-bottom: var(--sp-3); padding-right: var(--sp-6); }

.kbd-hint {
  margin-top: var(--sp-3); font-size: var(--fs-1); color: var(--text-3);
  text-align: center; letter-spacing: .2px;
}
.kbd-hint kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); padding: 1px 5px; border-radius: 4px;
  background: var(--tint-raise-2); border: 1px solid var(--border2);
  color: var(--text-2);
}
/* Sprint summary */
.summary-row.sized { background: rgba(201,145,42,.06); border-color: rgba(201,145,42,.14); }
.summary-row.sized .summary-row-name { color: var(--cream); }
.summary-row.sized .summary-row-est { color: var(--gold-ink2); }
@keyframes recordGlow { 0%, 100% { box-shadow: 0 12px 28px rgba(75,216,137,.25); } 50% { box-shadow: 0 14px 40px rgba(75,216,137,.60), 0 0 0 5px rgba(75,216,137,.18); } }
/* The one thing the primary button cannot say for itself: the whole table
   agreed, so this is the obvious next press. Glow only — the button keeps its
   own geometry, colour and type. */
.btn-record-next.consensus { animation: recordGlow 2s ease-in-out infinite; }
/* One row, under the estimate, holding every decision a finished round has:
   record, re-vote, new sprint, end session. */
.round-actions {
  --row-gap: var(--sp-2);
  margin-top: var(--sp-5);
  padding-top: var(--sp-4);
  border-top: 1px solid var(--border);
}
/* Record is the decision; the other three are ways out of it. It takes the
   row's slack so the weight matches, and its 15rem basis is what makes the
   row wrap to record-on-its-own-line before the labels start truncating. */
.round-actions .btn-record-next { flex: 1 1 15rem; }
.inline-final-decision { margin-top: var(--sp-5);
}
.inline-final-summary {
  margin-bottom: var(--sp-4);
}
.story-name-banner { margin-bottom: var(--sp-3);
}
.story-name-text { font-size: .9rem; font-weight: 600; color: var(--cream); line-height: 1.3; }

/* ══════════════════════ PLAYERS PANEL ══════════════════════ */
.vp-head { display: flex; justify-content: space-between; font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-bottom: var(--sp-2); }
.vp-bar { margin-bottom: var(--sp-3);
}
.plist { display: flex; flex-direction: column; gap: var(--sp-2); }
.prow {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: var(--sp-3); border-radius: var(--r-sm);
  background: var(--tint-raise-2); border: 1px solid var(--border);
  transition: all .3s;
}
.prow.voted { background: var(--goldB); border-color: rgba(201,145,42,.15); }
.prow.obs   { background: rgba(41,128,185,.07); border-color: rgba(41,128,185,.12); }
.prow.not-voted-yet { border-color: rgba(255,255,255,.04); opacity: .75; }
.prow.not-voted-yet .pav { background: rgba(255,255,255,.10); color: var(--text-2); }
.prow.voted .pav { background: var(--gold); color: var(--ink); }
.prow.obs   .pav { background: rgba(41,128,185,.4); }
.pname { font-size: .84rem; font-weight: 500; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prole { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-top: 1px; }
.prow.obs .prole { color: var(--info); }
.prow-actions { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; }
.pdot.v { background: var(--gold); }
.pdot.w { background: rgba(255,255,255,.12); animation: pulse 2s ease infinite; }
.pdot.o { background: rgba(93,173,226,.35); }
.voted-label { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--gold-ink); font-weight: 600; }
.waiting-label { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--danger); font-style: italic; }
.nobody { font-size: var(--fs-1); color: var(--text-3); font-style: italic; text-align: center; padding: var(--sp-3) 0; }

/* ══════════════════════ SESSION WARNING ══════════════════════ */
.session-warn-banner { margin-bottom: var(--sp-3);
}

/* ══════════════════════ SOLO INVITE BANNER ══════════════════════ */
.solo-invite-banner { margin-bottom: var(--sp-3);
}

/* ══════════════════════ SESSION ANALYTICS ══════════════════════ */
/* Sprint Snapshot — three numbers in a 258px rail.
   As auto-fit tiles they came out two-up with the third orphaned on a row of
   its own, and the 24px grid gap was wider than the 14px gap between the
   panel's sections, so one reading unit sat further apart than the units did.
   Three columns is not the answer either: a 28px value has no room in an 80px
   column, and shrinking the number to fit would be repairing a layout problem
   with typography. Rows, then — the geometry the players list in this same
   rail already uses, so the two panels read as one product. Right-aligned
   tabular values line up in a column, which is the only reason to group three
   KPIs in the first place. */
.a-kpis { display: flex; flex-direction: column; gap: var(--sp-2); }
.a-kpis .pp-stat {
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3);
  padding: var(--sp-3); border-radius: var(--r-sm);
  background: var(--tint-raise-2); border-color: var(--border);
}
.a-kpis .pp-stat__label { letter-spacing: .08em; }
.a-kpis .pp-stat__meta { text-align: right; }
/* One step down from the tile default: the hero number on this screen is the
   agreed estimate, and a 28px KPI in the rail competes with it. */
.a-kpis .pp-stat__value { font-size: var(--fs-5); }

/* Team Alignment */
.a-align-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--sp-2); }
.a-align-score.good    { color: var(--success); }
.a-align-score.ok      { color: var(--gold-ink); }
.a-align-score.low     { color: var(--warning); }   /* amber — coaching signal, not an error */
.a-align-score.neutral { color: var(--text-3); }
.a-align-bar.good .pp-progress__bar    { background: linear-gradient(90deg,#2ecc71,#27ae60); }
.a-align-bar.ok .pp-progress__bar      { background: linear-gradient(90deg,var(--gold),var(--gold2)); }
.a-align-bar.low .pp-progress__bar     { background: linear-gradient(90deg,#e67e22,#d35400); }  /* amber, not red */
.a-align-bar.neutral .pp-progress__bar { background: var(--tint-raise-2); }
.a-align-sub  { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-top: var(--sp-1); line-height: 1.4; }
.a-align-note { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-top: var(--sp-1); font-style: italic; }
/* One sub-heading treatment for every section inside the analytics panel.
   Team Alignment was sentence case at 13px while the two below it were tracked
   uppercase, so a panel with three peer sections announced them three ways. */
.a-section-title,
.a-align-title,
.analytics-breakdown-title {
  font-size: var(--fs-1); font-weight: 500; letter-spacing: .08em; text-transform: uppercase;
  color: var(--text-3);
}
/* Alignment's title sits in a row with the score chip, and that row carries the
   gap for both of them. */
.a-section-title, .analytics-breakdown-title { margin-bottom: var(--sp-2); }
.a-story-list { max-height: 180px; overflow-y: auto; }
.analytics-chip-cnt { color: var(--text-3); font-weight: 300; }

/* ══════════════════════ STREAK / ESTIMATION SPREE ══════════════════════ */
.streak-fire  { font-size: 1.45rem; flex-shrink: 0; line-height: 1; }

/* ══════════════════════ TOAST ══════════════════════ */
.toast {
  position: fixed; bottom: 28px; left: 50%;
  transform: translateX(-50%) translateY(70px);
  background: linear-gradient(135deg, rgba(255,244,202,.98), rgba(255,223,128,.96)); color: var(--ink);
  border-radius: 16px; padding: 12px 22px;
  font-size: .86rem; font-weight: 600;
  box-shadow: 0 20px 50px var(--shadow-cast);
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
  background: var(--surface3); backdrop-filter: blur(18px) saturate(1.2);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 13px 15px;
  box-shadow: 0 18px 42px var(--shadow-card);
  animation: fadeIn .3s ease;
}
@media (max-width: 600px) {
  .cookie-banner { left: 10px; right: 10px; bottom: 10px; max-width: none; }
  .kbd-hint { display: none; }
}

/* ══════════════════════ LOADING ══════════════════════ */
.loading { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px; }
.spinner { width: 34px; height: 34px; border: 3px solid rgba(201,145,42,.18); border-top-color: var(--gold); border-radius: 50%; animation: spin .8s linear infinite; }
.pf-icon.no  { color: var(--text-3); }

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
  .hdr-in { min-height: 52px; padding-block: var(--sp-2); gap: var(--sp-2); flex-wrap: nowrap; }
  .hdr-l .chip-logo { display: none; }
  .hdr-c { order: 0; flex: 1; justify-content: center; gap: 6px; }
  .hdr-c .pp-chip:first-child { display: none; }
  .badge-long { display: none; }
  .hdr-r { order: 0; }
  .hdr-invite { padding: 0; border: none; background: none; gap: 0; }
  .hdr-invite-copy { display: none; }
  .hdr-copy-label { display: none; }
  .hdr-copy { padding-inline: var(--sp-3); }
  .cards-grid { justify-content: center; }
  .pcard { width: 82px; height: 118px; }
  .pcard-bignum { font-size: 2.2rem; }
  .pcard-bigsuit { font-size: 1.1rem; }
  .game-body { padding-block: var(--sp-4) var(--sp-16); }
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
/* WCAG 2.4.11 — a focused element must not be hidden behind the sticky bars. */
:focus-visible { scroll-margin-top: 132px; scroll-margin-bottom: 24px; }
.skip-link {
  position: absolute; left: 12px; top: -60px; z-index: 900;
  display: inline-flex; align-items: center; min-height: var(--tap-min);
  padding: 10px 16px; border-radius: 0 0 10px 10px;
  background: var(--gold2); color: var(--ink);
  font-family: 'Outfit', sans-serif; font-weight: 700; font-size: .82rem;
  text-decoration: none; transition: top .18s;
}
.skip-link:focus { top: 0; }
.navbar {
  background: var(--surface-bar);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  position: sticky; top: 0; z-index: 200;
}
/* Width and gutters come from .pp-container on the inner element — this is the
   band the rest of the product aligns to, so it must not measure itself. */
.navbar-inner {
  display: flex; align-items: center; justify-content: space-between;
  height: 64px; gap: var(--sp-4);
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
.brand-wordmark-poker { color: var(--gold-ink2); }
.navbar-brand:hover .brand-wordmark-point { color: var(--mint2); }
.navbar-brand:hover .brand-wordmark-poker { color: var(--gold-ink3); }
.nav-link-btn {
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--tint-raise);
  color: var(--text-3);
  font-family: 'Outfit', sans-serif;
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all .18s ease;
}
.nav-link-btn:hover {
  color: var(--cream);
  background: var(--tint-raise-2);
  border-color: var(--border2);
}
/* Rule 6. Same trick the design system uses on its own small controls: the
   pill keeps its size, the hit area reaches --tap-min. Vertical only, because
   these sit in a row and horizontal growth would overlap the neighbour. */
.nav-link-btn, .navbar-brand { position: relative; }
.nav-link-btn::after, .navbar-brand::after {
  content: ""; position: absolute; left: 0; right: 0; top: 50%;
  height: var(--tap-min); transform: translateY(-50%);
}

/* Casino chip button */
.chip-logo {
  position: relative;
  background: none; border: none; padding: 0;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; flex-shrink: 0;
  transition: transform .22s ease, filter .22s ease, opacity .22s ease;
}
/* The room header draws the mark at 34px to fit its bar. Rule 6 still applies,
   so the hit area is grown back to the floor without moving the artwork. */
.chip-logo::after {
  content: ""; position: absolute; top: 50%; left: 50%;
  width: var(--tap-min); height: var(--tap-min); transform: translate(-50%, -50%);
}
.chip-logo img {
  width: 100%; height: 100%; object-fit: contain; display: block;
  filter: drop-shadow(0 8px 18px rgba(0,0,0,.28));
}
.chip-logo:hover  { transform: translateY(-1px) scale(1.03); filter: drop-shadow(0 0 14px rgba(241,185,63,.24)); }
.chip-logo:active { transform: translateY(0) scale(1.01); }

/* Nav auth buttons */
/* .nav-btn-login and .nav-btn-register were a parallel button implementation:
   their own padding, their own 12px radius (off the 10/14/20 scale), their own
   .83rem type (a fourth size within 0.3px of --fs-1), their own gold gradient
   distinct from the one the primary Button uses, and a 33px height against
   the system's 44px floor. The visual comes from pp-btn now; these class names
   survive only as hooks for the responsive show/hide rules below, which are
   about navbar layout rather than how a button looks. */

/* ── Sticky game header top already set in the .hdr block above; kept here for reference ── */

/* ══════════════════════ SITE FOOTER ══════════════════════ */
.site-footer {
  background: linear-gradient(180deg, var(--surface-felt), var(--surface-felt));
  border-top: 1px solid var(--border);
  padding: var(--sp-12) 0 0;
  flex-shrink: 0;
}
.footer-inner {
  display: grid; grid-template-columns: 1.6fr 1fr 1fr;
  gap: var(--block-y); padding-bottom: var(--sp-8);
}
.footer-col-brand { display: flex; flex-direction: column; gap: 12px; }
.footer-brand-row { display: flex; align-items: center; gap: 10px; }
.footer-brand-name {
  font-family: 'Outfit', sans-serif;
  font-size: 1.08rem; font-weight: 700; color: var(--cream);
  letter-spacing: -.02em;
}
.footer-brand-desc {
  font-size: var(--fs-1); color: var(--text-3); line-height: 1.65;
  font-weight: 300; max-width: 280px;
}
.footer-col-links { display: flex; flex-direction: column; gap: 2px; }
.footer-col-title {
  font-size: var(--fs-1); font-weight: 700; letter-spacing: 2px;
  text-transform: uppercase; color: var(--text-3);
  margin-bottom: 10px;
}
.footer-link {
  color: var(--text-2); font-size: .83rem; text-decoration: none;
  padding: 5px 0; transition: color .15s;
  background: none; border: none; cursor: pointer;
  font-family: 'Outfit', sans-serif; text-align: left;
  display: inline-block;
}
.footer-link:hover { color: var(--mint2); }
/* Two footer links that are not links: one is a statement of fact, the other
   sits mid-sentence in the legal note. */
.footer-link--static { color: var(--text-3); cursor: default; }
.footer-link--inline { display: inline; padding: 0; text-decoration: underline; font: inherit; }
/* The room code is data, not prose: it wants figures that line up. */
.room-code-chip { font-family: ui-monospace, Menlo, monospace; letter-spacing: .12em; }
.footer-bottom {
  border-top: 1px solid rgba(255,255,255,.06);
  padding-block: var(--sp-5);
  display: flex; align-items: flex-start; justify-content: space-between;
  flex-wrap: wrap; gap: var(--sp-3);
}
.footer-copy {
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); font-weight: 300;
  line-height: 1.5;
}
.footer-legal-note {
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); line-height: 1.6;
  max-width: 480px; text-align: right;
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
.login-modal-chip { display: flex; justify-content: center; margin-bottom: 20px; }
.account-status-label {
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: .08em;
  font-size: var(--fs-1);
  font-weight: 700;
}
.account-status-pill.pro {
  color: var(--gold-ink2);
  border-color: rgba(241,185,63,.30);
  background: rgba(241,185,63,.10);
}
.account-status-copy {
  font-size: var(--fs-1);
  line-height: 1.6;
  color: var(--text-3);
}
.login-mode-hint {
  margin: -2px 0 16px;
  text-align: center;
  font-size: var(--fs-1);
  line-height: 1.5;
  color: var(--gold-ink2);
}
.login-upgrade-note {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--tint-raise);
  color: var(--text-3);
  font-size: var(--fs-1);
  line-height: 1.55;
}
.login-upgrade-note strong {
  color: var(--gold-ink2);
  font-weight: 600;
}
.login-modal-upgrade {
  margin-top: 20px; text-align: center;
  font-size: .82rem; color: var(--text-3);
}
.login-modal-upgrade a {
  color: var(--gold-ink2); text-decoration: none; font-weight: 600;
  border-bottom: 1px solid rgba(201,145,42,.3); transition: border-color .2s;
}
.login-modal-upgrade a:hover { border-bottom-color: var(--gold2); }
.auth-mode-btn.active {
  border-color: rgba(241,185,63,.42); background: linear-gradient(180deg, rgba(241,185,63,.16), rgba(241,185,63,.08)); color: var(--gold-ink2);
}
.auth-status.success { color: var(--success); background: rgba(46,204,113,.08); border: 1px solid rgba(46,204,113,.18); }
.auth-status.error   { color: var(--danger); background: rgba(231,76,60,.06); border: 1px solid rgba(231,76,60,.15); }
.nav-account {
  display: flex; flex-direction: column; align-items: flex-end; gap: 4px; margin-right: 12px;
  min-width: 0;
}
.nav-account-name {
  max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--text-1); font-size: .84rem; font-weight: 500;
}
.nav-account-plan {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12); background: var(--tint-raise-2);
  color: var(--text-3); font-size: var(--fs-1); letter-spacing: .12em; text-transform: uppercase;
}
.nav-account-plan.pro {
  color: var(--gold-ink2); border-color: rgba(201,145,42,.32); background: rgba(201,145,42,.12);
}

/* The navbar CTA used to carry a caption — "No sign-up · No card · No limits"
   — pinned under it with position:absolute. The bar is a hard 64px with no
   horizontal slack, so nothing reserved room for the caption: it was crushed
   to line-height 1, which at 13px gave it a line box 3.5px shorter than its
   own glyphs, and the descenders of "sign-up" crossed the bar's bottom
   border. Five hacks held one line of text in a container that could not
   take it. The bar was the wrong container, and the claim was already made
   better by every page it appeared on — /pricing opens with "no paid tier,
   no trial countdown and no credit card field anywhere". Removed, not
   restyled. */

/* ─── Game upgrade strip — free users only ─── */

/* ─── Footer plan comparison bar ─── */
.footer-plan-bar {
  display: flex; align-items: center; gap: var(--sp-5); flex-wrap: wrap;
  border-bottom: 1px solid rgba(255,255,255,.06);
  padding-block: var(--sp-4);
}
.footer-plan-item { display: flex; align-items: center; gap: 8px; }
.footer-plan-badge.free {
  background: var(--tint-raise-2); color: var(--text-3);
  border: 1px solid rgba(255,255,255,.10);
}
.footer-plan-badge.pro {
  background: rgba(201,145,42,.14); color: var(--gold-ink2);
  border: 1px solid rgba(201,145,42,.28);
}
.footer-plan-text { font-size: var(--fs-1); color: var(--text-3); }
.footer-plan-divider {
  width: 1px; height: 18px; background: var(--tint-raise-2); flex-shrink: 0;
}

/* ══════════════════════ LEGAL PAGES ══════════════════════ */
.legal-page { width: 100%;
}
.legal-back {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 10px;
  border: 1px solid var(--border2); background: var(--tint-raise);
  color: var(--text-2); font-family: 'Outfit', sans-serif;
  font-size: .84rem; font-weight: 500; cursor: pointer;
  transition: all .2s; margin-bottom: 32px;
}
.legal-back:hover { background: var(--tint-raise-2); color: var(--cream); }
.legal-body h2 {
  font-family: 'Outfit', sans-serif; font-size: 1.08rem; font-weight: 600;
  color: var(--cream); letter-spacing: -0.01em; margin: 36px 0 12px;
  padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,.07);
}
.legal-body p, .legal-body li {
  font-size: .88rem; line-height: 1.75; color: var(--text-2);
  margin: 0 0 12px;
}
.legal-body ul {
  padding-left: 20px; margin: 0 0 12px;
}
.legal-body li { margin-bottom: 6px; }
.legal-body strong { color: var(--text-1); font-weight: 600; }
.legal-body a { color: var(--gold-ink2); text-decoration: underline; }
.legal-body a:hover { color: var(--gold-ink3); }
.legal-body code {
  /* .82em of 14px landed at 11.5px, under the 13px floor. A monospace face
     already reads smaller at the same size, so it takes the floor directly. */
  font-family: 'Courier New', monospace; font-size: var(--fs-1);
  background: var(--tint-raise-2); padding: 1px 6px; border-radius: 4px;
}

/* ══════════════════════ MARKETING PAGES ══════════════════════ */
.marketing-page { width: 100%;
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
  color: var(--text-2);
}
.marketing-list li::before {
  content: "♦";
  position: absolute;
  left: 0;
  top: .22rem;
  color: var(--gold-ink2);
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking);
}
.marketing-list strong {
  color: var(--text-1);
  font-weight: 600;
}
.marketing-plan-card.pro {
  background: linear-gradient(180deg, rgba(241,185,63,.10), rgba(241,185,63,.04));
  border-color: rgba(241,185,63,.22);
}
.marketing-plan-card.pro .marketing-plan-topline { color: var(--gold-ink2); }
.marketing-plan-card.pro .marketing-plan-price { color: var(--gold-ink2); }
.marketing-plan-sub {
  margin-top: 6px;
  font-size: .82rem;
  color: var(--text-3);
  line-height: 1.6;
}
@media (max-width: 680px) {
  .marketing-hero,
  .marketing-actions,
  .marketing-stat-grid,
  .marketing-card-grid,
  .marketing-related-grid,
  .marketing-plan-grid { grid-template-columns: 1fr; }
}
.hi-stat-val.gold { color: var(--gold-ink2); }

/* NavBar history button */
/* .nav-btn-history: see the note by .nav-btn-login. Visual comes from pp-btn;
   the name is kept for the authenticated-only display rules. */

@media (max-width: 780px) {
  .history-insights { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 520px) {
  .navbar:not(.authenticated) .nav-btn-history { display: none; }
}

/* ══════════════════════ RESPONSIVE — FOOTER + NAV ══════════════════════ */
@media (max-width: 780px) {
  .footer-inner { grid-template-columns: 1fr 1fr; }
  .footer-col-brand { grid-column: 1 / -1; }
  .navbar-brand { display: none; }
  /* Brand, four marketing links and the call to action need about 750px of bar
     and there is less than that here. The strip was scrollable, so nothing was
     unreachable, but what it rendered was "PRICING" plus half of "SUPPORT"
     sliced down the middle at the container edge, which reads as broken rather
     than as scrollable. Raising the type floor widened each link and made it
     obvious. Every one of these destinations is also in the footer, so the bar
     keeps the brand and the primary action and drops the rest. */
  .navbar-links { display: none; }
  .nav-account-name { max-width: 140px; }
  .footer-plan-bar { gap: 14px; }
  .footer-plan-cta { margin-left: 0; }
}
@media (max-width: 520px) {
  .footer-inner { grid-template-columns: 1fr; }
  .footer-legal-note { text-align: left; max-width: 100%; }
  .navbar-inner { gap: var(--sp-2); }
  .navbar-right { gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  /* Narrow bars buy width by tightening horizontal padding and dropping to the
     small type role. The 44px tap floor from pp-btn is deliberately untouched:
     a phone is where it matters most. */
  .navbar.authenticated .nav-btn-login,
  .navbar.authenticated .nav-btn-history { display: inline-flex; }
  .navbar:not(.authenticated) .nav-btn-login { display: none; }
  .navbar .nav-btn-login,
  .navbar .nav-btn-history,
  .navbar .nav-btn-register {
    padding: var(--sp-2) var(--sp-3);
    font-size: var(--fs-1);
    letter-spacing: var(--fs-1-tracking);
  }
  .nav-link-btn { padding: 6px 10px; font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); }
  .navbar.authenticated .nav-account {
    display: flex;
    margin-right: 0;
    align-items: flex-end;
    gap: 3px;
  }
  .navbar.authenticated .nav-account-name { max-width: 104px; font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); }
  .navbar.authenticated .nav-account-plan { font-size: var(--fs-1); padding: 3px 8px; letter-spacing: .1em; }
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
.dash-wrap { padding-block: var(--sp-8) var(--sp-20); }
.dash-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; margin-bottom: 22px; }
.dash-back { background: none; border: none; color: var(--gold-ink2); font-family: 'Outfit', sans-serif; font-size: var(--fs-1); cursor: pointer; padding: 0 0 8px; }
.dash-head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dash-window-btn.active { background: var(--goldB); color: var(--gold-ink2); font-weight: 600; }
.dash-panel { min-width: 0;
}
.dash-panel.wide { grid-column: 1 / -1; }
.dash-bars { display: flex; flex-direction: column; gap: 7px; }
.dash-bar-row { display: grid; grid-template-columns: minmax(84px, 1.1fr) 3fr minmax(74px, auto); align-items: center; gap: 10px; }
.dash-bar-label { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-2); }
.dash-bar-value { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--cream); text-align: right; font-variant-numeric: tabular-nums; }
.dash-bar-value em { font-style: normal; color: var(--text-3); margin-left: 6px; font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); }
.dash-trend { margin-bottom: 16px; }
.dash-trend-head { display: flex; justify-content: space-between; font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-bottom: 7px; }
.dash-trend-max { color: var(--text-3); }
.dash-trend-plot { display: flex; align-items: flex-end; gap: 2px; height: 76px; padding: 0 1px; }
.dash-trend-col { flex: 1; min-width: 2px; border-radius: 2px 2px 0 0; background: linear-gradient(180deg, var(--gold3) 0%, var(--gold) 100%); }
.dash-trend-col.zero { background: var(--tint-raise-2); }
.dash-trend-axis { display: flex; justify-content: space-between; font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-top: 5px; }
.dash-calc.strong span { color: var(--gold-ink2); font-size: 1.5rem; }
.dash-dismissed { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); }
.dash-foot { margin-top: 22px; font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); line-height: 1.6; }
.dash-gate { max-width: 520px; margin: 60px auto;
}
@media (max-width: 900px) {
}
@media (max-width: 520px) {
  .dash-wrap { padding-block: var(--sp-5) var(--sp-16); }
  .dash-bar-row { grid-template-columns: minmax(70px, 1fr) 2fr auto; gap: 8px; }
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

// Removes players whose socket dropped over an hour ago, from one room, by the
// clients still sitting in it.
//
// This used to live inside sweepStaleRooms, where it shared a single atomic
// multi-path update with the whole-room deletes. Firebase rejects an update
// containing both `rooms/X` and `rooms/X/players/Y` — an expired room with an
// away player produced exactly that pair, the SDK threw before sending
// anything, the bare catch swallowed it, and the entire sweep silently did
// nothing. Keeping the two scopes apart makes that collision unrepresentable.
async function sweepAwayPlayers(code, players) {
  const now = Date.now();
  const gone = Object.entries(players || {}).filter(([, p]) => {
    const at = Number(p?.disconnectedAt || 0);
    return at > 0 && now - at > PLAYER_AWAY_TIMEOUT_MS;
  });
  if (!gone.length) return 0;
  try {
    await update(
      ref(db, `rooms/${code}/players`),
      Object.fromEntries(gone.map(([id]) => [id, null])),
    );
    return gone.length;
  } catch {
    return 0;
  }
}

// ── WHY THERE IS NO CLIENT-SIDE ROOM SWEEPER ─────────────────────
// There used to be a sweepStaleRooms() here, called on every visit to the join
// screen. It could never have worked, for three separate reasons:
//
//   1. It read /rooms to list every room. No client may read /rooms — room
//      codes are the only thing protecting a session, so an enumerable room
//      list would hand every live session to anyone who asked. The read was
//      denied every single time and a bare catch swallowed it.
//   2. It built one atomic update holding both `rooms/X` and
//      `rooms/X/players/Y`. Firebase rejects a multi-path update containing a
//      path and its own descendant, so the SDK threw before sending anything.
//   3. It wrote plan:"pro" when resetting a team room, which the rules reject.
//
// Reaping orphaned rooms needs to enumerate them, and nothing that runs in a
// browser should be able to. It belongs to the admin SDK: see reapStaleRooms
// in functions/index.js. What clients can safely do, they still do — a room's
// own occupants end it at five hours (SESSION EXPIRY CHECK below) and remove
// players who have been away for an hour (sweepAwayPlayers above).

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

/* The icon set lives in the design system — one stroke family, one file. This
   wrapper exists only to keep the `.icon` inline-alignment rule the legacy
   containers in this file still rely on; it is not a second Icon. */
const Icon = (props) => <DesignSystemIcon className="icon" {...props} />;

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
  /* On the join screen the form is already on the page, and this control only
     scrolls to it and focuses the name field. Ranking it as a second gold
     primary alongside "Create Room" would give one screen two loudest things
     and mis-state which one completes the task. Elsewhere it is the only call
     to action in the bar, so it keeps the primary treatment. */
  onJoinScreen = false,
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
      <div className="navbar-inner pp-container">
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
          {/* Dark is the default and stays the default; this is the only way to
              leave it, and the choice is remembered. It sits before the account
              controls so it never competes with the one primary action. */}
          <ThemeToggle size="sm" />
          {currentUser ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="nav-btn-history"
                onClick={onHistory}
                aria-label="View sprint history"
              >
                <Icon name="chart" /> History
              </Button>
              <div className="nav-account" aria-label="Signed-in account">
                <span className="nav-account-name">{accountLabel}</span>
                <span className="nav-account-plan">Free</span>
              </div>
              {onAdmin && (
                <IconButton icon="chart" size="sm" label="Usage dashboard" onClick={onAdmin} />
              )}
              <Button variant="ghost" size="sm" className="nav-btn-login" onClick={onLogout}>Sign out</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="nav-btn-login" onClick={onLogin}>Sign in</Button>
              {!inRoom && (
                <Button
                  variant={onJoinScreen ? "secondary" : "primary"}
                  size="sm"
                  className="nav-btn-register"
                  onClick={onStartFree}
                >
                  Start a free room
                </Button>
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
      <div className="footer-plan-bar pp-container">
        <div className="footer-plan-item">
          <Chip tone="gold">$0</Chip>
          <span className="footer-plan-text">
            Every feature, every team, no card. Up to {MAX_PARTICIPANTS} people per room, unlimited rounds, unlimited stories, no ads.
          </span>
        </div>
        <div className="footer-plan-divider" aria-hidden="true" />
        <div className="footer-plan-item">
          <Chip tone="on-felt">Later</Chip>
          <span className="footer-plan-text">
            Paid add-ons may arrive once the tool has a real user base. Everything listed here stays free.
          </span>
        </div>
      </div>

      <div className="footer-inner pp-container">

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
              <span className="footer-link footer-link--static">Workspace active · Free</span>
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
      <div className="footer-bottom pp-container">
        <div className="footer-copy">
          © {year} pointpoker. All rights reserved.
          Registered in England &amp; Wales.
        </div>
        <div className="footer-legal-note">
          pointpoker is provided "as-is" without warranty of any kind.
          Use is subject to our{" "}
          <button className="footer-link footer-link--inline" onClick={onNavTerms}>Terms of Service</button>
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

  /* The account funnel divides completed registrations by this event, so it has
     to count register intent and nothing else. It used to fire from the navbar
     Sign in button, which counted every returning user and every reopen of the
     dialog, while the two paths that open it to register never fired it at all.
     Keying on the mode covers both ways in: opening straight into register, and
     switching to it here. The ref stops StrictMode's second effect pass from
     counting the same intent twice. */
  const signupStartTracked = useRef(false);
  useEffect(() => {
    if (mode !== "register" || signupStartTracked.current) return;
    signupStartTracked.current = true;
    track("signup_started");
  }, [mode]);

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

  /* Every one of these used to be a bare coloured line of text on the modal
     ground. Rule 5: a message needs a surface of its own, or it is the first
     thing the eye skips. */
  const statusAlert = authError
    ? { tone: "danger", text: authError }
    : authStatus === "ok" && mode !== "register"
      ? { tone: "success", text: "Signed in." }
      : authStatus === "verify"
        ? { tone: "success", text: `Account created. Check ${registerSuccess?.email || "your email"} to verify your address.` }
        : authStatus === "verify_resent"
          ? { tone: "success", text: `Verification email resent to ${registerSuccess?.email || "your inbox"}.` }
          : authStatus === "verify_error"
            ? { tone: "warning", text: "Account created, but we could not send the verification email yet. Use resend below." }
            : authStatus === "reset"
              ? { tone: "success", text: "Password reset email sent." }
              : null;

  return (
    <Modal open title={title} subtitle={subtitle} onClose={onClose} className="login-modal">
      <Stack>
        <div className="login-modal-chip">
          <BrandMark size={52} label="pointpoker" />
        </div>

        <Card variant="flat" pad="sm">
          {currentUser ? (
            <Stack gap="sm">
              <Row between>
                <span className="account-status-label">Signed in as</span>
                <strong>{currentUser.displayName || currentUser.email || "Current account"}</strong>
              </Row>
              <Row between>
                <span className="account-status-label">Plan</span>
                <Chip tone="gold">Free, everything unlocked</Chip>
              </Row>
            </Stack>
          ) : (
            <p className="account-status-copy">
              You never need an account to run a room. Create one if you want two permanent Team Room links and sprint history that follows you across devices.
            </p>
          )}
        </Card>
        <p className="login-mode-hint">{modeHint}</p>

        {showAuthForm && (
          <>
            <SegmentedControl
              block
              ariaLabel="What you want to do"
              value={mode}
              onChange={(next) => { setMode(next); resetMessages(); }}
              options={[
                { value: "signin", label: "Sign in" },
                { value: "register", label: "Create account" },
                { value: "reset", label: "Reset password" },
              ]}
            />

            {mode === "register" && (
              <TextField
                id="auth-name"
                label="Full name"
                placeholder="Alex Johnson"
                value={nameInput}
                onChange={(e) => { setNameInput(e.target.value); resetMessages(); }}
                maxLength={40}
                autoComplete="name"
                data-autofocus
              />
            )}

            <TextField
              id="auth-email"
              label={mode === "reset" ? "Account email" : "Email"}
              type="email"
              placeholder="you@company.com"
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); resetMessages(); }}
              autoComplete="email"
              {...(mode !== "register" ? { "data-autofocus": true } : {})}
            />

            {mode !== "reset" && (
              <TextField
                id="auth-password"
                label="Password"
                type="password"
                placeholder={mode === "register" ? "Minimum 6 characters" : "Your password"}
                value={passInput}
                onChange={(e) => { setPassInput(e.target.value); resetMessages(); }}
                onKeyDown={(e) => e.key === "Enter" && (mode === "register" ? handleRegister() : handleSignIn())}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
            )}

            {statusAlert && <Alert tone={statusAlert.tone}>{statusAlert.text}</Alert>}

            {mode === "signin" && (
              <Button variant="primary" block onClick={handleSignIn} disabled={authStatus === "loading"}>
                {authStatus === "loading" ? "Signing in…" : "Sign in"}
              </Button>
            )}
            {mode === "register" && !registerComplete && (
              <Button variant="primary" block onClick={handleRegister} disabled={authStatus === "loading"}>
                {authStatus === "loading" ? "Creating account…" : teamRoomIntent ? "Create account & claim my Team Rooms" : "Create free account"}
              </Button>
            )}
            {mode === "register" && registerComplete && (
              <>
                <Button variant="primary" block onClick={handleRegisterContinue}>
                  {teamRoomIntent ? "Continue to my Team Rooms" : "Continue to workspace"}
                </Button>
                <Button
                  variant="ghost"
                  block
                  onClick={handleResendVerification}
                  disabled={authStatus === "verify_resending"}
                >
                  {authStatus === "verify_resending" ? "Sending verification…" : "Resend verification email"}
                </Button>
              </>
            )}
            {mode === "reset" && (
              <Button variant="primary" block onClick={handleReset} disabled={authStatus === "loading"}>
                {authStatus === "loading" ? "Sending reset…" : "Send reset link"}
              </Button>
            )}
          </>
        )}

        {showSignedInAccount && (
          <>
            <Card variant="flat" pad="sm">
              <strong>{currentUser.displayName || "Signed in"}</strong>
              <span className="account-status-copy">{currentUser.email}</span>
            </Card>

            {statusAlert && <Alert tone={statusAlert.tone}>{statusAlert.text}</Alert>}

            {!currentUser?.emailVerified && (
              <Alert
                tone="warning"
                title="Your email address is not verified yet"
                actions={
                  <Button
                    size="sm"
                    onClick={handleResendVerification}
                    disabled={authStatus === "verify_resending"}
                  >
                    {authStatus === "verify_resending" ? "Sending verification…" : "Resend verification email"}
                  </Button>
                }
              >
                Resend the verification email if you still need it.
              </Alert>
            )}

            <Button block onClick={handleSignedInReset} disabled={authStatus === "loading"}>
              {authStatus === "loading" ? "Sending reset…" : "Send password reset email"}
            </Button>
          </>
        )}

        <Card
          variant="gold"
          pad="sm"
          title={currentUser ? "What this account gives you" : "What an account adds"}
          footer={
            currentUser ? null : (
              <span className="login-upgrade-note">
                <strong>Everything else is already free without an account.</strong> Rooms, all card decks,{" "}
                {MAX_PARTICIPANTS} participants, the queue, timer, analytics, and export work for anyone with the link.
              </span>
            )
          }
        >
          {currentUser
            ? "Two permanent Team Room links and your sprint history, both already active on this account."
            : "Two permanent Team Room links that never change, plus sprint history so you can see velocity and alignment over time. Both free."}
        </Card>

        <p className="login-modal-upgrade">
          Something not working? <a href={`mailto:${support}`}>Email support ↗</a>
        </p>
      </Stack>
    </Modal>
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
      <Alert
        tone="info"
        title="Essential browser storage only"
        className="cookie-inner"
        actions={
          <>
            <Button size="sm" href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</Button>
            <Button size="sm" href="/terms" target="_blank" rel="noopener noreferrer">Terms</Button>
            <Button variant="primary" size="sm" onClick={onAccept}>Got it</Button>
          </>
        }
      >
        Firebase keeps your session; your display name and this notice are remembered locally.
        No advertising, tracking, or third-party analytics cookies, nothing to opt out of.
      </Alert>
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
      revealElement(el, "start");
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
      revealElement(el, "start");
    }, 40);
    return () => clearTimeout(timeout);
  }, [screen]);

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
        showToast("Time is up. Cards revealed.");
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
          showToast("Everyone voted. Revealing cards.");
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
        showToast("Session ended automatically after 5 hours. Your sprint data is saved to history.");
      } else if (age >= SESSION_WARN_MS && !sessionWarningRef.current) {
        setSessionWarning(true);
        showToast("Session ends in about 10 minutes. Time to wrap up.");
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
  // The room's own occupants end it at five hours, and reapStaleRooms in
  // functions/index.js clears rooms everybody abandoned before that.
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

  // ── AWAY-PLAYER SWEEP ────────────────────────────────────────────
  // Handled from inside the room rather than by the global sweeper, which only
  // ran when somebody happened to load the join screen. Idempotent: once the
  // away players are gone the filter is empty and no write is issued, so this
  // running on every room update costs nothing.
  useEffect(() => {
    if (screen !== "game" || !code) return;
    sweepAwayPlayers(code, roomData?.players);
  }, [screen, code, roomData?.players]);

  const handleCreate = async (name, role, deck = "fibonacci", estimationMode = "stories") => {
    pendingSessionNameRef.current = name;
    const c = mkCode();
    setMyRole(role);
    setCode(c);
    setPrefillTeam("");
    /* A rejected write here used to throw past every line below it, so the room
       was never created, the screen never changed, and the only trace was an
       unhandled rejection in a console nobody has open. The button appeared to
       do nothing at all. */
    try {
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
    } catch (err) {
      console.error("[pointpoker] room creation failed", err);
      showToast("Could not create the room, check your connection and try again.");
      return;
    }

    // Server-side soft-disconnect: marks offline rather than removing immediately.
    // Players offline for more than an hour are removed by sweepAwayPlayers,
    // run by whoever is still in the room.
    onDisconnect(ref(db, `rooms/${c}/players/${myId}`)).update({ online: false, disconnectedAt: serverTimestamp() });

    // Update URL so the creator can copy/share the link immediately.
    window.history.replaceState({}, "", roomPath(c));
    setScreen("game");
    track("room_created");
    track(`deck_${deck}`);
    track(role === "observer" ? "joined_facilitator" : "joined_voter");
    showToast(`Room ${c} is ready. Share the link while the session is active.`);
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
    try {
      await update(ref(db, `rooms/${c}/players/${myId}`), {
        id: myId, name, role, voted: false, vote: null, online: true,
      });
    } catch (err) {
      console.error("[pointpoker] join failed", err);
      showToast("Could not join that room, check your connection and try again.");
      return;
    }
    onDisconnect(ref(db, `rooms/${c}/players/${myId}`)).update({ online: false, disconnectedAt: serverTimestamp() });
    window.history.replaceState({}, "", roomPath(c));
    setScreen("game");
    track(role === "observer" ? "joined_facilitator" : "joined_voter");
    showToast(`Welcome, ${name}.`);
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
    try {
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
    } catch (err) {
      console.error("[pointpoker] team room entry failed", err);
      showToast(`Could not open ${teamName}, check your connection and try again.`);
      return;
    }
    onDisconnect(ref(db, `rooms/${c}/players/${myId}`)).update({ online: false, disconnectedAt: serverTimestamp() });
    // Keep the clean stable team-room URL so invites and browser refreshes stay consistent.
    window.history.replaceState({}, "", teamRoomPath(c));
    setScreen("game");
    track(role === "observer" ? "joined_facilitator" : "joined_voter");
    // A Team Room that already existed is a returning team — the stickiness signal.
    track(snap.exists() ? "team_room_reentered" : "room_created_team");
    if (!snap.exists()) track(`deck_${deck}`);
    showToast(`Welcome to ${teamName}.`);
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
    try {
      await update(ref(db), upd);
    } catch (err) {
      // A rejected queue write left the field cleared and the list unchanged,
      // which reads as "it swallowed my backlog".
      console.error("[pointpoker] addStory write failed", err);
      showToast(names.length > 1 ? "Could not add those items, check your connection and try again."
                                 : "Could not add that item, check your connection and try again.");
    }
  }, [code, roomData, showToast]);

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
    try {
      await update(ref(db), {
        [`rooms/${code}/stories`]: next.length
          ? Object.fromEntries(next.map((story, i) => [i, story]))
          : null,
        [`rooms/${code}/activeStory`]: Math.min(activeIdx, next.length),
      });
    } catch (err) {
      console.error("[pointpoker] removeStory write failed", err);
      showToast("Could not remove that item, check your connection and try again.");
    }
  }, [code, roomData, showToast]);

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

  /* Which paths a new sprint blanks is a list that was missing three entries,
     so it lives in estimation.js where a test can read it. This is the wiring. */
  const resetSession = useCallback(async () => {
    const upd = Object.fromEntries(
      Object.entries(sprintResetUpdates(roomData)).map(([path, v]) => [`rooms/${code}/${path}`, v]),
    );
    try {
      await update(ref(db), upd);
      showToast("New sprint started. Votes and estimates are cleared.");
    } catch (err) {
      // Every other write in this file reports its failure; this one used to
      // reject into an unhandled promise and leave a half-reset room silent.
      console.error("[pointpoker] resetSession write failed", err);
      showToast("Could not start a new sprint, check your connection and try again.");
    }
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
            window.scrollTo({ top: 0, behavior: scrollBehavior() });
          }}
          onLogin={()    => openLoginModal("signin", "general")}
          onStartFree={() => {
            if (screen !== "join") { navTo("/"); }
            setStartFocusToken((v) => v + 1);
          }}
          onJoinScreen={screen === "join"}
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
              <div style={{ color: "rgba(239,242,247,.62)", fontSize: "var(--fs-2)" }}>
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
          {/* Toasts carry the only confirmation of several actions, so the
              region is announced rather than being a purely visual flash. */}
          <ToastRegion>
            {toastOn && <Toast text={toast} />}
          </ToastRegion>
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

/* The eleven marketing routes are all one shape, so they are all one set of
   design-system components: a Hero, then Sections whose heads are SectionHead
   and whose bodies are a Grid of Cards. Nothing below styles itself. */
function MarketingSection({ title, intro, children }) {
  return (
    <Section tight className="marketing-section">
      <SectionHead title={title} subtitle={intro} />
      {children}
    </Section>
  );
}

function MarketingRelatedLinks({ title, intro, links, onNavigate }) {
  return (
    <MarketingSection title={title} intro={intro}>
      <Grid min="280px">
        {links.map((link) => (
          <Card
            key={link.href}
            interactive
            as={RouteLink}
            href={link.href}
            onNavigate={onNavigate}
            className="marketing-link-card"
            eyebrow={link.kicker}
            title={link.title}
          >
            {link.copy}
          </Card>
        ))}
      </Grid>
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
      <Hero
        paper
        eyebrow={eyebrow}
        title={title}
        subtitle={intro}
        actions={
          <>
            {/* Rule 2: one primary per screen. It is the one that opens a room —
                the reason the page exists. */}
            <Button variant="primary" as={RouteLink} href={primaryHref} onNavigate={onNavigate}>
              {primaryLabel}
            </Button>
            <Button as={RouteLink} href={secondaryHref} onNavigate={onNavigate}>
              {secondaryLabel}
            </Button>
          </>
        }
        aside={
          <Grid min="180px" className="marketing-stat-grid">
            {highlights.map((item) => (
              <StatTile key={item.label} label={item.label} value={item.value} gold />
            ))}
          </Grid>
        }
      />
      <Container>
        <Button variant="ghost" size="sm" className="legal-back" onClick={() => onNavigate("/")}>
          ← Back to home
        </Button>
        {children}
      </Container>
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
        { value: "$0", label: "Every feature, every team, no card" },
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
        <Grid min="300px">
          <Card variant="gold" eyebrow="Everyone" title="$0">
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
          </Card>
          <Card eyebrow="What others charge" title="$20–30/mo">
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
          </Card>
        </Grid>
        <Alert tone="gold" title="Why free, and for how long"> A planning poker tool is only useful if the whole team
          will actually open it, and a paywall kills that on the first invite. So the plan is to keep every
          feature free, watch how many teams use it, and only look at paid add-ons once there is a real user
          base to serve. If that day comes, everything on this page stays free. Anything paid would be new
          work on top of it, and we would say so clearly and well in advance.
        </Alert>
      </MarketingSection>

      <MarketingSection
        title="What free does and does not mean here"
        intro="Free products usually have a catch. Here is exactly where ours sits, so you can decide with your eyes open."
      >
        <Grid min="280px">
          <Card title="You are not the product">
              No advertising, no third-party analytics scripts, no session recording, nothing sold on. The only
              usage data collected is an anonymous daily count of events such as "a room was created". No names,
              no room contents, no identifiers of any kind.
              </Card>
          <Card title="Rooms are deliberately temporary">
              A room and its votes are deleted when everyone leaves, and idle rooms get swept automatically.
              That keeps the running cost low enough to stay free, and it means old estimates are not sitting
              somewhere you had forgotten about.
              </Card>
          <Card title="Support is best-effort, and honest about it">
              This is a small, independently run product. Email gets answered by a person, usually quickly, but
              there is no SLA behind it. If you work somewhere that needs one, factor that in before you commit.
              </Card>
        </Grid>
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

      <Card variant="felt" pad="lg" className="marketing-cta-strip">
        <SectionHead
          title="Open a room and try it on a real story"
          subtitle="Nothing to sign up for and nothing to compare. Create a room, paste the link into your team chat, and size something you actually have to estimate this sprint."
        />
        <Row>
          <Button variant="primary" as={RouteLink} href="/" onNavigate={onNavigate}>Create a free room</Button>
          <Button className="pp-btn--on-felt" as={RouteLink} href="/features" onNavigate={onNavigate}>See feature detail</Button>
        </Row>
      </Card>
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
        <Grid min="280px">
          <Card title="Less friction to start">
              Free rooms do not force account creation for normal participation, so a facilitator can drop a link into Slack or Teams and start estimating without turning setup into a ceremony of its own.
              </Card>
          <Card title="Better structure once the team is inside">
              Simultaneous reveal, queue-based flow, split-vote resolution, and facilitator-only controls make the session feel purposeful instead of improvised.
              </Card>
          <Card title="A clean upgrade path when repeatability matters">
              Nothing is locked behind billing. Every feature, decks, timer, queue, analytics, export, Team Rooms, is free for every team while we find out how many teams this is genuinely useful to.
              </Card>
        </Grid>
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
        <Grid min="280px">
          <Card title="Public legal and privacy pages">
              Terms of Service and Privacy Policy are available on the live domain, with UK GDPR-aware privacy language and clear third-party processor disclosure.
              </Card>
          <Card title="Live support route">
              Support is reachable through a dedicated support page and the published support email, so teams are not left guessing how to get help.
              </Card>
          <Card title="Focused product scope">
              The product is deliberately narrow: run planning poker well, keep the room flow clean, and add only what improves repeat use rather than piling on complexity nobody asked for.
              </Card>
        </Grid>
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
        { value: "$0", label: "Every feature, including Team Rooms and history" },
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
        <Grid min="280px">
          <Card title="Room join questions">
              Free participation does not require an account. Guests can join a shared room with a real name and the correct role, then vote or facilitate straight away.
              </Card>
          <Card title="Account questions">
              A free account exists for one reason: it reserves your two Team Room URLs so no other team can land in your room, and it keeps sprint history tied to you across devices. Everything else works without one.
              </Card>
          <Card title="Workflow questions">
              When votes split, the facilitator can either run another vote or choose the final agreed estimate from the active deck. Averages are shown for discussion only and are not saved automatically.
              </Card>
        </Grid>
      </MarketingSection>

      <MarketingSection
        title="Contact support"
        intro="If the product behaves unexpectedly or you need help with account access, Team Rooms, or sprint history, contact support directly."
      >
        <Alert tone="info" title={<>Support email: <a href={`mailto:${support}`} className="seo-inline-link">{support}</a></>}>
          Include the room code or Team Room URL, what you expected to happen, and what you saw instead. That
          makes it much easier to reproduce and fix the issue quickly.
        </Alert>
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
        <Grid min="280px">
          <Card title="Public support and legal routes">
              pointpoker publishes its support, privacy, and terms surfaces on the live domain so teams can see how the product is operated instead of hunting through a hidden help centre.
              </Card>
          <Card title="Authenticated support email">
              Outbound mail from <a href={`mailto:${support}`} className="seo-inline-link">{support}</a> now passes SPF, DKIM, and DMARC, which improves deliverability and makes support contact look less improvised.
              </Card>
          <Card title="Clear account boundaries">
              Participation stays friction-light and needs no account at all. Team Room ownership is tied to an authenticated account so a room URL stays with the right team.
              </Card>
        </Grid>
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
        <Grid min="280px">
          <Card title="Stable production domain and crawlable support surface">
              The live product, support routes, and educational pages all sit on the production domain with Search Console connected, sitemap submitted, and key routes requested for indexing.
              </Card>
          <Card title="Account-linked Team Rooms">
              Your two fixed Team Room URLs and your sprint history follow your account across devices instead of floating in anonymous browser state that a cleared cache can wipe.
              </Card>
          <Card title="Published data and rules posture">
              Firebase rules validate room shape and deck-safe estimates, while the product exposes its legal, privacy, and support posture publicly rather than hiding it behind a signup wall.
              </Card>
        </Grid>
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
        <Grid min="280px">
          <Card title="Everyone estimates independently first">
              Each voter picks a card before seeing anyone else’s choice. That keeps stronger personalities and senior voices from steering the estimate too early.
              </Card>
          <Card title="The reveal makes uncertainty visible">
              When one person picks 3 and another picks 8, the disagreement is useful. It usually means the team sees different risk, scope, or implementation effort.
              </Card>
          <Card title="Discussion focuses on the gap, not the whole story">
              Teams do not need to debate every item equally. Planning poker helps them spend energy where the spread tells them understanding is still uneven.
              </Card>
        </Grid>
      </MarketingSection>

      <MarketingSection
        title="How the process normally works"
        intro="A good planning poker session has a clear rhythm, especially when the facilitator keeps the room moving."
      >
        <Grid min="260px" className="marketing-steps">
          {[
            ["Read the story together", "Make sure everyone understands the scope, acceptance criteria, and what 'done' means before anyone votes."],
            ["Vote privately", "Each voter chooses a card independently so the first visible estimate does not bias everyone else."],
            ["Reveal the cards", "The team sees the spread, average, and median, but those numbers guide discussion rather than automatically becoming the answer."],
            ["Discuss the difference", "Talk about why the estimates diverged: hidden complexity, dependencies, ambiguity, or assumptions."],
            ["Either re-vote or agree a final estimate", "A facilitator can run another round or record the final agreed deck value once the team is aligned."],
          ].map(([stepTitle, stepCopy], index) => (
            <Card key={stepTitle} eyebrow={`Step ${index + 1}`} title={stepTitle}>
              {stepCopy}
            </Card>
          ))}
        </Grid>
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
        <Grid min="280px">
          <Card title="Small differences matter less as work grows">
              Teams usually do not need to debate whether something is an 11 or a 12. Fibonacci keeps the choices coarse enough to focus on useful differences rather than false precision.
              </Card>
          <Card title="The numbers represent relative effort">
              Story points are not hours. They reflect a mix of effort, complexity, risk, and uncertainty, compared against the rest of the backlog.
              </Card>
          <Card title="Agreement matters more than arithmetic">
              If the team splits between 3 and 5, the final answer should be the agreed Fibonacci card, not an invalid middle number like 4.
              </Card>
        </Grid>
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
        <Grid min="280px">
          <Card title="Fibonacci is the default deck">
              Teams can start with the familiar sequence immediately, while still having T-shirt and Powers of 2 available for different estimation styles.
              </Card>
          <Card title="Averages stay contextual">
              The app can show average and median after reveal, but those numbers are there to guide discussion rather than silently becoming the recorded estimate.
              </Card>
          <Card title="Final estimate must stay deck-valid">
              When votes differ, the facilitator records the final agreed Fibonacci value or runs another vote. That keeps sprint history and analytics trustworthy.
              </Card>
        </Grid>
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
        <Grid min="280px">
          <Card title="Fast setup">
              Teams should be able to open a room and invite everyone from a browser link, especially when estimation is only one part of a larger planning session.
              </Card>
          <Card title="Unbiased initial estimates">
              Independent first votes and simultaneous reveal help the team see genuine spread before stronger opinions steer the discussion.
              </Card>
          <Card title="Clear facilitator controls">
              Reveal, re-vote, moderation, timer control, and final estimate capture should all be obvious to the facilitator when the room is live.
              </Card>
        </Grid>
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
        <Grid min="280px">
          <Card title="It supports discussion after reveal">
              Split votes do not get averaged into misleading answers. The team can discuss the difference and the facilitator records the final agreed deck value explicitly.
              </Card>
          <Card title="It keeps the room understandable">
              Real names are required, roles are explicit, and the invite flow stays visible so the meeting does not become confusing for late joiners or mixed-discipline teams.
              </Card>
          <Card title="It creates reusable context over time">
              Sprint history and two fixed Team Rooms help the same team come back to a consistent estimation workflow instead of starting from scratch every sprint.
              </Card>
        </Grid>
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
        { value: "$0", label: "Team Rooms and sprint history included free" },
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
        <Grid min="280px">
          <Card title="Simultaneous reveal">
              Everyone votes independently first, then cards reveal together. That keeps louder voices from anchoring the team before the conversation has started.
              </Card>
          <Card title="Estimate stories or tasks, your choice">
              Choose whether you are sizing user stories as a whole or individual tasks within them. Add items as you go or preload the queue, record the agreed estimate, and move straight to the next item without rebuilding the room.
              </Card>
          <Card title="Facilitator controls">
              Facilitators can reveal cards, run another vote, record the agreed estimate, moderate participants, manage the timer, and keep the session moving.
              </Card>
        </Grid>
      </MarketingSection>

      <MarketingSection
        title="Designed for discussion, not just number collection"
        intro="A good planning poker tool helps teams think better. pointpoker adds the structure that makes disagreement productive instead of noisy."
      >
        <Grid min="280px">
          <Card title="Split-vote resolution">
              When estimates differ, the app keeps averages visible for context but requires the facilitator to record only a valid agreed deck value or run another vote.
              </Card>
          <Card title="Team Alignment analytics">
              Facilitators can see consensus rate, total points, item throughput, and how often the team agrees on the first vote, helping uncover backlog clarity problems early.
              </Card>
          <Card title="Built for remote teams">
              Browser-first join flow, frictionless invite links, and compact facilitator controls make it practical for Slack, Teams, Zoom, and hybrid sprint ceremonies.
              </Card>
        </Grid>
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
        <Grid min="280px">
          <Card title="No install barrier">
              Everyone joins from a browser link. That makes it easy to drop a room into Slack, Teams, Zoom chat, or a calendar invite and start estimating immediately.
              </Card>
          <Card title="Clear reveal flow">
              The room supports true simultaneous reveal, so estimates stay independent until the team is ready to discuss them.
              </Card>
          <Card title="Room stays focused">
              Story queue, timer, facilitator controls, and explicit next-step prompts keep the team in one workflow instead of juggling notes, chat, and spreadsheets.
              </Card>
        </Grid>
      </MarketingSection>

      <MarketingSection
        title="How a typical online planning poker session runs"
        intro="The product flow stays intentionally simple so the team spends time discussing the backlog, not learning the tool."
      >
        <Grid min="260px" className="marketing-steps">
          {[
            ["Create or join the room", "Start a free room instantly or join from a shared link with your name and role."],
            ["Add the story you are estimating", "Work from a backlog queue or estimate one story at a time during refinement."],
            ["Vote privately", "Each voter picks a card before the reveal, which reduces anchoring bias."],
            ["Discuss only when the spread matters", "Facilitators can reveal, time-box discussion, and either re-vote or record the agreed estimate."],
            ["Move straight to the next item", "The room keeps momentum without forcing the team to rebuild context for every story."],
          ].map(([stepTitle, stepCopy], index) => (
            <Card key={stepTitle} eyebrow={`Step ${index + 1}`} title={stepTitle}>
              {stepCopy}
            </Card>
          ))}
        </Grid>
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
        <Grid min="280px">
          <Card title="Sprint planning">
              Use the queue, vote through the backlog, and leave the session with a cleaner sense of the sprint’s scope and the stories that still need clarification.
              </Card>
          <Card title="Backlog refinement">
              Smaller estimation sessions still benefit from the same reveal-and-discuss pattern, especially when stories are unclear or acceptance criteria are thin.
              </Card>
          <Card title="Cross-functional alignment">
              Scrum poker surfaces differences between engineering, product, and delivery expectations before those differences become sprint risk.
              </Card>
        </Grid>
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
        <Grid min="280px">
          <Card title="Relative sizing beats fake precision">
              Teams can usually agree faster on whether something feels closer to a 3 or an 8 than on whether it will take exactly 9.5 hours.
              </Card>
          <Card title="Fibonacci highlights uncertainty">
              Wider gaps at larger values push the team to acknowledge risk and complexity instead of compressing everything into tiny numeric differences.
              </Card>
          <Card title="Consensus matters more than average">
              The product keeps discussion analytics visible, but it only saves final agreed deck values so sprint history stays trustworthy.
              </Card>
        </Grid>
      </MarketingSection>

      <MarketingSection
        title="Best-practice estimation flow"
        intro="Good estimation is structured. The app is designed to make the next decision obvious at every stage."
      >
        <Grid min="260px" className="marketing-steps">
          {[
            ["Let everyone vote independently", "Private voting reduces anchoring and produces a more honest first signal."],
            ["Reveal the cards together", "Use the spread, average, and median to guide discussion, not as an automatic answer."],
            ["Discuss the differences", "The stories with the widest spread are usually where acceptance criteria or scope still need work."],
            ["Either re-vote or record the agreed estimate", "Facilitators can capture only valid deck values, keeping the estimate aligned with the team’s chosen method."],
          ].map(([stepTitle, stepCopy], index) => (
            <Card key={stepTitle} eyebrow={`Step ${index + 1}`} title={stepTitle}>
              {stepCopy}
            </Card>
          ))}
        </Grid>
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
        <Grid min="280px">
          <Card title="Fast join flow">
              Participants can join free rooms or shared Team Rooms with a name and role, so the facilitator is not blocked by account setup.
              </Card>
          <Card title="Clear facilitator workflow">
              Reveal, re-vote, timer control, participant moderation, and final estimate capture all sit inside one flow built for the person running the ceremony.
              </Card>
          <Card title="Persistent room when the team is ready">
              Team Rooms give recurring squads two fixed URLs so nobody recreates and re-shares the same room every sprint.
              </Card>
        </Grid>
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
    <Section className="legal-page">
      <Container size="narrow">
        <Button variant="ghost" size="sm" className="legal-back" onClick={onBack} aria-label="Back to home">
          ← Back
        </Button>
        <SectionHead as="h1" eyebrow={`Last updated: ${lastUpdated}`} title={title} />
        {/* Prose is the only place in the system that styles bare h2/p/li, and
            these two documents are nothing but bare h2/p/li. */}
        <Prose className="legal-body">{children}</Prose>
      </Container>
    </Section>
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
        PRECEDING THE CLAIM, OR (B) $100 (ONE HUNDRED US DOLLARS).
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
    /* Rule 5: an arrow alone is a colour-coded glyph. The word beside it is
       what a screen reader and a colour-blind reader actually get. */
    if (recentAvg > olderAvg * 1.05)      trend = { icon: "↑", label: "Improving", tone: "success" };
    else if (recentAvg < olderAvg * 0.95) trend = { icon: "↓", label: "Declining", tone: "danger" };
    else                                   trend = { icon: "→", label: "Steady",    tone: "gold" };
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
    <Modal
      open
      wide
      title="Sprint history"
      subtitle={totalSprints === 0
        ? "No sprint sessions recorded yet"
        : `${totalSprints} session${totalSprints !== 1 ? "s" : ""} recorded`}
      onClose={onClose}
    >
      {totalSprints === 0 ? (
        <EmptyState title="Your sprint archive is ready">
          Finish a session while signed in and it will appear here automatically. Sprint history is saved when
          you end a session, or when a room auto-expires after five hours.
        </EmptyState>
      ) : (
        <Stack gap="lg">
          {/* Rule 9: a sprint with no numeric points has no velocity, so the
              tile says what would appear there instead of printing a nought. */}
          <Grid min="150px">
            <StatTile
              label="Avg velocity"
              value={avgVelocity > 0 ? avgVelocity : null}
              meta="pts / sprint"
              empty="Appears once a sprint records points"
            />
            <StatTile
              label="Best sprint"
              value={bestSprint > 0 ? bestSprint : null}
              meta="story pts"
              empty="Appears once a sprint records points"
            />
            <StatTile label="Team alignment" value={`${avgConsensus}%`} meta="avg consensus" gold />
            <StatTile
              label="Velocity trend"
              value={trend ? `${trend.icon} ${trend.label}` : null}
              meta={trend ? "recent half vs earlier half" : undefined}
              empty="Needs two or more sprints"
            />
          </Grid>

          <ResultsTable
            caption="Most recent session first."
            columns={[
              { key: "sprint", label: "Sprint" },
              { key: "date", label: "Ended" },
              { key: "points", label: "Points", numeric: true },
              { key: "stories", label: "Stories", numeric: true },
              { key: "consensus", label: "Consensus", numeric: true },
              { key: "duration", label: "Duration", numeric: true },
            ]}
            rows={history.map((h, i) => ({
              id: h.id || i,
              sprint: h.teamName ? h.teamName : `Sprint ${totalSprints - i}`,
              date: fmtDate(h.endedAt),
              points: h.totalPoints,
              stories: h.storiesDone,
              consensus: h.consensusRate == null ? "—" : `${h.consensusRate}%`,
              duration: fmtDuration(h.startedAt, h.endedAt) || "—",
            }))}
          />
        </Stack>
      )}
    </Modal>
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
  const [tab, setTab] = useState(prefillTeam ? "team" : prefillCode ? "join" : "create");
  /* Signed in, your own two Team Rooms are opened from the panel beside this
     form, and the tab could only ever target those same two rooms — its name
     field is readOnly for exactly that reason. Three tabs, a room picker, a
     readOnly name and a code preview were four controls for one choice the
     panel already presents. The tab returns for a shared link, which is the one
     case where the form has a room to enter that the panel does not list. */
  const TABS = [
    { key: "create", label: "Create" },
    { key: "join", label: "Join" },
    ...(signedIn && !isSharedTeamRoomEntry ? [] : [{ key: "team", label: "Team" }]),
  ];
  // Signing in while the team tab is open would otherwise strand the form on a
  // branch with no tab left to switch away from.
  const activeTab = TABS.some((t) => t.key === tab) ? tab : "create";
  const [nameDraft, setNameDraft] = useState(signedIn ? defaultName : recallName());
  const [nameEdited, setNameEdited] = useState(false);
  // No default. Defaulting to voter meant the person creating the room was
  // silently a voter, and every record control is facilitator-only, so a solo
  // creator reached a revealed round with no way to record and no way to
  // promote themselves. One deliberate click removes that dead end.
  const [role, setRole] = useState("");
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
  // Renaming both rooms is a once-per-account job. It stays on the page but
  // folded away, so the two things done every sprint — open a room, copy its
  // link — are what the panel actually shows.
  const [renameOpen, setRenameOpen] = useState(false);
  const [err, setErr] = useState("");
  /* Which field the message is about, so it can be printed beside that field
     rather than in one slot above the call to action. A refusal fired from the
     Team Rooms panel used to print 350px away in the other column, and moving
     focus does not help a mouse user: a programmatic focus() does not match
     :focus-visible, so nothing was highlighted either. */
  const [errField, setErrField] = useState("");
  /* A room the user asked for and could not have yet, because the role picker
     has no default by design. Without this, opening a Team Room on a phone is
     a round trip: tap Open, get sent down to the role picker, pick one, scroll
     back up, tap Open again. The intent is held only until the next unrelated
     interaction — clearErr drops it — so nothing opens by surprise later. */
  const [pendingRoomKey, setPendingRoomKey] = useState("");
  const [copiedDedicatedRoomKey, setCopiedDedicatedRoomKey] = useState("");
  const roleGroupRef = useRef(null);
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

  const clearErr = () => { setErr(""); setErrField(""); setPendingRoomKey(""); };
  const fail = (message, field = "") => { setErr(message); setErrField(field); };
  // Rendered next to the field it names; falls back to the slot above the call
  // to action for anything that is not about one specific field.
  const fieldError = (field) =>
    err && errField === field
      ? <span className="pp-error" id="join-error" role="alert">{err}</span>
      : null;

  /* Six call sites reach the room handlers and only three of them go through
     go() — the dedicated Team Room shortcuts and the auto-enter effect call in
     directly. Since the picker has no default, each one has to stop rather than
     write a blank role into the room, which the rules would reject anyway. */
  const requireRole = useCallback(() => {
    if (role) return true;
    setErr("Pick your role first. Participants vote, facilitators run the session.");
    setErrField("role");
    return false;
  }, [role]);
  // Live preview of the room code a team name would produce
  const previewCode = teamName.trim() ? teamCode(teamName.trim()) : null;
  const teamPrimaryLabel = canEnterTeamRoom
    ? "Join Team Room →"
    : "Create a free account for 2 Team Rooms →";
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

  /* The two Open buttons live in the Team Rooms panel and the two fields they
     need — name and role — live in the form beside it. Side by side on a
     desktop that is obvious; stacked on a phone the form is below the fold, so
     a refusal that only printed a message would read as a dead button. Send
     focus to whichever field is actually missing. */
  const focusMissingField = (el) => {
    revealElement(el);
    el?.focus({ preventScroll: true });
  };

  const openDedicatedRoom = (room, chosenRole = role) => {
    const validatedName = validateEnteredName();
    if (!validatedName.ok) {
      fail(validatedName.message, "name");
      focusMissingField(nameInputRef.current);
      return;
    }
    if (!chosenRole) {
      fail(`Pick your role and ${room.shortLabel} opens.`, "role");
      setPendingRoomKey(room.key);
      focusMissingField(roleGroupRef.current?.querySelector("button"));
      return;
    }
    setSelectedDedicatedRoomKey(room.key);
    onTeamRoom(validatedName.name, chosenRole, room.name, deck, estMode);
  };

  // Picking the role the panel was waiting for finishes the job it started.
  const chooseRole = (nextRole) => {
    const resumed = dedicatedTeamRooms.find((r) => r.key === pendingRoomKey);
    setRole(nextRole);
    clearErr();
    if (resumed) openDedicatedRoom(resumed, nextRole);
  };

  const go = () => {
    const validatedName = validateEnteredName();
    if (!validatedName.ok) { fail(validatedName.message, "name"); nameInputRef.current?.focus(); return; }
    if (!requireRole()) { roleGroupRef.current?.querySelector("button")?.focus(); return; }
    const enteredName = validatedName.name;
    if (activeTab === "create") {
      onCreate(enteredName, role, deck, estMode);
    } else if (activeTab === "join") {
      if (!rc.trim()) { fail("Please enter a room code", "code"); return; }
      onJoin(enteredName, role, rc.trim().toUpperCase());
    } else {
      // team room — hosting one needs a free account for a unique URL
      if (!canEnterTeamRoom) {
        onRequireAccount?.();
        return;
      }
      if (!teamName.trim()) { fail("Please enter your team name", "team"); return; }
      onTeamRoom(enteredName, role, teamName.trim(), deck, estMode);
    }
  };

  const saveDedicatedRoomLabel = async () => {
    if (!currentUser?.uid) return;
    const nextLabel = dedicatedRoomLabel.replace(/\s+/g, " ").trim();
    if (!nextLabel) {
      fail("Choose a name for your Team Rooms.", "rename");
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
      fail("Could not save your Team Room names right now. Try again.", "rename");
      setDedicatedRoomLabelStatus("error");
    } finally {
      setSavingDedicatedRoomLabel(false);
      dedicatedRoomLabelStatusRef.current = setTimeout(() => setDedicatedRoomLabelStatus(""), 2200);
    }
  };

  const ROLES = [
    { r: "voter",    icon: "cards", l: "Participant", s: "Votes on each story" },
    { r: "observer", icon: "eye", l: "Facilitator", s: "Runs the session and does not vote" },
  ];

  const copyTeamUrl = async (room) => {
    if (!room?.url) return;
    const ok = await copyText(room.url);
    if (!ok) {
      fail("Your browser blocked the copy. Select the link and copy it manually.", "copy");
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
    setRenameOpen(true);
    setTimeout(() => {
      revealElement(workspaceRoomEditorRef.current);
      workspaceRoomEditorInputRef.current?.focus({ preventScroll: true });
    }, 80);
    const timeout = setTimeout(() => setHighlightWorkspaceSetup(false), 2600);
    return () => clearTimeout(timeout);
  }, [signedIn, proSetupFocusToken]);

  /* The navbar's "Start a free room" bumps this counter and nothing listened,
     so on the join screen — the one screen where that control is not a link to
     somewhere else — pressing it did nothing at all. It is a shortcut to the
     form, so it puts the cursor in the form's first field. */
  useEffect(() => {
    if (!startFocusToken) return;
    revealElement(nameInputRef.current);
    nameInputRef.current?.focus({ preventScroll: true });
  }, [startFocusToken]);

  useEffect(() => {
    if (autoEnterOwnTeamRoomRef.current) return;
    if (!signedIn || !isSharedTeamRoomEntry) return;
    if (!teamRouteMatch || !matchedDedicatedRoomFromRoute) return;
    const validatedName = validateEnteredName();
    if (!validatedName.ok) return;
    // role is in this effect's deps, so picking one completes the entry.
    if (!requireRole()) return;
    const nextName = validatedName.name;
    autoEnterOwnTeamRoomRef.current = true;
    onTeamRoom(nextName, role, matchedDedicatedRoomFromRoute.name, deck);
  }, [
    signedIn,
    isSharedTeamRoomEntry,
    teamRouteMatch,
    matchedDedicatedRoomFromRoute,
    role,
    requireRole,
    deck,
    onTeamRoom,
    validateEnteredName,
  ]);

  return (
    <div className="join-wrap">
      {/* The hero sat stacked on top of the form inside one 440px card, which
          put 397px of marketing above the control people came to use and left
          829px of empty width either side. From 1024px up the two sit side by
          side instead: nothing is removed, the space was already there. */}
      <div className={`join-layout pp-container${signedIn ? " join-layout--workspace" : ""}`}>
        <div className="join-side">
        <header className="join-hero">
          {!signedIn && (
            <div className="join-mark">
              <BrandMark size={56} label="pointpoker"/>
            </div>
          )}

          <h1 className="join-title">
            {signedIn
              ? `Welcome back${defaultName ? `, ${defaultName.split(" ")[0]}` : ""}`
              : "Free Planning Poker for Agile Teams"}
          </h1>
          <p className={`join-sub${signedIn ? " workspace" : ""}`}>
            {signedIn
              ? "Open a fixed Team Room for recurring planning, or set up a one-off session."
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
        </header>

        {/* The column beside the form was 552px of empty background: the hero
            it held is four lines long and the form is 2,000px tall, so on a
            desktop the headline sat below the fold with nothing around it. The
            two Team Rooms are what a returning user came for, so they take the
            space, and the form keeps the column it already had. */}
        {signedIn && (
          <Section as="section" tight className="workspace-panel" aria-labelledby="team-rooms-heading">
            <SectionHead
              align="start"
              title="Your Team Rooms"
              subtitle="Two fixed URLs tied to your account. Share them once and reuse them every sprint."
            />

            <Stack>
              {dedicatedTeamRooms.map((room) => (
                <Card
                  key={room.key}
                  variant="raised"
                  pad="sm"
                  className="workspace-room-card"
                  footer={
                    <Button block onClick={() => openDedicatedRoom(room)}>
                      Open {room.shortLabel} →
                    </Button>
                  }
                >
                  <Row between nowrap>
                    <h3 className="workspace-room-name">{room.name}</h3>
                    <Chip tone="gold">{room.shortLabel}</Chip>
                  </Row>
                  <div className="workspace-team-url">
                    <code title={room.url}>{room.url}</code>
                    <Button size="sm" onClick={() => copyTeamUrl(room)}>
                      {copiedDedicatedRoomKey === room.key ? "Link copied" : "Copy link"}
                    </Button>
                  </div>
                </Card>
              ))}
            </Stack>
            {fieldError("copy")}

            <details
              ref={workspaceRoomEditorRef}
              className={`workspace-rename${highlightWorkspaceSetup ? " highlight" : ""}`}
              open={renameOpen}
              onToggle={(e) => setRenameOpen(e.currentTarget.open)}
            >
              <summary className="workspace-rename-summary">Rename both rooms</summary>
              <Stack gap="sm" className="workspace-rename-body">
                <TextField
                  id="workspace-rename-input"
                  ref={workspaceRoomEditorInputRef}
                  label="Shared room name"
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
                  error={err && errField === "rename" ? err : undefined}
                  hint={
                    <>
                      We add <strong>{dedicatedRoomOwnerSuffix}</strong> so both URLs stay unique to you.
                      Saving renames them to <strong>{dedicatedRoomPreview.primary}</strong> and{" "}
                      <strong>{dedicatedRoomPreview.secondary}</strong>.
                    </>
                  }
                >
                  <Button
                    onClick={saveDedicatedRoomLabel}
                    disabled={savingDedicatedRoomLabel || !dedicatedRoomLabelDirty}
                  >
                    {savingDedicatedRoomLabel ? "Saving…" : "Save"}
                  </Button>
                </TextField>
                <p className="workspace-rename-status" role="status">
                  {dedicatedRoomLabelStatus === "saved" ? "Saved. Share the new links with your team." : ""}
                </p>
              </Stack>
            </details>
          </Section>
        )}
        </div>

      <Stack className="join-box">

        {/* "Create Room / Join Room / Team Room" put "Room" in all three tabs
            and could not fit one line on a phone: 87px of label in 64px of
            column, at any size down to the 13px floor. The control picks the
            mode and the primary action names the outcome — it already reads
            "Create Room →" — so the noun does not need saying twice. */}
        <SegmentedControl
          block
          ariaLabel="What you want to do"
          value={activeTab}
          onChange={(key) => { setTab(key); clearErr(); }}
          options={TABS.map(({ key, label }) => ({ value: key, label }))}
        />

        {/* Every field is a TextField, so the label, the control and the error
            are one unit: the label always points at the control, and a refusal
            prints beside the field it is about rather than in one slot above
            the call to action. */}
        <TextField
          id="join-name"
          key={`name-${nameSeedKey}`}
          ref={nameInputRef}
          label="Your name"
          placeholder="e.g. Alex Johnson"
          defaultValue={nameDraft}
          autoComplete="name"
          onInput={(e) => syncEnteredName(e.currentTarget.value)}
          onChange={(e) => syncEnteredName(e.target.value)}
          onBlur={(e) => {
            const liveValue = e.currentTarget.value;
            if (liveValue !== nameValueRef.current) syncEnteredName(liveValue);
          }}
          onKeyDown={(e) => e.key === "Enter" && go()}
          error={err && errField === "name" ? err : undefined}
          hint={signedIn ? "The name the rest of the table sees. Changing it here does not change your account." : undefined}
        />

        {activeTab === "join" && (
          <TextField
            id="join-room-code"
            label="Room code"
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
            error={err && errField === "code" ? err : undefined}
            style={{ letterSpacing: "0.12em", fontWeight: 600 }}
          />
        )}

        {activeTab === "team" && (
          <Stack gap="sm">
            <TextField
              id="join-team-name"
              label="Team name"
              placeholder="e.g. Product Team"
              value={teamName}
              onChange={(e) => { setTeamName(e.target.value); clearErr(); }}
              onKeyDown={(e) => e.key === "Enter" && go()}
              readOnly={isSharedTeamRoomEntry || signedIn}
              error={err && errField === "team" ? err : undefined}
              hint={previewCode ? <>Room code <code className="tcp-code">{previewCode}</code></> : undefined}
            />
            {!canEnterTeamRoom ? (
              <Alert
                tone="gold"
                title="Team Rooms are free"
                actions={
                  <Button size="sm" onClick={() => onRequireAccount?.()}>Create a free account →</Button>
                }
              >
                They need a free account so that nobody else can claim your room URL, which takes about thirty seconds.
              </Alert>
            ) : (
              <p className="join-note">
                This team's room is ready. Add your name, choose your role, and join the live session
                {signedIn ? "." : ", no account needed."}
              </p>
            )}
          </Stack>
        )}

        {/* Role picker. A group of buttons is not a form control, so its
            heading is a span with role="group" on the row, not a <label>
            pointing at nothing. */}
        <Stack gap="sm">
          <span className="pp-label" id="join-role-label">Your role</span>
          <ChoiceRow ref={roleGroupRef} role="group" aria-labelledby="join-role-label">
            {ROLES.map(({ r, icon, l, s }) => (
              <Choice
                key={r}
                icon={icon}
                label={l}
                description={s}
                selected={role === r}
                aria-label={`${l} role: ${s}`}
                // Clear the prompt too: once a role is picked it is telling the
                // user to do something they have just done.
                onSelect={() => chooseRole(r)}
              />
            ))}
          </ChoiceRow>
          {fieldError("role")}
        </Stack>

        {(activeTab === "create" || activeTab === "team") && (
          <>
            {/* Density rather than disclosure. Both choices are irreversible
                for the life of the room, so neither is hidden. They sit side by
                side as label-only options, and the per-option descriptions
                collapse into the one line below that names the selected deck's
                actual cards — more useful than "1, 2, 3, 5, 8…" printed three
                times, once under every deck the user did not pick. */}
            <div className="session-grid">
              <Stack gap="sm" className="session-field">
                <span className="pp-label" id="join-deck-label">Card deck</span>
                <ChoiceGrid cols={3} role="group" aria-labelledby="join-deck-label">
                  {DECK_KEYS.map((k) => {
                    const d = DECK_DEFINITIONS[k];
                    return (
                      <Choice
                        key={k}
                        compact
                        label={d.label}
                        selected={deck === k}
                        aria-label={`${d.label} deck: ${d.desc}`}
                        onSelect={() => setDeck(k)}
                      />
                    );
                  })}
                </ChoiceGrid>
              </Stack>

              <Stack gap="sm" className="session-field">
                <span className="pp-label" id="join-estmode-label">Estimating</span>
                <ChoiceGrid role="group" aria-labelledby="join-estmode-label">
                  {Object.values(ESTIMATION_MODES).map((m) => (
                    <Choice
                      key={m.key}
                      compact
                      label={m.label}
                      selected={estMode === m.key}
                      aria-label={`${m.label}: ${m.desc}`}
                      onSelect={() => setEstMode(m.key)}
                    />
                  ))}
                </ChoiceGrid>
              </Stack>
            </div>

            <p className="choice-permanence">
              <Icon name="alert" size={15} />
              <span>
                <span className="session-summary-cards">{DECK_DEFINITIONS[deck].desc}</span>
                {" — "}
                {ESTIMATION_MODES[estMode].desc.toLowerCase()}. Both are fixed for this room once created.
              </span>
            </p>
          </>
        )}

        {err && !errField && <Alert tone="danger" id="join-error">{err}</Alert>}
        <Button variant="primary" size="lg" block onClick={go}>
          {activeTab === "create" ? "Create Room →"
            : activeTab === "join" ? "Join Room →"
            : teamPrimaryLabel}
        </Button>
        {!signedIn && activeTab === "create" && (
          <p className="join-note join-note--centred">
            Free · Up to {MAX_PARTICIPANTS} at the table · Live in ten seconds
          </p>
        )}
        {!signedIn && activeTab === "join" && (
          <p className="join-note join-note--centred">
            Got a link instead? Open it and you'll join straight away.
          </p>
        )}
        {!signedIn && activeTab === "team" && (
          <p className="join-note join-note--centred">
            Two fixed Team Rooms per account. Same links, every sprint, free.
          </p>
        )}
      </Stack>
      </div>

      {!signedIn && (
      <Section className="seo-section" aria-label="About pointpoker">
      {/* The band runs edge to edge; its content sits in the same container the
          header uses, so the headline below starts on the brand's left edge
          rather than 20px off the window. `flow` puts one gap between every
          block in it — heading, prose, card grid, subsection. */}
      <Container flow>
        <SectionHead
          title="Free Online Planning Poker for Sprint Planning, Scrum Poker, and Remote Estimation"
          subtitle="pointpoker gives agile teams a fast, low-friction way to run planning poker online. Create a room, share one link in Slack, Teams, or Zoom, and let everyone vote at the same time. No install, no training, no ads, and no account needed to play."
        />
        <Prose>
          <p>
            <strong>Everything is free right now, every feature, for every team.</strong> Other planning poker
            tools cap your free sessions at a handful of votes, seven participants, or hide the timer and averages
            behind a paid plan. Here you get {MAX_PARTICIPANTS} people per room, unlimited voting rounds,
            unlimited stories, all three card decks, the timer, full analytics, and export, for $0. We are
            focused on being genuinely useful to as many teams as possible first. If paid add-ons ever arrive,
            everything listed on this page stays free.
          </p>
        </Prose>

        <Grid min="300px" className="seo-grid">
          <Card title="Why simultaneous reveal matters">
            Every team member votes independently before estimates are shown. Cards reveal all at once,
            which reduces anchoring bias and leads to better story-point conversations. You get clearer
            estimates, faster discussions, and fewer meetings dominated by the loudest voice.
          </Card>
          <Card title="How it works">
            <ol className="seo-ol">
              <li>Create a room or join one from a shared link</li>
              <li>Add the item you are estimating, a user story or a specific task within one</li>
              <li>Vote with Fibonacci, T-Shirt sizing, or Powers of 2</li>
              <li>Reveal cards together and discuss only when estimates differ</li>
              <li>Let the facilitator record the final agreed estimate or run another vote</li>
              <li>Move straight to the next item without resetting the room</li>
            </ol>
          </Card>
        </Grid>

        <Section flow className="scroll-target" id="plans" tabIndex="-1" aria-label="Pricing overview">
          <SectionHead
            as="h3"
            title="What it costs: nothing"
            subtitle="One product, free for every team, while we find out how many of you there are. No tiers, no trial clock, no card."
          />
          <Grid min="280px">
            <Card variant="gold" eyebrow="Everyone" title="$0">
              <ul className="seo-plan-list">
                <li>Up to {MAX_PARTICIPANTS} participants including facilitators</li>
                <li>Unlimited rounds and unlimited stories per session</li>
                <li>All card decks, story or task queue, countdown timer</li>
                <li>Facilitator mode, live analytics, clipboard and CSV export</li>
                <li>Two fixed Team Rooms and sprint history with a free account</li>
              </ul>
            </Card>
            <Card eyebrow="Compared with" title="$20–30/mo">
              <ul className="seo-plan-list">
                <li>Common free caps elsewhere: 7 participants, or 9 votes per game</li>
                <li>Timers and averages often sit behind a paid tier</li>
                <li>Some free tools are ad-supported</li>
                <li>Per-facilitator pricing adds up fast for one ceremony a sprint</li>
              </ul>
            </Card>
          </Grid>
          <Row className="seo-plan-actions">
            <Button as={RouteLink} href="/pricing" onNavigate={onNavigate}>
              Read the full pricing promise
            </Button>
          </Row>
        </Section>

        <Section flow className="seo-features">
          <SectionHead as="h3" title="What makes this planning poker tool different" />
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
          <Prose>
            <p>
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
          </Prose>
        </Section>

        <Section flow className="seo-faq scroll-target" id="faq" tabIndex="-1">
          <SectionHead as="h3" title="Frequently asked questions" />
          {/* Accordion, not eight open blocks: the answers stay in the DOM
              (hidden, never unmounted) so a crawler still reads every word,
              while the page stops being a wall of text on a phone. */}
          <Accordion items={FAQ_ITEMS(onNavigate)} />
        </Section>
      </Container>
      </Section>
      )}
    </div>
  );
}

/* The home FAQ. Kept beside the screen that renders it, and shaped for
   <Accordion> so the answers are one list rather than eight hand-built blocks
   whose headings had drifted apart. */
const FAQ_ITEMS = (onNavigate) => [
  {
    question: "Is this planning poker tool actually free?",
    answer: (
      <p>
        Yes, everything, for everyone, right now. Up to {MAX_PARTICIPANTS} participants, unlimited
        voting rounds, unlimited stories, all three card decks, the queue, the countdown timer,
        facilitator analytics, CSV and clipboard export, and two fixed Team Rooms. No credit card,
        no trial clock, no ads. We are concentrating on growing a real user base first; if paid
        add-ons arrive later, everything described here stays free.
      </p>
    ),
  },
  {
    question: "Do I need to create an account?",
    answer: (
      <p>
        No. Enter your name, create a room, share the link, that is the whole flow. A free account
        only exists so we can reserve two permanent Team Room URLs to you (so no other team can land
        in your room) and keep your sprint history across devices.
      </p>
    ),
  },
  {
    question: "Why use Fibonacci numbers for story points?",
    answer: (
      <p>
        Fibonacci (1, 2, 3, 5, 8, 13, 21, 34) reflects how estimation uncertainty grows with
        complexity. The widening gaps between numbers make it easy for teams to distinguish
        small, medium, and large effort without false precision, and force a real conversation
        when two people are far apart. See the{" "}
        <RouteLink href="/fibonacci-story-points" onNavigate={onNavigate} className="seo-inline-link">full Fibonacci guide</RouteLink>
        {" "}for the reasoning in more depth.
      </p>
    ),
  },
  {
    question: "Does this work for remote and distributed teams?",
    answer: (
      <p>
        Yes. Paste the room link into Slack, Teams, or Zoom and everyone joins from any browser in seconds.
        It works across desktop and mobile, and the facilitator can keep the room moving without asking the
        team to install anything.
      </p>
    ),
  },
  {
    question: "What is the Team Alignment score?",
    answer: (
      <p>
        The Team Alignment score (visible to facilitators) tracks the percentage of stories
        that reached first-round consensus, where every voter picked the same card.
        A high score means your backlog is well-defined. A low score flags stories that
        need more acceptance criteria before the sprint begins.
      </p>
    ),
  },
  {
    question: "How many people can join a planning poker session?",
    answer: (
      <p>
        Up to {MAX_PARTICIPANTS} people per room, counting facilitators as well as voters. That covers
        a large scrum team plus product, design, and QA in the same session. Bigger group? Run two rooms
        in parallel and merge the results.
      </p>
    ),
  },
  {
    question: "How is this different from other free planning poker tools?",
    answer: (
      <p>
        Most free planning poker apps cap something that matters: seven participants, nine votes per
        game, five issues per session, or they show ads and hide the timer and averages behind a paid
        tier. Nothing here is capped or ad-supported. You also get facilitator analytics —
        consensus rate, spread, outlier highlighting, and re-vote tracking, that normally only
        appears in paid tiers.
      </p>
    ),
  },
  {
    question: "What happens to my session data?",
    answer: (
      <p>
        Rooms are temporary. When everyone leaves, the room and its votes are deleted, and any room
        left idle is swept automatically. No advertising or third-party analytics cookies are used.
        Sprint history is only stored if you are signed in, and only for you.
      </p>
    ),
  },
];

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
  { key: "wtp_5",     label: "Up to $5 a month for the team" },
  { key: "wtp_15",    label: "$6–15 a month for the team" },
  { key: "wtp_30",    label: "More than $15 a month for the team" },
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
      <Alert tone="success" role="status" className="wtp-panel">
        Thank you, that genuinely shapes what gets built next.
      </Alert>
    );
  }
  return (
    <Card variant="flat" pad="sm" className="wtp-panel" role="group" aria-labelledby="wtp-q">
      <Row between nowrap>
        <Eyebrow>One question, then never again</Eyebrow>
        <IconButton icon="close" size="sm" label="Dismiss this question" onClick={dismiss} />
      </Row>
      <p className="wtp-q" id="wtp-q">
        pointpoker is free and staying free. If it were paid, what would this be worth to your team?
      </p>
      <Stack gap="sm">
        {WTP_OPTIONS.map((o) => (
          <Choice key={o.key} label={o.label} onSelect={() => answer(o.key)} />
        ))}
      </Stack>
      <span className="pp-hint">Anonymous. No email, no follow-up, no change to your access.</span>
    </Card>
  );
}

/* ═══════════════════════ GAME SCREEN ═══════════════════════ */
/* ═══════════════════════ ROOM ACTION BAR ═══════════════════════
   The facilitator's one primary action, in one fixed place, all session.
   Only the label changes: Reveal → Record → next item.

   Why a single slot rather than a button per action: a facilitator is
   running a meeting, talking, and watching a queue at the same time. Every
   extra control on screen is a decision they have to make while doing
   something else. One button that is always in the same place is one
   glance instead of a search.
════════════════════════════════════════════════════════════════ */
function RoomActionBar({
  revealed,
  votedCount,
  voterCount,
  needsManualEstimate,
  onReveal,
  onInvite,
  inviteCopied,
}) {
  const everyoneVoted = voterCount > 0 && votedCount === voterCount;
  // Nobody has joined yet, so there is nothing to reveal and nothing to count.
  const roomIsEmpty = !revealed && voterCount === 0;

  /* Once the cards are up this card is status only. Every decision left in the
     round — record, re-vote, new sprint, end session — sits in one row under
     the estimate itself, which is what the facilitator is already reading. A
     "Record 13 and continue" up here meant the number and the button that
     commits it were a scroll apart. */
  const primary = revealed
    ? null
    : roomIsEmpty
    ? {
        /* The room's job before anyone arrives is to get them in. This slot
           used to hold a disabled "Reveal everyone's cards" — the loudest
           control on the screen, doing nothing — while the action that
           actually mattered sat in a dismissible banner below it. */
        label: inviteCopied ? "Invite link copied" : "Copy the invite link",
        icon: inviteCopied ? "check" : "link",
        onClick: onInvite,
        disabled: false,
      }
    : {
        label: "Reveal everyone's cards",
        icon: "eye",
        onClick: onReveal,
        disabled: votedCount === 0,
      };

  // Every branch has to be true in the state it renders in. A facilitator
  // sitting alone is not "waiting for votes"; there is nobody who could vote.
  const hint = revealed
    ? needsManualEstimate
      ? "Votes are split. Agree a number below, then record it."
      : "Round complete. The round's actions are under the estimate below."
    : voterCount === 0
      // The button above now says "Copy the invite link", so this says what
      // happens after rather than repeating the instruction.
      ? "Send it to your team. They join in one tap, no account needed."
      : votedCount === 0
        ? `Waiting for the first card from ${voterCount === 1 ? "your voter" : `your ${voterCount} voters`}.`
        : everyoneVoted
          ? "Everyone is in. Reveal when you are ready."
          : "Reveal early if the room has stopped thinking.";

  return (
    <Card variant="raised" as="section" className="action-bar" aria-label="Session controls">
      <Row between nowrap>
        <span className="action-bar-title">
          {revealed ? "Cards are up" : roomIsEmpty ? "Waiting for the table" : "Round in progress"}
        </span>
        {/* "0 of 0 voted" over an empty bar is state that has not happened.
            Zeroes read as data. Neither renders until someone can vote. */}
        {voterCount > 0 && (
          <Chip tone={everyoneVoted ? "success" : undefined} count>
            {votedCount} of {voterCount} voted
          </Chip>
        )}
      </Row>
      {voterCount > 0 && (
        <Progress
          value={votedCount}
          max={voterCount}
          label={`${votedCount} of ${voterCount} voters have played a card`}
          className={everyoneVoted ? "is-complete" : undefined}
        />
      )}
      {primary && (
        <Button variant="primary" size="lg" block onClick={primary.onClick} disabled={primary.disabled}>
          <Icon name={primary.icon} />
          {primary.label}
        </Button>
      )}
      <p className="action-bar-hint" role="status" aria-live="polite">
        {hint}
      </p>
    </Card>
  );
}

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
  // Every derived number on the reveal screen comes from one tested function.
  // See src/estimation.js — the maths is the product, so it lives where it can
  // be tested without a browser.
  const {
    voters,
    voted,
    avg,
    median: medianV,
    min: minV,
    max: maxV,
    spread,
    allSame,
    isFullTableAgreement,
    isRealConsensus,
    unanimousUnknown,
    consensusEstimate,
  } = tally(players);
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

  const finalEstimateOptions = cards.map((c) => c.val);
  const avgDisp = showNum(avg);
  const medianDisp = showNum(medianV);
  const chosenFinalEstimate = allSame ? consensusEstimate : finalEstimate;
  const requiresManualFinalEstimate = revealed && isObs && voted.length > 0 && !allSame;
  // Four controls in one row, so each label is the verb and its object, not a
  // sentence. The estimate is in the label because the button commits it.
  const recordButtonLabel = !chosenFinalEstimate
    ? "Pick the agreed estimate"
    : hasStories && !allStoriesDone
      ? `Record ${chosenFinalEstimate} & next item`
      : `Record ${chosenFinalEstimate} & next round`;
  const revealedVotesSummary = voted.map((p) => p.vote).join(" • ");
  const revealHeroLabel = allSame ? "Agreed estimate" : "Average vote";
  const revealHeroHelper = allSame
    ? "Everyone who voted picked the same card."
    : unanimousUnknown
      ? "Everyone played ?. Nobody has enough to size this yet, clarify the item, then re-vote."
      : "Use the range below to guide the discussion. The facilitator records the final agreed estimate next.";

  /* One record path, not two. The split-vote path had its own copy that hard-
     coded `false` for the consensus flag — which is what `isFullTableAgreement`
     already is when the votes are split. */
  const handleAdvanceToNextItem = useCallback(() => {
    if (!chosenFinalEstimate) return;
    if (hasStories && !allStoriesDone) onRecordStory(chosenFinalEstimate, isFullTableAgreement);
    else onNewRound(chosenFinalEstimate, isFullTableAgreement);
  }, [chosenFinalEstimate, hasStories, allStoriesDone, onRecordStory, onNewRound, isFullTableAgreement]);

  const handleRevoteStory = useCallback(() => {
    onNewRound(null, false);
  }, [onNewRound]);

  const confirmNewSprint = useCallback(() => {
    // Names what actually goes and what stays. "Clears all votes and rounds"
    // was true of the counters and false of the estimates, which survived.
    if (window.confirm("Start a new sprint? This clears every vote, estimate and round for everyone in the room. Your story queue is kept.")) onReset();
  }, [onReset]);

  const confirmEndSession = useCallback(() => {
    if (window.confirm("End the session? This disconnects everyone and permanently deletes all session data.")) onEndSession();
  }, [onEndSession]);

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
    toast(ok ? "Invite link copied." : "Copy blocked by the browser, select the link above and copy it.");
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
    if (names.length > 1) toast(`${names.length} ${estMode.plural} added to the queue.`);
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
    toast(ok ? "Summary copied to your clipboard." : "Copy blocked by the browser, use the CSV download instead.");
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

  const urgent = timer.remaining <= 5;
  const warn = timer.remaining <= 10 && !urgent;

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
        <div className="hdr-in pp-container">
          <div className="hdr-l">
            <Button variant="ghost" size="sm" className="btn-back" onClick={onBack} aria-label="Leave room and return to home">
              ← Leave
            </Button>
            <BrandMark size={34} onClick={onBack} label="Return to home"/>
          </div>
          <div className="hdr-c">
            {/* The room had no heading at all, so a screen reader's heading
                list came back empty and there was nothing to jump to. The
                badges beside it are the visual version of the same fact. */}
            <VisuallyHidden as="h1">
              Planning poker room {code}, round {round}
            </VisuallyHidden>
            <Chip>Round {round}</Chip>
            {/* Same rule as the action bar's count: a gold "0 stories done"
                chip on a room that has not started reads as a score, and the
                only score it can report is nothing. It appears once there is
                something to report. */}
            {storiesDone > 0 && (
              <Chip tone="gold">
                <Icon name="cards" size={16} /> {storiesDone} <span className="badge-long">{storiesDone === 1 ? estMode.singular : estMode.plural} </span>done
              </Chip>
            )}
            {code && <Chip className="room-code-chip">{code}</Chip>}
          </div>
          <div className="hdr-r">
            <ThemeToggle size="sm" />
            <div className="hdr-invite" aria-label="Invite team">
              <div className="hdr-invite-copy">
                <span className="hdr-invite-label">{inviteLabel}</span>
                <span className="hdr-invite-helper">{inviteHelper}</span>
                <span className="hdr-invite-url">{shareUrl}</span>
              </div>
              {/* The label collapses on a phone — the button is beside the room
                  code, the icon says "link", and 160px of nowrap label was
                  pushing the header 24px off a 375px screen. The accessible
                  name is on the button either way. */}
              <Button size="sm" className="hdr-copy" onClick={handleCopyLink} aria-label="Copy invite link to clipboard">
                <Icon name={headerLinkCopied ? "check" : "link"} size={16} />
                <span className="hdr-copy-label">
                  {headerLinkCopied ? "Invite link copied" : "Copy invite link"}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="game-body pp-container">
        {/* The solo banner was a third copy of the same invite: the header
            strip has one, the action bar's primary is now the other, and this
            carried a dismiss button that could hide the only prompt telling a
            new facilitator what to do. A Team Room still gets a line, because
            "the link stays the same every sprint" is information the header
            does not carry — but it is a note, not a competing button. */}
        {players.length === 1 && isPersistentRoom && !solobannerDismissed && (
          <Alert
            tone="gold"
            title="Team Room ready"
            className="solo-invite-banner"
            actions={
              <Button variant="ghost" size="sm" onClick={() => setSoloBannerDismissed(true)}>Dismiss</Button>
            }
          >
            Share the link once. It stays the same every sprint.
          </Alert>
        )}
        {sessionWarning && (
          <Alert tone="warning" title="Session ends soon" className="session-warn-banner">
            This room closes in about 10 minutes. Finish the story you are on.
          </Alert>
        )}

        {/* Current item banner, visible to all players */}
        {activeStory && !allStoriesDone && (
          <Card variant="gold" pad="sm" className="story-name-banner">
            <Eyebrow>Now estimating · {estMode.progressLabel} {activeStoryIdx + 1} of {stories.length}</Eyebrow>
            <p className="story-name-text">{activeStory.name}</p>
          </Card>
        )}
        {allStoriesDone && (
          <Alert tone="success" title={estMode.backlogLabel} className="story-name-banner">
            All {stories.length} {estMode.plural} estimated.
          </Alert>
        )}

        <div className={`game-grid ${isObs ? "as-facilitator" : "as-voter"}`}>
          {/* LEFT COLUMN */}
          <div className="lcol">
            {/* The primary action comes first, above the optional timer.
                Reading order is importance order: what moves the session
                forward, then the tools that support it. */}
            {isObs && (
              <RoomActionBar
                revealed={revealed}
                votedCount={votedCount}
                voterCount={voters.length}
                needsManualEstimate={requiresManualFinalEstimate}
                onReveal={onReveal}
                onInvite={handleCopyLink}
                inviteCopied={headerLinkCopied}
              />
            )}

            {/* Timer. Deliberately a plain panel: it is optional, and it used
                to carry the loudest treatment on the screen (gold glow, full-
                width gold CTA) while the action that actually moves the
                session on sat at the bottom in muted olive. Emphasis now
                matches importance. */}
            <div className="panel">
              <span className="ptitle">
                <Icon name="clock" size={14} /> Estimation timer{" "}
                <span className="ptitle-optional">optional</span>
              </span>
              {isObs ? (
                <>
                  {!timer.running && !revealed && (
                    <>
                      {/* A placeholder is not a label and neither is the panel
                          heading above it: a screen reader used to land on this
                          control announcing only "30 seconds". */}
                      <Select
                        label="Countdown length"
                        value={tsel}
                        onChange={(e) => setTsel(+e.target.value)}
                        options={[
                          { value: 30, label: "30 seconds" },
                          { value: 45, label: "45 seconds" },
                          { value: 60, label: "1 minute" },
                        ]}
                        hint="The team can vote without this. Use it if you want to time-box the round."
                      />
                      <Button block onClick={() => onStart(tsel)}>
                        <Icon name="play" size={18} /> Start {tsel === 60 ? "1 min" : `${tsel}s`} countdown
                      </Button>
                    </>
                  )}
                  {timer.running && (
                    <div className={`ring-area${urgent ? " urgent" : ""}`}>
                      {/* One Timer, not a hand-rolled SVG ring per role. It
                          carries the single role="timer" node; announcing every
                          tick in a live region makes a room unusable on a
                          screen reader. */}
                      <Timer secondsLeft={timer.remaining} total={timer.duration} urgent={urgent} />
                      <div className="rtxt">
                        <div className={`rstatus${urgent ? " danger" : warn ? " warn" : ""}`}>
                          {urgent ? "Time's almost up!" : warn ? "Wrapping up…" : "Estimating…"}
                        </div>
                        <div className="rhint">Cards auto-reveal on zero</div>
                        <Button variant="ghost" size="sm" className="btn-stop" onClick={onStop}>
                          <Icon name="stop" size={16} /> Stop timer
                        </Button>
                      </div>
                    </div>
                  )}
                  {revealed && (
                    <div className="waiting-hint">
                      {requiresManualFinalEstimate
                        ? "Votes are split, discuss briefly, then confirm the agreed estimate."
                        : "Round complete, record it from the row under the estimate when you are ready to continue."}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {timer.running ? (
                    <div className={`ring-area${urgent ? " urgent" : ""}`}>
                      <Timer secondsLeft={timer.remaining} total={timer.duration} urgent={urgent} />
                      <div className="rtxt">
                        <div className={`rstatus${urgent ? " danger" : warn ? " warn" : ""}`}>
                          {urgent ? "Pick a card, NOW!" : warn ? "Last few seconds!" : "Pick your card!"}
                        </div>
                        <div className="rhint">Facilitator reveals the cards</div>
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
            {!isObs && (
            <div className="panel">
              <span className="ptitle">Your Estimate</span>
              {false ? null : (
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
                        // The handlers below already refuse to act once the cards
                        // are up, and tabIndex takes the card out of the tab
                        // order. Neither is visible to a screen reader, which
                        // would otherwise announce nine actionable vote buttons
                        // that silently do nothing (WCAG 4.1.2).
                        aria-disabled={revealed}
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
              <div
                className={`vstatus${myVote && !revealed ? " voted" : " wait"}`}
                style={{ marginTop: 10 }}
                role="status"
                aria-live="polite"
              >
                {revealed
                  ? allSame
                    ? "Consensus reached. The facilitator records it and moves on."
                    : "Cards are up. Discuss the spread while the facilitator confirms the estimate."
                  : myVote
                    ? `You picked ${myVote}. Waiting for the rest of the table.`
                    : "Pick a card to cast your vote."}
              </div>
            </div>
            )}

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
                          {isRealConsensus ? `All ${voted.length} voters picked` : "Everyone who voted picked"} {voted[0].vote}
                        </div>
                      ) : (
                        <div className="avg-hero-sub">
                          {revealHeroHelper}
                        </div>
                      )}
                      {!allSame && minV !== null && (
                        <>
                          <Grid min="110px" className="avg-hero-range">
                            <StatTile label="Min" value={minV} />
                            <StatTile label="Median" value={medianDisp} />
                            <StatTile label="Average" value={avgDisp} gold />
                            <StatTile label="Max" value={maxV} />
                          </Grid>
                          {spread > 0 && (
                            <p className="avg-hero-sub">
                              Spread: {spread} point{spread !== 1 ? "s" : ""} — discuss, then record one final deck value
                            </p>
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
                            {/* Rule 5 again: the tick is a second signal beside
                                the card's gold border, and it says the word too
                                rather than leaving a bare glyph to carry it. */}
                            {allSame && <Chip tone="gold">Agreed</Chip>}
                          </div>
                        );
                      })}
                    </div>
                    {isObs && requiresManualFinalEstimate && (
                      <Card
                        variant="gold"
                        className="inline-final-decision"
                        role="group"
                        aria-label="Facilitator choose final estimate"
                        eyebrow="Facilitator decision"
                        title={unanimousUnknown
                          ? "Nobody could size this one"
                          : "Choose the agreed estimate for this item"}
                      >
                        <p>
                          {unanimousUnknown
                            ? "Every voter played ?. That is a signal the item needs clearer acceptance criteria, not a number. Clarify it and re-vote, or record a placeholder and come back to it."
                            : "The votes are mixed. Select the estimate your team agrees to record, then move straight to the next item. The summary above is only for discussion."}
                        </p>
                        <Grid min="130px" className="inline-final-summary">
                          <StatTile label="Votes shown" value={revealedVotesSummary || null} empty="Nobody has voted yet" />
                          <StatTile label="Average" value={avgDisp} gold />
                          <StatTile
                            label="Spread"
                            value={spread !== null ? `${spread} point${spread !== 1 ? "s" : ""}` : "Different votes"}
                          />
                        </Grid>
                        {/* Selection is aria-pressed on a Choice, not an .active
                            class: a class lets the visual state and the state a
                            screen reader announces disagree. */}
                        <ChoiceGrid cols={5} role="group" aria-label="Choose final estimate">
                          {finalEstimateOptions.map((val) => (
                            <Choice
                              key={val}
                              compact
                              label={val}
                              selected={finalEstimate === val}
                              aria-label={`Record ${val} as the agreed estimate`}
                              onSelect={() => setFinalEstimate(val)}
                            />
                          ))}
                        </ChoiceGrid>
                      </Card>
                    )}
                    {notVoted.length > 0 && (
                      <div className="no-vote">
                        <Icon name="alert" size={16} /> Did not vote: {notVoted.map((p) => p.name).join(", ")}
                      </div>
                    )}
                  </>
                )}

                {/* Every way out of a finished round, in one row, under the
                    number it acts on. These four used to be in three places:
                    record at the top of the column above the timer, re-vote
                    and new sprint below the story queue, end session below
                    that — so deciding meant scrolling past the estimate to
                    find the button that commits it. */}
                {isObs && (
                  <Row className="round-actions" role="group" aria-label="Round actions">
                    <Button
                      variant="primary"
                      size="lg"
                      className={`btn-record-next${isRealConsensus ? " consensus" : ""}`}
                      disabled={!chosenFinalEstimate}
                      onClick={handleAdvanceToNextItem}
                    >
                      <Icon name="arrowRight" size={18} /> {recordButtonLabel}
                    </Button>
                    <Button onClick={handleRevoteStory}>
                      <Icon name="refresh" size={16} /> Re-vote
                    </Button>
                    <Button onClick={confirmNewSprint}>
                      <Icon name="refresh" size={16} /> New sprint
                    </Button>
                    <Button variant="danger" onClick={confirmEndSession}>
                      <Icon name="close" size={16} /> End session
                    </Button>
                  </Row>
                )}
              </div>
            )}

            {/* Facilitator Controls */}
            {isObs && (
              <div className="obs-controls">
                {/* Item queue manager */}
                <div className="story-panel">
                  <div className="story-panel-title" id="story-panel-title"><Icon name="list" size={16} /> {estMode.queueTitle} <span className="story-panel-optional">optional</span></div>
                  <p className="story-panel-hint" id="story-panel-hint">
                    {estMode.hintText}
                  </p>
                  <TextField
                    multiline
                    rows={1}
                    className="story-add-row"
                    /* Not the panel heading again — the heading names the
                       queue, this names what typing here does. */
                    label={`Add ${estMode.singular === "task" ? "a task" : "an item"}`}
                    placeholder={estMode.placeholder}
                    hint={`Paste a whole list, one ${estMode.singular} per line, and every line gets queued at once.`}
                    value={storyInput}
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
                  >
                    <Button disabled={!storyInput.trim()} onClick={() => addStoryLines(storyInput)}>
                      <Icon name="plus" size={16} /> Add
                    </Button>
                  </TextField>
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
                                <IconButton
                                  icon="close"
                                  size="sm"
                                  className="story-item-remove"
                                  label={`Remove ${s.name} from the queue`}
                                  title="Remove from queue"
                                  onClick={() => onRemoveStory?.(i)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Reveal moved to RoomActionBar at the top of this column,
                    and everything a finished round can do moved into the one
                    row under the estimate. What is left here is the mid-round
                    escape hatch: before the cards are up there is no estimate
                    for that row to sit under. */}
                {!revealed && (
                  <>
                    {(round > 1 || storiesDone > 0) && (
                      <Row className="obs-secondary-row">
                        <Button onClick={confirmNewSprint}>
                          <Icon name="refresh" size={16} /> New sprint
                        </Button>
                      </Row>
                    )}
                    {/* Used once, at the end. It carried a divider, a full-width
                        danger block and a hint — three labels and 34,848px² for
                        an irreversible action, second only to the control that
                        runs the session. The confirm dialog states the
                        consequence, so the button does not need to. */}
                    <Row end className="obs-danger-row">
                      <Button variant="danger" size="sm" onClick={confirmEndSession}>
                        <Icon name="close" size={16} /> End session
                      </Button>
                    </Row>
                  </>
                )}
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
                  <Row between className="vp-head" role="status" aria-live="polite">
                    <span>{votedCount} of {voters.length} voted</span>
                    <span>{voters.length - votedCount} waiting</span>
                  </Row>
                  <Progress
                    value={votedCount}
                    max={voters.length}
                    label={`${votedCount} of ${voters.length} voters have played a card`}
                    className="vp-bar"
                  />
                </>
              )}
              {players.length === 0 && (
                <EmptyState title="Nobody here yet">
                  Share the invite link and the table fills up as people arrive.
                </EmptyState>
              )}
              {/* Rule 5: the brass ring on the avatar says "voted" and so does
                  the word beside it. Neither carries the meaning alone. */}
              <ul className="plist">
                {voters.map((p) => (
                  <li key={p.id} className={`prow${p.voted ? " voted" : " not-voted-yet"}`}>
                    <Avatar name={p.name} size="sm" state={p.voted ? "voted" : "waiting"} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pname">
                        {p.name}
                        {p.id === myId ? " (you)" : ""}
                      </div>
                      <div className="prole">
                        {p.voted ? (
                          <span className="voted-label">Voted</span>
                        ) : (
                          <span className="waiting-label">Hasn't voted yet</span>
                        )}
                      </div>
                    </div>
                    <Row nowrap className="prow-actions">
                      {revealed && p.voted && <Chip tone="gold" count>{p.vote}</Chip>}
                      {isObs && p.id !== myId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${p.name} from the room`}
                          onClick={() => onRemoveParticipant(p.id, p.name)}
                        >
                          Remove
                        </Button>
                      )}
                    </Row>
                  </li>
                ))}
                {observers.map((p) => (
                  <li key={p.id} className="prow obs">
                    <Avatar name={p.name} size="sm" facilitator />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pname">
                        {p.name}
                        {p.id === myId ? " (you)" : ""}
                      </div>
                      <div className="prole">Facilitator · No vote</div>
                    </div>
                    <Row nowrap className="prow-actions">
                      {isObs && p.id !== myId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${p.name} from the room`}
                          onClick={() => onRemoveParticipant(p.id, p.name)}
                        >
                          Remove
                        </Button>
                      )}
                    </Row>
                  </li>
                ))}
              </ul>
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
                    <EmptyState title="Nothing recorded yet">
                      Consensus rate, spread, and {estMode.singular} totals appear here after the first
                      recorded estimate.
                    </EmptyState>
                  </div>
                );
              }

              return (
                <div className="panel">
                  <span className="ptitle">Sprint Analytics</span>

                  {/* ── Section 1: Sprint Snapshot ──
                      A stack, not a Grid: three tiles auto-fitted two-up in a
                      258px rail and orphaned the third on a row of its own. */}
                  <div className="a-kpis">
                    <StatTile
                      label={`${estMode.plural.charAt(0).toUpperCase() + estMode.plural.slice(1)} sized`}
                      value={storiesDone}
                    />
                    <StatTile
                      label={isTshirt ? "Most used size" : "Sprint scope"}
                      value={(isTshirt ? tshirtMostCommon : scopeDisp) === "—" ? null : isTshirt ? tshirtMostCommon : scopeDisp}
                      empty="After the first estimate"
                    />
                    <StatTile
                      label={isTshirt ? "Size mix" : `Avg / ${estMode.singular}`}
                      value={(isTshirt ? tshirtSizeMix : avgDisp2) === "—" ? null : isTshirt ? tshirtSizeMix : avgDisp2}
                      empty="After the first estimate"
                    />
                  </div>

                  {/* ── Section 2: Team Alignment ── */}
                  <div className="a-align">
                    <Row between className="a-align-head">
                      <span className="a-align-title">Team Alignment</span>
                      {/* Rule 5: the bar's colour band is a second signal, never
                          the only one — the word says the same thing. */}
                      {consensusRate !== null && (
                        <Chip tone={fillClass === "good" ? "success" : fillClass === "low" ? "danger" : fillClass === "ok" ? "warning" : undefined}>
                          {alignLabel ? `${alignLabel} · ${consensusRate}%` : `${consensusRate}%`}
                        </Chip>
                      )}
                    </Row>
                    <Progress
                      value={consensusRate ?? 0}
                      label={`Team alignment ${consensusRate ?? 0} per cent`}
                      className={`a-align-bar ${fillClass}`}
                    />
                    <div className="a-align-sub">{alignSub}</div>
                    <div className="a-align-note">% of {estMode.plural} where all voters agreed on the first vote</div>
                  </div>

                  {/* ── Section 3: T-shirt size breakdown ── */}
                  {isTshirt && tshirtBreakdown.length > 0 && (
                    <div className="analytics-size-breakdown">
                      <div className="analytics-breakdown-title">
                        T-Shirt size breakdown
                      </div>
                      <Grid min="72px" className="analytics-size-grid">
                        {tshirtBreakdown.map(({ size, count }) => (
                          <StatTile
                            key={size}
                            label={size}
                            value={count}
                            meta={count === 1 ? estMode.singular : estMode.plural}
                          />
                        ))}
                      </Grid>
                    </div>
                  )}

                  {/* ── Section 4: Sized this sprint ── */}
                  <div className="a-stories">
                    <div className="a-section-title">
                      {estMode.plural.charAt(0).toUpperCase() + estMode.plural.slice(1)} sized{listedStories.length > 0 ? ` (${listedStories.length})` : ""}
                    </div>
                    {listedStories.length > 0 ? (
                      <ResultsTable
                        className="a-story-list"
                        columns={[
                          { key: "idx", label: "#", numeric: true },
                          { key: "name", label: estMode.singular.charAt(0).toUpperCase() + estMode.singular.slice(1) },
                          { key: "estimate", label: "Estimate", numeric: true },
                        ]}
                        rows={listedStories.map((st, i) => ({
                          id: i,
                          idx: i + 1,
                          name: st.name,
                          estimate: `${st.estimate}${unitLabel}`,
                        }))}
                      />
                    ) : (
                      <EmptyState title={`No ${estMode.plural} sized yet`}>
                        {storiesDone > 0
                          ? `Add ${estMode.singular} names to the queue to track estimates here.`
                          : `Estimates appear here after the first recorded round.`}
                      </EmptyState>
                    )}
                  </div>

                  {/* ── Section 5: Estimate distribution ── */}
                  {!isTshirt && breakdown.length > 0 && (
                    <div className="analytics-breakdown">
                      <div className="analytics-breakdown-title">
                        {deckLabel} — point distribution
                      </div>
                      <Row className="analytics-chips">
                        {breakdown.map(([val, cnt]) => (
                          <Chip key={val} tone="gold">
                            {val}{unitLabel} <span className="analytics-chip-cnt">×{cnt}</span>
                          </Chip>
                        ))}
                      </Row>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Estimation Spree, shown when streak ≥ 1, all players saw same consensus */}
            {streak > 0 && (
              <Alert
                tone="gold"
                className={`streak-panel${streak >= 3 ? " streak-hot" : ""}`}
                title={
                  <>
                    <span className="streak-fire" aria-hidden="true">
                      {"\u2666".repeat(streak >= 5 ? 3 : streak >= 3 ? 2 : 1)}
                    </span>{" "}
                    {streak === 1 ? "Estimation spree!" : `${streak}-round spree!`}
                  </>
                }
              >
                {streak >= 5
                  ? "Unstoppable. The team is perfectly aligned."
                  : streak >= 3
                  ? "Team is locked in, great backlog clarity"
                  : streak === 2
                  ? "Two in a row, team understands the work"
                  : "First consensus, everyone on the same page"}
              </Alert>
            )}

            {/* Session summary, works with or without a named queue */}
            {summaryRows.length > 0 && (
              <div className="panel">
                <span className="ptitle">Sprint Summary</span>
                <ResultsTable
                  className="summary-rows"
                  caption={`${summarySized} of ${summaryRows.length} sized${summaryTotalPoints !== null ? ` · ${summaryTotalPoints} points total` : ""}`}
                  columns={[
                    { key: "name", label: "Item" },
                    { key: "estimate", label: "Estimate", numeric: true },
                  ]}
                  rows={summaryRows.map((row, i) => ({
                    id: i,
                    name: row.name,
                    estimate: row.estimate != null ? row.estimate : "—",
                  }))}
                />
                <Row className="summary-actions">
                  <Button size="sm" onClick={copySummary}><Icon name="copy" size={16} /> Copy</Button>
                  <Button size="sm" onClick={downloadSummaryCsv}><Icon name="arrowRight" size={16} /> CSV</Button>
                </Row>
                {showWtpPoll && <WtpPoll onDone={() => setWtpDone(true)} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

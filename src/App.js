import { useState, useEffect, useLayoutEffect, useCallback, useRef, lazy, Suspense } from "react";
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
  Participant,
  ParticipantList,
  Progress,
  Prose,
  rememberDialogOpener,
  ResultsTable,
  RevealCard,
  RevealGrid,
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
  VoteCard,
  VoteHand,
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
  SUPPORT_EMAIL,
  SUPPORT_FAQ,
  ROUTE_CONTENT,
  alternatesFor,
} from "./routeMeta.mjs";
import {
  t,
  tList,
  getLocale,
  withLocale,
  splitLocalePath,
  LOCALES,
  LOCALE_CODES,
  LOCALIZED_PATHS,
} from "./i18n.mjs";
import {
  tally,
  isTimeUp,
  summaryCsv,
  showNum,
  teamCode,
  sprintResetUpdates,
  deleteSizedItemUpdates,
  sprintHistoryStats,
  cleanRoomCode,
  mkCode,
  playerId as uid,
} from "./estimation";
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

/* hreflang has to follow client-side navigation too. The prerendered document
   arrives with the correct cluster for the page it was built as; without this,
   navigating from /de/ to /de/scrum-poker would leave the home page's
   alternates in the head, pointing four URLs at the wrong page. */
function applyAlternates(basePath) {
  document.head
    .querySelectorAll('link[rel="alternate"][hreflang]')
    .forEach((node) => node.remove());
  const alternates = alternatesFor(basePath);
  if (!alternates.length) return;
  const add = (hreflang, href) => {
    const node = document.createElement("link");
    node.setAttribute("rel", "alternate");
    node.setAttribute("hreflang", hreflang);
    node.setAttribute("href", href);
    document.head.appendChild(node);
  };
  alternates.forEach((a) => add(a.hreflang, a.url));
  add("x-default", alternates.find((a) => a.code === "en").url);
}

function applyRouteMeta(meta) {
  const next = { ...DEFAULT_META, ...meta };
  document.title = next.title;
  /* meta.basePath, not next.basePath: DEFAULT_META carries "/" and the spread
     would hand the home page's four alternates to every noindex room URL. */
  applyAlternates(meta.basePath);
  /* The document's own language has to follow client-side navigation, and it
     has to come from the URL rather than from getLocale(). Only four pages are
     translated, so a Japanese reader clicking through to /pricing lands on a
     page that genuinely is English — getLocale() still says "ja" there, which
     tells a screen reader to read English with Japanese phonemes. The URL gets
     every case right: /ja/scrum-poker is ja, /pricing is en however you
     arrived, and /ja/?room=ABC12 is ja because the app UI is translated even
     though a room is not a content page. */
  const docLocale = splitLocalePath(window.location.pathname).locale;
  document.documentElement.lang = LOCALES[docLocale].hreflang;
  upsertMeta(
    'meta[property="og:locale"]',
    "meta",
    { property: "og:locale" },
    LOCALES[docLocale].ogLocale,
  );
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
    get label() { return t("deck.fibonacci"); },
    get desc() { return t("deck.fibonacci.desc"); },
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
    get label() { return t("deck.tshirt"); },
    get desc() { return t("deck.tshirt.desc"); },
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
    get label() { return t("deck.powers"); },
    get desc() { return t("deck.powers.desc"); },
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
    get label() { return t("mode.stories.label"); },
    get desc() { return t("mode.stories.desc"); },
    get singular() { return t("mode.stories.singular"); },
    get plural() { return t("mode.stories.plural"); },
    get queueTitle() { return t("mode.stories.queueTitle"); },
    get progressLabel() { return t("mode.stories.progressLabel"); },
    get bannerLabel() { return t("mode.stories.bannerLabel"); },
    get allDoneText() { return t("mode.stories.allDoneText"); },
    get backlogLabel() { return t("mode.stories.backlogLabel"); },
    get toastDone() { return t("mode.stories.toastDone"); },
    get toastNext() { return t("mode.stories.toastNext"); },
    get placeholder() { return t("mode.stories.placeholder"); },
    get hintText() { return t("mode.stories.hintText"); },
    get recordNext() { return t("mode.stories.recordNext"); },
  },
  tasks: {
    key: "tasks",
    get label() { return t("mode.tasks.label"); },
    get desc() { return t("mode.tasks.desc"); },
    get singular() { return t("mode.tasks.singular"); },
    get plural() { return t("mode.tasks.plural"); },
    get queueTitle() { return t("mode.tasks.queueTitle"); },
    get progressLabel() { return t("mode.tasks.progressLabel"); },
    get bannerLabel() { return t("mode.tasks.bannerLabel"); },
    get allDoneText() { return t("mode.tasks.allDoneText"); },
    get backlogLabel() { return t("mode.tasks.backlogLabel"); },
    get toastDone() { return t("mode.tasks.toastDone"); },
    get toastNext() { return t("mode.tasks.toastNext"); },
    get placeholder() { return t("mode.tasks.placeholder"); },
    get hintText() { return t("mode.tasks.hintText"); },
    get recordNext() { return t("mode.tasks.recordNext"); },
  },
};
const getEstMode = (mode) => ESTIMATION_MODES[mode] || ESTIMATION_MODES.stories;
const INVALID_PLACEHOLDER_NAMES = new Set(["alex johnson", "e.g. alex johnson"]);
/* Team Room URLs may carry a locale prefix, so the matcher has to allow one —
   without it, /de/t/my-team fell through to the join screen. Built from the
   real prefixes rather than a loose [a-z]{2}, so it stays in step with the
   locale table and never claims a path that is not a language.

   vercel.json carries the matching rewrite and the noindex header for the same
   set; a prefix here without one there is a 404 in production. */
const LOCALE_PREFIX_RE = LOCALE_CODES.map((c) => LOCALES[c].prefix)
  .filter(Boolean)
  .map((p) => p.replace("/", "\\/"))
  .join("|");
const TEAM_ROUTE = new RegExp(`^(?:${LOCALE_PREFIX_RE})?/t/([a-z0-9-]+)$`, "i");
// Leaving a room in a Japanese session lands on /ja/, not on the English home.
const homePath = () => withLocale(getLocale(), "/");
/* Both carry the locale. A Japanese facilitator who copies the invite link and
   pastes it into the team chat was otherwise sending everyone to the English
   app — the room worked, but the room was the one place the whole team ended
   up, in the wrong language, because of a prefix the sharer never saw. */
const roomPath = (code) => `${withLocale(getLocale(), "/")}?room=${encodeURIComponent(code)}`;
const teamRoomPath = (teamNameOrCode) =>
  `${LOCALES[getLocale()].prefix}/t/${teamCode(teamNameOrCode)}`;
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

/* The document's leading, which nothing had ever set. Without it the default
   for the whole app was the browser's "normal" — a font-metric guess, ~1.24
   for Outfit and a different number for every fallback face — so the type only
   obeyed the scale where a rule happened to name a token, and 142 elements on
   the home page alone were running on the guess. --lh-snug is the UI default;
   prose (--lh-body) and display (--lh-tight) override it where they already
   do. Form controls need naming separately because the UA stylesheet pins them
   to "normal" rather than letting them inherit.

   No backticks in this block: the whole stylesheet is a JS template literal,
   so one would end the string and take the rest of the app with it. */
body { line-height: var(--lh-snug); }
button, input, select, textarea { line-height: inherit; }

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

   ═══════════════════════════════════════════════ */
.action-bar {
  /* The card is the design system's; what is local is that this one follows
     the column on a desktop, where there is height to spare.

     It parks BELOW the header, and it loses to the header when they meet.
     Both halves of that were wrong and the two faults hid each other: the
     offset was var(--sp-3), which is 12px from the top of the VIEWPORT and
     therefore inside a header that is 61-100px tall, and the z-index was
     var(--z-sticky) — the header's own — so the tie went to whichever came
     later in the DOM. That is this card. Scrolling a room printed "CARDS ARE
     UP" across "← Leave" and the vote count across the invite link.

     --hdr-h is measured (useHeaderHeight); see the token for why no literal
     can stand in for it. --z-raised keeps the card above the panels it
     scrolls over and under the one bar that must never be covered. */
  position: sticky;
  top: calc(var(--hdr-h) + var(--sp-3));
  z-index: var(--z-raised);
  /* The card's own surface is 76% opaque, which is right for something sitting
     ON the page and wrong for something the page slides UNDER: once the offset
     above made it stick properly, the story queue read straight through it —
     "1. Story 1", "2. Story 2" printed across the invite button. Frosted, not
     opaque, and the same 20px the header uses, because they are the same
     material doing the same job one above the other. Unprefixed only, like
     .hdr: Safari has not needed -webkit- for this since 15.4.

     Paid for out of the declaration ceiling by deleting the no-op
     "display: block" on .timer-setup + .pp-hint, so the ratchet stays at
     1370 rather than moving the wrong way. No backticks in this file's
     stylesheet: it is one JS template literal and a backtick ends it. */
  backdrop-filter: blur(20px);
}
.action-bar-title {
  font-size: var(--fs-1);
  font-weight: var(--fw-semi);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}
.action-bar-hint {
  font-size: var(--fs-2); letter-spacing: var(--fs-2-tracking);
  line-height: var(--lh-snug);
  color: var(--text-3);
  text-align: center;
}
/* .pp-progress.is-complete moved to the "complete" Progress tone. */

@media (max-width: 780px) {
  /* This block used to dock the bar to the bottom of the phone viewport with
     position: sticky and bottom: 0, and it has never once done so. Bottom
     stickiness only pulls a box UP when its flow position would put it below
     the scrollport edge; it does not push a box DOWN from a flow position that
     is already on screen, and this bar sits near the top of its column. The
     result was a full-bleed card with two square corners and home-indicator
     padding stranded in the middle of the page. A real thumb-arc dock is
     position: fixed and costs 150px of a 812px screen for the whole session,
     which is a product decision, not a CSS repair. In flow the bar is already
     the loudest thing above the fold, so it stays in flow and keeps the
     gutters every other panel uses. */
  .action-bar { position: static; }
}

html { font-size: 16px; scroll-behavior: smooth; background-color: var(--bg); }
html, body, * {
  scrollbar-width: thin;
  /* Firefox reads this, WebKit reads the block below. Both must name the same
     role: --gold is the brand gold in either theme by design, so pointing the
     Firefox thumb at it painted a full-saturation brass bar down the edge of
     every scrolling panel in the light theme. */
  scrollbar-color: var(--scroll-thumb-flat) var(--scroll-track);
}
*::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}
*::-webkit-scrollbar-track {
  background: var(--scroll-track);
  border-radius: var(--r-full);
}
*::-webkit-scrollbar-thumb {
  background: var(--scroll-thumb);
  border-radius: var(--r-full);
  border: 2px solid var(--scroll-thumb-border);
}
*::-webkit-scrollbar-thumb:hover { background: var(--gold); }
*::-webkit-scrollbar-corner { background: transparent; }
body {
  font-family: var(--font-ui);
  background:
    radial-gradient(circle at top, var(--page-wash-1), transparent 34%),
    radial-gradient(circle at 82% 14%, var(--page-wash-2), transparent 22%),
    var(--page-ground);
  min-height: 100vh;
  color: var(--cream);
  /* No overflow-x: hidden here. One hidden axis forces the other to compute to
     auto, so body became a scroll container, and every position: sticky in the
     product then measured itself against a box with nothing to scroll — the
     phone action bar below has always been written to dock into the thumb arc
     and has never once done it. The guard was also guarding nothing: no route
     overflows horizontally at 320, 375 or 1280. */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Accessible focus ring — visible for keyboard, invisible for mouse.
   This rule and the one in base.css have identical specificity, and this file
   is injected from <body> so it wins. It used to paint --gold2, which is
   brass-300 in BOTH themes: a #ffd978 ring on paper measures 1.4:1, so keyboard
   focus was invisible for every light-theme user. --focus is the role that
   moves with the theme (brass-300 on felt, brass-700 on paper, ≥4.4:1 either
   way). */
:focus-visible {
  outline: 2.5px solid var(--focus);
  outline-offset: 3px;
  border-radius: var(--r-xs);
}
:focus:not(:focus-visible) { outline: none; }

/* Subtle felt texture */
body::before {
  content: '';
  position: fixed; inset: 0; z-index: var(--z-base); pointer-events: none;
  background-image:
    radial-gradient(ellipse 80% 55% at 50% 0%, var(--felt-wash-1) 0%, transparent 62%),
    radial-gradient(ellipse 46% 36% at 88% 92%, var(--felt-wash-2) 0%, transparent 58%),
    url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");
  background-size: cover, cover, 200px 200px;
}

/* .app — child of .page-shell flex column; flex:1 ensures it fills available space */
.app { flex: 1; display: flex; flex-direction: column; position: relative; z-index: var(--z-raised); }

/* ── ANIMATIONS ── */
@keyframes fadeUp   { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
@keyframes spin     { to { transform: rotate(360deg); } }
@keyframes urgentBg { 0%,100% { background: color-mix(in oklab, var(--danger) 10%, transparent); } 50% { background: color-mix(in oklab, var(--danger) 24%, transparent); } }
@keyframes heroIn   { from { opacity:0; transform:scale(.92) translateY(12px); } to { opacity:1; transform:none; } }
@keyframes badgePop  { 0% { transform:scale(0.7); opacity:0; } 70% { transform:scale(1.08); } 100% { transform:scale(1); opacity:1; } }
@keyframes consensusIn { 0% { opacity:0; transform:scale(.88) translateY(16px); } 60% { transform:scale(1.03) translateY(-4px); } 100% { opacity:1; transform:scale(1) translateY(0); } }

/* ══════════════════════ CONFETTI CANVAS ══════════════════════ */
.confetti-canvas {
  position: fixed; inset: 0; z-index: var(--z-confetti);
  pointer-events: none; width: 100%; height: 100%;
}

/* ══════════════════════ CONSENSUS OVERLAY ══════════════════════ */
.consensus-overlay {
  position: fixed; inset: 0; z-index: var(--z-modal);
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.consensus-burst {
  text-align: center;
  animation: consensusIn var(--dur-celebrate) var(--ease-flip) both;
}
.consensus-burst-emoji { font-size: var(--fs-9); display: block; margin-bottom: var(--sp-2); }
.consensus-burst-text {
  font-family: var(--font-ui);
  font-size: var(--fs-7); font-weight: var(--fw-bold); color: var(--gold-ink2);
  letter-spacing: -0.02em;
  text-shadow: var(--glow-accent);
  line-height: var(--lh-tight);
}
.consensus-burst-sub {
  font-size: var(--fs-2); color: var(--text-1);
  margin-top: var(--sp-2); font-weight: var(--fw-regular); letter-spacing: .5px;
  text-shadow: var(--glow-display);
}

/* ══════════════════════ JOIN SCREEN ══════════════════════ */
/* Edge to edge, like every band. The gutters belong to the containers inside
   it — the form column and the SEO band each carry their own. */
.join-wrap {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  padding: var(--sp-10) 0 var(--sp-20); animation: fadeIn var(--dur-slow) var(--ease-out); overflow-y: auto;
}
/* Single column by default — the hero reads first, then the form, which is
   the right order on a phone where they cannot share a row. */
.join-layout { max-width: calc(440px + var(--gutter) * 2); }
.join-mark { display: flex; justify-content: center; margin-bottom: var(--sp-5); }

/* The panel the whole product is entered through. It used to carry a 155deg
   three-stop gradient, a white veil, a cyan inner ring, a 110px shadow off the
   elevation scale, a full-panel backdrop-filter and an infinitely shimmering
   rainbow hairline. That is six treatments doing the job of one: this is a
   card, and the system already knows how to draw a card.

   What is left is a flat surface, the hairline, --elev-3 because it is the one
   raised object on the screen, and a single brass rule along the top edge that
   points at the brass button 500px below it. */
.join-box {
  width: 100%; max-width: 440px;
  background: var(--surface-1);
  border: var(--bw-hair) solid var(--border-subtle);
  border-radius: var(--r-xl);
  padding: var(--sp-12) var(--sp-10) var(--sp-10);
  box-shadow: var(--elev-3);
  position: relative; overflow: hidden;
  animation: fadeUp var(--dur-slow) var(--ease-out) both;
}
.join-box::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--action) 30%, var(--action) 70%, transparent);
}
.join-title {
  font-family: var(--font-ui);
  font-size: var(--fs-section); font-weight: var(--fw-bold);
  color: var(--cream); text-align: center;
  margin-bottom: var(--sp-1); letter-spacing: -0.03em; line-height: var(--lh-tight);
  text-shadow: var(--glow-display);
}
.join-sub {
  text-align: center; color: var(--text-2);
  font-size: var(--fs-2); margin-bottom: var(--sp-5); font-weight: var(--fw-light); letter-spacing: .5px;
  max-width: 44ch; margin-left: auto; margin-right: auto; line-height: var(--lh-body);
}
.join-sub.workspace {
  margin-bottom: var(--sp-6);
  letter-spacing: .2px;
}
/* Card-suit value strip under the hero — replaces the old "compare plans" CTA */
.trust-strip {
  list-style: none; margin: 0 0 var(--sp-6); padding: 0;
  display: flex; flex-wrap: wrap; justify-content: center; gap: var(--sp-2);
}
/* No line-height here: these pills used to have none and took their height
   from Outfit's font metrics, but the body rule at the top of this stylesheet
   now gives them --lh-snug by inheritance, which is exactly what a label
   wants. Setting it again would be the same number written twice. */
.trust-strip li {
  font-size: var(--fs-1); font-weight: var(--fw-medium); letter-spacing: var(--fs-1-tracking);
  color: var(--text-2);
  background: var(--tint-raise-2);
  border: 1px solid var(--border);
  border-radius: var(--r-full); padding: var(--sp-1) var(--sp-3);
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
  /* Only the alignment changes here now. The size used to be a second clamp
     that ran 2.1→2.75rem against the base rule's 1.75→2.35rem, so the heading
     jumped a step at exactly 1024px; --fs-section is already fluid across the
     whole range and does the job with one declaration. */
  .join-title { text-align: left; }
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
.workspace-panel { margin-top: var(--sp-6); }
/* Not a .panel, so it carries its own gap — but the same eyebrow gets the same
   gap under it wherever it appears. */
.workspace-panel .ptitle { margin-bottom: var(--sp-3); }
.workspace-room-card { min-width: 0;
}
.workspace-room-name {
  min-width: 0;
  font-family: var(--font-ui);
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
  border: var(--bw-hair) solid var(--gold-line-1);
  background: var(--tint-raise-2);
}
.workspace-team-url code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
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
  border: var(--bw-hair) solid var(--gold-line-1);
  padding: 0 var(--sp-3);
  background: var(--gold-fill-1);
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
.join-note--centred { text-align: center; margin: var(--sp-3) 0 0; }

@media (max-width: 780px) {
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

.err { color: var(--danger); font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); margin-bottom: var(--sp-3); text-align: center; }
.tcp-code { font-family: var(--font-mono); font-size: var(--fs-2); font-weight: var(--fw-bold); color: var(--mint2); letter-spacing: .1em; flex: 1; }

/* Both are write-once for the life of the room — database.rules.json validates
   them with "newData.val() === data.val()" because every vote is checked
   against the room's deck. Say so where the choice is made. */
.choice-permanence {
  font-size: var(--fs-2); letter-spacing: var(--fs-2-tracking);
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
  margin: 0; padding-left: 1.3em; font-weight: var(--fw-light);
}
/* Inside a Card, so it takes the card body's size. */
.seo-ol { font-size: var(--fs-2); letter-spacing: var(--fs-2-tracking); }
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
.seo-ul strong { color: var(--text-1); font-weight: var(--fw-semi); }
.seo-inline-link {
  color: var(--gold-ink2);
  text-decoration: none;
  font-weight: var(--fw-semi);
}
.seo-inline-link:hover { color: var(--gold-ink3); text-decoration: underline; }
.scroll-target { scroll-margin-top: var(--sp-24); }
#plans.scroll-target { scroll-margin-top: var(--sp-20); }
.seo-plan-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  color: var(--text-2);
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking);
  line-height: var(--lh-body);
}
.seo-plan-list li::before {
  content: "✓";
  color: var(--gold-ink2);
  margin-right: var(--sp-3);
}
.seo-plan-actions { justify-content: center; }
/* ══════════════════════ ROOM HEADER (game view) ══════════════════════
   In a room this IS the banner: it carries the brand, the round, the code,
   Leave, the theme toggle and the invite. The marketing navbar carries the
   brand and the theme toggle too, so stacking the two put the same wordmark
   and the same toggle on screen twice, 65px apart, and gave the page two
   role="banner" landmarks. The phone breakpoint had already worked this out
   and hidden the navbar; the argument does not change with width. */
.in-room .navbar { display: none; }
.hdr {
  background: var(--surface-bar-solid);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(20px);
  position: sticky; top: 0; z-index: var(--z-sticky);
}
/* ONE ROW, ALWAYS. This used to be flex-wrap: wrap, and wrapping is the wrong
   failure mode for a sticky bar: flex wraps BEFORE it shrinks, so the moment
   the three groups wanted one pixel more than the container had, the whole
   right-hand group dropped to a second line and the bar went from 60px to
   142px — a seventh of an iPad's viewport, permanently, on every screen in the
   room.

   The width it needs is not fixed either, which is why no breakpoint alone can
   solve this: the centre group grows when the stories-done badge appears, so a
   header that fitted at 1024px on an empty room stopped fitting two rounds in.
   Content decides, not viewport.

   So: nothing wraps, and one group absorbs the pressure. --hdr-r is the one,
   because the least important thing in the bar lives inside it — the invite
   URL, which is already ellipsised and whose only job is reassurance, since
   the button beside it is what actually copies the link. Everything else in
   the bar is either an action or a code somebody reads out loud. */
.hdr-in {
  display: flex; align-items: center; justify-content: space-between;
  min-height: 60px; gap: var(--sp-3); flex-wrap: nowrap; padding-block: var(--sp-3);
}
.hdr-l { display: flex; align-items: center; gap: var(--sp-3); flex: none; }
/* 0 1 auto, not none: the chips hold their natural width until there is
   genuinely nowhere left to take it from, and only then give way. */
.hdr-c { display: flex; align-items: center; gap: var(--sp-2); flex: 0 1 auto; min-width: 0; flex-wrap: nowrap; justify-content: center; }
.hdr-r { display: flex; align-items: center; gap: var(--sp-2); flex: 1 1 auto; min-width: 0; justify-content: flex-end; }
.hdr-invite {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  border: var(--bw-hair) solid var(--gold-line-1);
  background: var(--tint-raise-2);
}
.hdr-invite-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
/* All three lines in this panel are single-line labels in a box that is now
   allowed to shrink, so all three truncate the same way. The label was the one
   without it: at 168px "TEMPORARY ROOM LINK" wrapped to two lines and took the
   sticky header from 94px to 111px, which is the wrapping bug one level down. */
.hdr-invite-label {
  font-size: var(--fs-1);
  font-weight: var(--fw-bold);
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  font-family: var(--font-mono);
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking);
  color: var(--mint2);
}

/* ══════════════════════ LAYOUT ══════════════════════ */
.game-body { padding-block: var(--sp-6) var(--sp-20); }
.game-grid { display: grid; grid-template-columns: 1fr 300px; gap: var(--gap); align-items: start; }
.lcol, .rcol { display: flex; flex-direction: column; gap: var(--gap); }

/* ══════════════════════ PANEL ══════════════════════ */
/* One container treatment for the whole product. .story-panel and
   .workspace-panel are the same object as .panel — a titled box standing on
   its own in a column — but were painted with --tint-raise instead of a
   surface, so in the light theme the story queue was a grey-green rectangle
   sitting between two ivory ones. Same shape, same paint; only their internal
   rhythm differs, so they are deliberately left out of the child-flow rule
   below. The backdrop-filter went with it: a blur behind an opaque surface
   costs a compositor layer and renders nothing. */
.panel, .story-panel, .workspace-panel {
  background: var(--surface-1);
  border: var(--bw-hair) solid var(--border-subtle); border-radius: var(--r-md);
  padding: var(--sp-5);
  box-shadow: var(--shadow-soft), var(--inset-hi);
}
.panel-gold { border-color: var(--gold-line-1); box-shadow: var(--shadow-soft), var(--inset-hi); }
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
/* Countdown length and Start are one decision, so they share a row.
   align-items: end, not center: the select carries a label above it and the
   button does not, so the only edge the two have in common is the bottom one.
   Both controls are min-height var(--control-md), so aligning there lines up
   the whole of each.
   Wrap rather than a breakpoint. This panel lives in a rail whose width does
   not track the viewport, so a media query would be measuring the wrong box;
   the two flex bases just stop fitting and each takes a full row, at whatever
   width that happens to be. */
.timer-setup { display: flex; flex-wrap: wrap; align-items: end; gap: var(--sp-3); }
.timer-setup > .pp-field { flex: 1 1 9rem; min-width: 0; }
.timer-setup > .pp-btn { flex: 1 1 11rem; }
/* 8px, not the panel's 16: the hint belongs to the row above it, and a hint
   spaced like a sibling block reads as being about the whole panel.
   The "display: block" that used to sit here did nothing — the hint is a <p>,
   .pp-hint sets no display, and nothing above it changes one. Verified by
   reverting the declaration on the live element: block either way. */
.timer-setup + .pp-hint { margin-top: var(--sp-2); }
.ptitle {
  font-size: var(--fs-1); font-weight: var(--fw-semi); letter-spacing: 2.5px;
  text-transform: uppercase; color: var(--text-3);
  display: block;
}
.ring-area {
  display: flex; align-items: center; gap: var(--sp-4);
  padding: var(--sp-4); background: var(--tint-raise);
  border-radius: var(--r-md); border: 1px solid var(--border);
}
.ring-area.urgent { animation: urgentBg 1.1s var(--ease-out) infinite; }
.rtxt { flex: 1; }
.rstatus { font-size: var(--fs-1); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: var(--sp-1); color: var(--text-2); }
.rstatus.warn { color: var(--warning); } .rstatus.danger { color: var(--danger); }
.rhint { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-top: var(--sp-1); }
.waiting-hint { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); font-style: italic; text-align: center; padding: var(--sp-2) 0; }

.vstatus { text-align: center; font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); padding: var(--sp-2) 0; }
.vstatus.voted { color: var(--gold-ink); }
.vstatus.wait  { color: var(--text-3); font-style: italic; }

/* ══════════════════════ RESULTS HERO ══════════════════════ */
.avg-hero {
  text-align: center; padding: var(--sp-8) var(--sp-6);
  background: var(--gold-fill-2);
  border: var(--bw-thick) solid var(--gold-line-2); border-radius: var(--r-lg);
  margin-bottom: var(--sp-5); animation: heroIn var(--dur-flip) var(--ease-out);
  box-shadow: 0 0 50px var(--gold-glow), var(--elev-2);
}
/* Same floor as .pp-card__body: the hero's children each hand-margined their
   own gap and the range grid declared none, so the sentence pointing at the
   tiles touched them. Collapses with a larger declared margin, and the rules
   below win on source order where they set their own. */
.avg-hero > * + * { margin-top: var(--sp-3); }
.avg-hero-label {
  font-size: var(--fs-1); font-weight: var(--fw-semi); letter-spacing: 2.5px;
  text-transform: uppercase; color: var(--text-2); margin-bottom: var(--sp-3);
}
.avg-hero-num {
  font-family: var(--font-ui);
  font-size: var(--fs-estimate); color: var(--gold-ink2); font-weight: var(--fw-bold);
  line-height: 1; letter-spacing: -0.05em; text-shadow: var(--glow-numeral);
  animation: heroIn var(--dur-slow) var(--ease-out) both;
}
/* No margin-top: the rule three lines up already gives it exactly --sp-3, and
   this sub is never the first child of .avg-hero. Measured on both instances
   live — 12px either way. */
.avg-hero-sub { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-2); }
.avg-hero-consensus {
  display: inline-block; margin-top: var(--sp-4);
  background: var(--gold-fill-3); border: var(--bw-hair) solid var(--gold-line-2);
  border-radius: var(--r-full); padding: var(--sp-2) var(--sp-5);
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); font-weight: var(--fw-semi); color: var(--gold-ink2);
  animation: badgePop var(--dur-flip) var(--dur-base) var(--ease-out) both;
}

/* ══════════════════════ WHO PICKED WHAT ══════════════════════ */
.who-section { margin-bottom: var(--sp-2); }
.no-vote { text-align: center; color: var(--text-3); font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); padding: var(--sp-2) 0; }

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
.story-panel { margin-bottom: var(--sp-3); }
.story-panel-title { font-size: var(--fs-1); font-weight: var(--fw-semi); letter-spacing: 2px; text-transform: uppercase; color: var(--text-3); margin-bottom: var(--sp-1); display: flex; align-items: center; gap: var(--sp-2); }
.ptitle-optional, .story-panel-optional { font-size: var(--fs-1); font-weight: var(--fw-medium); letter-spacing: 1px; text-transform: uppercase; color: var(--gold-ink3); background: var(--gold-fill-1); border: var(--bw-hair) solid var(--gold-line-1); border-radius: var(--r-lg); padding: 1px var(--sp-2); }
.story-panel-hint { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-bottom: var(--sp-3); line-height: var(--lh-body); font-style: italic; }
.story-progress { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-bottom: var(--sp-3); }
.story-add-row { display: flex; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.story-list { max-height: 168px; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-1); }
.story-item { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); padding: var(--sp-1) var(--sp-2); border-radius: var(--r-xs); display: flex; gap: var(--sp-2); justify-content: space-between; align-items: center; }
.story-item.done { color: var(--text-3); text-decoration: line-through; }
.story-item.active { background: var(--goldB); color: var(--gold-ink2); font-weight: var(--fw-semi); }
.story-item.queued { color: var(--text-2); }
.story-item-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.story-est { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); opacity: .7; flex-shrink: 0; }
.story-item-remove {
  flex-shrink: 0; width: 24px; height: 24px; line-height: 1; /* WCAG 2.5.8 */
  border-radius: var(--r-xs); border: 1px solid transparent;
  background: none; color: var(--text-3); cursor: pointer;
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.story-item-remove:hover { color: var(--danger); background: var(--danger-surface); border-color: var(--danger-border); }
/* Willingness-to-pay poll */
.wtp-panel { margin-top: var(--sp-4);
}
.wtp-q { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--cream); line-height: var(--lh-snug); margin-bottom: var(--sp-3); padding-right: var(--sp-6); }

.kbd-hint {
  margin-top: var(--sp-3); font-size: var(--fs-1); color: var(--text-3);
  text-align: center; letter-spacing: .2px;
}
.kbd-hint kbd {
  font-family: var(--font-mono);
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); padding: 1px var(--sp-1); border-radius: var(--r-xs);
  background: var(--tint-raise-2); border: 1px solid var(--border2);
  color: var(--text-2);
}
/* Sprint summary */
@keyframes recordGlow { 0%, 100% { box-shadow: 0 10px 24px color-mix(in oklab, var(--success) 26%, transparent); } 50% { box-shadow: 0 14px 36px color-mix(in oklab, var(--success) 52%, transparent), 0 0 0 5px color-mix(in oklab, var(--success) 18%, transparent); } }
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
.story-name-text { font-size: var(--fs-2); letter-spacing: var(--fs-2-tracking); font-weight: var(--fw-semi); color: var(--cream); line-height: var(--lh-snug); }

/* ══════════════════════ PLAYERS PANEL ══════════════════════ */
.vp-head { display: flex; justify-content: space-between; font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-bottom: var(--sp-2); }
.vp-bar { margin-bottom: var(--sp-3);
}
.nobody { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); font-style: italic; text-align: center; padding: var(--sp-3) 0; }

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
/* The three rules that used to sit here — a flex row, a tighter eyebrow and a
   step down in the value — reached into .pp-stat from outside the design
   system. They are a variant of the tile, so they moved to .pp-stat--inline in
   components.css and these tiles pass inline. A text-align: right on
   .a-kpis .pp-stat__meta went with them: none of the three passes a meta. */

/* Team Alignment */
.a-align-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--sp-2); }
/* The four .a-align-bar fills moved to Progress tones — see ALIGN_BAR_TONE
   above and .pp-progress--* in components.css. "ok" turned out to be the
   component default, so it lost a rule rather than gaining a tone. */
.a-align-sub  { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-top: var(--sp-1); line-height: var(--lh-snug); }
.a-align-note { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-top: var(--sp-1); font-style: italic; }
/* One sub-heading treatment for every section inside the analytics panel.
   Team Alignment was sentence case at 13px while the two below it were tracked
   uppercase, so a panel with three peer sections announced them three ways. */
.a-section-title,
.a-align-title,
.analytics-breakdown-title {
  font-size: var(--fs-1); font-weight: var(--fw-medium); letter-spacing: .08em; text-transform: uppercase;
  color: var(--text-3);
}
/* Alignment's title sits in a row with the score chip, and that row carries the
   gap for both of them. */
.a-section-title, .analytics-breakdown-title { margin-bottom: var(--sp-2); }
.a-story-list { max-height: 180px; overflow-y: auto; }
/* Four columns in a 258px rail. The table's own 16px inline padding is tuned
   for a table that has the page to itself; here it was spending 128px of the
   rail on gutters, which pushed the delete column out past the wrapper's
   scroll edge — present, focusable, and not on screen. 8px fits all four with
   room to spare. The last column takes exactly its one 36px control. */
.a-story-list th, .a-story-list td { padding-inline: var(--sp-2); }
.a-story-list th:last-child, .a-story-list td:last-child { width: 1%; padding-left: 0; }
.a-story-delete:hover { color: var(--danger); background: var(--danger-surface); }
/* Below 760px the table stops being a table: every cell becomes its own row,
   label on the left and value on the right. A 1% width is a column instruction
   and it collapsed the delete cell to 8px there — the button was 8px wide and
   unhittable. Columns do not exist in this layout, so the rule does not
   either. */
@media (max-width: 780px) {
  .a-story-list td:last-child { width: auto; padding-left: var(--sp-2); }
}
.analytics-chip-cnt { color: var(--text-3); font-weight: var(--fw-light); }

/* ══════════════════════ STREAK / ESTIMATION SPREE ══════════════════════ */
.streak-fire  { font-size: var(--fs-5); flex-shrink: 0; line-height: 1; }

/* The room's toast is <ToastRegion><Toast>, styled by .pp-toast in the design
   system. A second .toast rule lived here and matched nothing — a fixed pill
   painting two hard-coded cream literals that never answered the theme, with
   white-space: nowrap so a long message would have run off a phone. Dead, so
   it never did either, but it was the next person's trap. */

/* ══════════════════════ COOKIE CONSENT ══════════════════════ */
/* Storage notice, not a consent gate: nothing here needs consent under PECR
   (essential storage only), so it stays out of the way of the primary action. */
.cookie-banner {
  position: fixed; bottom: 14px; right: 14px; z-index: var(--z-overlay);
  max-width: 340px;
  background: var(--surface3); backdrop-filter: blur(18px) saturate(1.2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--sp-3) var(--sp-4);
  box-shadow: 0 18px 42px var(--shadow-card);
  animation: fadeIn var(--dur-slow) var(--ease-out);
}
@media (max-width: 780px) {
  .cookie-banner { left: 10px; right: 10px; bottom: 10px; max-width: none; }
  .kbd-hint { display: none; }
}

/* ══════════════════════ LOADING ══════════════════════ */
.loading { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: var(--sp-4); }
.spinner { width: 34px; height: 34px; border: 3px solid var(--gold-line-1); border-top-color: var(--gold); border-radius: 50%; animation: spin .8s linear infinite; }

/* ══════════════════════ RESPONSIVE ══════════════════════ */
/* Three widths, and they are the same three everywhere: 520 / 780 / 1024. See
   the BREAKPOINTS block in src/design-system/tokens.css. A test fails on any
   other number, because the alternative is what this file had until 13 Aug
   2026 — eleven widths, six of them used once, and an 800px iPad landing in a
   band no rule claimed. */

/* ── The room header compresses below the DESKTOP breakpoint, not the tablet
   one. Its three groups need ~920px plus the container's 64px of padding, so
   anything under about 984px wraps them onto a second row. It used to
   decompress at 781px and the result was a 142px-tall sticky header eating a
   seventh of an iPad's viewport, with the invite panel stranded against the
   left edge. Nobody developing on a laptop ever saw it.

   This is deliberately a WIDER query than the grid collapse below: the header
   and the room body break at different widths because they are different
   amounts of content, and pretending otherwise is what caused the bug. */
@media (max-width: 1023.98px) {
  /* One compact row: back, code, copy. The full URL is not readable or useful
     at this size, and it was pushing the whole room below the fold. */
  .hdr-in { min-height: 52px; padding-block: var(--sp-2); gap: var(--sp-2); flex-wrap: nowrap; }
  .hdr-l .chip-logo { display: none; }
  .hdr-c { order: 0; flex: 1; justify-content: center; gap: var(--sp-2); }
  /* Only the room code survives here — it is the one thing in this group
     somebody needs to read out loud. The round counter and the stories-done
     badge are both restated in the room below.

     This was .pp-chip:first-child, which matched NOTHING: .hdr-c opens with
     a visually-hidden <h1>, so the first chip has never been the first child.
     The rule read as correct and did nothing, and on a 375px phone the two
     chips wrapped and gave the header a second row — 76px of sticky bar
     instead of 52px. Selecting by what the chip IS NOT survives another
     element being added ahead of it, which is how this broke the first time. */
  .hdr-c .pp-chip:not(.room-code-chip) { display: none; }
  .badge-long { display: none; }
  .hdr-r { order: 0; }
  .hdr-invite { padding: 0; border: none; background: none; gap: 0; }
  .hdr-invite-copy { display: none; }
  .hdr-copy-label { display: none; }
  .hdr-copy { padding-inline: var(--sp-3); }
}
@media (max-width: 780px) {
  .game-grid { grid-template-columns: 1fr; }
  /* Voters get the cards first; facilitators get the table and controls first.
     Previously both saw the roster and analytics before anything actionable,
     which on a 375px screen meant scrolling past a full viewport to vote. */
  .game-grid.as-voter .rcol { order: 1; }
  .game-grid.as-facilitator .rcol { order: -1; }
  .game-body { padding-block: var(--sp-4) var(--sp-16); }
  .obs-secondary-row { flex-direction: column; }
  .join-box { padding: var(--sp-8) var(--sp-6); }
  .solo-invite-banner { flex-wrap: wrap; }
}
@media (max-width: 520px) {
  .join-title { font-size: var(--fs-7); }
  .avg-hero-num { font-size: var(--fs-9); }
}

/* ══════════════════════ PAGE SHELL ══════════════════════ */
.page-shell { min-height: 100vh; display: flex; flex-direction: column; }
.app { flex: 1; display: flex; flex-direction: column; position: relative; z-index: var(--z-raised); }
/* WCAG 2.4.11 — a focused element must not be hidden behind the sticky bars. */
:focus-visible { scroll-margin-top: 132px; scroll-margin-bottom: var(--sp-6); }
.skip-link {
  position: absolute; left: 12px; top: -60px; z-index: var(--z-overlay);
  display: inline-flex; align-items: center; min-height: var(--tap-min);
  padding: var(--sp-3) var(--sp-4); border-radius: 0 0 var(--r-sm) var(--r-sm);
  background: var(--gold2); color: var(--ink);
  font-family: var(--font-ui); font-weight: var(--fw-bold); font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking);
  text-decoration: none; transition: top var(--dur-base) var(--ease-out);
}
.skip-link:focus { top: 0; }
.navbar {
  background: var(--surface-bar);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  position: sticky; top: 0; z-index: var(--z-sticky);
}
/* Width and gutters come from .pp-container on the inner element — this is the
   band the rest of the product aligns to, so it must not measure itself. */
/* The bar was a hard 64px with nothing allowed to wrap, so the only way it
   could answer "the contents no longer fit" was to clip them. It answers by
   growing a line instead. min-height keeps the one-line case at exactly the 64
   it always was; the row-gap only ever spends height that a second line was
   going to take anyway. */
.navbar-inner {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap;
  min-height: 64px; padding-block: var(--sp-2); gap: var(--sp-2) var(--sp-4);
}
/* The bar wraps here, at the seam between the two groups, and nowhere inside
   them. A flex container breaks a line before it shrinks anything, so the
   group that no longer fits moves down whole: brand and links stay together,
   and so do the four actions. Wrapping one level lower looked reasonable and
   was not — it put "Point Poker" on a line underneath its own mark. */
.navbar-left  { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; flex: 1 1 auto; }
/* margin-left: auto, not justify-content: the actions are alone on their line
   when the bar wraps, and space-between does nothing to a single item. */
.navbar-right {
  display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end;
  gap: var(--sp-2); min-width: 0; flex: 0 1 auto; margin-left: auto;
}
.header-language { position: relative; flex: none; }
/* Sets the button's own custom properties rather than out-specifying it with a
   compound .header-language__trigger.pp-btn selector. Same result, no
   specificity war, and .pp-btn--sm still wins its own size because it sets the
   same property rather than the same declaration. */
.header-language__trigger {
  --btn-pad-inline: var(--sp-3);
  --btn-gap: var(--sp-2);
  min-width: var(--tap-min);
}
.header-language__code {
  color: inherit; font-weight: var(--fw-bold); letter-spacing: .08em;
  font-variant-numeric: normal;
}
.header-language__chevron {
  width: var(--sp-2); height: var(--sp-2); flex: none;
  border-right: var(--bw-thick) solid currentColor;
  border-bottom: var(--bw-thick) solid currentColor;
  transform: translateY(-25%) rotate(45deg);
  transition: transform var(--dur-fast) var(--ease-out);
}
.header-language__trigger[aria-expanded="true"] .header-language__chevron {
  transform: translateY(25%) rotate(225deg);
}
.header-language__menu {
  position: absolute; z-index: var(--z-overlay);
  top: calc(100% + var(--sp-2)); right: 0;
  min-width: calc(var(--sp-20) * 2);
  padding: var(--sp-2);
  list-style: none;
  background: var(--surface-2); border: var(--bw-hair) solid var(--border-strong);
  border-radius: var(--r-md); box-shadow: var(--shadow-soft);
}
.header-language__link {
  display: flex; align-items: center; justify-content: space-between;
  min-height: var(--tap-min); padding-inline: var(--sp-3);
  border-radius: var(--r-sm); color: var(--text-2);
  font-size: var(--fs-2); letter-spacing: var(--fs-2-tracking); font-weight: var(--fw-medium);
  text-decoration: none; white-space: nowrap;
}
.header-language__link:hover {
  color: var(--text-1); background: var(--tint-raise-2);
}
.header-language__link[aria-current="page"] {
  color: var(--action-quiet); background: var(--gold-fill-1);
}
/* Hidden but measurable, like everything else the bar can swap in: useBarFit
   prices the long label against the short one, and a display:none short label
   would price it against nothing. The button's accessible name is its own
   aria-label, so neither span carries it. */
.nav-start-free-short {
  position: absolute; top: 0; inset-inline-end: 0;
  visibility: hidden; pointer-events: none; white-space: nowrap;
}
/* This strip used to be a horizontal scroller, and that is precisely how
   "PRICING" plus half of "SUPPORT" ended up sliced down the middle at the
   container edge: an overflow container clips, and a clipped word reads as
   broken rather than as scrollable — nobody drags a navbar sideways. Nothing
   scrolls here now. The strip is a wrap item, so when the bar cannot hold
   brand + links + actions on one line, the whole strip drops to a second line
   intact, at whatever width that happens to be.
   At whatever width is the point. The four labels measure 328px in English and
   398px in Portuguese, and the call to action beside them 151px against 176px,
   so the width where this bar fills up is 93px apart in two of the three
   languages it ships in. Any single number written here would be wrong for at
   least one of them. */
.navbar-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
}
.navbar-links > * { flex: 0 0 auto; }
/* display matters here and is not decoration. This is a <span> (see the JSX for
   why), and transform does not apply to a non-replaced inline element — as a
   plain inline it would silently drop the :hover lift below and give the tap
   -target ::after an inline box to hang off. It was inline-block for free while
   it was a <button>. */
.navbar-brand {
  display: inline-flex; align-items: center;
  font-family: var(--font-ui);
  font-size: var(--fs-4); font-weight: var(--fw-bold);
  color: var(--cream); letter-spacing: -.02em;
  cursor: pointer; text-decoration: none;
  /* background/border/padding resets deleted with the <button>: a <span> has
     none of them, and the global reset already zeroes padding. */
  transition: color var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
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
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-full);
  border: 1px solid var(--border);
  background: var(--tint-raise);
  color: var(--text-3);
  font-family: var(--font-ui);
  font-size: var(--fs-1);
  font-weight: var(--fw-semi);
  letter-spacing: .08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out);
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
  transition: transform var(--dur-base) var(--ease-out), filter var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out);
}
/* The room header draws the mark at 34px to fit its bar. Rule 6 still applies,
   so the hit area is grown back to the floor without moving the artwork. */
.chip-logo::after {
  content: ""; position: absolute; top: 50%; left: 50%;
  width: var(--tap-min); height: var(--tap-min); transform: translate(-50%, -50%);
}
.chip-logo img {
  width: 100%; height: 100%; object-fit: contain; display: block;
  filter: drop-shadow(0 8px 18px var(--shadow-cast));
}
.chip-logo:hover  { transform: translateY(-1px) scale(1.03); filter: drop-shadow(0 0 14px var(--gold-glow)); }
.chip-logo:active { transform: translateY(0) scale(1.01); }
/* The decorative placements. No pointer, no lift, and no grown tap target,
   because there is nothing here to tap. */
.chip-logo--static { cursor: default; }
.chip-logo--static::after { content: none; }
.chip-logo--static:hover { transform: none; filter: none; }

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
  /* The footer is its own band, with its own felt and its own top rule, but it
     was sitting flush on the section above: content ended and the rule started
     on the very next pixel. The internal 48px only pushed the footer's own
     contents down, it never separated the two bands. */
  margin-top: var(--sp-16);
}
/* padding-block, not padding-bottom: the plan bar's rule above had var(--sp-4) of its
   own padding on top of it and nothing under it, so the brand mark and the two
   column headings started hard against the line. A divider needs air on both
   sides — a little less above, where it closes the bar, than below, where it
   opens the columns. */
.footer-inner {
  display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr;
  gap: var(--block-y); padding-block: var(--sp-8);
}
.footer-col-brand { display: flex; flex-direction: column; gap: var(--sp-3); }
.footer-brand-row { display: flex; align-items: center; gap: var(--sp-3); }
.footer-brand-name {
  font-family: var(--font-ui);
  font-size: var(--fs-4); font-weight: var(--fw-bold); color: var(--cream);
  letter-spacing: -.02em;
}
.footer-brand-desc {
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); line-height: var(--lh-body);
  font-weight: var(--fw-light); max-width: 280px;
}
/* No gap: the links' own padding does the spacing, so there is no dead 2px
   strip between two stacked targets. */
.footer-col-links { display: flex; flex-direction: column; }
.footer-col-title {
  font-size: var(--fs-1); font-weight: var(--fw-bold); letter-spacing: 2px;
  text-transform: uppercase; color: var(--text-3);
  margin-bottom: var(--sp-3);
}
/* Stacked targets, so the --tap-min ::after trick used on the nav row cannot
   apply — a 44px overlay on a 29px pitch would steal the neighbour's taps.
   The pitch itself has to grow instead: 33px with a mouse (over the 24px WCAG
   2.2 AA floor), 41px on a touch screen (the HIG figure, less the 2px the
   underline needs). */
.footer-link {
  color: var(--text-2); font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); text-decoration: none;
  padding-block: var(--sp-2); transition: color var(--dur-fast) var(--ease-out);
  background: none; border: none; cursor: pointer;
  font-family: var(--font-ui); text-align: left;
  display: inline-block;
}
@media (pointer: coarse) { .footer-link { padding-block: var(--sp-3); } }
.footer-link:hover { color: var(--mint2); }
/* Two footer links that are not links: one is a statement of fact, the other
   sits mid-sentence in the legal note. */
.footer-link--static { color: var(--text-3); cursor: default; }
.footer-link--inline { display: inline; padding: 0; text-decoration: underline; font: inherit; }
/* The room code is data, not prose: it wants figures that line up. */
.room-code-chip { font-family: var(--font-mono); letter-spacing: .12em; }
.footer-bottom {
  border-top: var(--bw-hair) solid var(--border);
  padding-block: var(--sp-5);
  display: flex; align-items: flex-start; justify-content: space-between;
  flex-wrap: wrap; gap: var(--sp-3);
}
.footer-copy {
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); font-weight: var(--fw-light);
  line-height: var(--lh-body);
}
/* Language switcher. flex-basis: 100% so it takes its own row above the two
   legal blocks rather than becoming a third column that squeezes them at
   940px. Plain links, because they are plain links. */
.lang-switcher {
  flex-basis: 100%;
  display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-2);
  margin-block-end: var(--sp-3);
}
.lang-switcher-label {
  font-size: var(--fs-1); letter-spacing: .08em; text-transform: uppercase;
  color: var(--text-3); font-weight: var(--fw-medium);
}
.lang-switcher ul {
  display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-3);
  list-style: none; margin: 0; padding: 0;
}
.lang-link {
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking);
  color: var(--text-2); text-decoration: none; font-weight: var(--fw-light);
}
.lang-link:hover { color: var(--gold2); text-decoration: underline; }
/* The current language is a link to the page you are already on. Marked, not
   removed: taking it out makes the row jump as you move between languages. */
.lang-link.is-current { color: var(--gold2); font-weight: var(--fw-medium); cursor: default; }
/* No text-align: right. The note is a flex item that wraps onto its own line
   below ~940px, and once it does, space-between puts its box on the LEFT while
   the right-alignment still ran inside it — three lines ragged down the left
   edge with "affiliated with Point Poker." orphaned out to the right, directly
   under a left-aligned copyright line. Right-aligning only ever read correctly
   in the one case where the two shared a row. Both are left-aligned now, which
   holds in both cases and needs no breakpoint to undo it. */
.footer-legal-note {
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); line-height: var(--lh-body);
  max-width: 480px;
}
/* The modal used to restate the global scrollbar rules at a different width and
   in the brand golds, which are theme-constant — a bright brass bar down the
   edge of a paper dialog. The global rules are themed; this one just used them. */
.login-modal::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; border-radius: var(--r-lg) var(--r-lg) 0 0;
  background: linear-gradient(90deg, transparent, var(--action) 30%, var(--action) 70%, transparent);
}
.account-status-label {
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: .08em;
  font-size: var(--fs-1);
  font-weight: var(--fw-bold);
}
.account-status-copy {
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking);
  line-height: var(--lh-body);
  color: var(--text-3);
}
.login-upgrade-note {
  margin-top: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
  background: var(--tint-raise);
  color: var(--text-3);
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking);
  line-height: var(--lh-body);
}
.login-upgrade-note strong {
  color: var(--gold-ink2);
  font-weight: var(--fw-semi);
}
.login-modal-upgrade {
  margin-top: var(--sp-5); text-align: center;
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3);
}
.login-modal-upgrade a {
  color: var(--gold-ink2); text-decoration: none; font-weight: var(--fw-semi);
  border-bottom: var(--bw-hair) solid var(--gold-line-1); transition: border-color var(--dur-base) var(--ease-out);
}
.login-modal-upgrade a:hover { border-bottom-color: var(--gold2); }
.nav-account {
  display: flex; flex-direction: column; align-items: flex-end; gap: var(--sp-1); margin-right: var(--sp-3);
  min-width: 0;
}
.nav-account-name {
  max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--text-1); font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); font-weight: var(--fw-medium);
}
.nav-account-plan {
  display: inline-flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1) var(--sp-3); border-radius: var(--r-full);
  border: var(--bw-hair) solid var(--border2); background: var(--tint-raise-2);
  color: var(--text-3); font-size: var(--fs-1); letter-spacing: .12em; text-transform: uppercase;
}
.nav-account-plan.pro {
  color: var(--gold-ink2); border-color: var(--gold-line-1); background: var(--gold-fill-2);
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
  border-bottom: var(--bw-hair) solid var(--border);
  padding-block: var(--sp-4);
}
.footer-plan-item { display: flex; align-items: center; gap: var(--sp-2); }
.footer-plan-text { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); }
.footer-plan-divider {
  width: 1px; height: 18px; background: var(--tint-raise-2); flex-shrink: 0;
}

/* ══════════════════════ LEGAL PAGES ══════════════════════ */
.legal-page { width: 100%;
}
/* A back link, not a second button system. It was re-declaring padding, radius,
   border, fill, colour, weight, size and transition on top of the
   .pp-btn--ghost.pp-btn--sm it already carries — nine properties to say
   "smaller and quieter", which is what those two modifiers already say. All
   that is left is where it sits.

   Where it sits changed too. It used to be dropped between the hero and the
   page body, so on every marketing page there was a lone 130px-wide control
   floating in an otherwise empty 150px band. Above the hero it reads as the
   breadcrumb it always was. */
.legal-back { margin-block: var(--sp-4) var(--sp-1); }
.legal-body h2 {
  font-family: var(--font-ui); font-size: var(--fs-4); font-weight: var(--fw-semi);
  color: var(--cream); letter-spacing: -0.01em; margin: var(--sp-10) 0 var(--sp-3);
  padding-bottom: var(--sp-2); border-bottom: var(--bw-hair) solid var(--border);
}
.legal-body p, .legal-body li {
  font-size: var(--fs-2); letter-spacing: var(--fs-2-tracking); line-height: var(--lh-body); color: var(--text-2);
  margin: 0 0 var(--sp-3);
}
.legal-body ul {
  padding-left: var(--sp-5); margin: 0 0 var(--sp-3);
}
.legal-body li { margin-bottom: var(--sp-2); }
.legal-body strong { color: var(--text-1); font-weight: var(--fw-semi); }
.legal-body a { color: var(--gold-ink2); text-decoration: underline; }
.legal-body a:hover { color: var(--gold-ink3); }
.legal-body code {
  /* .82em of 14px landed at 11.5px, under the 13px floor. A monospace face
     already reads smaller at the same size, so it takes the floor directly. */
  font-family: var(--font-mono); font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking);
  background: var(--tint-raise-2); padding: 1px var(--sp-2); border-radius: var(--r-xs);
}

/* ══════════════════════ MARKETING PAGES ══════════════════════ */
.marketing-page { width: 100%;
}
/* Two spacings with a stated relationship, not three that collide: --sp-4
   between blocks (the same gap a paragraph leaves after itself, so a list
   following prose is spaced like another paragraph), --sp-3 between items
   inside one list. Within is tighter than between; that is the whole rule. */
/* Same measure and same centring as .marketing-prose, so the two kinds of
   reading copy on one page start at the same x and break at the same width.
   The list ran uncapped: 784px of 16px text is ~80 characters, past the point
   the measure comment below says the eye loses the next line's start. The box
   is the SAME --measure as the prose, not measure+indent: widening it for the
   marker and then centring it splits the indent over both sides and lands the
   text 10px off. Matching boxes puts the ♦ exactly on the prose's left edge —
   the ordinary way a list under a paragraph is set. */
.marketing-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin: var(--sp-4) auto 0;
  max-width: var(--measure);
}
/* --fs-3 is the body token. This was --fs-1 — 13px, "THE FLOOR", the size the
   scale reserves for micro labels and uppercase eyebrows — for the bullets of
   a page whose entire job is being read. It now matches .marketing-prose
   beside it. The --fs-1 tracking correction goes with it: that exists to stop
   the two smallest sizes blooming on a dark ground, and 16px does not. */
.marketing-list li {
  position: relative;
  padding-left: var(--sp-5);
  font-size: var(--fs-3);
  line-height: var(--lh-body);
  color: var(--text-2);
}
/* top: .22rem was a magic number tuned by eye to 13px/1.6 and would drift at
   any other size. top: 0 shares the first line's box instead, which aligns the
   marker at every size. The line-height it needs is --lh-body, inherited from
   the li — a unitless number resolves against each element's own font-size, so
   the marker gets 13 x 1.6 and the text 16 x 1.6 from the one declaration. */
.marketing-list li::before {
  content: "♦";
  position: absolute;
  left: 0;
  top: 0;
  color: var(--gold-ink2);
  font-size: var(--fs-1);
}
.marketing-list strong {
  color: var(--text-1);
  font-weight: var(--fw-semi);
}
/* Body copy on the data-driven pages. Measure is capped in ch rather than px
   so it tracks the font size: past roughly 70 characters the eye loses the
   start of the next line. */
.marketing-prose {
  max-width: var(--measure);
  margin: 0 auto var(--sp-4);
  font-size: var(--fs-3);
  line-height: var(--lh-body);
  color: var(--text-2);
}
.marketing-prose:last-child { margin-bottom: 0; }
/* Sits under the back button on a page that has no translation, in the
   reader's language. Quiet: it is an explanation, not a warning. */
.marketing-lang-note {
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking);
  color: var(--text-3); margin-block: var(--sp-2) 0;
}
/* Ordered steps keep their numbers. .marketing-list replaces the marker with a
   ♦, which is right for an unordered list and wrong for a sequence. */
ol.marketing-list { list-style: decimal; padding-left: var(--sp-5); counter-reset: none; }
ol.marketing-list li { padding-left: var(--sp-1); }
ol.marketing-list li::before { content: none; }
ol.marketing-list li::marker {
  color: var(--gold-ink2);
  font-weight: var(--fw-semi);
}
.marketing-plan-sub {
  margin-top: var(--sp-2);
  font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking);
  color: var(--text-3);
  line-height: var(--lh-body);
}
@media (max-width: 780px) {
  .marketing-stat-grid { grid-template-columns: 1fr; }
}
/* Three stat tiles in a 515px hero rail, laid out by the auto-fit grid, came
   out two-up with the third orphaned beside 250px of nothing. Three facts read
   as a list, so in the rail they are a list; the auto-fit grid takes over again
   below lg, where the aside is the full container width and three across fits.
   This block sits after the max-width: 680px rule above it on purpose — see the
   note at the top of this file about source order. */
@media (min-width: 1024px) {
  .marketing-stat-grid { grid-template-columns: minmax(0, 1fr); }
}


/* NavBar history button */
/* .nav-btn-history: see the note by .nav-btn-login. Visual comes from pp-btn;
   the name is kept for the authenticated-only display rules. */

@media (max-width: 520px) {
  .navbar:not(.authenticated) .nav-btn-history { display: none; }
}

/* ══════════════════════ RESPONSIVE — FOOTER + NAV ══════════════════════ */
/* What the bar gives up as it runs out of room, cheapest first. The width at
   which each step happens is measured, not written here — see useBarFit, which
   sets the attribute. These rules only say what each verdict looks like.

   Hidden, but still occupying a box the measurement can read — see useBarFit.
   display:none here would make the next pass measure zero, conclude there is
   room, and put the bar into a one-frame flicker between two rungs.
   visibility takes them out of the a11y tree and the tab order and absolute
   takes them out of the line the bar is trying to fit.

   inset-inline-end, not left. A ghost keeps its full natural width, so anchored
   at the start it hangs off the right of a narrow viewport and pushes the
   document's scrollWidth out — an invisible element scrolling the whole page
   sideways. Anchored at the end it overhangs towards the inline start, which is
   the direction a document does not scroll, in either writing direction. */
.navbar[data-nav-fit="no-links"] .navbar-links,
.navbar[data-nav-fit="no-label"] .navbar-links,
.navbar[data-nav-fit="short-cta"] .navbar-links,
.navbar[data-nav-fit="minimal"] .navbar-links,
.navbar[data-nav-fit="short-cta"] .nav-start-free-long,
.navbar[data-nav-fit="minimal"] .nav-start-free-long,
.navbar[data-nav-fit="minimal"] .navbar-brand {
  position: absolute; top: 0; inset-inline-end: 0;
  visibility: hidden; pointer-events: none; white-space: nowrap;
}
.navbar[data-nav-fit="short-cta"] .nav-start-free-short,
.navbar[data-nav-fit="minimal"] .nav-start-free-short {
  position: static; visibility: visible;
}
@media (max-width: 780px) {
  .footer-inner { grid-template-columns: 1fr 1fr; }
  .footer-col-brand { grid-column: 1 / -1; }
  /* The switch keeps its position, loses its word. The component itself
     already drops to one short word at 780px; this bar needs the rest of it
     gone at its own narrowest, which the switch owns as a variant.
     Dropping the word is not dropping the state. A switch says which way it is
     set by where the thumb is, which is the whole reason this is a switch and
     not a button — and clipped, not display:none, so the accessible name is
     still the full "Dark theme" that this bar can no longer show.
     Not display:none on the switch itself: the theme lives nowhere else. No
     footer control, no OS fallback (tokens.css deliberately ignores
     prefers-color-scheme). Hide it and a phone is stuck in dark for good. */
  .nav-account-name { max-width: 140px; }
  .footer-plan-bar { gap: var(--sp-4); }
}
@media (max-width: 520px) {
  .footer-inner { grid-template-columns: 1fr; }
  /* text-align: left used to be undone here — the base rule no longer needs it. */
  .footer-legal-note { max-width: 100%; }
  /* What a phone-width bar buys back: tighter gutters, the small type role, and
     the short form of the CTA label. This stays a media query on purpose. The
     measured ladder can only stay stable if the widths it reads do not depend
     on the rung it last chose — tie these to the verdict and the bar tightens,
     re-measures, finds it now fits a rung up, loosens, and no longer fits. A
     viewport width is the one input the bar cannot argue with.

     It costs one step: crossing 520 upwards loosens the buttons, so English
     gives the CTA its short label back for about eight pixels of window. That
     was measured against the alternative. Deleting these rules makes the ladder
     perfectly monotonic and puts 360 and 375 — the two commonest phone widths
     there are — onto two lines. A step in the CTA's label beats a wrapped bar
     on every phone.
     The 44px tap floor from pp-btn is deliberately untouched: a phone is where
     it matters most. "Sign in" is deliberately still here too — hiding it once
     left a signed-out phone with no route to an account at all. The CTA's
     visible label shortens while its accessible name stays complete. */
  .navbar-inner { gap: var(--sp-2); }
  .navbar-left { flex: 0 0 auto; }
  .navbar-right { flex: 1 1 auto; }
  .header-language__trigger {
    --btn-pad-inline: var(--sp-2);
    --btn-gap: var(--sp-1);
  }
  .navbar .nav-btn-login,
  .navbar .nav-btn-history,
  .navbar .nav-btn-register {
    padding: var(--sp-2) var(--sp-3);
    font-size: var(--fs-1);
    letter-spacing: var(--fs-1-tracking);
  }
  .navbar.authenticated .nav-account {
    display: flex;
    margin-right: 0;
    align-items: flex-end;
    gap: 3px;
  }
  .navbar.authenticated .nav-account-name { max-width: 104px; font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); }
  .navbar.authenticated .nav-account-plan { font-size: var(--fs-1); padding: 3px var(--sp-2); letter-spacing: .1em; }
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
.dash-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-5); flex-wrap: wrap; margin-bottom: var(--sp-5); }
/* .dash-back is gone with the ghost variant. It was eight declarations
   stripping a design-system Button back to a text link — background,
   border, colour, font, size, tracking, padding — from outside the
   component, which is the one thing App.js is not allowed to do to a
   pp-* component. The dashboard back control is an ordinary secondary
   button now, like every other way out of a screen. */
.dash-head-actions { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.dash-panel { min-width: 0;
}
.dash-panel.wide { grid-column: 1 / -1; }
.dash-bars { display: flex; flex-direction: column; gap: var(--sp-2); }
.dash-bar-row { display: grid; grid-template-columns: minmax(84px, 1.1fr) 3fr minmax(74px, auto); align-items: center; gap: var(--sp-3); }
.dash-bar-label { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-2); }
.dash-bar-value { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--cream); text-align: right; font-variant-numeric: tabular-nums; }
.dash-bar-value em { font-style: normal; color: var(--text-3); margin-left: var(--sp-2); font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); }
.dash-trend { margin-bottom: var(--sp-4); }
.dash-trend-head { display: flex; justify-content: space-between; font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-bottom: var(--sp-2); }
.dash-trend-max { color: var(--text-3); }
.dash-trend-plot { display: flex; align-items: flex-end; gap: 2px; height: 76px; padding: 0 1px; }
.dash-trend-col { flex: 1; min-width: 2px; border-radius: 2px 2px 0 0; background: linear-gradient(180deg, var(--gold3) 0%, var(--gold) 100%); }
.dash-trend-col.zero { background: var(--tint-raise-2); }
.dash-trend-axis { display: flex; justify-content: space-between; font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); margin-top: var(--sp-1); }
.dash-dismissed { font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); }
.dash-foot { margin-top: var(--sp-5); font-size: var(--fs-1); letter-spacing: var(--fs-1-tracking); color: var(--text-3); line-height: var(--lh-body); }
.dash-gate { max-width: 520px; margin: var(--sp-16) auto;
}
@media (max-width: 520px) {
  .dash-wrap { padding-block: var(--sp-5) var(--sp-16); }
  .dash-bar-row { grid-template-columns: minmax(70px, 1fr) 2fr auto; gap: var(--sp-2); }
}

/* ══════════════════════════ PRINT / PDF ══════════════════════════
   Two problems, both of which made a printed page useless.

   1. The product is dark-first. A browser strips background colours when it
      prints, so the felt vanished and the cream text printed onto white
      paper as pale grey on white. Every printed page was close to blank.
   2. Nothing carried the brand. A summary handed round a room, or saved as a
      PDF and attached to a ticket, had nothing on it saying where it came
      from.

   So print gets its own theme: paper white, ink black, and a brand header on
   the sheet. The mark is an <img>, never a background-image, because a
   background is exactly what "do not print background graphics" throws away.

   Mono printers: the mark is safe without a second asset. Its dark green "P"
   against the gold diamond measures 8.2:1 in colour and 8.46:1 converted to
   greyscale — it separates on luminance, not on hue, so it survives the
   conversion. print-color-adjust is still set to exact so a colour printer is
   not asked to guess.
════════════════════════════════════════════════════════════════ */
@media print {
  /* Paper, whatever the on-screen theme was. */
  html, body {
    background: #fff !important;
    color: #000 !important;
  }
  body { font-size: 11pt; }

  /* Room chrome, navigation and anything that only makes sense as a control.
     A printed sheet cannot be clicked.

     .game-body is the whole live room, and it is here because printing it was
     never useful: an empty "Add an item" box, a Countdown length select and a
     "0 of 1 voted" progress bar are controls, and on paper they are furniture.
     PrintReport renders OUTSIDE .game-body so this hides the room and leaves
     the report — which is the document somebody actually wanted. Everything
     else in this list is still here for the marketing and legal pages, which
     print as themselves. */
  .navbar, .site-footer, .hdr, .pp-toast-region, .cookie-banner, .game-body,
  .summary-actions, .chip-logo, .pp-modal, .skip-link, body::before,
  .pp-hero::before,
  .join-side, .seo-section, .seo-faq, .legal-back, .btn-back,
  button, .pp-btn {
    display: none !important;
  }

  /* EVERY element, not a list of them. The list used to be p, li, td, th and
     the headings, which is why a marketing page printed its prose in ink and
     its labels in whatever colour the screen had given them — a label inside a
     stat card is a span, and no span was on the list.

     On a felt hero or a felt section it is worse than grey, and worse in BOTH
     themes: those surfaces set color: var(--text-on-felt) outright, which is
     near-white, and the printer drops the felt behind them because a felt is a
     background. White on white. The eyebrow is --brass-300, which is pale gold
     on white paper and only slightly better.

     Re-pointing the colour TOKENS under print cannot fix this. A custom
     property is inherited from the nearest ancestor that sets it, so a value
     written at :root — !important or not — never reaches a child of .pp-hero,
     which sets its own: the cascade only ever compares declarations on the
     same element. Forcing the computed colour does reach it. */
  body * { color: #000 !important; }

  /* Cards and panels: no felt, no shadow, a hairline so the structure survives. */
  .panel, .pp-card, .pp-alert, .pp-stat {
    background: #fff !important;
    border: 1px solid #999 !important;
    box-shadow: none !important;
    break-inside: avoid;
  }
  /* Felt surfaces get the paper without the hairline — a rule drawn round a
     whole page section reads as a box nobody asked for. Only matters when the
     reader has ticked "print background graphics"; without it the felt is
     already gone. */
  .pp-hero, .pp-section--felt { background: #fff !important; }
  h1, h2, h3, h4, .ptitle, .pp-card__title, .pp-section-head__title { break-after: avoid; }
  a { text-decoration: underline; }
  /* A printed link is dead, so spell the destination out once. The selector
     said .prose, and nothing in this product has ever rendered that class —
     the marketing pages use .marketing-prose. The rule had never once fired.
     (The dead-class test missed it because "marketing-prose" contains the
     string it was looking for.) */
  .marketing-prose a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; }

  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999 !important; padding: 6pt 8pt; text-align: left; }
  thead { display: table-header-group; }   /* repeat the header on every sheet */
  tr { break-inside: avoid; }

  @page { margin: 14mm; }
}

/* ── The printable report ──────────────────────────────────────────
   Present in the DOM but never shown on screen. This is what a "Save as PDF"
   actually produces, and the only place the brand is guaranteed to appear. */
.print-report { display: none; }

@media print {
  .print-report { display: block !important; }
  .print-report__head {
    display: flex; align-items: center; gap: 10pt;
    border-bottom: 2pt solid #000; padding-bottom: 8pt; margin-bottom: 14pt;
  }
  /* print-color-adjust keeps the mark's own colours on a colour printer.
     Without it some browsers flatten an image inside a "no backgrounds" print. */
  .print-report__mark {
    width: 46pt; height: 46pt; flex: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .print-report__brand {
    font-family: var(--font-ui);
    font-size: 17pt; font-weight: 700; color: #000; margin: 0; letter-spacing: -.01em;
  }
  /* The three deliberate greys on the sheet, and the only exemptions from the
     ink rule above. They need !important purely to outrank it — "body *" is a
     feeble selector but an important one, and this is the report's own
     hierarchy rather than a colour that leaked in from the screen. */
  .print-report__url { font-size: 9.5pt; color: #333 !important; margin: 2pt 0 0; }
  .print-report__title { font-size: 15pt; margin: 0 0 3pt; color: #000; }
  .print-report__meta { font-size: 9.5pt; color: #333 !important; margin: 0 0 12pt; }
  .print-report__foot {
    margin-top: 16pt; padding-top: 7pt; border-top: 1px solid #999;
    font-size: 9pt; color: #333 !important;
  }
  /* The report is one column of flowing content, so it should use the sheet.
     Without this the table inherits whatever width the room layout left it. */
  .print-report, .print-report table { width: 100%; max-width: none; }
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
// Mirrors the three-digit key cap on rooms/$roomId/stories/$storyIndex in
// database.rules.json. The rule is the real limit — it is the one an attacker
// meets — and this is so a team that reaches it is told what happened.
const MAX_QUEUE = 1000;
const SESSION_MAX_MS  = 5 * 60 * 60 * 1000;          // 5 hours, auto-end + save history
const SESSION_WARN_MS = SESSION_MAX_MS - 10 * 60 * 1000; // warn 10 min before auto-end
const PLAYER_AWAY_TIMEOUT_MS = 60 * 60 * 1000;       // 1 hour, grace period before sweeping disconnected players

/* The alignment band's four states, mapped to the Progress component's tones.
   "ok" has no entry on purpose: it is the default gold fill, and inventing a
   tone that restates the default is how a component ends up with two ways to
   say one thing. "low" is warning rather than danger for the same reason the
   score text is amber — a split vote is the tool working, not an error. */
const ALIGN_BAR_TONE = { good: "success", low: "warning", neutral: "neutral" };

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

// ── FOUNDER ROOM DEFAULTS ─────────────────────────────────────
// These client-visible values select the intended default deck and let the two
// established team URLs bootstrap without an account. They are not an
// entitlement or security boundary: every feature is free, and Firebase only
// accepts founderRoom:true for these exact room IDs. The encoding merely keeps
// raw internal team names out of casual source searches.
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

/* ═══════════════════════ BRAND MARK ═══════════════════════
   The card-stack mark: public/brand-mark.png, regenerated from
   assets/brand-mark-master.png by scripts/make-icons.py.

   Interactive only when it is handed something to do. Three of the six call
   sites pass no onClick, and those were still rendering a <button>: focusable,
   announced as a button, and doing nothing when a keyboard user pressed it.
   Those render a plain image instead.

   label names the control when it is a button, and becomes the image alt when
   it is not. Pass label="" where a wordmark sits beside the mark, so the brand
   is not announced twice.
═══════════════════════════════════════════════════════════════ */
function BrandMark({ onClick, size = 44, label = "Point Poker, go to home" }) {
  if (!onClick) {
    return (
      <span className="chip-logo chip-logo--static" style={{ width: size, height: size }}>
        <img src="/brand-mark.png" alt={label} />
      </span>
    );
  }
  return (
    <button className="chip-logo" onClick={onClick} aria-label={label}
      style={{ width: size, height: size }}
    >
      <img src="/brand-mark.png" alt="" />
    </button>
  );
}

/* ═══════════════════════ PRINTABLE REPORT ═══════════════════════
   What "Save as PDF" produces. It sits in the DOM, hidden on screen, and only
   @media print reveals it — no popup window to be blocked, no second route to
   keep in sync, and no PDF library.

   The mark is an <img> with an empty alt: the wordmark beside it already says
   "Point Poker", and this whole block is aria-hidden anyway because a screen
   reader is already reading the same numbers off the table on screen.
═══════════════════════════════════════════════════════════════════ */
function PrintReport({ title, meta, columns, rows, note }) {
  return (
    <section className="print-report" aria-hidden="true">
      <header className="print-report__head">
        <img className="print-report__mark" src="/brand-mark.png" alt="" />
        <div>
          <p className="print-report__brand">Point Poker</p>
          <p className="print-report__url">{SITE_URL.replace(/^https?:\/\//, "")}</p>
        </div>
      </header>

      <h1 className="print-report__title">{title}</h1>
      <p className="print-report__meta">{meta}</p>

      <table>
        {/* One header row, and it repeats on every sheet
            (thead { display: table-header-group }). An earlier draft added a
            second row carrying the brand so page 2 of a long list would still
            be marked; it read as an empty broken row on the single page that
            almost every report actually is. The head and foot carry the brand
            instead. */}
        <thead>
          <tr>
            {columns.map((c) => <th key={c}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>

      <p className="print-report__foot">
        {note ? `${note} · ` : ""}Generated by Point Poker, free planning poker
        for agile teams — {SITE_URL.replace(/^https?:\/\//, "")}
      </p>
    </section>
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

/* The rendered href is the locale one so a crawler following it stays in the
   language it was reading; onNavigate is still handed the plain English path,
   because navTo does the prefixing and doing it twice would produce /de/de/. */
function RouteLink({ href, onNavigate, className, children, ...props }) {
  return (
    <a
      href={withLocale(getLocale(), href)}
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

/* What the bar can afford to show, measured rather than named as a width.

   It needs 991px of room in English, 1045 in Portuguese and 1057 in Japanese —
   three numbers, one bar. Every fixed breakpoint this component has been given
   was one of those three answers applied to all three languages, which is why
   the same defect has now been reported twice at two different widths. There is
   no fourth number that would have been right either: the bar's appetite also
   moves with the signed-in state and with the reader's font size.

   So it is asked instead of predicted, and the order is by what each piece
   costs against what it is worth:

     full       everything
     no-links   the four marketing links go — all four are in the footer too
     no-label   "Dark theme" goes. The switch still says which way it is set by
                where the thumb is, which is the whole reason it is a switch
     short-cta  "Start a free room" becomes the short label. Its accessible name
                is unchanged, because the button carries its own
     minimal    the wordmark goes — the mark beside it is the same control to
                the same place, and names itself for both

   The wordmark is last on purpose: it is the piece a reader is most likely to
   notice missing, and it was the second half of the defect report.

   A pass reads and never writes, apart from the verdict itself. Everything the
   bar can drop keeps its box — absolute and hidden, not display:none — so each
   piece measures the same on every rung and the answer is a pure function of
   the width available. Both halves of that matter:

   - A display:none piece measures zero, zero reads as "there is room now", and
     the bar shows it, overflows, and hides it again on the next frame.
   - The obvious alternative — put the bar back to "full", measure the real
     thing, write the verdict — cannot be done from inside a ResizeObserver.
     Mutating observed boxes in the callback earns "ResizeObserver loop
     completed with undelivered notifications", after which the browser stops
     delivering to that observer AT ALL and the bar stays on whatever rung it
     happened to be on. It survives a resize sweep and dies during a drag.

   It sums the CHILDREN, never the groups. A flex group alone on its line has
   already grown to fill it, so measuring the group reports the width it was
   given rather than the width it asked for.

   The switch's word is the one piece inside another component's box, so its
   cost is subtracted out rather than read directly: the group is measured as if
   the word were already gone, and the word's own width is added back for the
   rungs that keep it.

   The 1px is sub-pixel rounding, not a guess: a bar that has computed its way
   to within one pixel of the edge should round towards the layout that cannot
   break. */
function useBarFit(navRef, innerRef, leftRef, rightRef) {
  const measureRef = useRef(null);

  useLayoutEffect(() => {
    const nav = navRef.current, inner = innerRef.current;
    const left = leftRef.current, right = rightRef.current;
    if (!nav || !inner || !left || !right || typeof ResizeObserver === "undefined") return;

    const width = (el) => (el ? el.getBoundingClientRect().width : 0);
    const gapOf = (el) => (el ? parseFloat(getComputedStyle(el).columnGap) || 0 : 0);
    const run = (widths, gap) => {
      const real = widths.filter((w) => w > 0);
      return real.reduce((a, w) => a + w, 0) + Math.max(0, real.length - 1) * gap;
    };

    const verdict = () => {
      const cs = getComputedStyle(inner);
      const avail = inner.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);

      const inFlow = (el) => !!el && getComputedStyle(el).position !== "absolute";

      /* The switch's word costs its own width plus the gap that appears with
         it; the CTA's long label costs only the difference, because the short
         one takes its place rather than leaving a hole. */
      const sw = right.querySelector(".pp-switch");
      const word = sw && sw.querySelector(".pp-switch__label");
      const wordCost = width(word) > 0 ? width(word) + gapOf(sw) : 0;
      const longCost = Math.max(
        0,
        width(right.querySelector(".nav-start-free-long"))
          - width(right.querySelector(".nav-start-free-short"))
      );

      /* Normalised to the narrowest the actions can be: no word, short CTA.
         Everything currently on screen that the bar could still give up is
         taken back out, so this number does not depend on the current rung. */
      const bare = run([...right.children].map(width), gapOf(right))
        - (inFlow(word) ? wordCost : 0)
        - (inFlow(right.querySelector(".nav-start-free-long")) ? longCost : 0);

      const spare = avail - gapOf(inner) - bare - 1;
      const withLongCta = spare - longCost;
      const withWord = withLongCta - wordCost;

      const gap = gapOf(left);
      const mark = width(left.querySelector(".chip-logo"));
      const brand = width(left.querySelector(".navbar-brand"));
      const links = width(left.querySelector(".navbar-links"));
      const withBrand = run([mark, brand], gap);

      return (
        run([mark, brand, links], gap) <= withWord ? "full"
        : withBrand <= withWord ? "no-links"
        : withBrand <= withLongCta ? "no-label"
        : withBrand <= spare ? "short-cta"
        : "minimal"
      );
    };

    /* Writing the same value back is still a write: it invalidates style, which
       resizes observed boxes, which schedules another callback, for ever. Most
       passes change nothing and must therefore touch nothing. */
    const apply = () => {
      const next = verdict();
      if (next !== nav.dataset.navFit) nav.dataset.navFit = next;
    };

    /* A ResizeObserver callback may not resize what it observes. Doing so is
       what raises "ResizeObserver loop completed with undelivered
       notifications" — which is only a warning to the console, and a
       full-screen modal in react-scripts' dev overlay, and a window.onerror in
       production. So the observer decides and rAF applies: the write lands in
       the next frame, outside the delivery it would otherwise extend. Called
       from anywhere else — mount, a re-render — it applies straight away, since
       deferring the first one would paint the wrong rung before fixing it. */
    let frame = 0;
    const applyOutsideDelivery = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; apply(); });
    };

    measureRef.current = apply;
    apply();
    const ro = new ResizeObserver(applyOutsideDelivery);
    [inner, left, right].forEach((el) => ro.observe(el));
    /* A bar measured in the fallback face is measured wrong — Outfit is not the
       width of whatever stood in for it. */
    document.fonts?.ready.then(apply).catch(() => {});
    return () => { ro.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [navRef, innerRef, leftRef, rightRef]);

  /* Signing out makes the actions narrower without making their CONTAINER
     narrower — on the last rung it is flex: 1 1 auto and spans the line either
     way — so the observer has nothing to report and the bar would stay
     collapsed around content that now fits. Every render re-asks. */
  useLayoutEffect(() => { measureRef.current?.(); });
}

/* ═══════════════════ HOW TALL THE ROOM HEADER IS ═══════════════════
   Publishes the sticky room header's height as --hdr-h, so the action bar
   underneath it can park below rather than behind. Nothing else in CSS can
   ask: the two are in different branches of the tree, and the number moves.

   It is not one number and never could be. The invite block stacks a label, a
   helper line and the URL on a desktop and collapses to a button on a phone;
   the round chip, the stories-done badge and the room code come and go with
   the session; and any of it can rewrap when the reader's font size does. Two
   measurements from the same page: 99.6px at 1080, 61px at 375. A literal
   would have been wrong at one of them and stale after the first badge.

   The three rules this obeys are the ones the marketing bar learned the hard
   way, and they are load-bearing rather than defensive:

   1. the callback mutates nothing — it only asks for a frame;
   2. the write happens in that frame, outside the delivery it would otherwise
      extend, and only when the value actually changed. Writing the same value
      back still invalidates style, which resizes the observed box, which
      schedules another callback, for ever;
   3. it is a custom property on the document root, not a style on the header,
      so measuring cannot change what is being measured. --hdr-h feeds one
      thing (.action-bar's top offset) and the header's own height does not
      depend on it, so there is no loop to close.
═══════════════════════════════════════════════════════════════════════ */
function useHeaderHeight(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    let last = null;
    const apply = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h === last || h === 0) return;
      last = h;
      document.documentElement.style.setProperty("--hdr-h", `${h}px`);
    };

    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; apply(); });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
      /* Leaving the room leaves the header with it. A stale height would push
         whatever sticks next down by the height of a bar that is gone. */
      document.documentElement.style.removeProperty("--hdr-h");
    };
  }, [ref]);
}

/* ═══════════════════════ GLOBAL NAVBAR ═══════════════════════
   Persistent top bar shown on all screens.
   - Left:  Brand mark + "Point Poker" brand name
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
  const navRef = useRef(null), innerRef = useRef(null);
  const leftRef = useRef(null), rightRef = useRef(null);
  useBarFit(navRef, innerRef, leftRef, rightRef);

  return (
    <nav
      className={`navbar${currentUser ? " authenticated" : ""}`}
      role="navigation"
      aria-label={t("nav.aria")}
      /* Written by useBarFit, not by React: it is the outcome of a measurement
         that changes on resize, and routing it through state would re-render
         the whole bar on every frame of a drag to set one attribute. "full" is
         the pre-measurement default, so a bar that never measures shows
         everything rather than nothing. */
      data-nav-fit="full"
      ref={navRef}
    >
      <div className="navbar-inner pp-container" ref={innerRef}>
        <div className="navbar-left" ref={leftRef}>
          <BrandMark
            onClick={onLogoClick}
            size={44}
            label={t("nav.brandHome")}
          />
          {/* The wordmark is the same home control as the labelled mark beside
              it, so it is hidden from assistive tech rather than announcing one
              destination twice. It is a <span>, not a <button>, and that is the
              whole point: a focusable control that is aria-hidden is a
              contradiction, and Chrome logs it — "Blocked aria-hidden on an
              element because its descendant retained focus" — the moment a
              pointer click focuses it.

              The comment that used to sit here claimed tabIndex={-1} was "what
              makes aria-hidden legal". It is not. tabindex="-1" removes an
              element from SEQUENTIAL tab order only; click and programmatic
              focus still land on it, which is exactly how the warning was
              reached. `inert` would prevent focus, but it also swallows the
              click, so it cannot be used on something that must stay clickable.

              A span cannot take focus at all, so there is nothing to contradict.
              Keyboard and screen-reader users lose nothing: BrandMark, directly
              above, is a real button with a real name and the same onClick. */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <span
            className="navbar-brand"
            onClick={onLogoClick}
            aria-hidden="true"
          >
            <BrandWordmark />
          </span>
          {showMarketingNav && (
            <div className="navbar-links" aria-label={t("nav.sections")}>
              <NavLinkButton onClick={onPlans} ariaLabel={t("nav.toPricing")}>
                {t("nav.pricing")}
              </NavLinkButton>
              <NavLinkButton onClick={onSupport} ariaLabel={t("nav.toSupport")}>
                {t("nav.support")}
              </NavLinkButton>
              <NavLinkButton onClick={onTrust} ariaLabel={t("nav.toTrust")}>
                {t("nav.trust")}
              </NavLinkButton>
              <NavLinkButton onClick={onFaq} ariaLabel={t("nav.toFaq")}>
                {t("nav.faq")}
              </NavLinkButton>
            </div>
          )}
        </div>
        <div className="navbar-right" ref={rightRef}>
          <HeaderLanguageSwitcher />
          {/* Dark is the default and stays the default; this is the only way to
              leave it, and the choice is remembered. It sits before the account
              controls so it never competes with the one primary action.
              compactOnNarrow: this bar, unlike the room header, cannot spare
              the word on a phone — see the note on the variant in
              components.css. */}
          <ThemeToggle compactOnNarrow />
          {currentUser ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="nav-btn-history"
                onClick={onHistory}
                aria-label={t("nav.viewHistory")}
              >
                <Icon name="chart" /> {t("nav.history")}
              </Button>
              <div className="nav-account" aria-label={t("nav.account")}>
                <span className="nav-account-name">{accountLabel}</span>
                <span className="nav-account-plan">{t("nav.plan")}</span>
              </div>
              {onAdmin && (
                <IconButton icon="chart" size="sm" label={t("nav.dashboard")} onClick={onAdmin} />
              )}
              <Button size="sm" className="nav-btn-login" onClick={onLogout}>{t("nav.signOut")}</Button>
            </>
          ) : (
            <>
              <Button size="sm" className="nav-btn-login" onClick={onLogin}>{t("nav.signIn")}</Button>
              {!inRoom && (
                <Button
                  variant={onJoinScreen ? "secondary" : "primary"}
                  size="sm"
                  className="nav-btn-register"
                  onClick={onStartFree}
                  aria-label={t("nav.startFree")}
                >
                  <span className="nav-start-free-long">{t("nav.startFree")}</span>
                  <span className="nav-start-free-short" aria-hidden="true">{t("nav.startShort")}</span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

const languageTarget = (code, pathname = window.location.pathname) => {
  const { path } = splitLocalePath(pathname);
  return LOCALIZED_PATHS.includes(path) ? withLocale(code, path) : withLocale(code, "/");
};

/* The footer carries the crawlable, always-open list. The header carries this
   compact disclosure so choosing a language is visible before someone has
   read the whole page. Both use real links and the same target helper, keeping
   the URL and document language in agreement. */
function HeaderLanguageSwitcher() {
  const current = getLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      rootRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="header-language" ref={rootRef}>
      <Button
        variant="secondary"
        size="sm"
        className="header-language__trigger"
        aria-label={t("lang.current", { language: LOCALES[current].label })}
        aria-expanded={open}
        aria-controls="header-language-options"
        onClick={() => setOpen((shown) => !shown)}
      >
        <span className="header-language__code" aria-hidden="true">{LOCALES[current].shortLabel}</span>
        <span className="header-language__chevron" aria-hidden="true" />
      </Button>
      {open && (
        <ul id="header-language-options" className="header-language__menu" aria-label={t("lang.aria")}>
          {LOCALE_CODES.map((code) => (
            <li key={code}>
              <a
                href={languageTarget(code)}
                hrefLang={LOCALES[code].hreflang}
                lang={LOCALES[code].hreflang}
                className="header-language__link"
                aria-current={code === current ? "page" : undefined}
              >
                {LOCALES[code].label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ═══════════════════════ LANGUAGE SWITCHER ═══════════════════════
   Real anchors doing real navigations, deliberately. A client-side language
   toggle is invisible to a crawler — it would never find /ja/ at all — and it
   would leave the URL saying English while the page said Japanese, which is the
   one thing hreflang cannot survive.

   Each link points at the same page in the target language when that page is
   translated, and at that language's home page when it is not, so the control
   never offers a URL that has no document behind it.
═══════════════════════════════════════════════════════════════ */
function LanguageSwitcher() {
  const current = getLocale();
  return (
    <nav className="lang-switcher" aria-label={t("lang.aria")}>
      <span className="lang-switcher-label">{t("lang.label")}</span>
      <ul>
        {LOCALE_CODES.map((code) => (
          <li key={code}>
            <a
              href={languageTarget(code)}
              hrefLang={LOCALES[code].hreflang}
              lang={LOCALES[code].hreflang}
              className={`lang-link${code === current ? " is-current" : ""}`}
              aria-current={code === current ? "true" : undefined}
            >
              {LOCALES[code].label}
            </a>
          </li>
        ))}
      </ul>
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
    <footer className="site-footer" aria-label={t("footer.aria")}>

      {/* ── Free-for-everyone bar ── */}
      <div className="footer-plan-bar pp-container">
        <div className="footer-plan-item">
          <Chip tone="gold">$0</Chip>
          <span className="footer-plan-text">{t("footer.freeText")}</span>
        </div>
        <div className="footer-plan-divider" aria-hidden="true" />
        <div className="footer-plan-item">
          <Chip tone="on-felt">{t("footer.laterChip")}</Chip>
          <span className="footer-plan-text">{t("footer.laterText")}</span>
        </div>
      </div>

      <div className="footer-inner pp-container">

        {/* Column 1, Brand */}
        <div className="footer-col-brand">
          <div className="footer-brand-row">
            {/* label="" — the wordmark beside it already says "Point Poker". */}
            <BrandMark size={36} label=""/>
            <span className="footer-brand-name"><BrandWordmark /></span>
          </div>
          <p className="footer-brand-desc">
            {signedIn ? t("footer.descSignedIn") : t("footer.descGuest")}
          </p>
          {!signedIn && (
            <p className="footer-brand-desc" style={{ marginTop: 4 }}>{t("footer.descGuest2")}</p>
          )}
        </div>

        {/* Column 2, Legal */}
        <div className="footer-col-links">
          <div className="footer-col-title">{t("footer.legal")}</div>
          <button className="footer-link" onClick={onNavTerms}>{t("footer.terms")}</button>
          <button className="footer-link" onClick={onNavPrivacy}>{t("footer.privacy")}</button>
          <button className="footer-link" onClick={onCookieSettings}>{t("footer.cookies")}</button>
          <button className="footer-link" onClick={onNavPrivacy}>{t("footer.gdpr")}</button>
        </div>

        {/* Column 3, Product */}
        <div className="footer-col-links">
          <div className="footer-col-title">{signedIn ? t("footer.account") : t("footer.product")}</div>
          {signedIn ? (
            <>
              <span className="footer-link footer-link--static">{t("footer.workspaceActive")}</span>
              <RouteLink href="/features" className="footer-link" onNavigate={onNavigate}>{t("footer.features")}</RouteLink>
              <RouteLink href="/support" className="footer-link" onNavigate={onNavigate}>{t("footer.support")}</RouteLink>
              <a href={`mailto:${support}`} className="footer-link">{t("footer.emailSupport")}</a>
            </>
          ) : (
            <>
              <RouteLink href="/" className="footer-link" onNavigate={onNavigate}>{t("footer.home")}</RouteLink>
              <RouteLink href="/about" className="footer-link" onNavigate={onNavigate}>{t("footer.about")}</RouteLink>
              <RouteLink href="/trust" className="footer-link" onNavigate={onNavigate}>{t("footer.trustRel")}</RouteLink>
              <RouteLink href="/features" className="footer-link" onNavigate={onNavigate}>{t("footer.features")}</RouteLink>
              <RouteLink href="/pricing" className="footer-link" onNavigate={onNavigate}>{t("footer.pricingPlans")}</RouteLink>
              <RouteLink href="/planning-poker-online" className="footer-link" onNavigate={onNavigate}>{t("footer.ppOnline")}</RouteLink>
              <RouteLink href="/support" className="footer-link" onNavigate={onNavigate}>{t("footer.supportContact")}</RouteLink>
            </>
          )}
        </div>

        {/* Column 4, Guides.
            Nine of the guide pages had no sitewide link at all — they were
            reachable only from another page's related-links block, which
            leaves them near the edge of the crawl and gives them almost no
            internal link equity. A footer column costs one row of markup and
            links every one of them from every page. */}
        <div className="footer-col-links">
          <div className="footer-col-title">{t("footer.guides")}</div>
          <RouteLink href="/what-is-planning-poker" className="footer-link" onNavigate={onNavigate}>{t("footer.guideWhatIs")}</RouteLink>
          <RouteLink href="/pointing-poker" className="footer-link" onNavigate={onNavigate}>{t("footer.guidePointing")}</RouteLink>
          <RouteLink href="/fibonacci-story-points" className="footer-link" onNavigate={onNavigate}>{t("footer.guideFib")}</RouteLink>
          <RouteLink href="/story-points-to-hours" className="footer-link" onNavigate={onNavigate}>{t("footer.guideHours")}</RouteLink>
          <RouteLink href="/story-point-estimation" className="footer-link" onNavigate={onNavigate}>{t("footer.guideEstimation")}</RouteLink>
          <RouteLink href="/planning-poker-jira" className="footer-link" onNavigate={onNavigate}>{t("footer.guideJira")}</RouteLink>
          <RouteLink href="/scrum-poker" className="footer-link" onNavigate={onNavigate}>{t("footer.guideScrum")}</RouteLink>
          <RouteLink href="/remote-sprint-planning" className="footer-link" onNavigate={onNavigate}>{t("footer.guideRemote")}</RouteLink>
          <RouteLink href="/agile-estimation-tool" className="footer-link" onNavigate={onNavigate}>{t("footer.guideAgile")}</RouteLink>
        </div>
      </div>

      {/* Bottom bar, copyright + legal note */}
      <div className="footer-bottom pp-container">
        <LanguageSwitcher />
        <div className="footer-copy">{t("footer.copyright", { year })}</div>
        <div className="footer-legal-note">
          {t("footer.legalNote1")}{" "}
          <button className="footer-link footer-link--inline" onClick={onNavTerms}>{t("footer.terms")}</button>
          {t("footer.legalNote2")}
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
    ? t("login.yourAccount")
    : mode === "register"
      ? t("login.createTitle")
      : mode === "reset"
        ? t("login.resetTitle")
        : t("login.signInTitle");

  const subtitle = currentUser
    ? t("login.subAccount")
    : mode === "register"
      ? teamRoomIntent
        ? t("login.subTeamRoom")
        : t("login.subRegister")
      : mode === "reset"
        ? t("login.subReset")
        : t("login.subSignIn");
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
      setAuthError(t("auth.noEmailForVerify"));
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
      setAuthError(t("auth.enterEmailPassword"));
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
      setAuthError(t("auth.enterName"));
      return;
    }
    if (!emailInput.trim() || !passInput) {
      setAuthError(t("auth.enterEmailPassword"));
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
      setAuthError(t("auth.enterEmailForReset"));
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
      setAuthError(t("auth.noResetAvailable"));
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
      ? { tone: "success", text: t("auth.signedIn") }
      : authStatus === "verify"
        ? { tone: "success", text: t("auth.accountCreatedVerify", { email: registerSuccess?.email || t("auth.yourEmail") }) }
        : authStatus === "verify_resent"
          ? { tone: "success", text: t("auth.verifyResent", { email: registerSuccess?.email || t("auth.yourInbox") }) }
          : authStatus === "verify_error"
            ? { tone: "warning", text: t("auth.accountCreatedNoMail") }
            : authStatus === "reset"
              ? { tone: "success", text: t("auth.resetSent") }
              : null;

  return (
    <Modal open title={title} subtitle={subtitle} onClose={onClose} className="login-modal">
      <Stack>
        {/* The chip, the reassurance card and the mode hint used to sit here in
            a stack, and on a 375px phone they pushed the password field and the
            submit button 330px below the fold — three paraphrases of one
            sentence in front of the task the dialog exists for. The subtitle
            already carries the message per mode, so the hint is gone and the
            card is kept only where it is not a restatement: the account panel
            when signed in, and the "you never needed one" reassurance on the
            tab where someone is deciding whether to create an account. */}
        {(currentUser || mode === "register") && (
        <Card variant="flat" pad="sm">
          {currentUser ? (
            <Stack gap="sm">
              <Row between>
                <span className="account-status-label">{t("login.signedInAs")}</span>
                <strong>{currentUser.displayName || currentUser.email || "Current account"}</strong>
              </Row>
              <Row between>
                <span className="account-status-label">Plan</span>
                <Chip tone="gold">{t("login.everythingUnlocked")}</Chip>
              </Row>
            </Stack>
          ) : (
            <p className="account-status-copy">
              You never need an account to run a room. Create one if you want two permanent Team Room links and sprint history that follows you across devices.
            </p>
          )}
        </Card>
        )}

        {showAuthForm && (
          <>
            <SegmentedControl
              block
              ariaLabel={t("login.tabsAria")}
              value={mode}
              onChange={(next) => { setMode(next); resetMessages(); }}
              options={[
                { value: "signin", label: t("login.tabSignIn") },
                { value: "register", label: t("login.tabRegister") },
                { value: "reset", label: t("login.tabReset") },
              ]}
            />

            {mode === "register" && (
              <TextField
                id="auth-name"
                label={t("login.fullName")}
                placeholder={t("login.namePlaceholder")}
                value={nameInput}
                onChange={(e) => { setNameInput(e.target.value); resetMessages(); }}
                maxLength={40}
                autoComplete="name"
                data-autofocus
              />
            )}

            <TextField
              id="auth-email"
              label={mode === "reset" ? t("login.accountEmail") : t("login.email")}
              type="email"
              placeholder={t("login.emailPlaceholder")}
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); resetMessages(); }}
              autoComplete="email"
              {...(mode !== "register" ? { "data-autofocus": true } : {})}
            />

            {mode !== "reset" && (
              <TextField
                id="auth-password"
                label={t("login.password")}
                type="password"
                placeholder={mode === "register" ? t("login.passwordMin") : t("login.passwordYour")}
                value={passInput}
                onChange={(e) => { setPassInput(e.target.value); resetMessages(); }}
                onKeyDown={(e) => e.key === "Enter" && (mode === "register" ? handleRegister() : handleSignIn())}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
            )}

            {statusAlert && <Alert tone={statusAlert.tone}>{statusAlert.text}</Alert>}

            {mode === "signin" && (
              <Button variant="primary" block onClick={handleSignIn} disabled={authStatus === "loading"}>
                {authStatus === "loading" ? t("login.signingIn") : t("login.signInTitle")}
              </Button>
            )}
            {mode === "register" && !registerComplete && (
              <Button variant="primary" block onClick={handleRegister} disabled={authStatus === "loading"}>
                {authStatus === "loading" ? t("login.creating") : teamRoomIntent ? t("login.createClaim") : t("login.createFree")}
              </Button>
            )}
            {mode === "register" && registerComplete && (
              <>
                <Button variant="primary" block onClick={handleRegisterContinue}>
                  {teamRoomIntent ? t("login.continueTeamRooms") : t("login.continueWorkspace")}
                </Button>
                <Button
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
                {authStatus === "loading" ? t("login.sendingReset") : t("login.sendReset")}
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
                title={t("login.notVerified")}
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
              {authStatus === "loading" ? t("login.sendingReset") : t("login.sendResetLong")}
            </Button>
          </>
        )}

        <Card
          variant="gold"
          pad="sm"
          title={currentUser ? t("login.whatAccountGives") : t("login.whatAccountAdds")}
          footer={
            currentUser ? null : (
              <span className="login-upgrade-note">
                <strong>{t("login.elseFree")}</strong> {t("login.elseFreeBody")}
              </span>
            )
          }
        >
          {currentUser ? t("login.accountActive") : t("login.accountAdds")}
        </Card>

        <p className="login-modal-upgrade">
          {t("login.notWorking")} <a href={`mailto:${support}`}>{t("login.emailSupport")}</a>
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
    <div className="cookie-banner" role="note" aria-label={t("cookie.aria")}>
      <Alert
        tone="info"
        title={t("cookie.title")}
        className="cookie-inner"
        actions={
          <>
            <Button size="sm" href="/privacy" target="_blank" rel="noopener noreferrer">{t("cookie.privacy")}</Button>
            <Button size="sm" href="/terms" target="_blank" rel="noopener noreferrer">{t("cookie.terms")}</Button>
            <Button variant="primary" size="sm" onClick={onAccept}>{t("cookie.gotIt")}</Button>
          </>
        }
      >
        {t("cookie.body")}
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
  /* Callers pass the English path — "/pricing", "/scrum-poker" — and this is
     the one place it becomes a real URL. withLocale prefixes it when the page
     exists in the active language and leaves it alone when it does not, so a
     Japanese session's footer link to /pricing goes to the English page that
     actually exists rather than to a /ja/pricing that does not. */
  const navTo = (path) => {
    const url = withLocale(getLocale(), path);
    window.history.pushState({}, "", url);
    setScreen(getScreenForPath(url));
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
      const teamMatch = pathname.match(TEAM_ROUTE);
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
    // Sanitised here too, not only in the field: this value is handed to
    // JoinScreen as the prefill, so ?room=a.b would otherwise arrive in the box
    // already loaded and take out ref() the moment anyone pressed Join.
    return cleanRoomCode(p.get("room"));
  });
  const [prefillTeam, setPrefillTeam] = useState(() => {
    // Clean URL: /t/<slug>  e.g. /t/rpa-build-team
    const pathMatch = window.location.pathname.match(TEAM_ROUTE);
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

  /* Every Firebase write below is somebody pressing a button, and a rejected
     write has to say so. Left bare it becomes an unhandled rejection: the
     button appears to do nothing at all, in a product where "nothing happened"
     and "it worked, wait for the others" look identical. Room creation, joining,
     the story queue and the sprint reset were each hardened against exactly
     that, one at a time, after each was reported separately. This is the same
     fix as one thing, so the next write cannot be the one that forgets. */
  const write = useCallback(async (failureMessage, run) => {
    try {
      await run();
      return true;
    } catch (err) {
      console.error(`[Point Poker] ${failureMessage}`, err);
      showToast(failureMessage);
      return false;
    }
  }, [showToast]);

  useEffect(() => {
    const pathname = window.location.pathname;
    const roomCode = new URLSearchParams(window.location.search).get("room");
    const teamMatch = pathname.match(TEAM_ROUTE);
    const teamSlug = teamMatch?.[1] || "";

    if (PRIVATE_PATHS.includes(pathname)) {
      applyRouteMeta({
        title: t("app.dashboardTitle"),
        description: t("app.dashboardDesc"),
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
        title: t("app.teamRoomTitle"),
        description: t("app.teamRoomDesc"),
        canonical: `${SITE_URL}/`,
        ogUrl: `${SITE_URL}/t/${teamSlug}`,
        robots: "noindex, nofollow",
      });
      return;
    }

    if (roomCode || screen === "game") {
      applyRouteMeta({
        title: t("app.roomTitle"),
        description: t("app.roomDesc"),
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
    const pathMatch = window.location.pathname.match(TEAM_ROUTE);
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
        // Zero stops the clock. It does NOT turn the cards over: the countdown
        // is a box the facilitator draws round the discussion, not a hand on
        // the deck. Auto-revealing took the round out of their hands
        // mid-sentence and published a half-voted table with no way back.
        // They reveal when the room is ready, or start another countdown.
        //
        // The expired state needs no new field and so no rules change: a timer
        // that is stopped at remaining 0 with nothing revealed is a countdown
        // that ran out, and nothing else writes that combination — a manual
        // stop keeps the seconds it stopped on, a new round restores the
        // duration, and both reveal paths set revealed at the same time.
        // See `timeUp` in GameScreen.
        //
        // The interval is already cleared by the time this runs, so a rejection
        // does not retry a second later — the clock simply stays where it is.
        // It has to be said out loud.
        const stopped = await write("Time is up, but the timer could not be stopped. Reveal the cards when you are ready.", () =>
          update(ref(db, `rooms/${code}/timer`), { running: false, remaining: 0, startedBy: null }));
        if (stopped) showToast("Time is up. Reveal the cards when the team is ready.");
      } else {
        // One tick failing is not worth a message — the next second retries it.
        await update(ref(db, `rooms/${code}/timer`), { remaining: r }).catch(() => {});
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
        // get() rather than a promise wrapped round onValue: onValue's third
        // argument here is an options object, not an error callback, so a failed
        // read never resolved and never rejected. The auto-reveal just stopped
        // existing, silently, for the rest of the round.
        const snap = await get(ref(db, `rooms/${code}`)).catch(() => null);
        if (!snap?.exists()) return;
        const fresh = snap.val();
        const freshVoters = Object.values(fresh.players || {}).filter(
          (p) => p.role === "voter",
        );
        if (freshVoters.every((p) => p.voted) && !fresh.revealed) {
          const ok = await write("Everyone voted, but the cards could not be revealed. Try the Reveal button.", async () => {
            await update(ref(db, `rooms/${code}`), { revealed: true });
            await update(ref(db, `rooms/${code}/timer`), {
              running: false,
              remaining: 0,
              startedBy: null,
            });
          });
          if (ok) showToast("Everyone voted. Revealing cards.");
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
        // Leaving is the point of this branch, so it happens whether or not the
        // delete lands. A rejection here used to throw out of the interval
        // callback and strand everyone inside an expired room with no notice;
        // reapStaleRooms clears the room afterwards either way. The toast is
        // chosen after, because write()'s own message would be overwritten by
        // the success line three statements later.
        const cleared = await remove(ref(db, `rooms/${code}`)).then(() => true).catch((err) => {
          console.error("[Point Poker] expired room delete failed", err);
          return false;
        });
        setScreen("join");
        setRoomData(null);
        setSessionWarning(false);
        setCode("");
        setPrefillTeam("");
        window.history.replaceState({}, "", homePath());
        showToast(cleared
          ? "Session ended automatically after 5 hours. Your sprint data is saved to history."
          : "Session ended automatically after 5 hours. Your sprint data is saved to history, but the room could not be cleared from the server.");
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
      console.error("[Point Poker] room creation failed", err);
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
    /* get(), not a promise wrapped round onValue: the third argument to onValue
       is an options object, not an error callback, so a read that failed never
       resolved and never rejected — the Join button stayed pressed for as long
       as the person was willing to wait. get() rejects, and the catch says so. */
    const snap = await get(ref(db, `rooms/${c}`)).catch((err) => {
      console.error("[Point Poker] room lookup failed", err);
      return null;
    });
    if (!snap) {
      showToast("Could not reach the server to look that room up. Check your connection and try again.");
      return;
    }
    if (!snap.exists()) {
      showToast(`Room "${c}" not found. If it was a one-off room, ask the host for a fresh link or code.`);
      return;
    }
    const data = snap.val();
    const currentCount = countParticipants(data.players || {}, myId);
    if (currentCount >= MAX_PARTICIPANTS) {
      showToast(t("toast.roomFull"));
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
      console.error("[Point Poker] join failed", err);
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
    // Same as handleJoin: onValue with an options object never rejects, so a
    // failed lookup hung the Open button rather than reporting anything.
    const snap = await get(ref(db, `rooms/${c}`)).catch((err) => {
      console.error("[Point Poker] team room lookup failed", err);
      return null;
    });
    if (!snap) {
      showToast(`Could not reach the server to open ${teamName}. Check your connection and try again.`);
      return;
    }
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
      showToast(t("toast.teamRoomFull"));
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
      console.error("[Point Poker] team room entry failed", err);
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
      // The most-pressed control in the product. A rejected vote left the card
      // unlifted and said nothing, which reads as "the site is laggy" rather
      // than "your vote is not in" — and the table then waits on a player who
      // believes they have already voted.
      await write("Your card could not be played, check your connection and try again.", () =>
        update(ref(db, `rooms/${code}/players/${myId}`), { voted: true, vote: val }));
    },
    [roomData, code, myId, write],
  );

  const revealVotes = useCallback(async () => {
    // Table size is the single most important input to any per-seat pricing
    // model, so it is sampled once per room at the first reveal.
    if (!roomDataRef.current?.revealed && (roomDataRef.current?.round || 1) === 1) {
      track(bucketTableSize(countParticipants(roomDataRef.current?.players || {})));
    }
    await write("Could not reveal the cards, check your connection and try again.", async () => {
      await update(ref(db, `rooms/${code}`), { revealed: true });
      await update(ref(db, `rooms/${code}/timer`), {
        running: false,
        remaining: 0,
        startedBy: null,
      });
    });
  }, [code, write]);

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
      console.error("[Point Poker] newRound write failed", err);
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
    /* The security rules cap a story key at three digits, because the key IS
       the index and constraining its format is the only way to bound a list
       that takes unauthenticated writes. Refuse here as well, or the write goes
       out, comes back rejected as a whole — a multi-path update is atomic — and
       the queue reports "check your connection" for something that is not the
       connection. Kept next to the rule it mirrors: database.rules.json,
       rooms/$roomId/stories/$storyIndex. */
    if (startIdx + names.length > MAX_QUEUE) {
      showToast(`A room holds ${MAX_QUEUE} ${getEstMode(roomData?.estimationMode).plural}. This queue has ${startIdx}.`);
      return;
    }
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
      console.error("[Point Poker] addStory write failed", err);
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
      console.error("[Point Poker] removeStory write failed", err);
      showToast("Could not remove that item, check your connection and try again.");
    }
  }, [code, roomData, showToast]);

  /* The wiring. Which paths a delete touches, and why the lists are rewritten
     rather than punched through, is in estimation.js where a test can read it
     without a browser — same arrangement as sprintResetUpdates above. */
  const deleteSizedItem = useCallback(async (kind, index) => {
    const paths = deleteSizedItemUpdates(roomData, kind, index);
    if (!paths) return false;
    const upd = Object.fromEntries(
      Object.entries(paths).map(([path, v]) => [`rooms/${code}/${path}`, v]),
    );
    const ok = await write("Could not delete that estimate, check your connection and try again.",
      () => update(ref(db), upd));
    if (ok) showToast("Estimate deleted.");
    return ok;
  }, [code, roomData, write, showToast]);

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
      console.error("[Point Poker] recordAndNextStory write failed", err);
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
      console.error("[Point Poker] resetSession write failed", err);
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
    /* The one destructive action in the product, and the only one behind a
       confirm. Bare, a rejected delete threw before every line below it: the
       screen never changed, so the facilitator who had just confirmed
       "permanently deletes all session data" was left sitting in the room with
       no idea whether it had happened. Leave regardless — the local timers are
       already cleared above and reapStaleRooms collects the room either way. */
    await write("Could not delete the room from the server. You have left the session.", () =>
      remove(ref(db, `rooms/${code}`)));
    setScreen("join");
    setRoomData(null);
    setSessionWarning(false);
    setCode("");
    setPrefillTeam("");
    window.history.replaceState({}, "", homePath());
  }, [code, write]);

  const startTimer = useCallback(
    async (sec) => {
      const started = await write("Could not start the timer, check your connection and try again.", () =>
        update(ref(db, `rooms/${code}/timer`), {
          running: true,
          duration: sec,
          remaining: sec,
          startedBy: myId,
        }));
      if (started) track("feature_timer");
    },
    [code, myId, write],
  );

  const stopTimer = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    remainingRef.current = null;
    // The local interval is already gone, so a failure here leaves everyone
    // else watching a countdown that has stopped counting.
    await write("Could not stop the timer for everyone else, check your connection and try again.", () =>
      update(ref(db, `rooms/${code}/timer`), { running: false, startedBy: null }));
  }, [code, write]);

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
      }).catch(() => {}); // the removal below is the point; a stuck timer is not worth blocking it
    }

    const removed = await write(`Could not remove ${targetName || "that person"}, check your connection and try again.`, () =>
      remove(ref(db, `rooms/${code}/players/${targetId}`)));
    if (removed) showToast(`${targetName || "Participant"} removed from the room.`);
  }, [code, myId, showToast, write]);

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
        <a className="skip-link" href="#main">{t("skip.main")}</a>
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
          {screen === "agileEstimationTool" && (
            <AgileEstimationToolPage onNavigate={navTo} />
          )}
          {screen === "pricing" && (
            <PricingPage onNavigate={navTo} />
          )}
          {screen === "features" && (
            <FeaturesPage onNavigate={navTo} />
          )}
          {screen === "storyPointEstimation" && (
            <StoryPointEstimationPage onNavigate={navTo} />
          )}
          {screen === "remoteSprintPlanning" && (
            <RemoteSprintPlanningPage onNavigate={navTo} />
          )}
          {/* Every data-driven page, in one line. See STATIC_SCREEN_BY_PATH. */}
          {screen.startsWith("/") && ROUTE_CONTENT[screen] && (
            <ContentPage path={screen} onNavigate={navTo} />
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
                {t("app.connecting")}
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
              onDeleteSizedItem={deleteSizedItem}
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
                  ? t("toast.accountCreated")
                  : t("toast.accountCreatedNoMail"),
              );
            } else {
              showToast(t("toast.signedIn"));
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
/* `flow`, because a section is allowed more than one block in it. Without it,
   the pricing page's "Why free, and for how long" note sat flush against the
   bottom of the card grid above it — zero pixels, next to a 24px gutter between
   the cards themselves. The flow gives every block in a band the same
   --block-y, and .pp-flow already zeroes SectionHead's own margin so the
   heading does not get the gap twice. */
function MarketingSection({ title, intro, children }) {
  return (
    <Section tight flow className="marketing-section">
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
  primaryLabel,
  secondaryHref = "/pricing",
  secondaryLabel,
  onNavigate,
  children,
}) {
  /* Reading a Japanese site and landing on a page that is English only is
     confusing unless somebody says so. The translated set is deliberately
     small; this is the one line that keeps the rest from feeling broken. */
  const englishOnly =
    getLocale() !== "en" && !LOCALIZED_PATHS.includes(splitLocalePath(window.location.pathname).path);
  return (
    <div className="marketing-page">
      <Container>
        <Button size="sm" className="legal-back" onClick={() => onNavigate("/")}>
          {t("page.back")}
        </Button>
        {englishOnly && <p className="marketing-lang-note">{t("footer.englishOnly")}</p>}
      </Container>
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
              {primaryLabel || t("page.startFree")}
            </Button>
            <Button as={RouteLink} href={secondaryHref} onNavigate={onNavigate}>
              {secondaryLabel || t("page.viewPricing")}
            </Button>
          </>
        }
        aside={
          highlights?.length ? (
            <Grid min="180px" className="marketing-stat-grid">
              {highlights.map((item) => (
                <StatTile key={item.label} label={item.label} value={item.value} gold />
              ))}
            </Grid>
          ) : null
        }
      />
      <Container>{children}</Container>
    </div>
  );
}

/* One component for every page whose whole substance is prose, lists and an
   FAQ. The thirteen pages above predate it and are hand-built because each has
   its own furniture; these do not, and writing a third near-identical eighty
   line component was the point at which the data was obviously the page.

   It renders the same ROUTE_CONTENT object the prerender turns into static
   HTML and FAQPage JSON-LD, so the crawler, the answer engine and the reader
   are looking at one set of words by construction rather than by discipline.
   A new landing page is now a data object in routeMeta.mjs and a line in
   STATIC_SCREEN_BY_PATH. */
function ContentPage({ path, onNavigate }) {
  const c = ROUTE_CONTENT[path];
  if (!c) return null;

  return (
    <MarketingPageShell
      eyebrow={c.eyebrow}
      title={c.h1}
      intro={c.intro}
      highlights={c.highlights}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel={t("page.startFree")}
      secondaryHref="/features"
      secondaryLabel={t("page.seeFeatures")}
    >
      {c.body?.length > 0 && (
        <Section tight flow className="marketing-section">
          {c.body.map((p) => <p key={p} className="marketing-prose">{p}</p>)}
        </Section>
      )}

      {(c.sections || []).map((s) => (
        <MarketingSection key={s.title} title={s.title} intro={s.intro}>
          {s.body?.map((p) => <p key={p} className="marketing-prose">{p}</p>)}
          {s.bullets?.length > 0 && (
            <ul className="marketing-list">
              {s.bullets.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
        </MarketingSection>
      ))}

      {c.steps?.length > 0 && (
        <MarketingSection title={c.stepsTitle || t("page.howItWorks")} intro={c.stepsIntro}>
          <ol className="marketing-list">
            {c.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </MarketingSection>
      )}

      {/* Same Accordion as the home and support FAQs: answers stay in the DOM
          when collapsed, so the FAQPage schema describes text a crawler can
          actually read on the page. */}
      {c.faq?.length > 0 && (
        <MarketingSection
          title={t("page.faqTitle")}
          intro={t("page.faqIntro")}
        >
          <Accordion items={c.faq.map(({ q, a }) => ({ question: q, answer: <p>{a}</p> }))} />
        </MarketingSection>
      )}

      {c.related?.length > 0 && (
        <MarketingRelatedLinks
          title={t("page.relatedTitle")}
          intro={t("page.relatedIntro")}
          onNavigate={onNavigate}
          links={c.related}
        />
      )}
    </MarketingPageShell>
  );
}

function PricingPage({ onNavigate }) {
  return (
    <MarketingPageShell
      eyebrow="Pricing"
      title="Planning poker pricing: everything is free, for every team"
      intro="There is no paid tier, no trial countdown and no credit card field anywhere on Point Poker. All three card decks, the countdown timer, facilitator analytics, story queues, CSV export and two fixed Team Rooms are free for everyone while we grow the user base."
      highlights={[
        { value: "$0", label: "Every feature, every team, no card" },
        { value: `${MAX_PARTICIPANTS}`, label: "Participants per room, facilitators included" },
        { value: "0", label: "Ads, trackers, and usage caps" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel={t("page.startFree")}
      secondaryHref="/features"
      secondaryLabel={t("page.seeFeatures")}
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
      eyebrow="About Point Poker"
      title="A planning poker tool built to stay fast, trustworthy, and usable in real sprint planning"
      intro="Point Poker exists for teams that want the useful parts of online estimation without the usual product bloat. The goal is simple: make it easy to open a room, invite the team, vote fairly, discuss clearly, and keep sprint planning moving."
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
        title="Why Point Poker was built"
        intro="A lot of planning poker tools feel like generic whiteboards or overbuilt agile suites. Point Poker takes the opposite approach: make the estimation ceremony faster, clearer, and easier to repeat."
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
        intro="Point Poker is still growing, but the product already exposes the practical signals teams expect before using a lightweight SaaS tool in real ceremonies."
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
        intro="These pages explain the product from the pricing, feature, and remote-team angles so teams can evaluate Point Poker from the perspective that matters most to them."
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
  return (
    <MarketingPageShell
      eyebrow="Support"
      title="Planning poker help and support"
      intro="The questions below cover almost everything people write in about. If yours is not one of them, the email address on this page goes straight to a person."
      highlights={[
        // A StatTile puts the label above the value, so the value has to be the
        // datum. "Email" over an uppercased address read backwards: the big gold
        // word said nothing and the address looked like a caption. The address
        // gets its own section below, where it can stay lowercase.
        { value: "5 hrs", label: "How long a room lasts before it is cleared" },
        { value: "2", label: "Team Rooms per free account, on URLs that never change" },
        { value: "$0", label: "Every feature, Team Rooms and sprint history included" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Open the app"
      secondaryHref="/pricing"
      secondaryLabel="Why it is free"
    >
      {/* The eight answers come from routeMeta so the FAQPage JSON-LD the
          prerender emits describes text that is genuinely on the page. Same
          Accordion as the home FAQ: answers stay in the DOM when collapsed,
          so a crawler reads every word. */}
      <MarketingSection
        title="Frequently asked questions"
        intro="Ordered roughly by how often they come up."
      >
        <Accordion
          items={SUPPORT_FAQ.map(({ q, a }) => ({ question: q, answer: <p>{a}</p> }))}
        />
      </MarketingSection>

      <MarketingSection
        title="Email support"
        intro="For anything the answers above do not cover, including account access, a Team Room slug you cannot claim, or sprint history that looks wrong."
      >
        <Alert
          tone="info"
          title={<>Write to <a href={`mailto:${SUPPORT_EMAIL}`} className="seo-inline-link">{SUPPORT_EMAIL}</a></>}
        >
          Three things make a bug reproducible first try: the room code or Team Room URL, what you expected
          to happen, and what happened instead. A screenshot helps if the layout is the problem. Replies come
          from one person, so they are not instant.
        </Alert>
      </MarketingSection>

      <MarketingRelatedLinks
        title="Related pages"
        intro="If the question is less about a problem and more about how the product works, start here."
        onNavigate={onNavigate}
        links={[
          { href: "/trust", kicker: "Trust", title: "Trust and reliability", copy: "What happens to your data, why there are no ads or tracking cookies, and what the server checks before it accepts a vote." },
          { href: "/about", kicker: "About", title: "Why Point Poker exists", copy: "Why this was built, and the features it deliberately leaves out." },
          { href: "/pricing", kicker: "Pricing", title: "What it costs", copy: "Nothing, for everyone. What that covers, and why it is not a trial." },
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
      intro="Point Poker is intentionally simple on the surface, but teams still need to know the basics are handled properly. This page brings together the practical trust signals behind the product: clear support, public legal routes, authenticated email, no ads or tracking cookies, and room safeguards that keep live sessions understandable."
      highlights={[
        { value: "Direct", label: `Support at ${support}` },
        { value: "Verified", label: "SPF, DKIM, and DMARC now pass" },
        { value: "No ads", label: "No advertising or third-party tracking cookies" },
      ]}
      onNavigate={onNavigate}
      primaryHref="/"
      primaryLabel="Open Point Poker"
      secondaryHref="/support"
      secondaryLabel="Get support"
    >
      <MarketingSection
        title="What teams should expect before they rely on a lightweight SaaS tool"
        intro="Trust is not about pretending a planning poker tool is an enterprise suite. It is about getting the operating basics right so teams understand what they are using and how it behaves."
      >
        <Grid min="280px">
          <Card title="Public support and legal routes">
              Point Poker publishes its support, privacy, and terms surfaces on the live domain so teams can see how the product is operated instead of hunting through a hidden help centre.
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
          { href: "/about", kicker: "About", title: "Why Point Poker exists", copy: "See the product philosophy behind the lightweight workflow and focused upgrade path." },
          { href: "/support", kicker: "Support", title: "Support and product guidance", copy: "See where to get help, what questions come up most often, and how the workflow is explained." },
          { href: "/pricing", kicker: "Pricing", title: "What it costs", copy: "Nothing, for everyone, and a straight answer on why and for how long." },
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
      intro="Point Poker works as an agile estimation tool for sprint planning and backlog refinement because it gives teams a clear workflow: define the story, vote independently, reveal together, discuss the gap, and record the agreed estimate without losing momentum."
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
        title="Where Point Poker fits in the agile workflow"
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
      intro="Point Poker is built for live estimation, not static voting widgets. It gives facilitators structure, participants a frictionless join flow, and teams enough context to move from discussion to agreement quickly."
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
        intro="A good planning poker tool helps teams think better. Point Poker adds the structure that makes disagreement productive instead of noisy."
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

function StoryPointEstimationPage({ onNavigate }) {
  return (
    <MarketingPageShell
      eyebrow="Story point estimation"
      title="Use story point estimation to drive better planning conversations, not false precision"
      intro="Point Poker is built around the reality that estimates are a team decision, not a spreadsheet formula. The product helps teams vote independently, expose differences, discuss trade-offs, and record the final agreed value from the active deck."
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
      intro="Distributed teams need sprint planning tools that are fast to join, easy to facilitate, and reliable enough to reuse every sprint. Point Poker keeps the estimation part of the ceremony compact so the team can focus on scope and delivery decisions."
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
      return t("auth.emailInUse");
    case "auth/invalid-email":
      return t("auth.invalidEmail");
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return t("auth.badCredentials");
    case "auth/weak-password":
      return t("auth.weakPassword");
    case "auth/too-many-requests":
      return t("auth.tooMany");
    default:
      return t("auth.generic");
  }
}

function getVerificationErrorMessage(error) {
  switch (error?.code) {
    case "auth/too-many-requests":
      return t("auth.verifyTooMany");
    case "auth/unauthorized-continue-uri":
    case "auth/invalid-continue-uri":
    case "auth/missing-continue-uri":
      return t("auth.verifyDomain");
    default:
      return t("auth.verifyGeneric");
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
  // throws: caller handles. Deliberately not swallowed here, because the two
  // callers need opposite things from a failure — handleRegister turns it into
  // the visible "could not create your account" error, and the auth-state
  // listener discards it so that a profile write nobody asked for cannot block
  // someone from using the app. A catch here would take the first away.
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
        <Button size="sm" className="legal-back" onClick={onBack} aria-label="Back to home">
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
   Governed by English law. Protects Point Poker and its operator
   from misuse, liability, and service abuse claims.
═══════════════════════════════════════════════════════════════ */
function TermsPage({ onBack }) {
  const support = process.env.REACT_APP_SUPPORT_EMAIL || "support@pointpoker.app";
  return (
    <LegalPage title="Terms of Service" lastUpdated="29 March 2026" onBack={onBack}>
      <h2>1. Agreement to Terms</h2>
      <p>
        These Terms of Service ("Terms") govern your access to and use of the Point Poker service
        ("Service"), operated by the Point Poker owner ("we", "us", "our"). By accessing or using
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
        Point Poker is a web-based planning poker tool designed to assist agile and Scrum teams in
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
        Point Poker ("we", "us", "our") is a planning poker service. The operator is the data controller
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
  const { totalSprints, avgVelocity, bestSprint, avgConsensus, trend } =
    sprintHistoryStats(history);

  const fmtDate = (ts) => {
    if (!ts) return "—";
    // The reader's locale, not a hardcoded en-GB: "12 Aug 2026" is not a date
    // format a Japanese or Brazilian reader recognises at a glance.
    return new Date(ts).toLocaleDateString(LOCALES[getLocale()].inLanguage, {
      day: "numeric", month: "short", year: "numeric",
    });
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
      title={t("history.title")}
      subtitle={totalSprints === 0
        ? t("history.none")
        : t(totalSprints === 1 ? "history.count" : "history.countPlural", { n: totalSprints })}
      onClose={onClose}
    >
      {totalSprints === 0 ? (
        <EmptyState title={t("history.emptyTitle")}>{t("history.emptyBody")}</EmptyState>
      ) : (
        <Stack gap="lg">
          {/* Rule 9: a sprint with no numeric points has no velocity, so the
              tile says what would appear there instead of printing a nought. */}
          <Grid min="150px">
            <StatTile
              label={t("history.avgVelocity")}
              value={avgVelocity > 0 ? avgVelocity : null}
              meta={t("history.ptsPerSprint")}
              empty={t("history.appearsOnce")}
            />
            <StatTile
              label={t("history.bestSprint")}
              value={bestSprint > 0 ? bestSprint : null}
              meta={t("history.storyPts")}
              empty={t("history.appearsOnce")}
            />
            <StatTile label={t("history.teamAlignment")} value={`${avgConsensus}%`} meta={t("history.avgConsensus")} gold />
            <StatTile
              label={t("history.velocityTrend")}
              value={trend ? `${trend.icon} ${trend.label}` : null}
              meta={trend ? t("history.trendMeta") : undefined}
              empty={t("history.needsTwo")}
            />
          </Grid>

          <ResultsTable
            caption={t("history.caption")}
            columns={[
              { key: "sprint", label: t("history.colSprint") },
              { key: "date", label: t("history.colEnded") },
              { key: "points", label: t("history.colPoints"), numeric: true },
              { key: "stories", label: t("history.colStories"), numeric: true },
              { key: "consensus", label: t("history.colConsensus"), numeric: true },
              { key: "duration", label: t("history.colDuration"), numeric: true },
            ]}
            rows={history.map((h, i) => ({
              id: h.id || i,
              sprint: h.teamName ? h.teamName : t("history.sprintN", { n: totalSprints - i }),
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
  /* The FAQ the page shows and the FAQ the prerenderer turns into FAQPage
     JSON-LD are now one object. They were two: the schema advertised three
     answers ("Is scrum poker the same as planning poker?", "Can we estimate in
     hours?", "Do I need a Jira plugin?") that were nowhere on the page, and the
     page showed two the schema never mentioned. Google's FAQPage rule is that
     the answer has to be visible on the page, so that markup was ineligible at
     best. One source also means every translation gets the FAQ for free. */
  const homeFaq = (ROUTE_CONTENT[withLocale(getLocale(), "/")] || ROUTE_CONTENT["/"]).faq;
  const teamRouteMatch = window.location.pathname.match(TEAM_ROUTE);
  const teamQuery = new URLSearchParams(window.location.search).get("team");
  const defaultName = currentUser?.displayName || deriveDisplayNameFallback(currentUser?.email || "");
  const accountDedicatedRooms = resolveDedicatedTeamRooms(accountProfile || {}, currentUser || {});
  const dedicatedRoomOwnerSuffix = deriveDedicatedRoomOwnerSuffix(accountProfile || {}, currentUser || {});
  const dedicatedRoomLabelSeed = deriveDedicatedRoomLabelPrefix(accountProfile || {}, currentUser || {});
  const dedicatedTeamRooms = [
    {
      key: "primary",
      shortLabel: t("join.room1"),
      name: accountDedicatedRooms.primary,
    },
    {
      key: "secondary",
      shortLabel: t("join.room2"),
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
    { key: "create", label: t("join.tabCreate") },
    { key: "join", label: t("join.tabJoin") },
    ...(signedIn && !isSharedTeamRoomEntry ? [] : [{ key: "team", label: t("join.tabTeam") }]),
  ];
  // Signing in while the team tab is open would otherwise strand the form on a
  // branch with no tab left to switch away from.
  const activeTab = TABS.some((t) => t.key === tab) ? tab : "create";
  const [nameDraft, setNameDraft] = useState(signedIn ? defaultName : recallName());
  const [nameEdited, setNameEdited] = useState(false);
  /* The tab is the answer to the role question, so it may as well answer it.
     You are creating a room, so you are the one running it; you are joining
     someone else's with a code, so you are there to vote in it. Team is create
     with a fixed URL, so it defaults the same way.

     The picker had no default at all, because defaulting everyone to voter left
     a solo creator at a revealed round with no way to record — every record
     control is facilitator-only. Defaulting BY TAB fixes that dead end without
     the mandatory click: the branch that produced it is the one branch that now
     starts on facilitator.

     Derived, not synced. An effect mirroring the tab into role state would have
     to know whether the user had overridden it, and that flag is this `||`. A
     pick outranks the tab from then on, in either direction. */
  const [pickedRole, setPickedRole] = useState("");
  const role = pickedRole || (activeTab === "join" ? "voter" : "observer");
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
  const [copiedDedicatedRoomKey, setCopiedDedicatedRoomKey] = useState("");
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

  const clearErr = () => { setErr(""); setErrField(""); };
  const fail = (message, field = "") => { setErr(message); setErrField(field); };
  // Rendered next to the field it names; falls back to the slot above the call
  // to action for anything that is not about one specific field.
  const fieldError = (field) =>
    err && errField === field
      ? <span className="pp-error" id="join-error" role="alert">{err}</span>
      : null;

  /* requireRole() lived here: a guard every path took so a blank role could not
     reach a room write. `role` cannot be blank now — the tab always supplies
     one — so the guard could not fire, and with it went the whole resume dance
     it needed (hold the room the user asked for, refuse it, focus the picker,
     re-open on the next click). A branch that cannot run is not a safety net;
     it is a description of a flow that no longer exists. */
  // Live preview of the room code a team name would produce
  const previewCode = teamName.trim() ? teamCode(teamName.trim()) : null;
  const teamPrimaryLabel = canEnterTeamRoom ? t("join.joinTeamRoom") : t("join.needAccount");
  const resolveEnteredName = useCallback(
    () => (nameInputRef.current?.value || nameValueRef.current || "").trim(),
    [],
  );
  const validateEnteredName = useCallback(() => {
    const enteredName = resolveEnteredName();
    if (!enteredName) return { ok: false, message: t("join.errName") };
    if (INVALID_PLACEHOLDER_NAMES.has(enteredName.toLowerCase())) {
      return { ok: false, message: t("join.errRealName") };
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

  const openDedicatedRoom = (room) => {
    const validatedName = validateEnteredName();
    if (!validatedName.ok) {
      fail(validatedName.message, "name");
      focusMissingField(nameInputRef.current);
      return;
    }
    setSelectedDedicatedRoomKey(room.key);
    onTeamRoom(validatedName.name, role, room.name, deck, estMode);
  };

  const chooseRole = (nextRole) => { setPickedRole(nextRole); clearErr(); };

  const go = () => {
    const validatedName = validateEnteredName();
    if (!validatedName.ok) { fail(validatedName.message, "name"); nameInputRef.current?.focus(); return; }
    const enteredName = validatedName.name;
    if (activeTab === "create") {
      onCreate(enteredName, role, deck, estMode);
    } else if (activeTab === "join") {
      if (!rc.trim()) { fail(t("join.errCode"), "code"); return; }
      onJoin(enteredName, role, cleanRoomCode(rc));
    } else {
      // team room — hosting one needs a free account for a unique URL
      if (!canEnterTeamRoom) {
        onRequireAccount?.();
        return;
      }
      if (!teamName.trim()) { fail(t("join.errTeam"), "team"); return; }
      onTeamRoom(enteredName, role, teamName.trim(), deck, estMode);
    }
  };

  const saveDedicatedRoomLabel = async () => {
    if (!currentUser?.uid) return;
    const nextLabel = dedicatedRoomLabel.replace(/\s+/g, " ").trim();
    if (!nextLabel) {
      fail(t("join.errRenameEmpty"), "rename");
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
      fail(t("join.errRenameSave"), "rename");
      setDedicatedRoomLabelStatus("error");
    } finally {
      setSavingDedicatedRoomLabel(false);
      dedicatedRoomLabelStatusRef.current = setTimeout(() => setDedicatedRoomLabelStatus(""), 2200);
    }
  };

  const ROLES = [
    { r: "voter",    icon: "cards", l: t("join.roleVoter"), s: t("join.roleVoterDesc") },
    { r: "observer", icon: "eye", l: t("join.roleObserver"), s: t("join.roleObserverDesc") },
  ];

  const copyTeamUrl = async (room) => {
    if (!room?.url) return;
    const ok = await copyText(room.url);
    if (!ok) {
      fail(t("join.errCopy"), "copy");
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
      {/* The hero sat stacked on top of the form inside one 440px card, which
          put 397px of marketing above the control people came to use and left
          829px of empty width either side. From 1024px up the two sit side by
          side instead: nothing is removed, the space was already there. */}
      <div className={`join-layout pp-container${signedIn ? " join-layout--workspace" : ""}`}>
        <div className="join-side">
        <header className="join-hero">
          {!signedIn && (
            <div className="join-mark">
              {/* The only brand element above the join title, so it carries the name. */}
              <BrandMark size={56} label="Point Poker"/>
            </div>
          )}

          <h1 className="join-title">
            {signedIn
              ? (defaultName
                  ? t("join.welcomeBackNamed", { name: defaultName.split(" ")[0] })
                  : t("join.welcomeBack"))
              : t("join.title")}
          </h1>
          <p className={`join-sub${signedIn ? " workspace" : ""}`}>
            {signedIn ? t("join.subSignedIn") : t("join.sub")}
          </p>
          {!signedIn && (
            <ul className="trust-strip" aria-label={t("join.trustAria")}>
              <li>♠ {t("join.trust1")}</li>
              <li>♥ {t("join.trust2")}</li>
              <li>♦ {t("join.trust3")}</li>
              <li>♣ {t("join.trust4")}</li>
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
              title={t("join.yourTeamRooms")}
              subtitle={t("join.yourTeamRoomsSub")}
            />

            <Stack>
              {dedicatedTeamRooms.map((room) => (
                <Card
                  key={room.key}
                  variant="raised"
                  pad="sm"
                  className="workspace-room-card"
                  footer={
                    /* Accent, not the default. This panel exists for these two
                       buttons: the page above it says "Welcome back" and offers
                       a fixed Team Room or a one-off session, and opening the
                       room IS the returning user's errand. As a neutral fill it
                       was the quietest thing on their half of the screen while
                       the gold sat on Create Room, which is the other path.

                       Accent rather than a second primary: one screen keeps one
                       gold gradient, and Create Room is still the control that
                       finishes the other job. Two of them because they are the
                       same action on two rooms, like rows in a list. */
                    <Button variant="accent" block onClick={() => openDedicatedRoom(room)}>
                      {t("join.openRoom", { room: room.shortLabel })}
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
                      {copiedDedicatedRoomKey === room.key ? t("join.linkCopied") : t("join.copyLink")}
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
              <summary className="workspace-rename-summary">{t("join.renameBoth")}</summary>
              <Stack gap="sm" className="workspace-rename-body">
                <TextField
                  id="workspace-rename-input"
                  ref={workspaceRoomEditorInputRef}
                  label={t("join.sharedRoomName")}
                  type="text"
                  value={dedicatedRoomLabel}
                  onChange={(e) => {
                    setDedicatedRoomLabel(e.target.value);
                    setDedicatedRoomLabelDirty(true);
                    setDedicatedRoomLabelStatus("");
                    clearErr();
                  }}
                  maxLength={60}
                  placeholder={t("join.renamePlaceholder")}
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
                    {savingDedicatedRoomLabel ? t("join.saving") : t("join.save")}
                  </Button>
                </TextField>
                <p className="workspace-rename-status" role="status">
                  {dedicatedRoomLabelStatus === "saved" ? t("join.renameSaved") : ""}
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
          ariaLabel={t("join.tabsAria")}
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
          label={t("join.yourName")}
          placeholder={t("join.namePlaceholder")}
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
          hint={signedIn ? t("join.nameHint") : undefined}
        />

        {activeTab === "join" && (
          <TextField
            id="join-room-code"
            label={t("join.roomCode")}
            placeholder={t("join.roomCodePlaceholder")}
            value={rc}
            /* Sanitised on the way in, not on the way out: this field is the
               trust boundary, and everything downstream of it — the prefill,
               the join handler, ref() itself — assumed base-36 and got
               whatever was pasted. Paste the share link and the code is
               lifted out of it. */
            onChange={(e) => { setRc(cleanRoomCode(e.target.value)); clearErr(); }}
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
              label={t("join.teamName")}
              placeholder={t("join.teamNamePlaceholder")}
              value={teamName}
              onChange={(e) => { setTeamName(e.target.value); clearErr(); }}
              onKeyDown={(e) => e.key === "Enter" && go()}
              readOnly={isSharedTeamRoomEntry || signedIn}
              error={err && errField === "team" ? err : undefined}
              hint={previewCode ? <>{t("join.roomCode")} <code className="tcp-code">{previewCode}</code></> : undefined}
            />
            {!canEnterTeamRoom ? (
              <Alert
                tone="gold"
                title={t("join.teamRoomsFree")}
                actions={
                  <Button size="sm" onClick={() => onRequireAccount?.()}>{t("join.createFreeAccount")}</Button>
                }
              >
                {t("join.teamRoomsFreeBody")}
              </Alert>
            ) : (
              <p className="join-note">
                {signedIn ? t("join.teamReady") : t("join.teamReadyGuest")}
              </p>
            )}
          </Stack>
        )}

        {/* Role picker. A group of buttons is not a form control, so its
            heading is a span with role="group" on the row, not a <label>
            pointing at nothing. */}
        <Stack gap="sm">
          <span className="pp-label" id="join-role-label">{t("join.yourRole")}</span>
          <ChoiceRow role="group" aria-labelledby="join-role-label">
            {ROLES.map(({ r, icon, l, s }) => (
              <Choice
                key={r}
                icon={icon}
                label={l}
                description={s}
                selected={role === r}
                aria-label={`${l} role: ${s}`}
                onSelect={() => chooseRole(r)}
              />
            ))}
          </ChoiceRow>
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
                <span className="pp-label" id="join-deck-label">{t("join.cardDeck")}</span>
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
                <span className="pp-label" id="join-estmode-label">{t("join.estimating")}</span>
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
                {ESTIMATION_MODES[estMode].desc.toLowerCase()}. {t("join.permanence")}
              </span>
            </p>
          </>
        )}

        {err && !errField && <Alert tone="danger" id="join-error">{err}</Alert>}
        <Button variant="primary" size="lg" block onClick={go}>
          {activeTab === "create" ? t("join.createRoom")
            : activeTab === "join" ? t("join.joinRoom")
            : teamPrimaryLabel}
        </Button>
        {!signedIn && activeTab === "create" && (
          <p className="join-note join-note--centred">{t("join.noteCreate")}</p>
        )}
        {!signedIn && activeTab === "join" && (
          <p className="join-note join-note--centred">{t("join.noteJoin")}</p>
        )}
        {!signedIn && activeTab === "team" && (
          <p className="join-note join-note--centred">{t("join.noteTeam")}</p>
        )}
      </Stack>
      </div>

      {!signedIn && (
      <Section className="seo-section" aria-label={t("home.aria")}>
      {/* The band runs edge to edge; its content sits in the same container the
          header uses, so the headline below starts on the brand's left edge
          rather than 20px off the window. `flow` puts one gap between every
          block in it — heading, prose, card grid, subsection. */}
      <Container flow>
        <SectionHead title={t("home.h2")} subtitle={t("home.h2sub")} />
        <Prose>
          <p>
            <strong>{t("home.freeLead")}</strong> {t("home.freeBody")}
          </p>
        </Prose>

        <Grid min="300px" className="seo-grid">
          <Card title={t("home.revealTitle")}>{t("home.revealBody")}</Card>
          <Card title={t("home.howTitle")}>
            <ol className="seo-ol">
              {tList("home.howSteps").map((step) => <li key={step}>{step}</li>)}
            </ol>
          </Card>
        </Grid>

        <Section flow className="scroll-target" id="plans" tabIndex="-1" aria-label={t("home.plansAria")}>
          <SectionHead as="h3" title={t("home.plansTitle")} subtitle={t("home.plansSub")} />
          <Grid min="280px">
            <Card variant="gold" eyebrow={t("home.planEveryone")} title="$0">
              <ul className="seo-plan-list">
                {tList("home.planFreeList").map((item) => <li key={item}>{item}</li>)}
              </ul>
            </Card>
            <Card eyebrow={t("home.planComparedWith")} title="$20–30/mo">
              <ul className="seo-plan-list">
                {tList("home.planOtherList").map((item) => <li key={item}>{item}</li>)}
              </ul>
            </Card>
          </Grid>
          <Row className="seo-plan-actions">
            <Button as={RouteLink} href="/pricing" onNavigate={onNavigate}>
              {t("home.pricingCta")}
            </Button>
          </Row>
        </Section>

        <Section flow className="seo-features">
          <SectionHead as="h3" title={t("home.diffTitle")} />
          <ul className="seo-ul">
            {tList("home.diffList").map((item) => {
              // "Label: rest" — the lead-in is bold in every language, and the
              // split has to be on the string rather than on markup, or each
              // translation would have to carry its own <strong> tags.
              const [lead, ...rest] = item.split(": ");
              return rest.length ? (
                <li key={item}><strong>{lead}:</strong> {rest.join(": ")}</li>
              ) : (
                <li key={item}>{item}</li>
              );
            })}
          </ul>
          <Prose>
            <p>
              {t("home.exploreLead")}{" "}
              <RouteLink href="/features" onNavigate={onNavigate} className="seo-inline-link">{t("home.linkFeatures")}</RouteLink>
              {", "}
              <RouteLink href="/planning-poker-online" onNavigate={onNavigate} className="seo-inline-link">{t("home.linkOnline")}</RouteLink>
              {", "}
              <RouteLink href="/scrum-poker" onNavigate={onNavigate} className="seo-inline-link">{t("home.linkScrum")}</RouteLink>
              {", "}
              <RouteLink href="/story-point-estimation" onNavigate={onNavigate} className="seo-inline-link">{t("home.linkEstimation")}</RouteLink>
              {", "}
              <RouteLink href="/what-is-planning-poker" onNavigate={onNavigate} className="seo-inline-link">{t("home.linkWhatIs")}</RouteLink>
              {", "}
              <RouteLink href="/fibonacci-story-points" onNavigate={onNavigate} className="seo-inline-link">{t("home.linkFib")}</RouteLink>
              {", "}
              <RouteLink href="/agile-estimation-tool" onNavigate={onNavigate} className="seo-inline-link">{t("home.linkAgile")}</RouteLink>
              {", "}
              <RouteLink href="/trust" onNavigate={onNavigate} className="seo-inline-link">{t("home.linkTrust")}</RouteLink>
              {" "}
              {t("home.exploreTail")}
            </p>
          </Prose>
        </Section>

        <Section flow className="seo-faq scroll-target" id="faq" tabIndex="-1">
          <SectionHead as="h3" title={t("home.faqTitle")} />
          {/* Accordion, not eight open blocks: the answers stay in the DOM
              (hidden, never unmounted) so a crawler still reads every word,
              while the page stops being a wall of text on a phone. */}
          <Accordion items={homeFaq.map(({ q, a }) => ({ question: q, answer: <p>{a}</p> }))} />
        </Section>
      </Container>
      </Section>
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
  { key: "wtp_zero",  labelKey: "wtp.zero" },
  { key: "wtp_5",     labelKey: "wtp.5" },
  { key: "wtp_15",    labelKey: "wtp.15" },
  { key: "wtp_30",    labelKey: "wtp.30" },
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
        {t("wtp.thanks")}
      </Alert>
    );
  }
  return (
    <Card variant="flat" pad="sm" className="wtp-panel" role="group" aria-labelledby="wtp-q">
      <Row between nowrap>
        <Eyebrow>{t("wtp.eyebrow")}</Eyebrow>
        <IconButton icon="close" size="sm" label={t("wtp.dismiss")} onClick={dismiss} />
      </Row>
      <p className="wtp-q" id="wtp-q">
        {t("wtp.question")}
      </p>
      <Stack gap="sm">
        {WTP_OPTIONS.map((o) => (
          <Choice key={o.key} label={t(o.labelKey)} onSelect={() => answer(o.key)} />
        ))}
      </Stack>
      <span className="pp-hint">{t("wtp.note")}</span>
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
  timeUp,
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
        label: inviteCopied ? t("action.inviteCopied") : t("action.copyInvite"),
        icon: inviteCopied ? "check" : "link",
        onClick: onInvite,
        disabled: false,
      }
    : {
        /* Time up changes the label, not the button. The countdown ending is
           the moment this control matters most, and it is already the thing
           the facilitator's eye is on — moving the decision to a new button
           somewhere else would make them look for it. */
        label: timeUp ? t("action.revealTimeUp") : t("action.reveal"),
        icon: "eye",
        onClick: onReveal,
        disabled: votedCount === 0,
      };

  // Every branch has to be true in the state it renders in. A facilitator
  // sitting alone is not "waiting for votes"; there is nobody who could vote.
  const hint = revealed
    ? needsManualEstimate
      ? t("action.hintSplit")
      : t("action.hintDone")
    : voterCount === 0
      // The button above now says "Copy the invite link", so this says what
      // happens after rather than repeating the instruction.
      ? t("action.hintEmpty")
      : timeUp
        // Time up is a state, not a verdict: nothing has been decided and
        // nothing is lost. Both sentences say what is still available.
        ? t(votedCount === 0 ? "action.hintTimeUpNone" : "action.hintTimeUp")
        : votedCount === 0
          ? t(voterCount === 1 ? "action.hintFirstOne" : "action.hintFirstMany", { count: voterCount })
          : everyoneVoted
            ? t("action.hintAllIn")
            : t("action.hintEarly");

  return (
    <Card variant="raised" as="section" className="action-bar" aria-label={t("action.aria")}>
      <Row between nowrap>
        <span className="action-bar-title">
          {revealed
            ? t("action.cardsUp")
            : roomIsEmpty
              ? t("action.waiting")
              : timeUp
                ? t("action.timeUp")
                : t("action.inProgress")}
        </span>
        {/* "0 of 0 voted" over an empty bar is state that has not happened.
            Zeroes read as data. Neither renders until someone can vote. */}
        {voterCount > 0 && (
          <Chip tone={everyoneVoted ? "success" : undefined} count>
            {t("action.voted", { done: votedCount, total: voterCount })}
          </Chip>
        )}
      </Row>
      {voterCount > 0 && (
        <Progress
          value={votedCount}
          max={voterCount}
          label={t("action.progressAria", { done: votedCount, total: voterCount })}
          tone={everyoneVoted ? "complete" : undefined}
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
  onDeleteSizedItem,
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
  /* The sized row a delete has been asked about, held while the dialog asks.
     The whole row, not its index: the dialog names the item and its estimate,
     and it is the only thing on screen that can say what is about to go. */
  const [pendingDelete, setPendingDelete] = useState(null);
  /* Where focus goes after a delete. A dialog normally hands focus back to
     whatever opened it, and here that is the ✕ of the row being removed — it
     is not in the document any more, so the restore finds nothing and the
     keyboard lands on <body>, at the top of a long room. The list the row came
     out of is the nearest thing that still exists. */
  const sizedListRef = useRef(null);
  /* The sticky header measures itself so the sticky action bar knows where the
     bottom of it is. See useHeaderHeight. */
  const headerRef = useRef(null);
  useHeaderHeight(headerRef);
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
  const inviteLabel = isPersistentRoom ? t("game.linkPersistent") : t("game.linkTemporary");
  const inviteHelper = isPersistentRoom
    ? t("game.linkPersistentHint")
    : t("game.linkTemporaryHint");
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
    ? t("game.pickAgreed")
    : hasStories && !allStoriesDone
      ? t("game.recordNextItem", { value: chosenFinalEstimate })
      : t("game.recordNextRound", { value: chosenFinalEstimate });
  const revealedVotesSummary = voted.map((p) => p.vote).join(" • ");
  const revealHeroLabel = allSame ? t("game.agreedEstimate") : t("game.averageVote");
  const revealHeroHelper = allSame
    ? t("game.allSameHint")
    : unanimousUnknown
      ? t("game.allUnknownHint")
      : t("game.spreadHint");

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
    if (window.confirm(t("game.confirmReset"))) onReset();
  }, [onReset]);

  const confirmEndSession = useCallback(() => {
    if (window.confirm(t("game.confirmEnd"))) onEndSession();
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
    toast(ok ? t("toast.inviteCopied") : t("toast.copyBlockedLink"));
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
    if (names.length > 1) toast(t("game.queueAdded", { n: names.length, plural: estMode.plural }));
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

  const summaryTitle = rd.teamName ? t("game.summaryTitleTeam", { team: rd.teamName }) : t("game.summaryTitle");

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
    lines.push(t("game.summaryCounts", { plural: estMode.plural, total: summaryRows.length, sized: summarySized }));
    if (summaryTotalPoints !== null) lines.push(t("game.summaryTotal", { n: summaryTotalPoints }));
    // Pasted into Slack or a ticket, this text is the whole artefact, so it
    // signs itself. Free text, unlike the CSV, so nothing downstream breaks.
    lines.push("");
    lines.push(t("game.summaryFooter", { domain: SITE_URL.replace(/^https?:\/\//, "") }));
    track("feature_copy");
    const ok = await copyText(lines.join("\n"));
    toast(ok ? t("toast.summaryCopied") : t("toast.copyBlockedCsv"));
  }, [summaryRows, summarySized, summaryTotalPoints, summaryTitle, estMode.plural, toast]);

  const downloadSummaryCsv = useCallback(() => {
    track("feature_csv");
    /* The file signs itself. Where it signs is the whole decision, and it is
       made — and tested — in summaryCsv: last, after a blank row, in the first
       column, so no importer this product's docs promise can be broken by it.
       Same sentence the Copy button uses, so the two exports say one thing. */
    const csv = summaryCsv(
      [t("game.colIndex"), t("game.colItem"), t("game.colEstimate")],
      summaryRows.map((r, i) => [String(i + 1), r.name, r.estimate != null ? String(r.estimate) : ""]),
      t("game.summaryFooter", { domain: SITE_URL.replace(/^https?:\/\//, "") }),
    );
    // BOM so Excel opens UTF-8 item names correctly
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    /* The filename is the second place the brand appears — the footer row above
       is the first. It is the name that shows in a Slack upload and in a
       Downloads folder six months later, which is worth more than either. A CSV
       still cannot hold a logo; whoever wants the mark wants the PDF button
       beside this one. */
    a.download = `Point-Poker-${(code || "session").toLowerCase()}-${new Date()
      .toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("⬇ CSV downloaded.");
  }, [summaryRows, code, toast]);

  /* Print, or "Save as PDF" from the same dialog. The browser's own pipeline
     rather than a PDF library: it already knows paper sizes, margins and the
     user's printer, and it costs nothing in the bundle. */
  const printSummary = useCallback(() => {
    track("feature_pdf");
    window.print();
  }, []);

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

  /* The countdown ran out and the cards are still face down. The reasoning for
     deriving this rather than storing it is on isTimeUp, in src/estimation.js
     — the room's rules live where they can be tested without a browser. */
  const timeUp = isTimeUp(timer, revealed);

  return (
    <>
      {/* Confetti, mounts when consensus detected, canvas self-destructs when done */}
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} big={isRealConsensus} />}
      {/* Full-screen burst banner, auto-dismisses after 3.5s */}
      {showConsensus && voted.length > 0 && (
        <div className="consensus-overlay" aria-live="polite">
          <div className="consensus-burst">
            <span className="consensus-burst-emoji">🎉</span>
            <div className="consensus-burst-text">{t("game.perfectConsensus")}</div>
            <div className="consensus-burst-sub">
              All {voted.length} voters picked {voted[0].vote} — the team agrees
            </div>
          </div>
        </div>
      )}
      <header className="hdr" role="banner" ref={headerRef}>
        <div className="hdr-in pp-container">
          <div className="hdr-l">
            <Button size="sm" className="btn-back" onClick={onBack} aria-label={t("game.leaveAria")}>
              {t("game.leave")}
            </Button>
            <BrandMark size={34} onClick={onBack} label={t("game.returnHome")}/>
          </div>
          <div className="hdr-c">
            {/* The room had no heading at all, so a screen reader's heading
                list came back empty and there was nothing to jump to. The
                badges beside it are the visual version of the same fact. */}
            <VisuallyHidden as="h1">
              {t("game.roomAria", { code, round })}
            </VisuallyHidden>
            <Chip>{t("game.round", { n: round })}</Chip>
            {/* Same rule as the action bar's count: a gold "0 stories done"
                chip on a room that has not started reads as a score, and the
                only score it can report is nothing. It appears once there is
                something to report. */}
            {storiesDone > 0 && (
              <Chip tone="gold">
                <Icon name="cards" size={16} /> {storiesDone} <span className="badge-long">{storiesDone === 1 ? estMode.singular : estMode.plural} </span>{t("game.doneBadge")}
              </Chip>
            )}
            {code && <Chip className="room-code-chip">{code}</Chip>}
          </div>
          <div className="hdr-r">
            <ThemeToggle />
            <div className="hdr-invite" aria-label={t("game.inviteAria")}>
              <div className="hdr-invite-copy">
                <span className="hdr-invite-label">{inviteLabel}</span>
                <span className="hdr-invite-helper">{inviteHelper}</span>
                <span className="hdr-invite-url">{shareUrl}</span>
              </div>
              {/* The label collapses on a phone — the button is beside the room
                  code, the icon says "link", and 160px of nowrap label was
                  pushing the header 24px off a 375px screen. The accessible
                  name is on the button either way. */}
              <Button size="sm" className="hdr-copy" onClick={handleCopyLink} aria-label={t("game.copyInviteAria")}>
                <Icon name={headerLinkCopied ? "check" : "link"} size={16} />
                <span className="hdr-copy-label">
                  {headerLinkCopied ? t("game.inviteCopied") : t("game.copyInvite")}
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
            title={t("game.teamRoomReady")}
            className="solo-invite-banner"
            actions={
              <Button size="sm" onClick={() => setSoloBannerDismissed(true)}>{t("game.dismiss")}</Button>
            }
          >
            {t("game.teamRoomBody")}
          </Alert>
        )}
        {sessionWarning && (
          <Alert tone="warning" title={t("game.sessionEnds")} className="session-warn-banner">
            {t("game.sessionEndsBody")}
          </Alert>
        )}

        {/* Current item banner, visible to all players */}
        {activeStory && !allStoriesDone && (
          <Card variant="gold" pad="sm" className="story-name-banner">
            <Eyebrow>{t("game.nowEstimating", { label: estMode.progressLabel, n: activeStoryIdx + 1, total: stories.length })}</Eyebrow>
            <p className="story-name-text">{activeStory.name}</p>
          </Card>
        )}
        {allStoriesDone && (
          <Alert tone="success" title={estMode.backlogLabel} className="story-name-banner">
            {t("game.allEstimated", { n: stories.length, plural: estMode.plural })}
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
                timeUp={timeUp}
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
                <Icon name="clock" size={14} /> {t("game.timerTitle")}{" "}
                <span className="ptitle-optional">{t("game.timerOptional")}</span>
              </span>
              {isObs ? (
                <>
                  {!timer.running && !revealed && (
                    <>
                      {/* What happened, and what is still possible. No Reveal
                          button here: the action bar directly above already
                          holds it, in the place it always sits, and a second
                          copy would make the facilitator choose between two
                          identical controls at the one moment they are being
                          watched by the whole room. The Start row below is the
                          other option — another countdown, more time.

                          No class of its own: the panel's own `> * + *` rule
                          owns the gap above it, and a selector nothing else
                          needs is a selector to keep alive. */}
                      {timeUp && (
                        <Alert tone="warning" title={t("game.timerExpiredTitle")}>
                          {t("game.timerExpiredBody")}
                        </Alert>
                      )}
                      {/* Length and Start are one decision, so they are one
                          row: you pick 45 and press the thing next to it. They
                          used to be stacked with the hint wedged between them,
                          which put a sentence in the path of a two-step action.

                          The hint moved out of the Select and under the row for
                          the same reason it reads better there — it describes
                          the timer, not the length — and because a hint inside
                          the field makes the field taller than the button, so
                          nothing in the row can align to anything. Its
                          aria-describedby is now wired by hand to keep the
                          screen-reader announcement exactly as it was.

                          A placeholder is not a label and neither is the panel
                          heading above it: a screen reader used to land on this
                          control announcing only "30 seconds". */}
                      <div className="timer-setup">
                        <Select
                          id="timer-length"
                          label={t("game.countdownLength")}
                          value={tsel}
                          onChange={(e) => setTsel(+e.target.value)}
                          options={[
                            { value: 30, label: t("game.timer30") },
                            { value: 45, label: t("game.timer45") },
                            { value: 60, label: t("game.timer60") },
                          ]}
                          aria-describedby="timer-length-hint"
                        />
                        {/* Accent, not primary. The screen's filled primary is
                            whatever the action bar is asking for — invite the
                            team, reveal the cards — and this panel says
                            OPTIONAL on its own heading. It is the action of
                            this panel, one weight down from the action of the
                            room. */}
                        <Button variant="accent" onClick={() => onStart(tsel)}>
                          <Icon name="play" size={18} />{" "}
                          {t("game.startCountdown", { n: tsel === 60 ? t("game.oneMin") : `${tsel}s` })}
                        </Button>
                      </div>
                      <p className="pp-hint" id="timer-length-hint">
                        {t("game.timerHint")}
                      </p>
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
                          {urgent ? t("game.timeUp") : warn ? t("game.wrappingUp") : t("game.estimating")}
                        </div>
                        <div className="rhint">{t("game.timerEndsHint")}</div>
                        <Button variant="accent" size="sm" className="btn-stop" onClick={onStop}>
                          <Icon name="stop" size={16} /> {t("game.stopTimer")}
                        </Button>
                      </div>
                    </div>
                  )}
                  {revealed && (
                    <div className="waiting-hint">
                      {requiresManualFinalEstimate
                        ? t("game.splitHint")
                        : t("game.doneHint")}
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
                          {urgent ? t("game.pickNow") : warn ? t("game.lastSeconds") : t("game.pickYourCard")}
                        </div>
                        <div className="rhint">{t("game.facilitatorReveals")}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="waiting-hint">
                      {revealed
                        ? allSame
                          ? "✓ Cards revealed, consensus reached"
                          : "✓ Cards revealed, review the spread below"
                        /* Ahead of "you have voted", because it is the newer
                           fact and the one that explains why nothing is
                           happening. A voter who has not played can still play
                           — the deck is only locked at reveal. */
                        : timeUp
                          ? t("game.timeUpVoter")
                          : myVote
                            ? "✓ Card played. The cards flip once everyone has voted."
                            : t("game.playWhenReady")}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Cards */}
            {!isObs && (
            <div className="panel">
              <span className="ptitle">{t("game.yourEstimate")}</span>
              {false ? null : (
                <VoteHand>
                  {cards.map((c, i) => (
                    <VoteCard
                      key={c.val}
                      value={c.val}
                      suit={c.suit}
                      red={c.red}
                      wild={c.val === "?"}
                      selected={myVote === c.val}
                      // Locked is aria-disabled, not disabled: the card and the
                      // value it played stay in the accessibility tree once the
                      // cards are up, but nothing about it is actionable and it
                      // is out of the tab order (WCAG 4.1.2). VoteCard drops the
                      // click handler entirely rather than guarding inside it.
                      locked={revealed}
                      style={{ animationDelay: `${i * 0.055}s` }}
                      aria-label={t("game.voteAria", { value: c.val })}
                      onSelect={() => {
                        setOptimisticVote(c.val);
                        onCard(c.val);
                      }}
                    />
                  ))}
                </VoteHand>
              )}
              {!isObs && !revealed && (
                <div className="kbd-hint">
                  {numericDeck
                    ? <>{t("game.tipNumericLead")} <kbd>3</kbd>, <kbd>8</kbd>, <kbd>13</kbd>{t("game.tipNumericTail")} <kbd>?</kbd> {t("game.tipNumericEnd")}</>
                    : <>{t("game.tipOrderLead")} <kbd>1</kbd>–<kbd>{Math.min(9, cards.length)}</kbd> {t("game.tipOrderTail")} <kbd>?</kbd>.</>}
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
                    ? t("game.consensusReached")
                    : t("game.cardsUpDiscuss")
                  : myVote
                    ? t("game.youPicked", { value: myVote })
                    : t("game.pickToVote")}
              </div>
            </div>
            )}

            {/* Results */}
            {revealed && (
              <div className="panel panel-gold" role="region" aria-live="polite" aria-label={t("game.resultsAria")}>
                {voted.length > 0 && (
                  <>
                    {/* The cards come before the arithmetic, and that order is
                        the point of the ceremony rather than a layout preference.
                        This panel used to open with the AVERAGE VOTE hero and put
                        the faces ~780px down the page, so a facilitator who
                        pressed Reveal in front of a room saw a mean and had to
                        scroll to find out who had actually said what — the one
                        thing the table is about to talk about. The product's own
                        guide says it out loud: consensus comes out of the
                        conversation about the differences, not out of the average.

                        Nothing is lost on a consensus round: every card carries
                        the same number, so the agreed value is on screen before
                        the hero restates it. And the split-vote decision card
                        below already repeats votes shown, average and spread,
                        which is where a facilitator picking a number reads them. */}
                    <div className="who-section">
                      <span className="ptitle">{t("game.whoPickedWhat")}</span>
                    </div>
                    <RevealGrid>
                      {voted.map((p, i) => {
                        const isHigh =
                          !allSame && p.vote === String(maxV) && maxV !== minV;
                        const isLow =
                          !allSame && p.vote === String(minV) && maxV !== minV;
                        return (
                          <RevealCard
                            key={p.id}
                            value={p.vote}
                            name={p.name}
                            you={p.id === myId}
                            red={["♥", "♦"].includes(
                              cards.find((c) => c.val === p.vote)?.suit || "",
                            )}
                            tone={allSame ? "consensus" : isHigh ? "high" : isLow ? "low" : undefined}
                            tag={isHigh ? t("game.highest") : isLow ? t("game.lowest") : undefined}
                            style={{ animationDelay: `${i * 0.07}s` }}
                          >
                            {/* Rule 5 again: the tick is a second signal beside
                                the card's gold border, and it says the word too
                                rather than leaving a bare glyph to carry it. */}
                            {allSame && <Chip tone="gold">{t("game.agreed")}</Chip>}
                          </RevealCard>
                        );
                      })}
                    </RevealGrid>
                    <div className="avg-hero">
                      <div className="avg-hero-label">
                        {revealHeroLabel}
                      </div>
                      <div className="avg-hero-num">{avgDisp}</div>
                      {allSame ? (
                        <div className="avg-hero-consensus">
                          {isRealConsensus ? t("game.allPicked", { count: voted.length }) : t("game.everyonePicked")} {voted[0].vote}
                        </div>
                      ) : (
                        <div className="avg-hero-sub">
                          {revealHeroHelper}
                        </div>
                      )}
                      {!allSame && minV !== null && (
                        <>
                          {/* Min, median, max — not average. The hero number a
                              few lines up is the average, and repeating it here
                              as the one gold tile drew the eye to the value the
                              reader had just read instead of to the spread this
                              row exists to show. The helper above calls this
                              "the range", and an average is not part of one. */}
                          <Grid min="110px" className="avg-hero-range">
                            <StatTile label={t("game.min")} value={minV} />
                            <StatTile label={t("game.median")} value={medianDisp} />
                            <StatTile label={t("game.max")} value={maxV} />
                          </Grid>
                          {spread > 0 && (
                            <p className="avg-hero-sub">
                              {t(spread === 1 ? "game.spreadSub" : "game.spreadSubPlural", { n: spread })}
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {isObs && requiresManualFinalEstimate && (
                      <Card
                        variant="gold"
                        className="inline-final-decision"
                        role="group"
                        aria-label={t("game.facilitatorAria")}
                        eyebrow={t("game.facilitatorDecision")}
                        title={unanimousUnknown
                          ? t("game.nobodyCouldSize")
                          : t("game.chooseAgreed")}
                      >
                        <p>
                          {unanimousUnknown ? t("game.allUnknownBody") : t("game.mixedBody")}
                        </p>
                        <Grid min="130px" className="inline-final-summary">
                          <StatTile label={t("game.votesShown")} value={revealedVotesSummary || null} empty={t("game.nobodyVoted")} />
                          <StatTile label={t("game.average")} value={avgDisp} gold />
                          <StatTile
                            label={t("game.spread")}
                            value={spread !== null ? t(spread === 1 ? "game.spreadPoints" : "game.spreadPointsPlural", { n: spread }) : t("game.differentVotes")}
                          />
                        </Grid>
                        {/* Selection is aria-pressed on a Choice, not an .active
                            class: a class lets the visual state and the state a
                            screen reader announces disagree. */}
                        <ChoiceGrid cols={5} role="group" aria-label={t("game.chooseFinalAria")}>
                          {finalEstimateOptions.map((val) => (
                            <Choice
                              key={val}
                              compact
                              label={val}
                              selected={finalEstimate === val}
                              aria-label={t("game.recordValueAria", { value: val })}
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
                  <Row className="round-actions" role="group" aria-label={t("game.roundActionsAria")}>
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
                    label={estMode.key === "tasks" ? t("game.addTask") : t("game.addItem")}
                    placeholder={estMode.placeholder}
                    hint={t("game.addHint", { unit: estMode.singular })}
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
                    <Button variant="accent" disabled={!storyInput.trim()} onClick={() => addStoryLines(storyInput)}>
                      <Icon name="plus" size={16} /> Add
                    </Button>
                  </TextField>
                  {hasStories && (
                    <>
                      <div className="story-progress">
                        {estMode.progressLabel} {Math.min(activeStoryIdx + 1, stories.length)} of {stories.length}
                        {allStoriesDone ? t("game.allEstimatedTail", { plural: estMode.plural }) : ""}
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
                                  label={t("game.removeNamed", { name: s.name })}
                                  title={t("game.removeFromQueue")}
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
              <span className="ptitle">{t("game.atTheTable")}</span>
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
                <EmptyState title={t("game.nobodyYet")}>
                  {t("game.nobodyYetBody")}
                </EmptyState>
              )}
              {/* Rule 5: the brass ring on the avatar says "voted" and so does
                  the word beside it. Neither carries the meaning alone. */}
              <ParticipantList>
                {voters.map((p) => (
                  <Participant
                    key={p.id}
                    name={p.name}
                    you={p.id === myId}
                    tone={p.voted ? "voted" : "waiting"}
                    meta={p.voted ? t("game.votedLabel") : t("game.notVoted")}
                    actions={
                      <>
                        {revealed && p.voted && <Chip tone="gold" count>{p.vote}</Chip>}
                        {/* Danger, not ghost. Removing somebody mid-round takes
                            their vote out of the table with no undo, and as a
                            ghost button it was the same weight as the name
                            beside it — easy to press by accident and easy to
                            miss when you meant to. Same treatment End session
                            wears, for the same reason. */}
                        {isObs && p.id !== myId && (
                          <Button
                            variant="danger"
                            size="sm"
                            aria-label={t("game.removeFromRoom", { name: p.name })}
                            onClick={() => onRemoveParticipant(p.id, p.name)}
                          >
                            {t("game.remove")}
                          </Button>
                        )}
                      </>
                    }
                  />
                ))}
                {observers.map((p) => (
                  <Participant
                    key={p.id}
                    name={p.name}
                    you={p.id === myId}
                    tone="observer"
                    meta={t("game.facilitatorNoVote")}
                    actions={
                      isObs && p.id !== myId ? (
                        <Button
                          variant="danger"
                          size="sm"
                          aria-label={t("game.removeFromRoom", { name: p.name })}
                          onClick={() => onRemoveParticipant(p.id, p.name)}
                        >
                          {t("game.remove")}
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </ParticipantList>
            </div>

            {/* Sprint Analytics, facilitator only */}
            {isObs && (() => {
              const isTshirt = deck === "tshirt";
              const tshirtOrder = ["XS", "S", "M", "L", "XL", "XXL"];

              /* Stories from the named queue that have been recorded. srcIndex
                 is the position in the stored list, kept because filtering
                 loses it and deleting a row needs the address of the thing it
                 stands for, not the address of the row. */
              const sizedQueueStories = stories
                .map((s, srcIndex) => ({ ...s, srcIndex }))
                .filter((s) => s.estimate != null && s.estimate !== "?");

              // Rounds recorded via newRound (no-queue path).
              // T-shirt sessions still save valid deck values here, so keep both the
              // full set for breakdown/counting and the numeric subset for point KPIs.
              const recordedRounds = rounds
                .map((r, srcIndex) => ({ ...r, srcIndex }))
                .filter((r) => r.estimate != null && r.estimate !== "?");
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
                : consensusRate >= 80 ? t("game.alignExcellent")
                : consensusRate >= 60 ? t("game.alignGood")
                : consensusRate >= 40 ? t("game.alignFair")
                : t("game.alignLow");

              const alignSub = consensusRate === null
                ? t("game.recordFirst")
                : t("game.alignSub", {
                    done: consensusCount,
                    total: storiesDone,
                    unit: storiesDone === 1 ? estMode.singular : estMode.plural,
                  })
                  + (extraRounds > 0
                    ? t(extraRounds === 1 ? "game.alignRevote" : "game.alignRevotePlural", { n: extraRounds })
                    : "");

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
              const deckLabel = deck === "fibonacci" ? t("deck.fibonacci")
                : deck === "tshirt" ? t("game.deckTshirtSizes")
                : t("deck.powers");
              const unitLabel = isTshirt ? "" : t("game.unitPoints");

              // Per-item list — queue names when available, fallback to mode label + index
              const listedStories = sizedStories.map((s, i) => ({
                name: s.name && s.name.trim() ? s.name.trim() : `${estMode.progressLabel} ${i + 1}`,
                // With the unit, because the row and the delete dialog both
                // quote it and "recorded at 8" is not a story point.
                estimate: `${s.estimate}${unitLabel}`,
                kind: hasQueueData ? "story" : "round",
                srcIndex: s.srcIndex,
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
                    <span className="ptitle">{t("game.sprintAnalytics")}</span>
                    <EmptyState title={t("game.nothingRecorded")}>
                      {t("game.analyticsEmpty", { singular: estMode.singular })}
                    </EmptyState>
                  </div>
                );
              }

              return (
                <div className="panel">
                  <span className="ptitle">{t("game.sprintAnalytics")}</span>

                  {/* ── Section 1: Sprint Snapshot ──
                      A stack, not a Grid: three tiles auto-fitted two-up in a
                      258px rail and orphaned the third on a row of its own. */}
                  <div className="a-kpis">
                    <StatTile
                      inline
                      label={`${estMode.plural.charAt(0).toUpperCase() + estMode.plural.slice(1)} sized`}
                      value={storiesDone}
                    />
                    <StatTile
                      inline
                      label={isTshirt ? t("game.mostUsedSize") : t("game.sprintScope")}
                      value={(isTshirt ? tshirtMostCommon : scopeDisp) === "—" ? null : isTshirt ? tshirtMostCommon : scopeDisp}
                      empty={t("game.afterFirst")}
                    />
                    <StatTile
                      inline
                      label={isTshirt ? t("game.sizeMix") : t("game.avgPer", { unit: estMode.singular })}
                      value={(isTshirt ? tshirtSizeMix : avgDisp2) === "—" ? null : isTshirt ? tshirtSizeMix : avgDisp2}
                      empty={t("game.afterFirst")}
                    />
                  </div>

                  {/* ── Section 2: Team Alignment ── */}
                  <div className="a-align">
                    <Row between className="a-align-head">
                      <span className="a-align-title">{t("game.teamAlignment")}</span>
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
                      label={t("game.teamAlignmentAria", { n: consensusRate ?? 0 })}
                      tone={ALIGN_BAR_TONE[fillClass]}
                    />
                    <div className="a-align-sub">{alignSub}</div>
                    <div className="a-align-note">{t("game.alignNote", { plural: estMode.plural })}</div>
                  </div>

                  {/* ── Section 3: T-shirt size breakdown ── */}
                  {isTshirt && tshirtBreakdown.length > 0 && (
                    <div className="analytics-size-breakdown">
                      <div className="analytics-breakdown-title">
                        {t("game.sizeBreakdown")}
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
                  <div className="a-stories" ref={sizedListRef} tabIndex={-1}>
                    <div className="a-section-title">
                      {t("game.pluralSized", { plural: estMode.plural.charAt(0).toUpperCase() + estMode.plural.slice(1) })}{listedStories.length > 0 ? ` (${listedStories.length})` : ""}
                    </div>
                    {listedStories.length > 0 ? (
                      <ResultsTable
                        className="a-story-list"
                        columns={[
                          { key: "idx", label: t("game.colIndex"), numeric: true },
                          { key: "name", label: estMode.singular.charAt(0).toUpperCase() + estMode.singular.slice(1) },
                          { key: "estimate", label: t("game.colEstimate"), numeric: true },
                          /* A real column heading, not a blank one — the
                             stacked layout under 760px prints every heading in
                             front of its cell, so an empty string would leave a
                             button on a line with nothing naming it. Hidden at
                             table widths, where 81px of the rail's 343 went to
                             a word that three ✕ buttons had already said. */
                          { key: "remove", label: t("game.colRemove"), hideLabel: true },
                        ]}
                        rows={listedStories.map((st, i) => ({
                          id: i,
                          idx: i + 1,
                          name: st.name,
                          estimate: st.estimate,
                          remove: (
                            <IconButton
                              icon="close"
                              size="sm"
                              className="a-story-delete"
                              label={t("game.deleteEstimateAria", { estimate: st.estimate, name: st.name })}
                              onClick={() => { rememberDialogOpener(); setPendingDelete(st); }}
                            />
                          ),
                        }))}
                      />
                    ) : (
                      <EmptyState title={t("game.noneSized", { plural: estMode.plural })}>
                        {storiesDone > 0
                          ? t("game.addNamesHint", { singular: estMode.singular })
                          : t("game.estimatesAppear")}
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
                    {streak === 1 ? t("game.spree") : t("game.spreeN", { n: streak })}
                  </>
                }
              >
                {streak >= 5
                  ? t("game.spree4")
                  : streak >= 3
                  ? t("game.spree3")
                  : streak === 2
                  ? t("game.spree2")
                  : t("game.spree1")}
              </Alert>
            )}

            {/* Session summary, works with or without a named queue */}
            {summaryRows.length > 0 && (
              <div className="panel">
                <span className="ptitle">{t("game.sprintSummary")}</span>
                <ResultsTable
                  className="summary-rows"
                  caption={`${summarySized} of ${summaryRows.length} sized${summaryTotalPoints !== null ? ` · ${summaryTotalPoints} points total` : ""}`}
                  columns={[
                    { key: "name", label: t("game.colItem") },
                    { key: "estimate", label: t("game.colEstimate"), numeric: true },
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
                  <Button size="sm" onClick={printSummary}>
                    <Icon name="arrowRight" size={16} /> Print / PDF
                  </Button>
                </Row>
                {showWtpPoll && <WtpPoll onDone={() => setWtpDone(true)} />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* OUTSIDE .game-body, and that is the whole point of where it sits.

          It used to render inside the summary panel, which meant "Print / PDF"
          put the entire live room on paper: the action bar, an empty "Add an
          item" textarea, a Countdown length <select>, the participant list, the
          analytics rail — controls, on a sheet that cannot be clicked — with
          the branded report somewhere below the fold. Worse, the print theme
          only forces #000 on p/li/td/th, so every label that is a span or a div
          printed in its screen grey onto white paper and was close to invisible.

          .game-body is in the print hide-list now, so the sheet is this report
          and nothing else: mark, wordmark, domain, title, table, footer. No
          rule has to make the room presentable on paper, because the room is
          not on the paper. */}
      {summaryRows.length > 0 && (
        <PrintReport
          title={summaryTitle}
          meta={t("game.reportMeta", {
            code: code || "—",
            date: new Date().toLocaleDateString(LOCALES[getLocale()].inLanguage, {
              day: "numeric", month: "long", year: "numeric",
            }),
            sized: summarySized,
            total: summaryRows.length,
            plural: estMode.plural,
          }) + (summaryTotalPoints !== null
            ? t("game.reportPointsTotal", { n: summaryTotalPoints })
            : "")}
          columns={[t("game.colIndex"), t("game.colItem"), t("game.colEstimate")]}
          rows={summaryRows.map((r, i) => [
            String(i + 1),
            r.name,
            r.estimate != null ? String(r.estimate) : t("game.notEstimated"),
          ])}
        />
      )}

      {/* Deleting a recorded estimate is the one action in the room that
          removes work the team already did, so it is the one that gets a
          dialog instead of the toast-and-undo the rest of the room uses —
          there is nothing to undo it with. The dialog names the item and the
          number, because "are you sure?" over a list of five rows is a
          question about the wrong thing.
          Cancel holds focus on open: the safe way out should be the one that
          is already under your finger. */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t("game.deleteConfirm", { unit: estMode.singular })}
        subtitle={pendingDelete ? `${pendingDelete.name} — recorded at ${pendingDelete.estimate}` : undefined}
        footer={
          <>
            <Button data-autofocus onClick={() => setPendingDelete(null)}>{t("game.cancel")}</Button>
            <Button
              variant="danger-strong"
              onClick={() => {
                onDeleteSizedItem?.(pendingDelete.kind, pendingDelete.srcIndex);
                setPendingDelete(null);
                /* Only if the dialog's own restore came up empty. React reuses
                   the row nodes, so deleting row 2 of 3 leaves a ✕ at that
                   index and focus lands on it — the right answer, and better
                   than this one. This catches the last row, where it does not. */
                requestAnimationFrame(() => {
                  if (document.activeElement === document.body) sizedListRef.current?.focus();
                });
              }}
            >
              <Icon name="close" size={16} /> {t("game.confirmDelete")}
            </Button>
          </>
        }
      >
        {t("game.deleteBody")}
      </Modal>
    </>
  );
}

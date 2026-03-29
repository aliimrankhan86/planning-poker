import { useState, useEffect, useCallback, useRef } from "react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
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
  runTransaction,
  serverTimestamp,
  onDisconnect,
} from "firebase/database";

// ── ANONYMOUS USAGE ANALYTICS ────────────────────────────────────
// Privacy-first, cookie-free analytics.
// Writes daily increment counters to Firebase /analytics/daily/{date}/{event}.
// NO personal data, NO user IDs, NO cookies, NO IP addresses stored.
// Data is aggregate counts only — safe to disclose in privacy policy.
//
// Events tracked:
//   room_created_free / room_created_pro   — room creation by plan
//   player_joined / observer_joined        — role on join
//   stories_estimated                      — incremented per story completion
//   pricing_opened                         — intent to upgrade
//   pro_activated                          — successful key activation
//   login_modal_opened                     — engagement with auth flow
//   timer_used                             — feature adoption: timer
//   story_queue_used                       — feature adoption: story queue
//   invite_copied                          — virality signal
const _analyticsDate = () => new Date().toISOString().slice(0, 10); // "2025-03-28"
async function track(eventName) {
  try {
    await runTransaction(
      ref(db, `analytics/daily/${_analyticsDate()}/${eventName}`),
      (current) => (current || 0) + 1,
    );
  } catch {
    // Analytics must never break the main app — swallow all errors silently
  }
}

// ── SPRINT HISTORY ────────────────────────────────────────────────
// Saves a session summary to Firebase /history/{uid} when a Pro session ends.
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
const countVoters = (players = {}) =>
  Object.values(players).filter((p) => p?.role === "voter").length;
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

html { font-size: 16px; scroll-behavior: smooth; }
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
  font-size: 2.6rem; font-weight: 700;
  color: var(--cream); text-align: center;
  margin-bottom: 4px; letter-spacing: -0.03em; line-height: 1.1;
  text-shadow: 0 12px 32px rgba(0,0,0,.42);
}
.join-sub {
  text-align: center; color: rgba(245,251,247,.76);
  font-size: .92rem; margin-bottom: 36px; font-weight: 300; letter-spacing: .5px;
}
.join-sub.workspace {
  margin-bottom: 24px;
  letter-spacing: .2px;
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
  color: rgba(239,242,247,.46);
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
  color: rgba(239,242,247,.44);
}
.workspace-stat-v {
  display: block;
  color: var(--cream);
  font-size: .86rem;
  line-height: 1.45;
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
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 12px 14px;
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
.workspace-inline-note {
  margin-top: 10px;
  color: rgba(239,242,247,.52);
  font-size: .76rem;
  line-height: 1.5;
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
.inp::placeholder { color: rgba(239,242,247,.50); }
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
.pro-tab-badge { font-size: .52rem; font-weight: 700; letter-spacing: .08em; background: var(--gold); color: var(--ink); border-radius: 4px; padding: 1px 5px; margin-left: 6px; vertical-align: middle; }

/* Team Room preview chip */
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
  color: rgba(239,242,247,.48);
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
  .seo-grid, .seo-faq-grid, .seo-plan-grid { grid-template-columns: 1fr; }
  .seo-section h2.seo-h2 { font-size: 1.5rem; }
  .seo-section { margin-top: 40px; }
  .workspace-grid { grid-template-columns: 1fr; }
  .workspace-top,
  .workspace-team-url,
  .workspace-actions { flex-direction: column; align-items: stretch; }
  .workspace-action-btn { min-width: 0; width: 100%; }
  .workspace-pill { align-self: flex-start; }
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
.hdr-r { display: flex; align-items: center; gap: 8px; }
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
.rhint { font-size: .7rem; color: rgba(239,242,247,.52); margin-top: 3px; }
.btn-stop { margin-top: 8px; padding: 7px 12px; border-radius: 10px; border: 1px solid rgba(158,234,196,.14); background: rgba(255,255,255,.03); color: rgba(245,251,247,.75); font-family: 'Outfit', sans-serif; font-size: .73rem; cursor: pointer; transition: all .2s; }
.btn-stop:hover { background: rgba(255,255,255,.08); color: var(--cream); }
.waiting-hint { font-size: .8rem; color: rgba(239,242,247,.54); font-style: italic; text-align: center; padding: 8px 0; }

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
.vstatus.wait  { color: rgba(239,242,247,.52); font-style: italic; }

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
  color: rgba(239,242,247,.58); font-family: 'Outfit', sans-serif;
  font-size: .86rem; font-weight: 600; cursor: pointer; transition: all .2s;
  display: flex; align-items: center; justify-content: center; gap: 7px; white-space: nowrap;
}
.btn-new-session:hover { background: rgba(255,255,255,.09); border-color: rgba(255,255,255,.18); color: var(--cream); }
/* When New Sprint is the only button in the row, stretch it full-width */
.obs-secondary-row .btn-new-session:only-child { flex: 1; }
.btn-hint { font-size: .6rem; color: rgba(239,242,247,.50); text-align: center; margin-top: 1px; font-style: italic; }
.btn-end-session {
  width: 100%; padding: 12px 16px; border-radius: var(--radius-sm);
  background: rgba(224,72,72,.03); border: 1px solid rgba(224,72,72,.18);
  color: rgba(231,76,60,.55); font-family: 'Outfit', sans-serif;
  font-size: .84rem; font-weight: 500; cursor: pointer; transition: all .2s;
  display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 2px;
}
.btn-end-session:hover { background: rgba(192,57,43,.1); border-color: rgba(192,57,43,.35); color: #e74c3c; }
.end-session-hint { font-size: .58rem; color: rgba(239,242,247,.45); text-align: center; margin-top: 3px; font-style: italic; }

/* Story queue panel */
.story-panel { background: rgba(255,255,255,.03); border: 1px solid rgba(158,234,196,.10); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 10px; }
.story-panel-title { font-size: .65rem; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: rgba(239,242,247,.65); margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
.story-panel-optional { font-size: .58rem; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; color: rgba(201,145,42,.7); background: rgba(201,145,42,.1); border: 1px solid rgba(201,145,42,.2); border-radius: 20px; padding: 1px 7px; }
.story-panel-hint { font-size: .72rem; color: rgba(239,242,247,.45); margin-bottom: 10px; line-height: 1.5; font-style: italic; }
.story-active { font-size: .92rem; font-weight: 600; color: var(--cream); margin-bottom: 6px; line-height: 1.35; }
.story-progress { font-size: .68rem; color: rgba(239,242,247,.65); margin-bottom: 10px; }
.story-add-row { display: flex; gap: 6px; margin-bottom: 8px; }
.story-inp { flex: 1; padding: 8px 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(158,234,196,.16); border-radius: 10px; color: var(--cream); font-family: 'Outfit', sans-serif; font-size: .8rem; transition: border-color .2s, background .2s; }
.story-inp::placeholder { color: rgba(239,242,247,.50); }
.story-inp:focus { outline: none; border-color: var(--gold2); background: rgba(255,255,255,.10); }
.btn-story-add { padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(241,185,63,.26); background: linear-gradient(180deg, rgba(241,185,63,.16), rgba(241,185,63,.08)); color: var(--gold2); font-family: 'Outfit', sans-serif; font-size: .78rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all .2s; }
.btn-story-add:hover { background: linear-gradient(180deg, rgba(241,185,63,.22), rgba(241,185,63,.11)); }
.story-list { max-height: 100px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
.story-item { font-size: .75rem; padding: 4px 8px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
.story-item.done { color: rgba(239,242,247,.62); text-decoration: line-through; }
.story-item.active { background: var(--goldB); color: var(--gold2); font-weight: 600; }
.story-item.queued { color: rgba(239,242,247,.75); }
.story-est { font-size: .68rem; opacity: .7; }
.btn-record-next { width: 100%; padding: 11px; border-radius: var(--radius-sm); border: none; background: linear-gradient(135deg, rgba(75,216,137,.80), rgba(44,176,112,.62)); color: #04100b; font-family: 'Outfit', sans-serif; font-size: .82rem; font-weight: 700; cursor: pointer; transition: all .2s; margin-top: 4px; box-shadow: 0 12px 28px rgba(75,216,137,.18); }
.btn-record-next:hover { background: linear-gradient(135deg, rgba(95,230,154,.88), rgba(52,194,123,.72)); }
.btn-record-next:disabled { opacity: .3; cursor: not-allowed; }
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
.sep { border: none; border-top: 1px solid var(--border); margin: 6px 0; }
.nobody { font-size: .78rem; color: rgba(239,242,247,.50); font-style: italic; text-align: center; padding: 10px 0; }

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
  color: rgba(239,242,247,.4); font-size: .78rem; cursor: pointer;
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
  font-size: .60rem; color: rgba(239,242,247,.50); margin-top: 3px; display: block;
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
.a-align-score.neutral { color: rgba(239,242,247,.40); }  /* muted — not enough data yet */
.a-align-bar-track { height: 5px; border-radius: 3px; background: rgba(255,255,255,.09); overflow: hidden; }
.a-align-bar-fill { height: 100%; border-radius: 3px; transition: width .6s ease; }
.a-align-bar-fill.good    { background: linear-gradient(90deg,#2ecc71,#27ae60); }
.a-align-bar-fill.ok      { background: linear-gradient(90deg,var(--gold),var(--gold2)); }
.a-align-bar-fill.low     { background: linear-gradient(90deg,#e67e22,#d35400); }  /* amber, not red */
.a-align-bar-fill.neutral { background: rgba(255,255,255,.07); }
.a-align-sub  { font-size: .68rem; color: rgba(239,242,247,.48); margin-top: 5px; line-height: 1.4; }
.a-align-note { font-size: .60rem; color: rgba(239,242,247,.28); margin-top: 3px; font-style: italic; }
/* Per-story breakdown */
.a-stories { margin-top: 14px; }
.a-section-title {
  font-size: .65rem; font-weight: 500; letter-spacing: .08em; text-transform: uppercase;
  color: rgba(239,242,247,.40); margin-bottom: 4px;
}
.a-story-list { max-height: 180px; overflow-y: auto; }
.a-story-row { display: flex; align-items: center; padding: 5px 0; border-top: 1px solid rgba(255,255,255,.05); }
.a-story-row:first-child { border-top: none; }
.a-story-idx { font-size: .62rem; color: rgba(239,242,247,.28); width: 16px; flex-shrink: 0; font-weight: 400; text-align: right; }
.a-story-name { flex: 1; font-size: .76rem; color: rgba(239,242,247,.82); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0 8px; }
.a-story-est {
  font-size: .72rem; font-weight: 600; color: var(--gold2);
  background: rgba(232,184,75,.10); border: 1px solid rgba(232,184,75,.22);
  border-radius: 12px; padding: 2px 9px; flex-shrink: 0;
}
.a-empty { font-size: .72rem; color: rgba(239,242,247,.36); font-style: italic; padding: 6px 0; }
/* Estimate distribution chips */
.analytics-breakdown { margin-top: 14px; }
.analytics-breakdown-title {
  font-size: .65rem; font-weight: 500; letter-spacing: .08em;
  text-transform: uppercase; color: rgba(239,242,247,.40); margin-bottom: 7px;
}
.analytics-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.analytics-chip {
  display: flex; align-items: center; gap: 5px; padding: 4px 11px; border-radius: 20px;
  background: rgba(255,255,255,.05); border: 1px solid var(--border); font-size: .78rem; line-height: 1;
}
.analytics-chip-val { font-weight: 600; color: var(--gold2); }
.analytics-chip-cnt { color: rgba(239,242,247,.50); font-weight: 300; }

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
.cookie-banner {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 600;
  background: rgba(6,16,13,.90); backdrop-filter: blur(18px) saturate(1.2);
  border-top: 1px solid rgba(158,234,196,.12);
  padding: 16px 24px;
  animation: fadeIn .3s ease;
}
.cookie-inner {
  max-width: 900px; margin: 0 auto;
  display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
}
.cookie-text {
  flex: 1; min-width: 200px;
  font-size: .78rem; line-height: 1.6;
  color: rgba(239,242,247,.72); font-weight: 300;
}
.cookie-text strong { color: rgba(239,242,247,.90); font-weight: 600; }
.cookie-actions {
  display: flex; align-items: center; gap: 12px; flex-shrink: 0;
}
.cookie-link {
  font-size: .75rem; color: var(--gold2); text-decoration: underline;
  text-decoration-color: rgba(232,184,75,.4); white-space: nowrap;
  font-family: 'Outfit', sans-serif; cursor: pointer; background: none; border: none;
}
.cookie-link:hover { color: var(--gold3); }
.cookie-accept {
  padding: 9px 20px; border: none; border-radius: 12px;
  background: linear-gradient(135deg, #f0b43f 0%, #ffd978 58%, #fff0b0 100%);
  color: var(--ink); font-family: 'Outfit', sans-serif;
  font-size: .82rem; font-weight: 700; cursor: pointer;
  white-space: nowrap; transition: all .2s;
  box-shadow: 0 10px 24px rgba(241,185,63,.22);
}
.cookie-accept:hover { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(241,185,63,.28); }
@media (max-width: 600px) {
  .cookie-inner { flex-direction: column; align-items: flex-start; gap: 12px; }
  .cookie-actions { width: 100%; justify-content: space-between; }
}

/* ══════════════════════ LOADING ══════════════════════ */
.loading { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px; }
.spinner { width: 34px; height: 34px; border: 3px solid rgba(201,145,42,.18); border-top-color: var(--gold); border-radius: 50%; animation: spin .8s linear infinite; }

/* ══════════════════════ PRICING MODAL ══════════════════════ */
.pricing-overlay {
  position: fixed; inset: 0; z-index: 900;
  background: rgba(0,0,0,.72); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px; animation: fadeIn .2s ease;
}
.pricing-modal {
  width: 100%; max-width: 700px; max-height: 92vh; overflow-y: auto;
  background:
    linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0)),
    linear-gradient(155deg, rgba(12,28,23,.96) 0%, rgba(7,15,13,.98) 58%, rgba(4,10,9,1) 100%);
  border: 1px solid rgba(158,234,196,.14);
  border-radius: 28px; padding: 40px 36px 36px;
  box-shadow: 0 48px 120px rgba(0,0,0,.78), inset 0 1px 0 rgba(255,255,255,.06);
  position: relative; animation: fadeUp .3s ease;
  backdrop-filter: blur(24px) saturate(1.16);
  -webkit-backdrop-filter: blur(24px) saturate(1.16);
}
.pricing-modal::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--mint), var(--gold2), var(--aqua), transparent);
  background-size: 300% auto; animation: shimmer 3s linear infinite; border-radius: 24px 24px 0 0;
}
.pricing-close {
  position: absolute; top: 16px; right: 18px;
  background: transparent; border: 1px solid var(--border);
  color: rgba(239,242,247,.60); border-radius: 8px;
  width: 32px; height: 32px; font-size: 1.1rem;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all .2s;
}
.pricing-close:hover { background: var(--surface2); color: var(--cream); border-color: var(--border2); }
.pricing-title {
  font-family: 'Outfit', sans-serif;
  font-size: 2rem; font-weight: 700; color: var(--cream);
  letter-spacing: -0.03em; text-align: center; margin-bottom: 4px;
}
.pricing-sub {
  text-align: center; color: rgba(239,242,247,.65);
  font-size: .82rem; margin-bottom: 24px; font-weight: 300;
}
/* Billing toggle */
.billing-toggle-row {
  display: flex; justify-content: center; gap: 4px;
  background: rgba(255,255,255,.03); border: 1px solid rgba(158,234,196,.10);
  border-radius: 100px; padding: 4px; margin: 0 auto 18px; width: fit-content;
}
.billing-btn {
  padding: 7px 22px; border-radius: 100px; border: none; background: transparent;
  color: rgba(239,242,247,.60); font-family: 'Outfit', sans-serif;
  font-size: .84rem; font-weight: 500; cursor: pointer; transition: all .2s;
  display: flex; align-items: center; gap: 7px;
}
.billing-btn.active {
  background: linear-gradient(180deg, rgba(241,185,63,.16), rgba(241,185,63,.08)); color: var(--gold2); font-weight: 600;
}
.billing-save {
  font-size: .62rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  background: rgba(46,204,113,.18); color: #2ecc71; border-radius: 100px; padding: 2px 7px;
}
.billing-save.dim { background: rgba(255,255,255,.06); color: rgba(239,242,247,.40); }
/* Currency switcher */
.currency-row {
  display: flex; justify-content: center; gap: 6px; margin-bottom: 24px;
}
.currency-btn {
  padding: 6px 16px; border-radius: 100px; border: 1px solid rgba(158,234,196,.12);
  background: rgba(255,255,255,.025); color: rgba(239,242,247,.65); font-family: 'Outfit', sans-serif;
  font-size: .80rem; font-weight: 500; cursor: pointer; transition: all .2s;
}
.currency-btn.active { background: linear-gradient(180deg, rgba(241,185,63,.16), rgba(241,185,63,.08)); border-color: rgba(241,185,63,.4); color: var(--gold2); font-weight: 600; }
.currency-btn:hover:not(.active) { background: rgba(255,255,255,.06); color: var(--cream); border-color: rgba(158,234,196,.20); }
/* Pricing cards */
.pricing-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.pricing-card {
  border: 1px solid rgba(158,234,196,.14); border-radius: 22px;
  padding: 28px 22px 24px; background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01));
  display: flex; flex-direction: column; gap: 0; position: relative;
  transition: border-color .2s, transform .2s, box-shadow .2s;
}
.pricing-card:hover { transform: translateY(-3px); box-shadow: 0 24px 48px rgba(0,0,0,.24); }
.pricing-card.pro {
  border-color: rgba(241,185,63,.38);
  background: linear-gradient(160deg, rgba(241,185,63,.11), rgba(126,230,255,.05) 70%, rgba(241,185,63,.03));
  box-shadow: 0 0 40px rgba(241,185,63,.08);
}
.pricing-badge {
  position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
  background: linear-gradient(135deg, #f0b43f 0%, #ffd978 55%, #fff0b0 100%);
  color: var(--ink); font-size: .65rem; font-weight: 700;
  letter-spacing: 1.5px; text-transform: uppercase;
  padding: 4px 14px; border-radius: 100px; white-space: nowrap;
}
.pricing-tier { font-size: .68rem; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: rgba(239,242,247,.60); margin-bottom: 10px; }
.pricing-card.pro .pricing-tier { color: var(--gold2); }
.pricing-price { margin-bottom: 6px; display: flex; align-items: baseline; gap: 4px; }
.pricing-amount { font-family: 'Outfit', sans-serif; font-size: 3rem; font-weight: 700; color: var(--cream); line-height: 1; letter-spacing: -0.04em; }
.pricing-card.pro .pricing-amount { color: var(--gold2); }
.pricing-period { font-size: .82rem; color: rgba(239,242,247,.55); }
.pricing-desc { font-size: .78rem; color: rgba(239,242,247,.60); margin-bottom: 18px; min-height: 32px; line-height: 1.45; }
.pricing-features { display: flex; flex-direction: column; gap: 9px; margin-bottom: 22px; flex: 1; }
.pricing-feature {
  display: flex; align-items: flex-start; gap: 9px;
  font-size: .80rem; color: rgba(239,242,247,.82); line-height: 1.35;
}
.pf-icon { font-size: .85rem; flex-shrink: 0; margin-top: 1px; }
.pf-icon.yes { color: var(--green); }
.pf-icon.no  { color: rgba(239,242,247,.25); }
.pricing-card.pro .pricing-feature { color: rgba(239,242,247,.90); }
.pricing-cta {
  width: 100%; padding: 13px; border-radius: var(--radius-sm);
  font-family: 'Outfit', sans-serif; font-size: .9rem; font-weight: 600;
  cursor: pointer; transition: all .2s; border: 1px solid var(--border2);
  background: transparent; color: rgba(239,242,247,.80);
}
.pricing-cta:hover { background: var(--surface2); color: var(--cream); border-color: var(--border2); }
.pricing-cta:disabled {
  cursor: not-allowed;
  opacity: .72;
  transform: none;
  box-shadow: none;
}
.pricing-cta.pro-cta {
  background: linear-gradient(135deg, #f0b43f 0%, #ffd978 55%, #fff0b0 100%);
  color: var(--ink); border: none;
  box-shadow: 0 14px 30px rgba(241,185,63,.26), inset 0 1px 0 rgba(255,255,255,.48);
}
.pricing-cta.pro-cta:hover { transform: translateY(-2px); box-shadow: 0 18px 36px rgba(241,185,63,.34), inset 0 1px 0 rgba(255,255,255,.58); }
.pricing-cta.pro-cta:disabled {
  background: linear-gradient(135deg, rgba(240,180,63,.72) 0%, rgba(255,217,120,.72) 55%, rgba(255,240,176,.72) 100%);
  color: rgba(8,17,14,.76);
}
/* Billing note below price */
.pricing-billing-note { font-size: .72rem; color: rgba(239,242,247,.45); margin-bottom: 14px; line-height: 1.4; }
/* Trial note below CTA */
.pricing-trial-note { font-size: .66rem; color: rgba(239,242,247,.38); text-align: center; margin-top: 7px; }
/* Pro key activation */
.pro-key-section {
  border-top: 1px solid rgba(255,255,255,.07); margin-top: 20px; padding-top: 16px;
}
.pro-key-toggle {
  background: none; border: none; color: rgba(239,242,247,.50); font-family: 'Outfit', sans-serif;
  font-size: .78rem; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 6px;
  transition: color .2s;
}
.pro-key-toggle:hover { color: var(--gold2); }
.pro-key-body { margin-top: 12px; }
.pro-key-gate {
  padding: 13px 14px;
  border-radius: 14px;
  border: 1px solid rgba(158,234,196,.12);
  background: rgba(255,255,255,.03);
}
.pro-key-copy {
  font-size: .78rem;
  line-height: 1.55;
  color: rgba(239,242,247,.60);
  margin-bottom: 12px;
}
.pro-key-copy:last-child { margin-bottom: 0; }
.pro-key-row { display: flex; gap: 8px; }
.pro-key-input {
  flex: 1; padding: 10px 14px; border-radius: var(--radius-sm);
  border: 1px solid var(--border2); background: var(--surface);
  color: var(--cream); font-family: 'Outfit', sans-serif; font-size: .84rem;
  letter-spacing: .08em; font-weight: 500;
  outline: none; transition: border-color .2s;
}
.pro-key-input:focus { border-color: rgba(201,146,42,.5); }
.pro-key-input::placeholder { color: rgba(239,242,247,.25); letter-spacing: .04em; font-weight: 300; }
.pro-key-btn {
  padding: 10px 18px; border-radius: var(--radius-sm);
  background: var(--goldB); border: 1px solid rgba(201,146,42,.3);
  color: var(--gold2); font-family: 'Outfit', sans-serif; font-size: .84rem;
  font-weight: 600; cursor: pointer; transition: all .2s; white-space: nowrap;
}
.pro-key-btn:hover:not(:disabled) { background: rgba(201,145,42,.18); border-color: rgba(201,146,42,.55); }
.pro-key-btn:disabled { opacity: .5; cursor: not-allowed; }
.pro-key-btn.full {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pro-key-status { font-size: .76rem; margin-top: 8px; line-height: 1.45; }
.pro-key-status.success { color: #2ecc71; }
.pro-key-status.error   { color: #e74c3c; }
.pro-key-status a { color: var(--gold2); text-decoration: none; }
.pricing-footer { text-align: center; font-size: .72rem; color: rgba(239,242,247,.45); line-height: 1.6; margin-top: 18px; }
.pricing-footer a { color: var(--gold2); text-decoration: none; }
.pricing-footer a:hover { text-decoration: underline; }
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
  .pricing-cards { grid-template-columns: 1fr; }
  .pricing-modal { padding: 32px 20px 28px; }
}

/* ══════════════════════ RESPONSIVE ══════════════════════ */
@media (max-width: 780px) {
  .game-grid { grid-template-columns: 1fr; }
  .rcol { order: -1; }
  .hdr-c { order: 3; width: 100%; justify-content: center; padding-bottom: 6px; }
  .hdr-r { display: none; }
  .cards-grid { justify-content: center; }
  .pcard { width: 82px; height: 118px; }
  .pcard-bignum { font-size: 2.2rem; }
  .pcard-bigsuit { font-size: 1.1rem; }
  .game-body { padding: 16px 16px 60px; }
  .obs-secondary-row { flex-direction: column; }
  .join-box { padding: 36px 24px 32px; }
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
.navbar-left  { display: flex; align-items: center; gap: 12px; }
.navbar-right { display: flex; align-items: center; gap: 8px; }
.navbar-links {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
}
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
  font-size: .78rem; color: rgba(239,242,247,.45); line-height: 1.65;
  font-weight: 300; max-width: 280px;
}
.footer-col-links { display: flex; flex-direction: column; gap: 2px; }
.footer-col-title {
  font-size: .62rem; font-weight: 700; letter-spacing: 2px;
  text-transform: uppercase; color: rgba(239,242,247,.38);
  margin-bottom: 10px;
}
.footer-link {
  color: rgba(239,242,247,.55); font-size: .83rem; text-decoration: none;
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
  font-size: .72rem; color: rgba(239,242,247,.28); font-weight: 300;
  line-height: 1.5;
}
.footer-legal-note {
  font-size: .68rem; color: rgba(239,242,247,.22); line-height: 1.6;
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
  background: none; border: none; color: rgba(239,242,247,.45);
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
  color: rgba(239,242,247,.52);
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
  color: rgba(239,242,247,.56);
  font-size: .78rem;
  line-height: 1.5;
}
.login-upgrade-link {
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(241,185,63,.20);
  background: rgba(241,185,63,.08);
  color: var(--gold2);
  font-family: 'Outfit', sans-serif;
  font-size: .74rem;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all .18s ease;
}
.login-upgrade-link:hover {
  background: rgba(241,185,63,.13);
  border-color: rgba(241,185,63,.34);
  color: var(--gold3);
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
  margin: 20px 0; color: rgba(239,242,247,.28); font-size: .72rem;
  letter-spacing: 1px; text-transform: uppercase;
}
.login-modal-divider::before, .login-modal-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--border);
}
.login-modal-coming {
  background: rgba(255,255,255,.04); border: 1px solid var(--border);
  border-radius: 12px; padding: 16px; text-align: center;
  font-size: .82rem; color: rgba(239,242,247,.45); line-height: 1.55;
}
.login-modal-coming strong { color: rgba(239,242,247,.70); font-weight: 600; }
.login-modal-upgrade {
  margin-top: 20px; text-align: center;
  font-size: .82rem; color: rgba(239,242,247,.45);
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
.login-pro-panel {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,.07);
}
.login-section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0;
  border: none;
  background: none;
  color: rgba(255,217,120,.88);
  font-family: 'Outfit', sans-serif;
  font-size: .82rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.login-section-toggle:hover { color: var(--gold3); }
.login-pro-copy {
  margin: 10px 0 14px;
  font-size: .78rem;
  line-height: 1.55;
  color: rgba(239,242,247,.58);
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
.pro-key-status { font-size: .8rem; margin-top: 8px; text-align: center; padding: 6px 0; border-radius: 6px; }
.pro-key-status.success { color: #2ecc71; background: rgba(46,204,113,.08); border: 1px solid rgba(46,204,113,.18); }
.pro-key-status.error   { color: #e74c3c; background: rgba(231,76,60,.06);  border: 1px solid rgba(231,76,60,.15);  }
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
.pricing-account-note {
  margin: 0 0 12px; font-size: .8rem; color: rgba(239,242,247,.56);
}
.pricing-state-box {
  margin: 0 0 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(158,234,196,.12);
  font-size: .78rem;
  line-height: 1.5;
}
.pricing-state-neutral { color: rgba(239,242,247,.72); }
.pricing-state-ok { color: var(--gold2); font-weight: 600; }
.pricing-state-warn { color: rgba(255,217,120,.82); }

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
  font-size: .58rem; font-weight: 500; color: rgba(239,242,247,.42);
  letter-spacing: .15px; line-height: 1; pointer-events: none;
  white-space: nowrap;
}

/* ─── Game upgrade strip — free users only ─── */
.game-upgrade-strip {
  background: linear-gradient(90deg, rgba(241,185,63,.09), rgba(241,185,63,.04));
  border-top: 1px solid rgba(241,185,63,.16);
  padding: 10px 20px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  flex-shrink: 0;
}
.game-upgrade-strip-text {
  font-size: .78rem; color: rgba(239,242,247,.58); line-height: 1.4;
}
.game-upgrade-strip-cta {
  padding: 7px 18px; border-radius: 10px; border: none;
  background: linear-gradient(135deg, #f0b43f 0%, #ffd978 55%, #fff0b0 100%);
  color: #1a1208; font-family: 'Outfit', sans-serif;
  font-size: .78rem; font-weight: 700; cursor: pointer;
  white-space: nowrap; transition: all .2s;
  box-shadow: 0 4px 14px rgba(241,185,63,.20);
  flex-shrink: 0;
}
.game-upgrade-strip-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(241,185,63,.30); }

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
  background: rgba(255,255,255,.07); color: rgba(239,242,247,.50);
  border: 1px solid rgba(255,255,255,.10);
}
.footer-plan-badge.pro {
  background: rgba(201,145,42,.14); color: var(--gold2);
  border: 1px solid rgba(201,145,42,.28);
}
.footer-plan-text { font-size: .76rem; color: rgba(239,242,247,.42); }
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
  font-size: .78rem; color: rgba(239,242,247,.42); margin: 0 0 40px;
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
.history-close {
  position: absolute; top: 18px; right: 18px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.10);
  color: rgba(239,242,247,.55); width: 32px; height: 32px;
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
  font-size: .82rem; color: rgba(239,242,247,.48); margin-bottom: 22px;
}
.history-insights {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 10px; margin-bottom: 24px;
}
.hi-stat {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
  border-radius: 14px; padding: 14px 10px; text-align: center;
}
.hi-v {
  font-size: 1.8rem; font-weight: 700; color: var(--gold2);
  letter-spacing: -0.04em; line-height: 1;
}
.hi-trend-up   { color: #4bd889; }
.hi-trend-down { color: #e74c3c; }
.hi-trend-flat { color: rgba(239,242,247,.55); }
.hi-l {
  font-size: .62rem; letter-spacing: 1.5px; text-transform: uppercase;
  color: rgba(239,242,247,.42); margin-top: 6px;
}
.history-list { display: flex; flex-direction: column; gap: 10px; }
.history-item {
  background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
  border-radius: 14px; padding: 16px 18px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  transition: border-color .18s;
}
.history-item:hover { border-color: rgba(158,234,196,.18); }
.hi-item-left { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.hi-item-sprint {
  font-size: .72rem; font-weight: 700; letter-spacing: 1.2px;
  text-transform: uppercase; color: rgba(239,242,247,.38);
}
.hi-item-label {
  font-size: .96rem; font-weight: 600; color: var(--cream);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.hi-item-date { font-size: .72rem; color: rgba(239,242,247,.38); }
.hi-item-stats { display: flex; gap: 20px; flex-shrink: 0; }
.hi-item-stat { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.hi-item-v {
  font-size: 1.2rem; font-weight: 700; color: var(--cream);
  letter-spacing: -0.03em; line-height: 1;
}
.hi-item-v.gold { color: var(--gold2); }
.hi-item-l {
  font-size: .58rem; letter-spacing: 1.2px; text-transform: uppercase;
  color: rgba(239,242,247,.38);
}
.history-empty {
  text-align: center; padding: 40px 20px; color: rgba(239,242,247,.45);
}
.history-empty p { font-size: .88rem; line-height: 1.6; }
.history-empty p:first-child { font-size: 1.1rem; color: rgba(239,242,247,.65); margin-bottom: 8px; }

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
  .login-upgrade-link { width: 100%; justify-content: center; }
  .navbar.authenticated .nav-account {
    display: flex;
    margin-right: 0;
    align-items: flex-end;
    gap: 3px;
  }
  .navbar.authenticated .nav-account-name { max-width: 104px; font-size: .74rem; }
  .navbar.authenticated .nav-account-plan { font-size: .62rem; padding: 3px 8px; letter-spacing: .1em; }
  .navbar:not(.authenticated) .nav-account { display: none; }
  .game-upgrade-strip { flex-direction: column; align-items: flex-start; gap: 8px; }
  .footer-plan-item:last-of-type .footer-plan-text { display: none; }
}
`;

/* ═══════════════════════ ROOM CONFIG ═══════════════════════ */
// Dynamic rooms: each Create generates a unique 5-char code.
// URL is updated via replaceState so links can be shared directly.
const FREE_MAX_PLAYERS = 6;   // Free tier participant limit
const PRO_MAX_PLAYERS  = 20;  // Pro tier: full team + stakeholders
const SESSION_MAX_MS  = 5 * 60 * 60 * 1000;          // 5 hours — auto-end + save history
const SESSION_WARN_MS = SESSION_MAX_MS - 10 * 60 * 1000; // warn 10 min before auto-end
const ROOM_SWEEP_INTERVAL_MS = 15 * 60 * 1000;       // Best-effort stale-room cleanup cadence per browser
const ROOM_SWEEP_STORAGE_KEY = "pp_last_room_sweep";

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
    const deletions = {};

    Object.entries(rooms).forEach(([roomId, room]) => {
      const createdAt = Number(room?.createdAt || 0);
      if (!createdAt || now - createdAt < SESSION_MAX_MS) return;

      const timerRunning = !!room?.timer?.running;
      const players = Object.values(room?.players || {});
      const lingeringPlayers = players.length;
      const hasVotesInFlight = players.some((p) => p?.voted || p?.vote != null);
      const hasLiveStoryProgress = (room?.storiesDone || 0) === 0 && (room?.round || 1) <= 1;
      const inactive = !timerRunning && !hasVotesInFlight && lingeringPlayers <= 1 && hasLiveStoryProgress;

      if (!inactive) return;
      deletions[`rooms/${roomId}`] = null;
    });

    const count = Object.keys(deletions).length;
    if (count > 0) {
      await update(ref(db), deletions);
    }
    return count;
  } catch {
    return 0;
  }
}

// ── FOUNDER DETECTION ────────────────────────────────────────
// Stored encoded so the team code isn't readable as plain text
// in the compiled bundle. Not a guarantee, but raises the bar.
// Encoded value is: btoa("<teamCode>") — never commit the raw name.
const _FC = ["cnBhLWJ1aWxkLXRlYW0="]; // rpa-build-team
const isFounderRoom = (code) => {
  try { return _FC.some(h => atob(h) === code.toLowerCase()); }
  catch { return false; }
};

/* ═══════════════════════ CASINO CHIP LOGO ═══════════════════════
   SVG casino chip — 8-segment outer ring, gold inner border, "PP" text.
   Used in NavBar (44px) and LoginModal (52px).
   onClick: optional handler — e.g. navigate home.
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

/* ═══════════════════════ GLOBAL NAVBAR ═══════════════════════
   Persistent top bar shown on all screens.
   - Left:  Brand mark + "pointpoker" brand name
   - Right: Account state + pricing CTA
═══════════════════════════════════════════════════════════════ */
function NavBar({
  onLogoClick,
  onLogin,
  onRegister,
  onPlans,
  onFaq,
  currentUser,
  currentPlan,
  onLogout,
  onHistory,
  showMarketingNav = true,
}) {
  const accountLabel = currentUser?.displayName || currentUser?.email || null;
  const isPro = currentPlan === "pro";

  return (
    <nav
      className={`navbar${currentUser ? " authenticated" : ""}${isPro ? " pro-user" : ""}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="navbar-inner">
        <div className="navbar-left">
          <BrandMark
            onClick={onLogoClick}
            size={44}
            label="pointpoker — go to home"
          />
          <button className="navbar-brand" onClick={onLogoClick}>
            <BrandWordmark />
          </button>
          {showMarketingNav && (
            <div className="navbar-links" aria-label="Marketing sections">
              <NavLinkButton onClick={onPlans} ariaLabel="Go to plans">
                Plans
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
              {isPro && (
                <button
                  className="nav-btn-history"
                  onClick={onHistory}
                  aria-label="View sprint history"
                >
                  📊 History
                </button>
              )}
              <div className="nav-account" aria-label="Signed-in account">
                <span className="nav-account-name">{accountLabel}</span>
                <span className={`nav-account-plan${isPro ? " pro" : ""}`}>
                  {isPro ? "✓ Pro" : "Free"}
                </span>
              </div>
              <button className="nav-btn-login" onClick={onLogout}>Sign out</button>
              {!isPro && (
                <div className="nav-btn-wrapper">
                  <button className="nav-btn-register" onClick={onRegister}>✦ Upgrade to Pro</button>
                  <span className="nav-upgrade-sub">Team Room · 20 players · Sprint history</span>
                </div>
              )}
            </>
          ) : (
            <>
              <button className="nav-btn-login" onClick={onLogin}>Log in</button>
              <div className="nav-btn-wrapper">
                <button className="nav-btn-register" onClick={onRegister}>✦ Get Pro</button>
                <span className="nav-upgrade-sub">Team Room · 20 players · Sprint history</span>
              </div>
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
function SiteFooter({ onCookieSettings, onShowPricing, currentPlan, currentUser, onNavTerms, onNavPrivacy }) {
  const year = new Date().getFullYear();
  const support = process.env.REACT_APP_SUPPORT_EMAIL || "support@pointpoker.app";
  const isPro = currentPlan === "pro";
  const signedIn = !!currentUser;

  return (
    <footer className="site-footer" aria-label="Site footer">

      {/* ── Free vs Pro comparison bar ── */}
      {!signedIn && <div className="footer-plan-bar">
        <div className="footer-plan-item">
          <span className="footer-plan-badge free">Free</span>
          <span className="footer-plan-text">Up to 6 voters · All card decks · No account needed</span>
        </div>
        <div className="footer-plan-divider" aria-hidden="true" />
        <div className="footer-plan-item">
          <span className="footer-plan-badge pro">Pro</span>
          <span className="footer-plan-text">Permanent Team Room · Up to 20 voters · Sprint history · From £5/mo</span>
        </div>
        {!isPro && (
          <button className="footer-plan-cta" onClick={onShowPricing}>
            ✦ Upgrade to Pro
          </button>
        )}
        {isPro && (
          <span style={{ marginLeft: "auto", fontSize: ".76rem", color: "var(--gold2)", fontWeight: 600 }}>
            ✓ You're on Pro
          </span>
        )}
      </div>}

      <div className="footer-inner">

        {/* Column 1 — Brand */}
        <div className="footer-col-brand">
          <div className="footer-brand-row">
            <BrandMark size={36} label="pointpoker"/>
            <span className="footer-brand-name"><BrandWordmark /></span>
          </div>
          <p className="footer-brand-desc">
            {signedIn
              ? isPro
                ? "Your Pro workspace is live. Reuse your fixed Team Room, share invite links quickly, and keep sprint history attached to your account."
                : "Your Free workspace is ready. Create and join sessions now, then upgrade only when you want a permanent Team Room."
              : "Free, real-time planning poker for agile and Scrum teams. No sign-up required. Works in any browser."}
          </p>
          {!signedIn && (
            <p className="footer-brand-desc" style={{ marginTop: 4 }}>
              Built for Product Owners, Scrum Masters, and distributed teams
              who need fast, structured story-point consensus.
            </p>
          )}
        </div>

        {/* Column 2 — Legal */}
        <div className="footer-col-links">
          <div className="footer-col-title">Legal</div>
          <button className="footer-link" onClick={onNavTerms}>Terms of Service</button>
          <button className="footer-link" onClick={onNavPrivacy}>Privacy Policy</button>
          <button className="footer-link" onClick={onCookieSettings}>Cookie Settings</button>
          <button className="footer-link" onClick={onNavPrivacy}>Data &amp; GDPR</button>
        </div>

        {/* Column 3 — Product */}
        <div className="footer-col-links">
          <div className="footer-col-title">{signedIn ? "Account" : "Product"}</div>
          {signedIn ? (
            <>
              <span className="footer-link" style={{ color: "rgba(239,242,247,.62)", cursor: "default" }}>
                {isPro ? "Pro workspace active" : "Free workspace active"}
              </span>
              {!isPro && (
                <button className="footer-link" onClick={onShowPricing}>Upgrade to Pro</button>
              )}
              <a href={`mailto:${support}`} className="footer-link">Billing &amp; Support</a>
            </>
          ) : (
            <>
              <a href="/" className="footer-link">Free Planning Poker</a>
              {isPro ? (
                <span className="footer-link" style={{ color: "var(--gold2)", cursor: "default" }}>
                  Pro Plan ✓ Active
                </span>
              ) : (
                <button className="footer-link" onClick={onShowPricing}>Pro Plan — what's included</button>
              )}
              <a href={`mailto:${support}`} className="footer-link">Contact &amp; Support</a>
            </>
          )}
        </div>
      </div>

      {/* Bottom bar — copyright + legal note */}
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
            style={{ color: "rgba(239,242,247,.38)", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
          >
            Terms of Service
          </button>
          . Firebase, Vercel, and Stripe are third-party services and
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
   4. Manual Pro key activation
═══════════════════════════════════════════════════════════════ */
function LoginModal({
  onClose,
  onAuthSuccess,
  onProActivated,
  currentUser,
  currentPlan = "free",
  initialMode = "signin",
  entryIntent = "general",
  onShowPricing,
}) {
  const [mode, setMode] = useState(currentUser ? "account" : initialMode);
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState(currentUser?.email || "");
  const [passInput, setPassInput] = useState("");
  const [authStatus, setAuthStatus] = useState(null);
  const [authError, setAuthError] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [keyStatus, setKeyStatus] = useState(null);
  const isPro = currentPlan === "pro";
  const upgradeIntent = entryIntent === "upgrade";
  const [showActivation, setShowActivation] = useState(
    () => upgradeIntent || (!!currentUser && !isPro)
  );

  const title = currentUser
    ? isPro
      ? "Your Pro account"
      : "Your free account"
    : mode === "register"
      ? "Create your account"
      : mode === "reset"
        ? "Reset your password"
        : upgradeIntent
          ? "Create your account first"
          : "Sign in to your account";

  const subtitle = currentUser
    ? isPro
      ? "This account already has Pro access, sprint history, and your permanent team room."
      : "This account is on the free plan. Upgrade when you want a permanent team room, 20 voters, and sprint history."
    : mode === "register"
      ? "Accounts keep billing, Pro access, and sprint history tied to one place across devices."
      : mode === "reset"
        ? "Enter your account email and we’ll send a password reset link."
        : upgradeIntent
          ? "Billing and Pro access are attached to your account, so create one before upgrading."
          : "Free rooms work without an account. Sign in only if you already have one or want account-linked Pro access.";
  const modeHint = currentUser
    ? isPro
      ? "You can use Team Room and Sprint History immediately on this account."
      : "Short-term Pro access is activated with a code while checkout is being finalised."
    : upgradeIntent
      ? "Short-term Pro setup: create your account, then activate Pro with your code."
      : mode === "register"
        ? "New here? Create one account and keep your future Pro access tied to it."
        : mode === "signin"
          ? "Already registered? Sign in to restore your plan and sprint history."
          : "We’ll email you a reset link for this account.";

  const resetMessages = () => {
    setAuthStatus(null);
    setAuthError("");
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
      setTimeout(() => onAuthSuccess?.("signin"), 500);
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
    try {
      const credential = await createUserWithEmailAndPassword(auth, emailInput.trim(), passInput);
      await updateProfile(credential.user, { displayName: nameInput.trim().slice(0, 40) });
      await saveUserProfile(credential.user, {
        displayName: nameInput.trim().slice(0, 40),
        email: credential.user.email || emailInput.trim(),
        plan: "free",
      });
      setAuthStatus("ok");
      setTimeout(() => onAuthSuccess?.("register"), 500);
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

  const handleKey = async () => {
    if (!currentUser) {
      setKeyStatus("login");
      return;
    }
    if (!keyInput.trim()) return;
    setKeyStatus("loading");
    const result = await validateAndSavePro(keyInput.trim(), currentUser);
    if (result === "ok") {
      track("pro_activated");
      setKeyStatus("ok");
      setTimeout(() => onProActivated?.(), 700);
    } else if (result === "invalid") {
      setKeyStatus("invalid");
    } else {
      setKeyStatus("error");
    }
  };

  return (
    <div className="login-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="login-modal" role="dialog" aria-modal="true" aria-label={title}>
        <button className="login-modal-close" onClick={onClose} aria-label="Close">×</button>

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
                <span className="account-status-label">Current plan</span>
                <span className={`account-status-pill${isPro ? " pro" : ""}`}>
                  {isPro ? "Pro active" : "Free plan"}
                </span>
              </div>
            </>
          ) : (
            <p className="account-status-copy">
              Use free rooms instantly, or create an account when you want billing, Pro access, and sprint history to follow you.
            </p>
          )}
        </div>
        <p className="login-mode-hint">{modeHint}</p>

        {!currentUser && (
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
            {authStatus === "ok" && (
              <div className="auth-status success">
                {mode === "register" ? "✓ Account created." : "✓ Signed in."}
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
            {mode === "register" && (
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={handleRegister} disabled={authStatus === "loading"}>
                {authStatus === "loading" ? "Creating account…" : upgradeIntent ? "Create account to activate Pro" : "Create account"}
              </button>
            )}
            {mode === "reset" && (
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={handleReset} disabled={authStatus === "loading"}>
                {authStatus === "loading" ? "Sending reset…" : "Send reset link"}
              </button>
            )}
          </>
        )}

        {currentUser && (
          <div className="login-modal-coming">
            <strong>{currentUser.displayName || "Signed in"}</strong><br />
            {currentUser.email}
          </div>
        )}

        {currentUser && authStatus === "reset" && (
          <div className="auth-status success">✓ Password reset email sent.</div>
        )}
        {currentUser && authError && (
          <div className="auth-status error">{authError}</div>
        )}

        {currentUser && (
          <button
            type="button"
            className="login-secondary-btn"
            onClick={handleSignedInReset}
            disabled={authStatus === "loading"}
          >
            {authStatus === "loading" ? "Sending reset…" : "Send password reset email"}
          </button>
        )}

        {!isPro && (
          <div className="login-upgrade-card">
            <div className="login-upgrade-head">
              <div>
                <div className="login-upgrade-title">Need Pro for your team?</div>
                <p className="login-upgrade-sub">
                  Permanent Team Room, Sprint History, and up to 20 voters.
                </p>
              </div>
              {onShowPricing && (
                <button
                  type="button"
                  className="login-upgrade-link"
                  onClick={onShowPricing}
                >
                  View plans
                </button>
              )}
            </div>

            {currentUser ? (
              <div className="login-pro-panel">
                <button
                  type="button"
                  className="login-section-toggle"
                  onClick={() => setShowActivation((v) => !v)}
                  aria-expanded={showActivation}
                >
                  {showActivation ? "▾" : "▸"} I already have an activation code
                </button>
                {showActivation && (
                  <>
                    <p className="login-pro-copy">
                      Best for early customers and internal team access before Stripe checkout is live. Activate once and this account switches to Pro immediately.
                    </p>
                    <label className="lbl">Pro Activation Key</label>
                    <input
                      className="inp"
                      placeholder="PPRO-XXXX-XXXX-XXXX"
                      value={keyInput}
                      onChange={(e) => { setKeyInput(e.target.value.toUpperCase()); setKeyStatus(null); }}
                      onKeyDown={(e) => e.key === "Enter" && handleKey()}
                      style={{ letterSpacing: "0.1em", fontFamily: "monospace", marginBottom: 8 }}
                      maxLength={19}
                    />
                    {keyStatus === "loading" && (
                      <div className="pro-key-status" style={{ color: "rgba(239,242,247,.55)" }}>Verifying…</div>
                    )}
                    {keyStatus === "ok" && (
                      <div className="pro-key-status success">✓ Pro activated for this account.</div>
                    )}
                    {keyStatus === "invalid" && (
                      <div className="pro-key-status error">Key not recognised. Check the format: PPRO-XXXX-XXXX-XXXX</div>
                    )}
                    {keyStatus === "error" && (
                      <div className="pro-key-status error">Could not verify your code right now. Check your connection and confirm activation access is configured.</div>
                    )}
                    <button
                      className="btn-primary"
                      style={{ marginTop: 12 }}
                      onClick={handleKey}
                      disabled={keyStatus === "loading" || keyStatus === "ok"}
                    >
                      {keyStatus === "loading" ? "Verifying…" : "Activate Pro"}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="login-upgrade-note">
                <strong>Pro access attaches to an account.</strong> Create or sign in first, then come back here to activate your code so Team Room, billing, and sprint history stay with you across devices.
              </div>
            )}
          </div>
        )}

        <div className="login-modal-upgrade">
          Need help with access or billing?{" "}
          <button
            type="button"
            onClick={onShowPricing}
            style={{ color: "var(--gold2)", textDecoration: "none", fontWeight: 600, border: "none", background: "none", padding: 0, cursor: "pointer" }}
          >
            Review plans ↗
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ MAIN APP ═══════════════════════ */
function CookieBanner({ onAccept }) {
  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie notice" aria-live="polite">
      <div className="cookie-inner">
        <p className="cookie-text">
          <strong>We use essential browser storage only.</strong>{" "}
          This includes Firebase session data and a preference flag to remember your consent.
          No advertising, tracking, or third-party analytics cookies are used. See our{" "}
          <a href="/privacy" className="cookie-link" target="_blank" rel="noopener noreferrer">Privacy Policy</a>{" "}
          and{" "}
          <a href="/terms" className="cookie-link" target="_blank" rel="noopener noreferrer">Terms of Service</a>.
        </p>
        <div className="cookie-actions">
          <a href="/privacy" className="cookie-link" target="_blank" rel="noopener noreferrer">Privacy</a>
          <a href="/terms" className="cookie-link" target="_blank" rel="noopener noreferrer">Terms</a>
          <button className="cookie-accept" onClick={onAccept}>Accept &amp; Continue</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState(() => {
    const path = window.location.pathname;
    if (path === "/terms")   return "terms";
    if (path === "/privacy") return "privacy";
    return "join";
  });
  const [myId] = useState(uid);
  const [myRole, setMyRole] = useState("voter");
  const [authUser, setAuthUser] = useState(() => auth.currentUser);
  const [accountProfile, setAccountProfile] = useState(null);
  const currentPlan = authUser ? (accountProfile?.plan || "free") : "free";
  const [cookieAccepted, setCookieAccepted] = useState(
    () => {
      try { return localStorage.getItem("pp_cookie_ok") === "1"; }
      catch { return false; }
    }
  );
  const acceptCookies = () => {
    try { localStorage.setItem("pp_cookie_ok", "1"); } catch {}
    setCookieAccepted(true);
  };
  const resetCookieBanner = () => {
    try { localStorage.removeItem("pp_cookie_ok"); } catch {}
    setCookieAccepted(false);
  };
  const [loginModalConfig, setLoginModalConfig] = useState({
    initialMode: "signin",
    entryIntent: "general",
  });

  // ── SPA NAVIGATION ────────────────────────────────────────────────
  // Navigate within the SPA without a full-page reload.
  // Used by footer links and the back button on legal pages.
  const navTo = (path) => {
    window.history.pushState({}, "", path);
    if (path === "/terms")   { setScreen("terms");   return; }
    if (path === "/privacy") { setScreen("privacy"); return; }
    setScreen("join");
  };
  const openLoginModal = useCallback((initialMode = "signin", entryIntent = "general") => {
    setLoginModalConfig({ initialMode, entryIntent });
    setShowLoginModal(true);
  }, []);
  const openPricingModal = useCallback(() => {
    setShowPricingModal(true);
    track("pricing_opened");
  }, []);
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
    if (screen === "terms" || screen === "privacy") {
      navTo("/");
      window.history.replaceState({}, "", `/#${sectionId}`);
      setTimeout(focusSection, 40);
    }
  }, [screen]);
  // Global modal states — NavBar triggers these from any screen
  const [showLoginModal,   setShowLoginModal]   = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [sprintHistory,    setSprintHistory]    = useState([]);
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
  const showToast = useCallback((msg) => {
    setToast(msg);
    setToastOn(true);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastOn(false), 3400);
  }, []);

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
        setAccountProfile(null);
        return;
      }
      try {
        const storedProAccess = readStoredProAccess();
        const snap = await get(ref(db, `users/${user.uid}`));
        if (!snap.exists()) {
          await saveUserProfile(user, {
            displayName: user.displayName || "",
            email: user.email || "",
            plan: storedProAccess ? "pro" : "free",
            billingStatus: storedProAccess ? "active" : "inactive",
            createdAt: Date.now(),
          });
        } else {
          const current = snap.val() || {};
          await update(ref(db, `users/${user.uid}`), {
            email: user.email || "",
            displayName: user.displayName || "",
            teamRoomName: current.teamRoomName || deriveTeamRoomName(user.displayName || "", user.email || ""),
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

  // ── SPRINT HISTORY LISTENER — Pro users only ──────────────────
  useEffect(() => {
    if (!authUser?.uid || currentPlan !== "pro") {
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
  }, [authUser?.uid, currentPlan]);

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
  }, [code, screen]); // eslint-disable-line

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
        showToast("⏰ Time's up — cards revealed!");
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
          showToast("🃏 All voted — revealing cards!");
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
  const currentPlanRef  = useRef("free");
  useEffect(() => { if (roomData?.createdAt) createdAtRef.current = roomData.createdAt; }, [roomData?.createdAt]); // eslint-disable-line
  useEffect(() => { authUserRef.current    = authUser;    }, [authUser]);
  useEffect(() => { currentPlanRef.current = currentPlan; }, [currentPlan]);

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
        // Save history for authenticated Pro users before tearing down the room
        if (authUserRef.current && currentPlanRef.current === "pro" && roomDataRef.current) {
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

  // ── BROWSER CLOSE / REFRESH CLEANUP ──────────────────────────────
  // Uses roomDataRef for the same stale-closure reason as goBack.
  // Also stops orphaned timers and cleans up empty rooms.
  useEffect(() => {
    const cleanup = () => {
      const rd = roomDataRef.current;
      if (!code || !myId) return;

      if (rd?.timer?.running && rd?.timer?.startedBy === myId) {
        update(ref(db, `rooms/${code}/timer`), { running: false });
      }

      const allPlayerIds = Object.keys(rd?.players || {});
      const remainingAfterLeave = allPlayerIds.filter((id) => id !== myId);

      if (remainingAfterLeave.length === 0) {
        remove(ref(db, `rooms/${code}`));
      } else {
        remove(ref(db, `rooms/${code}/players/${myId}`));
      }
    };
    window.addEventListener("beforeunload", cleanup);
    return () => window.removeEventListener("beforeunload", cleanup);
  }, [code, myId]);

  const handleCreate = async (name, role, deck = "fibonacci") => {
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
      plan: currentPlan === "pro" ? "pro" : "free",
      timer: { running: false, duration: 30, remaining: 30 },
      players: { [myId]: { id: myId, name, role, voted: false, vote: null } },
    });

    // Server-side cleanup if browser crashes (power loss, mobile tab kill).
    onDisconnect(ref(db, `rooms/${c}/players/${myId}`)).remove();

    // Update URL so the creator can copy/share the link immediately.
    window.history.replaceState({}, "", roomPath(c));
    setScreen("game");
    track(currentPlan === "pro" ? "room_created_pro" : "room_created_free");
    if (role === "observer") track("observer_joined"); else track("player_joined");
    showToast(`🎲 Room ${c} created! Share the link to invite your team.`);
  };

  const handleJoin = async (name, role, c) => {
    const snap = await new Promise((res) =>
      onValue(ref(db, `rooms/${c}`), res, { onlyOnce: true }),
    );
    if (!snap.exists()) {
      showToast(`Room "${c}" not found. Check the code and try again.`);
      return;
    }
    const data = snap.val();
    const currentCount = countVoters(data.players || {});
    const maxForPlan = data.plan === "pro" ? PRO_MAX_PLAYERS : FREE_MAX_PLAYERS;
    if (role === "voter" && currentCount >= maxForPlan) {
      if (data.plan !== "pro") {
        showToast(`Room full for voters (free tier: ${FREE_MAX_PLAYERS} max). The host can upgrade to Pro for up to ${PRO_MAX_PLAYERS} voters.`);
      } else {
        showToast(`This room is full for voters (max ${PRO_MAX_PLAYERS}).`);
      }
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
    });
    onDisconnect(ref(db, `rooms/${c}/players/${myId}`)).remove();
    window.history.replaceState({}, "", roomPath(c));
    setScreen("game");
    track(role === "observer" ? "observer_joined" : "player_joined");
    showToast(`🎲 Welcome, ${name}!`);
  };

  // ── TEAM ROOM ─────────────────────────────────────────────────────
  // Team rooms use a stable code derived from the team name so the same
  // team always lands in the same room without needing to share a link.
  // The room is created fresh if nobody is there, or joined if active.
  const handleTeamRoom = async (name, role, teamName, deck = "fibonacci") => {
    const c = teamCode(teamName);
    const founderRoom = isFounderRoom(c);
    // Team Room is a Pro feature. Founder team is always Pro.
    // All other team rooms are set to Pro for now — Stripe will gate
    // creation at Phase 3 once payment is wired up.
    const plan = "pro";
    const snap = await new Promise((res) =>
      onValue(ref(db, `rooms/${c}`), res, { onlyOnce: true }),
    );
    const existingRoom = snap.exists() ? snap.val() || {} : null;
    const canEnterExistingTeamRoom = !!existingRoom;
    const canCreateDedicatedTeamRoom = currentPlan === "pro" || founderRoom;
    if (!canEnterExistingTeamRoom && !canCreateDedicatedTeamRoom) {
      setShowPricingModal(true);
      track("pricing_opened");
      showToast("Team Rooms are a Pro feature for hosts. Upgrade to unlock your own permanent team URL.");
      return;
    }
    const existingPlan = existingRoom ? (existingRoom.plan || "pro") : plan;
    const currentCount = existingRoom
      ? countVoters(existingRoom.players || {})
      : 0;
    const maxForPlan = existingPlan === "pro" ? PRO_MAX_PLAYERS : FREE_MAX_PLAYERS;
    if (role === "voter" && currentCount >= maxForPlan) {
      showToast(`This room is full for voters (max ${maxForPlan}).`);
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
        plan,
        teamName,
        founderRoom,
        timer: { running: false, duration: 30, remaining: 30 },
        players: { [myId]: { id: myId, name, role, voted: false, vote: null } },
      });
    } else {
      await update(ref(db, `rooms/${c}/players/${myId}`), {
        id: myId, name, role, voted: false, vote: null,
      });
    }
    onDisconnect(ref(db, `rooms/${c}/players/${myId}`)).remove();
    // Keep the clean stable team-room URL so invites and browser refreshes stay consistent.
    window.history.replaceState({}, "", teamRoomPath(c));
    setScreen("game");
    track(role === "observer" ? "observer_joined" : "player_joined");
    if (!snap.exists()) track("room_created_pro"); // Team rooms are always Pro
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

    await update(ref(db), upd);
    if (estimate !== null) {
      track("stories_estimated");
      showToast("✅ Story done! Vote on the next user story.");
    }
  }, [code, roomData, showToast]);

  // ── STORY QUEUE ───────────────────────────────────────────────────
  // Stories can be added at any time before or during a session.
  // Stored in Firebase so all players see the active story name live.
  const addStory = useCallback(async (name) => {
    // Firebase returns stories as {0:{...}, 1:{...}} — an object, not an array.
    // .length on an object is undefined, so use Object.keys to get the count.
    const sanitised = name.trim().slice(0, 200); // enforce 200-char max server-side
    if (!sanitised) return;
    const current = roomData?.stories || {};
    const idx = Object.keys(current).length;
    // Track the first story added — signals the story queue feature is being used
    if (idx === 0) track("story_queue_used");
    await update(ref(db, `rooms/${code}/stories/${idx}`), {
      name: sanitised,
      estimate: null,
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
    await update(ref(db), upd);
    track("stories_estimated");
    showToast("✅ Estimate recorded. Voting on next story.");
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
    showToast("🔄 New sprint session — everyone's votes cleared.");
  }, [code, roomData, showToast]);

  const endSession = useCallback(async () => {
    // Explicitly clear the local timer interval before tearing down the room.
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    remainingRef.current = null;
    clearInterval(sessionCheckRef.current);
    // Save sprint history for authenticated Pro users
    if (authUserRef.current && currentPlanRef.current === "pro" && roomDataRef.current) {
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
      track("timer_used");
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

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
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

      {/* ── Global shell — NavBar → content → Footer ── */}
      <div className="page-shell">
        <NavBar
          onLogoClick={() => {
            if (screen === "game") { goBack(); return; }
            if (screen === "terms" || screen === "privacy") { navTo("/"); return; }
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onLogin={()    => { openLoginModal("signin", "general"); track("login_modal_opened"); }}
          onRegister={openPricingModal}
          onPlans={() => jumpToMarketingSection("plans")}
          onFaq={() => jumpToMarketingSection("faq")}
          currentUser={authUser}
          currentPlan={currentPlan}
          onLogout={handleLogout}
          onHistory={() => setShowHistoryModal(true)}
          showMarketingNav={screen !== "game" && !authUser}
        />

        <div className="app">
          {screen === "terms" && (
            <TermsPage onBack={() => navTo("/")} />
          )}
          {screen === "privacy" && (
            <PrivacyPage onBack={() => navTo("/")} />
          )}
          {screen === "join" && (
            <JoinScreen
              onCreate={handleCreate}
              onJoin={handleJoin}
              onTeamRoom={handleTeamRoom}
              prefillCode={code}
              prefillTeam={prefillTeam}
              onShowPricing={openPricingModal}
              currentUser={authUser}
              currentPlan={currentPlan}
              accountProfile={accountProfile}
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
              onAddStory={addStory}
              onRecordStory={recordAndNextStory}
              sessionWarning={sessionWarning}
              toast={showToast}
              currentPlan={currentPlan}
              onShowPricing={openPricingModal}
            />
          )}
          <div className={`toast${toastOn ? " show" : ""}`}>{toast}</div>
        </div>

        <SiteFooter
          onCookieSettings={resetCookieBanner}
          onShowPricing={openPricingModal}
          currentPlan={currentPlan}
          currentUser={authUser}
          onNavTerms={() => navTo("/terms")}
          onNavPrivacy={() => navTo("/privacy")}
        />
      </div>

      {/* ── Overlays ── */}
      {!cookieAccepted && <CookieBanner onAccept={acceptCookies} />}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onAuthSuccess={() => {
            const shouldResumePricing = loginModalConfig.entryIntent === "upgrade";
            setShowLoginModal(false);
            showToast("Account ready.");
            if (shouldResumePricing) setShowPricingModal(true);
          }}
          onProActivated={() => { setShowLoginModal(false); showToast("Pro activated."); }}
          currentUser={authUser}
          currentPlan={currentPlan}
          initialMode={loginModalConfig.initialMode}
          entryIntent={loginModalConfig.entryIntent}
          onShowPricing={() => {
            setShowLoginModal(false);
            openPricingModal();
          }}
        />
      )}
      {showPricingModal && (
        <PricingModal
          onClose={() => setShowPricingModal(false)}
          onProActivated={() => { setShowPricingModal(false); showToast("Pro activated."); }}
          currentUser={authUser}
          currentPlan={currentPlan}
          onRequireLogin={() => {
            setShowPricingModal(false);
            openLoginModal("register", "upgrade");
            track("login_modal_opened");
          }}
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
   Pure-canvas confetti — no external deps.
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

/* ═══════════════════════ PRICING MODAL ═══════════════════════ */
const PRICING = {
  USD: { symbol: "$",  pro: 8,  proAnnual: 6  },
  GBP: { symbol: "£",  pro: 6,  proAnnual: 5  },
  EUR: { symbol: "€",  pro: 7,  proAnnual: 6  },
};

// ── Stripe Payment Links ─────────────────────────────────────────────────────
// Replace placeholder values with real Stripe Payment Link URLs after setup.
// Format: https://buy.stripe.com/XXXXXXXX
const STRIPE_LINKS = {
  monthly: { GBP: "#upgrade", USD: "#upgrade", EUR: "#upgrade" },
  annual:  { GBP: "#upgrade", USD: "#upgrade", EUR: "#upgrade" },
};

// ── Pro status ───────────────────────────────────────────────────────────────
const PRO_KEY_REGEX = /^PPRO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function readStoredProAccess() {
  try {
    const raw = localStorage.getItem("pp_pro");
    if (!raw) return false;
    const { key } = JSON.parse(raw);
    return PRO_KEY_REGEX.test(key);
  } catch { return false; }
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

async function saveUserProfile(user, profile = {}) {
  if (!user?.uid) return;
  const nextProfile = {
    email: user.email || profile.email || "",
    displayName: profile.displayName || user.displayName || "",
    teamRoomName: profile.teamRoomName || deriveTeamRoomName(profile.displayName || user.displayName || "", user.email || profile.email || ""),
    plan: profile.plan || "free",
    billingStatus: profile.billingStatus || "inactive",
    createdAt: profile.createdAt || Date.now(),
    lastLoginAt: Date.now(),
  };
  await update(ref(db, `users/${user.uid}`), nextProfile);
}

async function markCheckoutIntent(user, billing, currency) {
  if (!user?.uid) return;
  await update(ref(db, `users/${user.uid}`), {
    billingCycle: billing,
    currency,
    billingStatus: "checkout_started",
    checkoutStartedAt: Date.now(),
    email: user.email || "",
    displayName: user.displayName || "",
    teamRoomName: deriveTeamRoomName(user.displayName || "", user.email || ""),
  });
}

async function validateAndSavePro(key, user = null) {
  const formatted = key.trim().toUpperCase();
  if (!PRO_KEY_REGEX.test(formatted)) return "invalid";
  try {
    // Check Firebase license store: /licenses/{key}
    const snap = await get(ref(db, `licenses/${formatted}`));
    if (!snap.exists() || snap.val().active !== true) return "invalid";
    localStorage.setItem("pp_pro", JSON.stringify({ key: formatted, activatedAt: Date.now() }));
    if (user?.uid) {
      await update(ref(db, `users/${user.uid}`), {
        email: user.email || "",
        displayName: user.displayName || "",
        teamRoomName: deriveTeamRoomName(user.displayName || "", user.email || ""),
        plan: "pro",
        billingStatus: "active",
        proKey: formatted,
        proActivatedAt: Date.now(),
        lastLoginAt: Date.now(),
      });
    }
    return "ok";
  } catch {
    // Firebase unreachable — fail closed (require real validation)
    return "error";
  }
}

/* ═══════════════════════ HISTORY MODAL ═══════════════════════
   Pro-only. Shows all saved sprint sessions with velocity insights.
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
        collaborative story-point estimation. The Service is provided on a free tier and a paid
        Pro tier. Features and limits differ between tiers and are described on the pricing page.
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
        <li>Misuse or fraudulently activate Pro subscription keys;</li>
        <li>Reverse engineer, decompile, or disassemble any component of the Service;</li>
        <li>Use the Service in any manner that could damage, disable, or impair our infrastructure.</li>
      </ul>
      <p>
        We reserve the right to suspend or terminate your access if we determine, in our sole
        discretion, that you have violated this acceptable use policy.
      </p>

      <h2>5. Pro Subscription</h2>
      <p>
        Access to Pro features requires a valid Pro subscription or activation key. Subscription
        fees are payable in advance and are non-refundable except as required by applicable consumer
        protection law. Where you purchase as a consumer in the United Kingdom, the Consumer Rights
        Act 2015 and Consumer Contracts Regulations 2013 may apply.
      </p>
      <p>
        Pro activation keys are personal to the account holder and may not be resold, transferred,
        or shared. We reserve the right to deactivate keys that we reasonably believe have been
        obtained or used fraudulently.
      </p>
      <p>
        We may change Pro pricing at any time. Any price changes will take effect at the start of
        your next billing cycle and will be communicated in advance.
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
        The Service integrates with third-party services including Google Firebase, Vercel, and Stripe.
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
        paying Pro subscribers.
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
          <strong>Account data</strong> — If you register, we collect your email address and
          display name. These are required to create and manage your account.
        </li>
        <li>
          <strong>Session data</strong> — Room codes, team names, story names, and vote values
          are stored temporarily in Firebase Realtime Database while a session is active.
          Free sessions are deleted when the session ends. Pro session summaries (total points,
          stories estimated, consensus rate) are retained in your account history.
        </li>
        <li>
          <strong>Usage analytics</strong> — We count anonymised events (e.g. "room created",
          "pricing page viewed") as daily integer totals in Firebase. No personal data, device
          identifiers, or IP addresses are stored in analytics. These counts cannot be linked
          back to any individual.
        </li>
        <li>
          <strong>Technical data</strong> — Firebase and Vercel may log standard server data
          (IP addresses, browser type, access timestamps) as part of their infrastructure
          operations. We do not control or access this data outside their platforms.
        </li>
        <li>
          <strong>Payment data</strong> — Pro subscription payments are processed by Stripe.
          We do not receive or store your full card details. Stripe's privacy policy governs
          payment data handling.
        </li>
      </ul>

      <h2>3. Legal Basis for Processing (UK GDPR)</h2>
      <p>
        We process your personal data on the following legal bases under the UK General Data
        Protection Regulation:
      </p>
      <ul>
        <li>
          <strong>Contract performance (Article 6(1)(b))</strong> — Processing your account
          data and session data is necessary to deliver the Service you have requested.
        </li>
        <li>
          <strong>Legitimate interests (Article 6(1)(f))</strong> — We process anonymised
          usage analytics to understand how the Service is used and to improve it. These
          interests are not overridden by your rights, as no personal data is included.
        </li>
        <li>
          <strong>Consent (Article 6(1)(a))</strong> — We rely on your consent for storing
          a preference cookie (cookie consent flag) in your browser. You may withdraw this
          consent at any time via the Cookie Settings link in the footer.
        </li>
      </ul>

      <h2>4. How We Use Your Data</h2>
      <p>We use your data solely for the following purposes:</p>
      <ul>
        <li>To create and authenticate your account;</li>
        <li>To operate and deliver the planning poker Service;</li>
        <li>To store Pro sprint history data associated with your account;</li>
        <li>To process payments via Stripe;</li>
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
          <strong>Firebase authentication persistence</strong> — Firebase stores your
          authentication session in IndexedDB or local storage to keep you signed in across
          browser sessions. This is strictly necessary for the authentication feature.
        </li>
        <li>
          <strong>Cookie consent preference</strong> — A single flag (<code>pp_cookie_ok</code>)
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
          <strong>Google Firebase</strong> — Provides real-time database (session data) and
          authentication. Data may be stored in Google's data centres, which may be located
          within the EEA and other regions. Google LLC is certified under the EU-US Data
          Privacy Framework. See{" "}
          <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer">
            Firebase Privacy Policy
          </a>.
        </li>
        <li>
          <strong>Vercel Inc.</strong> — Hosts and serves the Service. Standard server access
          logs may be retained by Vercel in accordance with their privacy policy. See{" "}
          <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
            Vercel Privacy Policy
          </a>.
        </li>
        <li>
          <strong>Stripe Inc.</strong> — Processes Pro subscription payments. Stripe is a
          certified PCI DSS Level 1 service provider. See{" "}
          <a href="https://stripe.com/gb/privacy" target="_blank" rel="noopener noreferrer">
            Stripe Privacy Policy
          </a>.
        </li>
      </ul>

      <h2>7. Data Retention</h2>
      <p>
        We retain your data for as long as your account is active or as needed to provide the
        Service. Session data for free rooms is deleted immediately when the session ends.
        Pro account data (account profile and sprint history) is retained while your account
        remains active.
      </p>
      <p>
        If you request account deletion, we will delete your personal data within 30 days,
        except where we are required to retain it by law (for example, financial records for
        VAT purposes, which we retain for 6 years as required by HMRC).
      </p>

      <h2>8. Your Rights Under UK GDPR</h2>
      <p>
        As a data subject under UK GDPR and the Data Protection Act 2018, you have the following
        rights:
      </p>
      <ul>
        <li>
          <strong>Right of access</strong> — You may request a copy of the personal data we
          hold about you.
        </li>
        <li>
          <strong>Right to rectification</strong> — You may ask us to correct inaccurate or
          incomplete data.
        </li>
        <li>
          <strong>Right to erasure ("right to be forgotten")</strong> — You may request that
          we delete your personal data, subject to legal retention requirements.
        </li>
        <li>
          <strong>Right to restriction of processing</strong> — You may ask us to restrict
          processing of your data in certain circumstances.
        </li>
        <li>
          <strong>Right to data portability</strong> — You may request your data in a
          structured, machine-readable format.
        </li>
        <li>
          <strong>Right to object</strong> — You may object to processing based on legitimate
          interests at any time.
        </li>
        <li>
          <strong>Right to withdraw consent</strong> — Where processing is based on consent,
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
        States, by our third-party processors (Firebase, Vercel, Stripe). Each processor has
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
    <div className="history-overlay" role="dialog" aria-modal="true" aria-label="Sprint history">
      <div className="history-modal">
        {/* Header */}
        <div className="history-header">
          <div>
            <h2 className="history-title">Sprint History</h2>
            <p className="history-sub">{totalSprints} session{totalSprints !== 1 ? "s" : ""} recorded</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close history">✕</button>
        </div>

        {totalSprints === 0 ? (
          <div className="history-empty">
            <div style={{ fontSize: "2.2rem", marginBottom: "10px" }}>📋</div>
            <p style={{ color: "rgba(239,242,247,.62)", fontSize: ".9rem", lineHeight: 1.5 }}>
              No sprint sessions recorded yet. Sessions are saved automatically when you end a session or after 5 hours.
            </p>
          </div>
        ) : (
          <>
            {/* Insights row */}
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

            {/* Session list */}
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

function PricingModal({ onClose, onProActivated, currentUser, currentPlan, onRequireLogin }) {
  const [currency, setCurrency]   = useState("GBP");
  const [billing,  setBilling]    = useState("annual");  // "monthly" | "annual"
  const [keyInput, setKeyInput]   = useState("");
  const [keyStatus, setKeyStatus] = useState(null);      // null | "checking" | "ok" | "invalid" | "error"
  const [showKey,  setShowKey]    = useState(false);
  const [billingStatus, setBillingStatus] = useState(null);
  const activationTimerRef = useRef(null);

  const p       = PRICING[currency];
  const isAnn   = billing === "annual";
  const price   = isAnn ? p.proAnnual : p.pro;
  const annTotal = p.proAnnual * 12;
  const savePct = Math.round((1 - p.proAnnual / p.pro) * 100);
  const stripeUrl = STRIPE_LINKS[billing][currency];
  const support   = process.env.REACT_APP_SUPPORT_EMAIL || "support@pointpoker.app";
  const checkoutLive = stripeUrl !== "#upgrade";
  const isPro = currentPlan === "pro";
  const activationPrimary = !checkoutLive && !!currentUser && !isPro;

  const FREE_FEATURES = [
    { yes: true,  text: `Up to ${FREE_MAX_PLAYERS} voters per session`           },
    { yes: true,  text: "All card decks — Fibonacci, T-Shirt, Powers of 2"      },
    { yes: true,  text: "Simultaneous reveal with live vote breakdown"           },
    { yes: true,  text: "Story queue and session summary export"                 },
    { yes: true,  text: "Facilitator mode and sprint analytics"                  },
    { yes: false, text: "Permanent Team Room with your own URL"                  },
    { yes: false, text: `Up to ${PRO_MAX_PLAYERS} voters per session`            },
    { yes: false, text: "Sprint history — velocity trends across sprints"        },
    { yes: false, text: "Priority support"                                       },
  ];

  const PRO_FEATURES = [
    { yes: true, text: "Everything in Free, always"                              },
    { yes: true, text: "Permanent Team Room — same URL every sprint"             },
    { yes: true, text: `Up to ${PRO_MAX_PLAYERS} voters per session`             },
    { yes: true, text: "Sprint history — velocity trends and consensus insights" },
    { yes: true, text: "Team joins by name — no link sharing needed"             },
    { yes: true, text: "Estimation Spree streak and alignment analytics"         },
    { yes: true, text: "Priority support via email"                              },
  ];

  const handleActivate = async () => {
    if (!currentUser) {
      setBillingStatus("login");
      if (onRequireLogin) onRequireLogin();
      return;
    }
    if (!keyInput.trim()) return;
    setKeyStatus("checking");
    const result = await validateAndSavePro(keyInput, currentUser);
    setKeyStatus(result);
    if (result === "ok") {
      track("pro_activated");
      clearTimeout(activationTimerRef.current);
      activationTimerRef.current = setTimeout(() => {
        if (onProActivated) onProActivated();
      }, 1100);
    }
  };

  useEffect(() => () => clearTimeout(activationTimerRef.current), []);

  const handleCheckout = async () => {
    if (isPro) return;
    if (!currentUser) {
      setBillingStatus("login");
      if (onRequireLogin) onRequireLogin();
      return;
    }
    if (!checkoutLive) {
      setBillingStatus("activation");
      setShowKey(true);
      return;
    }
    setBillingStatus("redirecting");
    markCheckoutIntent(currentUser, billing, currency).catch(() => {
      // Billing intent should not block checkout.
    });
    window.location.assign(stripeUrl);
  };

  return (
    <div className="pricing-overlay" onClick={onClose}>
      <div className="pricing-modal" onClick={e => e.stopPropagation()}>
        <button className="pricing-close" onClick={onClose} aria-label="Close pricing">✕</button>

        <h2 className="pricing-title">Simple, Transparent Pricing</h2>
        <p className="pricing-sub">
          Free forever for small teams. Pro gives you a permanent team room, more voter capacity, and sprint history.
        </p>

        {/* ── Billing toggle ── */}
        <div className="billing-toggle-row">
          <button
            type="button"
            className={`billing-btn${billing === "monthly" ? " active" : ""}`}
            aria-pressed={billing === "monthly"}
            onClick={() => setBilling("monthly")}
          >Monthly</button>
          <button
            type="button"
            className={`billing-btn${billing === "annual" ? " active" : ""}`}
            aria-pressed={billing === "annual"}
            onClick={() => setBilling("annual")}
          >
            Annual
            {billing === "annual"
              ? <span className="billing-save">Save {savePct}%</span>
              : <span className="billing-save dim">Save {savePct}%</span>}
          </button>
        </div>

        {/* ── Currency switcher ── */}
        <div className="currency-row">
          {["GBP", "USD", "EUR"].map(c => (
            <button
              key={c}
              type="button"
              className={`currency-btn${currency === c ? " active" : ""}`}
              aria-pressed={currency === c}
              onClick={() => setCurrency(c)}
            >
              {c === "GBP" ? "🇬🇧 GBP" : c === "USD" ? "🇺🇸 USD" : "🇪🇺 EUR"}
            </button>
          ))}
        </div>

        {/* ── Pricing cards ── */}
        <div className="pricing-cards">

          {/* Free */}
          <div className="pricing-card">
            <div className="pricing-tier">Free</div>
            <div className="pricing-price">
              <span className="pricing-amount">{p.symbol}0</span>
              <span className="pricing-period">/ forever</span>
            </div>
            <p className="pricing-desc">
              No account, no credit card. Get your team estimating in under 10 seconds.
            </p>
            <div className="pricing-features">
              {FREE_FEATURES.map((f, i) => (
                <div className="pricing-feature" key={i}>
                  <span className={`pf-icon ${f.yes ? "yes" : "no"}`}>{f.yes ? "✓" : "–"}</span>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
            <button className="pricing-cta" onClick={onClose}>Get Started Free</button>
          </div>

          {/* Pro */}
          <div className="pricing-card pro">
            <span className="pricing-badge">{isAnn ? "Best Value" : "Most Popular"}</span>
            <div className="pricing-tier">Pro</div>

            <div className="pricing-price">
              <span className="pricing-amount">{p.symbol}{price}</span>
              <span className="pricing-period">/ mo</span>
            </div>

            {isAnn
              ? <p className="pricing-billing-note">Billed as {p.symbol}{annTotal}/year</p>
              : <p className="pricing-billing-note">Switch to annual and save {p.symbol}{p.pro - p.proAnnual}/mo</p>}

            <p className="pricing-desc">
              One permanent room your team reuses every sprint — no link sharing before every session.
            </p>
            <div className="pricing-account-note">
              {currentUser
                ? `Billing will be linked to ${currentUser.email}.`
                : "Create an account first so your plan follows you across devices."}
            </div>
            <div className="pricing-state-box">
              {isPro ? (
                <span className="pricing-state-ok">✓ This account already has Pro access.</span>
              ) : currentUser ? (
                checkoutLive
                  ? <span className="pricing-state-neutral">Signed in and ready for checkout.</span>
                  : <span className="pricing-state-warn">Checkout is not live yet. Use your activation code for now, then keep this same account for Stripe later.</span>
              ) : (
                <span className="pricing-state-neutral">Create an account first so Pro access, billing, and sprint history stay attached to one identity.</span>
              )}
            </div>
            <div className="pricing-features">
              {PRO_FEATURES.map((f, i) => (
                <div className="pricing-feature" key={i}>
                  <span className="pf-icon yes">✓</span>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>

            <button className="pricing-cta pro-cta" onClick={handleCheckout} disabled={isPro}>
              {isPro
                ? "Your Pro plan is active"
                : activationPrimary
                  ? "Activate Pro with code ↓"
                : currentUser
                  ? "Continue to secure checkout →"
                  : checkoutLive
                    ? "Create account to continue →"
                    : "Create account to activate Pro →"}
            </button>
            <p className="pricing-trial-note">
              {!checkoutLive
                ? "Temporary setup: activate Pro with your code while Stripe checkout is being finalised"
                : "Secure checkout via Stripe · Cancel anytime"}
            </p>
            {billingStatus === "login" && (
              <p className="pro-key-status error">Create or sign in to an account before activating or purchasing Pro.</p>
            )}
            {billingStatus === "activation" && (
              <p className="pro-key-status success">Scroll down to enter your Pro activation code.</p>
            )}
            {billingStatus === "redirecting" && (
              <p className="pro-key-status success">Opening Stripe checkout…</p>
            )}
          </div>
        </div>

        {/* ── Pro key activation ── */}
        <div className="pro-key-section">
          <button
            className="pro-key-toggle"
            onClick={() => setShowKey(v => !v)}
            aria-expanded={showKey}
          >
            {showKey ? "▾" : "▸"} {currentUser ? "Activate Pro with a code" : "Sign in to activate Pro with a code"}
          </button>
          {showKey && (
            <div className="pro-key-body">
              {!currentUser ? (
                <div className="pro-key-gate">
                  <p className="pro-key-copy">
                    Pro access is attached to your account, not just this browser. Sign in or create your account first, then return here to activate your code.
                  </p>
                  <button
                    className="pro-key-btn full"
                    onClick={() => onRequireLogin?.()}
                  >
                    Sign in or create account
                  </button>
                </div>
              ) : (
                <>
                  <p className="pro-key-copy">
                    This is the simplest short-term Pro path while Stripe checkout is still being finalised. Sign in once, then activate your code here.
                  </p>
                  <div className="pro-key-row">
                    <input
                      type="text"
                      className="pro-key-input"
                      placeholder="PPRO-XXXX-XXXX-XXXX"
                      value={keyInput}
                      onChange={e => {
                        setKeyInput(e.target.value.toUpperCase());
                        setKeyStatus(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleActivate()}
                      maxLength={19}
                      spellCheck={false}
                    />
                    <button
                      className="pro-key-btn"
                      onClick={handleActivate}
                      disabled={keyStatus === "checking" || !keyInput.trim()}
                    >
                      {keyStatus === "checking" ? "…" : "Activate"}
                    </button>
                  </div>
                  {keyStatus === "ok" && (
                    <p className="pro-key-status success">
                      ✓ Pro activated — your permanent team room is unlocked.
                    </p>
                  )}
                  {keyStatus === "invalid" && (
                    <p className="pro-key-status error">
                      Key not recognised. Check your confirmation email or{" "}
                      <a href={`mailto:${support}`}>contact support</a>.
                    </p>
                  )}
                  {keyStatus === "error" && (
                    <p className="pro-key-status error">
                      Could not reach our servers. Check your connection and try again.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <p className="pricing-footer">
          Prices shown ex. VAT · VAT added at checkout where applicable<br />
          <a href={`mailto:${support}`}>Contact support</a>
          {" · "}
          <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
          {" · "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        </p>
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
  onShowPricing,
  currentUser,
  currentPlan = "free",
  accountProfile,
}) {
  const signedIn = !!currentUser;
  const isPro = currentPlan === "pro";
  const teamRouteMatch = window.location.pathname.match(/^\/t\/([a-z0-9-]+)$/i);
  const teamQuery = new URLSearchParams(window.location.search).get("team");
  const defaultName = currentUser?.displayName || deriveDisplayNameFallback(currentUser?.email || "");
  const dedicatedTeamName = accountProfile?.teamRoomName || deriveTeamRoomName(currentUser?.displayName || "", currentUser?.email || "");
  const dedicatedTeamCode = dedicatedTeamName ? teamCode(dedicatedTeamName) : "";
  const dedicatedTeamUrl = dedicatedTeamCode ? `${window.location.origin}${teamRoomPath(dedicatedTeamCode)}` : "";
  const isSharedTeamRoomEntry = !!prefillTeam && (!!teamRouteMatch || !!teamQuery);
  const canHostPermanentTeamRoom = isPro;
  const canEnterTeamRoom = canHostPermanentTeamRoom || isSharedTeamRoomEntry;
  const showTeamRoomProBadge = !canEnterTeamRoom;
  const nameSeedKey = signedIn ? `${currentUser?.uid || currentUser?.email || ""}:${defaultName}` : "guest";
  // Priority: ?team= → team tab, ?room= → join tab, otherwise → create tab
  const [tab, setTab] = useState(prefillTeam ? "team" : prefillCode ? "join" : (signedIn && isPro ? "team" : "create"));
  const [name, setName] = useState(signedIn ? defaultName : "");
  const [nameEdited, setNameEdited] = useState(false);
  const [role, setRole] = useState("voter");
  const [deck, setDeck] = useState("fibonacci");
  const [rc, setRc] = useState(prefillCode || "");
  const [teamName, setTeamName] = useState(prefillTeam || (signedIn && isPro ? dedicatedTeamName : ""));
  const [err, setErr] = useState("");
  const [teamUrlCopied, setTeamUrlCopied] = useState(false);
  const teamEntryRef = useRef(null);
  const nameInputRef = useRef(null);
  const teamUrlCopiedRef = useRef(null);
  const autoEnterOwnTeamRoomRef = useRef(false);
  const lastNameSeedKeyRef = useRef(nameSeedKey);
  const nameValueRef = useRef(signedIn ? defaultName : "");

  const clearErr = () => setErr("");
  // Live preview of the room code a team name would produce
  const previewCode = teamName.trim() ? teamCode(teamName.trim()) : null;
  const isOwnDedicatedTeamRoom = isPro && !!previewCode && previewCode === dedicatedTeamCode;
  const teamPrimaryLabel = !canEnterTeamRoom
    ? "Upgrade to unlock Team Room →"
    : isSharedTeamRoomEntry
      ? "Join Team Room →"
      : "Enter Team Room →";
  const resolveEnteredName = useCallback(
    () => (nameInputRef.current?.value || nameValueRef.current || "").trim() || defaultName,
    [defaultName],
  );

  const syncEnteredName = useCallback((nextName) => {
    nameValueRef.current = nextName;
    setName(nextName);
    setNameEdited(true);
    clearErr();
  }, []);

  useEffect(() => {
    if (lastNameSeedKeyRef.current !== nameSeedKey) {
      lastNameSeedKeyRef.current = nameSeedKey;
      setNameEdited(false);
      const nextName = signedIn ? defaultName : "";
      nameValueRef.current = nextName;
      setName(nextName);
      if (nameInputRef.current) nameInputRef.current.value = nextName;
    }
  }, [nameSeedKey, signedIn, defaultName]);

  useEffect(() => {
    if (!signedIn) {
      if (!isSharedTeamRoomEntry) setTeamName("");
      return;
    }
    if (!prefillTeam && isPro) setTeamName(dedicatedTeamName);
  }, [signedIn, prefillTeam, isPro, dedicatedTeamName, isSharedTeamRoomEntry]);

  useEffect(() => {
    if (signedIn && isSharedTeamRoomEntry && teamQuery && teamName !== teamQuery) {
      setTeamName(teamQuery);
    }
  }, [signedIn, isSharedTeamRoomEntry, teamQuery, teamName]);

  const focusTeamEntry = useCallback(() => {
    setTimeout(() => {
      teamEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 40);
  }, []);

  const go = () => {
    const enteredName = resolveEnteredName();
    if (!enteredName) { setErr("Please enter your name"); return; }
    if (tab === "create") {
      onCreate(enteredName, role, deck);
    } else if (tab === "join") {
      if (!rc.trim()) { setErr("Please enter a room code"); return; }
      onJoin(enteredName, role, rc.trim().toUpperCase());
    } else {
      // team room
      if (!canEnterTeamRoom) {
        onShowPricing();
        return;
      }
      if (!teamName.trim()) { setErr("Please enter your team name"); return; }
      onTeamRoom(enteredName, role, teamName.trim(), deck);
    }
  };

  const ROLES = [
    { r: "voter",    icon: "🃏", l: "Participant", s: "Votes on each story" },
    { r: "observer", icon: "👁", l: "Facilitator", s: "Runs the session and does not vote" },
  ];

  const copyTeamUrl = async () => {
    if (!dedicatedTeamUrl) return;
    try {
      await navigator.clipboard.writeText(dedicatedTeamUrl);
    } catch {
      // Clipboard failure should still surface visible feedback to keep the action intelligible.
    }
    setTeamUrlCopied(true);
    clearErr();
    clearTimeout(teamUrlCopiedRef.current);
    teamUrlCopiedRef.current = setTimeout(() => setTeamUrlCopied(false), 1600);
  };

  useEffect(() => () => clearTimeout(teamUrlCopiedRef.current), []);

  useEffect(() => {
    if (autoEnterOwnTeamRoomRef.current) return;
    if (!signedIn || !isPro || !isSharedTeamRoomEntry) return;
    if (!teamRouteMatch || !dedicatedTeamCode || teamRouteMatch[1] !== dedicatedTeamCode) return;
    const nextName = resolveEnteredName();
    if (!nextName) return;
    autoEnterOwnTeamRoomRef.current = true;
    onTeamRoom(nextName, role, dedicatedTeamName, deck);
  }, [
    signedIn,
    isPro,
    isSharedTeamRoomEntry,
    teamRouteMatch,
    dedicatedTeamCode,
    role,
    dedicatedTeamName,
    deck,
    onTeamRoom,
    resolveEnteredName,
  ]);

  return (
    <div className="join-wrap">
      <div className="join-box">

        {/* Decorative chip — visual anchor inside the card */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <BrandMark size={56} label="pointpoker"/>
        </div>

        <h1 className="join-title">{signedIn ? `Welcome back${defaultName ? `, ${defaultName.split(" ")[0]}` : ""}` : "Start Estimating"}</h1>
        <p className={`join-sub${signedIn ? " workspace" : ""}`}>
          {signedIn
            ? isPro
              ? "Your workspace is ready. Start a room, open your fixed Team Room, or join a shared session."
              : "Create a room instantly, join a shared session, or upgrade when you want a permanent Team Room."
            : "Real-time planning poker for agile teams · Free · No sign-up"}
        </p>

        {signedIn ? (
          <div className="workspace-shell">
            <div className="workspace-card">
              <div className="workspace-top">
                <div>
                  <div className="workspace-label">Account workspace</div>
                  <div className="workspace-title">
                    {isPro ? "Your Pro workspace is ready" : "You are signed in on the free plan"}
                  </div>
                  <p className="workspace-copy">
                    {isPro
                      ? "Use your dedicated Team Room for recurring sprint planning, or create ad-hoc rooms when you need a one-off session."
                      : "Use Create Room or Join Room for normal sessions. Upgrade only when you want a dedicated Team Room, sprint history, and higher voter capacity."}
                  </p>
                </div>
                <span className={`workspace-pill${isPro ? " pro" : ""}`}>
                  {isPro ? "Pro active" : "Free plan"}
                </span>
              </div>
            </div>

            <div className="workspace-grid">
              <div className="workspace-stat">
                <span className="workspace-stat-k">Display name</span>
                <span className="workspace-stat-v">{defaultName}</span>
              </div>
              <div className="workspace-stat">
                <span className="workspace-stat-k">{isPro ? "Dedicated Team Room" : "Upgrade when ready"}</span>
                <span className="workspace-stat-v">
                  {isPro ? dedicatedTeamCode : `Unlock a fixed Team Room and up to ${PRO_MAX_PLAYERS} voters`}
                </span>
              </div>
            </div>

            {isPro ? (
              <div className="workspace-card">
                <div className="workspace-label">Permanent Team Room</div>
                <div className="workspace-title">{dedicatedTeamName}</div>
                <p className="workspace-copy">
                  This is your fixed Team Room URL. Share it once, bookmark it, and reuse the same room every sprint.
                </p>
                <div className="workspace-team-url">
                  <code>{dedicatedTeamUrl}</code>
                  <button type="button" className={teamUrlCopied ? "copied" : ""} onClick={copyTeamUrl}>
                    {teamUrlCopied ? "✓ Invite link copied!" : "Copy link"}
                  </button>
                </div>
                <div className="workspace-actions" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="workspace-action-btn gold"
                    onClick={() => {
                      const n = resolveEnteredName();
                      if (!n) { setErr("Please enter your name"); setTab("team"); focusTeamEntry(); return; }
                      onTeamRoom(n, role, dedicatedTeamName, deck);
                    }}
                  >
                    Enter Team Room →
                  </button>
                  <button
                    type="button"
                    className="workspace-action-btn"
                    onClick={() => {
                      const n = resolveEnteredName();
                      if (!n) { setErr("Please enter your name"); setTab("create"); return; }
                      onCreate(n, role, deck);
                    }}
                  >
                    Create one-off room
                  </button>
                </div>
              </div>
            ) : (
              <div className="workspace-card">
                <div className="workspace-label">Upgrade path</div>
                <div className="workspace-title">Get a fixed Team Room when your team is ready</div>
                <p className="workspace-copy">
                  Free users can still create and join sessions instantly. Upgrade when you want a permanent URL, sprint history, and more voter capacity.
                </p>
                <div className="workspace-actions">
                  <button
                    type="button"
                    className="workspace-action-btn gold"
                    onClick={() => {
                      const n = resolveEnteredName();
                      if (!n) { setErr("Please enter your name"); setTab("create"); return; }
                      onCreate(n, role, deck);
                    }}
                  >
                    Create Room →
                  </button>
                  <button type="button" className="workspace-action-btn" onClick={onShowPricing}>
                    Upgrade to Pro
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button className="btn-pricing" onClick={onShowPricing}>
            ✦ Free &amp; Pro Plans — See What's Included
          </button>
        )}

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
            {showTeamRoomProBadge && <span className="pro-tab-badge">PRO</span>}
          </button>
        </div>

        {/* Your Name — always shown */}
        <label className="lbl">Your Name</label>
        <input
          ref={nameInputRef}
          className="inp"
          placeholder="e.g. Alex Johnson"
          value={name}
          onInput={(e) => syncEnteredName(e.currentTarget.value)}
          onChange={(e) => syncEnteredName(e.target.value)}
          onBlur={(e) => {
            const liveValue = e.currentTarget.value;
            if (liveValue !== nameValueRef.current) syncEnteredName(liveValue);
          }}
          onKeyDown={(e) => e.key === "Enter" && go()}
          autoFocus={!signedIn}
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
              style={{ letterSpacing: "0.12em", fontWeight: 600 }}
            />
          </>
        )}

        {/* Team Room: team name input + live code preview */}
        {tab === "team" && (
          <div ref={teamEntryRef}>
            <label className="lbl">Team Name</label>
            <input
              className="inp"
              placeholder="e.g. Product Team"
              value={teamName}
              onChange={(e) => { setTeamName(e.target.value); clearErr(); }}
              onKeyDown={(e) => e.key === "Enter" && go()}
              readOnly={isSharedTeamRoomEntry || (signedIn && isPro)}
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
                  Team Room requires a Pro account. Type your team name to preview the URL — then upgrade to unlock it.
                </span>
                <button type="button" className="team-pro-gate-link" onClick={onShowPricing}>
                  View Pro plans →
                </button>
              </div>
            ) : isSharedTeamRoomEntry ? (
              <p style={{ fontSize: ".82rem", color: "rgba(239,242,247,.65)", marginBottom: "18px", lineHeight: 1.6 }}>
                {signedIn && !isPro
                  ? "You are joining a shared Team Room. Only the host needs Pro — your own plan stays Free."
                  : "This team's permanent room is ready. Add your name, choose your role, and join the live session."}
              </p>
            ) : (
              <p style={{ fontSize: ".82rem", color: "rgba(239,242,247,.65)", marginBottom: "18px", lineHeight: 1.6 }}>
                {isOwnDedicatedTeamRoom
                  ? "Your Pro account has a fixed Team Room. Share the same link every sprint and keep it bookmarked for the whole team."
                  : "Your Team Room is tied to your Pro account. Use the same URL every sprint and keep it bookmarked for the whole team."}
              </p>
            )}
          </div>
        )}

        {/* Role picker — always shown */}
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

        {/* Deck picker — shown on Create and Team tabs */}
        {(tab === "create" || tab === "team") && (
          <>
            <label className="lbl">Card Deck</label>
            <div className="deck-grid">
              {DECK_KEYS.map((k) => {
                const d = DECK_DEFINITIONS[k];
                return (
                  <button
                    key={k}
                    className={`deck-btn${deck === k ? " active" : ""}`}
                    onClick={() => setDeck(k)}
                  >
                    <span className="dk-label">{d.label}</span>
                    <span className="dk-desc">{d.desc}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {err && <div className="err">{err}</div>}
        <button className="btn-primary" onClick={go}>
          {tab === "create" ? "Create Room →"
            : tab === "join" ? "Join Room →"
            : teamPrimaryLabel}
        </button>
        {!signedIn && tab === "create" && (
          <p style={{ fontSize: ".78rem", color: "rgba(239,242,247,.55)", textAlign: "center", marginTop: "10px" }}>
            Free forever · Up to {FREE_MAX_PLAYERS} voters · Ready in under 10 seconds
          </p>
        )}
        {!signedIn && tab === "team" && (
          <p style={{ fontSize: ".78rem", color: "rgba(239,242,247,.55)", textAlign: "center", marginTop: "10px" }}>
            Pro · Your team's permanent space — same link, every sprint
          </p>
        )}
      </div>

      {!signedIn && (
      <section className="seo-section" aria-label="About pointpoker">
        <h2 className="seo-h2">The Fastest Way to Run Sprint Planning — Free, No Sign-up</h2>
        <p className="seo-intro">
          Stop wasting the first 20 minutes of every sprint just getting the team set up. pointpoker
          gives you a live estimation room in under 10 seconds. Create a room, share one link, and your
          whole team is voting simultaneously — no account, no install, no friction.
        </p>

        <div className="seo-grid">
          <div className="seo-card">
            <h3 className="seo-h3">Why Simultaneous Reveal Matters</h3>
            <p className="seo-p">
              pointpoker works because every team member votes
              independently before estimates are shown. Cards reveal all at once, which eliminates
              anchoring bias — the tendency to adjust your estimate after hearing someone else's.
              The result is more honest, more accurate story points with less discussion time.
            </p>
          </div>
          <div className="seo-card">
            <h3 className="seo-h3">How It Works</h3>
            <ol className="seo-ol">
              <li>Create a free room — no account required</li>
              <li>Share the link in Slack, Teams, or Zoom</li>
              <li>Load your backlog into the story queue</li>
              <li>Vote with Fibonacci, T-Shirt, or Powers of 2 cards</li>
              <li>Reveal all votes at once — discuss only when there's disagreement</li>
              <li>Record the estimate and move straight to the next story</li>
            </ol>
          </div>
        </div>

        <div className="seo-plan-section scroll-target" id="plans" tabIndex="-1" aria-label="Plans overview">
          <h3 className="seo-h3">Plans that match how teams actually estimate</h3>
          <p className="seo-p seo-plan-intro">
            Start free in seconds. Upgrade only when you need a permanent team room, more voter capacity, and sprint history tied to your account.
          </p>
          <div className="seo-plan-grid">
            <article className="seo-plan-card">
              <div className="seo-plan-topline">Free</div>
              <div className="seo-plan-price">£0</div>
              <ul className="seo-plan-list">
                <li>Up to {FREE_MAX_PLAYERS} voters per session</li>
                <li>All card decks and story queue</li>
                <li>Facilitator mode and live analytics</li>
              </ul>
            </article>
            <article className="seo-plan-card pro">
              <div className="seo-plan-topline">Pro</div>
              <div className="seo-plan-price">from £5/mo</div>
              <ul className="seo-plan-list">
                <li>Permanent Team Room with your own URL</li>
                <li>Up to {PRO_MAX_PLAYERS} voters per sprint</li>
                <li>Sprint history and cross-device account access</li>
              </ul>
            </article>
          </div>
          <div className="seo-plan-actions">
            <button type="button" className="btn-pricing seo-plan-cta" onClick={onShowPricing}>
              Open full pricing
            </button>
          </div>
        </div>

        <div className="seo-features">
          <h3 className="seo-h3">What Makes This Planning Poker Tool Different</h3>
          <ul className="seo-ul">
            <li><strong>Zero setup, every time</strong> — create a room and share the link in under 10 seconds, no account needed</li>
            <li><strong>Simultaneous vote reveal</strong> — prevents anchoring bias so every estimate is honest and independent</li>
            <li><strong>Three card decks</strong> — Fibonacci (1–34), T-Shirt sizing (XS–XXL), or Powers of 2, matched to how your team thinks</li>
            <li><strong>Story queue</strong> — load your full sprint backlog and work through it in order, one story at a time</li>
            <li><strong>Team Alignment analytics</strong> — facilitators see live consensus rate, total story points, estimate distribution, and re-vote patterns</li>
            <li><strong>Estimation Spree</strong> — a live streak counter celebrates when the team aligns consistently, reinforcing good backlog clarity</li>
            <li><strong>Built-in countdown timer</strong> — keep each estimation round time-boxed and the whole session on track</li>
            <li><strong>Session summary</strong> — copy all story point estimates to the clipboard at the end for your sprint tool</li>
            <li><strong>Facilitator mode</strong> — join without a vote card and manage the timer, reveal, and session flow from the analytics view</li>
            <li><strong>Team Room (Pro)</strong> — one permanent URL your team reuses every sprint, no link sharing ever again</li>
          </ul>
        </div>

        <div className="seo-divider" role="separator"></div>

        <div className="seo-faq scroll-target" id="faq" tabIndex="-1">
          <h3 className="seo-h3" style={{ textAlign: "center", marginBottom: "20px" }}>Frequently Asked Questions</h3>
          <div className="seo-faq-grid">
            <div className="seo-faq-item">
              <h4 className="seo-h4">Is this planning poker tool actually free?</h4>
              <p className="seo-p">
                Yes, and it stays free. The free tier gives you up to {FREE_MAX_PLAYERS} participants,
                all three card decks, a full story queue, session analytics, and clipboard export —
                no credit card, no account, no time limit. Pro adds a permanent Team Room and up to {PRO_MAX_PLAYERS} participants.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">Do I need to create an account?</h4>
              <p className="seo-p">
                No. Enter your name, create a room, and share the link. Your team joins in one click.
                There is no registration, no email confirmation, and no password required — ever.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">Why use Fibonacci numbers for story points?</h4>
              <p className="seo-p">
                Fibonacci (1, 2, 3, 5, 8, 13, 21, 34) reflects how estimation uncertainty grows with
                complexity. The widening gaps between numbers make it easy for teams to distinguish
                small, medium, and large effort without false precision — and force a real conversation
                when two people are far apart.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">Does this work for remote and distributed teams?</h4>
              <p className="seo-p">
                It was built for remote teams. Paste the room link into Slack, Teams, or Zoom chat
                and everyone joins from any browser in seconds — no install, no plugin. Works across
                all time zones and any combination of desktop and mobile devices.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">What is the Team Alignment score?</h4>
              <p className="seo-p">
                The Team Alignment score (visible to facilitators) tracks the percentage of stories
                that reached first-round consensus — where every voter picked the same card.
                A high score means your backlog is well-defined. A low score flags stories that
                need more acceptance criteria before the sprint begins.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">How many people can join a planning poker session?</h4>
              <p className="seo-p">
                Free rooms support up to {FREE_MAX_PLAYERS} voters. Pro rooms support up to {PRO_MAX_PLAYERS}.
                Facilitators and non-voting stakeholders join on top of
                that limit and never use a voter slot.
              </p>
            </div>
          </div>
        </div>
      </section>
      )}
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
  onAddStory,
  onRecordStory,
  sessionWarning,
  toast,
  currentPlan,
  onShowPricing,
}) {
  const cards = getCards(deck);
  const [tsel, setTsel] = useState(30);
  const [storyInput, setStoryInput] = useState("");
  const [optimisticVote, setOptimisticVote] = useState(null);
  const [headerLinkCopied, setHeaderLinkCopied] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
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
  const votedCount = voters.filter((p) => p.voted).length;
  const notVoted = voters.filter((p) => !p.voted);

  const voted = voters.filter((p) => p.voted);
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
  const allSame =
    new Set(voted.map((p) => p.vote)).size === 1 && voted.length > 1;
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

  // Fire confetti + consensus banner exactly once per consensus reveal
  useEffect(() => {
    if (revealed && allSame && confettiFiredForRoundRef.current !== round) {
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
  }, [revealed, allSame, round]);

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

  useEffect(() => () => clearTimeout(copyFeedbackRef.current), []);

  const handleCopyLink = useCallback((source = "header") => {
    navigator.clipboard.writeText(shareUrl);
    track("invite_copied");
    toast("🔗 Link copied!");
    if (source === "header") {
      setHeaderLinkCopied(true);
      setInviteLinkCopied(false);
    } else {
      setInviteLinkCopied(true);
      setHeaderLinkCopied(false);
    }
    clearTimeout(copyFeedbackRef.current);
    copyFeedbackRef.current = setTimeout(() => {
      setHeaderLinkCopied(false);
      setInviteLinkCopied(false);
    }, 1600);
  }, [shareUrl, toast]);

  const prog = timer.running ? timer.remaining / timer.duration : 1;
  const offset = CIRC * (1 - prog);
  const urgent = timer.remaining <= 5;
  const warn = timer.remaining <= 10 && !urgent;
  const ringClr = urgent ? "#e74c3c" : warn ? "#e67e22" : "var(--gold)";

  return (
    <>
      {/* Confetti — mounts when consensus detected, canvas self-destructs when done */}
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} big={allSame} />}
      {/* Full-screen burst banner — auto-dismisses after 3.5s */}
      {showConsensus && voted.length > 0 && (
        <div className="consensus-overlay" aria-live="polite">
          <div className="consensus-burst">
            <span className="consensus-burst-emoji">🎉</span>
            <div className="consensus-burst-text">Perfect Consensus!</div>
            <div className="consensus-burst-sub">
              Everyone picked {voted[0].vote} — the team agrees
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
              🎲 {storiesDone} {storiesDone === 1 ? "story" : "stories"} estimated
            </div>
            {code && (
              <div className="badge" style={{ fontFamily: "monospace", letterSpacing: ".12em", fontSize: ".66rem" }}>
                {code}
              </div>
            )}
          </div>
          <div className="hdr-r">
            <button
              className="btn-sm"
              onClick={() => handleCopyLink("header")}
              aria-label="Copy invite link to clipboard"
            >
              {headerLinkCopied ? "✓ Copied!" : "🔗 Copy Link"}
            </button>
          </div>
        </div>
      </header>

      <div className="game-body">
        {/* Solo invite banner — shown when creator is alone, dismissed once copied or closed */}
        {players.length === 1 && !solobannerDismissed && (
          <div className="solo-invite-banner" role="status">
            <span className="solo-invite-icon">👥</span>
            <div className="solo-invite-body">
              <strong>Your room is ready.</strong> Share the link to bring your team in.
            </div>
            <button
              type="button"
              className="solo-invite-copy"
              onClick={() => { handleCopyLink("banner"); setSoloBannerDismissed(true); }}
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

        {/* Current story banner — visible to all players */}
        {activeStory && !allStoriesDone && (
          <div className="story-name-banner">
            <span className="story-name-label">
              Now estimating · Story {activeStoryIdx + 1} of {stories.length}
            </span>
            <div className="story-name-text">{activeStory.name}</div>
          </div>
        )}
        {allStoriesDone && (
          <div className="story-name-banner" style={{ borderColor: "rgba(39,174,96,.3)", background: "rgba(39,174,96,.06)" }}>
            <span className="story-name-label" style={{ color: "rgba(39,174,96,.5)" }}>Sprint backlog</span>
            <div className="story-name-text" style={{ color: "#2ecc71" }}>All {stories.length} stories estimated ✓</div>
          </div>
        )}

        <div className="game-grid">
          {/* LEFT COLUMN */}
          <div className="lcol">
            {/* Timer */}
            <div className="panel panel-gold">
              <span className="ptitle">Estimation Timer</span>
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
                        <span>🃏</span> Start Voting — {tsel === 60 ? "1 min" : `${tsel}s`}
                      </button>
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
                          <span className={`rnum${urgent ? " urgent" : ""}`}>
                            {timer.remaining}
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
                      Round complete — start the next story below
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
                          <span className={`rnum${urgent ? " urgent" : ""}`}>
                            {timer.remaining}
                          </span>
                        </div>
                      </div>
                      <div className="rtxt">
                        <div
                          className={`rstatus${urgent ? " danger" : warn ? " warn" : ""}`}
                        >
                          {urgent
                            ? "Pick a card — NOW!"
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
                        ? "✓ Cards revealed — results below"
                        : "Waiting for the facilitator to start voting…"}
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
              {!isObs && (
                <div
                  className={`vstatus${myVote && !revealed ? " voted" : " wait"}`}
                  style={{ marginTop: 10 }}
                >
                  {revealed
                    ? "⏳ Waiting for the facilitator to start the next story…"
                    : myVote
                      ? `✓ You picked ${myVote} — waiting for reveal…`
                      : "Pick a card to cast your vote"}
                </div>
              )}
            </div>

            {/* Results */}
            {revealed && (
              <div className="panel panel-gold">
                {voted.length > 0 && (
                  <>
                    <div className="avg-hero">
                      <div className="avg-hero-label">
                        Team Average Story Points
                      </div>
                      <div className="avg-hero-num">{avgDisp}</div>
                      {allSame ? (
                        <div className="avg-hero-consensus">
                          🎉 Perfect consensus — everyone picked {voted[0].vote}
                        </div>
                      ) : (
                        <div className="avg-hero-sub">
                          See individual votes below
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
                              Spread: {spread} point{spread !== 1 ? "s" : ""} — discuss before finalising
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
                {/* Story queue manager */}
                <div className="story-panel">
                  <div className="story-panel-title">📋 Story Queue <span className="story-panel-optional">optional</span></div>
                  <p className="story-panel-hint">
                    Add stories to track estimates by name — or just start voting without them. Both work.
                  </p>
                  <div className="story-add-row">
                    <input
                      className="story-inp"
                      placeholder="e.g. User login flow, PROJ-42…"
                      value={storyInput}
                      maxLength={200}
                      onChange={(e) => setStoryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && storyInput.trim()) {
                          onAddStory(storyInput.trim());
                          setStoryInput("");
                        }
                      }}
                    />
                    <button
                      className="btn-story-add"
                      disabled={!storyInput.trim()}
                      onClick={() => {
                        if (storyInput.trim()) {
                          onAddStory(storyInput.trim());
                          setStoryInput("");
                        }
                      }}
                    >
                      + Add
                    </button>
                  </div>
                  {hasStories && (
                    <>
                      <div className="story-progress">
                        Story {Math.min(activeStoryIdx + 1, stories.length)} of {stories.length}
                        {allStoriesDone ? " — all stories estimated!" : ""}
                      </div>
                      <div className="story-list">
                        {stories.map((s, i) => {
                          const state =
                            i < activeStoryIdx ? "done" :
                            i === activeStoryIdx ? "active" : "queued";
                          return (
                            <div key={i} className={`story-item ${state}`}>
                              <span>{i + 1}. {s.name}</span>
                              {s.estimate != null && (
                                <span className="story-est">{s.estimate} pts</span>
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
                    {hasVotes
                      ? "Ready — all votes are in!"
                      : "Waiting for team to finish voting…"}
                  </div>
                )}

                {/* Primary forward action — shown after reveal only */}
                {revealed && (
                  <>
                    {hasStories && !allStoriesDone ? (
                      <button
                        className="btn-record-next"
                        onClick={() => onRecordStory(avgDisp !== "—" ? avgDisp : (allSame ? voted[0]?.vote : "?"), allSame)}
                      >
                        ✅ Record {avgDisp !== "—" ? `${avgDisp} pts` : "estimate"} &amp; Next Story
                      </button>
                    ) : (
                      <button
                        className="btn-record-next"
                        onClick={() => onNewRound(
                          avgDisp !== "—" ? avgDisp : (allSame ? voted[0]?.vote : "?"),
                          allSame
                        )}
                      >
                        ✅ Agreed{avgDisp !== "—" ? ` — ${avgDisp} pts` : ""} — Start Next Story
                      </button>
                    )}
                    <div className="obs-secondary-row" style={{ marginTop: 8 }}>
                      <button className="btn-next-round" onClick={() => onNewRound(null, false)}>
                        ↺ Re-vote this story
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
                      "Re-vote" keeps the same story · "New Sprint" resets everything
                    </div>
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
                  <div className="vp-head">
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
                    {revealed && p.voted ? (
                      <div className="vchip">{p.vote}</div>
                    ) : (
                      <div className={`pdot${p.voted ? " v" : " w"}`} />
                    )}
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
                    <div className="pdot o" />
                  </div>
                ))}
              </div>
            </div>

            {/* Sprint Analytics — facilitator only */}
            {isObs && (() => {
              const isTshirt = deck === "tshirt";
              const tshirtOrder = ["XS", "S", "M", "L", "XL", "XXL"];

              // Stories from the named queue that have been recorded
              const sizedQueueStories = stories.filter((s) => s.estimate != null && s.estimate !== "?");

              // Rounds recorded via newRound (no-queue path) — numeric estimates only
              const spRounds = rounds.filter(
                (r) => r.estimate != null && r.estimate !== "?" && !isNaN(Number(r.estimate))
              );

              // Prefer queue estimates; fall back to rounds (the two paths are mutually exclusive
              // in normal usage — queue path uses recordAndNextStory, no-queue uses newRound)
              const hasQueueData = sizedQueueStories.length > 0;
              const spStories = hasQueueData
                ? sizedQueueStories.filter((s) => !isNaN(Number(s.estimate)))
                : spRounds;
              const sizedStories = hasQueueData ? sizedQueueStories : spRounds;

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
              const deckLabel = deck === "fibonacci" ? "Fibonacci"
                : deck === "tshirt" ? "T-Shirt sizes"
                : "Powers of 2";
              const unitLabel = isTshirt ? "" : " sp";

              // Per-story list — queue names when available, "Story N" otherwise
              const listedStories = sizedStories.map((s, i) => ({
                name: s.name && s.name.trim() ? s.name.trim() : `Story ${i + 1}`,
                estimate: s.estimate,
              }));

              // Sprint scope display
              const scopeDisp = totalSP > 0
                ? `${totalSP} sp`
                : isTshirt && sizedStories.length > 0
                  ? `${sizedStories.length} sized`
                  : "—";
              const avgDisp2 = avgSP !== null ? `${avgSP} sp` : isTshirt ? "—" : "—";

              return (
                <div className="panel">
                  <span className="ptitle">Sprint Analytics</span>

                  {/* ── Section 1: Sprint Snapshot ── */}
                  <div className="a-kpis">
                    <div className="a-kpi">
                      <span className="a-kpi-v">{storiesDone}</span>
                      <span className="a-kpi-l">Stories sized</span>
                    </div>
                    <div className="a-kpi">
                      <span className="a-kpi-v">{scopeDisp}</span>
                      <span className="a-kpi-l">Sprint scope</span>
                    </div>
                    <div className="a-kpi">
                      <span className="a-kpi-v">{avgDisp2}</span>
                      <span className="a-kpi-l">Avg / story</span>
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
                    <div className="a-align-note">% of stories where all voters agreed on the first vote</div>
                  </div>

                  {/* ── Section 3: Sized this sprint ── */}
                  <div className="a-stories">
                    <div className="a-section-title">
                      Sized this sprint{listedStories.length > 0 ? ` (${listedStories.length})` : ""}
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
                          ? "Add story names to your queue to track estimates here."
                          : "No stories sized yet — estimates will appear here after the first round."}
                      </div>
                    )}
                  </div>

                  {/* ── Section 4: Estimate distribution ── */}
                  {breakdown.length > 0 && (
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

            {/* Invite */}
            <div className="panel inv-panel">
              <span className="ptitle">Invite Team</span>
              <div className="inv-url">{shareUrl}</div>
              <button
                className="btn-inv"
                onClick={() => handleCopyLink("panel")}
              >
                {inviteLinkCopied ? "✓ Invite link copied!" : "🔗 Copy Invite Link"}
              </button>
            </div>

            {/* Estimation Spree — shown when streak ≥ 1, all players saw same consensus */}
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
                      ? "Unstoppable — team is perfectly aligned 🚀"
                      : streak >= 3
                      ? "Team is locked in — great backlog clarity"
                      : streak === 2
                      ? "Two in a row — team understands the work"
                      : "First consensus — everyone on the same page"}
                  </div>
                </div>
              </div>
            )}

            {/* Session summary — appears once stories have estimates */}
            {hasStories && stories.some((s) => s.estimate != null) && (
              <div className="panel">
                <span className="ptitle">Sprint Summary</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", marginBottom: "12px" }}>
                  {stories.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        padding: "6px 10px",
                        borderRadius: "8px",
                        background: s.estimate != null ? "rgba(201,145,42,.06)" : "rgba(255,255,255,.02)",
                        border: "1px solid",
                        borderColor: s.estimate != null ? "rgba(201,145,42,.14)" : "var(--border)",
                      }}
                    >
                      <span style={{ fontSize: ".8rem", color: s.estimate != null ? "var(--cream)" : "rgba(239,242,247,.65)", flex: 1, paddingRight: "8px", lineHeight: 1.3 }}>
                        {s.name}
                      </span>
                      <span style={{ fontSize: ".88rem", fontWeight: 700, color: s.estimate != null ? "var(--gold2)" : "rgba(239,242,247,.52)", whiteSpace: "nowrap" }}>
                        {s.estimate != null ? `${s.estimate}` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  className="btn-inv"
                  onClick={() => {
                    const lines = ["Sprint Estimation Summary", "========================", ""];
                    stories.forEach((s, i) => {
                      lines.push(`${i + 1}. ${s.name}  →  ${s.estimate != null ? s.estimate + " pts" : "not estimated"}`);
                    });
                    lines.push("");
                    lines.push(`Total stories: ${stories.length}`);
                    lines.push(`Estimated: ${stories.filter((s) => s.estimate != null).length}`);
                    navigator.clipboard.writeText(lines.join("\n"));
                    toast("📋 Summary copied to clipboard!");
                  }}
                >
                  📋 Copy Summary
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Free-tier upgrade nudge — hidden for Pro users ── */}
      {currentPlan !== "pro" && rd.plan !== "pro" && (
        <div className="game-upgrade-strip">
          <span className="game-upgrade-strip-text">
            Free plan · up to {FREE_MAX_PLAYERS} voters · upgrade for a permanent Team Room, sprint history, and up to {PRO_MAX_PLAYERS} voters
          </span>
          <button className="game-upgrade-strip-cta" onClick={onShowPricing}>
            ✦ Upgrade to Pro
          </button>
        </div>
      )}
    </>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "./firebase";
import {
  ref,
  set,
  onValue,
  update,
  remove,
  serverTimestamp,
  onDisconnect,
} from "firebase/database";

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
    .replace(/[^a-z0-9\s]/g, "")   // strip special chars
    .replace(/\s+/g, "-")           // spaces → hyphens
    .replace(/-{2,}/g, "-")         // collapse double-hyphens
    .replace(/^-|-$/g, "")          // trim leading/trailing hyphens
    .slice(0, 24)                   // max 24 chars
  || "team";
const ini = (n = "") =>
  n
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();

/* ═══════════════════════════ CSS ═══════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Outfit:wght@300;400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #0c1a0f;
  --bg2:      #122018;
  --surface:  rgba(255,255,255,0.07);
  --surface2: rgba(255,255,255,0.12);
  --border:   rgba(255,255,255,0.13);
  --border2:  rgba(255,255,255,0.24);
  --gold:     #c9922a;
  --gold2:    #e8b84b;
  --gold3:    #f5d07a;
  --goldA:    rgba(201,146,42,0.20);
  --goldB:    rgba(201,146,42,0.13);
  --cream:    #eef2ec;
  --cream2:   #9db89e;
  --red:      #e04848;
  --green:    #3dba68;
  --blue:     #4499e8;
  --ink:      #080e09;
  --card-bg:  #fdfaf3;
  --radius:   16px;
  --radius-sm:10px;
  --shadow:   0 20px 60px rgba(0,0,0,0.60);
}

html { font-size: 16px; scroll-behavior: smooth; }
body {
  font-family: 'Outfit', sans-serif;
  background: var(--bg);
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
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(20,70,30,0.45) 0%, transparent 60%),
    radial-gradient(ellipse 50% 35% at 85% 95%, rgba(80,45,15,0.12) 0%, transparent 55%),
    url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");
  background-size: cover, cover, 200px 200px;
}

.app { min-height: 100vh; display: flex; flex-direction: column; position: relative; z-index: 1; }

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
  font-family: 'Cormorant Garamond', serif;
  font-size: 2.4rem; font-weight: 700; color: var(--gold2);
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
  background: linear-gradient(160deg, rgba(14,32,18,.98) 0%, rgba(7,14,8,.99) 100%);
  border: 1px solid rgba(201,145,42,.3);
  border-radius: 24px;
  padding: 48px 40px 44px;
  box-shadow: 0 40px 100px rgba(0,0,0,.7), inset 0 1px 0 rgba(201,145,42,.12);
  position: relative; overflow: hidden;
  animation: fadeUp .45s ease;
}
.join-box::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--gold), var(--gold3), var(--gold), transparent);
  background-size: 300% auto; animation: shimmer 3s linear infinite;
}
.join-suits {
  display: flex; justify-content: center; gap: 16px;
  margin-bottom: 28px; font-size: 1.4rem;
}
.join-suits span { opacity: .12; }
.join-suits span:nth-child(2), .join-suits span:nth-child(4) { color: var(--red); opacity: .18; }
.join-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 2.6rem; font-weight: 700;
  color: var(--gold2); text-align: center;
  margin-bottom: 4px; letter-spacing: .5px; line-height: 1.1;
}
.join-sub {
  text-align: center; color: rgba(239,242,247,.75);
  font-size: .92rem; margin-bottom: 36px; font-weight: 300; letter-spacing: .5px;
}
.lbl {
  display: block; font-size: .72rem; font-weight: 600;
  letter-spacing: 1.8px; text-transform: uppercase;
  color: rgba(239,242,247,.75); margin-bottom: 8px;
}
.inp {
  width: 100%; padding: 13px 16px;
  background: rgba(255,255,255,.06); border: 1px solid var(--border2);
  border-radius: var(--radius-sm);
  font-family: 'Outfit', sans-serif; font-size: .95rem;
  color: var(--cream); outline: none; margin-bottom: 20px;
  transition: border-color .2s, box-shadow .2s, background .2s;
}
.inp:focus { border-color: var(--gold2); background: rgba(255,255,255,.09); box-shadow: 0 0 0 3px rgba(232,184,75,.18); }
.inp:hover:not(:focus) { background: rgba(255,255,255,.08); }
.inp::placeholder { color: rgba(239,242,247,.50); }
.role-row { display: flex; gap: 10px; margin-bottom: 28px; }
.role-btn {
  flex: 1; padding: 14px 8px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--surface);
  font-family: 'Outfit', sans-serif; font-size: .82rem; font-weight: 500;
  cursor: pointer; color: rgba(239,242,247,.80); transition: all .2s;
  display: flex; flex-direction: column; align-items: center; gap: 5px;
}
.role-btn .ri { font-size: 1.25rem; }
.role-btn .rl { font-weight: 600; font-size: .88rem; }
.role-btn .rs { font-size: .78rem; color: rgba(239,242,247,.68); font-weight: 300; }
.role-btn:hover:not(.rv):not(.ro) { background: var(--surface2); color: var(--cream); border-color: var(--border2); }
.role-btn.rv { border-color: var(--gold); background: var(--goldB); color: var(--gold2); }
.role-btn.ro { border-color: rgba(68,153,232,.5); background: rgba(68,153,232,.10); color: #6ab8f7; }
.err { color: #e74c3c; font-size: .78rem; margin-bottom: 12px; text-align: center; }
.btn-primary {
  width: 100%; padding: 15px; border: none; border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--gold), var(--gold2));
  color: var(--ink); font-family: 'Outfit', sans-serif;
  font-size: .98rem; font-weight: 700; cursor: pointer;
  letter-spacing: .3px; transition: all .2s;
  box-shadow: 0 4px 20px rgba(201,145,42,.35);
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(201,145,42,.5); }
.btn-primary:active { transform: none; }

/* Tab row on Join screen */
.tab-row { display: flex; gap: 6px; margin-bottom: 22px; }
.tab-btn { flex: 1; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: transparent; color: rgba(239,242,247,.75); font-family: 'Outfit', sans-serif; font-size: .875rem; font-weight: 500; cursor: pointer; transition: all .2s; }
.tab-btn.active { background: var(--goldB); border-color: rgba(201,145,42,.3); color: var(--gold2); }
.tab-btn:hover:not(.active) { background: var(--surface); color: rgba(239,242,247,.90); border-color: var(--border2); }

/* Team Room preview chip */
.team-code-preview { display: inline-flex; align-items: center; gap: 8px; background: var(--goldB); border: 1px solid rgba(201,145,42,.22); border-radius: 8px; padding: 8px 12px; margin-bottom: 18px; width: 100%; }
.tcp-label { font-size: .62rem; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(239,242,247,.65); white-space: nowrap; }
.tcp-code { font-family: monospace; font-size: .9rem; font-weight: 700; color: var(--gold2); letter-spacing: .1em; flex: 1; }

/* Deck picker on Create tab */
.deck-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 24px; }
.deck-btn { padding: 10px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: transparent; color: rgba(239,242,247,.80); font-family: 'Outfit', sans-serif; cursor: pointer; transition: all .2s; text-align: center; }
.deck-btn .dk-label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: 3px; }
.deck-btn .dk-desc  { display: block; font-size: .75rem; color: rgba(239,242,247,.62); }
.deck-btn.active { background: var(--goldB); border-color: rgba(201,145,42,.3); color: var(--gold2); }
.deck-btn.active .dk-desc { color: rgba(201,145,42,.55); }
.deck-btn:hover:not(.active) { background: var(--surface); color: rgba(239,242,247,.90); border-color: var(--border2); }

/* ══════════════════════ SEO CONTENT SECTION ══════════════════════ */
.seo-section {
  width: 100%; max-width: 860px; margin-top: 56px;
  color: rgba(239,242,247,.82); font-family: 'Outfit', sans-serif;
}
.seo-section h2.seo-h2 {
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.85rem; font-weight: 700;
  color: var(--gold2); text-align: center;
  margin-bottom: 16px; letter-spacing: .3px; line-height: 1.25;
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
  .seo-grid, .seo-faq-grid { grid-template-columns: 1fr; }
  .seo-section h2.seo-h2 { font-size: 1.5rem; }
  .seo-section { margin-top: 40px; }
}

/* ══════════════════════ HEADER ══════════════════════ */
.hdr {
  background: rgba(7,14,8,.95);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(20px);
  position: sticky; top: 0; z-index: 100; padding: 0 24px;
}
.hdr-in {
  max-width: 1160px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  min-height: 60px; gap: 12px; flex-wrap: wrap; padding: 10px 0;
}
.hdr-l { display: flex; align-items: center; gap: 12px; }
.btn-back {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 13px; border-radius: 8px;
  border: 1px solid var(--border); background: transparent;
  color: rgba(239,242,247,.75); font-family: 'Outfit', sans-serif;
  font-size: .78rem; cursor: pointer; transition: all .2s;
}
.btn-back:hover { background: var(--surface2); color: var(--cream); border-color: var(--border2); }
.logo-txt {
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.3rem; font-weight: 700; color: var(--gold2); letter-spacing: .3px;
}
.hdr-c { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
.badge {
  background: var(--surface2); border: 1px solid var(--border2);
  border-radius: 100px; padding: 5px 12px;
  font-size: .68rem; letter-spacing: 1.5px; text-transform: uppercase;
  color: rgba(239,242,247,.80);
}
.badge-gold { background: var(--goldB); border-color: rgba(201,145,42,.22); color: rgba(232,184,77,.7); }
.hdr-r { display: flex; align-items: center; gap: 8px; }
.btn-sm {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 13px; border-radius: 8px;
  border: 1px solid var(--border); background: transparent;
  color: rgba(239,242,247,.80); font-family: 'Outfit', sans-serif;
  font-size: .76rem; cursor: pointer; transition: all .2s;
}
.btn-sm:hover { background: var(--surface2); color: var(--cream); }

/* ══════════════════════ LAYOUT ══════════════════════ */
.game-body { max-width: 1160px; margin: 0 auto; padding: 24px 24px 80px; width: 100%; }
.game-grid { display: grid; grid-template-columns: 1fr 300px; gap: 20px; align-items: start; }
.lcol, .rcol { display: flex; flex-direction: column; gap: 16px; }

/* ══════════════════════ PANEL ══════════════════════ */
.panel {
  background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 20px; backdrop-filter: blur(10px);
  box-shadow: 0 4px 24px rgba(0,0,0,.3);
}
.panel-gold { border-color: rgba(201,145,42,.2); }
.ptitle {
  font-size: .62rem; font-weight: 600; letter-spacing: 2.5px;
  text-transform: uppercase; color: rgba(239,242,247,.62);
  margin-bottom: 14px; display: block;
}

/* ══════════════════════ TIMER ══════════════════════ */
.start-btn {
  width: 100%; padding: 16px; border: none; border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--gold), var(--gold2));
  color: var(--ink); font-family: 'Outfit', sans-serif;
  font-size: 1rem; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  box-shadow: 0 4px 24px rgba(201,145,42,.4);
  transition: all .2s; animation: glow 3s ease infinite; letter-spacing: .3px;
}
.start-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(201,145,42,.55); }
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
  padding: 14px; background: rgba(255,255,255,.04);
  border-radius: 12px; border: 1px solid var(--border);
}
.ring-area.urgent { animation: urgentBg 1s ease infinite; }
.ring-wrap { position: relative; width: 80px; height: 80px; flex-shrink: 0; }
.rsv { transform: rotate(-90deg); }
.rt { fill: none; stroke: rgba(255,255,255,.05); stroke-width: 6; }
.rp { fill: none; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 1s linear, stroke .3s; }
.rnum { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: 'Cormorant Garamond', serif; font-size: 1.7rem; color: var(--cream); }
.rnum.urgent { color: #e74c3c; }
.rtxt { flex: 1; }
.rstatus { font-size: .72rem; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 3px; color: rgba(239,242,247,.72); }
.rstatus.warn { color: #e67e22; } .rstatus.danger { color: #e74c3c; }
.rhint { font-size: .7rem; color: rgba(239,242,247,.52); margin-top: 3px; }
.btn-stop { margin-top: 8px; padding: 6px 12px; border-radius: 7px; border: 1px solid var(--border2); background: transparent; color: rgba(239,242,247,.75); font-family: 'Outfit', sans-serif; font-size: .73rem; cursor: pointer; transition: all .2s; }
.btn-stop:hover { background: var(--surface2); color: var(--cream); }
.waiting-hint { font-size: .8rem; color: rgba(239,242,247,.54); font-style: italic; text-align: center; padding: 8px 0; }

/* ══════════════════════ PLAYING CARDS ══════════════════════ */
.cards-grid { display: flex; flex-wrap: wrap; gap: 12px; padding: 4px 0; }
.pcard {
  width: 96px; height: 136px; position: relative;
  cursor: pointer; user-select: none;
  animation: dealIn .35s ease both;
  transition: transform .2s cubic-bezier(.34,1.56,.64,1), filter .2s;
}
.pcard:hover:not(.locked) { transform: translateY(-16px) scale(1.06); filter: drop-shadow(0 22px 18px rgba(0,0,0,.55)); }
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
.pcard-num      { font-family: 'Cormorant Garamond', serif; font-size: .95rem; font-weight: 700; color: #1a1208; line-height: 1; }
.pcard-suit-sm  { font-size: .78rem; line-height: 1; margin-top: 2px; }
.pcard-center   { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; }
.pcard-bignum   { font-family: 'Cormorant Garamond', serif; font-size: 2.6rem; font-weight: 700; line-height: 1; color: #1a1208; }
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
  font-family: 'Cormorant Garamond', serif;
  font-size: 5.5rem; color: var(--gold2); font-weight: 700;
  line-height: 1; text-shadow: 0 0 50px rgba(201,145,42,.45);
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
.avg-hero-stat .v { font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; color: var(--cream); font-weight: 700; }
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
.rv-val { font-family: 'Cormorant Garamond', serif; font-size: 2rem; font-weight: 700; color: var(--ink); }
.rv-val.red { color: #b01020; }
.rv-name { font-size: .68rem; color: rgba(239,242,247,.84); text-align: center; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.rv-you-tag { font-size: .58rem; color: var(--gold2); font-weight: 700; letter-spacing: .3px; }
.outlier-tag { font-size: .55rem; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; padding: 2px 7px; border-radius: 4px; }
.outlier-tag.high { background: rgba(231,76,60,.18); color: #e74c3c; }
.outlier-tag.low  { background: rgba(52,152,219,.18); color: #3498db; }
.no-vote { text-align: center; color: rgba(239,242,247,.67); font-size: .77rem; padding: 6px 0; }

/* ══════════════════════ OBSERVER CONTROLS ══════════════════════ */
.obs-controls { display: flex; flex-direction: column; gap: 10px; }
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
  background: rgba(39,174,96,.1); border: 1px solid rgba(39,174,96,.25);
  color: #2ecc71; font-family: 'Outfit', sans-serif; font-size: .86rem; font-weight: 600;
  cursor: pointer; transition: all .2s;
  display: flex; align-items: center; justify-content: center; gap: 7px;
}
.btn-next-round:hover { background: rgba(39,174,96,.18); border-color: rgba(39,174,96,.45); }
.btn-new-session {
  padding: 13px 14px; border-radius: var(--radius-sm);
  background: rgba(192,57,43,.08); border: 1px solid rgba(192,57,43,.18);
  color: rgba(231,76,60,.65); font-family: 'Outfit', sans-serif;
  font-size: .86rem; font-weight: 600; cursor: pointer; transition: all .2s;
  display: flex; align-items: center; justify-content: center; gap: 7px; white-space: nowrap;
}
.btn-new-session:hover { background: rgba(192,57,43,.15); border-color: rgba(192,57,43,.35); color: #e74c3c; }
.btn-hint { font-size: .6rem; color: rgba(239,242,247,.50); text-align: center; margin-top: 1px; font-style: italic; }
.btn-end-session {
  width: 100%; padding: 12px 16px; border-radius: var(--radius-sm);
  background: transparent; border: 1px solid rgba(192,57,43,.2);
  color: rgba(231,76,60,.55); font-family: 'Outfit', sans-serif;
  font-size: .84rem; font-weight: 500; cursor: pointer; transition: all .2s;
  display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 2px;
}
.btn-end-session:hover { background: rgba(192,57,43,.1); border-color: rgba(192,57,43,.35); color: #e74c3c; }
.end-session-hint { font-size: .58rem; color: rgba(239,242,247,.45); text-align: center; margin-top: 3px; font-style: italic; }

/* Story queue panel */
.story-panel { background: rgba(255,255,255,.04); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 10px; }
.story-panel-title { font-size: .65rem; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: rgba(239,242,247,.65); margin-bottom: 10px; }
.story-active { font-size: .92rem; font-weight: 600; color: var(--cream); margin-bottom: 6px; line-height: 1.35; }
.story-progress { font-size: .68rem; color: rgba(239,242,247,.65); margin-bottom: 10px; }
.story-add-row { display: flex; gap: 6px; margin-bottom: 8px; }
.story-inp { flex: 1; padding: 8px 10px; background: rgba(255,255,255,.07); border: 1px solid var(--border2); border-radius: 8px; color: var(--cream); font-family: 'Outfit', sans-serif; font-size: .8rem; transition: border-color .2s, background .2s; }
.story-inp::placeholder { color: rgba(239,242,247,.50); }
.story-inp:focus { outline: none; border-color: var(--gold2); background: rgba(255,255,255,.10); }
.btn-story-add { padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(201,145,42,.25); background: var(--goldB); color: var(--gold2); font-family: 'Outfit', sans-serif; font-size: .78rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all .2s; }
.btn-story-add:hover { background: rgba(201,145,42,.18); }
.story-list { max-height: 100px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
.story-item { font-size: .75rem; padding: 4px 8px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
.story-item.done { color: rgba(239,242,247,.62); text-decoration: line-through; }
.story-item.active { background: var(--goldB); color: var(--gold2); font-weight: 600; }
.story-item.queued { color: rgba(239,242,247,.75); }
.story-est { font-size: .68rem; opacity: .7; }
.btn-record-next { width: 100%; padding: 11px; border-radius: var(--radius-sm); border: none; background: linear-gradient(135deg, rgba(39,174,96,.7), rgba(39,174,96,.5)); color: #fff; font-family: 'Outfit', sans-serif; font-size: .82rem; font-weight: 600; cursor: pointer; transition: all .2s; margin-top: 4px; }
.btn-record-next:hover { background: linear-gradient(135deg, rgba(39,174,96,.85), rgba(39,174,96,.65)); }
.btn-record-next:disabled { opacity: .3; cursor: not-allowed; }
.story-name-banner { background: rgba(201,145,42,.07); border: 1px solid rgba(201,145,42,.15); border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 12px; }
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
  font-family: 'Cormorant Garamond', serif; font-weight: 700; font-size: .95rem;
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
.ss-v { font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; color: var(--gold2); font-weight: 700; }
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

/* ══════════════════════ INVITE ══════════════════════ */
.inv-panel { border-style: dashed; border-color: rgba(255,255,255,.07); }
.inv-url { background: rgba(255,255,255,.06); border-radius: 8px; padding: 9px 12px; font-family: monospace; font-size: .7rem; color: rgba(239,242,247,.78); word-break: break-all; margin-bottom: 10px; border: 1px solid var(--border2); }
.btn-inv { width: 100%; padding: 10px; background: var(--goldB); border: 1px solid rgba(201,145,42,.2); border-radius: 9px; color: var(--gold2); font-family: 'Outfit', sans-serif; font-size: .82rem; font-weight: 600; cursor: pointer; transition: all .2s; }
.btn-inv:hover { background: rgba(201,145,42,.14); }

/* ══════════════════════ TOAST ══════════════════════ */
.toast {
  position: fixed; bottom: 28px; left: 50%;
  transform: translateX(-50%) translateY(70px);
  background: #f0ead8; color: var(--ink);
  border-radius: 12px; padding: 12px 22px;
  font-size: .86rem; font-weight: 600;
  box-shadow: 0 10px 40px rgba(0,0,0,.5);
  border: 1px solid rgba(201,145,42,.25);
  z-index: 500; white-space: nowrap;
  transition: transform .32s cubic-bezier(.34,1.56,.64,1), opacity .3s; opacity: 0;
}
.toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }

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
  background: linear-gradient(160deg, rgba(14,32,18,.99) 0%, rgba(7,14,8,1) 100%);
  border: 1px solid rgba(201,146,42,.3);
  border-radius: 24px; padding: 40px 36px 36px;
  box-shadow: 0 40px 100px rgba(0,0,0,.8), inset 0 1px 0 rgba(201,146,42,.12);
  position: relative; animation: fadeUp .3s ease;
}
.pricing-modal::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--gold), var(--gold3), var(--gold), transparent);
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
  font-family: 'Cormorant Garamond', serif;
  font-size: 2rem; font-weight: 700; color: var(--gold2);
  text-align: center; margin-bottom: 4px;
}
.pricing-sub {
  text-align: center; color: rgba(239,242,247,.65);
  font-size: .82rem; margin-bottom: 24px; font-weight: 300;
}
/* Currency switcher */
.currency-row {
  display: flex; justify-content: center; gap: 6px; margin-bottom: 28px;
}
.currency-btn {
  padding: 7px 18px; border-radius: 100px;
  border: 1px solid var(--border); background: transparent;
  color: rgba(239,242,247,.65); font-family: 'Outfit', sans-serif;
  font-size: .82rem; font-weight: 500; cursor: pointer; transition: all .2s;
}
.currency-btn.active {
  background: var(--goldB); border-color: rgba(201,146,42,.4);
  color: var(--gold2); font-weight: 600;
}
.currency-btn:hover:not(.active) { background: var(--surface2); color: var(--cream); border-color: var(--border2); }
/* Pricing cards */
.pricing-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.pricing-card {
  border: 1px solid var(--border2); border-radius: 18px;
  padding: 28px 22px 24px; background: var(--surface);
  display: flex; flex-direction: column; gap: 0; position: relative;
  transition: border-color .2s;
}
.pricing-card.pro {
  border-color: rgba(201,146,42,.45);
  background: linear-gradient(160deg, rgba(201,146,42,.08), rgba(201,146,42,.03));
  box-shadow: 0 0 40px rgba(201,146,42,.1);
}
.pricing-badge {
  position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
  background: linear-gradient(135deg, var(--gold), var(--gold2));
  color: var(--ink); font-size: .65rem; font-weight: 700;
  letter-spacing: 1.5px; text-transform: uppercase;
  padding: 4px 14px; border-radius: 100px; white-space: nowrap;
}
.pricing-tier { font-size: .68rem; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: rgba(239,242,247,.60); margin-bottom: 10px; }
.pricing-card.pro .pricing-tier { color: var(--gold2); }
.pricing-price { margin-bottom: 6px; display: flex; align-items: baseline; gap: 4px; }
.pricing-amount { font-family: 'Cormorant Garamond', serif; font-size: 3rem; font-weight: 700; color: var(--cream); line-height: 1; }
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
.pricing-cta.pro-cta {
  background: linear-gradient(135deg, var(--gold), var(--gold2));
  color: var(--ink); border: none;
  box-shadow: 0 4px 20px rgba(201,146,42,.35);
}
.pricing-cta.pro-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(201,146,42,.5); }
.pricing-footer { text-align: center; font-size: .72rem; color: rgba(239,242,247,.45); line-height: 1.6; }
.pricing-footer a { color: var(--gold2); text-decoration: none; }
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
`;

/* ═══════════════════════ ROOM CONFIG ═══════════════════════ */
// Dynamic rooms: each Create generates a unique 5-char code.
// URL is updated via replaceState so links can be shared directly.
const FREE_MAX_PLAYERS = 6;   // Free tier: small team trial
const PRO_MAX_PLAYERS  = 20;  // Pro tier: full team + stakeholders
const SESSION_MAX_MS = 3 * 60 * 60 * 1000;
const SESSION_WARN_MS = SESSION_MAX_MS - 10 * 60 * 1000;

// ── FOUNDER DETECTION ────────────────────────────────────────
// Stored encoded so the team code isn't readable as plain text
// in the compiled bundle. Not a guarantee, but raises the bar.
// Encoded value is: btoa("<teamCode>") — never commit the raw name.
const _FC = ["cnBhLWJ1aWxkLXRlYW0="]; // rpa-build-team
const isFounderRoom = (code) => {
  try { return _FC.some(h => atob(h) === code.toLowerCase()); }
  catch { return false; }
};

/* ═══════════════════════ MAIN APP ═══════════════════════ */
export default function App() {
  const [screen, setScreen] = useState("join");
  const [myId] = useState(uid);
  const [myRole, setMyRole] = useState("voter");
  // Initialise room code and team name synchronously from the URL so JoinScreen
  // receives the correct prefill on the very first render — no flash or double-update.
  // ?room=CODE  → Join Room tab pre-filled with code
  // ?team=NAME  → Team Room tab pre-filled with team name
  const [code, setCode] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get("room");
    return r ? r.toUpperCase() : "";
  });
  const [prefillTeam] = useState(() => {
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

  // ── STABLE REFS ──────────────────────────────────────────────────
  // roomDataRef: always holds the latest roomData for use in goBack /
  // beforeunload handlers without creating stale closures.
  const roomDataRef = useRef(null);
  useEffect(() => {
    roomDataRef.current = roomData;
  }, [roomData]);

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
          showToast("🃏 All voted — revealing cards!");
        }
      }, 700);
    }
    return () => clearTimeout(autoRevealRef.current);
  }, [roomData, code]); // eslint-disable-line

  // Store createdAt in a ref so the interval always has the real value,
  // not a snapshot from when the effect last ran.
  const createdAtRef = useRef(null);
  useEffect(() => {
    if (roomData?.createdAt) createdAtRef.current = roomData.createdAt;
  }, [roomData?.createdAt]); // eslint-disable-line

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
        await remove(ref(db, `rooms/${code}`));
        setScreen("join");
        setRoomData(null);
        setSessionWarning(false);
        showToast("⏰ Session ended after 3 hours. See you next sprint!");
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
    window.history.replaceState({}, "", window.location.pathname);
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

  const showToast = useCallback((msg) => {
    setToast(msg);
    setToastOn(true);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastOn(false), 3400);
  }, []);

  const handleCreate = async (name, role, deck = "fibonacci") => {
    const c = mkCode();
    setMyRole(role);
    setCode(c);
    await set(ref(db, `rooms/${c}`), {
      createdAt: serverTimestamp(),
      revealed: false,
      round: 1,
      storiesDone: 0,
      deck,
      plan: "free",
      timer: { running: false, duration: 30, remaining: 30 },
      players: { [myId]: { id: myId, name, role, voted: false, vote: null } },
    });

    // Server-side cleanup if browser crashes (power loss, mobile tab kill).
    onDisconnect(ref(db, `rooms/${c}/players/${myId}`)).remove();

    // Update URL so the creator can copy/share the link immediately.
    window.history.replaceState({}, "", `?room=${c}`);
    setScreen("game");
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
    const currentCount = Object.keys(data.players || {}).length;
    const maxForPlan = data.plan === "pro" ? PRO_MAX_PLAYERS : FREE_MAX_PLAYERS;
    if (currentCount >= maxForPlan) {
      if (data.plan !== "pro") {
        showToast(`Room full (free tier: ${FREE_MAX_PLAYERS} max). The host can upgrade to Pro for up to ${PRO_MAX_PLAYERS}.`);
      } else {
        showToast(`This room is full (max ${PRO_MAX_PLAYERS} participants).`);
      }
      return;
    }
    setMyRole(role);
    setCode(c);
    await update(ref(db, `rooms/${c}/players/${myId}`), {
      id: myId,
      name,
      role,
      voted: false,
      vote: null,
    });
    onDisconnect(ref(db, `rooms/${c}/players/${myId}`)).remove();
    window.history.replaceState({}, "", `?room=${c}`);
    setScreen("game");
    showToast(`🎲 Welcome, ${name}!`);
  };

  // ── TEAM ROOM ─────────────────────────────────────────────────────
  // Team rooms use a stable code derived from the team name so the same
  // team always lands in the same room without needing to share a link.
  // The room is created fresh if nobody is there, or joined if active.
  const handleTeamRoom = async (name, role, teamName, deck = "fibonacci") => {
    const c = teamCode(teamName);
    // Team Room is a Pro feature. Founder team is always Pro.
    // All other team rooms are set to Pro for now — Stripe will gate
    // creation at Phase 3 once payment is wired up.
    const plan = "pro";
    const snap = await new Promise((res) =>
      onValue(ref(db, `rooms/${c}`), res, { onlyOnce: true }),
    );
    const existingPlan = snap.exists() ? (snap.val().plan || "pro") : plan;
    const currentCount = snap.exists()
      ? Object.keys(snap.val().players || {}).length
      : 0;
    const maxForPlan = existingPlan === "pro" ? PRO_MAX_PLAYERS : FREE_MAX_PLAYERS;
    if (currentCount >= maxForPlan) {
      showToast(`This room is full (max ${maxForPlan} participants).`);
      return;
    }
    setMyRole(role);
    setCode(c);
    if (!snap.exists()) {
      await set(ref(db, `rooms/${c}`), {
        createdAt: serverTimestamp(),
        revealed: false,
        round: 1,
        storiesDone: 0,
        deck,
        plan,
        teamName,
        founderRoom: isFounderRoom(c),
        timer: { running: false, duration: 30, remaining: 30 },
        players: { [myId]: { id: myId, name, role, voted: false, vote: null } },
      });
    } else {
      await update(ref(db, `rooms/${c}/players/${myId}`), {
        id: myId, name, role, voted: false, vote: null,
      });
    }
    onDisconnect(ref(db, `rooms/${c}/players/${myId}`)).remove();
    // Use ?team= so shared links open the Team Room tab with the name pre-filled,
    // rather than dropping teammates on the Join tab with a raw code.
    window.history.replaceState({}, "", `?team=${encodeURIComponent(teamName)}`);
    setScreen("game");
    showToast(`🎲 Welcome to ${teamName}!`);
  };

  const selectCard = useCallback(
    async (val) => {
      if (!roomData || roomData.revealed) return;
      const cur = roomData.players?.[myId]?.vote;
      const nv = cur === val ? null : val;
      await update(ref(db, `rooms/${code}/players/${myId}`), {
        voted: !!nv,
        vote: nv,
      });
    },
    [roomData, code, myId],
  );

  const revealVotes = useCallback(async () => {
    await update(ref(db, `rooms/${code}`), { revealed: true });
    await update(ref(db, `rooms/${code}/timer`), { running: false });
  }, [code]);

  const newRound = useCallback(async () => {
    const players = roomData?.players || {};
    const upd = {};
    Object.keys(players).forEach((id) => {
      upd[`rooms/${code}/players/${id}/voted`] = false;
      upd[`rooms/${code}/players/${id}/vote`] = null;
    });
    upd[`rooms/${code}/revealed`] = false;
    upd[`rooms/${code}/round`] = (roomData?.round || 1) + 1;
    upd[`rooms/${code}/storiesDone`] = (roomData?.storiesDone || 0) + 1;
    upd[`rooms/${code}/timer/running`] = false;
    upd[`rooms/${code}/timer/remaining`] = roomData?.timer?.duration || 30;
    await update(ref(db), upd);
    showToast("✅ Story done! Vote on the next user story.");
  }, [code, roomData, showToast]);

  // ── STORY QUEUE ───────────────────────────────────────────────────
  // Stories can be added at any time before or during a session.
  // Stored in Firebase so all players see the active story name live.
  const addStory = useCallback(async (name) => {
    // Firebase returns stories as {0:{...}, 1:{...}} — an object, not an array.
    // .length on an object is undefined, so use Object.keys to get the count.
    const current = roomData?.stories || {};
    const idx = Object.keys(current).length;
    await update(ref(db, `rooms/${code}/stories/${idx}`), {
      name: name.trim(),
      estimate: null,
    });
  }, [code, roomData]);

  const recordAndNextStory = useCallback(async (estimate) => {
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
    upd[`rooms/${code}/timer/running`] = false;
    upd[`rooms/${code}/timer/remaining`] = roomData?.timer?.duration || 30;
    await update(ref(db), upd);
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
    upd[`rooms/${code}/timer/running`] = false;
    upd[`rooms/${code}/timer/remaining`] = roomData?.timer?.duration || 30;
    await update(ref(db), upd);
    showToast("🔄 New sprint session — everyone's votes cleared.");
  }, [code, roomData, showToast]);

  const endSession = useCallback(async () => {
    // Explicitly clear the local timer interval before tearing down the room.
    // Without this, the interval could fire one more tick after the room is
    // deleted, resulting in a harmless but unnecessary Firebase write attempt.
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    remainingRef.current = null;
    clearInterval(sessionCheckRef.current);
    await remove(ref(db, `rooms/${code}`));
    setScreen("join");
    setRoomData(null);
    setSessionWarning(false);
  }, [code]);

  const startTimer = useCallback(
    async (sec) => {
      await update(ref(db, `rooms/${code}/timer`), {
        running: true,
        duration: sec,
        remaining: sec,
        startedBy: myId,
      });
    },
    [code, myId],
  );

  const stopTimer = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    remainingRef.current = null;
    await update(ref(db, `rooms/${code}/timer`), { running: false });
  }, [code]);

  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {screen === "join" && (
          <JoinScreen
            onCreate={handleCreate}
            onJoin={handleJoin}
            onTeamRoom={handleTeamRoom}
            prefillCode={code}
            prefillTeam={prefillTeam}
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
          />
        )}
        <div className={`toast${toastOn ? " show" : ""}`}>{toast}</div>
      </div>
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
const PARTICLE_COUNT = 120;
const GRAVITY = 0.25;
const DRAG = 0.985;

function Confetti({ onDone }) {
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

    // Spawn particles from top-centre, two angled cannons
    const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const fromLeft = i < PARTICLE_COUNT / 2;
      const angle = fromLeft
        ? (Math.random() * 60 + 210) * (Math.PI / 180) // left cannon → right-upward
        : (Math.random() * 60 + 270) * (Math.PI / 180); // right cannon → left-upward
      const speed = Math.random() * 14 + 8;
      return {
        x: fromLeft ? canvas.width * 0.25 : canvas.width * 0.75,
        y: canvas.height * 0.35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: Math.random() * 10 + 6,
        h: Math.random() * 6 + 3,
        color:
          CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.25,
        alpha: 1,
        shape: Math.random() > 0.4 ? "rect" : "circle",
      };
    });

    let frame = 0;
    const FADE_START = 120; // ~2s at 60fps before alpha fade begins
    const TOTAL = 240; // ~4s total

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
  USD: { symbol: "$", free: "0", pro: "8",  proAnnual: "6"  },
  GBP: { symbol: "£", free: "0", pro: "6",  proAnnual: "5"  },
  EUR: { symbol: "€", free: "0", pro: "7",  proAnnual: "6"  },
};

function PricingModal({ onClose }) {
  const [currency, setCurrency] = useState("GBP");
  const p = PRICING[currency];

  const FREE_FEATURES = [
    { yes: true,  text: "Up to 6 participants per room"   },
    { yes: true,  text: "All card decks (Fibonacci, T-Shirt, Powers of 2)" },
    { yes: true,  text: "Story queue & results panel"     },
    { yes: true,  text: "New room link each session"      },
    { yes: false, text: "Team Room — persistent URL"      },
    { yes: false, text: "Up to 20 participants"           },
    { yes: false, text: "Unlimited stories per session"   },
    { yes: false, text: "Session summary export"          },
  ];

  const PRO_FEATURES = [
    { yes: true, text: "Everything in Free"                        },
    { yes: true, text: "Team Room — your own link, forever"        },
    { yes: true, text: "Up to 20 participants per room"            },
    { yes: true, text: "Unlimited stories per session"             },
    { yes: true, text: "Session summary — copy to clipboard"       },
    { yes: true, text: "All card decks & custom timer"             },
    { yes: true, text: "Priority support"                          },
  ];

  return (
    <div className="pricing-overlay" onClick={onClose}>
      <div className="pricing-modal" onClick={e => e.stopPropagation()}>
        <button className="pricing-close" onClick={onClose} aria-label="Close pricing">✕</button>

        <h2 className="pricing-title">Simple, Transparent Pricing</h2>
        <p className="pricing-sub">Start free. Upgrade when your team needs more.</p>

        {/* Currency switcher */}
        <div className="currency-row">
          {["USD", "GBP", "EUR"].map(c => (
            <button
              key={c}
              className={`currency-btn${currency === c ? " active" : ""}`}
              onClick={() => setCurrency(c)}
            >
              {c === "USD" ? "🇺🇸 USD" : c === "GBP" ? "🇬🇧 GBP" : "🇪🇺 EUR"}
            </button>
          ))}
        </div>

        {/* Pricing cards */}
        <div className="pricing-cards">
          {/* Free */}
          <div className="pricing-card">
            <div className="pricing-tier">Free</div>
            <div className="pricing-price">
              <span className="pricing-amount">{p.symbol}0</span>
              <span className="pricing-period">/ forever</span>
            </div>
            <p className="pricing-desc">Perfect for individuals or small teams trying it out.</p>
            <div className="pricing-features">
              {FREE_FEATURES.map((f, i) => (
                <div className="pricing-feature" key={i}>
                  <span className={`pf-icon ${f.yes ? "yes" : "no"}`}>{f.yes ? "✓" : "✕"}</span>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
            <button className="pricing-cta" onClick={onClose}>Get Started Free</button>
          </div>

          {/* Pro */}
          <div className="pricing-card pro">
            <span className="pricing-badge">Most Popular</span>
            <div className="pricing-tier">Pro</div>
            <div className="pricing-price">
              <span className="pricing-amount">{p.symbol}{p.pro}</span>
              <span className="pricing-period">/ month</span>
            </div>
            <p className="pricing-desc">
              One persistent URL for your team, forever. Save {p.symbol}{Number(p.pro) - Number(p.proAnnual)}/mo with annual billing.
            </p>
            <div className="pricing-features">
              {PRO_FEATURES.map((f, i) => (
                <div className="pricing-feature" key={i}>
                  <span className="pf-icon yes">✓</span>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
            <button className="pricing-cta pro-cta" onClick={onClose}>
              Start Free Trial — 14 days
            </button>
          </div>
        </div>

        <p className="pricing-footer">
          No credit card required for free tier · Cancel anytime · Prices ex. VAT<br />
          Questions? <a href={`mailto:${process.env.REACT_APP_SUPPORT_EMAIL || "support@planningpoker.app"}`}>Contact us</a>
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════ JOIN SCREEN ═══════════════════════ */
function JoinScreen({ onCreate, onJoin, onTeamRoom, prefillCode, prefillTeam }) {
  // Priority: ?team= → team tab, ?room= → join tab, otherwise → create tab
  const [tab, setTab] = useState(prefillTeam ? "team" : prefillCode ? "join" : "create");
  const [name, setName] = useState("");
  const [role, setRole] = useState("voter");
  const [deck, setDeck] = useState("fibonacci");
  const [rc, setRc] = useState(prefillCode || "");
  const [teamName, setTeamName] = useState(prefillTeam || "");
  const [err, setErr] = useState("");
  const [showPricing, setShowPricing] = useState(false);

  const clearErr = () => setErr("");
  // Live preview of the room code a team name would produce
  const previewCode = teamName.trim() ? teamCode(teamName.trim()) : null;

  const go = () => {
    if (!name.trim()) { setErr("Please enter your name"); return; }
    if (tab === "create") {
      onCreate(name.trim(), role, deck);
    } else if (tab === "join") {
      if (!rc.trim()) { setErr("Please enter a room code"); return; }
      onJoin(name.trim(), role, rc.trim().toUpperCase());
    } else {
      // team room
      if (!teamName.trim()) { setErr("Please enter your team name"); return; }
      onTeamRoom(name.trim(), role, teamName.trim(), deck);
    }
  };

  const ROLES = [
    { r: "voter",    icon: "🃏", l: "Participant", s: "Votes on each story"    },
    { r: "observer", icon: "👁", l: "Observer",    s: "Watches without voting" },
  ];

  return (
    <div className="join-wrap">
      <div className="join-box">
        <div className="join-suits">
          {["♠", "♥", "♣", "♦", "♠"].map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
        <h1 className="join-title">Planning Poker</h1>
        <p className="join-sub">Sprint Planning · Agile Estimation</p>

        {/* Pricing CTA */}
        <button className="btn-pricing" onClick={() => setShowPricing(true)}>
          ✦ See Pricing — Free &amp; Pro
        </button>

        {/* Pricing modal */}
        {showPricing && <PricingModal onClose={() => setShowPricing(false)} />}

        {/* Three-tab navigation */}
        <div className="tab-row">
          <button
            className={`tab-btn${tab === "create" ? " active" : ""}`}
            onClick={() => { setTab("create"); clearErr(); }}
          >
            Create Room
          </button>
          <button
            className={`tab-btn${tab === "join" ? " active" : ""}`}
            onClick={() => { setTab("join"); clearErr(); }}
          >
            Join Room
          </button>
          <button
            className={`tab-btn${tab === "team" ? " active" : ""}`}
            onClick={() => { setTab("team"); clearErr(); }}
          >
            Team Room
          </button>
        </div>

        {/* Your Name — always shown */}
        <label className="lbl">Your Name</label>
        <input
          className="inp"
          placeholder="e.g. Alex Johnson"
          value={name}
          onChange={(e) => { setName(e.target.value); clearErr(); }}
          onKeyDown={(e) => e.key === "Enter" && go()}
          autoFocus
        />

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
          <>
            <label className="lbl">Team Name</label>
            <input
              className="inp"
              placeholder="e.g. Product Team"
              value={teamName}
              onChange={(e) => { setTeamName(e.target.value); clearErr(); }}
              onKeyDown={(e) => e.key === "Enter" && go()}
            />
            {previewCode && (
              <div className="team-code-preview">
                <span className="tcp-label">Room code</span>
                <span className="tcp-code">{previewCode}</span>
              </div>
            )}
            <p style={{ fontSize: ".82rem", color: "rgba(239,242,247,.65)", marginBottom: "18px", lineHeight: 1.6 }}>
              Your team's permanent room. Anyone who types the same team name always joins the same space — no link sharing needed.
            </p>
          </>
        )}

        {/* Role picker — always shown */}
        <label className="lbl">Your Role</label>
        <div className="role-row">
          {ROLES.map(({ r, icon, l, s }) => (
            <button
              key={r}
              className={`role-btn${role === r ? (r === "voter" ? " rv" : " ro") : ""}`}
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
            : "Enter Team Room →"}
        </button>
        {tab === "create" && (
          <p style={{ fontSize: ".78rem", color: "rgba(239,242,247,.55)", textAlign: "center", marginTop: "10px" }}>
            Free · Up to {FREE_MAX_PLAYERS} participants · Share the link after creating
          </p>
        )}
        {tab === "team" && (
          <p style={{ fontSize: ".78rem", color: "rgba(239,242,247,.55)", textAlign: "center", marginTop: "10px" }}>
            Pro feature · Persistent team space · No link sharing needed
          </p>
        )}
      </div>

      {/* ── SEO content — rendered in DOM for Googlebot, visible to users ── */}
      <section className="seo-section" aria-label="About Planning Poker">
        <h2 className="seo-h2">Free Online Planning Poker — No Sign-up Required</h2>
        <p className="seo-intro">
          A fast, free planning poker tool for agile and scrum teams. Run story points estimation
          sessions in seconds — create a room, share the link, and start voting. No account needed.
        </p>

        <div className="seo-grid">
          <div className="seo-card">
            <h3 className="seo-h3">What Is Planning Poker?</h3>
            <p className="seo-p">
              Planning Poker (also called Scrum Poker) is a consensus-based estimation technique
              used by agile and scrum teams. Each team member votes on the complexity of a user story
              using Fibonacci cards (1, 2, 3, 5, 8, 13, 21, 34). Cards are revealed simultaneously
              to prevent anchoring bias and encourage honest, independent story points estimation.
            </p>
          </div>
          <div className="seo-card">
            <h3 className="seo-h3">How It Works</h3>
            <ol className="seo-ol">
              <li>Create a free room — no account required</li>
              <li>Share the room link with your sprint team</li>
              <li>Add your user stories to the queue</li>
              <li>Vote with Fibonacci, T-shirt, or Powers of 2 cards</li>
              <li>Reveal all votes simultaneously — discuss and agree on story points</li>
              <li>Move to the next story — estimates are saved automatically</li>
            </ol>
          </div>
        </div>

        <div className="seo-features">
          <h3 className="seo-h3">Why Teams Use This Planning Poker Tool</h3>
          <ul className="seo-ul">
            <li><strong>No signup, no friction</strong> — create a room and share the link in under 10 seconds</li>
            <li><strong>Real-time voting</strong> — all votes update live for every participant</li>
            <li><strong>Multiple card decks</strong> — Fibonacci sequence, T-shirt sizing (XS–XXL), or Powers of 2</li>
            <li><strong>Built-in countdown timer</strong> — keep estimation rounds focused and on track</li>
            <li><strong>Story queue</strong> — add your full backlog and work through each item in order</li>
            <li><strong>Session summary</strong> — copy all story point estimates at the end of your sprint planning</li>
            <li><strong>Works for remote teams</strong> — designed for distributed agile teams across any time zone</li>
            <li><strong>Team Room (Pro)</strong> — a persistent, shareable URL your team reuses every sprint</li>
          </ul>
        </div>

        <div className="seo-divider" role="separator"></div>

        <div className="seo-faq">
          <h3 className="seo-h3" style={{ textAlign: "center", marginBottom: "20px" }}>Frequently Asked Questions</h3>
          <div className="seo-faq-grid">
            <div className="seo-faq-item">
              <h4 className="seo-h4">Is this planning poker tool free?</h4>
              <p className="seo-p">
                Yes. The free tier supports up to {FREE_MAX_PLAYERS} participants per room, all card decks,
                a full story queue, and session summaries — no credit card or account required.
                Upgrade to Pro for a persistent Team Room and up to {PRO_MAX_PLAYERS} participants.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">Do I need to create an account?</h4>
              <p className="seo-p">
                No. Just enter your name, create a room, and share the link. There is no
                registration required to run a planning poker session.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">What is the Fibonacci sequence in planning poker?</h4>
              <p className="seo-p">
                The Fibonacci sequence (1, 2, 3, 5, 8, 13, 21, 34) is the most widely used
                card deck in planning poker. The growing gaps between numbers reflect the
                increasing uncertainty of larger user stories, making it easy for teams to
                distinguish small, medium, and large effort without false precision.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">Does this work for remote and distributed teams?</h4>
              <p className="seo-p">
                Yes. Share the room link in Slack, Teams, or Zoom and everyone joins instantly
                from any browser — no install required. Ideal for remote sprint planning across
                different time zones.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">What is T-shirt sizing in agile estimation?</h4>
              <p className="seo-p">
                T-shirt sizing uses XS, S, M, L, XL, XXL instead of numbers. It is useful
                early in a project when precise numeric estimates are not yet meaningful.
                This tool supports T-shirt sizing alongside Fibonacci and Powers of 2.
              </p>
            </div>
            <div className="seo-faq-item">
              <h4 className="seo-h4">How many people can join a planning poker session?</h4>
              <p className="seo-p">
                Free rooms support up to {FREE_MAX_PLAYERS} voters. Pro rooms support up to {PRO_MAX_PLAYERS}.
                Observers can join in addition to voters and do not count towards the limit.
              </p>
            </div>
          </div>
        </div>
      </section>
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
}) {
  const cards = getCards(deck);
  const [tsel, setTsel] = useState(30);
  const [storyInput, setStoryInput] = useState("");
  // Confetti fires once per consensus reveal, keyed by round number
  const [showConfetti, setShowConfetti] = useState(false);
  const [showConsensus, setShowConsensus] = useState(false);
  const confettiFiredForRoundRef = useRef(null);

  const players = Object.values(rd.players || {});
  const voters = players.filter((p) => p.role === "voter");
  const observers = players.filter((p) => p.role === "observer");
  const myVote = rd.players?.[myId]?.vote || null;
  const isObs = myRole === "observer";
  const revealed = rd.revealed || false;
  const round = rd.round || 1;
  const storiesDone = rd.storiesDone || 0;

  // Story queue — derived from Firebase room data
  const stories = rd.stories ? Object.values(rd.stories) : [];
  const activeStoryIdx = rd.activeStory ?? 0;
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

  const prog = timer.running ? timer.remaining / timer.duration : 1;
  const offset = CIRC * (1 - prog);
  const urgent = timer.remaining <= 5;
  const warn = timer.remaining <= 10 && !urgent;
  const ringClr = urgent ? "#e74c3c" : warn ? "#e67e22" : "var(--gold)";

  return (
    <>
      {/* Confetti — mounts when consensus detected, canvas self-destructs when done */}
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}
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
      <header className="hdr">
        <div className="hdr-in">
          <div className="hdr-l">
            <button className="btn-back" onClick={onBack}>
              ← Leave
            </button>
            <span className="logo-txt">Planning Poker</span>
          </div>
          <div className="hdr-c">
            <div className="badge">Round {round}</div>
            <div className="badge badge-gold">
              🎲 {storiesDone} stories estimated
            </div>
          </div>
          <div className="hdr-r">
            <button
              className="btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                toast("🔗 Link copied!");
              }}
            >
              🔗 Copy Link
            </button>
          </div>
        </div>
      </header>

      <div className="game-body">
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
                          Facilitator controls the reveal
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="waiting-hint">
                      {revealed
                        ? "✓ Cards revealed — results below"
                        : "Waiting for facilitator to start…"}
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
                      <div
                        key={c.val}
                        className={`pcard${c.red ? " red" : ""}${c.val === "?" ? " wild" : ""}${sel ? " sel" : ""}${revealed ? " locked" : ""}`}
                        style={{ animationDelay: `${i * 0.055}s` }}
                        onClick={() => !revealed && onCard(c.val)}
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
                      </div>
                    );
                  })}
                </div>
              )}
              {!isObs && (
                <div
                  className={`vstatus${myVote && !revealed ? " voted" : " wait"}`}
                  style={{ marginTop: 10 }}
                >
                  {myVote && !revealed
                    ? `✓ You picked ${myVote} — waiting for reveal…`
                    : !revealed
                      ? "Pick a card to cast your vote"
                      : ""}
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

            {/* Observer Controls */}
            {isObs && (
              <div className="obs-controls">
                {/* Story queue manager */}
                <div className="story-panel">
                  <div className="story-panel-title">📋 Story Queue</div>
                  <div className="story-add-row">
                    <input
                      className="story-inp"
                      placeholder="Add a story or ticket name…"
                      value={storyInput}
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

                {/* Record estimate and advance to next story */}
                {hasStories && !allStoriesDone && revealed && (
                  <button
                    className="btn-record-next"
                    onClick={() => onRecordStory(avgDisp !== "—" ? avgDisp : (allSame ? voted[0]?.vote : "?"))}
                  >
                    ✅ Record {avgDisp !== "—" ? `${avgDisp} pts` : "estimate"} &amp; Next Story
                  </button>
                )}

                <div className="obs-secondary-row">
                  <button className="btn-next-round" onClick={onNewRound}>
                    ↺ Next Round (no estimate)
                  </button>
                  <button className="btn-new-session" onClick={onReset}>
                    🔄 New Sprint
                  </button>
                </div>
                <div className="btn-hint">
                  "Next Round" re-votes same story · "New Sprint" resets all votes
                </div>
                <button className="btn-end-session" onClick={onEndSession}>
                  🔴 End Session — Disconnect Everyone
                </button>
                <div className="end-session-hint">
                  Deletes all data and sends everyone back to the home screen
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
                      <div className="prole">Observer · Facilitator</div>
                    </div>
                    <div className="pdot o" />
                  </div>
                ))}
              </div>
            </div>

            {/* Session Stats */}
            <div className="panel">
              <span className="ptitle">Session Stats</span>
              <div className="ss-grid">
                <div className="ss-chip">
                  <span className="ss-v">{storiesDone}</span>
                  <span className="ss-l">Stories Done</span>
                </div>
                <div className="ss-chip">
                  <span className="ss-v">{round}</span>
                  <span className="ss-l">Round</span>
                </div>
                <div className="ss-chip">
                  <span className="ss-v">{voters.length}</span>
                  <span className="ss-l">Participants</span>
                </div>
              </div>
            </div>

            {/* Invite */}
            <div className="panel inv-panel">
              <span className="ptitle">Invite Team</span>
              <div className="inv-url">{shareUrl}</div>
              <button
                className="btn-inv"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  toast("🔗 Link copied!");
                }}
              >
                🔗 Copy Invite Link
              </button>
            </div>

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
    </>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "./firebase";
import {
  ref,
  set,
  onValue,
  update,
  remove,
  serverTimestamp,
} from "firebase/database";

const CARDS = [
  { val: "1", suit: "♠", red: false },
  { val: "2", suit: "♣", red: false },
  { val: "3", suit: "♠", red: false },
  { val: "5", suit: "♥", red: true },
  { val: "8", suit: "♦", red: true },
  { val: "13", suit: "♣", red: false },
  { val: "?", suit: "★", red: false },
];
const CIRC = 201.1;
const uid = () => Math.random().toString(36).slice(2, 10);
// const mkCode = () => Math.random().toString(36).slice(2, 7).toUpperCase(); // re-enable for dynamic rooms
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
  --bg:       #080c0a;
  --bg2:      #0d1510;
  --surface:  rgba(255,255,255,0.035);
  --surface2: rgba(255,255,255,0.06);
  --border:   rgba(255,255,255,0.08);
  --border2:  rgba(255,255,255,0.14);
  --gold:     #c9912a;
  --gold2:    #e8b84b;
  --gold3:    #f5d07a;
  --goldA:    rgba(201,145,42,0.15);
  --goldB:    rgba(201,145,42,0.08);
  --cream:    #f0e6d0;
  --cream2:   #c9bba0;
  --red:      #c0392b;
  --green:    #27ae60;
  --blue:     #2980b9;
  --ink:      #0d1007;
  --card-bg:  #fdfaf3;
  --radius:   16px;
  --radius-sm:10px;
  --shadow:   0 20px 60px rgba(0,0,0,0.6);
}

html { font-size: 16px; }
body {
  font-family: 'Outfit', sans-serif;
  background: var(--bg);
  min-height: 100vh;
  color: var(--cream);
  overflow-x: hidden;
}

/* Subtle felt texture */
body::before {
  content: '';
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image:
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(20,60,30,0.5) 0%, transparent 60%),
    url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
  background-size: cover, 200px 200px;
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
@keyframes badgePop { 0% { transform:scale(0.7); opacity:0; } 70% { transform:scale(1.08); } 100% { transform:scale(1); opacity:1; } }

/* ══════════════════════ JOIN SCREEN ══════════════════════ */
.join-wrap {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 24px; animation: fadeIn .4s ease;
}
.join-box {
  width: 100%; max-width: 440px;
  background: linear-gradient(160deg, rgba(18,40,22,.97) 0%, rgba(8,14,10,.99) 100%);
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
  text-align: center; color: rgba(240,230,208,.35);
  font-size: .8rem; margin-bottom: 36px; font-weight: 300; letter-spacing: .5px;
}
.lbl {
  display: block; font-size: .65rem; font-weight: 600;
  letter-spacing: 2px; text-transform: uppercase;
  color: rgba(240,230,208,.35); margin-bottom: 8px;
}
.inp {
  width: 100%; padding: 13px 16px;
  background: rgba(0,0,0,.35); border: 1px solid var(--border2);
  border-radius: var(--radius-sm);
  font-family: 'Outfit', sans-serif; font-size: .95rem;
  color: var(--cream); outline: none; margin-bottom: 20px;
  transition: border-color .2s, box-shadow .2s;
}
.inp:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(201,145,42,.12); }
.inp::placeholder { color: rgba(240,230,208,.18); }
.role-row { display: flex; gap: 10px; margin-bottom: 28px; }
.role-btn {
  flex: 1; padding: 14px 8px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--surface);
  font-family: 'Outfit', sans-serif; font-size: .82rem; font-weight: 500;
  cursor: pointer; color: rgba(240,230,208,.45); transition: all .2s;
  display: flex; flex-direction: column; align-items: center; gap: 5px;
}
.role-btn .ri { font-size: 1.25rem; }
.role-btn .rl { font-weight: 600; font-size: .85rem; }
.role-btn .rs { font-size: .62rem; opacity: .55; font-weight: 300; }
.role-btn.rv { border-color: var(--gold); background: var(--goldB); color: var(--gold2); }
.role-btn.ro { border-color: rgba(41,128,185,.5); background: rgba(41,128,185,.08); color: #5dade2; }
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

/* ══════════════════════ HEADER ══════════════════════ */
.hdr {
  background: rgba(8,12,10,.92);
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
  color: rgba(240,230,208,.4); font-family: 'Outfit', sans-serif;
  font-size: .78rem; cursor: pointer; transition: all .2s;
}
.btn-back:hover { background: var(--surface2); color: var(--cream); border-color: var(--border2); }
.logo-txt {
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.3rem; font-weight: 700; color: var(--gold2); letter-spacing: .3px;
}
.hdr-c { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
.badge {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 100px; padding: 5px 12px;
  font-size: .68rem; letter-spacing: 1.5px; text-transform: uppercase;
  color: rgba(240,230,208,.3);
}
.badge-gold { background: var(--goldB); border-color: rgba(201,145,42,.22); color: rgba(232,184,77,.7); }
.hdr-r { display: flex; align-items: center; gap: 8px; }
.btn-sm {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 13px; border-radius: 8px;
  border: 1px solid var(--border); background: transparent;
  color: rgba(240,230,208,.45); font-family: 'Outfit', sans-serif;
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
  text-transform: uppercase; color: rgba(240,230,208,.28);
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
  background: rgba(0,0,0,.3); border: 1px solid rgba(201,145,42,.25);
  color: var(--gold2); border-radius: 8px;
  font-family: 'Outfit', sans-serif; font-size: .85rem;
  cursor: pointer; outline: none;
}
.tsel option { background: #0d1510; }
.ring-area {
  display: flex; align-items: center; gap: 16px;
  padding: 14px; background: rgba(0,0,0,.2);
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
.rstatus { font-size: .72rem; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 3px; color: rgba(240,230,208,.35); }
.rstatus.warn { color: #e67e22; } .rstatus.danger { color: #e74c3c; }
.rhint { font-size: .7rem; color: rgba(240,230,208,.2); margin-top: 3px; }
.btn-stop { margin-top: 8px; padding: 6px 12px; border-radius: 7px; border: 1px solid var(--border2); background: transparent; color: rgba(240,230,208,.4); font-family: 'Outfit', sans-serif; font-size: .73rem; cursor: pointer; transition: all .2s; }
.btn-stop:hover { background: var(--surface2); color: var(--cream); }
.waiting-hint { font-size: .8rem; color: rgba(240,230,208,.22); font-style: italic; text-align: center; padding: 8px 0; }

/* ══════════════════════ VOTE CARDS ══════════════════════ */
.cards-grid { display: flex; flex-wrap: wrap; gap: 12px; padding: 4px 0; }
.pcard {
  width: 80px; height: 114px; position: relative;
  cursor: pointer; user-select: none;
  animation: dealIn .35s ease both;
  transition: transform .2s cubic-bezier(.34,1.56,.64,1), filter .2s;
}
.pcard:hover:not(.locked) { transform: translateY(-14px) scale(1.06); filter: drop-shadow(0 20px 16px rgba(0,0,0,.55)); }
.pcard.sel { transform: translateY(-16px) scale(1.08); filter: drop-shadow(0 0 14px rgba(201,145,42,.9)) drop-shadow(0 18px 20px rgba(0,0,0,.6)); }
.pcard.locked { cursor: default; }
.pcard-inner {
  width: 100%; height: 100%;
  background: linear-gradient(160deg, #fff 0%, #fdf8ee 100%);
  border-radius: 10px; border: 1px solid rgba(0,0,0,.1);
  box-shadow: 0 2px 0 rgba(255,255,255,.9) inset, 0 8px 22px rgba(0,0,0,.4);
  position: relative; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  transition: background .15s;
}
.pcard.sel .pcard-inner { background: linear-gradient(160deg, #fffde8 0%, #fff8d0 100%); border-color: rgba(201,145,42,.6); box-shadow: 0 2px 0 rgba(255,255,255,.9) inset, 0 8px 22px rgba(0,0,0,.5), 0 0 0 2.5px rgba(201,145,42,.85); }
.pcard-tl { position: absolute; top: 6px; left: 7px; display: flex; flex-direction: column; align-items: center; line-height: 1; }
.pcard-br { position: absolute; bottom: 6px; right: 7px; display: flex; flex-direction: column; align-items: center; line-height: 1; transform: rotate(180deg); }
.pcard-num { font-family: 'Cormorant Garamond', serif; font-size: .78rem; font-weight: 700; color: #1a1208; line-height: 1; }
.pcard-suit-sm { font-size: .62rem; line-height: 1; margin-top: 1px; }
.pcard-center { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
.pcard-bignum { font-family: 'Cormorant Garamond', serif; font-size: 2rem; font-weight: 700; line-height: 1; color: #1a1208; }
.pcard-bigsuit { font-size: 1rem; line-height: 1; margin-top: 1px; }
.pcard.red .pcard-num, .pcard.red .pcard-bignum { color: #b01020; }
.pcard.red .pcard-suit-sm, .pcard.red .pcard-bigsuit { color: #b01020; }
.pcard:not(.red) .pcard-suit-sm, .pcard:not(.red) .pcard-bigsuit { color: #1a1208; }
.pcard.wild .pcard-bignum { font-size: 1.7rem; color: #6b3fa0; }
.pcard.wild .pcard-bigsuit { color: #6b3fa0; font-size: .85rem; }
.pcard.wild .pcard-num { color: #6b3fa0; }
.pcard.wild .pcard-suit-sm { color: #6b3fa0; }
.pcard.wild .pcard-inner { background: linear-gradient(160deg, #fdfaff 0%, #f5eeff 100%); }
.obs-box { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: rgba(41,128,185,.08); border: 1px solid rgba(41,128,185,.2); border-radius: 10px; color: #5dade2; font-size: .86rem; }
.vstatus { text-align: center; font-size: .82rem; padding: 8px 0; }
.vstatus.voted { color: rgba(201,145,42,.7); }
.vstatus.wait  { color: rgba(240,230,208,.2); font-style: italic; }

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
  text-transform: uppercase; color: rgba(240,230,208,.38); margin-bottom: 10px;
}
.avg-hero-num {
  font-family: 'Cormorant Garamond', serif;
  font-size: 5.5rem; color: var(--gold2); font-weight: 700;
  line-height: 1; text-shadow: 0 0 50px rgba(201,145,42,.45);
  animation: heroIn .5s ease;
}
.avg-hero-sub { font-size: .8rem; color: rgba(240,230,208,.4); margin-top: 10px; }
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
.avg-hero-stat .l { font-size: .58rem; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(240,230,208,.28); }

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
.rv-name { font-size: .68rem; color: rgba(240,230,208,.55); text-align: center; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.rv-you-tag { font-size: .58rem; color: var(--gold2); font-weight: 700; letter-spacing: .3px; }
.outlier-tag { font-size: .55rem; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; padding: 2px 7px; border-radius: 4px; }
.outlier-tag.high { background: rgba(231,76,60,.18); color: #e74c3c; }
.outlier-tag.low  { background: rgba(52,152,219,.18); color: #3498db; }
.no-vote { text-align: center; color: rgba(240,230,208,.32); font-size: .77rem; padding: 6px 0; }

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
.btn-hint { font-size: .6rem; color: rgba(240,230,208,.18); text-align: center; margin-top: 1px; font-style: italic; }
.btn-end-session {
  width: 100%; padding: 12px 16px; border-radius: var(--radius-sm);
  background: transparent; border: 1px solid rgba(192,57,43,.2);
  color: rgba(231,76,60,.55); font-family: 'Outfit', sans-serif;
  font-size: .84rem; font-weight: 500; cursor: pointer; transition: all .2s;
  display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 2px;
}
.btn-end-session:hover { background: rgba(192,57,43,.1); border-color: rgba(192,57,43,.35); color: #e74c3c; }
.end-session-hint { font-size: .58rem; color: rgba(240,230,208,.15); text-align: center; margin-top: 3px; font-style: italic; }

/* ══════════════════════ PLAYERS PANEL ══════════════════════ */
.vp-head { display: flex; justify-content: space-between; font-size: .7rem; color: rgba(240,230,208,.3); margin-bottom: 8px; }
.vp-bar { background: rgba(255,255,255,.05); border-radius: 100px; height: 4px; overflow: hidden; margin-bottom: 14px; }
.vp-fill { height: 100%; border-radius: 100px; background: linear-gradient(90deg, var(--gold), var(--gold2)); transition: width .5s ease; }
.plist { display: flex; flex-direction: column; gap: 6px; }
.prow {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 11px;
  background: rgba(255,255,255,.025); border: 1px solid var(--border);
  transition: all .3s;
}
.prow.voted { background: var(--goldB); border-color: rgba(201,145,42,.15); }
.prow.obs   { background: rgba(41,128,185,.07); border-color: rgba(41,128,185,.12); }
.prow.not-voted-yet { border-color: rgba(255,255,255,.04); opacity: .75; }
.prow.not-voted-yet .pav { background: rgba(255,255,255,.08); color: rgba(240,230,208,.4); }
.pav {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: .72rem; background: #2e6640; color: var(--cream);
}
.prow.voted .pav { background: var(--gold); color: var(--ink); }
.prow.obs   .pav { background: rgba(41,128,185,.4); }
.pname { font-size: .84rem; font-weight: 500; color: var(--cream2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prole { font-size: .64rem; color: rgba(240,230,208,.25); margin-top: 1px; }
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
.voted-label { font-size: .62rem; color: rgba(201,145,42,.7); font-weight: 600; }
.waiting-label { font-size: .62rem; color: rgba(231,76,60,.5); font-style: italic; }
.sep { border: none; border-top: 1px solid var(--border); margin: 6px 0; }
.nobody { font-size: .78rem; color: rgba(240,230,208,.18); font-style: italic; text-align: center; padding: 10px 0; }

/* ══════════════════════ SESSION STATS ══════════════════════ */
.ss-grid { display: flex; gap: 8px; }
.ss-chip {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 12px 8px; background: rgba(0,0,0,.2);
  border: 1px solid var(--border); border-radius: 10px;
}
.ss-v { font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; color: var(--gold2); font-weight: 700; }
.ss-l { font-size: .6rem; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(240,230,208,.25); text-align: center; }

/* ══════════════════════ SESSION WARNING ══════════════════════ */
.session-warn-banner {
  background: linear-gradient(135deg, rgba(230,126,34,.15), rgba(192,57,43,.1));
  border: 1px solid rgba(230,126,34,.35); border-radius: var(--radius-sm);
  padding: 12px 16px; display: flex; align-items: center; gap: 12px;
  animation: urgentBg 2s ease infinite; margin-bottom: 16px;
}
.session-warn-text { flex: 1; font-size: .8rem; color: rgba(240,230,208,.75); }
.session-warn-text strong { color: #e67e22; }

/* ══════════════════════ INVITE ══════════════════════ */
.inv-panel { border-style: dashed; border-color: rgba(255,255,255,.07); }
.inv-url { background: rgba(0,0,0,.2); border-radius: 8px; padding: 9px 12px; font-family: monospace; font-size: .7rem; color: rgba(240,230,208,.28); word-break: break-all; margin-bottom: 10px; border: 1px solid var(--border); }
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

/* ══════════════════════ RESPONSIVE ══════════════════════ */
@media (max-width: 780px) {
  .game-grid { grid-template-columns: 1fr; }
  .rcol { order: -1; }
  .hdr-c { order: 3; width: 100%; justify-content: center; padding-bottom: 6px; }
  .hdr-r { display: none; }
  .cards-grid { justify-content: center; }
  .pcard { width: 70px; height: 100px; }
  .pcard-bignum { font-size: 1.7rem; }
  .game-body { padding: 16px 16px 60px; }
  .obs-secondary-row { flex-direction: column; }
  .join-box { padding: 36px 24px 32px; }
}
@media (max-width: 420px) {
  .join-title { font-size: 2.1rem; }
  .pcard { width: 62px; height: 88px; }
  .avg-hero-num { font-size: 4rem; }
}
`;

/* ═══════════════════════ FIXED ROOM CONFIG ═══════════════════════ */
// FIXED ROOM MODE: Everyone joins the same room automatically.
// To re-enable dynamic rooms with shareable links:
//   1. Remove FIXED_ROOM_CODE constant below
//   2. Uncomment the URL param useEffect in App()
//   3. Uncomment window.history.replaceState in handleCreate, handleJoin, goBack
//   4. Restore the tab-row + room code input in JoinScreen
const FIXED_ROOM_CODE = "SPRINTROOM";
const SESSION_MAX_MS = 3 * 60 * 60 * 1000;
const SESSION_WARN_MS = SESSION_MAX_MS - 10 * 60 * 1000;

/* ═══════════════════════ MAIN APP ═══════════════════════ */
export default function App() {
  const [screen, setScreen] = useState("join");
  const [myId] = useState(uid);
  const [myRole, setMyRole] = useState("voter");
  const [code, setCode] = useState(FIXED_ROOM_CODE);
  const [roomData, setRoomData] = useState(null);
  const [toast, setToast] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const [timerIv, setTimerIv] = useState(null);
  const [sessionWarning, setSessionWarning] = useState(false);
  const toastRef = useRef(null);
  const sessionCheckRef = useRef(null);

  // DYNAMIC ROOM MODE (disabled) — uncomment to read room from URL:
  // useEffect(() => {
  //   const p = new URLSearchParams(window.location.search);
  //   const r = p.get("room");
  //   if (r) setCode(r.toUpperCase());
  // }, []);

  useEffect(() => {
    if (!code || screen !== "game") return;
    const unsub = onValue(ref(db, `rooms/${code}`), (snap) => {
      if (snap.exists()) setRoomData(snap.val());
      else {
        showToast("Room not found.");
        goBack();
      }
    });
    return () => unsub();
  }, [code, screen]); // eslint-disable-line

  useEffect(() => {
    if (!roomData?.timer?.running) {
      clearInterval(timerIv);
      setTimerIv(null);
      return;
    }
    if (roomData.timer.startedBy !== myId) return;
    if (timerIv) return;
    const iv = setInterval(async () => {
      const r = (roomData.timer.remaining ?? 1) - 1;
      if (r <= 0) {
        clearInterval(iv);
        setTimerIv(null);
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
    setTimerIv(iv);
    return () => clearInterval(iv);
  }, [roomData?.timer?.running, roomData?.timer?.startedBy, myId, code]); // eslint-disable-line

  useEffect(() => {
    if (!roomData || roomData.revealed) return;
    const voters = Object.values(roomData.players || {}).filter(
      (p) => p.role === "voter",
    );
    if (!voters.length) return;
    if (voters.every((p) => p.voted)) {
      setTimeout(async () => {
        const fresh = Object.values(roomData.players || {}).filter(
          (p) => p.role === "voter",
        );
        if (fresh.every((p) => p.voted) && !roomData.revealed) {
          await update(ref(db, `rooms/${code}`), { revealed: true });
          showToast("🃏 All voted — revealing cards!");
        }
      }, 700);
    }
  }, [roomData, code]); // eslint-disable-line

  useEffect(() => {
    if (screen !== "game" || !roomData?.createdAt) return;
    clearInterval(sessionCheckRef.current);
    sessionCheckRef.current = setInterval(async () => {
      const age = Date.now() - roomData.createdAt;
      if (age >= SESSION_MAX_MS) {
        clearInterval(sessionCheckRef.current);
        await remove(ref(db, `rooms/${code}`));
        setScreen("join");
        setRoomData(null);
        setSessionWarning(false);
        showToast("⏰ Session ended after 3 hours. See you next sprint!");
      } else if (age >= SESSION_WARN_MS && !sessionWarning) {
        setSessionWarning(true);
        showToast("⚠️ Session ending in ~10 minutes. Wrap up your planning!");
      }
    }, 60 * 1000);
    return () => clearInterval(sessionCheckRef.current);
  }, [screen, roomData?.createdAt, code, sessionWarning]); // eslint-disable-line

  const goBack = useCallback(() => {
    if (code && myId) remove(ref(db, `rooms/${code}/players/${myId}`));
    setScreen("join");
    setRoomData(null);
    // window.history.replaceState({}, "", window.location.pathname); // dynamic rooms
  }, [code, myId]);

  useEffect(() => {
    const cleanup = () => {
      if (code && myId) remove(ref(db, `rooms/${code}/players/${myId}`));
    };
    window.addEventListener("beforeunload", cleanup);
    return () => {
      cleanup();
      window.removeEventListener("beforeunload", cleanup);
    };
  }, [code, myId]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setToastOn(true);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastOn(false), 3400);
  }, []);

  const handleCreate = async (name, role) => {
    const c = FIXED_ROOM_CODE;
    setMyRole(role);
    setCode(c);
    const snap = await new Promise((res) =>
      onValue(ref(db, `rooms/${c}`), res, { onlyOnce: true }),
    );
    if (!snap.exists()) {
      await set(ref(db, `rooms/${c}`), {
        createdAt: serverTimestamp(),
        revealed: false,
        round: 1,
        storiesDone: 0,
        timer: { running: false, duration: 30, remaining: 30 },
        players: { [myId]: { id: myId, name, role, voted: false, vote: null } },
      });
    } else {
      await update(ref(db, `rooms/${c}/players/${myId}`), {
        id: myId,
        name,
        role,
        voted: false,
        vote: null,
      });
    }
    setScreen("game");
    showToast(`🎲 Welcome, ${name}!`);
  };

  const handleJoin = async (name, role, c) => {
    setMyRole(role);
    setCode(c);
    const snap = await new Promise((res) =>
      onValue(ref(db, `rooms/${c}`), res, { onlyOnce: true }),
    );
    if (!snap.exists()) {
      showToast(`Room "${c}" not found.`);
      return;
    }
    await update(ref(db, `rooms/${c}/players/${myId}`), {
      id: myId,
      name,
      role,
      voted: false,
      vote: null,
    });
    // window.history.replaceState({}, "", `?room=${c}`); // dynamic rooms
    setScreen("game");
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
    clearInterval(timerIv);
    setTimerIv(null);
    await update(ref(db, `rooms/${code}/timer`), { running: false });
  }, [code, timerIv]);

  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {screen === "join" && (
          <JoinScreen
            onCreate={handleCreate}
            onJoin={handleJoin}
            initCode={code}
          />
        )}
        {screen === "game" && !roomData && (
          <div className="loading">
            <div className="spinner" />
            <div style={{ color: "rgba(240,230,208,.28)", fontSize: ".88rem" }}>
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
            shareUrl={shareUrl}
            onBack={goBack}
            onCard={selectCard}
            onReveal={revealVotes}
            onNewRound={newRound}
            onReset={resetSession}
            onEndSession={endSession}
            onStart={startTimer}
            onStop={stopTimer}
            sessionWarning={sessionWarning}
            toast={showToast}
          />
        )}
        <div className={`toast${toastOn ? " show" : ""}`}>{toast}</div>
      </div>
    </>
  );
}

/* ═══════════════════════ JOIN SCREEN ═══════════════════════ */
// FIXED ROOM MODE: No room code needed — just name + role.
// To re-enable: restore tab-row, room code input, tab/rc state, and go() logic.
function JoinScreen({ onCreate }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("voter");
  const [err, setErr] = useState("");

  const go = () => {
    if (!name.trim()) {
      setErr("Please enter your name");
      return;
    }
    onCreate(name.trim(), role);
  };

  return (
    <div className="join-wrap">
      <div className="join-box">
        <div className="join-suits">
          {["♠", "♥", "♣", "♦", "♠"].map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
        <h1 className="join-title">Planning Poker</h1>
        <p className="join-sub">Sprint Planning · Enter your name to join</p>

        <label className="lbl">Your Name</label>
        <input
          className="inp"
          placeholder="e.g. Alex Chen"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErr("");
          }}
          onKeyDown={(e) => e.key === "Enter" && go()}
          autoFocus
        />

        <label className="lbl">Your Role</label>
        <div className="role-row">
          {[
            { r: "voter", icon: "🃏", l: "Voter", s: "Dev · QA · Designer" },
            {
              r: "observer",
              icon: "👁",
              l: "Observer",
              s: "SM · PO · BA · Coach",
            },
          ].map(({ r, icon, l, s }) => (
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

        {err && <div className="err">{err}</div>}
        <button className="btn-primary" onClick={go}>
          Join the Table →
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════ GAME SCREEN ═══════════════════════ */
function GameScreen({
  rd,
  myId,
  myRole,
  code,
  shareUrl,
  onBack,
  onCard,
  onReveal,
  onNewRound,
  onReset,
  onEndSession,
  onStart,
  onStop,
  sessionWarning,
  toast,
}) {
  const [tsel, setTsel] = useState(30);

  const players = Object.values(rd.players || {});
  const voters = players.filter((p) => p.role === "voter");
  const observers = players.filter((p) => p.role === "observer");
  const myVote = rd.players?.[myId]?.vote || null;
  const isObs = myRole === "observer";
  const revealed = rd.revealed || false;
  const round = rd.round || 1;
  const storiesDone = rd.storiesDone || 0;
  const timer = rd.timer || { running: false, duration: 30, remaining: 30 };
  const hasVotes = voters.some((p) => p.voted);
  const votedCount = voters.filter((p) => p.voted).length;
  const notVoted = voters.filter((p) => !p.voted);

  const voted = voters.filter((p) => p.voted);
  const nums = voted
    .map((p) => p.vote)
    .filter((v) => v !== "?")
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

  const prog = timer.running ? timer.remaining / timer.duration : 1;
  const offset = CIRC * (1 - prog);
  const urgent = timer.remaining <= 5;
  const warn = timer.remaining <= 10 && !urgent;
  const ringClr = urgent ? "#e74c3c" : warn ? "#e67e22" : "var(--gold)";

  return (
    <>
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
                            <option value={60}>60 seconds</option>
                          </select>
                        </div>
                      </div>
                      <button
                        className="start-btn"
                        onClick={() => onStart(tsel)}
                      >
                        <span>🃏</span> Start Voting — {tsel}s
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
                  {CARDS.map((c, i) => {
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
                        <div className="avg-hero-range">
                          <div className="avg-hero-stat">
                            <span className="v">{minV}</span>
                            <span className="l">Lowest</span>
                          </div>
                          <div className="avg-hero-stat">
                            <span
                              className="v"
                              style={{
                                color: "var(--gold2)",
                                fontSize: "1.8rem",
                              }}
                            >
                              {avgDisp}
                            </span>
                            <span className="l">Average</span>
                          </div>
                          <div className="avg-hero-stat">
                            <span className="v">{maxV}</span>
                            <span className="l">Highest</span>
                          </div>
                        </div>
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
                          CARDS.find((c) => c.val === p.vote)?.suit || "",
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
                <div className="obs-secondary-row">
                  <button className="btn-next-round" onClick={onNewRound}>
                    ✅ Story Done — Next Story
                  </button>
                  <button className="btn-new-session" onClick={onReset}>
                    🔄 New Sprint Session
                  </button>
                </div>
                <div className="btn-hint">
                  "Story Done" keeps the team, resets votes · "New Sprint"
                  resets everything
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
                  <span className="ss-l">Voters</span>
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
          </div>
        </div>
      </div>
    </>
  );
}

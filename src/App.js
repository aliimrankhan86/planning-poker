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
const mkCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const ini = (n = "") =>
  n
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();

/* ─────────────────────────── CSS ─────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --felt:#0b2115;--felt2:#081a0f;--rail:#183422;
  --gold:#c8962a;--gold2:#e9b84d;--goldA:rgba(200,150,42,0.15);
  --cream:#f4ecd8;--cream2:#e6d9bf;
  --red:#c0392b;--obs:#1a6b9a;
  --card:#fdfaf2;--ink:#18120a;
  --panel:rgba(15,35,20,0.75);
  --border:rgba(255,255,255,0.07);
}
html{font-size:16px}
body{font-family:'DM Sans',sans-serif;background:var(--felt2);min-height:100vh;color:var(--cream);overflow-x:hidden;
  background-image:
    radial-gradient(ellipse 140% 60% at 50% -10%,rgba(24,52,34,0.9) 0%,transparent 55%),
    repeating-linear-gradient(0deg,transparent,transparent 44px,rgba(255,255,255,.006) 44px,rgba(255,255,255,.006) 45px),
    repeating-linear-gradient(90deg,transparent,transparent 44px,rgba(255,255,255,.006) 44px,rgba(255,255,255,.006) 45px);
}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes flip{0%{transform:rotateY(90deg) scale(.85)}60%{transform:rotateY(-6deg) scale(1.02)}100%{transform:rotateY(0) scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes shimmer{0%{background-position:-300% center}100%{background-position:300% center}}
@keyframes glow{0%,100%{box-shadow:0 0 18px rgba(200,150,42,.3)}50%{box-shadow:0 0 40px rgba(200,150,42,.65),0 0 80px rgba(200,150,42,.2)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes urgentBg{0%,100%{background:rgba(192,57,43,.12)}50%{background:rgba(192,57,43,.28)}}
@keyframes dealIn{from{opacity:0;transform:translateY(-20px) scale(.88)}to{opacity:1;transform:translateY(0) scale(1)}}

/* ── APP ── */
.app{min-height:100vh;display:flex;flex-direction:column}

/* ── JOIN ── */
.join-wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .4s ease}
.join-box{
  width:100%;max-width:460px;
  background:linear-gradient(155deg,rgba(24,52,34,.96) 0%,rgba(11,33,21,.98) 100%);
  border:1px solid rgba(200,150,42,.35);border-radius:24px;
  padding:46px 38px 42px;
  box-shadow:0 40px 100px rgba(0,0,0,.65),inset 0 1px 0 rgba(200,150,42,.18);
  position:relative;overflow:hidden;animation:fadeUp .45s ease;
}
.join-box::before{
  content:'';position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,transparent,var(--gold),var(--gold2),var(--gold),transparent);
  background-size:300% auto;animation:shimmer 3s linear infinite;
}
.join-suits{display:flex;justify-content:center;gap:18px;margin-bottom:26px;font-size:1.55rem}
.join-suits span{opacity:.18}
.join-suits span:nth-child(2),.join-suits span:nth-child(4){color:var(--red)}
.join-title{font-family:'Playfair Display',serif;font-size:2.1rem;color:var(--gold2);text-align:center;margin-bottom:5px;letter-spacing:.5px}
.join-sub{text-align:center;color:rgba(244,236,216,.4);font-size:.84rem;margin-bottom:30px;font-weight:300}
.tab-row{display:flex;gap:4px;margin-bottom:26px;background:rgba(0,0,0,.35);border-radius:12px;padding:4px;border:1px solid rgba(255,255,255,.05)}
.tab-btn{flex:1;padding:10px;border:none;border-radius:9px;font-family:'DM Sans',sans-serif;font-size:.88rem;font-weight:600;cursor:pointer;transition:all .2s;background:transparent;color:rgba(244,236,216,.35)}
.tab-btn.on{background:var(--gold);color:var(--ink);box-shadow:0 2px 14px rgba(200,150,42,.4)}
.lbl{display:block;font-size:.67rem;font-weight:600;letter-spacing:1.9px;text-transform:uppercase;color:rgba(244,236,216,.38);margin-bottom:7px}
.inp{
  width:100%;padding:13px 16px;
  background:rgba(0,0,0,.32);border:1.5px solid rgba(255,255,255,.1);
  border-radius:12px;font-family:'DM Sans',sans-serif;font-size:.95rem;
  color:var(--cream);outline:none;margin-bottom:18px;transition:border-color .2s,box-shadow .2s;
}
.inp:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(200,150,42,.14)}
.inp::placeholder{color:rgba(244,236,216,.2)}
.role-row{display:flex;gap:8px;margin-bottom:24px}
.role-btn{
  flex:1;padding:12px 6px;border-radius:12px;
  border:1.5px solid rgba(255,255,255,.1);background:transparent;
  font-family:'DM Sans',sans-serif;font-size:.82rem;font-weight:500;
  cursor:pointer;color:rgba(244,236,216,.4);transition:all .2s;
  display:flex;flex-direction:column;align-items:center;gap:4px;
}
.role-btn .ri{font-size:1.3rem}
.role-btn .rl{font-weight:700}
.role-btn .rs{font-size:.63rem;opacity:.6;font-weight:300}
.role-btn.rv{border-color:var(--gold);background:rgba(200,150,42,.12);color:var(--gold2)}
.role-btn.ro{border-color:var(--obs);background:rgba(26,107,154,.14);color:#5dade2}
.err{color:#e74c3c;font-size:.8rem;margin-bottom:10px;text-align:center}
.btn-primary{
  width:100%;padding:15px;border:none;border-radius:13px;
  background:linear-gradient(135deg,var(--gold),var(--gold2));
  color:var(--ink);font-family:'DM Sans',sans-serif;font-size:.98rem;font-weight:700;
  cursor:pointer;letter-spacing:.4px;transition:all .2s;
  box-shadow:0 4px 22px rgba(200,150,42,.38);
}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 7px 30px rgba(200,150,42,.55)}
.btn-primary:active{transform:none}

/* ── HEADER ── */
.hdr{
  background:linear-gradient(180deg,rgba(11,33,21,.97),rgba(11,33,21,.9));
  border-bottom:1px solid rgba(200,150,42,.18);
  backdrop-filter:blur(14px);position:sticky;top:0;z-index:100;padding:0 20px;
}
.hdr-in{
  max-width:1120px;margin:0 auto;
  display:flex;align-items:center;justify-content:space-between;
  min-height:62px;gap:10px;flex-wrap:wrap;padding:10px 0;
}
.hdr-l{display:flex;align-items:center;gap:10px}
.btn-back{
  display:flex;align-items:center;gap:5px;
  padding:7px 13px;border-radius:8px;
  border:1px solid rgba(255,255,255,.1);background:transparent;
  color:rgba(244,236,216,.45);font-family:'DM Sans',sans-serif;
  font-size:.78rem;cursor:pointer;transition:all .2s;
}
.btn-back:hover{background:rgba(255,255,255,.07);color:var(--cream);border-color:rgba(255,255,255,.22)}
.logo-btn{
  font-family:'Playfair Display',serif;font-size:1.25rem;
  color:var(--gold);background:none;border:none;cursor:pointer;
  transition:color .2s;letter-spacing:.3px;
}
.logo-btn:hover{color:var(--gold2)}
.logo-btn span{color:var(--cream)}
.hdr-c{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center}
.room-badge{
  display:flex;align-items:center;gap:8px;
  background:rgba(0,0,0,.3);border:1px solid rgba(200,150,42,.22);
  border-radius:10px;padding:6px 14px;
}
.rl2{font-size:.63rem;letter-spacing:2px;text-transform:uppercase;color:rgba(244,236,216,.32)}
.rc{font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:700;color:var(--gold2);letter-spacing:4px}
.badge{
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);
  border-radius:100px;padding:5px 13px;
  font-size:.7rem;letter-spacing:1.8px;text-transform:uppercase;color:rgba(244,236,216,.32);
}
.badge-gold{background:rgba(200,150,42,.1);border-color:rgba(200,150,42,.2);color:rgba(232,184,77,.7)}
.hdr-r{display:flex;align-items:center;gap:8px}
.btn-sm{
  display:flex;align-items:center;gap:5px;
  padding:7px 14px;border-radius:9px;
  border:1px solid rgba(255,255,255,.12);background:transparent;
  color:rgba(244,236,216,.5);font-family:'DM Sans',sans-serif;
  font-size:.78rem;cursor:pointer;transition:all .2s;
}
.btn-sm:hover{background:rgba(255,255,255,.07);color:var(--cream)}

/* ── GAME ── */
.game-body{max-width:1120px;margin:0 auto;padding:22px 20px 60px;width:100%}
.game-grid{display:grid;grid-template-columns:1fr 310px;gap:18px;align-items:start}
.lcol,.rcol{display:flex;flex-direction:column;gap:16px}

/* ── PANEL ── */
.panel{
  background:linear-gradient(155deg,rgba(20,48,28,.72),rgba(11,33,21,.72));
  border:1px solid var(--border);border-radius:18px;padding:20px;
  backdrop-filter:blur(10px);box-shadow:0 8px 30px rgba(0,0,0,.28);
}
.panel-gold{border-color:rgba(200,150,42,.22)}
.ptitle{font-size:.66rem;font-weight:600;letter-spacing:2.3px;text-transform:uppercase;color:rgba(244,236,216,.32);margin-bottom:15px;display:block}

/* ── START BTN ── */
.start-btn{
  width:100%;padding:18px;border:none;border-radius:14px;
  background:linear-gradient(135deg,var(--gold),var(--gold2));
  color:var(--ink);font-family:'DM Sans',sans-serif;font-size:1.05rem;font-weight:700;
  cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;
  box-shadow:0 4px 24px rgba(200,150,42,.42);
  transition:all .2s;animation:glow 2.8s ease infinite;letter-spacing:.3px;
}
.start-btn:hover{transform:translateY(-2px);box-shadow:0 8px 34px rgba(200,150,42,.58)}
.start-btn:active{transform:none}
.start-btn .ico{font-size:1.25rem}

/* ── TIMER SELECT ── */
.tsel-row{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.tsel-wrap{position:relative}
.tsel-wrap::after{content:'▾';position:absolute;right:11px;top:50%;transform:translateY(-50%);color:var(--gold);font-size:.74rem;pointer-events:none}
.tsel{
  appearance:none;padding:9px 32px 9px 13px;
  background:rgba(0,0,0,.3);border:1.5px solid rgba(200,150,42,.28);
  color:var(--gold2);border-radius:10px;
  font-family:'DM Sans',sans-serif;font-size:.87rem;font-weight:500;
  cursor:pointer;outline:none;transition:border-color .2s;
}
.tsel:hover{border-color:var(--gold)}
.tsel option{background:#0b2115}
.tsel:disabled{opacity:.4;cursor:not-allowed}

/* ── RING ── */
.ring-area{
  display:flex;align-items:center;gap:18px;
  padding:16px;background:rgba(0,0,0,.22);
  border-radius:14px;border:1px solid rgba(255,255,255,.05);
  animation:fadeIn .3s ease;
}
.ring-area.urgent{animation:urgentBg 1s ease infinite}
.ring-wrap{position:relative;width:82px;height:82px;flex-shrink:0}
.rsv{transform:rotate(-90deg)}
.rt{fill:none;stroke:rgba(255,255,255,.06);stroke-width:6}
.rp{fill:none;stroke-width:6;stroke-linecap:round;transition:stroke-dashoffset 1s linear,stroke .3s}
.rnum{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-family:'Playfair Display',serif;font-size:1.75rem;color:var(--cream);
}
.rnum.urgent{color:#e74c3c}
.rtxt{flex:1}
.rstatus{font-size:.76rem;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:3px;color:rgba(244,236,216,.38)}
.rstatus.warn{color:#e67e22}.rstatus.danger{color:#e74c3c}
.rhint{font-size:.72rem;color:rgba(244,236,216,.22);margin-top:2px}
.btn-stop{
  margin-top:9px;padding:6px 13px;border-radius:8px;
  border:1px solid rgba(255,255,255,.13);background:transparent;
  color:rgba(244,236,216,.42);font-family:'DM Sans',sans-serif;
  font-size:.75rem;cursor:pointer;transition:all .2s;
}
.btn-stop:hover{background:rgba(255,255,255,.06);color:var(--cream)}

.waiting-hint{font-size:.82rem;color:rgba(244,236,216,.25);font-style:italic;text-align:center;padding:8px 0}

/* ── CARDS ── */
.cards-grid{display:flex;flex-wrap:wrap;gap:14px;padding:4px 2px}
.pcard{
  width:82px;height:118px;
  position:relative;cursor:pointer;user-select:none;
  animation:dealIn .35s ease both;
  transition:transform .2s cubic-bezier(.34,1.56,.64,1),filter .2s;
  perspective:600px;
}
.pcard:hover:not(.locked){transform:translateY(-14px) scale(1.06);filter:drop-shadow(0 22px 18px rgba(0,0,0,.55));}
.pcard.sel{transform:translateY(-16px) scale(1.08);filter:drop-shadow(0 0 12px rgba(200,150,42,.9)) drop-shadow(0 18px 20px rgba(0,0,0,.6));}
.pcard.locked{cursor:default}

/* Card face */
.pcard-inner{
  width:100%;height:100%;
  background:linear-gradient(160deg,#ffffff 0%,#fdf8ee 100%);
  border-radius:10px;
  border:1px solid rgba(0,0,0,.12);
  box-shadow:
    0 2px 0 rgba(255,255,255,.9) inset,
    0 -1px 0 rgba(0,0,0,.08) inset,
    1px 0 0 rgba(255,255,255,.6) inset,
    0 8px 24px rgba(0,0,0,.45),
    0 2px 4px rgba(0,0,0,.3);
  position:relative;overflow:hidden;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  transition:background .15s;
}
.pcard.sel .pcard-inner{
  background:linear-gradient(160deg,#fffde8 0%,#fff8d0 100%);
  border-color:rgba(200,150,42,.6);
  box-shadow:
    0 2px 0 rgba(255,255,255,.9) inset,
    0 -1px 0 rgba(200,150,42,.2) inset,
    0 8px 24px rgba(0,0,0,.5),
    0 0 0 2.5px rgba(200,150,42,.85);
}

/* Card back pattern (subtle linen texture lines) */
.pcard-inner::before{
  content:'';position:absolute;inset:5px;border-radius:6px;
  background:
    repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.018) 3px,rgba(0,0,0,.018) 4px),
    repeating-linear-gradient(90deg,transparent,transparent 3px,rgba(0,0,0,.012) 3px,rgba(0,0,0,.012) 4px);
  pointer-events:none;
}

/* Corner pips - top left */
.pcard-tl{
  position:absolute;top:6px;left:8px;
  display:flex;flex-direction:column;align-items:center;line-height:1;
}
/* Corner pips - bottom right (rotated) */
.pcard-br{
  position:absolute;bottom:6px;right:8px;
  display:flex;flex-direction:column;align-items:center;line-height:1;
  transform:rotate(180deg);
}
.pcard-num{
  font-family:'Playfair Display',serif;
  font-size:.78rem;font-weight:700;color:#1a1208;line-height:1;
}
.pcard-suit-sm{font-size:.65rem;line-height:1;margin-top:1px}

/* Center display */
.pcard-center{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:2px;position:relative;z-index:1;
}
.pcard-bignum{
  font-family:'Playfair Display',serif;
  font-size:2rem;font-weight:700;line-height:1;color:#1a1208;
  text-shadow:0 1px 0 rgba(255,255,255,.8);
}
.pcard-bigsuit{font-size:1.1rem;line-height:1;margin-top:1px}

/* Red cards */
.pcard.red .pcard-num,
.pcard.red .pcard-bignum{ color:#b01020; }
.pcard.red .pcard-suit-sm,
.pcard.red .pcard-bigsuit{ color:#b01020; }

/* Black cards */
.pcard:not(.red) .pcard-suit-sm,
.pcard:not(.red) .pcard-bigsuit{ color:#1a1208; }

/* Wild / ? card special */
.pcard.wild .pcard-bignum{ font-size:1.8rem; color:#6b3fa0; }
.pcard.wild .pcard-bigsuit{ color:#6b3fa0; font-size:.9rem; }
.pcard.wild .pcard-num{ color:#6b3fa0; }
.pcard.wild .pcard-suit-sm{ color:#6b3fa0; }
.pcard.wild .pcard-inner{
  background:linear-gradient(160deg,#fdfaff 0%,#f5eeff 100%);
  border-color:rgba(107,63,160,.2);
}
.pcard.wild.sel .pcard-inner{
  box-shadow: 0 2px 0 rgba(255,255,255,.9) inset, 0 8px 24px rgba(0,0,0,.5), 0 0 0 2.5px rgba(107,63,160,.7);
}

.obs-box{
  display:flex;align-items:center;gap:12px;
  padding:16px 18px;background:rgba(26,107,154,.1);
  border:1px solid rgba(26,107,154,.22);border-radius:12px;
  color:#5dade2;font-size:.88rem;
}
.vstatus{text-align:center;font-size:.83rem;padding:8px 0}
.vstatus.voted{color:rgba(200,150,42,.7)}
.vstatus.wait{color:rgba(244,236,216,.22);font-style:italic}

/* ── RESULTS ── */
.results-panel{border-color:rgba(200,150,42,.3);animation:fadeUp .35s ease}
.res-hdr{font-family:'Playfair Display',serif;font-size:1rem;color:var(--gold2);text-align:center;margin-bottom:16px}
.res-cards{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:16px}
.rc-wrap{display:flex;flex-direction:column;align-items:center;gap:5px}
.rc-val{
  background:var(--card);color:var(--ink);
  font-family:'Playfair Display',serif;font-weight:700;font-size:1.12rem;
  border-radius:10px;padding:8px 16px;min-width:44px;text-align:center;
  box-shadow:0 4px 14px rgba(0,0,0,.35);
  animation:flip .4s ease both;
}
.rc-name{font-size:.67rem;color:rgba(244,236,216,.32);max-width:70px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stats-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;padding:14px 0;margin-bottom:10px}
.stat{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 16px;background:rgba(0,0,0,.22);border-radius:11px;border:1px solid rgba(255,255,255,.07)}
.sv{font-family:'Playfair Display',serif;font-size:1.35rem;color:var(--gold2);font-weight:700}
.sl{font-size:.63rem;letter-spacing:1.5px;text-transform:uppercase;color:rgba(244,236,216,.3)}
.consensus{text-align:center;color:var(--gold2);font-weight:600;font-size:.9rem;margin-bottom:6px}
.no-vote{text-align:center;color:rgba(244,236,216,.35);font-size:.79rem}

/* ── AVG BOX ── */
.avg-box{
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:16px 20px;
  background:linear-gradient(135deg,rgba(200,150,42,.12),rgba(200,150,42,.04));
  border:1px solid rgba(200,150,42,.22);border-radius:14px;
}
.avg-l .al{font-size:.68rem;letter-spacing:2px;text-transform:uppercase;color:rgba(244,236,216,.35);margin-bottom:4px}
.avg-l .av{font-family:'Playfair Display',serif;font-size:2.2rem;color:var(--gold2);font-weight:700;line-height:1}
.avg-l .as{font-size:.7rem;color:rgba(244,236,216,.28);margin-top:3px}
.chips{display:flex}
.chip{width:33px;height:33px;border-radius:50%;border:3px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:.58rem;font-weight:700;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.4);font-family:'DM Sans',sans-serif}

/* ── ACTIONS ── */
.actions{display:flex;gap:10px;flex-wrap:wrap}
.btn-reveal{
  flex:1;padding:13px 18px;border:none;border-radius:12px;
  background:linear-gradient(135deg,var(--gold),var(--gold2));
  color:var(--ink);font-family:'DM Sans',sans-serif;font-size:.92rem;font-weight:700;
  cursor:pointer;transition:all .2s;
  box-shadow:0 4px 18px rgba(200,150,42,.32);
  display:flex;align-items:center;justify-content:center;gap:8px;
}
.btn-reveal:hover{transform:translateY(-1px);box-shadow:0 6px 26px rgba(200,150,42,.5)}
.btn-reveal:disabled{opacity:.3;cursor:not-allowed;transform:none;box-shadow:none}
.btn-ghost{
  padding:13px 18px;background:transparent;color:var(--cream);
  border:1.5px solid rgba(255,255,255,.17);border-radius:12px;
  font-family:'DM Sans',sans-serif;font-size:.88rem;font-weight:500;
  cursor:pointer;transition:all .2s;
  display:flex;align-items:center;justify-content:center;gap:7px;
}
.btn-ghost:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.28)}
.btn-danger{
  padding:13px 18px;background:rgba(192,57,43,.1);color:rgba(231,76,60,.8);
  border:1.5px solid rgba(192,57,43,.22);border-radius:12px;
  font-family:'DM Sans',sans-serif;font-size:.88rem;font-weight:500;
  cursor:pointer;transition:all .2s;
  display:flex;align-items:center;justify-content:center;gap:7px;
}
.btn-danger:hover{background:rgba(192,57,43,.18);border-color:rgba(192,57,43,.38);color:#e74c3c}

/* ── PLAYERS ── */
.vp-head{display:flex;justify-content:space-between;font-size:.73rem;color:rgba(244,236,216,.35);margin-bottom:7px}
.vp-bar{background:rgba(255,255,255,.06);border-radius:100px;height:5px;overflow:hidden;margin-bottom:14px}
.vp-fill{height:100%;border-radius:100px;background:linear-gradient(90deg,var(--gold),var(--gold2));transition:width .4s ease}
.plist{display:flex;flex-direction:column;gap:7px}
.prow{
  display:flex;align-items:center;gap:10px;
  padding:10px 12px;border-radius:13px;
  background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.055);
  transition:all .3s;
}
.prow.voted{background:rgba(200,150,42,.08);border-color:rgba(200,150,42,.18)}
.prow.obs{background:rgba(26,107,154,.08);border-color:rgba(26,107,154,.14)}
.pav{
  width:32px;height:32px;border-radius:9px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  font-weight:700;font-size:.74rem;background:#2e8055;color:var(--cream);
}
.prow.voted .pav{background:var(--gold);color:var(--ink)}
.prow.obs .pav{background:rgba(26,107,154,.45)}
.pname{font-size:.85rem;font-weight:500;color:var(--cream2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prole{font-size:.66rem;color:rgba(244,236,216,.28);margin-top:1px}
.prow.obs .prole{color:rgba(93,173,226,.55)}
.pdot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.pdot.v{background:var(--gold)}
.pdot.w{background:rgba(255,255,255,.14);animation:pulse 1.9s ease infinite}
.pdot.o{background:rgba(93,173,226,.4)}
.vchip{
  background:var(--card);color:var(--ink);
  font-family:'Playfair Display',serif;font-weight:700;font-size:.9rem;
  border-radius:7px;padding:3px 10px;
  border:1px solid var(--gold);min-width:32px;text-align:center;
  animation:flip .3s ease both;
}
.sep{border:none;border-top:1px solid rgba(255,255,255,.05);margin:6px 0}
.nobody{font-size:.79rem;color:rgba(244,236,216,.2);font-style:italic;text-align:center;padding:10px 0}

/* ── SESSION ── */
.ss-grid{display:flex;gap:8px;flex-wrap:wrap}
.ss-chip{
  flex:1;min-width:72px;
  display:flex;flex-direction:column;align-items:center;gap:3px;
  padding:12px 8px;
  background:rgba(0,0,0,.24);border:1px solid rgba(255,255,255,.06);border-radius:12px;
}
.ss-v{font-family:'Playfair Display',serif;font-size:1.45rem;color:var(--gold2);font-weight:700}
.ss-l{font-size:.61rem;letter-spacing:1.5px;text-transform:uppercase;color:rgba(244,236,216,.28);text-align:center}

/* ── INVITE ── */
.inv-panel{border-style:dashed;border-color:rgba(255,255,255,.1)}
.inv-url{
  background:rgba(0,0,0,.24);border-radius:9px;padding:9px 12px;
  font-family:monospace;font-size:.73rem;color:rgba(244,236,216,.32);
  word-break:break-all;margin-bottom:10px;border:1px solid rgba(255,255,255,.05);
}
.btn-inv{
  width:100%;padding:10px;
  background:rgba(200,150,42,.1);border:1px solid rgba(200,150,42,.22);
  border-radius:10px;color:var(--gold2);
  font-family:'DM Sans',sans-serif;font-size:.84rem;font-weight:600;
  cursor:pointer;transition:all .2s;
}
.btn-inv:hover{background:rgba(200,150,42,.18)}

/* ── TOAST ── */
.toast{
  position:fixed;bottom:26px;left:50%;
  transform:translateX(-50%) translateY(70px);
  background:var(--card);color:var(--ink);
  border-radius:12px;padding:12px 22px;
  font-size:.87rem;font-weight:600;
  box-shadow:0 10px 40px rgba(0,0,0,.5);
  border:1px solid rgba(200,150,42,.28);
  z-index:500;white-space:nowrap;
  transition:transform .32s cubic-bezier(.34,1.56,.64,1),opacity .3s;opacity:0;
}
.toast.show{transform:translateX(-50%) translateY(0);opacity:1}

/* ── LOADING ── */
.loading{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px}
.spinner{width:36px;height:36px;border:3px solid rgba(200,150,42,.2);border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite}

/* ── RESPONSIVE ── */
@media(max-width:780px){
  .game-grid{grid-template-columns:1fr}
  .rcol{order:-1}
  .hdr-in{padding:10px 0;gap:8px}
  .hdr-c{order:3;width:100%;justify-content:center;padding-bottom:6px}
  .hdr-r{display:none}
  .cards-grid{justify-content:center}
  .pcard{width:70px;height:100px}
  .pcard-bignum{font-size:1.7rem}
  .game-body{padding:16px 14px 50px}
  .actions{flex-direction:column}
  .btn-reveal,.btn-ghost,.btn-danger{flex:none;width:100%}
  .avg-box{flex-direction:column;text-align:center}
  .join-box{padding:34px 22px 30px}
}
@media(max-width:420px){
  .join-title{font-size:1.75rem}
  .pcard{width:62px;height:88px}
  .pcard-bignum{font-size:1.45rem}
  .rc{font-size:1rem;letter-spacing:2px}
  .start-btn{font-size:.95rem;padding:16px}
}
`;

/* ─────────────────────── MAIN APP ───────────────────────── */
export default function App() {
  const [screen, setScreen] = useState("join");
  const [myId] = useState(uid);
  const [myRole, setMyRole] = useState("voter");
  const [code, setCode] = useState("");
  const [roomData, setRoomData] = useState(null);
  const [toast, setToast] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const [timerIv, setTimerIv] = useState(null);
  const toastRef = useRef(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get("room");
    if (r) setCode(r.toUpperCase());
  }, []);

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
    const all = Object.values(roomData.players || {});
    const voters = all.filter((p) => p.role === "voter");
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

  const goBack = useCallback(() => {
    if (code && myId) remove(ref(db, `rooms/${code}/players/${myId}`));
    setScreen("join");
    setRoomData(null);
    window.history.replaceState({}, "", window.location.pathname);
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
    toastRef.current = setTimeout(() => setToastOn(false), 3200);
  }, []);

  const handleCreate = async (name, role) => {
    const c = mkCode();
    setMyRole(role);
    setCode(c);
    await set(ref(db, `rooms/${c}`), {
      createdAt: serverTimestamp(),
      revealed: false,
      round: 1,
      storiesDone: 0,
      timer: { running: false, duration: 30, remaining: 30 },
      players: { [myId]: { id: myId, name, role, voted: false, vote: null } },
    });
    window.history.replaceState({}, "", `?room=${c}`);
    setScreen("game");
    showToast(`🎲 Room created! Code: ${c}`);
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
    window.history.replaceState({}, "", `?room=${c}`);
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
    showToast("🔄 New round — vote on the next story!");
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
    showToast("♻️ Session reset to zero!");
  }, [code, roomData, showToast]);

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
            <div style={{ color: "rgba(244,236,216,.3)", fontSize: ".9rem" }}>
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
            onStart={startTimer}
            onStop={stopTimer}
            toast={showToast}
          />
        )}
        <div className={`toast${toastOn ? " show" : ""}`}>{toast}</div>
      </div>
    </>
  );
}

/* ─────────────────────── JOIN SCREEN ────────────────────── */
function JoinScreen({ onCreate, onJoin, initCode }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("voter");
  const [tab, setTab] = useState(initCode ? "join" : "create");
  const [rc, setRc] = useState(initCode || "");
  const [err, setErr] = useState("");

  const go = () => {
    if (!name.trim()) {
      setErr("Please enter your name");
      return;
    }
    if (tab === "join" && !rc.trim()) {
      setErr("Please enter a room code");
      return;
    }
    tab === "create"
      ? onCreate(name.trim(), role)
      : onJoin(name.trim(), role, rc.trim().toUpperCase());
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
        <p className="join-sub">Scrum estimation, casino style ✦ 2026</p>

        <div className="tab-row">
          <button
            className={`tab-btn${tab === "create" ? " on" : ""}`}
            onClick={() => {
              setTab("create");
              setErr("");
            }}
          >
            ✦ Create Room
          </button>
          <button
            className={`tab-btn${tab === "join" ? " on" : ""}`}
            onClick={() => {
              setTab("join");
              setErr("");
            }}
          >
            → Join Room
          </button>
        </div>

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

        {tab === "join" && (
          <>
            <label className="lbl">Room Code</label>
            <input
              className="inp"
              placeholder="e.g. AB12C"
              value={rc}
              onChange={(e) => {
                setRc(e.target.value.toUpperCase());
                setErr("");
              }}
              onKeyDown={(e) => e.key === "Enter" && go()}
              maxLength={6}
            />
          </>
        )}

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
          {tab === "create" ? "Deal Me In →" : "Join the Table →"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────── GAME SCREEN ────────────────────── */
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
  onStart,
  onStop,
  toast,
}) {
  const [tsel, setTsel] = useState(30);

  const players = Object.values(rd.players || {});
  const voters = players.filter((p) => p.role === "voter");
  const observers = players.filter((p) => p.role === "observer");
  const me = rd.players?.[myId];
  const myVote = me?.vote || null;
  const isObs = myRole === "observer";
  const revealed = rd.revealed || false;
  const round = rd.round || 1;
  const storiesDone = rd.storiesDone || 0;
  const timer = rd.timer || { running: false, duration: 30, remaining: 30 };
  const hasVotes = voters.some((p) => p.voted);
  const votedCount = voters.filter((p) => p.voted).length;

  const voted = voters.filter((p) => p.voted);
  const noVoted = voters.filter((p) => !p.voted);
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
  const chips = ["#c0392b", "#1a6b9a", "#27ae60", "#2c2c2c"];

  return (
    <>
      {/* HEADER */}
      <header className="hdr">
        <div className="hdr-in">
          <div className="hdr-l">
            <button className="btn-back" onClick={onBack}>
              ← Back
            </button>
            <button className="logo-btn" onClick={onBack}>
              Planning <span>Poker</span>
            </button>
          </div>
          <div className="hdr-c">
            <div className="room-badge">
              <span className="rl2">Room</span>
              <span className="rc">{code}</span>
            </div>
            <div className="badge">Round {round}</div>
            <div className="badge badge-gold">🎲 {storiesDone} stories</div>
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

      {/* BODY */}
      <div className="game-body">
        <div className="game-grid">
          {/* LEFT */}
          <div className="lcol">
            {/* Timer Panel */}
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
                        <span className="ico">🃏</span> Start Voting — {tsel}s
                      </button>
                    </>
                  )}

                  {timer.running && (
                    <div className={`ring-area${urgent ? " urgent" : ""}`}>
                      <div className="ring-wrap">
                        <svg
                          className="rsv"
                          width="82"
                          height="82"
                          viewBox="0 0 82 82"
                        >
                          <circle className="rt" cx="41" cy="41" r="32" />
                          <circle
                            className="rp"
                            cx="41"
                            cy="41"
                            r="32"
                            strokeDasharray={CIRC}
                            strokeDashoffset={offset}
                            style={{ stroke: ringClr }}
                          />
                        </svg>
                        <div
                          className="rnum-wrap"
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
                      Round complete — start a new round below
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
                          width="82"
                          height="82"
                          viewBox="0 0 82 82"
                        >
                          <circle className="rt" cx="41" cy="41" r="32" />
                          <circle
                            className="rp"
                            cx="41"
                            cy="41"
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
                        ? "✓ Cards revealed — see results below"
                        : "Waiting for facilitator to start the timer…"}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Cards */}
            <div className="panel">
              <span className="ptitle">
                {isObs ? "Votes Overview" : "Your Estimate"}
              </span>
              {isObs ? (
                <div className="obs-box">
                  <span style={{ fontSize: "1.3rem" }}>👁</span>
                  <span>
                    You're observing this session. Use the controls to reveal
                    cards and manage rounds.
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
                    ? `✓ You voted ${myVote} — waiting for reveal…`
                    : !revealed
                      ? "Pick a card to cast your vote"
                      : ""}
                </div>
              )}
            </div>

            {/* Results */}
            {revealed && (
              <div className="panel panel-gold results-panel">
                <div className="res-hdr">✦ &nbsp; Votes Revealed &nbsp; ✦</div>
                {voted.length > 0 && (
                  <>
                    <div className="res-cards">
                      {voted.map((p, i) => (
                        <div
                          key={p.id}
                          className="rc-wrap"
                          style={{ animationDelay: `${i * 0.07}s` }}
                        >
                          <div className="rc-val">{p.vote}</div>
                          <div className="rc-name">{p.name}</div>
                        </div>
                      ))}
                    </div>
                    <div className="stats-row">
                      <div className="stat">
                        <span className="sv">{avgDisp}</span>
                        <span className="sl">Average</span>
                      </div>
                      {minV !== null && (
                        <div className="stat">
                          <span className="sv">{minV}</span>
                          <span className="sl">Lowest</span>
                        </div>
                      )}
                      {maxV !== null && (
                        <div className="stat">
                          <span className="sv">{maxV}</span>
                          <span className="sl">Highest</span>
                        </div>
                      )}
                      <div className="stat">
                        <span className="sv">{voted.length}</span>
                        <span className="sl">Voted</span>
                      </div>
                    </div>
                    {allSame && (
                      <div className="consensus">
                        🎉 Perfect consensus! Everyone picked {voted[0].vote}
                      </div>
                    )}
                    {noVoted.length > 0 && (
                      <div className="no-vote">
                        ⚠️ Didn't vote: {noVoted.map((p) => p.name).join(", ")}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Observer actions */}
            {isObs && (
              <div className="actions">
                <button
                  className="btn-reveal"
                  disabled={!hasVotes || revealed}
                  onClick={onReveal}
                >
                  🂠 Reveal Cards
                </button>
                <button className="btn-ghost" onClick={onNewRound}>
                  ↺ New Round
                </button>
                <button className="btn-danger" onClick={onReset}>
                  ⟳ Reset Session
                </button>
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div className="rcol">
            {/* Players */}
            <div className="panel">
              <span className="ptitle">At the Table</span>
              {voters.length > 0 && !revealed && (
                <>
                  <div className="vp-head">
                    <span>Votes in</span>
                    <span>
                      {votedCount} / {voters.length}
                    </span>
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
                  <div key={p.id} className={`prow${p.voted ? " voted" : ""}`}>
                    <div className="pav">{ini(p.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pname">
                        {p.name}
                        {p.id === myId ? " (you)" : ""}
                      </div>
                      <div className="prole">Voter</div>
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

            {/* Average Story Points */}
            {revealed && avg !== null && (
              <div className="avg-box">
                <div className="avg-l">
                  <div className="al">Avg Story Points</div>
                  <div className="av">{avgDisp}</div>
                  <div className="as">
                    {allSame ? "Consensus reached" : `Range: ${minV}–${maxV}`}
                  </div>
                </div>
                <div className="chips">
                  {chips.map((c, i) => (
                    <div
                      key={i}
                      className="chip"
                      style={{
                        background: c,
                        marginLeft: i > 0 ? -10 : 0,
                        zIndex: 4 - i,
                      }}
                    >
                      {avgDisp}
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                  <span className="ss-l">Current Round</span>
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
                  toast("🔗 Link copied! Share with your team.");
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

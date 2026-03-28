# Planning Poker — Launch Progress Tracker
<!-- Share this file at the start of every session so Claude knows exactly where we are -->

## 🗓 Last Session
- **Date:** 28 March 2026
- **Chat name:** planning-poker
- **Worked on:** Competitive analysis vs planningpokeronline.com, then implementing 4 competitive gap features
- **Completed:** Multiple card decks (Fibonacci/T-shirt/Powers of 2 + deck picker UI). Story queue (add stories any time, navigate, record estimates). Results panel enhanced (median, min, max, spread). Session summary with copy-to-clipboard. Auth deferred — waiting on Firebase Console.

---

## 📍 Current Status
**Phase:** 1 — Technical Foundation
**Active step:** 1.2 — Firebase Auth (custom email/password)
**Blocked by:** Ali must enable Email/Password provider in Firebase Console before code changes begin

---

## ✅ PHASE 0 — Code Quality (COMPLETE)
| Step | Task | Status |
|------|------|--------|
| 0.1 | Full code audit of App.js and firebase.js | ✅ Done |
| 0.2 | Fix orphaned timer bug | ✅ Done |
| 0.3 | Fix session check interval churn | ✅ Done |
| 0.4 | Fix stale closures in goBack / beforeunload | ✅ Done |
| 0.5 | Fix endSession timer leak | ✅ Done |
| 0.6 | Add onDisconnect server-side cleanup | ✅ Done |
| 0.7 | Deliver improved App.js | ✅ Done — in outputs folder |

---

## 🔄 PHASE 1 — Technical Foundation (IN PROGRESS)
| Step | Task | Status | Notes |
|------|------|--------|-------|
| 1.1 | Enable dynamic rooms in App.js | ✅ Done | mkCode, URL params, handleJoin, two-tab JoinScreen, 11-player cap |
| 1.1a | Multiple card decks | ✅ Done | Fibonacci, T-shirt, Powers of 2. Deck picker in Create tab. Stored in Firebase. |
| 1.1b | Story queue management | ✅ Done | Add stories any time, active story banner, record estimate + advance, list view |
| 1.1c | Results panel enhancement | ✅ Done | Median, min, max, spread added alongside average |
| 1.1d | Session summary + copy-to-clipboard | ✅ Done | Sprint Summary panel in right column, appears as stories get estimates |
| 1.1e | Team Room (fixed named room) | ✅ Done | Third tab — team name → stable code (e.g. RPADEVTEAM) — create-or-join |
| 1.1f | Timer dropdown + button label fix | ✅ Done | "60 seconds" → "1 minute", start button shows "1 min" when 1 min selected |
| 1.2 | Firebase Email/Password auth | ⏳ Not started | Ali enables provider in Firebase Console first |
| 1.3 | Invite system (up to 11 members) | ⏳ Not started | Invite link = room URL — capacity enforcement already done in 1.1 |
| 1.4 | Register custom domain | ⏳ Not started | ~£10/year — Ali to do this manually |
| 1.5 | Connect domain to Vercel | ⏳ Not started | Wait for 1.4 |

---

## ⏳ PHASE 2 — SEO Overhaul (NOT STARTED)
| Step | Task | Status | Notes |
|------|------|--------|-------|
| 2.1 | Update public/index.html — title, meta, OG tags | ⏳ Not started | |
| 2.2 | Add JSON-LD structured data to index.html | ⏳ Not started | SoftwareApplication schema |
| 2.3 | Add robots.txt to /public | ⏳ Not started | |
| 2.4 | Add sitemap.xml to /public | ⏳ Not started | |
| 2.5 | Add content section to JoinScreen (features, FAQ) | ⏳ Not started | Targets long-tail keywords |
| 2.6 | Google Fonts preconnect + Core Web Vitals | ⏳ Not started | |
| 2.7 | Register Google Search Console + submit sitemap | ⏳ Not started | Ali to do manually |
| 2.8 | Create OG social image (1200×630px) | ⏳ Not started | |

---

## ⏳ PHASE 3 — Monetisation (NOT STARTED)
| Step | Task | Status | Notes |
|------|------|--------|-------|
| 3.1 | Set up Stripe account | ⏳ Not started | Ali to do manually |
| 3.2 | Add freemium tier logic to App.js | ⏳ Not started | Gate: >4 voters, multiple rooms, export |
| 3.3 | Build Stripe Checkout flow | ⏳ Not started | Hosted by Stripe — minimal code |
| 3.4 | Firebase Function webhook (payment events) | ⏳ Not started | Updates plan field in Firebase |
| 3.5 | Add upgrade prompt UI | ⏳ Not started | Shows when free tier limit hit |

---

## ⏳ PHASE 4 — Distribution (NOT STARTED)
| Step | Task | Status | Notes |
|------|------|--------|-------|
| 4.1 | Submit to AlternativeTo.net | ⏳ Not started | |
| 4.2 | Submit to G2 and Capterra | ⏳ Not started | |
| 4.3 | ProductHunt launch | ⏳ Not started | Schedule for a Tuesday |
| 4.4 | Hacker News Show HN post | ⏳ Not started | |
| 4.5 | Reddit posts (r/agile, r/scrum, r/devops) | ⏳ Not started | |
| 4.6 | Write blog article 1 | ⏳ Not started | "What is Planning Poker?" |
| 4.7 | Write blog article 2 | ⏳ Not started | "Planning Poker vs T-shirt sizing" |
| 4.8 | Write blog articles 3–5 | ⏳ Not started | See launch plan doc for topics |

---

## 📎 Files Delivered So Far
| File | Location | Description |
|------|----------|-------------|
| App.js (improved) | outputs/ | Fixed App.js with all 5 bugs resolved |
| TEST-REPORT.md | outputs/ | Full audit findings and test results |
| Planning-Poker-Launch-Plan.docx | outputs/ | Full strategy document |
| PROGRESS.md | repo root | This file |

---

## 📝 Session Notes
<!-- Add notes here during each session -->

### Session 1 — 27 March 2026
- Conducted full static code audit
- Found and fixed 5 bugs (orphaned timer, interval churn, stale closures, timer leak, no onDisconnect)
- Created detailed launch/SEO/monetisation strategy
- Delivered improved App.js, test report, and strategy Word doc

### Session 2 — 28 March 2026
- Enabled dynamic rooms (Step 1.1): uncommented mkCode, URL param useEffect, handleJoin, goBack replaceState
- Updated handleCreate to generate unique room code with mkCode()
- Restored two-tab JoinScreen (Create Room / Join Room) with room code input and CSS
- Added 11-player capacity limit in handleJoin with clear error messaging
- Planned Firebase Email/Password auth (Step 1.2) — Ali needs to enable provider in Firebase Console first
- Next session should start with Step 1.2 (Firebase Email/Password auth)

### Session 3 — 28 March 2026
- Ran full end-to-end static verification of App.js (2235 lines, 25 checks)
- **Bug fixed (critical):** `addStory` used `.length` on a Firebase integer-keyed object → always wrote to key `"undefined"`. Fixed to `Object.keys(current).length`.
- **Bug fixed (critical):** T-shirt deck votes (XS, S, M, L, XL, XXL) passed through the numeric filter and produced `NaN` in the results panel average/median. Fixed with `!isNaN(Number(v)) && v !== ""` guard.
- Renamed CSS comment `/* ══ VOTE CARDS ══ */` → `/* PLAYING CARDS */` and removed unused legacy `CARDS` constant to clear audit false positives.
- Final audit result: ✅ ALL CLEAR — 25/25 checks passed, zero issues.
- Build folder EPERM issue is a VM artefact only — does not affect Vercel deployment from GitHub.
- **Next action for Ali:** `git add src/App.js PROGRESS.md && git commit -m "fix: story queue index bug, T-shirt NaN, full verification pass" && git push`
- Next development step: Step 1.2 (Firebase Email/Password auth) — Ali must enable Email/Password provider in Firebase Console first.

---

## 🚀 How to Use This File
1. At the start of every new session with Claude, say: "Here is my PROGRESS.md" and paste or share this file
2. Claude will read the current status, pick up from the active step, and update this file when the session ends
3. Commit this file to git after each session so it's always up to date

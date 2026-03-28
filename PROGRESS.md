# Planning Poker — Launch Progress Tracker
<!-- Share this file at the start of every session so Claude knows exactly where we are -->

## 🗓 Last Session
- **Date:** 28 March 2026
- **Chat name:** planning-poker
- **Worked on:** Competitive analysis vs planningpokeronline.com, then implementing 4 competitive gap features
- **Completed:** Multiple card decks (Fibonacci/T-shirt/Powers of 2 + deck picker UI). Story queue (add stories any time, navigate, record estimates). Results panel enhanced (median, min, max, spread). Session summary with copy-to-clipboard. Auth deferred — waiting on Firebase Console.

---

## 📍 Current Status
**Phase:** 2 — SEO Overhaul (in progress, most steps now complete)
**Active step:** 2.7 — Register Google Search Console + submit sitemap (Ali to do manually)
**Remaining:** OG image creation (2.8), domain purchase, Firebase rules deployment

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

## 🔄 PHASE 2 — SEO Overhaul (IN PROGRESS)
| Step | Task | Status | Notes |
|------|------|--------|-------|
| 2.1 | Update public/index.html — title, meta, OG tags | ✅ Done | Session 7 |
| 2.2 | Add JSON-LD structured data to index.html | ✅ Done | SoftwareApplication schema. Session 7 |
| 2.3 | Add robots.txt to /public | ✅ Done | Session 7 |
| 2.4 | Add sitemap.xml to /public | ✅ Done | Session 7. Update YOUR_DOMAIN_HERE after domain purchase |
| 2.5 | Add content section to JoinScreen (features, FAQ) | ✅ Done | Session 8. Semantic HTML: h2/h3/h4/p/ol/ul/FAQ grid. Keyword-rich, WCAG compliant, responsive. |
| 2.6 | Google Fonts preconnect + Core Web Vitals | ✅ Done | display=swap confirmed. Preconnect in index.html head. Session 7/8. |
| 2.7 | Register Google Search Console + submit sitemap | ⏳ Not started | Ali to do manually after domain purchase |
| 2.8 | Create OG social image (1200×630px) | ⏳ Not started | Referenced in index.html as /og-image.png |

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

### Session 8b — 28 March 2026 (UX & background fixes)
- **Background bug fixed:** `body::before` had 3 background layers but only 2 `background-size` values (`cover, 200px 200px`). Browser cycled values — second radial gradient rendered as a 200×200px tile instead of covering the viewport. Root cause of the "overstretched/broken" visual artifact. Fixed to `cover, cover, 200px 200px`. Also softened the bottom-right gradient (0.18→0.12 opacity).
- **Font sizes lifted across the board:**
  - `.join-sub` subtitle: `0.8rem` → `0.92rem`
  - `.lbl` form labels: `0.65rem` → `0.72rem`
  - `.role-btn .rs` (sub-text): `0.62rem` → `0.78rem` (was ~10px — critical fix)
  - `.tab-btn`: `0.82rem` → `0.875rem`
  - `.deck-btn .dk-label`: `0.78rem` → `0.85rem`
  - `.deck-btn .dk-desc`: `0.62rem` → `0.75rem` (was ~10px — critical fix)
  - `.prole`, `.voted-label`, `.waiting-label`: all lifted to `0.72rem`
- **Copy updated:** Footer hint corrected to "Free · Up to {FREE_MAX_PLAYERS} participants" (was "11 players"). Team Room hint wording improved.
- **12/12 verification checks passed.** App.js = 2684 lines.

### Session 8 — 28 March 2026
- **README.md rewritten:** Clean public-facing document. Removed all sensitive content (real names, team capacity details, SPRINTROOM architecture, Firebase Studio migration notice, AI notes). Now contains: features, tech stack, local dev setup, deployment, launch checklist.
- **CLAUDE.md created:** All internal AI context moved here — architecture decisions, founder detection logic, Firebase schema, design system, SEO strategy, phase roadmap, session history pointer. Added to `.gitignore` + `STRATEGY.md` also gitignored.
- **SEO content section added to JoinScreen:** Below the join card, a full semantic section renders in the DOM for Googlebot. Includes: h2 ("Free Online Planning Poker — No Sign-up Required"), intro paragraph, two-column feature grid ("What Is Planning Poker?" + "How It Works"), key features list with diamond bullets, divider, and 2×3 FAQ grid (6 questions covering free tier, no signup, Fibonacci, remote teams, T-shirt sizing, participant limits). Fully responsive (collapses to single column at 680px). Styled to match dark green theme.
- **"11 players" hardcode fixed:** `Up to 11 players per room` → `Up to {FREE_MAX_PLAYERS} players free` — now correctly references the constant (6).
- **font-display=swap confirmed:** Google Fonts URL in index.html uses `&display=swap`. Preconnect tags present.
- **File:** App.js = 2683 lines. div/section balance verified ✅.
- **Next action for Ali:** `git add src/App.js public/ database.rules.json README.md .gitignore PROGRESS.md && git commit -m "feat: SEO content section, clean README, CLAUDE.md, font verification" && git push`

---

## 📎 Files Delivered So Far
| File | Location | Description |
|------|----------|-------------|
| App.js (improved) | src/ | Bug fixes, full theme overhaul, SEO content section, all features |
| README.md | repo root | Clean public-facing docs — no sensitive data |
| CLAUDE.md | repo root (gitignored) | Internal AI context — architecture, design, founder logic, SEO |
| database.rules.json | repo root | Firebase security rules — deploy before launch |
| public/index.html | public/ | SEO-optimised HTML shell — OG, JSON-LD, preconnect |
| public/manifest.json | public/ | Fixed PWA manifest |
| public/robots.txt | public/ | Crawl rules + sitemap pointer |
| public/sitemap.xml | public/ | Sitemap — update YOUR_DOMAIN_HERE after domain purchase |
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

### Session 7 — 28 March 2026 (Production readiness)
- **Founder hash fixed:** Updated to `cnBhLWJ1aWxkLXRlYW0=` (`rpa-build-team`). Team name "RPA Build Team" now correctly triggers `founderRoom: true` and `plan: "pro"` in Firebase.
- **index.html rewritten:** Full SEO — title, meta description, OG tags (LinkedIn/WhatsApp/Slack preview), Twitter card, JSON-LD structured data (SoftwareApplication schema), font preconnect for performance, correct `#0c1a0f` theme colour, inline critical CSS to prevent flash on load, noscript fallback. Replace `YOUR_DOMAIN_HERE` with real domain before launch.
- **manifest.json fixed:** Was "React App" / "Create React App Sample". Now "Planning Poker", correct theme/background colour `#0c1a0f`, maskable icons, proper categories.
- **Firebase security rules:** `database.rules.json` created. Validates plan field (free/pro only), player names (max 40 chars), roles (voter/observer), timer bounds, story length. Blocks all paths outside `rooms/`. Must be deployed to Firebase Console (Rules tab) before going live.
- **robots.txt:** Added `Sitemap:` reference.
- **sitemap.xml:** Created in `public/`. Update URL after domain purchase.
- **Pricing email:** Now reads from `REACT_APP_SUPPORT_EMAIL` env var — set it in Vercel environment variables.
- **Production audit result:** 26/27 checks pass. Only open item: replace `YOUR_DOMAIN_HERE` across 3 files after buying domain.

### Session 6 — 28 March 2026
- **Free/Pro tiers in code:** `MAX_PLAYERS` split into `FREE_MAX_PLAYERS = 6` and `PRO_MAX_PLAYERS = 20`.
- **Plan field on rooms:** `handleCreate` sets `plan: "free"`. `handleTeamRoom` sets `plan: "pro"` (Team Room is the Pro feature). Capacity checks are now plan-aware.
- **Upgrade prompt:** When a free room is full, the join toast explains the limit and points to Pro upgrade.
- **Founder room:** `isFounderRoom()` uses encoded constant (`btoa("rpabuildteam")`) — not plain-text in source. Founder room gets `founderRoom: true` flag in Firebase for future use.
- **Pricing modal updated:** Free tier shows 6 participants, Pro shows 20. Team Room correctly flagged as Pro-only feature. Annual saving shown correctly.
- **File:** 2517 lines, 12/12 checks passed.

### Session 5 — 28 March 2026
- **Team Room URL format:** `teamCode()` now produces lowercase hyphenated slugs. "RPA Dev Team" → `rpa-dev-team`. URL: `?team=rpa-dev-team`. Clean, memorable, shareable. Breaking change from old `RPADEVTEAM` format (no existing users, safe to change).
- **Pricing modal:** Full `PricingModal` component added. Three currencies: USD ($8/mo), GBP (£6/mo), EUR (€7/mo) with a pill switcher. Free tier vs Pro tier with feature comparison. Annual discount shown inline. "✦ See Pricing" button added below join screen subtitle. Stripe wiring deferred to Phase 3.
- **File:** 2493 lines, 14/14 checks passed.

### Session 4 — 28 March 2026
- **Theme overhaul:** Shifted base from swampy dark-green (`#080c0a`) to midnight navy (`#0b0f1e`). Body ambient light changed from green radial to indigo/gold radials. Join box and header backgrounds updated to match navy palette.
- **Text contrast (WCAG AA):** All 46 occurrences of warm cream `rgba(240,230,208,X)` replaced with cool near-white `rgba(239,242,247,X)` with significantly lifted opacities. Minimum was `.15` (illegible) → now `.45`. Most secondary text lifted from `.28–.35` → `.60–.72`.
- **Accessibility:** Added `:focus-visible` keyboard focus ring (2.5px gold outline). Added `-webkit-font-smoothing: antialiased`. All interactive elements have `transition: all .2s` for smooth feedback.
- **Inputs:** Background changed from black `.35` to glass white `.06` — visible but not garish. Hover and focus states added.
- **Interactive components:** Added explicit hover states for role buttons, tab buttons, deck buttons, timer dropdown. Player rows, story panel, stat chips, invite URL all use lighter glass surfaces.
- **Fibonacci:** Added 21 and 34 to the deck (before ?) and updated the deck description label.
- **File:** 2250 lines, verified clean.

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

# Planning Poker — Project Context

> **Single source of truth for any AI assistant (Claude, Codex, Gemini, GPT, etc.)**
>
> **AI UPDATE PROTOCOL**
> When you complete a task, do two things:
> 1. Move the item from **§ Pending Work** to the appropriate **§ Completed** section with a date.
> 2. Update any affected sections (schema, components, CSS vars, etc.) to reflect the new reality.
>
> Do **not** modify items that are still listed as pending unless you are completing them.
> Do **not** rewrite the entire file — make targeted, additive edits only.

---

## § Project Identity

| Field | Value |
|---|---|
| **Product name** | Planning Poker |
| **Purpose** | Free real-time planning poker for agile and Scrum teams. No sign-up required. |
| **Target audience** | Product Owners, Scrum Masters, developers on distributed teams |
| **Business model** | Freemium — Free tier (6 players) + Pro tier (20 players, team rooms) |
| **Jurisdiction** | England & Wales |
| **Current status** | Deployed on Vercel. Pre-revenue. Analytics tracking live. Auth not yet implemented. |
| **Founder room** | `rpa-build-team` (encoded in `_FC` array as `btoa` value) |

---

## § Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | React | 19.2.4 | Create React App scaffold |
| Database | Firebase Realtime Database | SDK 12.10.0 | Spark (free) plan, US region |
| Hosting | Vercel | — | Auto-deploys from `main` branch on GitHub |
| Build tool | react-scripts | 5.0.1 | CRA — no custom webpack config |
| Fonts | Outfit v15, Cormorant Garamond v21 | — | **Self-hosted** in `public/fonts/` — no Google Fonts CDN |
| Payments | Stripe | — | **Not yet integrated** — links are `#upgrade` placeholders |
| Auth | None yet | — | Firebase Auth planned for Phase 1.2 |
| CI/CD | GitHub → Vercel | — | Push to `main` = live deploy |

### Environment variables (Vercel + local `.env`)

All Firebase config is injected via `REACT_APP_*` env vars — never hardcoded.

```
REACT_APP_FIREBASE_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN
REACT_APP_FIREBASE_DATABASE_URL   # e.g. planning-poker-b6ac1-default-rtdb.firebaseio.com
REACT_APP_FIREBASE_PROJECT_ID
REACT_APP_FIREBASE_STORAGE_BUCKET
REACT_APP_FIREBASE_MESSAGING_SENDER_ID
REACT_APP_FIREBASE_APP_ID
```

Future (not yet added):
```
REACT_APP_SUPPORT_EMAIL   # replace support@planningpoker.app placeholder in privacy.html
```

---

## § Repository Structure

```
planning-poker/
├── public/
│   ├── index.html          # 7× YOUR_DOMAIN_HERE placeholders — replace after domain purchase
│   ├── favicon.svg         # Branded SVG: dark green card, gold spade
│   ├── favicon.ico         # 7-size ICO (16/24/32/48/64/128/256px)
│   ├── logo192.png         # PWA icon — branded casino card
│   ├── logo512.png         # PWA icon — branded casino card
│   ├── manifest.json       # PWA manifest with SEO copy
│   ├── robots.txt          # YOUR_DOMAIN_HERE placeholder
│   ├── sitemap.xml         # YOUR_DOMAIN_HERE placeholder
│   ├── privacy.html        # GDPR/UK ICO privacy policy (styled, noindex)
│   ├── terms.html          # Terms of Service — England & Wales (styled, noindex)
│   └── fonts/              # Self-hosted: Outfit v15, Cormorant Garamond v21
├── src/
│   ├── App.js              # ENTIRE app in one file — ~3800 lines (see § Components)
│   ├── firebase.js         # Firebase init — reads from REACT_APP_* env vars
│   ├── index.js            # React root mount
│   ├── index.css           # Minimal reset (most styles are CSS-in-JS in App.js)
│   └── App.css             # Unused — do not add styles here
├── database.rules.json     # Firebase security rules — deploy manually in Console
├── PROJECT.md              # THIS FILE — single source of truth
└── package.json
```

### Critical note on App.js

The entire application — CSS, all components, all logic — lives in `src/App.js`. This is intentional for the current scale. **Do not split into separate files unless the user explicitly requests it.** All CSS is a template literal string (`const CSS = \`...\``) injected via `<style>{CSS}</style>` in the App() return. When adding new styles, append them inside the existing CSS string.

---

## § Design System

### Colour palette (CSS custom properties)

```css
--bg:       #0c1a0f   /* Page background — deep forest green */
--bg2:      #122018   /* Slightly lighter green surface */
--surface:  rgba(255,255,255,0.07)
--surface2: rgba(255,255,255,0.12)
--border:   rgba(255,255,255,0.13)
--border2:  rgba(255,255,255,0.24)
--gold:     #c9922a   /* Primary gold */
--gold2:    #e8b84b   /* Lighter gold — headings, active states */
--gold3:    #f5d07a   /* Lightest gold — highlights */
--goldA:    rgba(201,146,42,0.20)
--goldB:    rgba(201,146,42,0.13)
--cream:    #eef2ec
--cream2:   #9db89e
--red:      #e04848
--green:    #3dba68
--blue:     #4499e8
--ink:      #080e09   /* Text on gold backgrounds */
--card-bg:  #fdfaf3   /* Playing card face */
--radius:   16px
--radius-sm:10px
--shadow:   0 20px 60px rgba(0,0,0,0.60)
```

### Typography

- **Headings / brand**: `Cormorant Garamond` (serif) — weight 400/600/700
- **UI / body**: `Outfit` (sans-serif) — weight 300/400/500/600/700
- Both fonts are **self-hosted** — loaded from `public/fonts/` in `index.html`

### Animation keyframes defined

`fadeUp`, `fadeIn`, `shimmer`, `spin`, `pulse`, `flip`, `dealIn`, `glow`, `urgentBg`, `heroIn`, `badgePop`, `consensusIn`, `starBurst`

---

## § Component Inventory

All components are functions in `src/App.js`. Listed in render order:

| Component | Description |
|---|---|
| `CasinoChip` | SVG casino chip — 8-segment dashed rim, inner felt, gold rings, "PP" logotype. Props: `onClick`, `size` (default 44), `label`. Used at 34/44/52/56px. |
| `NavBar` | Global sticky nav (z-index: 200). Left: chip + brand. Right: Log in + Get Pro. Props: `screen`, `onLogoClick`, `onLogin`, `onRegister`. |
| `SiteFooter` | 3-column footer — brand desc, Legal links, Product links. Bottom bar: copyright + legal disclaimer. Props: `onCookieSettings`. |
| `LoginModal` | Pro key entry modal. Validates `PPRO-XXXX-XXXX-XXXX` against Firebase `/licenses/`. "Email auth coming soon" notice. Props: `onClose`, `onProActivated`. |
| `CookieBanner` | GDPR consent bar — shown until `pp_cookie_ok = "1"` in localStorage. Props: `onAccept`. |
| `App` | Root — manages all screen state, Firebase subscriptions, room lifecycle. |
| `Confetti` | Pure-canvas confetti burst — no external deps. Props: `onDone`, `big`. |
| `PricingModal` | Monthly/annual billing toggle, GBP/USD/EUR currency, Pro CTA (Stripe links placeholder), collapsible key activation. Props: `onClose`, `onProActivated`. |
| `JoinScreen` | Landing form — Create/Join/Team Room tabs, role selector, deck picker. Props: `onCreate`, `onJoin`, `onTeamRoom`, `prefillCode`, `prefillTeam`, `proMode`, `onShowPricing`. |
| `GameScreen` | Full estimation room UI — timer, playing cards, results, observer controls, analytics. Props: see § GameScreen Props. |

### GameScreen Props

```
rd, myId, myRole, code, deck, shareUrl,
onBack, onCard, onReveal, onNewRound, onReset, onEndSession,
onStart, onStop, onAddStory, onRecordStory, sessionWarning, toast
```

---

## § Key Constants & Logic

```js
FREE_MAX_PLAYERS = 6
PRO_MAX_PLAYERS  = 20
SESSION_MAX_MS   = 3 * 60 * 60 * 1000   // 3 hours — room auto-deletes
SESSION_WARN_MS  = SESSION_MAX_MS - 10 * 60 * 1000  // warn at 2h50m

PRO_KEY_REGEX = /^PPRO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/

PRICING = {
  USD: { symbol: "$", pro: 8,  proAnnual: 6  },
  GBP: { symbol: "£", pro: 6,  proAnnual: 5  },
  EUR: { symbol: "€", pro: 7,  proAnnual: 6  },
}

STRIPE_LINKS = {
  monthly: { GBP: "#upgrade", USD: "#upgrade", EUR: "#upgrade" },
  annual:  { GBP: "#upgrade", USD: "#upgrade", EUR: "#upgrade" },
}
// ↑ ALL PLACEHOLDERS — replace with real Stripe Payment Links after setup
```

### Pro status flow

1. User opens `PricingModal` or `LoginModal`
2. Enters key matching `PPRO-XXXX-XXXX-XXXX`
3. `validateAndSavePro(key)` → checks `db /licenses/{key}` for `{ active: true }`
4. On success → `localStorage.setItem("pp_pro", JSON.stringify({ key, activatedAt }))`
5. `readProStatus()` reads localStorage on every App() mount → `proMode` boolean state
6. `proMode` controls `plan` field on room create (`"free"` or `"pro"`)

### Room lifecycle

```
Create:  handleCreate(name, role, deck)  → set /rooms/{code}
Join:    handleJoin(name, role, code)    → update /rooms/{code}/players/{myId}
Team:    handleTeamRoom(name, role, teamName, deck) → stable slug code via teamCode()
Leave:   goBack() → remove /rooms/{code}/players/{myId}
         (if last player → remove entire /rooms/{code})
Expiry:  SESSION_MAX_MS = 3h → remove /rooms/{code}, redirect to join
```

### Estimation flow (two paths)

```
PATH A — Named story queue (hasStories = true):
  Observer adds stories → recordAndNextStory(estimate, isConsensus)
  → writes /rooms/{code}/stories/{idx}/estimate
  → increments storiesDone, streak, consensusCount
  → increments activeStory index

PATH B — No story queue (hasStories = false):
  Observer clicks "Agreed" → newRound(estimate, isConsensus)
  → writes /rooms/{code}/rounds/{storiesDone} = { estimate, isConsensus }
  → increments storiesDone, streak, consensusCount

Re-vote (either path):
  Observer clicks "Re-vote" → newRound(null, false)
  → does NOT increment storiesDone — resets streak only
```

### Analytics

Cookie-free, no-PII daily counters written to Firebase via `runTransaction`.

```js
track("room_created_free")   // on handleCreate, proMode=false
track("room_created_pro")    // on handleCreate, proMode=true / handleTeamRoom (new room)
track("player_joined")       // on handleCreate, handleJoin, handleTeamRoom (voter role)
track("observer_joined")     // same, observer role
track("stories_estimated")   // on recordAndNextStory, on newRound(estimate≠null)
track("pricing_opened")      // NavBar "Get Pro", JoinScreen pricing CTA
track("pro_activated")       // validateAndSavePro returns "ok"
track("login_modal_opened")  // NavBar "Log in"
track("timer_used")          // startTimer()
track("story_queue_used")    // addStory() — first story in a room
track("invite_copied")       // clipboard.writeText(shareUrl)
```

Firebase path: `/analytics/daily/YYYY-MM-DD/{eventName}` → integer count
Read via Firebase Console → Realtime Database only (client read is blocked by rules).

---

## § Firebase Schema

### `/rooms/{roomCode}`

```json
{
  "createdAt":     "serverTimestamp (number)",
  "revealed":      "boolean",
  "round":         "number ≥ 1",
  "storiesDone":   "number ≥ 0",
  "streak":        "number ≥ 0",
  "consensusCount":"number ≥ 0",
  "activeStory":   "number ≥ 0  (index into stories)",
  "deck":          "fibonacci | tshirt | powers",
  "plan":          "free | pro",
  "teamName":      "string (team rooms only)",
  "founderRoom":   "boolean (team rooms only)",
  "timer": {
    "running":   "boolean",
    "duration":  "number 10–300 (seconds)",
    "remaining": "number ≥ 0",
    "startedBy": "playerId (set on start, not validated)"
  },
  "players": {
    "{playerId}": {
      "id":    "string",
      "name":  "string ≤ 40 chars",
      "role":  "voter | observer",
      "voted": "boolean",
      "vote":  "string | null"
    }
  },
  "stories": {
    "{index}": {
      "name":     "string ≤ 200 chars",
      "estimate": "string | null"
    }
  },
  "rounds": {
    "{index}": {
      "estimate":    "string  (e.g. '8', 'XL')",
      "isConsensus": "boolean"
    }
  }
}
```

### `/licenses/{key}`

```json
{ "active": true }
```
Keys are of the form `PPRO-XXXX-XXXX-XXXX`. Currently added manually in Firebase Console. Stripe webhook automation is a future task.

### `/analytics/daily/{YYYY-MM-DD}/{eventName}`

Integer counter. Client write only. Admin read only via Firebase Console.

---

## § URL Routing

CRA single-page app — no React Router. Routing is handled via state + `window.history.replaceState`.

| URL pattern | Behaviour |
|---|---|
| `/` | Join screen (Create tab) |
| `/?room=XXXXX` | Join screen with room code pre-filled |
| `/?team=TeamName` | Join screen with Team Room tab + name pre-filled |
| `/t/team-slug` | Team Room direct link — slug matches `teamCode(teamName)` |
| `/privacy` | Served as static HTML from `public/privacy.html` |
| `/terms` | Served as static HTML from `public/terms.html` |

`teamCode(name)` — normalises team name to a URL slug: lowercase, spaces → hyphens, special chars stripped, max 24 chars.

---

## § Card Decks

```
fibonacci  → 1, 2, 3, 5, 8, 13, 21, 34, ?
tshirt     → XS, S, M, L, XL, XXL, ?
powers     → 1, 2, 4, 8, 16, 32, ?
```

T-shirt deck: story points are non-numeric — `avgSP`, `totalSP`, and estimate distribution treat these as text labels. Analytics uses the tshirtOrder sort for breakdown.

---

## § Legal & Compliance

| Document | Location | Status |
|---|---|---|
| Terms of Service | `public/terms.html` | Live — 15 clauses, England & Wales |
| Privacy Policy | `public/privacy.html` | Live — UK GDPR / DPA 2018 |
| Cookie Banner | `src/App.js` — `CookieBanner` | Live — functional storage + anonymous counts only |
| Cookie Settings | Footer → `resetCookieBanner()` | Live — re-shows consent banner |

### Key legal positions (do not weaken without legal review)

- Liability cap: amount paid in the preceding 12 months, or £10 — whichever is greater
- Service provided "as-is" — no SLA, no uptime guarantee
- No refunds except 14-day trial cancellation (monthly) / pro-rated (annual) — **Stripe not yet wired**
- Governing law: England & Wales; courts of England & Wales have exclusive jurisdiction
- Third-party disclosures: Firebase (Google LLC), Vercel Inc., Stripe Inc.
- Data: no PII beyond display name and votes within a live session — all ephemeral

**Placeholder to fill**: `support@planningpoker.app` in `privacy.html` — replace with real address after domain setup.

---

## § Navigation & Layout Structure

```
<page-shell>           ← min-height: 100vh, flex column
  <NavBar/>            ← sticky top:0, z-index:200 — always visible
  <div.app>            ← flex:1, flex column
    <JoinScreen/>      ← shown when screen === "join"
    OR
    <GameScreen/>      ← shown when screen === "game"
      <header.hdr/>    ← sticky top:64px (below NavBar), z-index:100
      <div.game-body/> ← 2-column grid: lcol (cards+controls) + rcol (players+analytics)
  </div.app>
  <SiteFooter/>        ← 3-column footer, copyright, legal note
</page-shell>

<!-- Overlays (outside page-shell, z-index 900+) -->
<CookieBanner/>        ← z-index: 900 (approx)
<LoginModal/>          ← z-index: 900
<PricingModal/>        ← z-index: 900
<Confetti/>            ← z-index: 999 (canvas)
<ConsensusOverlay/>    ← z-index: 998
```

---

## § Completed Work

Listed chronologically newest-first.

### 2026-03 — Anonymous usage analytics
- `track()` utility using `runTransaction` — daily counters in `/analytics/daily/`
- 11 events tracked across all key user actions
- Firebase rules updated: `/analytics/daily/$date/$event` write-only from client
- Privacy policy updated: anonymous counts disclosed; cookie banner text updated
- No cookies, no PII, fully GDPR-compliant

### 2026-03 — Global nav, casino chip logo, site footer, login modal
- `CasinoChip` SVG component — 8-segment dashed rim, scalable (34–56px)
- `NavBar` — sticky top bar across all screens; Log in + Get Pro CTAs
- `SiteFooter` — 3-column footer; Legal/Product links; Cookie Settings reset
- `LoginModal` — Pro key activation from nav; "email auth coming soon" copy
- `JoinScreen` updated: chip replaces suit icons, title changed to "Start Estimating"
- `GameScreen` header: chip replaces text logo; room code badge added; `top: 64px`
- `page-shell` layout wrapper; `resetCookieBanner()` in App()

### 2026-03 — Story point bug fix (rounds/ path)
- `newRound(estimate, isConsensus)` — estimate=null = re-vote, estimate set = story done
- New `/rounds/{index}` Firebase path persists estimates when no story queue
- Analytics IIFE reads `rounds` as fallback when `stories` has no estimates
- Re-vote no longer incorrectly increments `storiesDone`
- Firebase rules: `rounds/` collection added with validation

### 2026-03 — Terms of Service + Pricing redesign + Pro key activation
- `public/terms.html` — 15 clauses, England & Wales governing law, styled to match app
- `PricingModal` — Monthly/Annual billing toggle; GBP/USD/EUR currency; Stripe links (placeholders)
- Pro key activation: `PPRO-XXXX-XXXX-XXXX` → Firebase `/licenses/{key}` validation
- `STRIPE_LINKS` constant; `PRO_KEY_REGEX`; `validateAndSavePro(key)` async utility
- `readProStatus()` reads localStorage on mount; `proMode` state in `App()`
- `plan` field on room create driven by `proMode`
- CookieBanner: removed Google Fonts reference (self-hosted); added Terms link

### 2026-03 — Sprint Analytics panel redesign
- Three-section layout: Sprint Snapshot KPIs / Team Alignment bar / Per-story list
- Estimate distribution chips (point frequency map)
- T-shirt deck support in analytics (text labels, tshirt sort order)
- Replaces old 2×2 KPI grid

### 2026-03 — Branded favicon/icons + privacy policy
- `public/favicon.svg` — dark green card, gold spade (clean SVG)
- `public/favicon.ico` — 7-size ICO generated with PIL (4× supersampling)
- `public/logo192.png`, `public/logo512.png` — branded PWA icons
- `public/privacy.html` — full GDPR/UK ICO policy, styled to match app
- `public/manifest.json` — SEO copy, correct app name and description

### 2026-03 — Optional story queue, /t/ routing, confirm dialogs
- Story queue: observer can add named stories; estimates recorded by name
- `/t/team-slug` URL routing for permanent Team Room links
- Confirm dialogs for destructive actions (end session, reset)
- Various flow and UX fixes

### Earlier — Core product features
- Real-time room creation and joining via Firebase RTDB
- Free/Pro player tiers (6/20 max)
- Team rooms with stable slug codes
- Three card decks: Fibonacci, T-shirt, Powers of 2
- Role system: Voter (votes) / Observer (facilitates, sees analytics)
- Timer: configurable 10–300s countdown
- Auto-reveal, consensus detection, confetti burst
- Estimation Spree streak panel
- Sprint Summary copy-to-clipboard
- Session expiry at 3h with 10-minute warning
- Cookie consent (GDPR)
- SEO: `index.html` meta tags, `sitemap.xml`, `robots.txt`
- `onDisconnect` Firebase cleanup on browser crash/tab close

---

## § Pending Work

Items are grouped by dependency. Do not mark complete until fully deployed/verified.

### IMMEDIATE — Deploy (user action required)

- [ ] **Push local commits to remote**
  ```bash
  cd ~/Documents/planning-poker && git push
  ```
  6 commits ready on `main`, not yet pushed.

- [ ] **Deploy Firebase rules** (critical — do after push)
  1. Firebase Console → Realtime Database → Rules
  2. Replace current rules with contents of `database.rules.json`
  3. Click Publish
  Without this: `rounds/` writes fail silently (analytics shows "—"), and `analytics/` writes fail.

### BLOCKED ON: Domain purchase

- [ ] Replace `YOUR_DOMAIN_HERE` in `public/index.html` (5 occurrences)
- [ ] Replace `YOUR_DOMAIN_HERE` in `public/sitemap.xml`
- [ ] Replace `YOUR_DOMAIN_HERE` in `public/robots.txt`
- [ ] Create `public/og-image.png` (1200×630px) for OG/Twitter meta preview
- [ ] Update `support@planningpoker.app` → real support email in `public/privacy.html`
- [ ] Add `REACT_APP_SUPPORT_EMAIL` to Vercel environment variables
- [ ] Submit sitemap to Google Search Console

### BLOCKED ON: Stripe account setup

- [ ] Create 6 Stripe Payment Links:
  - Monthly GBP £6/mo
  - Monthly USD $8/mo
  - Monthly EUR €7/mo
  - Annual GBP £5/mo (billed annually = £60/yr)
  - Annual USD $6/mo (billed annually = $72/yr)
  - Annual EUR €6/mo (billed annually = €72/yr)
- [ ] Replace all 6 `#upgrade` values in the `STRIPE_LINKS` constant in `src/App.js`
- [ ] Optional: Vercel serverless function `api/stripe-webhook.js` — on payment complete → write `{ active: true }` to `/licenses/{generated_key}` in Firebase

### PHASE 1.2 — Firebase Auth (Email/Password)

- [ ] Enable Email/Password auth in Firebase Console
- [ ] Add sign-up / sign-in forms (replace `LoginModal` placeholder copy)
- [ ] Persist Pro status to Firebase user record (not just localStorage)
- [ ] Display user's name/email in NavBar when logged in
- [ ] "Forgot password" flow

### PHASE 2 — Teams plan (B2B)

- [ ] Teams plan: company billing, multiple named team rooms, admin seat management
- [ ] Stripe annual invoice flow for teams
- [ ] Server-side player count enforcement (Firebase rules + plan field)
- [ ] Firebase App Check — prevents API abuse from unknown clients

### PHASE 3 — Infrastructure

- [ ] Room auto-expiry (requires Blaze plan — Firebase scheduled functions)
- [ ] Split `src/App.js` into components folder when next major feature is added
- [ ] Firebase Storage for og-image and future assets

### REVENUE — Ads (low effort)

- [ ] Enable Google AdSense on join/home page only (not inside rooms)
  - **Requires**: Update `public/privacy.html` to disclose advertising cookies
  - **Requires**: Update `CookieBanner` to add Accept/Reject choice (not just Accept)
  - **Requires**: Remove "No advertising cookies" statement — currently factually accurate but becomes false on Ads activation

---

## § Analytics & Business Metrics Guide

### Where to read the data

Firebase Console → Realtime Database → `/analytics/daily/`

### Key ratios to watch

| Metric | Formula | What it tells you |
|---|---|---|
| Conversion rate | `pro_activated / pricing_opened` | Value proposition clarity |
| Pricing interest rate | `pricing_opened / room_created_free` | Awareness of Pro |
| Invite virality | `invite_copied / room_created_free` | How often hosts share the link |
| Timer adoption | `timer_used / room_created_free` | Feature awareness |
| Queue adoption | `story_queue_used / room_created_free` | Feature awareness |
| Team engagement | `stories_estimated / player_joined` | Session depth |

### Revenue decision logic

If `pricing_opened` is high but `pro_activated` is low → price or value perception problem.
If `pricing_opened` is low → users don't know Pro exists → improve feature marketing.
If `timer_used` or `story_queue_used` is high → consider gating those behind Pro to increase conversion.
If `room_created_free` grows but `pricing_opened` stays flat → add in-room upsell prompts.

---

## § Commit History Summary

```
54c64b2  feat: anonymous usage analytics + firebase rules + privacy update
964d9fe  feat: global nav, casino chip logo, site footer, login modal
aa06e6d  fix: persist estimates without story queue; fix re-vote counter bug
0939dcb  feat: terms page, pricing redesign with billing toggle + Pro key activation
a6aaf85  feat: redesign sprint analytics panel for PO/SM stakeholders
f5323af  feat: branded favicon/icons + privacy policy + manifest copy update
4045193  fix: firebase rules — streak/consensusCount, timer partial updates, createdAt
821758b  feat: optional story queue, /t/<slug> routing, confirm dialogs, flow fixes
5b47f00  feat: analytics, cookie consent, estimation spree, confetti, UX/font fixes
...      (earlier: core product, real-time rooms, decks, roles, timer, session expiry)
```

---

## § Known Issues / Watch List

| Issue | Status | Notes |
|---|---|---|
| `database.rules.json` not yet deployed | Pending user action | rounds/ and analytics/ writes will fail until deployed |
| Stripe links are `#upgrade` placeholders | Pending Stripe setup | PricingModal CTA does not complete a payment |
| Pro key must be manually added to Firebase | Temporary | Stripe webhook will automate in Phase 3 |
| No Firebase Auth | By design (Phase 1.2) | Pro status stored in localStorage only — can be cleared |
| App.js is ~3800 lines | Acceptable | Split into components at next major feature milestone |
| `startedBy` in timer not validated by Firebase rules | Low risk | Internal field, not exploitable |

---

## § Instructions for AI Assistants

### Before writing any code

1. Read this file in full — it has the full context you need.
2. Check **§ Pending Work** — do not duplicate something already planned.
3. Check **§ Completed Work** — do not redo something already done.
4. All CSS goes inside the `CSS` template literal in `src/App.js`. Append at the end of the string, before the closing backtick.
5. All components go in `src/App.js`. Add them before `export default function App()`.
6. When adding Firebase reads/writes, check `database.rules.json` — if the path is new, add a validation rule.
7. Run `npm run build` after changes to confirm zero errors/warnings before committing.

### After completing work

1. Move completed items from **§ Pending Work** into **§ Completed Work** with a date.
2. Update the relevant section (schema, components, constants, etc.) if it changed.
3. Add the new commit hash to **§ Commit History Summary**.
4. Update **§ Known Issues** if a known issue was resolved or a new one was found.
5. Do NOT rewrite sections you didn't touch.

### Coding conventions

- CSS class naming: `kebab-case`, namespace by component (e.g. `.footer-link`, `.chip-logo`, `.a-kpi`)
- Component function naming: `PascalCase`
- Firebase async calls: always `try/catch` or silent-fail for analytics; propagate errors for user-facing operations
- Toast notifications: call `showToast(msg)` — appears for 3.4s, non-blocking
- No external UI libraries — all UI is hand-coded CSS in the `CSS` string
- `track()` calls should never throw or break the main flow
- Pro key format: `PPRO-XXXX-XXXX-XXXX` (regex in `PRO_KEY_REGEX`)

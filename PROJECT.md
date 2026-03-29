# pointpoker — Project Context

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

## § Current Truth Snapshot

This section is the fastest, highest-priority handoff summary for any AI.

- Brand: `pointpoker`
- Production domain: `https://www.pointpoker.app/`
- Support email: `support@pointpoker.app`
- Auth:
  - Firebase Email/Password auth is implemented and enabled
  - `/users/{uid}` persistence is live
- Roles:
  - Backend values are `voter` and `observer`
  - User-facing label for `observer` is `Facilitator`
- Founder team room:
  - Stable founder-enabled URL is `https://www.pointpoker.app/t/rpa-build-team`
- Verified product state:
  - Auth QA passed
  - Core room-flow QA passed
  - Facilitator wording clarified
  - Privacy policy updated for auth
  - SEO/domain references updated for `www.pointpoker.app`
  - Copy, legal accuracy, accessibility semantics, and structured SEO reviewed and tightened
  - Mobile voting interaction hardened so same-card repeat taps no longer clear the vote
  - Team-room routing and founder-room URL handling were hardened after a real regression was found
- Still pending:
  - Connect domain in Vercel and verify production routing
  - Set `REACT_APP_SUPPORT_EMAIL=support@pointpoker.app` in Vercel
  - Create `public/og-image.png`
  - Replace Stripe placeholder links and complete paid activation wiring

If older historical notes below conflict with this section, treat this snapshot as the authoritative current state and update the older sections when touching them.

---

## § Project Identity

| Field | Value |
|---|---|
| **Product name** | pointpoker |
| **Purpose** | Free real-time planning poker for agile and Scrum teams. Sign-up optional for free use; required for account-based Pro billing. |
| **Target audience** | Product Owners, Scrum Masters, developers on distributed teams |
| **Business model** | Freemium — Free tier (6 players) + Pro tier (20 players, team rooms) |
| **Jurisdiction** | England & Wales |
| **Current status** | Deployed on Vercel. Pre-revenue. Analytics tracking live. Firebase Auth is enabled and privacy policy updated; Stripe activation still pending. |
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
| Payments | Stripe | — | Account-aware checkout UI in place; real Stripe links/webhook still pending |
| Auth | Firebase Auth | SDK 12.10.0 | Email/Password UI implemented in app and provider enabled in Firebase Console |
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
REACT_APP_SUPPORT_EMAIL   # set to support@pointpoker.app in Vercel/local env
```

---

## § Repository Structure

```
planning-poker/
├── public/
│   ├── index.html          # SEO shell — canonical and OG now point to www.pointpoker.app
│   ├── favicon.svg         # Branded SVG: dark green card, gold spade
│   ├── favicon.ico         # 7-size ICO (16/24/32/48/64/128/256px)
│   ├── logo192.png         # PWA icon — branded casino card
│   ├── logo512.png         # PWA icon — branded casino card
│   ├── manifest.json       # PWA manifest with SEO copy
│   ├── robots.txt          # Sitemap points to www.pointpoker.app
│   ├── sitemap.xml         # Root URL sitemap for www.pointpoker.app
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
| `NavBar` | Global sticky nav (z-index: 200). Left: chip + brand. Right: account badge/log out when signed in, otherwise Log in + Get Pro. Props: `onLogoClick`, `onLogin`, `onRegister`, `currentUser`, `currentPlan`, `onLogout`. |
| `SiteFooter` | 3-column footer — brand desc, Legal links, Product links. Bottom bar: copyright + legal disclaimer. Props: `onCookieSettings`. |
| `LoginModal` | Account modal. Supports sign in, create account, password reset, and Pro key activation against Firebase `/licenses/`. Props: `onClose`, `onAuthSuccess`, `onProActivated`, `currentUser`. |
| `CookieBanner` | GDPR consent bar — shown until `pp_cookie_ok = "1"` in localStorage. Props: `onAccept`. |
| `App` | Root — manages all screen state, Firebase subscriptions, room lifecycle. |
| `Confetti` | Pure-canvas confetti burst — no external deps. Props: `onDone`, `big`. |
| `PricingModal` | Monthly/annual billing toggle, GBP/USD/EUR currency, account-aware Pro checkout CTA, collapsible key activation. Props: `onClose`, `onProActivated`, `currentUser`, `currentPlan`, `onRequireLogin`. |
| `JoinScreen` | Landing form — Create/Join/Team Room tabs, role selector, deck picker. Props: `onCreate`, `onJoin`, `onTeamRoom`, `prefillCode`, `prefillTeam`, `proMode`, `onShowPricing`. |
| `GameScreen` | Full estimation room UI — timer, playing cards, results, facilitator controls, analytics. Props: see § GameScreen Props. |

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

### Account & Pro status flow

1. User opens `LoginModal`
2. Signs in / creates account with Firebase Auth Email/Password, or activates a Pro key
3. `saveUserProfile(user)` persists `/users/{uid}` with `email`, `displayName`, `plan`, `billingStatus`, timestamps
4. `validateAndSavePro(key, user)` checks `db /licenses/{key}` for `{ active: true }`
5. On success → writes legacy `localStorage pp_pro` and upgrades `/users/{uid}` to `plan: "pro"` when signed in
6. `App()` derives `proMode` from the signed-in user profile first, with localStorage as a backwards-compatible fallback
7. `proMode` controls `plan` field on room create and Team Room access

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
  Facilitator adds stories → recordAndNextStory(estimate, isConsensus)
  → writes /rooms/{code}/stories/{idx}/estimate
  → increments storiesDone, streak, consensusCount
  → increments activeStory index

PATH B — No story queue (hasStories = false):
  Facilitator clicks "Agreed" → newRound(estimate, isConsensus)
  → writes /rooms/{code}/rounds/{storiesDone} = { estimate, isConsensus }
  → increments storiesDone, streak, consensusCount

Re-vote (either path):
  Facilitator clicks "Re-vote" → newRound(null, false)
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

### `/users/{uid}`

```json
{
  "email": "string ≤ 200 chars",
  "displayName": "string ≤ 40 chars",
  "plan": "free | pro",
  "billingStatus": "inactive | checkout_started | active",
  "billingCycle": "monthly | annual",
  "currency": "GBP | USD | EUR",
  "createdAt": "number (Date.now)",
  "lastLoginAt": "number (Date.now)",
  "checkoutStartedAt": "number (optional)",
  "proActivatedAt": "number (optional)",
  "proKey": "string length 19 (optional)"
}
```
Readable/writable only by the authenticated user with matching `auth.uid`.

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
- Data: account email + display name are now stored for signed-in users; session names/votes remain session-scoped

**Support contact chosen**: `support@pointpoker.app`

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

### 2026-03 — Facilitator role copy clarification
- Join-screen role label changed from user-facing `Observer` to `Facilitator` while keeping the Firebase role value as `observer`
- Facilitator helper copy now explicitly says this role runs the session and does not vote
- Waiting-state text now references the facilitator consistently, reducing false bug reports during QA
- Player list row now shows `Facilitator · No vote` instead of `Observer · Facilitator`
- Manual QA confirmed facilitator controls, participant flow, timer, end session, leave/rejoin, and Team Room gating all work as intended

### 2026-03 — Privacy policy updated for account auth
- `public/privacy.html` now discloses Firebase Authentication account data, account email storage, account metadata, and password reset email handling
- Browser storage section now reflects signed-in Firebase session storage and the legacy `pp_pro` key fallback
- GDPR rights/retention sections now distinguish between temporary room data and persistent account data
- Stripe remains non-live and is described as future billing infrastructure only

### 2026-03 — pointpoker brand + domain update
- Public domain references updated to `https://www.pointpoker.app` in `public/index.html`, `public/robots.txt`, and `public/sitemap.xml`
- Public-facing brand name updated from `Planning Poker` to `pointpoker` across app chrome, legal pages, manifest, and docs where it refers to the product name
- Generic SEO/category references to "planning poker" were preserved where they describe the product category rather than the brand

### 2026-03 — Support email + SEO metadata refinement
- Support contact updated to `support@pointpoker.app` in legal pages and app fallback copy
- `public/index.html` metadata refined for keyword coverage and share cards: stronger title/description, `application-name`, image alt text, and consistent canonical/OG URL with trailing slash
- `public/manifest.json` description updated to reflect planning-poker category keywords without stuffing

### 2026-03 — Senior quality hardening pass
- Accessibility semantics improved for segmented controls in `src/App.js` by adding explicit `type="button"` and `aria-pressed` states to auth, pricing, tab, currency, and role toggles
- Broken footer deep-links were fixed by adding real `#data` and `#contact` anchors to `public/privacy.html`
- Misleading and stale copy was corrected:
  - pricing now says `Facilitator mode` instead of `Observer mode`
  - checkout note no longer claims a trial before Stripe is live
  - `public/terms.html` now accurately states that live card billing is not yet enabled
- Structured SEO data was strengthened with `og:image:type`, `twitter:url`, and a matching `FAQPage` JSON-LD block in `public/index.html`
- Supporting internal copy/docs were cleaned up for brand consistency, including the self-hosted font note

### 2026-03 — Mobile voting stability fix
- Vote selection no longer toggles off when the same card is tapped again; selecting a card is now idempotent until the user chooses a different card or the round resets
- Vote cards now include explicit keyboard/button semantics plus `:focus-visible` styling and mobile tap hardening (`touch-action: manipulation`, no tap highlight)
- This change targets the reported defect where mobile users could see a card appear selected and then become unselected again in later rounds

### 2026-03 — Founder room confirmation + UI polish
- Confirmed no founder-room code change is needed for Ali's chosen team URL: `https://www.pointpoker.app/t/rpa-build-team` already maps to founder-enabled Pro access
- Standardised the create-account name placeholder to `Alex Johnson` so it matches the rest of the app
- Added branded gold scrollbars across the SPA and legal pages with the best cross-browser styling available:
  - Firefox via `scrollbar-width` / `scrollbar-color`
  - WebKit browsers via `::-webkit-scrollbar*`
- Removed the stale Google Fonts `@import` from `src/App.js` so runtime styling is consistent with the self-hosted font setup documented elsewhere

### 2026-03 — Founder room slug bug fix
- Fixed a regression in `teamCode()` where already-slugged names like `rpa-build-team` were being normalised to `rpabuildteam`
- This bug caused `/t/rpa-build-team` to fail the founder-room Pro bypass and incorrectly open the pricing modal instead of entering the team room
- Hyphens are now preserved during team slug normalisation, so clean team URLs and typed team names resolve consistently

### 2026-03 — Team-room routing + voter-capacity fixes
- Standard room URLs now use an explicit root path (`/?room=CODE`) instead of relative query strings that could accidentally attach to `/t/...` paths
- Team rooms now preserve the clean stable route format (`/t/<slug>`) after entry instead of rewriting the browser URL to `?team=...`
- Invite links now respect room type:
  - standard rooms share `/?room=CODE`
  - team rooms share `/t/<slug>`
- Capacity checks now count only `voter` roles, matching the product copy that facilitators and non-voting stakeholders do not consume voter slots
- Pricing and onboarding copy now consistently says `voters` where the code actually enforces voter limits

### 2026-03 — Re-vote timer blocker + route cleanup fix
- Fixed a blocker where auto-reveal could leave timer state partially active, causing the facilitator to lose the `Start Voting` control after `Re-vote this story`
- Timer state is now explicitly cleared on reveal, auto-reveal, re-vote, reset, and manual stop (`running`, `remaining`, `startedBy`)
- Leaving a room, ending a room, expiry teardown, and deleted-room fallback now all reset the browser URL back to `/` instead of leaving stale `/t/...` paths visible on the home screen

### 2026-03 — Join-screen stale state cleanup
- Leaving or ending a room now clears both `code` and `prefillTeam` app state before returning to home
- This prevents stale room/team values from leaking back into the home inputs after leaving a founder room

### 2026-03 — Firebase Auth accounts + account-aware Pro gating
- `firebase.js` now exports `auth` alongside `db`
- `LoginModal` now supports sign in, create account, password reset, and legacy Pro key activation
- `/users/{uid}` profile store added in Realtime Database for `email`, `displayName`, `plan`, `billingStatus`, timestamps
- `NavBar` now shows signed-in account state and log out
- `PricingModal` now requires an account before checkout and records checkout intent to `/users/{uid}`
- `validateAndSavePro(key, user)` upgrades the signed-in user record to `plan: "pro"` while preserving legacy localStorage compatibility
- Team Room creation is now gated to Pro/founder access instead of being open to every anonymous user
- `database.rules.json` now includes `/users/{uid}` rules; build verified with `npm run build`

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
- Role system: Voter (votes) / Facilitator (backend value: `observer`, facilitates and sees analytics)
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

- [ ] **Commit and push local changes to remote**
  ```bash
  cd ~/Documents/planning-poker && git push
  ```
  Local changes exist in the working tree and still need to be committed and pushed.

### DOMAIN / LAUNCH CONFIG

- [ ] Create `public/og-image.png` (1200×630px) for OG/Twitter meta preview
- [ ] Add `REACT_APP_SUPPORT_EMAIL` to Vercel environment variables
- [ ] Connect `www.pointpoker.app` to Vercel and verify production routing
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
- [ ] Replace temporary checkout-intent-only flow with real Stripe success/cancel handling once links or Checkout are live

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
| Stripe links are `#upgrade` placeholders | Pending Stripe setup | PricingModal is account-aware but cannot open a real paid checkout yet |
| Pro key must be manually added to Firebase | Temporary | Stripe webhook will automate in Phase 3 |
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
7. Hold every change to a high code-quality bar: self-review for bugs, regressions, edge cases, and incomplete logic before calling the task done.
8. Run the relevant verification after changes. At minimum, run `npm run build` after code changes to confirm zero errors/warnings before committing.

### After completing work

1. Move completed items from **§ Pending Work** into **§ Completed Work** with a date.
2. Update the relevant section (schema, components, constants, etc.) if it changed.
3. Add the new commit hash to **§ Commit History Summary**.
4. Update **§ Known Issues** if a known issue was resolved or a new one was found.
5. Update `PROGRESS.md` in the same task so future AI sessions inherit the current reality.
6. Update `AGENTS.md` too if the top-level project truth changed.
7. Do NOT rewrite sections you didn't touch.

### Coding conventions

- CSS class naming: `kebab-case`, namespace by component (e.g. `.footer-link`, `.chip-logo`, `.a-kpi`)
- Component function naming: `PascalCase`
- Firebase async calls: always `try/catch` or silent-fail for analytics; propagate errors for user-facing operations
- Toast notifications: call `showToast(msg)` — appears for 3.4s, non-blocking
- No external UI libraries — all UI is hand-coded CSS in the `CSS` string
- `track()` calls should never throw or break the main flow
- Pro key format: `PPRO-XXXX-XXXX-XXXX` (regex in `PRO_KEY_REGEX`)

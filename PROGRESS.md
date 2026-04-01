# pointpoker — Launch Progress Tracker
<!-- Share this file at the start of every session so Claude knows exactly where we are -->

## Current Truth Snapshot
- Brand: `pointpoker`
- Production domain: `https://www.pointpoker.app/`
- Support email: `support@pointpoker.app`
- Current phase focus: SEO Phase 2 rollout while keeping the live product stable
- Product state:
  - Firebase Auth email/password implemented and enabled
  - Auth QA passed
  - Core room-flow QA passed
  - Facilitator wording clarified
  - Privacy policy aligned with auth
  - Domain placeholders replaced with `www.pointpoker.app`
  - Copy, legal accuracy, accessibility semantics, and structured SEO hardened
  - Mobile vote-selection bug hardened so repeat taps no longer clear the selected card
  - Founder-enabled team room confirmed as `/t/rpa-build-team`
  - Founder-room slug regression fixed so `/t/rpa-build-team` no longer falls into pricing
  - Team-room URLs now stay clean and voter limits now count only voters
  - Re-vote flow no longer leaves facilitator stuck without `Start Voting`
  - Leaving or losing a room now returns the browser URL to `/`
  - Leaving a room now also clears stale room/team input state on the home screen
  - Vote cards now use optimistic client-side selection to stabilize mobile tap behavior
  - OG social image now exists at `public/og-image.png`
  - The visual design system has been modernised toward a cleaner 2026 casino-app look with brighter amber, deeper emerald surfaces, and more premium glass UI
  - Font system unified to Outfit only — Cormorant Garamond removed; display contexts (headings, card numbers, stats, pricing) use Outfit 700 with tight negative letter-spacing for a clean modern feel
  - OG social image now matches the refreshed UI theme and uses clearer, more readable social-preview text
  - Vercel Speed Insights is installed and mounted for production performance monitoring
  - The approved transparent brand mark is now used across the app’s logo sections
  - The app wordmark now displays as `Point Poker` with white `Point`, gold `Poker`, and stronger spacing/capitalization
  - The approved brand mark now also drives favicon and app-icon assets across browser and PWA contexts
  - NavBar now includes direct `Plans` and `FAQ` shortcuts to improve landing-page discoverability; `Plans` routes to the dedicated pricing page and `FAQ` jumps to the home FAQ section
  - JoinScreen now includes a compact plans overview section in addition to the pricing modal
  - Login/register/reset copy now more clearly separates free use from account-linked Pro access
  - Upgrade flow now returns signed-out users to pricing after account creation/sign-in instead of leaving them stranded
  - Pricing modal now makes free vs Pro account state clearer and explicitly blocks misleading checkout copy while Stripe links are still placeholders
  - Atlas QA signal recorded: auth modal looked clear, but live sign-in appeared to fail silently and Navbar `Plans`/`FAQ` did not appear in the tested deployment; this needs live-production recheck after deployment parity is confirmed
  - Short-term paid-user recommendation clarified: activation code remains the simplest clean entitlement path before live Stripe checkout exists
  - Pricing CTA now explicitly pivots to activation-code setup when checkout links are still placeholders
  - Auth modal now explains the short-term Pro path more clearly: create account, then activate Pro with code
  - Latest Atlas live check passed deployment parity, free auth, and signed-out upgrade flow on production
  - Atlas confirmed `Plans` and `FAQ` now exist and scroll correctly on the live site
  - Production Pro verification now passes end-to-end after account creation + activation:
    - sign-in works
    - activation code upgrades the account to Pro
    - navbar switches to `📊 History | <name> ✓ Pro | Sign out`
    - dedicated Team Room URL/share flow works
    - anonymous teammates can still join shared Team Room links with only name + role
  - Firebase rules for `/licenses/{key}` are now published in production and activation-code validation is live
  - LoginModal widened and rebalanced to feel more SaaS-like: primary auth actions first, activation code behind a secondary panel, pricing/help tertiary
  - LoginModal now has an explicit themed internal scrollbar and reduced vertical density on desktop
  - Root cause found for activation-code failure: Firebase rules did not expose `/licenses/{key}`; `database.rules.json` now includes a read-only `licenses` path for client validation
  - Activation UX tightened after Atlas review: anonymous users no longer see a runnable Pro-code form; they are explicitly gated into sign-in/create-account first, while signed-in users retain the real activation form with Enter support
  - Home screen is now account-aware: signed-in users no longer see the public marketing landing page, plans CTA, or FAQ nav; they see a workspace-style dashboard instead
  - Free users now see a simplified signed-in dashboard with Create/Join/Team actions plus a focused Upgrade-to-Pro route
  - Pro users now see a dedicated Team Room card with a stable account-linked room URL and one-click copy/open actions
  - User profiles now persist `teamRoomName`, enabling a stable dedicated Team Room identity for signed-in Pro accounts
  - Signed-in users now have their display name prefilled in room flows, and the footer becomes account-oriented rather than generic plan-marketing
  - Final polish pass after Atlas/Comet QA now fixes the remaining low-friction issues:
    - workspace copy-link button now shows `Copied!`
    - in-room copy buttons now show a visible copied state as well as the toast
    - pricing modal leaves the Pro-success state visible briefly before closing
    - permanent Team Room URL wraps cleanly rather than truncating
    - workspace `Open Team Room` now scrolls to the Team Room entry controls so it no longer feels inert
  - Stale-room cleanup is now hardened in the client: from the join/workspace screen, the app performs a throttled background sweep of `/rooms` and batch-removes sessions older than the 5-hour expiry window when they are clearly inactive (no timer running, no votes in flight, at most one lingering player, no story progress yet)
  - Firebase QA data cleaned for trustworthy regression testing:
    - free QA account `aliimrankhan86@googlemail.com` restored to `plan: free` / `billingStatus: inactive`
    - stale ad-hoc rooms removed from Realtime Database
    - persistent rooms retained: `ali-imran-team` and founder room `rpa-build-team`
  - Latest production QA findings from Atlas/Comet isolated one real remaining product-hardening cluster:
    - signed-out surfaces were still inheriting broad Pro state from local storage (`pp_pro`)
    - mobile navbar hid too much signed-in identity/history state
    - Team Room gating copy/CTA logic still confused Free users vs guest/shared-link entrants
  - Those issues are now fixed in code:
    - signed-out UI now resolves plan from authenticated account truth instead of broad local-storage Pro state
    - mobile navbar keeps signed-in account identity, sign-out, and Pro history access visible at narrow widths
    - Free Team Room tab now shows the real PRO gate again (badge + upgrade callout + upgrade CTA)
    - guest/shared-link Team Room entrants keep the low-friction join flow without being told "Your Pro account…"
    - Team Room CTA/readonly behaviour now differs correctly for Free, Pro, and guest states
    - signed-in footer copy is more account-aware and less public-marketing-heavy
    - follow-up hardening: shared Team Room mode is now route-bound rather than inferred from any stale `prefillTeam` state, and logout explicitly clears team/code URL state so Free users do not inherit a false Team Room-entry context from an earlier Pro session in the same browser
  - Follow-up fixes after the latest Comet pass:
    - workspace Team Room "Copy link" now uses the same explicit copied-state feedback pattern as the live-room invite button
    - workspace Team Room URL now renders as a single-line trust signal rather than wrapping mid-slug
    - signed-in Pro users who open their own bookmarked `/t/<team-slug>` URL now enter the room directly
    - guest join forms clear the previous signed-in user's display name on sign-out/shared-device flows
    - free-tier upsell strip is now suppressed inside Pro rooms even if Firebase auth is interrupted on another tab mid-session
  - Final polish after the latest Atlas rerun:
    - `Plans` anchor now lands closer to the actual plans cards instead of feeling too low
    - signed-in Free footer copy is now phrased as workspace guidance rather than public-marketing tagline copy
  - Final free-flow polish after the latest Atlas rerun:
    - the signed-in name field is now seeded but intentionally uncontrolled, so visible typed session names remain authoritative instead of being reimposed by account-state rerenders
    - signed-in room-name input now seeds once from account identity and then respects manual edits
    - creating or joining a room now uses the edited session name instead of silently reverting to the account display name
    - room-entry actions now read the latest typed name from a ref-backed value so fast interactions / automation timing do not fall back to the stored account name
    - room-entry actions now also read the live DOM input value first, so browser automation and blur/timing edge cases cannot fall back to the stored account name
    - late same-user auth/profile hydration no longer re-seeds the field after the user has already typed a custom name
    - room entry now carries the intended session name into the live room shell and reconciles the player record if needed, removing the last race between room creation/join and later state hydration
  - Final targeted Atlas recheck now confirms the last free-flow blocker is resolved:
    - edited signed-in session names persist correctly into the live room
  - Scrollbar polish refreshed again:
    - scrollbar tracks now use the same deep-green brand surface as the page background/body
    - scrollbar thumbs remain the existing gold/yellow accent
  - Production domain/routing confirmed live:
    - `https://www.pointpoker.app/` serves the live app
    - `/t/rpa-build-team` works correctly on the production domain
  - Sprint History UX polished for the Pro account experience:
    - fixed the history modal close-button styling regression caused by mismatched class names
    - empty-state messaging is now cleaner and more presentational
    - history stat cards / session rows now use a consistent class system instead of partially broken styles
  - Post-reveal estimate flow corrected:
    - the facilitator can no longer save a derived average like Fibonacci `4` when the active deck does not contain that value
    - reveal analytics remain visible for discussion, but the final recorded estimate must now be an explicit valid deck choice whenever votes differ
    - the split-vote chooser is now promoted into the main facilitator action block and auto-scrolls into view so it is difficult to miss after reveal
  - Room-entry validation tightened:
    - both Participant and Facilitator must provide a real name before entering a room
    - placeholder-like values such as `Alex Johnson` are now blocked instead of being accepted as live participant names
  - NavBar updated: Pro users see "📊 History" button; Free/anonymous users see "Upgrade to Pro" with updated subtitle listing Team Room, 20 players, and sprint history
  - SiteFooter updated: footer plan bar Pro column now mentions sprint history
  - GameScreen: free-user upgrade strip copy updated to mention sprint history and 20 players
  - PricingModal: PRO_FEATURES and FREE_FEATURES updated to include sprint history as a Pro differentiator
  - Sprint History feature (Pro-only) fully implemented:
    - `saveSessionHistory()` utility writes session records to Firebase `/history/{uid}` on session end or auto-expire
    - Session auto-expire extended to 5 hours (was 3 hours); toast updated to confirm data was saved
    - `authUserRef`, `currentPlanRef` refs added (alongside existing `roomDataRef`) to avoid stale closures in endSession and auto-expire interval
    - `sprintHistory` state and Firebase listener subscribe to `/history/{uid}` for authenticated Pro users
    - `HistoryModal` component renders insights (avg velocity, best sprint, alignment %, trend) and a chronological sprint list with team name, date, points, stories, consensus %, and duration
    - NavBar wired with `onHistory` prop; HistoryModal rendered as an overlay in App
    - `database.rules.json` updated with `/history/{uid}` read/write rules (owner-only, with field validation)
  - `npm run build` passes cleanly
  - NavBar button alignment fixed (subtitle uses `position: absolute` so buttons sit level)
  - `TermsPage` component: full English-law Terms of Service with liability cap, disclaimer, acceptable use, indemnification
  - `PrivacyPage` component: full UK GDPR / DPA 2018 Privacy Policy (legal basis, all 7 DSAR rights, ICO reference, processor details for Firebase/Vercel/Stripe, data retention, international transfers)
  - `LegalPage` shared layout shell
  - SPA routing: `screen` state initialised from `window.location.pathname`; `navTo()` helper added
  - Footer legal links now use `onNavTerms`/`onNavPrivacy` SPA callbacks (no dead `<a>` hard-nav)
  - Cookie banner links open in new tab; banner copy updated to accurately describe essential-only storage
  - `vercel.json` updated with `/terms` and `/privacy` rewrites for direct URL and browser refresh
  - `npm run build` clean — 180.9 kB gzipped
- Facilitator controls + Team Alignment redesign (29 March 2026 — third session):
  - Team Alignment `fillClass` now "neutral" (not "ok") until 2+ stories are done — prevents a single non-consensus story rendering a red bar immediately
  - `alignLabel` suppressed until `storiesDone >= 2`; renamed "Needs work" → "Low consensus" — coaching signal, not a pass/fail grade
  - Low-score colour changed from red (#e74c3c) to amber — same visual language as gold design system, not error-red
  - Neutral bar fill added (.a-align-bar-fill.neutral) for early-session state
  - Score display handles null alignLabel cleanly (shows "X%" alone before label is active, not "null · X%")
  - Added `.a-align-note`: "% of stories where all voters agreed on the first vote" — explains the metric inline
  - "agreed first round" → "agreed first vote" in alignSub — clearer plain language
  - `.obs-danger-divider` added above End Session — thin amber/red hairline rule with "END SESSION" label separates management controls from the destructive terminal action
  - `.btn-new-session` changed from red to neutral ghost — New Sprint is a management action, not a danger action
  - `.obs-secondary-row .btn-new-session:only-child` gets `flex: 1` so standalone New Sprint fills the row instead of hanging left
  - Pre-reveal "New Sprint" hidden when `round === 1 && storiesDone === 0` — nothing to reset at true session start
  - End Session button label shortened to "End Session" (hint text already explains consequences)
  - `npm run build` clean — 187.27 kB gzipped — commit `07f3b8d`
- UX/IA improvements (29 March 2026 — second session):
  - PRO badge on Team Room tab was backwards: it showed for Pro users (redundant) and not for non-Pro users (where it's needed). Fixed — badge now shows only for non-Pro users so the gate is visible before attempting to use the feature.
  - Inline `team-pro-gate` callout added inside the Team Room tab content for non-Pro users: explains the feature requires Pro, shows a team name preview so the value is tangible, and links directly to the pricing modal.
  - Workspace quick-action buttons now directly submit instead of switching tab + scrolling. Pro "Enter Team Room →" calls `onTeamRoom()` immediately with pre-filled values. Free "Create Room →" calls `onCreate()` immediately. Both are genuine 1-click actions for returning users.
  - Free workspace card CTA order fixed: "Create Room →" is now the gold primary CTA, "Upgrade to Pro" is the secondary — matches what a free user actually wants to do first.
  - `solo-invite-banner` added to GameScreen: when the room has only 1 player (the creator), a gold dismissible banner appears in the game area with a direct "Copy invite link" button. Dismisses on copy or manual close. Addresses the first-action gap between creating a room and getting the team in.
  - `npm run build` clean — 186.94 kB gzipped
- Infrastructure completed (29 March 2026):
  - `REACT_APP_SUPPORT_EMAIL` set in Vercel ✅
  - All Firebase env vars confirmed in Vercel ✅
  - Firebase Database Rules deployed with history path ✅
  - Code committed and pushed — Vercel auto-deploy triggered ✅
- Remaining priorities:
  - Identify which of the two `misteraliimran@gmail.com` Firebase user records is the real active auth-linked profile before deleting any duplicate
  - Run the broader manual E2E checklist on production if desired (see `QA_TEST_PLAN.md`) — focused product-critical QA is already passing
  - Replace Stripe placeholder links and finish paid activation wiring
  - Verify a real Pro account end-to-end once live Stripe links exist

Treat this section as the fastest current-status read. Historical session notes below are useful context, but this snapshot is the authoritative present-tense state.

---

## 🗓 Last Session
- **Date:** 1 April 2026
- **Chat name:** planning-poker
- **Worked on:** SEO Phase 2 first-wave implementation
- **Completed:**
  - Added dedicated indexable marketing routes for `/pricing`, `/features`, `/planning-poker-online`, `/scrum-poker`, `/story-point-estimation`, and `/remote-sprint-planning`.
  - Added unique route-level metadata and canonical handling for each new marketing route while keeping legal and room/session URLs non-indexable.
  - Added crawlable internal linking from the signed-out footer and home-page SEO content into the new marketing routes.
  - Updated `vercel.json` rewrites so the new marketing routes load correctly on direct visit and refresh.
  - Expanded `public/sitemap.xml` to include the new indexable marketing URLs.
  - Kept the live app safe by limiting the work to additive routing, metadata, content, and internal linking rather than touching room/auth/gameplay logic.
  - `npm run build` passed.

---

## 📍 Current Status
**Phase:** 2 — SEO growth layer now in first-wave delivery while live product flows remain stable
**Active step:** move from the new marketing-route rollout into supporting content, trust signals, and Search Console operational work
**Remaining:** Search Console setup/submission, supporting guide/trust content, Firebase user-record cleanup, then Stripe/payment work when resumed

## Update Rule
- Any AI that completes a meaningful task must update this file in the same task.
- Update at least:
  - `Current Truth Snapshot`
  - `Last Session`
  - `Current Status`
  - the relevant phase rows
  - the dated session log entry
- Do not leave this file stale for a later tool or later session unless the user explicitly says not to edit it.

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
| 1.2 | Firebase Email/Password auth | ✅ Done | UI shipped and verified: sign up, sign in, reset password, NavBar account state, `/users/{uid}` profile persistence. Email/Password provider enabled in Firebase Console. |
| 1.3 | Invite system (up to 11 members) | ⏳ Not started | Invite link = room URL — capacity enforcement already done in 1.1 |
| 1.4 | Register custom domain | ✅ Done | Domain purchased: `www.pointpoker.app` |
| 1.5 | Connect domain to Vercel | ✅ Done | Production domain is live and confirmed working, including `/t/rpa-build-team` |

---

## 🔄 PHASE 2 — SEO Overhaul (IN PROGRESS)
| Step | Task | Status | Notes |
|------|------|--------|-------|
| 2.1 | Update public/index.html — title, meta, OG tags | ✅ Done | Session 7 |
| 2.2 | Add JSON-LD structured data to index.html | ✅ Done | SoftwareApplication schema. Session 7 |
| 2.3 | Add robots.txt to /public | ✅ Done | Session 7 |
| 2.4 | Add sitemap.xml to /public | ✅ Done | Session 7. Updated to `www.pointpoker.app` in Session 9e. |
| 2.5 | Add content section to JoinScreen (features, FAQ) | ✅ Done | Session 8. Semantic HTML: h2/h3/h4/p/ol/ul/FAQ grid. Keyword-rich, WCAG compliant, responsive. |
| 2.6 | Google Fonts preconnect + Core Web Vitals | ✅ Done | display=swap confirmed. Preconnect in index.html head. Session 7/8. |
| 2.7 | Register Google Search Console + submit sitemap | ⏳ Not started | Ali to do manually after domain purchase |
| 2.8 | Create OG social image (1200×630px) | ✅ Done | Added as `public/og-image.png` in Session 9o |
| 2.9 | Add dedicated indexable marketing routes | ✅ Done | `/pricing`, `/features`, `/planning-poker-online`, `/scrum-poker`, `/story-point-estimation`, `/remote-sprint-planning` now render unique route content in the SPA. |
| 2.10 | Expand route-level metadata + internal linking for marketing pages | ✅ Done | Route-specific title/description/canonical added; signed-out footer and home content now link into the new marketing routes. |
| 2.11 | Expand SPA rewrites + sitemap for marketing routes | ✅ Done | `vercel.json` rewrites and `public/sitemap.xml` now include the new indexable URLs. |

---

## ⏳ PHASE 3 — Monetisation (NOT STARTED)
| Step | Task | Status | Notes |
|------|------|--------|-------|
| 3.1 | Set up Stripe account | ⏳ Not started | Ali to do manually |
| 3.2 | Add freemium tier logic to App.js | 🔄 In progress | Team Room is now gated behind Pro/founder access; room create still uses free/pro plan state from account or key |
| 3.3 | Build Stripe Checkout flow | 🔄 In progress | Pricing modal is account-aware and records checkout intent; still needs real Stripe Payment Links or Checkout |
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

### Session 9 — 28 March 2026 (Auth + monetisation foundation)
- **Firebase rules deployed:** User manually published `database.rules.json` to Realtime Database. Story totals and analytics now work correctly in live testing.
- **Firebase Auth wired in code:** `src/firebase.js` now exports `auth`. `LoginModal` now supports sign up, sign in, password reset, and Pro key activation.
- **User profile persistence added:** `/users/{uid}` stores `email`, `displayName`, `plan`, `billingStatus`, timestamps, and optional checkout/pro-key metadata. New RTDB rules added for authenticated self-read/self-write only.
- **NavBar updated:** Signed-in users now see their account label, plan badge, and a log-out action.
- **Pricing modal updated:** Checkout now requires a signed-in account and records checkout intent before redirect. Still blocked on real Stripe links replacing `#upgrade`.
- **Pro gating tightened:** Team Rooms are no longer open to every anonymous visitor; they now require Pro or founder access.
- **Build verification:** `npm run build` completed successfully.
- **Manual follow-up required:** Enable Firebase Console → Authentication → Sign-in method → Email/Password, then update `public/privacy.html` to disclose account storage/password resets.

### Session 9b — 29 March 2026 (Permanent quality gate)
- **AGENTS.md updated:** Added a standing quality gate requiring self-review for bugs/regressions, mandatory verification on every code task, and `PROJECT.md`/`PROGRESS.md` updates whenever project state changes.
- **PROJECT.md instructions updated:** Future tasks must explicitly pass a code-quality review and run verification, with `PROGRESS.md` updated in the same task.

### Session 9c — 29 March 2026 (Console enablement + facilitator UX)
- **Firebase Console tasks completed:** Email/Password sign-in provider enabled in Firebase Authentication. Updated Realtime Database rules re-published so `/users/{uid}` is live.
- **Manual auth QA passed:** Account creation, sign in, sign out, password reset, Firebase Authentication user creation, and `/users/{uid}` persistence all worked as expected.
- **Manual room-flow QA passed:** Free room create/join, participant voting, reveal, timer, re-vote/new round, leave/rejoin, end session, and Team Room free-user block all passed when the room creator used the facilitator role.
- **Facilitator wording fixed:** Join-screen role copy now labels the non-voting host role as `Facilitator` instead of user-facing `Observer`; in-room copy now consistently refers to the facilitator controls and `Facilitator · No vote`.
- **Build verification:** `npm run build` completed successfully after the copy changes.

### Session 9d — 29 March 2026 (Privacy policy aligned with auth)
- **Privacy policy updated:** `public/privacy.html` now accurately discloses Firebase Authentication account data, password reset emails, signed-in browser storage, and the distinction between temporary room data and persistent account data.
- **Product/docs alignment restored:** Removed the remaining documented mismatch between the shipped auth system and the legal/privacy copy.
- **Build verification:** `npm run build` completed successfully after the policy update.

### Session 9e — 29 March 2026 (pointpoker domain + brand update)
- **Domain received from user:** Production domain is now `www.pointpoker.app`.
- **Public domain references updated:** `public/index.html`, `public/robots.txt`, and `public/sitemap.xml` now use `https://www.pointpoker.app`.
- **Branding updated:** Public-facing product name changed from `Planning Poker` to `pointpoker` across app chrome, manifest, privacy/terms pages, README, and tracker headings where they refer to the brand.
- **SEO/category wording preserved:** Generic "planning poker" terminology remains in descriptive copy where it helps explain the product category and search intent.
- **Remaining launch items after domain purchase:** Vercel domain connection/deployment verification, support email wiring, Stripe links/webhook.
- **Build verification:** `npm run build` completed successfully after the domain/brand update.

### Session 9f — 29 March 2026 (Support email + SEO metadata polish)
- **Support email set in code/docs:** Public legal pages and app fallback copy now use `support@pointpoker.app`.
- **SEO metadata refined:** `public/index.html` title, description, keywords, application name, OG/Twitter copy, image alt text, and canonical consistency were tightened for stronger code-level SEO.
- **Manifest copy refined:** `public/manifest.json` description now better reflects the product category and search intent.
- **Remaining launch step:** still set `REACT_APP_SUPPORT_EMAIL=support@pointpoker.app` in Vercel so production uses the configured address rather than fallback code.

### Session 9g — 29 March 2026 (Senior quality hardening pass)
- **Accessibility semantics improved:** Segmented controls in `src/App.js` now use explicit `type="button"` and `aria-pressed` states for auth mode, pricing toggle, currency switcher, create/join/team tabs, and role selection.
- **Copy consistency fixed:** Pricing copy now says `Facilitator mode` instead of stale `Observer mode`. The temporary checkout note no longer implies a trial before Stripe is live.
- **Legal accuracy improved:** `public/terms.html` now accurately states that live Stripe card billing is not yet enabled while keeping future billing terms clear. The Last updated date was normalised to `29 March 2026`.
- **Broken legal anchors fixed:** `public/privacy.html` now includes working `#data` and `#contact` anchors used by the footer links.
- **Structured SEO improved:** `public/index.html` now includes `og:image:type`, `twitter:url`, and a matching `FAQPage` JSON-LD block aligned with the visible FAQ content on the landing page.
- **Docs cleaned up:** Internal font notes and tracker files were refreshed so future AIs inherit the current product truth instead of stale intermediate assumptions.

### Session 9h — 29 March 2026 (Mobile vote-selection hardening)
- **Reported defect:** On mobile, a vote could appear selected and then become unselected again during later rounds, especially after repeated taps.
- **Likely root cause removed:** Vote selection previously toggled the same card back to `null` when tapped again. That behavior is now disabled; selecting a card is idempotent until the user actively chooses a different card or the round resets.
- **Interaction semantics improved:** Vote cards now expose `role="button"`, keyboard activation, `aria-pressed`, `:focus-visible`, and mobile tap hardening via `touch-action: manipulation`.
- **Verification:** `npm run build` completed successfully after the fix.

### Session 9i — 29 March 2026 (Founder room confirmation + scrollbar polish)
- **Founder room confirmed:** No code change was needed for Ali's preferred internal team URL. `https://www.pointpoker.app/t/rpa-build-team` already maps to founder-enabled Pro access with the current allowlist.
- **Placeholder consistency:** The create-account full-name placeholder now uses `Alex Johnson`, matching the rest of the app.
- **Scrollbar styling:** Added branded gold scrollbars across the SPA, pricing modal, and legal pages using the best available browser APIs (`scrollbar-color` for Firefox, `::-webkit-scrollbar*` for Chromium/Safari).
- **Font-loading consistency:** Removed the stale Google Fonts `@import` from `src/App.js`, leaving the self-hosted font setup as the single active source.

### Session 9j — 29 March 2026 (Founder room pricing regression fix)
- **Major bug reported:** Entering the founder team URL `https://www.pointpoker.app/t/rpa-build-team` and choosing Facilitator incorrectly opened the pricing modal.
- **Root cause:** `teamCode()` stripped hyphens from already-slugged input, so `rpa-build-team` became `rpabuildteam` during the founder-room check and failed the allowlist match.
- **Fix:** Team slug normalisation now preserves hyphens while still cleaning unsafe characters.
- **Expected result after fix:** `/t/rpa-build-team` enters the founder room directly and retains founder-level Pro access instead of prompting for pricing.

### Session 9k — 29 March 2026 (Deeper routing and capacity bug pass)
- **Additional defects found during adversarial review:**
  - standard room URLs were being written as relative `?room=...`, which could attach to `/t/...` paths
  - team-room entry rewrote clean `/t/<slug>` URLs back to `?team=...`
  - invite links did not reliably preserve the correct room-type URL
  - voter limits counted all players instead of only `voter` roles, contradicting the product copy
- **Fixes applied:**
  - standard rooms now use `/?room=CODE`
  - team rooms now stay on `/t/<slug>`
  - shared invite links now preserve the correct room URL type
  - room-capacity enforcement now counts only voters, so facilitators/non-voting stakeholders do not consume a voter slot
  - copy now says `voters` where voter limits are actually enforced

### Session 9l — 29 March 2026 (Re-vote blocker and stale-route cleanup)
- **Atlas-found blocker:** After `↺ Re-vote this story`, the facilitator could lose the `Start Voting` control and both sides became stuck.
- **Likely root cause fixed:** Auto-reveal and reveal transitions were not fully clearing timer state. Timer state is now explicitly reset on reveal, auto-reveal, re-vote, reset, and stop.
- **Home-route cleanup fixed:** Leaving a team room, ending a session, expiry teardown, or landing on a deleted room now resets the URL back to `/` instead of leaving stale `/t/...` paths on the home UI.
- **Verification:** `npm run build` completed successfully after the fixes.

### Session 9m — 29 March 2026 (Home-state cleanup after leave)
- **Atlas-found suspicious behavior:** After leaving a team room, the home UI could still retain stale room/team input state even though the URL had been reset to `/`.
- **Fix:** Leaving, expiry teardown, deleted-room fallback, and end-session cleanup now clear both `code` and `prefillTeam` state before returning to home.
- **Expected result:** The join screen returns to a genuinely clean home state instead of carrying over `rpa-build-team` into the next action.

### Session 9n — 29 March 2026 (Optimistic mobile vote fix)
- **User-reported issue persists:** On mobile, a tapped vote card could still appear to select and then unselect.
- **Likely root cause:** The selected visual state depended entirely on the latest Firebase snapshot, so transient real-time lag could momentarily clear the highlight even when the tap had been registered.
- **Fix:** Vote cards now use native `button` elements and optimistic local selection state. The chosen card is highlighted immediately on tap, then reconciled with Firebase once the remote vote catches up.
- **Reset behavior:** Optimistic state clears safely on reveal, round change, or when the server state matches.

### Session 9o — 29 March 2026 (OG social image)
- **Asset created:** Added `public/og-image.png` at `1200x630` for Open Graph and Twitter previews.
- **Visual direction:** Dark green felt background, gold pointpoker wordmark and chip motif, layered planning cards, and a short supporting tagline.
- **Integration status:** `public/index.html` was already configured to reference `/og-image.png`, so this completes the missing asset rather than changing metadata wiring.

### Session 9p — 29 March 2026 (Modern casino UI refresh)
- **Design direction updated:** The core UI was shifted from a more rustic gold-on-green look toward a cleaner 2026 casino-product feel.
- **Palette refresh:** Deepened the emerald/black backgrounds and replaced the older muddy amber tones with brighter premium amber plus small mint/aqua accent usage.
- **Surface refresh:** Modernised the join screen, panels, navbar, pricing modal, auth modal, footer, toast, and cookie banner with stronger glass surfaces, softer borders, and more premium shadows.
- **Interaction refresh:** Updated CTA buttons, role/deck/tab toggles, facilitator controls, and timer controls for a more modern feel without changing product logic.
- **Verification:** `npm run build` completed successfully after the visual refresh.

### Session 9q — 29 March 2026 (OG image refreshed for new theme)
- **Social asset updated:** Rebuilt `public/og-image.png` to match the modernised emerald/amber visual system instead of the older rustic version.
- **Readability improved:** Headline, supporting copy, and feature pills were redrawn for stronger contrast and better legibility in shared link previews.
- **Visual consistency:** The new OG image now matches the refreshed product chrome with darker emerald backgrounds, cleaner glass panels, and brighter premium amber highlights.

### Session 9r — 29 March 2026 (Vercel Speed Insights)
- **Performance telemetry added:** Installed `@vercel/speed-insights` and mounted `<SpeedInsights />` in `src/index.js`.
- **Compatibility note:** Package installation required `--legacy-peer-deps` because the current CRA/TypeScript dependency tree conflicts with Vercel's newer peer expectations.
- **Outcome:** Production deployments can now start reporting field-performance metrics in Vercel Speed Insights.

### Session 9s — 29 March 2026 (Brand mark integrated)
- **Transparent asset accepted:** The provided PNG already contained a proper alpha channel, so no background-removal work was needed.
- **Logo-section integration:** Added `public/brand-mark.png` and replaced the old inline chip SVG with the approved brand mark across the navbar, footer, join screen, login modal, and room header.
- **Behavior preserved:** Existing wordmark layout stayed intact, while hover behavior was softened so the new logo behaves like a modern product mark rather than a rotating casino chip.
- **Verification:** `npm run build` completed successfully after the brand-mark swap.

### Session 9t — 29 March 2026 (Wordmark refinement)
- **Brand text refined:** App chrome now uses a styled `Point Poker` wordmark instead of plain lowercase `pointpoker`.
- **Color treatment:** `Point` is white, `Poker` uses the theme gold, and the separation between the words is explicit.
- **Typography direction:** The wordmark treatment now uses a stronger sans-serif style for a cleaner premium product-brand feel alongside the new symbol.
- **Verification:** `npm run build` completed successfully after the wordmark update.

### Session 9u — 29 March 2026 (Favicon + app icons aligned)
- **Favicon updated:** Regenerated favicon assets from the approved transparent `brand-mark.png`, including `favicon.ico` and `favicon-32.png`.
- **PWA icon update:** Regenerated `logo192.png` and `logo512.png` from the same approved brand mark so app installs and touch icons match the live logo system.
- **HTML/manifest wiring updated:** `public/index.html` and `public/manifest.json` now point browser and app-icon contexts at the new generated assets.
- **Verification:** `npm run build` completed successfully after the icon refresh.

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
| public/sitemap.xml | public/ | Sitemap — now points to `www.pointpoker.app` |
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

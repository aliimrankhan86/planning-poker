# pointpoker — Launch Progress Tracker
<!-- Share this file at the start of every session so Claude knows exactly where we are -->

## Current Truth Snapshot
- Brand: `pointpoker`
- Production domain: `https://www.pointpoker.app/`
- Support email: `support@pointpoker.app`
- Current phase focus: SEO Phase 3 trust/support/proof content, Search Console monitoring, notification/deployment hardening, and Estimation Mode feature
- Product state:
  - **Estimation Mode feature now live in code (2026-04-08):** facilitators choose "User Stories" or "Tasks" at room creation; selection stored in Firebase as `estimationMode`; all in-room copy (queue title, banners, progress, toasts, button labels, analytics KPIs, export) adapts dynamically to the chosen mode; mode picker shown on Create and Team Room tabs (2-button toggle styled consistently with the deck picker); `database.rules.json` and `database.rules.publish.json` updated with write-once validated `estimationMode` field; marketing copy updated across features page, JoinScreen SEO section, PricingModal feature list, and FAQ; build passes clean — **pending Firebase rules publish to production, including the new founder-room slug allowance for `/t/rpa-discovery-team`**
  - Firebase Auth email/password implemented and enabled
  - New account registration now sends a Firebase Auth verification email
  - Registration now stays in an explicit verification step inside the auth modal, with a visible continue action and a resend-verification action instead of auto-closing immediately
  - Fresh-account Pro activation now preserves `createdAt` on the profile update, preventing the transient first-attempt activation failure Comet saw under the strict `/users/{uid}` rules
  - Pro activation now retries the final profile-upgrade write and runs a recovery reconciliation if the activation key claim succeeded but the profile did not finish flipping to Pro cleanly
  - Auth QA passed
  - Core room-flow QA passed
  - Facilitator wording clarified
  - Privacy policy aligned with auth
  - Domain placeholders replaced with `www.pointpoker.app`
  - Copy, legal accuracy, accessibility semantics, and structured SEO hardened
  - Mobile vote-selection bug hardened so repeat taps no longer clear the selected card
  - Founder-enabled team rooms now include `/t/rpa-build-team` and `/t/rpa-discovery-team`; the discovery room defaults to the T-shirt deck on first creation/entry
  - Founder-room slug regression fixed so `/t/rpa-build-team` no longer falls into pricing
  - Team-room URLs now stay clean and voter limits now count only voters
  - Re-vote flow no longer leaves facilitator stuck without `Start Voting`
  - Leaving or losing a room now returns the browser URL to `/`
  - Leaving a room now also clears stale room/team input state on the home screen
  - Vote cards now use optimistic client-side selection to stabilize mobile tap behavior
  - OG social image now exists at `public/og-image.png`
  - The visual design system has been modernised toward a cleaner 2026 casino-app look with brighter amber, deeper emerald surfaces, and more premium glass UI
  - Font system unified to Outfit only — Cormorant Garamond removed; display contexts (headings, card numbers, stats, pricing) use Outfit 700 with tight negative letter-spacing for a clean modern feel
  - OG social image now uses a stronger, more product-led social-preview composition with clearer hierarchy, visible facilitator/split-vote cues, and more explicit Team Room / capacity messaging
  - Vercel Speed Insights is installed and mounted for production performance monitoring
  - The approved transparent brand mark is now used across the app’s logo sections
  - The app wordmark now displays as `Point Poker` with white `Point`, gold `Poker`, and stronger spacing/capitalization
  - The approved brand mark now also drives favicon and app-icon assets across browser and PWA contexts
  - NavBar now includes direct `Plans`, `Support`, `Trust`, and `FAQ` shortcuts to improve landing-page discoverability; `Plans` routes to the dedicated pricing page, `Support` and `Trust` route to their canonical marketing pages, and `FAQ` jumps to the home FAQ section
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
  - Pro users now see dedicated Team Room cards with stable account-linked room URLs and one-click copy/open actions
  - User profiles now persist account state in Firebase `/users/{uid}` for both free and Pro users
  - Pro accounts now carry a primary `teamRoomName` plus `teamRooms.secondary`, enabling two fixed dedicated Team Room URLs without breaking the original room slug
  - Pro users now get a clear workspace control to choose the dedicated Team Room name prefix; the app appends their username automatically so both saved room names and URLs remain account-unique
  - Signed-in free users now default into a faster Pro-activation path: upgrade actions open the account-linked activation flow directly instead of generic upsell-first messaging
  - Direct-to-Pro signup now returns straight into the activation state after account creation, rather than dropping the user back into a generic pricing state
  - Newly activated Pro users are now guided into Team Room setup in the workspace, with the naming control highlighted and focused so the next step is obvious
  - Signed-in Pro users no longer see upgrade/plan upsell inside the auth modal or pricing modal; those surfaces now switch to neutral Pro-account messaging and support actions instead
  - Free room capacity is now 8 total participants including the facilitator; Pro room capacity is 20 total participants including facilitators
  - Signed-in users now have their display name prefilled in room flows, and the footer becomes account-oriented rather than generic plan-marketing
  - Dedicated Team Room URL rows in the Pro workspace now use a more resilient grid layout and stack early on narrower widths so the copy-link control no longer clips out of the card
  - Pro activation keys are now single-account in repo logic: the app claims `/licenses/{key}` to one UID, shows a specific “already attached to another account” error on reuse, and auto-claims legacy Pro keys for existing users on sign-in
  - The stricter same-key-reuse guard also now exists in `database.rules.json` / `database.rules.publish.json`, but a fresh Firebase rules publish is still required before production enforces it
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
  - SEO trust/support layer now has its first live pages:
    - `/about` explains why pointpoker exists, what it optimises for, and the trust signals already in place
    - `/support` gives a clearer support/contact surface tied to `support@pointpoker.app` and explains common room/account questions
    - signed-out footer now links into About and Support so they are discoverable to users and crawlers
  - SEO trust/proof layer now includes a dedicated `/trust` route:
    - `/trust` brings public support/legal routes, authenticated email, account-linked Pro access, and room/data safeguards into one explanatory page
    - signed-out footer and home-page SEO copy now link into `/trust` so it is not orphaned from the discovery surface
    - `vercel.json` rewrites and `public/sitemap.xml` now include `/trust`
  - SEO educational guide layer is now underway:
    - `/what-is-planning-poker` now explains the method itself, why teams use it, and how pointpoker fits the workflow
    - `/fibonacci-story-points` now explains why agile teams use Fibonacci-style cards and why final estimates should remain deck-valid
    - the home-page SEO content now links into these guides so they are crawlable from the main entry surface
    - `/agile-estimation-tool` now targets the broader agile-estimation search intent and explains how pointpoker fits sprint planning and backlog refinement without trying to replace a full agile suite
  - Google Search Console initial setup is now completed:
    - domain ownership for `pointpoker.app` verified
    - `sitemap.xml` submitted successfully
    - `vercel.json` now explicitly redirects apex `pointpoker.app` traffic to `https://www.pointpoker.app/:path*`, so Search Console `Page with redirect` examples for bare-domain/http variants map to the intended canonical host instead of behaving like accidental duplicate URLs
    - crawlable homepage JSON-LD / FAQ copy in `public/index.html` now matches the live pricing truth (`8` free participants including facilitator, `20` Pro participants including facilitators, `2` dedicated Team Rooms, sprint history) instead of the older `6`-participant copy
    - homepage and key marketing routes requested for indexing
    - additional trust/support/guide routes also requested for indexing:
      - `/about`
      - `/pricing` (re-requested on 17 April 2026 after Atlas found it still unknown to Google in Search Console)
      - `/support`
      - `/trust` (re-requested on 17 April 2026 after Atlas found it still unknown to Google in Search Console)
      - `/what-is-planning-poker`
      - `/fibonacci-story-points`
      - `/agile-estimation-tool`
    - Atlas Search Console inspection on 17 April 2026 confirmed the canonical `www` setup is correct; the remaining lag is limited to `/pricing`, `/support`, and `/trust`, which have now been manually re-requested for indexing
  - Zoho Mail authentication is now correctly aligned for the production domain:
    - SPF passes
    - DKIM passes
    - DMARC passes
    - Gmail now recognizes outbound mail from `support@pointpoker.app` as authenticated
  - Notification architecture is now deployed live:
    - `functions/` contains backend email triggers for owner signup notifications and owner/user Pro activation emails
    - notification idempotency is tracked under `/ops/notifications/{uid}` so repeated profile writes do not resend the same message
    - the functions now explicitly target the App Engine default service account because this project is not deploying successfully with the default Compute service account
    - Firebase Functions are now deployed live with Zoho SMTP env configuration loaded from local `.env`
    - Artifact Registry cleanup is now configured to auto-delete function images older than 30 days
    - live Pro-activation email QA now passes:
      - owner Pro notification email arrives
      - user Pro confirmation email arrives
      - both dedicated Team Room URLs in email match the product UI
    - low-severity follow-ups remain:
      - owner Pro email subject was observed without the expected `: <user-email>` suffix
      - one transient first-attempt activation failure occurred in the account modal before succeeding through the pricing-page activation field
  - Firebase user-profile cleanup is now resolved:
    - the real active auth-linked Pro profile for `misteraliimran@gmail.com` is `MDCUAeZguYRjVUNMzZVmNSnUAp23`
    - the old orphaned Realtime Database profile `Di4gMRnSJ3XDALew1H1tH3ILZqs2` has been removed from `/users`
    - the active Pro profile now carries the correct merged Pro fields
  - Security hardening pass is now implemented in the repo:
    - new `/users/{uid}` profiles no longer bootstrap Pro status from legacy `pp_pro` browser storage
    - legacy `pp_pro` local storage is no longer written during activation and is cleared on sign-out/no-auth paths
    - `database.rules.json` now enforces active-license-backed Pro profiles, immutable room plan/deck metadata, deck-valid votes and recorded estimates, and blocks undeclared fields under `rooms`, `users`, and `history`
    - the hardened Firebase rules have now been published successfully in production
    - the latest live rules now also allow the optional `/users/{uid}/teamRooms` structure, so dual fixed Pro Team Rooms are accepted in production
    - `database.rules.publish.json` now exists as the comment-free console-safe companion for future Firebase rule updates
  - Post-rules live regression pass now passes:
    - Atlas confirms free sign-in, free room creation, Team Room gating, and real-name validation still work with the hardened rules
    - Comet confirms Pro sign-in, Team Room entry, split-vote resolution, re-vote flow, Sprint History access, and facilitator removal all work with no rules/write failures
    - the earlier non-blocking invite-copy note is now resolved: ad-hoc rooms explicitly describe themselves as temporary session links, while Team Rooms keep the permanent/reusable wording
  - Post-reveal estimate flow corrected:
    - the facilitator can no longer save a derived average like Fibonacci `4` when the active deck does not contain that value
    - reveal analytics remain visible for discussion, but the final recorded estimate must now be an explicit valid deck choice whenever votes differ
    - the split-vote chooser is now promoted into the main facilitator action block and auto-scrolls into view so it is difficult to miss after reveal
    - post-reveal facilitator flow now places a large `Next item to Estimate` CTA directly under `Who Picked What`, replacing the older lower-page `Next Round` style forward action and making the next step hard to miss in T-shirt sizing sessions
    - no-queue estimate recording now validates against the actual room deck again, fixing the facilitator next-item action in T-shirt rooms under the hardened Firebase rules
    - failed estimate saves now show an explicit toast instead of silently doing nothing
    - Sprint Analytics now exposes a dedicated T-shirt size breakdown with explicit XS/S/M/L/XL/XXL counts and swaps the top summary cards to `Most used size` and `Size mix` for T-shirt rooms
    - no-queue consensus rounds are now counted in that T-shirt breakdown too, so agreed T-shirt estimates no longer show as zero in the current session analytics
    - mixed-estimate sessions now keep the facilitator in the reveal flow: the agreed final size is chosen inline under `Who Picked What`, then saved and advanced without waiting for a delayed popup
  - Room-entry validation tightened:
    - both Participant and Facilitator must provide a real name before entering a room
    - placeholder-like values such as `Alex Johnson` are now blocked instead of being accepted as live participant names
  - NavBar updated: Pro users see "📊 History" button; Free/anonymous users see "Upgrade to Pro" with updated subtitle listing 2 Team Rooms, 20 participants, and sprint history
  - SiteFooter updated: footer plan bar Pro column now mentions sprint history
  - GameScreen: free-user upgrade strip copy updated to mention sprint history and 20 participants
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
  - Run the broader manual E2E checklist on production if desired (see `QA_TEST_PLAN.md`) — focused product-critical QA is already passing
  - Re-check Search Console after the next crawl so the current redirect validation settles around the intended `https://www.pointpoker.app/` canonical host
  - Re-check Search Console URL Inspection for `/pricing`, `/support`, and `/trust` after Google recrawls them
  - Configure and deploy the new notification functions so owner/operator signup + Pro emails become live
  - Replace Stripe placeholder links and finish paid activation wiring
  - Verify a real Pro account end-to-end once live Stripe links exist

Treat this section as the fastest current-status read. Historical session notes below are useful context, but this snapshot is the authoritative present-tense state.

---

## 🗓 Last Session
- **Date:** 10 August 2026
- **Chat name:** planning-poker
- **Worked on:** design-system spacing rhythm, button elevation, and the Sprint Analytics layout in the facilitator room
- **Completed:**
  - **A panel now owns the gap between its children.** Every block inside a room `.panel` used to declare its own margin — 14px from three analytics sections, 0 from the timer's Start-countdown button, 24px from a `<Grid>` — so no two gaps in one panel matched. The visible symptom was the Countdown length hint sitting 8px under the select it describes and 0px above the button below it: the helper had detached from its own control and attached to the next one. Two rules (`.panel > * + *` and `.panel > .ptitle + *`) replaced five scattered margins, and the ladder is now monotone: 8 inside a field, 12 under the panel eyebrow, 16 between blocks, 20 to the edge. Measured identical across the Estimation timer, At the Table and Sprint Analytics panels.
  - **Secondary buttons no longer blend into what they sit on.** `.pp-btn--secondary` was painted `--surface-1` — the exact value a `.panel` and a `.pp-card` paint themselves — so Re-vote, New sprint, Start countdown, Copy and CSV were the same colour as their container with a hairline as the only evidence they were pressable. They are `--surface-2` now (lighter on felt, darker on paper). That forced disabled down to `--tint-raise`, because disabled had been `--surface-2` and would otherwise have shared a fill with a live control.
  - **Sprint Analytics KPIs are rows, not tiles.** The three-up `<Grid min="96px">` auto-fitted two-up in the 258px a 300px rail leaves and orphaned the third on its own row, and its 24px gap was wider than the 14px between the panel's own sections. Three columns is not the repair either — a `--fs-6` value has no room in an 80px column. `.a-kpis` is now a flex column of label-left / value-right rows sharing `.prow`'s geometry, so the analytics panel and the players list in the same rail read as one product and the tabular values line up in a column. Panel height dropped 608px → 564px.
  - **One sub-heading treatment per panel.** Team Alignment was sentence case at 13px while Stories sized and Point distribution were tracked uppercase, so one panel announced three peer sections three ways. All three share `.a-section-title`'s treatment now.
  - **Off-scale spacing swept onto the 4px grid** across the room CSS: 3, 5, 6, 7, 10, 11, 14 and 26px margins/gaps/paddings replaced with `--sp-*` tokens in the observer controls, story queue, players list, results hero, revealed grid and analytics panel. Dead `.tsel` CSS deleted (the design-system `Select` replaced it).
  - **Documentation:** `docs/AI-CONTEXT.hand.md` gained three rules with their reasons; `src/design-system/README.md` gained "Elevation is what makes a button a button" with the four-state fill table.
  - **Verified:** 262 tests pass (7 new source-reading guards in `designsystem.test.js`). `npm run build` compiles clean, 15 prerendered routes. Live three-tab room walked end to end — consensus and split-vote paths, record commits, mid-round fallback controls — in dark and light at 1440px and 390px, zero console errors, zero horizontal overflow.
- **Data + resilience fixes (same session, second pass):**
  - **A new sprint now actually starts a new sprint.** `resetSession` zeroed `storiesDone`, `streak` and `consensusCount` and left every estimate that produced them: queued stories kept their `estimate`, `rounds` kept every recorded round, and `activeStory` stayed past the end of the queue — so the room sat on a story it had already sized, Sprint Analytics read "Stories sized 0" directly above "Stories sized (1)" listing an estimate, and the summary still totalled the previous sprint's points. The path list moved to a pure `sprintResetUpdates(roomData)` in `src/estimation.js`, because the bug was an omission from a list and a list is what a test can read. The backlog survives: story names are kept and the queue rewinds to index 0, since the confirm promises to clear votes and rounds, not to delete what someone typed. The confirm text now says exactly that.
  - **Five room writes could fail silently.** Room creation, join, team-room entry, add-story and remove-story each `await`ed a Firebase write with no `catch`, so a rules rejection or a dropped connection surfaced as an unhandled promise and a button that appeared to do nothing at all. Each one now logs and toasts, naming the action that failed.
  - **Verified:** 269 Jest tests (7 new on the reset payload) and **65 Firebase rules assertions** including three new ones proving the emulator's rules engine actually permits the reset's deletes — `stories/$i/estimate` and `rounds/$i` are both validated for the value going in, not for its removal, so a static reading could not settle it. Walked live in a three-tab room: queued story recorded at 8 points, New sprint, and the backlog came back with both names intact, both estimates gone, the queue rewound to story 1, and every panel agreeing on zero.
- **Known, not fixed:**
  - Nothing outstanding from this session.

---

## 📍 Current Status
**Phase:** 2 — SEO growth, with the design system now the working surface for product polish
**Active step:** monitor `/pricing`, `/support` and `/trust` indexing in Search Console; publish the current `database.rules.json` to the Firebase Console; continue additive trust/proof content
**Remaining:** trust/proof content, Search Console recrawl verification, Firebase rules publish, a broader production E2E sweep if desired. Monetisation stays parked — the product is free for everyone.

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
| 1.6 | Harden entitlement flow + Firebase rules | 🔄 In progress | Repo changes are done: legacy `pp_pro` fallback removed, Pro now requires active license-backed profile data, room deck/plan metadata is immutable, and deck-valid votes/estimates are enforced. Manual rules publish still required in Firebase Console. |

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
| 2.7 | Register Google Search Console + submit sitemap | ✅ Done | Domain ownership verified, sitemap submitted, and key marketing URLs requested for indexing on 1 April 2026 |
| 2.8 | Create OG social image (1200×630px) | ✅ Done | Added as `public/og-image.png` in Session 9o |
| 2.9 | Add dedicated indexable marketing routes | ✅ Done | `/pricing`, `/features`, `/planning-poker-online`, `/scrum-poker`, `/story-point-estimation`, `/remote-sprint-planning` now render unique route content in the SPA. |
| 2.10 | Expand route-level metadata + internal linking for marketing pages | ✅ Done | Route-specific title/description/canonical added; signed-out footer and home content now link into the new marketing routes. |
| 2.11 | Expand SPA rewrites + sitemap for marketing routes | ✅ Done | `vercel.json` rewrites and `public/sitemap.xml` now include the new indexable URLs. |
| 2.12 | Add trust/support routes and internal linking | ✅ Done | `/about` and `/support` now exist as indexable trust pages, with footer discovery and route-aware metadata. |
| 2.13 | Add educational guide pages and home-surface internal links | ✅ Done | `/what-is-planning-poker` and `/fibonacci-story-points` now exist with route metadata, sitemap entries, rewrites, and home-page discovery links. |
| 2.14 | Add agile-estimation landing page | ✅ Done | `/agile-estimation-tool` now exists with route metadata, rewrite, sitemap entry, and home-page internal linking. |
| 2.15 | Add dedicated trust/reliability page | ✅ Done | `/trust` now exists with route metadata, rewrite, sitemap entry, footer discovery, and home-surface internal linking. |

---

## ⏳ PHASE 3 — Monetisation (NOT STARTED)
| Step | Task | Status | Notes |
|------|------|--------|-------|
| 3.1 | Set up Stripe account | ⏳ Not started | Ali to do manually |
| 3.2 | Add freemium tier logic to App.js | 🔄 In progress | Team Room is now gated behind Pro/founder access; room create still uses free/pro plan state from account or key |
| 3.3 | Build Stripe Checkout flow | 🔄 In progress | Pricing modal is account-aware and records checkout intent; still needs real Stripe Payment Links or Checkout |
| 3.4 | Firebase Function webhook (payment events) | ⏳ Not started | Updates plan field in Firebase |
| 3.5 | Add upgrade prompt UI | ⏳ Not started | Shows when free tier limit hit |
| 3.6 | Add owner notifications for signups and Pro conversions | 🔄 In progress | Pro-activation emails now pass live QA; remaining work is fresh-signup email verification QA plus a fresh Functions deploy so the improved owner Pro-email subject goes live |

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

### Session 10 — 1 April 2026 (Security hardening)
- **Legacy client-side entitlement retired:** new authenticated profiles no longer inherit Pro state from `pp_pro`; activation no longer writes that key; sign-out/no-auth now clears it.
- **Rules tightened in repo:** `database.rules.json` now requires active-license-backed Pro profiles, freezes room plan/deck/founder metadata after creation, validates live votes and saved estimates against the active deck, and blocks undeclared fields in `rooms`, `users`, and `history`.
- **Important deployment note:** these protections are in the repo and committed locally, but Firebase Realtime Database rules still need to be re-published manually before they are live in production.
- **Build verification:** `npm run build` completed successfully.

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

### Session — 15 April 2026
**Bug: consensus recording blocked when votes agree**

- **Root cause:** `allSame` condition was `voted.length > 1` — single voter could never record (button rendered disabled with "Choose final estimate to continue" forever). Fixed to `voted.length >= 1`.
- **Consensus record button (UX):** Added `.btn-record-next.consensus` CSS class — larger padding, bigger font, pulsing green glow animation (`recordGlow`). Applied to both the story-queue path (`onRecordStory`) and no-queue path (`onNewRound`) when `allSame` is true.
- **Button label clarified:** Consensus path now reads `✅ Record [X] & Next Story/Round` instead of the previous split-vote label, making the action explicit.
- **Facilitator split-vote overlay — close button added:** Modal (`showFinalEstimateOverlay`) had no dismiss mechanism. Added:
  - ✕ button top-right of the card (`.facilitator-overlay-close`, absolute-positioned circle)
  - Backdrop click-to-close (`e.target === e.currentTarget` guard prevents inner clicks closing it)
  - Both call `setShowFinalEstimateOverlay(false)`

### Session — 10 August 2026
**Design-system overhaul: light theme, and the defects the sweep turned up**

Full stage-by-stage record with the reasoning and the measurements is in
[`docs/UI-OVERHAUL.md`](docs/UI-OVERHAUL.md). Summary:

- **Light theme rebuilt.** It occupied L\* 92.8–100 — a seven-point band at the
  top of the range, which is the "very bright" complaint. New five-rung
  `--paper-*` ramp, elevation that cannot invert mid-scroll, text and borders
  re-solved against the surfaces they actually land on. `--border-strong` went
  from 1.75:1 to 3.27:1, fixing a WCAG 2.2 SC 1.4.11 failure on every input,
  checkbox, switch and secondary button in the theme.
- **Keyboard focus was invisible in the light theme** — App.js painted the ring
  in `var(--gold2)`, 1.4:1 on paper, and beat the correct rule on injection
  order. Now `var(--focus)`.
- **`body { overflow-x: hidden }` had disabled every `position: sticky` in the
  app**, and was set twice (App.js and the boot CSS). Removed; the sweep proves
  no route overflows horizontally at 320, 375 or 1280.
- **The sign-in modal scrolled sideways on a phone** and put its submit button
  330px below the fold behind three paraphrases of one sentence. Fixed at the
  cause (`min-width: 0` on modal grid items, a segmented control that shrinks);
  submit now sits at 465px.
- **A signed-out phone could not reach an account** — Sign in was hidden below
  520px. It fits at 320px; the rule is gone.
- Observers no longer borrow the alert blue; the boot screen no longer flashes
  the old brighter cream; the Firefox scrollbar no longer paints brand brass on
  paper; the room no longer renders two banners.
- **289 tests passing** (from 269), including a new block guarding each of the
  above. Build 220.72 kB gzipped, +1.92 kB, no new dependency.

**Not done:** mid-vote / revealed / sprint-history / `/admin` screens not
re-swept with the v2 auditor; drawer and toast not reviewed in light.

### Session — 11 August 2026

Infrastructure, not interface. The work was deploying what previous sessions had
only written, and checking the "left for you" list item by item instead of
carrying it forward. **Four of nine items were already done** — the domain
placeholders, the OG image, Email/Password auth, and a Vercel env var that was
never needed because all six call sites already default to
`support@pointpoker.app`.

**Deployed to production**
- `database.rules.json` is live. This closes the oldest real bug in the product:
  `stories/$storyIndex/estimate` used two `.parent()` calls where it needed
  three, so every queued-story estimate had been failing with `permission_denied`
  since the queue shipped. Verified against the production database — an
  anonymous client can now write one, and the three new hardening rules deny the
  over-cap story index and the nonsense analytics date.
- Both Cloud Functions redeployed with instance caps.

**Cost.** Cloud Functions cannot run on Spark, which is the only reason the
project is on Blaze at all. The console's cost trend for 1 Aug 2025 – 31 Aug 2026
is a flat £0.00, and measured usage is ~0.006% of the invocation free tier. The
exposure was accumulation and abuse, now bounded three ways: Artifact Registry
cleanup 30 days → 3 (the usual source of a surprise Blaze bill, because images
accrue on every deploy and nothing in the console points at them), `maxInstances`
of 3 and 1 on the two functions (both previously able to scale to the
3000-instance default), and the rules caps on room size. The budget already
existed at £15 and is now £1, so alerts fire at 50p rather than £7.50. Google's
spend-cap enforcement — the one that pauses services — is greyed out for these
services, so no hard cap exists and the code-level ceilings are the real
protection.

**The two screens nobody could open.** `/admin` turned out to already have 11
tests covering both gates. The sprint-history modal had none, because
`HistoryModal` is private to `App.js`; its maths is now `sprintHistoryStats()` in
`estimation.js` with 9 tests. Suspected defect that was not one: the trend
compares the front half of the list against the back half, which is correct only
because `App.js` sorts by `endedAt` descending — a test now fails if that sort is
ever reversed.

`/licenses` held two dead flags from the deleted paid tier; backed up and removed.

**382 tests passing** (from 373). Lint clean. Build 224.32 kB.

**Not done:** no hard spend cap is available from Google for RTDB or Functions.

---

### Session — 11 August 2026 (evening)

**Brand mark replaced.** A new card-stack render (gold diamond, "P", Fibonacci
numbers up the edges) replaces the old mark everywhere. The master lives at
`assets/brand-mark-master.png`, outside `public/` so it never ships, and
`scripts/make-icons.py` regenerates all seven derivatives from it. Nothing is
trimmed: the artwork already touches all four sides.

- `brand-mark.png` is **176px, not 264px**. The largest any screen draws it is
  56px (join hero; nav 44, footer 36, room header 34), so 176 is 3.1x the
  biggest and still sharp at 3x DPR. That is 40.6 kB against the 90.6 kB a
  264px source cost, and below the 62.2 kB the old mark cost. It is the only
  icon on the page-load critical path, which is why it was worth measuring: at
  56px the 176 and 264 sources differ by a mean of 0.62/255 per channel.
- **Maskable icons added.** `logo192/512.png` were declared `"any maskable"`.
  Android crops a maskable icon to a squircle, and the new art is edge-to-edge,
  so its card corners were being cut off. Split into `purpose: "any"` plus new
  `logo512-maskable.png` / `logo192-maskable.png`, which put the mark on a felt
  plate inside the 80% safe zone.
- `favicon.ico` trimmed from 70.3 kB to 10.5 kB by dropping the 256px entry no
  browser asks an .ico for.
- `public/favicon.svg` deleted: 164.7 kB of the *old* mark, referenced from
  nowhere, shipped on every deploy.

**og-image rebuilt** (`scripts/make-og-image.py`, brand fonts read straight from
`public/fonts`). The old one still advertised "8 free participants. 20 on Pro."
and carried a PRO badge — false since the product went free — and three of its
pills were clipped by their own borders. Every string is measured before it is
drawn now. 95.5 kB, down from 187.3 kB. The `og:image` URL carries `?v=2`
because LinkedIn, Facebook, Slack and X key their unfurl cache on the URL and
would otherwise keep serving the Pro-tier card.

**Brand name normalised to "Point Poker"** — 101 replacements across App.js,
routeMeta.mjs, index.html, manifest.json, prerender.mjs and the design system.
Left lowercase on purpose, because they are identifiers rather than the brand:
`pointpoker.app` and the address on it, the `pointpoker-*.csv` download slugs,
and the `[pointpoker]` console tag. A test pins this.

**Accessibility.** Three of the six `BrandMark` call sites pass no `onClick` and
were still rendering a `<button>`: focusable, announced as a button, doing
nothing. They render a plain image now. The navbar wordmark button had *no
accessible name at all* — `aria-label` on the inner `<span>` is not exposed —
so it was a nameless control duplicating the home link beside it; it is now
`aria-hidden` with `tabIndex={-1}`, still clickable by pointer. Verified across
seven routes: one h1 each, no heading-level skips, no missing alt attributes, no
nameless controls, no aria-hidden focusable elements.

**Footer gap.** `.site-footer` had `padding-top: 48px` but no margin, so the
band sat flush on the section above — content ended and the footer's rule
started on the next pixel. `margin-top: var(--sp-16)`. Measured at 64px on all
15 routes, with no route pushed into a new scrollbar and no horizontal overflow
at 375 or 1280.

**391 tests passing** (from 382). Lint clean. Build 222.28 kB.

**Not done:** the `/trust` page has the same inverted `StatTile` that was fixed
on `/support` — a big gold "Direct" above the support address squeezed into an
uppercased caption. Left out of scope deliberately.

---

### Session — 11 August 2026 (late)

**Exports now carry the brand, and printing works at all.**

Printing any page was close to useless before this. The product is dark-first
and a browser strips background colours when it prints, so the felt vanished
and the cream text printed onto white paper as pale grey. There was no
`@media print` rule anywhere in the codebase.

- **Print stylesheet.** Paper white, ink black, whatever the on-screen theme
  was. Room chrome, navigation and every control is dropped, because a printed
  sheet cannot be clicked. Tables get `thead { display: table-header-group }`
  so the column names repeat when a long backlog runs to a second sheet, and
  `break-inside: avoid` keeps rows and cards whole.
- **A printable report** (`PrintReport`) sits in the DOM hidden, and `@media
  print` is the only thing that reveals it. That is what "Save as PDF"
  produces: mark, "Point Poker", the domain, the session title, room code,
  date, counts, the estimate table, and a signed footer. No popup window to be
  blocked, no second route to keep in sync, no PDF library — `window.print()`
  and the browser's own pipeline.
- **Mono printers need no second asset.** The mark separates on luminance, not
  hue: its dark green "P" against the gold diamond measures **8.2:1 in colour
  and 8.46:1 converted to greyscale**, so it survives the conversion slightly
  better than it looks in colour. Verified by rendering the report through a
  `grayscale(1)` filter. `print-color-adjust: exact` is still set so a colour
  printer is not asked to guess, and the mark is an `<img>` and never a
  background-image, because a background is exactly what "do not print
  background graphics" throws away.

**Where the brand can and cannot go.** A CSV cannot hold a logo, and a branding
row above the header would break the one thing the file is for: `/support` and
`/remote-sprint-planning` both promise it imports straight into Jira, Linear
and Azure DevOps, and every one of those readers takes row 1 as the column
names. So the CSV is branded on the **filename** only —
`Point-Poker-<room>-<date>.csv`, and `Point-Poker-analytics-<date>.csv` on the
admin export — and the data stays machine-clean. A test fails if anyone adds a
preamble row later. The clipboard summary is free text, so that one does sign
itself with a closing "Estimated with Point Poker" line.

New analytics event `feature_pdf`, which matches the rules' event-name pattern
and is registered in the admin dashboard's FEATURES list.

**398 tests passing** (from 391). Lint clean, zero warnings. Build 224.12 kB.

**Known limit:** only the first printed sheet carries the logo header. Repeating
it on every sheet needs CSS running headers (`position: running()`), which no
browser supports; the repeating `thead` and the footer are what carry the brand
onto later pages.

### Session — 11 August 2026 (night)

**Competitor SEO teardown, then three pages for the queries we answered nowhere.**

Pulled the raw HTML of eight ranking competitors and harvested **854 real
queries** from Google's autocomplete endpoint, alphabet-expanded across the head
terms, rather than guessing at keywords. What the field actually ships:

| Site | Home words | Schema | Verified free-tier limit |
|---|---|---|---|
| planningpokeronline.com | 553 | none | 9 votes + 5 issues per game |
| kollabe.com | 1,733 | SoftwareApplication | 10 members per room |
| planningpoker.live | 2,381 | WebApplication + AggregateRating | credits to create a room |
| scrumpoker-online.org | 1,884 | FAQPage, 7× hreflang, a blog | ads on the free tier |
| planitpoker.com | 248 | none, and no canonical | — |
| pointingpoker.com | 449 | none | runs Google ads |

Our plumbing was already ahead of most of them. The gap was coverage and depth.
Three clusters had real volume and zero coverage here:

- **The naming cluster.** `pointing poker`, `poker planning`, `sprint poker`,
  `estimation poker`, `agile poker` — six names for one ceremony, ~40 harvested
  queries, nothing ranking. Now `/pointing-poker`, **one** page, plus
  `alternateName` on the SoftwareApplication schema. Five near-identical synonym
  pages is the doorway-page pattern and demotes the set rather than ranking it.
- **Story points to time.** `story points to hours`, `5 story points means how
  many hours`, `story points to days`. One of the highest-volume clusters in the
  space. Now `/story-points-to-hours`, which answers honestly — there is no
  conversion rate, forecast with velocity — rather than inventing an
  hours-per-point table.
- **Tracker interop.** `planning poker jira`, `planning poker for teams`,
  `planning poker slack`. Now `/planning-poker-jira`, which opens by saying
  there is no Jira plugin. The pitch is that paste-in/CSV-out needs no admin
  approval, and the page names the tradeoff it loses (no per-issue write-back).

Home shell deepened **532 → 1,047 words**, which puts it in the competitive band.
18 routes, 6,033 prerendered words in total.

**One renderer, not three components.** `ContentPage` renders any `ROUTE_CONTENT`
object through the existing `MarketingPageShell`, so the next landing page is a
data object and a line in `STATIC_SCREEN_BY_PATH`, not eighty lines of JSX. Each
data-driven route's screen name **is its own path** — if they shared one, React
would skip the state update navigating between two of them and leave the
previous page on screen. There is a test pinning that.

**The sitemap is now generated** (`scripts/gen-sitemap.mjs`, `npm run sitemap`,
also inside `npm run build`). It was hand-written with a `lastmod` hardcoded to
whenever someone last remembered to touch it. `lastmod` now comes from the last
git commit of `routeMeta.mjs`, so it moves when the copy moves — a date that
ticks on every deploy is a spam signal, not a freshness one. Same value feeds
JSON-LD `dateModified`. Dropped `<priority>` and `<changefreq>`: Google has said
plainly it ignores both, so they were forty lines saying nothing.

**Two real defects found on the way:**

1. **`/admin` was indexable.** It is not prerendered, so Vercel served it the
   home document — `robots: index, follow` and all. App.js does rewrite that to
   noindex, but only after React hydrates, which is too late for every crawler
   that does not run JS. Now blocked in `robots.txt` **and** by `X-Robots-Tag` in
   `vercel.json`, matching what `/t/:slug` already did.
2. **The `HowTo` schema name was hardcoded** to the home page's wording. Correct
   while one page had steps; the moment the Jira page had its own, the structured
   data was describing the wrong procedure to Google. Now `content.stepsTitle`,
   with a test that fails if a page carries its own steps unnamed.

**Deliberately not done, and why:**

- **`AggregateRating`.** Two competitors get SERP stars from it. We have no
  review data, so ours would be fabricated.
- **Named AI-crawler groups in robots.txt.** A named `User-agent: GPTBot` group
  *replaces* the wildcard rather than extending it, so adding them would have
  silently un-blocked `/t/`, `/admin` and `?room=` for exactly those crawlers.
  They are already allowed by `*`.
- **`llms.txt`.** No answer engine is confirmed to consume it.
- Softened an unverified claim in existing copy — it said competitor free tiers
  cap at "seven participants" and that number could not be verified anywhere.
  Replaced with limits actually checked on the day.

**407 tests passing** (from 398). Lint clean. Build compiles with no warnings
from our code; the one `DEP0176` is `react-dev-utils` and pre-existing. All 18
prerendered documents validated: unique titles/descriptions/canonicals, valid
JSON-LD, `dateModified` present, `canonical == og:url`, exact sitemap parity.
Checked in-browser at mobile, tablet and desktop — no console errors, no
horizontal overflow.

**Honest caveat.** On-page we are now at or ahead of this field. Off-page —
domain age and backlinks — is untouched and is what wins `planning poker`
itself. The realistic wins are the long tail, where the competition is thin.

**Largest remaining lever: translation.** `planning poker kostenlos`, `o que é
planning poker`, `scrum poker en ligne` all have real demand and
scrumpoker-online.org runs seven languages. Needs the app translated, not just
the marketing pages, so it is a project rather than a follow-up.

**Owner follow-up:** resubmit the sitemap in Search Console (15 → 18 URLs) and
Request Indexing on the three new URLs. Do **not** delete and re-add the
sitemap — the URL has not changed.

### The deploy above failed, and nothing said so

`d03bbcd` never reached production. Vercel validates `vercel.json` against a
closed schema and **refuses to build** on an unknown key — the `"//"` comment
added to the `/admin` header entry was rejected outright. Every check we run
locally passed, the push succeeded, and the site quietly went on serving the
previous build for ten minutes while `/pointing-poker` returned the homepage
document with a 200.

That silence is the real defect. A failed deploy is invisible from the
terminal: `git push` exits 0 either way. Caught only by checking the live
`<title>` before touching Search Console — which is also why requesting
indexing before verifying the deploy would have handed Google three URLs of
duplicate homepage content.

Fixed by deleting the key; the explanation it carried already exists in
`robots.txt`, which has real comments. Pinned by a test asserting every
`vercel.json` header entry carries only `source`/`headers`/`has`/`missing`,
verified to fail when the key is put back. **408 tests.**

---

## Session — 12 August 2026 — what Search Console actually said

Sitemap resubmitted (13 → **18** discovered pages; Google had not re-read it
since 30 April) and indexing requested for the three new URLs. Then read the
reports properly instead of assuming.

**The numbers.** 90 days: 2,740 impressions, 10 clicks, average position 53.6.
11 pages indexed, 3 not — and the 3 are `http://pointpoker.app`,
`https://pointpoker.app` and `http://www.pointpoker.app`, which 301 to
canonical www. That is a Domain property reporting a redirect as a redirect.
Correct, not a defect. Core Web Vitals has no data on either device type,
which is a traffic problem and not a performance one. No manual actions.

**The finding.** Clustering all 147 queries onto the page that owns them:

| Page | Cluster impressions | Clicks | Prerendered words |
|------|--------------------:|-------:|------------------:|
| `/scrum-poker` | ~966 | 0 | 139 |
| `/pointing-poker` | ~494 | 0 | 787 (shipped 11 Aug) |
| `/planning-poker-online` | ~219 | 0 | 157, **not indexed** |
| `/fibonacci-story-points` | ~176 | 0 | 146 |

`scrum poker` alone is 553 impressions with zero clicks against a 139-word
page. The demand was already arriving; there was nothing on the page to earn
the click.

**Why those pages were thin.** They were hand-written JSX. The prerender
builds from `ROUTE_CONTENT`, which held only an intro for them — so a non-JS
crawler got ~140 words while the React app showed ~350. Worse, their FAQs
could never earn FAQPage schema: the prerender only emits it from
`content.faq`, and their answers lived in JSX it never saw. Adding schema
without moving the content would have described text that is not on the page,
which is a structured-data violation, not a shortcut.

**What changed.** All three converted to data-driven `<ContentPage>` pages —
the pattern established on 11 Aug. Content moved into `ROUTE_CONTENT`,
deepened, and given five FAQ entries each; the three hand-written components
deleted. **213 lines of JSX removed, 210 lines of data added — a net
deletion**, and prerender and React can no longer disagree because they read
the same object.

| Page | Words | New schema |
|------|------:|------------|
| `/scrum-poker` | 139 → **756** | FAQPage |
| `/planning-poker-online` | 157 → **814** | FAQPage + HowTo |
| `/fibonacci-story-points` | 146 → **876** | FAQPage |

Verified in a browser, not just in tests: FAQ answers are in the DOM when
collapsed (`textContent` yes, `innerText` no — which is what the schema needs
and what Google permits), the accordion flips `aria-expanded`, no console
errors, no horizontal overflow at 375px. **411 tests**, lint clean.

Two claims were checked rather than assumed: the Scrum Guide genuinely does
not mandate planning poker or story points, and "two Team Rooms" — which read
like leftover Pro-tier copy — is a current, accurate fact in seven places, so
it was left alone.

**Still thin, and deliberately left:** `/story-point-estimation` (~80 cluster
impressions), `/agile-estimation-tool` (~45), `/remote-sprint-planning`,
`/about`, `/trust`, `/features`, `/pricing`. Same conversion applies when the
demand justifies it. `/terms` and `/privacy` are 38 and 45 words and should
stay that way.

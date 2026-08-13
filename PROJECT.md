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

## § Authoritative Current Truth — 13 August 2026

- Point Poker is live at `https://www.pointpoker.app/`.
- The product is free for everyone. There is no paid tier, Stripe checkout,
  licence-key flow, Pro gate, advertising, or trial clock.
- Every room supports up to 20 people including facilitators.
- An account is optional for one-off rooms. A free account reserves two Team
  Room URLs and retains sprint history; guests can join shared rooms without an
  account.
- English lives at root; Portuguese at `/pt/`; Japanese at `/ja/`. Only `/`,
  `/what-is-planning-poker`, `/scrum-poker`, and
  `/fibonacci-story-points` are localised. A compact language selector is
  visible in the global header and preserves the equivalent translated page;
  the footer retains the always-visible language links.
- `/de/`, `/es/`, `/fr/`, and `/nl/` are retired and permanently redirect to
  English. Keep the two redirect rules in `vercel.json`, including the
  `:path(.*)` form that covers trailing slashes.
- Firebase rules and both Cloud Functions were deployed and
  production-verified on 11 August 2026.
- Quality gate after the header language selector: 432 Jest tests pass, build succeeds, sitemap has 26
  URLs, and prerender writes 26 route documents.
- Product discovery on 13 August set a no-spend evidence window: keep the
  current domain, research retrospective demand without approving a build, and
  do not run Google Ads until the post-fix baseline and attribution gates exist.
  The evidence, unknowns, action calendar, and reopening tests are in
  [`docs/PRODUCT-DISCOVERY-2026-08-13.md`](docs/PRODUCT-DISCOVERY-2026-08-13.md).
- There is no blocking or half-finished code work.

The only open work is time- or human-gated and is listed in
[§ Pending Work](#-pending-work). `docs/AI-CONTEXT.md` is generated from the
code and is the first source for current structure and constants. Historical
sections below preserve how the product reached this state; old Pro/Stripe,
capacity, deployment, and launch-checklist claims are not current tasks.

## § Historical Snapshot — superseded by the section above

This section is retained as dated history. It is not a current handoff summary.

- Brand: `pointpoker`
- Production domain: `https://www.pointpoker.app/`
- Support email: `support@pointpoker.app`
  - Auth:
  - Firebase Email/Password auth is implemented and enabled
  - `/users/{uid}` persistence is live
  - New account registration now sends a Firebase Auth verification email
  - Registration success now holds in an explicit verification step inside the auth modal, with a visible continue action and a resend-verification action instead of auto-closing immediately
- Roles:
  - Backend values are `voter` and `observer`
  - User-facing label for `observer` is `Facilitator`
- Founder team rooms:
  - Stable founder-enabled URL is `https://www.pointpoker.app/t/rpa-build-team`
  - Additional founder-enabled URL is `https://www.pointpoker.app/t/rpa-discovery-team`, which defaults to the T-shirt deck on first creation/entry
- Verified product state:
  - Auth QA passed
  - Core room-flow QA passed
  - Facilitator wording clarified
  - Privacy policy updated for auth
  - SEO/domain references updated for `www.pointpoker.app`
  - Copy, legal accuracy, accessibility semantics, and structured SEO reviewed and tightened
  - Mobile voting interaction hardened so same-card repeat taps no longer clear the vote
  - Team-room routing and founder-room URL handling were hardened after a real regression was found
  - Core UI palette and surface system were refreshed toward a more modern 2026 casino-app look while preserving the green/gold brand
  - OG social image was refreshed again to feel more premium in link previews, with clearer hierarchy, stronger split-vote/facilitator cues, and better emphasis on Team Rooms and participant limits
  - Vercel Speed Insights was added to the React root for live production performance telemetry
  - The provided transparent brand-mark asset is now used in the app logo sections in place of the old inline SVG chip mark
  - App chrome wordmark now renders as `Point Poker` with white `Point`, gold `Poker`, and explicit spacing/capitalization
  - The same approved brand mark is now used for favicon and app-icon assets across browser and PWA contexts
  - Landing-page discoverability improved: signed-out NavBar now exposes `Plans` and `FAQ` shortcuts, with `Plans` routing to the dedicated pricing page and `FAQ` jumping to the home-page FAQ section
  - Signed-out primary navigation now also exposes `Support` and `Trust`, making those canonical trust/help pages easier for both users and crawlers to discover directly from the header
  - Landing page now contains a compact plans overview section in addition to the pricing modal
  - Auth flow is clearer: login/register/reset messaging now distinguishes free use from account-linked Pro access
  - Upgrade flow is smoother: starting checkout while signed out now routes through account creation/sign-in and then returns the user to pricing
  - Pricing/account state messaging is more explicit about Free vs Pro and about Stripe checkout still being blocked by missing live links
  - Short-term monetisation direction is now explicit: activation code remains the simplest temporary Pro-entitlement path until live Stripe checkout exists
  - Pricing and auth surfaces now explicitly guide users toward account creation + activation code when Stripe checkout is not yet live
  - LoginModal is now wider and shorter, with a themed internal scrollbar and a clearer SaaS hierarchy: auth first, Pro activation second, billing/plans third
  - Pro activation now depends on an explicit Firebase `/licenses/{key}` rules path; `database.rules.json` includes read-only client validation rules for activation keys
  - Pro activation UX is now account-bound by design: anonymous users are gated into sign-in/create-account first, while signed-in users get the actual activation form with Enter-to-activate support
  - Home screen is now account-aware: signed-in users no longer see the public landing page or marketing nav, and instead get a simpler workspace dashboard
  - Free users now see a simplified logged-in workspace with Create/Join/Team actions plus a focused Upgrade-to-Pro path
  - Account registration and sign-in now persist user state in Firebase `/users/{uid}` for both Free and Pro users, including plan/billing status, timestamps, and dedicated-room fields
  - Pro users now see two dedicated Team Room URLs tied to their account: the existing primary room remains stable, and a second fixed room is now provisioned alongside it
  - Pro users now have a clear workspace control to choose the shared Team Room name prefix; the app appends their username automatically so both fixed room names and URLs stay account-unique
  - Signed-in free users now default into a faster Pro-activation path: upgrade actions open the account-linked activation flow directly instead of generic upsell-first messaging
  - Direct-to-Pro signup is now a cleaner single journey: after account creation from an upgrade intent, the app returns straight into Pro activation instead of dropping the user back into a generic pricing state
  - Newly activated Pro users are now guided into Team Room setup in the workspace, with the naming control highlighted and focused so choosing both fixed room names feels like the next obvious step
  - Signed-in Pro users no longer see upgrade/plan upsell inside the auth modal or pricing modal; those surfaces now switch to neutral Pro-account messaging and support actions instead
  - Free room capacity is now 8 total participants including the facilitator; Pro capacity is 20 total participants including facilitators
  - Signed-in users now get their display name prefilled on room flows, and the footer drops generic free-vs-pro plan marketing in favour of account-oriented support actions
  - Dedicated Team Room URL rows in the Pro workspace now reflow cleanly at medium/narrow widths instead of clipping the invite/copy controls
  - Pro activation now preserves `createdAt` when upgrading a just-created account, preventing the transient first-attempt activation failure caused by strict user-profile rules
  - Pro activation now retries the final profile-upgrade write and attempts a recovery reconciliation if the activation key claim succeeded but the profile did not flip to Pro cleanly
  - Pro activation logic in the repo now claims each activation key to a single Firebase UID and surfaces a specific “already attached to another account” error if a second user tries the same key
  - Updated Firebase rules in the repo now require a Pro profile’s `proKey` to be claimed by that same UID; this still needs a fresh Firebase rules publish before same-key reuse is blocked in production
  - Live verification now confirms deployment parity, signed-out landing nav, free auth, signed-out upgrade flow, account-bound Pro activation, Pro navbar state, Pro workspace layout, dedicated Team Room URL/share flow, and anonymous join-via-link behaviour on production
  - Final focused production QA now passes for the real product flows:
    - Free flow passes, including Team Room gating, copy feedback, scrollbar polish, and edited session-name persistence into the room
    - Pro flow passes, including Team Room collaboration, vote sync, History access, and dedicated Team Room reuse
  - Firebase Realtime Database rules for `/licenses/{key}` are now published in production and activation-code validation is live
  - A real production Pro account is now working for `misteraliimran@gmail.com`
  - Workspace UX was tightened after live QA: copy-link actions now show visible feedback, the permanent Team Room URL wraps cleanly instead of truncating, the pricing modal keeps activation success visible briefly before closing, and the workspace `Open Team Room` CTA now scrolls to the actual Team Room entry controls
  - Stale-room cleanup is now hardened in the client: the app periodically sweeps `/rooms` in the background from the join/workspace screen and batch-deletes sessions older than the 5-hour expiry window when they are clearly inactive
  - Room cleanup is now stricter and better aligned to product intent:
    - temporary ad-hoc rooms older than the 5-hour session lifespan are hard-deleted during background sweep
    - persistent Team Rooms older than the 5-hour session lifespan are reset back to a clean reusable shell instead of retaining stale players/votes/story state
    - this reduces Firebase room clutter without breaking permanent Team Room URLs
  - Firebase QA data has now been cleaned: the free QA account (`aliimrankhan86@googlemail.com`) is back on `plan: "free"` / `billingStatus: "inactive"`, stale ad-hoc rooms were removed from Realtime Database, and only the meaningful persistent team rooms remain
  - Account-state modelling has been tightened after the latest Atlas/Comet pass:
    - signed-out UI no longer inherits broad Pro state from `pp_pro` local storage
    - mobile navbar now keeps signed-in identity, sign-out, and Pro history access visible instead of collapsing into a signed-out-looking header
    - Team Room flow now cleanly separates three cases: signed-in Pro owner, signed-in Free user trying to unlock Team Room, and guest/shared-link entrant joining an existing Team Room
    - Free users now see a real Team Room gate again (PRO badge + upgrade callout + no misleading "Enter Team Room" state), while guest/shared-link entrants keep the frictionless join path
    - Team Room copy was clarified so guest-facing flows no longer imply that the guest owns a Pro account
    - signed-in footer copy is now account-aware on workspace screens instead of repeating public marketing language
    - stale `prefillTeam` state is now route-bound and cleared on logout, so Free users no longer inherit a false shared-Team-Room state from prior Pro sessions in the same browser
  - Follow-up Pro-workspace hardening after the latest Comet pass:
    - workspace Team Room copy button now uses the same visible copied-state pattern as the live-room invite action
    - workspace Team Room URL is now rendered as a single-line trust signal instead of wrapping mid-slug
    - visiting your own bookmarked `/t/<team-slug>` URL while signed in on Pro now enters the room directly instead of stopping at the workspace home
    - guest join forms now clear the previous signed-in user's display name on sign-out/shared-device flows
    - live rooms no longer show the Free-tier upgrade strip when the room itself is already a Pro room, even if the browser auth session is interrupted on another tab
  - Final public/workspace polish after the latest Atlas rerun:
    - `Plans` anchor now lands closer to the actual plans cards instead of feeling offset too low
    - signed-in Free footer copy is now phrased as workspace guidance rather than public marketing
  - Signed-in room-name editing is now preserved properly:
    - the Join/Create/Team name input seeds once from the account profile when the session identity changes
    - the signed-in name field is now seeded but intentionally uncontrolled, so visible typed session names remain authoritative instead of being reimposed by account-state rerenders
    - manual name edits are no longer overwritten by follow-up account/profile sync
    - creating or joining a room now uses the user’s edited session name when they intentionally change it
    - room-entry actions now resolve the latest typed name from a live ref-backed value so automation timing and quick clicks cannot silently fall back to the account name
    - room-entry actions now also read the live DOM input value first, so browser automation and blur/timing edge cases cannot revert the visible edited name back to the stored account name
    - same-user auth/profile hydration no longer re-seeds the field after a manual edit, so a late-arriving account display name cannot clobber a custom session name typed immediately after page load
    - room entry now also carries the intended session name into the live room shell and reconciles the player record if needed, eliminating the last remaining race between room creation/join and later state hydration
  - Scrollbar styling is now aligned more closely with the brand system:
    - scrollbar tracks use the same deep-green surface tone as the app background/body
    - scrollbar thumbs remain the existing premium gold/yellow accent
  - Production domain/routing is confirmed live:
    - `https://www.pointpoker.app/` serves the correct production app
    - founder Team Room route `/t/rpa-build-team` works on the live domain
  - Sprint History presentation has been cleaned up for Pro users:
    - the modal header/close control now uses the correct visual styling instead of falling back to a broken default button
    - empty-state copy is now intentional, polished, and clearly explains when sessions are saved
    - history insight cards and session rows now use consistent dedicated classes instead of mismatched/un-styled markup
  - Final story-estimate recording now respects the active deck:
    - mixed votes are no longer auto-saved as numeric averages such as Fibonacci `4`
    - average/median/min/max remain visible as discussion analytics only
    - when votes differ, the facilitator must choose the final estimate explicitly from valid deck values before the story can be recorded
    - the split-vote resolution step now escalates into a delayed facilitator-only overlay after reveal, making the next action explicit after a brief discussion pause
    - split-vote wording was rewritten so teams understand that averages are for discussion only, while the facilitator must either record the agreed deck value or run another vote
    - post-reveal facilitator flow now places a large `Next item to Estimate` CTA directly under `Who Picked What`, so T-shirt sizing sessions have an obvious forward action instead of ambiguous `Next Round` wording lower in the controls
    - no-queue round recording now validates saved estimates against the actual room deck again, fixing the facilitator `Next item to Estimate` action for T-shirt sizing rooms under the hardened Firebase rules
    - estimate-save failures in both queue and no-queue paths now surface a toast instead of failing silently
    - Sprint Analytics now treats T-shirt sizing as a first-class deck: facilitators see a dedicated `T-Shirt size breakdown` section with XS/S/M/L/XL/XXL counts plus more useful summary cards (`Most used size`, `Size mix`) instead of numeric point placeholders
    - T-shirt analytics now also count no-queue consensus rounds correctly, so agreed `XS/S/M/L/XL/XXL` estimates are reflected in the current session breakdown instead of showing zeros
    - mixed estimates now keep the facilitator in the reveal flow itself: the facilitator chooses the agreed final deck value inline under `Who Picked What`, saves it, and moves directly to the next item without waiting for a delayed popup
  - Room entry now requires a real participant/facilitator name:
    - joining/creating a room no longer falls back to placeholder-like names
    - placeholder values such as `Alex Johnson` are rejected instead of being accepted as the live participant name
  - Facilitator moderation is now available in live rooms:
    - facilitators can remove voters or other facilitators directly from the `At the Table` panel
    - removed users are actively ejected back to the home screen with a clear message instead of silently lingering in a broken room state
  - Header and copy polish improved:
    - the anonymous header auth CTA now reflects the real modal behaviour (`Sign in / Create account`) instead of implying sign-in only
    - room invite UX is now compact and moved into the sticky room header, making the share action easier to find and copy quickly
    - landing-page and product copy were tightened for clarity, feature understanding, and better planning-poker / scrum-poker SEO coverage
  - SEO hardening Phase 1 is now implemented:
    - route-aware metadata now updates title, description, canonical, robots, and social metadata for home, legal routes, room URLs, and Team Room URLs
    - legal routes and room/team session routes now send server-level `X-Robots-Tag: noindex, nofollow` headers via Vercel
    - sitemap refreshed to reflect the currently intended indexable surface
  - SEO hardening Phase 2 first wave is now implemented:
    - dedicated indexable marketing routes now exist for `/pricing`, `/features`, `/planning-poker-online`, `/scrum-poker`, `/story-point-estimation`, and `/remote-sprint-planning`
    - each route now has unique route-level title, description, canonical, robots, and social metadata
    - signed-out footer and home-page content now provide crawlable internal links into the new marketing routes
    - Vercel rewrites and `sitemap.xml` now include the new indexable marketing URLs
  - SEO Phase 3 trust/proof layer is now underway:
    - dedicated `/about`, `/support`, and `/trust` routes now exist as additive trust/support pages
    - footer navigation and home-page SEO copy now link into those pages so they are discoverable to both users and crawlers
    - support messaging is now clearer and anchored to the published support email
    - the new `/trust` route explains public support/legal surfaces, authenticated email, account-linked Pro access, and room/data safeguards in one place
  - SEO Phase 3 guide layer is now underway:
    - dedicated educational routes now exist for `/what-is-planning-poker` and `/fibonacci-story-points`
    - these pages explain the estimation method itself, not just the product, and link back into the live planning-poker workflow
    - home-page SEO content now links into those guide pages so they are not orphaned from the primary entry surface
    - a keyword-targeted `/agile-estimation-tool` route now exists to capture the broader agile-estimation search intent and explain where pointpoker fits inside sprint planning and backlog refinement
  - Search Console operational setup is now complete at the initial level:
    - domain ownership for `pointpoker.app` has been verified in Google Search Console
    - `sitemap.xml` has been submitted successfully
    - canonical-host hardening is now explicit in `vercel.json`: apex `pointpoker.app` redirects permanently to `https://www.pointpoker.app/:path*`, so Search Console `Page with redirect` examples for bare-domain/http variants are treated as alternate URLs, not intended indexable pages
    - crawlable homepage structured data in `public/index.html` now matches the live product limits and Pro offer wording (`8` free participants including facilitator, `20` Pro participants including facilitators, `2` dedicated Team Rooms, sprint history)
    - homepage and key marketing routes have been manually requested for indexing
    - trust/support/guide routes have also now been manually requested for indexing:
      - `/about`
      - `/pricing` (re-requested on 17 April 2026 after Search Console still showed the URL as unknown to Google)
      - `/support`
      - `/trust` (re-requested on 17 April 2026 after Search Console still showed the URL as unknown to Google)
      - `/what-is-planning-poker`
      - `/fibonacci-story-points`
      - `/agile-estimation-tool`
    - Atlas Search Console inspection on 17 April 2026 confirmed the canonical `www` host is correct and most marketing pages are indexed; the remaining discovery lag is limited to `/pricing`, `/support`, and `/trust`, which have now been re-requested for indexing
  - Zoho Mail domain authentication is now correctly configured for `pointpoker.app`:
    - SPF passes
    - DKIM passes
    - DMARC passes
    - outbound mail from `support@pointpoker.app` is now properly aligned for deliverability
  - Backend notification scaffolding now exists in the repo:
    - `functions/` contains SMTP-backed Firebase Functions for owner signup notifications and owner/user Pro activation emails
    - notification idempotency is tracked under `/ops/notifications/{uid}`
    - the functions now explicitly use `planning-poker-b6ac1@appspot.gserviceaccount.com` because this project’s default Compute service account is unavailable for deploys
    - the notification functions are now deployed live in Firebase with Zoho SMTP env configuration loaded from `functions/.env`
    - Artifact Registry cleanup is now configured to auto-delete function images older than 30 days
    - Live Pro-activation email QA now passes end-to-end:
      - owner Pro notification email arrives
      - user Pro confirmation email arrives
      - both dedicated Team Room URLs in email match the product UI
    - two low-severity follow-ups remain:
      - the owner Pro email subject was observed as `Point Poker Pro activated` rather than the more explicit owner-notification subject expected for easy inbox scanning
      - that subject has now been changed in `functions/index.js` to `Point Poker Pro activated for <user-email>`, but it still needs a fresh Functions deploy to become live
  - Firebase user-profile cleanup is now resolved:
    - the real active auth-linked Pro profile for `misteraliimran@gmail.com` is `MDCUAeZguYRjVUNMzZVmNSnUAp23`
    - the old orphaned Realtime Database profile `Di4gMRnSJ3XDALew1H1tH3ILZqs2` has been removed from `/users`
    - the active Pro profile now carries the correct merged Pro fields (`plan`, `billingStatus`, `proKey`, `proActivatedAt`)
  - Security hardening pass is now landed in the repo:
    - new `/users/{uid}` profiles no longer bootstrap Pro state from legacy `pp_pro` browser storage
    - legacy `pp_pro` local storage is no longer written during activation and is cleared on sign-out/no-auth paths
    - `database.rules.json` now enforces active-license-backed Pro profiles, immutable room plan/deck metadata, deck-valid votes and recorded estimates, and blocks undeclared fields under `rooms`, `users`, and `history`
    - the hardened Firebase rules have now been published successfully in production
    - the latest published rules now also accept the optional `/users/{uid}/teamRooms` structure required for the two fixed Pro Team Rooms
    - a comment-free console-safe companion file now exists at `database.rules.publish.json` for future Firebase console updates
  - Post-rules production regression QA now passes:
    - Atlas confirms free sign-in, free room creation, Team Room gating, and real-name validation still work with the hardened rules
    - Comet confirms Pro sign-in, Team Room entry, split-vote resolution, re-vote flow, Sprint History access, and facilitator removal all work with no rules/write failures
    - the earlier non-blocking ad-hoc room persistence wording issue is now resolved: temporary one-off rooms explicitly say they are session-active links, while Team Rooms keep the permanent/reusable wording
  - SEO implementation plan is now explicit for future work:
    - Phase 1: metadata/canonical/noindex control and crawl hygiene ✅
    - Phase 2: dedicated indexable marketing pages (`/pricing`, `/features`, keyword landing pages) ✅
    - Phase 3: supporting educational content and trust/proof content 🔄 Started (`/about`, `/support`, `/trust`)
    - Phase 4: Search Console monitoring and performance refinement 🔄 Started (ownership + sitemap + indexing requests complete)
  - Facilitator controls + Team Alignment redesigned (29 March 2026):
    - Team Alignment: "Needs work" renamed to "Low consensus"; label suppressed until 2+ stories done; low-score colour changed from red to amber; neutral CSS state added for early sessions; inline explanatory note added; "agreed first round" → "agreed first vote"
    - Facilitator controls: `.obs-danger-divider` separates management from terminal action; `btn-new-session` changed to neutral (was red — wrong colour for a non-destructive action); standalone New Sprint fills its row; New Sprint hidden at true session start (round 1, 0 stories done); End Session button label shortened
  - UX/IA audit completed (29 March 2026) — top 3 improvements implemented:
    - **PRO badge on Team Room tab fixed:** badge was shown for Pro users (meaningless) and hidden for non-Pro users (where it matters). Now shows only for non-Pro users, giving the correct gating signal before submission.
    - **Inline Team Room pro-gate callout added:** non-Pro users on the Team Room tab see an explanatory callout with a direct link to the pricing modal — eliminates the "surprise gate" at form submit.
    - **Workspace quick-actions are now genuine 1-click:** Pro "Enter Team Room →" and Free "Create Room →" buttons in the workspace card now directly call `onTeamRoom()` / `onCreate()` with pre-filled values instead of switching tab and scrolling (which required a second click). CTA priority for Free users also corrected: "Create Room →" is now the gold primary, "Upgrade to Pro" is secondary.
    - **Solo room invite banner:** GameScreen now shows a prominent dismissible gold banner when only 1 player is in the room — "Your room is ready. Share the link to bring your team in." with an inline copy button. Dismissed on copy or manual close.
- Still pending:
  - SEO Phase 3/4: continue adding supporting guide/trust/proof content, then monitor indexing/query performance in Search Console
  - Re-check Search Console after recrawl so the current redirect validation settles around the intended `https://www.pointpoker.app/` canonical host
  - Re-check Search Console URL Inspection for `/pricing`, `/support`, and `/trust` after Google recrawls them
  - Re-run fresh-account signup email QA with a brand-new real inbox now that the signup verification-state UI bug has been fixed
  - Redeploy Firebase Functions so the owner Pro-notification subject-line improvement goes live, then re-check that email in the owner inbox
  - Replace Stripe placeholder links and complete paid activation wiring
  - Verify real paid/pro account state end-to-end once live Stripe links exist

If older historical notes below conflict with this section, treat this snapshot as the authoritative current state and update the older sections when touching them.

---

## § Project Identity

| Field | Value |
|---|---|
| **Product name** | pointpoker |
| **Purpose** | Free real-time planning poker for agile and Scrum teams. Sign-up is optional for one-off rooms and required only for persistent Team Rooms and sprint history. |
| **Target audience** | Product Owners, Scrum Masters, developers on distributed teams |
| **Business model** | Free for everyone; no paid tier or advertising. Future add-ons may be considered only after real usage evidence, without removing currently free features. |
| **Jurisdiction** | England & Wales |
| **Current status** | Live on Vercel. Analytics, Firebase Auth, database rules, notifications, and stale-room cleanup are deployed. SEO/localisation measurement is in progress. |
| **Founder room** | `rpa-build-team` (encoded in `_FC` array as `btoa` value) |

---

## § Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | React | 19.2.4 | Create React App scaffold |
| Database | Firebase Realtime Database | SDK 12.10.0 | Blaze billing enabled, US region |
| Hosting | Vercel | — | Auto-deploys from `main` branch on GitHub |
| Performance | Vercel Speed Insights | latest | Installed in `src/index.js` for production field-performance monitoring |
| Build tool | react-scripts | 5.0.1 | CRA — no custom webpack config |
| Fonts | Outfit v15 | — | **Self-hosted** in `public/fonts/` — sole active font family |
| Payments | None | — | The paid tier and Stripe/licence flow were removed in the August 2026 free-for-everyone pivot |
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

Additional:
```
REACT_APP_SUPPORT_EMAIL   # support@pointpoker.app (already set in Vercel)
```

Cloud Functions notification env:
```
APP_BASE_URL
SUPPORT_EMAIL
OWNER_NOTIFICATION_EMAIL
ZOHO_SMTP_HOST
ZOHO_SMTP_PORT
ZOHO_SMTP_SECURE
ZOHO_SMTP_USER
ZOHO_SMTP_PASS
MAIL_FROM_NAME
FUNCTION_SERVICE_ACCOUNT
```

---

## § Repository Structure

```
planning-poker/
├── public/
│   ├── index.html          # SEO shell — canonical and OG now point to www.pointpoker.app
│   ├── favicon.ico         # Favicon generated from approved brand mark
│   ├── favicon-32.png      # PNG favicon generated from approved brand mark
│   ├── logo192.png         # PWA icon generated from approved brand mark
│   ├── logo512.png         # PWA icon generated from approved brand mark
│   ├── manifest.json       # PWA manifest with SEO copy
│   ├── robots.txt          # Sitemap points to www.pointpoker.app
│   ├── sitemap.xml         # Indexable marketing-route sitemap for www.pointpoker.app
│   ├── privacy.html        # GDPR/UK ICO privacy policy (styled, noindex)
│   ├── terms.html          # Terms of Service — England & Wales (styled, noindex)
│   └── fonts/              # Self-hosted: Outfit v15 (active)
├── src/
│   ├── App.js              # ENTIRE app in one file — ~3800 lines (see § Components)
│   ├── firebase.js         # Firebase init — reads from REACT_APP_* env vars
│   ├── index.js            # React root mount
│   ├── index.css           # Minimal reset (most styles are CSS-in-JS in App.js)
│   └── App.css             # Unused — do not add styles here
├── database.rules.json     # Firebase security rules — source of truth; deployed 11 Aug 2026
├── firebase.json           # Firebase Functions source mapping
├── functions/
│   ├── index.js            # Signup notification + scheduled stale-room reaper
│   ├── package.json        # Firebase Functions runtime deps
│   ├── .env.example        # Required notification env vars (example only)
│   └── README.md           # Deployment + verification notes for notifications
├── PROJECT.md              # THIS FILE — single source of truth
└── package.json
```

### Critical note on App.js

The entire application — CSS, all components, all logic — lives in `src/App.js`. This is intentional for the current scale. **Do not split into separate files unless the user explicitly requests it.** All CSS is a template literal string (`const CSS = \`...\``) injected via `<style>{CSS}</style>` in the App() return. When adding new styles, append them inside the existing CSS string.

---

## § Design System

Current tokens and component rules live in `src/design-system/README.md` and
`docs/AI-CONTEXT.md`. Values below are retained only where they still match the
live token files.

### Colour palette (CSS custom properties)

```css
--bg:       #07110e   /* Page background — near-black emerald */
--bg2:      #0d1d19   /* Elevated dark green */
--surface:  rgba(15,32,27,0.76)
--surface2: rgba(22,44,38,0.92)
--border:   rgba(134,198,166,0.12)
--border2:  rgba(158,234,196,0.22)
--gold:     #f1b93f   /* Primary premium amber */
--gold2:    #ffd978   /* Brighter active amber */
--gold3:    #fff2be   /* Highlight amber */
--goldA:    rgba(241,185,63,0.24)
--goldB:    rgba(241,185,63,0.14)
--mint:     #72f0b4
--aqua:     #7ee6ff
--cream:    #f5fbf7
--cream2:   #b8d1c2
--red:      #e04848
--green:    #4bd889
--blue:     #6ccff6
--ink:      #080e09   /* Text on gold backgrounds */
--card-bg:  #fdfaf3   /* Playing card face */
--radius:   20px
--radius-sm:14px
--shadow:   0 28px 90px rgba(0,0,0,0.58)
```

### Typography

- **All text:** Outfit, self-hosted, weights 300/400/500/600/700
- Display contexts use Outfit 700 with tight negative tracking
- Old Cormorant files remain in `public/fonts/` but are not referenced

### Animation keyframes defined

`fadeUp`, `fadeIn`, `shimmer`, `spin`, `pulse`, `flip`, `dealIn`, `glow`, `urgentBg`, `heroIn`, `badgePop`, `consensusIn`, `starBurst`

---

## § Component Inventory

For the generated current list, use `docs/AI-CONTEXT.md`. The table below is a
historical inventory and may name components removed during the August pivot.

All components are functions in `src/App.js`. Listed in render order:

| Component | Description |
|---|---|
| `BrandMark` | Approved card-stack image mark used across app chrome. |
| `NavBar` | Global sticky nav with public links, account state, and theme control; no upgrade CTA exists. |
| `RouteLink` | Crawlable internal anchor helper — preserves real `href` values for SEO while using SPA navigation on click. |
| `SiteFooter` | 3-column footer — brand desc, Legal links, Product links. Bottom bar: copyright + legal disclaimer. Props: `onCookieSettings`. |
| `LoginModal` | Account modal for sign in, account creation, password reset, and verification-email state. |
| `CookieBanner` | GDPR consent bar — shown until `pp_cookie_ok = "1"` in localStorage. Props: `onAccept`. |
| `App` | Root — manages all screen state, Firebase subscriptions, room lifecycle. |
| `Confetti` | Pure-canvas confetti burst — no external deps. Props: `onDone`, `big`. |
| `PricingPage` / `FeaturesPage` / keyword pages | Dedicated indexable routes; `/pricing` explains that every feature is free. |
| `JoinScreen` | Landing/workspace form — Create/Join/Team Room tabs, role selector, deck picker, signed-in workspace state, and on-page SEO content. |
| `GameScreen` | Full estimation room UI — timer, playing cards, results, facilitator controls, analytics. Props: see § GameScreen Props. |

### GameScreen Props

```
rd, myId, myRole, code, deck, shareUrl,
onBack, onCard, onReveal, onNewRound, onReset, onEndSession,
onStart, onStop, onAddStory, onRecordStory, sessionWarning, toast
```

---

## § Key Constants & Logic — August 2026 override

The Pro/Stripe constants and flows shown later in this historical section were
deleted. Current invariants are:

```js
MAX_PARTICIPANTS = 20
SESSION_MAX_MS = 5 * 60 * 60 * 1000
```

All new rooms use `plan: "free"`. Team Rooms are free; hosting a new one needs
an account except for the two established founder URLs, while joining an
existing shared Team Room stays open to guests. Sprint history is free for any
signed-in account. Analytics uses atomic `set(ref, increment(1))`, not
`runTransaction`.

The remaining pre-August examples below are retained as migration history and
must not be used to implement current behaviour.

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
5. On success → upgrades `/users/{uid}` to `plan: "pro"` only after the license key is validated against Firebase
6. New authenticated profiles now start as `plan: "free"` / `billingStatus: "inactive"` and never inherit Pro entitlement from browser storage
7. The signed-in `/users/{uid}` profile is now the only source of truth for Pro status in the app

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

`database.rules.json` is the schema authority. `/licenses` is deliberately
absent and denied. Legacy plan/billing fields may remain on old user profiles
but grant no capability.

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

The current route table is generated into `docs/AI-CONTEXT.md` from
`src/routeMeta.mjs`; use that list instead of the older examples below.

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
| Terms of Service | `TermsPage` in `src/App.js`, route `/terms` | Live — England & Wales; service is free |
| Privacy Policy | `PrivacyPage` in `src/App.js`, route `/privacy` | Live — UK GDPR / DPA 2018; Firebase and Vercel processors |
| Cookie Banner | `src/App.js` — `CookieBanner` | Live — functional storage + anonymous counts only |
| Cookie Settings | Footer → `resetCookieBanner()` | Live — re-shows consent banner |

### Key legal positions (do not weaken without legal review)

- Service is free; no consumer purchase, refund, or cancellation rights arise from using it
- Service provided "as-is" — no SLA, no uptime guarantee
- Governing law: England & Wales; courts of England & Wales have exclusive jurisdiction
- Third-party processor disclosures: Firebase (Google LLC) and Vercel Inc.
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

### 2026-05 — Post-estimation next-item CTA clarified
- Facilitator post-reveal flow in `src/App.js` now places a large, hard-to-miss `Next item to Estimate` button directly under `Who Picked What`
- The old lower-page forward CTA was removed from the facilitator controls so there is a single obvious next step after reveal
- The split-vote overlay save action now uses the same next-item wording, and the revealed-state helper copy points directly at the new button

### 2026-05 — No-queue estimate save path fixed under hardened rules
- `database.rules.json` and `database.rules.publish.json` now validate `rooms/{roomId}/rounds/{index}/estimate` against the actual room deck instead of the intermediate `rounds` node, fixing T-shirt/no-queue facilitator saves that were being rejected silently
- `src/App.js` now surfaces an explicit toast when saving a final estimate fails, covering both the no-queue `newRound()` path and the queue-backed `recordAndNextStory()` path

### 2026-05 — T-shirt analytics breakdown surfaced
- `src/App.js` Sprint Analytics now shows a dedicated `T-Shirt size breakdown` grid with explicit XS / S / M / L / XL / XXL counts whenever the active deck is T-shirt sizing
- T-shirt analytics KPIs now surface `Most used size` and `Size mix` instead of point-oriented `Sprint scope` / `Avg per story` placeholders that were not meaningful for that deck
- No-queue rounds saved through `newRound()` are now included in the T-shirt analytics dataset, so consensus-only T-shirt sessions still populate the per-size counts and summary cards

### 2026-05 — Mixed-estimate facilitator decision moved inline
- `src/App.js` no longer hides the split-vote save flow behind a delayed facilitator popup
- When votes differ, the facilitator now gets an inline decision block directly under `Who Picked What`, can choose the agreed final deck value there, and move immediately to the next item or re-vote

### 2026-04 — Signup verification + notification backend scaffold
- New account registration in `src/App.js` now sends a Firebase Auth verification email immediately after account creation without blocking the account/profile write if delivery fails
- Login success messaging now distinguishes between a normal sign-in and a newly created account that should check email for verification
- Added a Firebase Functions scaffold in `functions/` for:
  - owner notification on `/users/{uid}` profile creation
  - owner notification on transition to active Pro
  - user Pro-confirmation email containing both dedicated Team Room URLs
- Notification sends are guarded with `/ops/notifications/{uid}` idempotency state so repeated profile writes do not spam duplicate emails
- Added `functions/README.md`, `.env.example`, and `firebase.json` so deployment/config is operationally clear for the next session

### 2026-04 — Notification functions deployed live
- Firebase project billing is now on Blaze, enabling Cloud Functions deployment for account-lifecycle emails
- Zoho SMTP app-password configuration is now wired through local Functions env and the Firebase Functions deploy completed successfully
- Live functions now exist for:
  - `notifyOwnerOnSignup`
  - `notifyOnProActivation`
- Functions now run under the explicit App Engine default service account `planning-poker-b6ac1@appspot.gserviceaccount.com`, avoiding the missing default Compute service-account deploy failure
- Artifact Registry cleanup is configured to automatically delete old function images after 30 days

### 2026-04 — Signup success-state UX fix
- Atlas QA surfaced a real regression in the post-registration modal flow: the newly signed-in account state was replacing the register-success UI too early, which exposed the signed-in password-reset button and its `Sending reset…` loading label during signup
- `src/App.js` now treats registration as an explicit transition state so the auth form and verification-success copy remain visible through account creation
- The register success callback is intentionally delayed slightly longer so the user can actually see the verification prompt before the modal closes
- Signed-in reset UI is now suppressed during the register transition, so signup no longer flashes misleading password-reset copy

### 2026-04 — Pro activation reliability + Team Room workspace layout fix
- `validateAndSavePro()` now preserves `createdAt` when upgrading a user profile, preventing the transient first-attempt activation failure that could happen on a just-created account under the stricter Realtime Database rules
- Signup now stays in an explicit post-registration verification state instead of auto-closing: the auth modal shows a clear verification prompt, adds a dedicated Continue button, and exposes a resend-verification action both immediately after registration and later from the signed-in account state.
- Verification-email sends now use an explicit continue URL and surface failures to the user instead of swallowing them silently, making Firebase/Auth delivery issues visible during setup and QA.
- Pro activation now retries the profile write and runs a recovery reconciliation when a key claim succeeds but the user profile does not finish upgrading cleanly, so transient activation races are less likely to strand an account on Free.
- Dedicated Team Room URL rows in the Pro workspace now use a more resilient grid layout and stack earlier on narrower screens, preventing the copy-link control from clipping or overflowing the card
- Pro users can now set a dedicated Team Room name prefix directly in the workspace; the final room names are saved as `<chosen name> <username>` and `<chosen name> 2 <username>` so the URLs stay unique without hiding the naming logic
- Signed-in free users now get a clearer upgrade journey: account-level Upgrade actions default to “activate this account,” while the pricing modal explicitly lays out the three-step Pro path (create/sign in, activate, then name Team Rooms)
- Direct-to-Pro signup now hands off cleanly: creating an account from an upgrade intent reopens the pricing modal with Pro activation already expanded, and newly activated Pro users are scrolled directly into Team Room naming setup in the workspace
- Signed-in Pro users no longer see upgrade/plan upsell inside the auth modal footer or the pricing modal itself; those views now switch to neutral Pro-account status and support messaging instead of checkout or plan-comparison prompts
- Activation keys are now single-account in repo logic: `validateAndSavePro()` claims `/licenses/{key}` to one UID, existing Pro users auto-claim their current key on sign-in, and the UI now shows a dedicated “already attached to another account” error when a reused key is attempted
- `database.rules.json` and `database.rules.publish.json` now require `licenses/{key}/claimedBy === $uid` for Pro profiles, but this stricter same-key-reuse guard still needs a fresh Firebase rules publish to become live in production
- The owner Pro-notification subject template has been tightened to `Point Poker Pro activated for <user-email>` for clearer inbox filtering, but this specific change still needs a fresh Firebase Functions deploy to take effect in production

### 2026-03 — Vercel Speed Insights installed
- Added `@vercel/speed-insights` to the project dependencies
- Mounted `<SpeedInsights />` in `src/index.js` so production deployments can start collecting field-performance metrics
- Installed with `--legacy-peer-deps` due dependency-resolution conflicts between the current CRA toolchain and Vercel’s package peers

### 2026-03 — Brand mark integrated into app chrome
- Added `public/brand-mark.png` from the approved transparent logo asset
- Replaced the old inline `CasinoChip` SVG component with an image-based `BrandMark` component in app chrome
- The new brand mark now appears in the navbar, footer, login modal, join screen, and in-room header while preserving the existing layout and wordmark treatment

### 2026-03 — Brand wordmark refined
- Replaced the plain lowercase `pointpoker` wordmark in app chrome with a styled `Point Poker` wordmark component
- `Point` now renders in white, `Poker` renders in the theme gold, and spacing between the words is explicit rather than implied
- The app chrome wordmark font treatment now uses a stronger sans-serif look for a cleaner premium SaaS feel

### 2026-03 — Favicon and app icons aligned to brand mark
- Regenerated `favicon.ico`, `favicon-32.png`, `logo192.png`, and `logo512.png` from the approved transparent `brand-mark.png`
- Updated `public/index.html` and `public/manifest.json` so browser, Apple touch, and PWA icon contexts all use the same approved brand mark
- Prefer lighter PNG/ICO favicon delivery in the document head rather than the heavier SVG wrapper path

### 2026-03 — Modern 2026 casino-style visual refresh
- The app visual system in `src/App.js` was refreshed away from a dull/rustic casino look toward a cleaner 2026 product feel while preserving the casino identity
- Palette updated to deeper emerald-black backgrounds, brighter amber highlights, and subtle mint/aqua accents for contrast and premium polish
- Key surfaces and interactions modernised:
  - join screen and form controls
  - glass panels and sticky headers
  - primary CTA buttons and facilitator controls
  - pricing modal, auth modal, navbar, toast, cookie banner, and footer
- Build verification passed after the redesign, with no app logic changes introduced as part of the visual pass

### 2026-03 — Facilitator role copy clarification
- Join-screen role label changed from user-facing `Observer` to `Facilitator` while keeping the Firebase role value as `observer`
- Facilitator helper copy now explicitly says this role runs the session and does not vote
- Waiting-state text now references the facilitator consistently, reducing false bug reports during QA
- Player list row now shows `Facilitator · No vote` instead of `Observer · Facilitator`
- Manual QA confirmed facilitator controls, participant flow, timer, end session, leave/rejoin, and Team Room gating all work as intended

### 2026-03 — Privacy policy updated for account auth
- `public/privacy.html` now discloses Firebase Authentication account data, account email storage, account metadata, and password reset email handling
- Browser storage section now reflects signed-in Firebase session storage; the old legacy `pp_pro` fallback has since been retired from the entitlement flow
- GDPR rights/retention sections now distinguish between temporary room data and persistent account data
- Stripe remains non-live and is described as future billing infrastructure only

### 2026-04 — Security hardening pass
- `src/App.js` no longer seeds new user profiles from client-side `pp_pro` storage; new profiles start free/inactive until real activation occurs
- Legacy `pp_pro` local storage is no longer written during Pro activation and is actively cleared on no-auth/sign-out paths
- `database.rules.json` now enforces that `plan: "pro"` requires `billingStatus: "active"`, a valid active `proKey`, and a numeric `proActivatedAt`
- Room `plan`, `deck`, `createdAt`, and founder metadata are now immutable after creation, and non-founder guests cannot create arbitrary new Pro rooms
- Room votes and saved estimates are now validated against the active deck at the rules layer so invalid values cannot be written by bypassing the UI
- Undeclared fields are now blocked under `rooms`, `users`, and `history` entries to reduce schema abuse

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

### 2026-03 — Mobile vote UI stabilization
- Vote cards now use native button semantics rather than clickable `div`s
- Selection state is now optimistic on the client: the tapped card stays visibly selected immediately while Firebase confirms the write
- Optimistic vote state is cleared on round change, reveal, or once the remote vote state catches up
- This specifically hardens the mobile case where a tap could appear to select and then visually unselect due to transient real-time state lag

### 2026-03 — OG social image created
- Added `public/og-image.png` at `1200x630`
- Asset uses the live pointpoker brand direction: dark green felt background, gold chip/wordmark, and planning-poker card visuals
- Existing Open Graph and Twitter metadata in `public/index.html` already points to this file, so no code changes were required beyond creating the asset
- Later refreshed to align with the newer premium emerald/amber UI theme and improve headline/tagline legibility in social previews
- Refreshed again on 1 April 2026 with a more product-led composition: stronger Point Poker hierarchy, clearer premium planning-poker messaging, visible split-vote resolution cues, and explicit Team Room / capacity signals for shared-link previews

### 2026-03 — Firebase Auth accounts + account-aware Pro gating
- `firebase.js` now exports `auth` alongside `db`
- `LoginModal` now supports sign in, create account, password reset, and legacy Pro key activation
- `/users/{uid}` profile store added in Realtime Database for `email`, `displayName`, `plan`, `billingStatus`, timestamps
- `NavBar` now shows signed-in account state and log out
- `PricingModal` now requires an account before checkout and records checkout intent to `/users/{uid}`
- `validateAndSavePro(key, user)` upgrades the signed-in user record to `plan: "pro"` after validating the activation key against `/licenses/{key}`
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

Nothing is blocked in the repository and no feature is half-finished. These are
the complete open actions as of 12 August 2026.

### 13 August 2026 — Search Console quota reset

- [ ] Request indexing for `/pt/what-is-planning-poker`.
- [ ] Request indexing for `/pt/scrum-poker`.
- [ ] Request indexing for `/pt/fibonacci-story-points`.
- [ ] Request indexing for `/ja/what-is-planning-poker`.
- [ ] Request indexing for `/ja/scrum-poker`.

The sitemap already contains all five. These requests only accelerate discovery.
Do not retry before the daily quota resets.

### Before 23 September 2026 — human language review

- [ ] Have a native Portuguese speaker review the four `/pt/` pages.
- [ ] Have a native Japanese speaker review the four `/ja/` pages.

Review naturalness and the agile vocabulary practitioners actually use. Tests
already enforce key parity, placeholders, writing systems, and absence of
English leakage; another machine pass does not satisfy this task.

### Around 23 September 2026 — six-week SEO evidence pull

- [ ] Compare current English query positions with the recorded baseline.
- [ ] Filter the Pages report for impressions on `/pt/*` and `/ja/*`.
- [ ] Check the Queries report for Japanese or Portuguese script.
- [ ] Confirm sitemap “Discovered pages” has settled at 26.
- [ ] Confirm “Page with redirect” is near 7 after `/de/`, `/es/`, `/fr/`, and
  `/nl/` are recrawled.

Use position and first impressions as the early signal. At an average position
near 56, zero clicks is expected and is not enough to reject a locale.

### Product discovery evidence gates — no spend before review

- [ ] Manually check `pointpoker.app` with Palo Alto, FortiGuard, and
  BrightCloud; record dated categories/screenshots and request recategorisation
  for false positives.
- [ ] Collect target-organisation access tests with the filtering vendor and
  exact failure. Do not infer that the word `poker` caused a general
  unapproved-SaaS block.
- [ ] Interview 10–15 facilitators about their last real retrospective and seek
  three to five teams willing to use a prototype for two consecutive sprints.
  These are internal decision thresholds, not claimed industry standards.
- [ ] At the six-week review, assess real activation/session depth, Team Room
  returns, confirmed access failures, and retrospective evidence alongside the
  Search Console pull.

Until those gates are reviewed:

- do not buy or deploy a neutral-domain redirect;
- do not build a generic retrospective product; and
- do not run the proposed USD 1/day Google Ads campaign or install a third-party
  conversion tag.

The reasoning, sources, limitations, and separate reopening conditions for each
decision are authoritative in
[`docs/PRODUCT-DISCOVERY-2026-08-13.md`](docs/PRODUCT-DISCOVERY-2026-08-13.md).

### Expected recrawl movement — do not act

- Sitemap discovered pages moving from 42 to 26.
- Redirected pages moving from 3 to roughly 7.
- Retired locale prefixes appearing in redirect reports.

These are the intended result of shrinking the sitemap and landing the 301s.

### Future ideas — not committed work

Distribution, premium add-ons, App Check, and further component extraction are
ideas only. Do not treat them as pending or start them without a new product
decision. Retrospectives and paid acquisition remain discovery hypotheses under
the evidence gates above, not approved features or campaigns. Everything
currently free must remain free.

---

## § Analytics & Business Metrics Guide

### Where to read the data

Use the owner-only `/admin` dashboard. Raw counters live at
`/analytics/daily/`; client reads require `/admins/{uid}: true`.

### Key ratios to watch

| Metric | Formula | What it tells you |
|---|---|---|
| Signup completion | `signup_completed / signup_started` | Account-flow completion; compare only from 9 Aug 2026 because earlier intent counts were polluted |
| Invite use | `feature_invite / room_created` | How often hosts share the room |
| Timer adoption | `feature_timer / room_created` | Timer discovery and usefulness |
| Queue adoption | `feature_queue / room_created` | Structured-session adoption |
| Team-room return | `team_room_reentered / room_created_team` | Whether permanent rooms create repeat use |
| Session depth | `estimate_recorded / room_created` | Estimates completed per created room |

### Adoption decision logic

The current decision is adoption, not monetisation. Use the dashboard to learn
whether rooms are created, shared, revisited, and used deeply enough to justify
further investment. Do not rebuild a paid funnel from legacy counter names.

---

## § Commit History Summary

```
bae6695  docs: reconcile handover with current product state
cff462a  docs: update PROGRESS.md with UX/IA improvements from current session
bf7ee1d  ux: fix Team Room gate UX, 1-click workspace actions, solo invite banner
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
| Portuguese/Japanese translation naturalness | Unverified | Native-speaker review required before the 23 Sep SEO re-pull |
| Non-English demand | Unvalidated | First evidence comes from the six-week Search Console re-pull |
| App.js is large | Accepted architecture | Split only when a concrete change benefits enough to justify it |
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

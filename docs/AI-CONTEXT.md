<!-- ════════════════════════════════════════════════════════════════
     GENERATED FILE. DO NOT EDIT BY HAND.

     Regenerate:  npm run docs
     Source:      scripts/gen-ai-context.mjs
     Hand-written prose belongs in docs/AI-CONTEXT.hand.md, which is
     spliced in at the bottom of this file untouched.
     ════════════════════════════════════════════════════════════════ -->

# Point Poker: context for AI agents

Free planning poker for agile teams. React SPA, Firebase Realtime Database, hosted on Vercel.

**Read this file first. It is regenerated from the code on every build and commit, so it cannot be out of date.**

## The one-paragraph version

Someone opens the site, types a name, and gets a room in about ten seconds. They paste the
link into their team chat. Everyone picks a card privately, all cards flip at once, and the
facilitator records the agreed number and moves to the next story. No account, no payment,
no ads. An optional free account reserves two permanent room URLs and stores sprint history.

## Where things live

| File | What it is | Size |
|---|---|---|
| `src/App.js` | The entire app: CSS string, all components, all Firebase logic | 383 KB |
| `src/routeMeta.mjs` | Route table, SEO metadata, prerendered content. Read by the app **and** the build | 68 KB |
| `src/AdminDashboard.js` | Owner-only usage dashboard, lazy-loaded so users never download it | 20 KB |
| `src/design-system/tokens.css` | Every colour, size, radius, shadow and duration. Dark on `:root`, light under `[data-theme="light"]` | 30 KB |
| `src/design-system/components.css` | The `pp-` component classes | 58 KB |
| `src/design-system/index.js` | The React components. Import from here | 38 KB |
| `src/design-system/README.md` | The rulebook: theming, the ten rules, the decision table | 20 KB |
| `scripts/prerender.mjs` | Writes one real HTML file per route after the CRA build | 13 KB |
| `scripts/build-rules.mjs` | Strips comments from the Firebase rules to make the console-pasteable copy | 1 KB |
| `scripts/gen-ai-context.mjs` | Generates this file | 13 KB |
| `database.rules.json` | Firebase rules, with comments. **Source of truth.** | 19 KB |
| `database.rules.publish.json` | Generated. This is what gets pasted into the Firebase console | 12 KB |

`src/App.js` is one big file on purpose. It keeps deployment trivial for a solo maintainer.
Do not split it without a reason that outweighs that.

## Product facts

- **Everything is free.** There is no paid tier, no Stripe, no licence keys. Any code or copy
  implying otherwise is a bug.
- **Room capacity: 20 people**, facilitators included. One constant,
  `MAX_PARTICIPANTS` in `src/routeMeta.mjs`, used by both the enforcement and the marketing copy.
- **Card decks:** .
- **An account is needed only to host a Team Room** (the URL slug is derived from the account
  name, so without one two different teams could collide on the same room) and to keep sprint
  history. Joining any room, including a Team Room someone shared, never needs an account.
- **Rooms are disposable.** Deleted when everyone leaves; idle rooms are swept after an hour.

## Routes (19)

- `/`
- `/terms`
- `/privacy`
- `/about`
- `/support`
- `/trust`
- `/what-is-planning-poker`
- `/agile-estimation-tool`
- `/pricing`
- `/features`
- `/story-point-estimation`
- `/remote-sprint-planning`
- `/pointing-poker`
- `/story-points-to-hours`
- `/planning-poker-jira`
- `/scrum-poker`
- `/planning-poker-online`
- `/fibonacci-story-points`
- `/admin`  (private, never indexed, never prerendered)

Every public route is prerendered at build time with its own title, description, canonical,
Open Graph tags and JSON-LD. `src/App.test.js` fails if two routes ever share metadata.

## Analytics events (28)

Anonymous daily counters at `/analytics/daily/{date}/{event}`. Integers only: no user IDs,
no personal data, nothing that could identify a person or a room.

| `consensus_first_vote` | `estimate_recorded` | `feature_copy` | `feature_csv` |
| `feature_invite` | `feature_paste` | `feature_pdf` | `feature_queue` |
| `feature_timer` | `pricing_viewed` | `room_created` | `signup_completed` |
| `signup_started` | `visit_new` | `visit_return` | `wtp_15` |
| `wtp_30` | `wtp_5` | `wtp_dismissed` | `wtp_zero` |

Bucketed (one counter per band, so the dashboard stays chartable):

| `session_20_60m` | `session_5_20m` | `session_over_60m` | `session_under_5m` |
| `table_2_4` | `table_5_8` | `table_9_20` | `table_solo` |

Add an event only when you can name the decision it changes. An unused counter is noise on
the dashboard, not free insight.

## Firebase shape

Top-level nodes: `rooms`, `admins`, `analytics`, `users`, `history`, `$other`.

Analytics read rule: `auth != null && root.child('admins/' + auth.uid).val() === true`

To grant yourself the dashboard, add `/admins/<your-uid>: true` by hand in the Firebase
console. No client can write to `/admins`, so nobody can promote themselves.

## Commands

- `npm run start` — `react-scripts start`
- `npm run build` — `node scripts/gen-ai-context.mjs && node scripts/gen-sitemap.mjs && react-scripts build && node scripts/prerender.mjs`
- `npm run test` — `react-scripts test`
- `npm run eject` — `react-scripts eject`
- `npm run build:rules` — `node scripts/build-rules.mjs`
- `npm run test:rules` — `node scripts/build-rules.mjs && PATH="$(/usr/libexec/java_home -v 21 2>/dev/null)/bin:$PATH" npx --yes firebase-tools emulators:exec --only database --project demo-pointpoker 'node scripts/rules-test.mjs'`
- `npm run prerender` — `node scripts/prerender.mjs`
- `npm run sitemap` — `node scripts/gen-sitemap.mjs`
- `npm run docs` — `node scripts/gen-ai-context.mjs`

## Tests

`npm test` — 259 test blocks across AdminDashboard.test.js, App.test.js, AppErrorBoundary.test.js, design-system/design-system.test.js, designsystem.test.js, estimation.test.js (more cases
than that at runtime, because `test.each` expands). They cover the things
that break silently: the estimation maths (consensus, stats, slugs), SEO route metadata
uniqueness, and the dashboard arithmetic that business decisions rest on.

`npm run test:rules` — 81 assertions against the real Firebase rules
engine in the emulator (needs JDK 21, which the script locates itself). The rules cannot
be checked by reading them and have to be deployed by hand, which is how two silent
outages happened. Run this after touching `database.rules.json`.

Run both before committing.

## Design system

Read `src/design-system/README.md` before writing any UI. The short version: use
a token, never a raw px or hex value; one primary action per screen; selection is
`aria-pressed`, never a class; icons from `ICON_PATHS`, never emoji.

**Dark is the default and needs no JavaScript** — the dark roles sit on `:root`, so
first paint, crawlers and a no-JS browser all get it. Light is opt-in via
`[data-theme="light"]`, set by `ThemeToggle` and remembered under `pp-theme`.
There is deliberately no `prefers-color-scheme` block: the theme never moves under
a user who did not ask. Components import from `src/design-system`; App.js's old
`--bg` / `--gold` names are aliases of the semantic roles, which is what made the
existing 10k-line file theme-aware without rewriting it.

| Measure | Now | Note |
|---|---|---|
| Design tokens | 215 | Type, spacing, elevation, motion, semantic colour |
| Roles defined per theme | 99 | Every one exists in both, or light falls back to a dark value |
| Icons in `ICON_PATHS` | 20 | One stroke family, `currentColor` |
| Distinct font sizes in CSS | 23 | Target is the 8-step scale; the rest is unmigrated legacy |
| Distinct padding pairs | 14 | Target is the 4px grid |
| Legacy button classes in App.js | 3 | The button system is `Button` / `.pp-btn`; these are leftover skins |
| Raw hex text colours left in App.js | 3 | All on a surface that is identical in both themes |

The bottom four are deliberately unflattering. They are the size of the remaining
migration, and they should fall over time, never rise.
`src/designsystem.test.js` guards the button system and the no-emoji rule;
`src/design-system/design-system.test.js` computes the actual WCAG contrast of
every semantic role in both themes and fails if one drops below AA.

## Components in App.js (32)

`BrandMark`, `PrintReport`, `BrandWordmark`, `NavLinkButton`, `RouteLink`, `NavBar`, `LanguageSwitcher`, `SiteFooter`, `LoginModal`, `CookieBanner`, `Confetti`, `MarketingSection`, `MarketingRelatedLinks`, `MarketingPageShell`, `ContentPage`, `PricingPage`, `AboutPage`, `SupportPage`, `TrustPage`, `WhatIsPlanningPokerPage`, `AgileEstimationToolPage`, `FeaturesPage`, `StoryPointEstimationPage`, `RemoteSprintPlanningPage`, `LegalPage`, `TermsPage`, `PrivacyPage`, `HistoryModal`, `JoinScreen`, `WtpPoll`, `RoomActionBar`, `GameScreen`

---

<!-- Hand-written notes. This file IS edited by hand and is spliced verbatim into
     the bottom of the generated docs/AI-CONTEXT.md. Keep it to things a script
     cannot derive: intent, history, and traps. -->

## Things that will bite you

**Never name a class after an advertisement.** The admin dashboard prefixed all
41 of its classes `ad-`, short for admin. EasyList's generic cosmetic filters
treat that as advertising, so uBlock Origin and friends hid every one of them:

```
.ad-wrap:not(#google_ads_iframe_checktag) { display: none !important }
```

Extensions inject those at **user origin**, which outranks author `!important`
and even an inline style, so nothing the page does can win it back. The failure
is silent and looks nothing like a CSS bug: Firebase reads succeed, the DOM is
fully populated, no console error appears, and the screen is simply blank. A
large share of this audience runs an ad blocker, so a class called `ad-anything`
is invisible to the people most likely to use the product. The prefix is now
`dash-` and `src/designsystem.test.js` fails on `ad-`, `ads-`, `advert`,
`sponsor`, `popup-` or `promo-` appearing in any class name.

Diagnosing this class of problem: compare an element's inline style against its
computed style. If `display: block !important` inline still computes to `none`,
the rule is user origin and an extension is responsible, not your CSS.

**Search Console data from before 2026-08-09 measures a broken site, so do not use
it as an SEO baseline.** Until the prerender fix shipped that day, every marketing
route was a Vercel rewrite to `/`, which meant Googlebot read
`<link rel="canonical" href="https://www.pointpoker.app/">` on all fourteen of
them. That is an instruction to treat each page as a duplicate of the homepage and
drop it. Google obeyed. The first ninety days show what that looks like:

- `/planning-poker-online`, the page targeting the primary keyword, took **0
  impressions in 90 days** while sitting in the sitemap the whole time.
- `/scrum-poker` took 1,120 impressions (41% of the site total) at average
  position 52 and earned nothing, because Google was ranking it with the
  homepage's title and description.
- Daily impressions fell from 54.7 in May to 9.5 in June, an 83% drop, while
  average position *improved* from 62.9 to 29.8. Both numbers move that way when
  a batch of pages is dropped as duplicate and only the brand query survives.

Compare future months against **September 2026 onwards**, not against May to July.

**Cloud Functions deploys fail silently-ish on a missing API.** `reapStaleRooms`
appeared to deploy and did not, because `cloudscheduler.googleapis.com` was
disabled on the project. The CLI reports `missing required API ... Enabling now`
and can still exit before the function is created. After any functions deploy,
confirm with `npx firebase-tools functions:list --project planning-poker-b6ac1`
rather than trusting the command's own output.

**A functions dependency bump can break the module at import time, which no
amount of reading catches.** The Node 22 migration moved `firebase-admin` from
v12 to v14, and v13 had removed the whole namespaced API: `admin.apps` and
`admin.database()` are both gone in favour of `getApps()` from
`firebase-admin/app` and `getDatabase()` from `firebase-admin/database`. Nothing
about that is visible in a diff of `index.js`, because `index.js` did not change.
The module would have uploaded, deployed "successfully", and then thrown
`Cannot read properties of undefined (reading 'length')` on the first cold start,
silently stopping signup emails and room reaping.

`functions/npm test` now loads the module before any deploy and asserts the two
exports exist and carry `__endpoint` trigger metadata. It costs 300ms and it is
the only thing standing between a dependency bump and a dead production trigger.
Run it after touching anything in `functions/`.

**An emulator "user" built the wrong way is silently an admin.** The rules tests
now cover signed-in visitors, not just guests, because the threat to the
dashboard is somebody with a real account rather than someone with none. Getting
that wrong is very easy: the database emulator accepts three auth mechanisms and
only one of them models a user.

| mechanism | writes the admin allowlist | reads its own profile |
|---|---|---|
| `?auth=<jwt>` | no | yes |
| `?access_token=<jwt>` | **yes** | yes |
| `Authorization: Bearer <jwt>` | **yes** | yes |

`access_token` and `Bearer` are admin credentials whatever token you hand them,
so a test "user" built on either can read everything — and every negative
assertion still passes, having proved nothing. Use `auth=` for users and keep
admin credentials to the one seeding helper that needs them.

The same section carries an allow case: the allowlisted owner *can* read
analytics. That is the control, not a courtesy. If the emulator ever stopped
honouring these tokens every request would fail auth, the whole section would
read as DENY, and that is indistinguishable from perfect security. It also
guards the opposite failure, where a broken allowlist leaves the owner staring
at an empty dashboard.

**The role picker has no default, and six call sites depend on that.** It used
to default to Participant, including for the person creating the room, so anyone
who never changed it reached a revealed round with no way to record: every
record control is `isObs`-gated and a voter cannot promote themselves. Only a
facilitator can change someone else's role, which is no help when there is no
facilitator.

The catch when changing this: only three of the six entry points go through
`go()`. The dedicated Team Room shortcuts (`Open Room 1/2`, `Create one-off
room`) and the auto-enter effect for a signed-in owner landing on their own team
URL all call `onCreate`/`onTeamRoom` directly, and would have written a blank
role straight into the room. `requireRole()` exists so each one stops. The
auto-enter effect already has `role` in its dependency list, so picking a role
completes the entry rather than stranding the user on the form.

**A funnel is only a funnel if both halves count the same people.** The account
funnel divided completed registrations by `signup_started`, which fired from the
navbar Sign in button — so every returning user, and every reopen of the dialog,
inflated the denominator, while the two paths that genuinely open the dialog to
register never fired it at all. The live dashboard read 24 started, 0 completed,
0%, which looks like a broken signup and was actually a broken metric. The event
now fires from the dialog's own `mode`, which covers both opening straight into
register and switching to it, and is ref-guarded against StrictMode's second
effect pass. Historical counts stay polluted: compare from 2026-08-09 onwards.

**An empty `/rooms` does not mean the team rooms are gone.** A Team Room is not a
stored object. Its identity lives on the account, at
`/users/$uid/teamRooms/{primary,secondary}`, as a *name*; `teamCode()` turns that
name into a slug deterministically, and `/rooms/<slug>` is only materialised when
somebody enters. `handleTeamRoom` reads the node first and reuses it if it
exists, so the same URL keeps working whether or not the node is currently there.
Checking `/rooms` therefore tells you who is in session right now, not which
teams exist. The list of teams is `/users`, and the estimates they recorded are
`/history/$uid`, which is independent of the room lifecycle entirely.

This is also why the reaper distinguishes the two cases: a room carrying
`teamName` or `founderRoom` is overwritten with `freshTeamRoomState` rather than
deleted, so a permanent address survives with a clean round-one state. Before any
of this existed, a `beforeunload` handler deleted the room outright when the last
player left, which is why no team room node survives from before 2026-08.

**Stale Pro fields are still sitting on live user profiles.** The licence system
was deleted, but the rows it wrote were not: at least one account still carries
`plan: "pro"`, `billingStatus: "active"` and `proKey`. Nothing reads them and
nothing can — the rules accept any string for `users/$uid/plan`, so a user
writing `plan: "pro"` to their own profile is expected and grants nothing, and
the only privileged read on the site is gated on `/admins/$uid` instead. Treat
those fields as dead data. The trap is reading a profile, seeing `plan: "pro"`,
and rebuilding entitlement logic around a field the product deliberately ignores.

**The room has no settings screen, and that is deliberate.** `deck` and
`estimationMode` are write-once in `database.rules.json`
(`newData.val() === data.val()`), because every vote is validated against the
room's deck — a deck that changed mid-round would invalidate votes already
cast. The client agrees: `setDeck` exists only in `JoinScreen`. So the obvious
"let the facilitator change the deck in the room" feature is not a missing
feature, it is a rejected one. Building it means relaxing a security invariant
and clearing every vote atomically with the change. Do not add it casually.

**Why the create form does not hide the deck behind a disclosure.** Two
variations were built and measured against each other (`ui/variation-a`,
`ui/variation-b`). A collapsed deck and estimation mode into a `<details>`; B
put them side by side, always visible. A won the default path — the primary
action sat at y=910 on a 1280×720 viewport against B's 985, and 975 against
1155 on a 375px phone. B won everything else, and B shipped.

The reason is that progressive disclosure suits settings that are optional,
reversible and rarely touched, and these are none of those. They cannot be
changed after creation, and deck choice is not rare: `FOUNDER_ROOM_CONFIG`
carries two of Ali's own team rooms, one defaulting to `fibonacci` and one to
`tshirt`, and two recent commits (`fc8d941`, `39f9e0d`) built T-shirt-specific
analytics. Roughly half of real usage picks a non-default deck. A also made the
*changer's* path worse than doing nothing: expanded, its primary action fell to
y=1260 desktop and y=1364 mobile, both below the y=1119 it started from. Hiding
a 50/50 irreversible choice to save 75px on the other path is the wrong trade.

**The hero constraint is now fixed, and the fix changed the form back.** The
hero sat stacked on top of the form inside one 440px card: 397px of marketing
above the control people came for, with 829px of empty width either side of it.
From 1024px up the two now sit side by side — hero copy left, form card right —
and nothing was removed to do it. The primary action went from a 320px scroll to
**0px at 1024×768 and 44px at 1280×720**.

That fix then made variation B's own layout obsolete. Deck and estimating were
put side by side to save vertical space back when the hero was eating it; with
the hero moved, that pressure is gone, and at a 480px card the paired columns
gave each option 58px of width for an 82px label, so "Powers of 2" and "User
Stories" both wrapped. They are stacked full width again. **If you are tempted
to re-pair them to save height, the height is no longer scarce and the wrapping
is why they were separated.**

**Two traps in the type sweep, if you ever repeat one.**

A CSS-only pass misses the `style={{fontSize: ".78rem"}}` values written inline
in the JSX — there were eight, and the smallest surviving text on the page after
the CSS sweep was one of them. Grep both.

And wrapping is not clipping. The first regression harness checked
`scrollWidth > clientWidth` and reported everything clean while four option
labels were visibly broken across two lines. Text that wraps still fits its box.
Measure rendered height against line-height instead.

**The join tabs are "Create / Join / Team", not "… Room".** At 375px three tabs
carrying "Room" cannot fit one line at any size down to the 13px floor — 87px of
label in 64px of column. The tab picks the mode and the primary action names the
outcome, since it already reads "Create Room →". Do not add the noun back.

**The nav's marketing links are hidden below 780px on purpose.** Brand, four
links and the call to action need about 750px of bar. `.navbar-links` was a
scroll strip, so nothing was ever unreachable, but what it actually rendered on
a phone was "PRICING" and half of "SUPPORT" sliced down the middle at the
container edge — which reads as broken, not as scrollable. Raising the type
floor widened each link and made it obvious. Pricing, Support, Trust and
Features are all in the footer, so nothing is lost. Do not "fix" the hidden
links by re-showing them; the bar has no room and the footer already has them.

**An empty room's primary action is the invite, not Reveal.** A facilitator who
has just made a room is alone in it. The action bar's primary slot held "Reveal
everyone's cards", disabled, because there was nothing to reveal — the loudest
control on the screen did nothing — while the one action that mattered, sharing
the link, was a secondary button inside a banner carrying a dismiss X that could
hide it. `RoomActionBar` now branches on `roomIsEmpty` (`!revealed &&
voterCount === 0`) and the slot carries "Copy the invite link" until somebody
can vote. Verified in two browser tabs: the moment a participant joins, the slot
hands back to Reveal.

That also removed the third copy of the same invite. The header strip has one,
the action bar's primary is the other, and the solo banner was a third — it now
only appears for a Team Room, where "the link stays the same every sprint" is
information the header does not carry.

**Once the cards are up, the action bar is status only.** It kept its primary
slot after the reveal, so "Record 13 and continue" sat at the top of the column
above the timer while the 13 it was recording was a screen further down — the
number and the button that commits it were a scroll apart, and the facilitator
had to hold the estimate in their head on the way up. Everything a finished
round can do is now one `.round-actions` row directly under `.avg-hero`:
record, re-vote, new sprint, end session. `RoomActionBar`'s `primary` is `null`
when `revealed`, and the card renders the title, the voted chip, the progress
bar and the hint.

That collapsed three groups into one. The row replaced a second primary inside
the split-vote picker ("Save selected estimate & …", which wrote the same thing
as the record button through a near-duplicate handler), the re-vote / new sprint
pair under the story queue, and the right-aligned end-session row under that.
`obs-controls` keeps only the `!revealed` copies, because before the reveal
there is no estimate for the row to sit under. Do not re-add a record button to
the action bar; the whole point is that there is one, and it is beside the
number. Guarded in `designsystem.test.js` → "a finished round has one set of
controls".

**Counters and the records they count reset together, or neither does.** A new
sprint zeroed `storiesDone`, `streak` and `consensusCount` and left every
estimate that produced them: queued stories kept `estimate`, `rounds` kept every
recorded round, and `activeStory` stayed past the end of the queue, so the room
was sitting on a story it had already sized. Sprint Analytics read
"Stories sized 0" directly above "Stories sized (1)" listing an estimate, and the
summary still totalled the previous sprint's points. Which paths a reset blanks
now lives in `sprintResetUpdates()` in `src/estimation.js` — a pure
`roomData → {path: value}` map — precisely because the bug was an omission from a
list, and a list is the thing a test can read. `resetSession` in App.js is only
the wiring that prefixes `rooms/{code}/`.

What a reset does **not** touch is the backlog. The confirm promises to clear
votes, estimates and rounds; deleting the story names someone typed on that
promise would be a destructive surprise, so the queue keeps its stories and
rewinds to index 0 to be estimated again. Guarded three ways: `estimation.test.js`
→ "sprintResetUpdates" for the payload, `scripts/rules-test.mjs` for whether the
rules engine actually permits the deletes (`stories/$i/estimate` and `rounds/$i`
are both validated for the value going in, not for its removal), and the confirm
string itself in `designsystem.test.js`.

**A room write that can be rejected says so.** Five of them could not: room
creation, join, team-room entry, add-story and remove-story all `await`ed a write
with no `catch`, so a rules rejection or a dropped connection surfaced as an
unhandled promise and a button that appeared to do nothing. `resetSession` was
the sixth and the one that made it visible. Every write into `rooms/` now
`console.error`s and shows a toast naming the action that failed. If you add
another, it does too.

**A panel owns the gap between its children; the children own nothing.** Every
block inside a `.panel` used to declare its own margin — 14px from three
analytics sections, 0 from the timer's Start countdown button, 24px from a
`<Grid>` — so no two gaps in one panel were the same number. The visible
symptom was the Countdown length hint sitting 8px under the select it describes
and 0px above the button below it: the helper had detached from its own control
and attached to the next one, and the panel's 20px bottom padding made the whole
card look bottom-heavy. Two rules replaced all of it, and the ladder is now
monotone — 8 inside a field, 12 under the panel's eyebrow, 16 between blocks,
20 to the edge:

```css
.panel > * + *          { margin-top: var(--sp-4); }
.panel > .ptitle + *    { margin-top: var(--sp-3); }
```

A block needing more says so *after* that rule (`.round-actions` does). Do not
give a panel child its own `margin-top` to "fix" a gap; change the panel's
number or the child's position. Guarded in `designsystem.test.js` → "one gap
scale".

**A control is one rung above its container or it is not a control.**
`.pp-btn--secondary` was painted `--surface-1` — the exact value a `.panel` and
a `.pp-card` paint themselves — so Re-vote, New sprint, Start countdown, Copy
and CSV were all the same colour as the thing they sat on, with a hairline as
the only evidence they were pressable. They are `--surface-2` now, which adds
light on felt and ink on paper, so they read as raised in both themes without a
second accent competing with the one gold primary. That forced a matching move:
disabled was `--surface-2`, which would have made a dead control and a live one
share a fill, so disabled dropped to `--tint-raise` — still visibly a control,
unmistakably inert, and distinct from secondary on fill, text and border at
once. Guarded in `designsystem.test.js` → "buttons".

**Three numbers in a 300px rail are rows, not tiles.** Sprint Analytics' KPIs
were a `<Grid min="96px">`, which auto-fitted two-up in the 258px of content a
rail leaves and orphaned the third on a row of its own — and the 24px grid gap
was wider than the 14px between the panel's own sections, so one reading unit
sat further apart than the units did. Three columns is not the repair either: a
`--fs-6` value has no room in an 80px column, and shrinking the number to fit
would be fixing a layout problem with typography. `.a-kpis` is a flex column of
label-left/value-right rows sharing `.prow`'s geometry, so the analytics panel
and the players list in the same rail read as one product, and the tabular
values line up in a column — which is the only reason to group three KPIs. All
three section sub-headings (`.a-section-title`, `.a-align-title`,
`.analytics-breakdown-title`) share one uppercase treatment; Team Alignment used
to be sentence case, so one panel announced three peer sections three ways.
Guarded in `designsystem.test.js` → "the sprint snapshot is a stack, not a grid".

**Do not render a count of nothing.** "0 of 1 voted" is fine; "0 of 0 voted"
over an empty progress bar is not, and neither is a gold "0 stories done" badge
on a room that has not started. Zeroes read as data. Both are now conditional on
there being something to report — the design system had this rule and the room
was breaking it in two places.

**`--radius-sm` was 14px, which is `--r-md`, not `--r-sm` (10px).** It has been
remapped and deleted. Anyone doing that migration by name rather than by value
would have silently shrunk eleven corners.

**Numbers can pass while a screen looks broken.** That nav defect survived a
clean five-width automated sweep — no horizontal overflow, no clipped element,
nothing past the viewport — because a scroll container that slices its content
is doing exactly what it was told to. It was caught by looking at a screenshot.
Run both: the harness catches what the eye skims, the eye catches what the
harness has no assertion for.

## Deployment record

**Rules published to production on 2026-08-09** and verified against the live
database, not just the console's success toast. The three-`.parent()` estimate
fix, the analytics lockdown, the removal of the licences node and the admin
allowlist are all live. Verification method, worth repeating after any future
publish, because the console will happily tell you it saved something broken:

```bash
DB=https://planning-poker-b6ac1-default-rtdb.firebaseio.com
# An unauthenticated REST call is evaluated exactly like an anonymous browser.
curl -s -o /dev/null -w '%{http_code}\n' -X PUT -d '"8"' $DB/rooms/<code>/stories/0/estimate.json
# Read-only version, safe to run against production at any time. Every one of
# these must answer 401; a 200 means something is publicly readable.
for p in analytics rooms licenses users ops; do
  curl -s -o /dev/null -w "$p %{http_code}\n" $DB/$p.json?shallow=true
done
```

200 means allowed, 401 means denied. **Use the `firebaseio.com` host.** The
database is in the US multi-region, so a `europe-west1.firebasedatabase.app`
URL answers 404 on every path with `{"error":"Database lives in a different
region"}` — which reads exactly like a working lockdown if you are only
checking status codes, and is how a wrong URL sat in `functions/index.test.js`
without failing anything. Confirmed live: a queued-story estimate is
accepted, a wrong-deck value is rejected, a room claiming `plan:"pro"` is
rejected, analytics is unreadable, a counter cannot be forged or reset, nobody
can self-promote to admin, and `/rooms` cannot be enumerated.

**Node 22 confirmed running in production on 2026-08-09, and the reaper proved
it works rather than merely loads.** `reapStaleRooms` had never executed since
deploy, so the migration off Node 20 was unverified: the risk was entirely in
whether the modular `firebase-admin` rewrite survives a cold start, which no
amount of local testing settles. Rather than wait for the 6-hourly schedule,
force the job from Google Cloud console → Cloud Scheduler → select
`firebase-schedule-reapStaleRooms-us-central1` → Force run. The result:

```
12:31:52.197Z  reapStaleRooms: Function execution started
12:31:52.572Z  {"message":"reapStaleRooms: done.","reset":0,"deleted":1}
12:31:52.575Z  took 377 ms, finished with status: 'ok'
```

One cold start proves the module for both functions, since they are the same
`index.js`. Worth knowing for the next runtime bump: `functions:list` showing
`nodejs22` only proves what was uploaded, not that it runs.

**Recording an estimate is verified end to end on the live site**, which the
rules tests alone could not settle — they run against the emulator, and the
`.parent()` bug was a production-only failure. Facilitator joins, reveals,
presses Record, and the round advances with Sprint Analytics populating. If that
ever needs re-checking, one browser cannot do it: the room needs a Participant
to cast a card and a Facilitator to record it, so it takes two tabs, and the
second tab has to pick Facilitator explicitly — the record controls are all
`isObs`-gated and a voter cannot promote themselves.

**`notifyOnProActivation` was deleted on 2026-08-09.** It fired on every write to
`/users/{uid}`, which means every sign-in invoked it, and it existed only to email
about a Pro tier the product no longer has. The rules now accept any string for
`users/$uid/plan`, so a signed-in user could have written `plan: "pro"` and
`billingStatus: "active"` to their own profile and triggered a "Pro activated"
email to the owner and a Pro welcome email to themselves. Deleting the code closed
that off and took 201 lines of Pro-era email builders and team-room helpers with
it. Do not reintroduce a plan-watching trigger without a plan to watch.

**Two things in the live database that are not in the rules.** `/licenses` still
holds data from before the product went free; the node has no rule any more so
it falls to the `$other` deny-all and no client can reach it. `/ops` is written
by Cloud Functions through the admin SDK, which bypasses rules entirely, so the
deny-all does not affect it. Do not "tidy" either by adding rules for them.

**The Firebase rules are the source of truth and they must be redeployed by hand.**
Editing `database.rules.json` changes nothing in production until someone pastes
`database.rules.publish.json` into the Firebase console or runs
`npx firebase-tools deploy --only database`. `npm run test:rules` now runs the real
rules engine in the emulator against the generated publish file, so a broken rule
fails locally instead of in production. Two real outages hid here before it existed:

- `rooms/$roomId/stories/$storyIndex/estimate` was missing one `.parent()` in its deck
  lookup, so the validator resolved `stories/deck` (which does not exist) and rejected
  every queued-story estimate with `permission_denied`. The identical rule for `rounds`
  had the correct three parents, which is why the no-queue path worked and the queue
  path did not. If "record estimate" ever silently fails again, check the parent count.
- `track()` used `runTransaction`, which has to read the counter first. The rules deny
  read on `analytics/daily`, so every event had been failing since launch. It now uses
  `set(ref, increment(1))`, which is write-only.

**A Firebase multi-path update may never contain both a path and its own
descendant.** `update(ref(db), {...})` throws synchronously, before anything reaches
the network, if the object holds `rooms/X` and `rooms/X/players/Y` together. The old
`sweepStaleRooms` built exactly that pair whenever an expired room still had an away
player, a bare `catch` swallowed the throw, and the sweeper silently cleaned nothing
while every visitor still paid to download the whole `rooms` node. Room-level and
player-level cleanup are now separate: `sweepStaleRooms` only writes room paths and
queries by `createdAt` (needs `.indexOn`), and `sweepAwayPlayers` runs inside the room
the away player is actually in.

**Analytics counters may only step up by exactly one.** The rules enforce
`newData.val() === data.val() + 1`, which is what `set(ref, increment(1))` produces —
`increment()` resolves server-side before validation, the same as `serverTimestamp()`.
`scripts/rules-test.mjs` proves this against the real engine. Do not "optimise" a
batch of events into a single `set` of a larger number: the rules will reject it.

**Do not delete the room in `beforeunload`.** It used to, and a solo facilitator pressing
F5 lost their room and their whole story queue. `beforeunload` also does not fire reliably
on mobile Safari. `onDisconnect` marks the player offline and `sweepStaleRooms` cleans up
after an hour; that is enough. `myId` lives in `sessionStorage` so a refresh rejoins the
same room as the same person.

**`document.activeElement` is unreliable in a headless or unfocused browser.** It reports
`<body>` no matter what has focus, so focus assertions driven through a browser tool give
false negatives. Test focus behaviour in jsdom (`src/App.test.js`) instead. Several hours
were lost to this.

**StrictMode double-invokes effects in development.** Anything that captures state on
mount (the dialog hook's "what had focus before I opened") must be written so a second
mount does not overwrite the first capture.

**Do not add `autoFocus` to the name field.** It re-fires on every remount, yanks focus
out of open dialogs, pops the keyboard over the page on mobile, and skips screen-reader
users past the content. The name is remembered in `localStorage` anyway.

## Copy rules

- Never render an upsell to someone who already has the thing. No "create an account" to a
  signed-in user, no "upgrade" anywhere at all.
- State-dependent strings must be true in every state. A solo facilitator is not "waiting
  for votes" when there is nobody who could vote.
- UK English throughout.
- Watch the em dashes. The audience is engineers, and dense em-dash prose reads as
  machine-written. Commas and full stops nearly always work better.

## Strategy

Free for everyone while the user base grows. The point of the analytics is to answer four
questions and no others: is anyone using this, do they come back, who are they, and would
they pay. If a metric on the dashboard does not change a decision, delete it.

The willingness-to-pay poll is the only thing on the site that can answer the pricing
question. Usage counters cannot: revealed preference from a free product is silent on
price. Treat stated preference as a ceiling and halve it.

## Layout bugs that survived a passing test suite

Three defects shipped together and all three came from the same place: a rule that
looked correct in isolation and was wrong in context. Worth reading before touching
the CSS block.

**A media query above the rule it overrides does nothing.** The hero shipped with the
logo hard left and the headline centred. Both rules were right; the `@media
(min-width: 1024px)` block was written above the base rules, and at equal specificity
the later rule wins. Seven declarations were dead: the title's alignment *and* its
desktop font size, the subtitle's alignment, margin and measure, the trust strip's
alignment, and the card's animation override. `.join-mark` was declared above the block
so its override did apply — which is precisely why the mark and the headline ended up
on different axes. The visible symptom was one line of the actual damage.

This had already been hit once on `.join-box` and was patched by scoping it to
`.join-layout .join-box` to win on specificity. That fixed one selector, left four
broken, and left a comment about the trap sitting directly above the rules still in it.
Patching with specificity hides the class of bug. Move the block.

**A line box smaller than its own text.** The navbar caption sat at 13px with
`line-height: 1`. Outfit's ink at 13px is 16.5px, so the glyphs were 3.5px taller than
their line and the descenders of "sign-up" crossed the navbar's bottom border. That is
what "squashed" means, measurably. The same defect was live in the admin dashboard on
`.analytics-chip`.

The caption was removed rather than restyled. The navbar is a hard 64px with zero
horizontal slack at 1104px, so nothing could reserve room for it: it had accumulated
five hacks (absolute positioning, `line-height: 1`, a 3px offset, `nowrap`, and
`display: none` below 520px) and still overflowed. And every claim it made was already
made better by the page under it — `/pricing` opens with "no paid tier, no trial
countdown and no credit card field anywhere", and the join screen states the same three
facts in the H1, the sub, the trust strip and the CTA label. It was the fourth
restatement, and the only illegible one.

**Measure before believing a heuristic.** The automated sweep also flagged
`.brand-wordmark` for the same pattern — ink 5px taller than its box. Measured against
the mark beside it, both centre at y=32, offset 0: the overflow is symmetric, nothing
clips it, and it is a two-word lockup rather than prose. Left alone. A sweep produces
candidates, not verdicts.

## The signed-in screen was a second product

Signing in did not change the layout, it added to it. The screen kept the marketing
shell — hero left, 480px form card right — and stacked an account dashboard inside the
form column. Measured at 1440x900:

| | before | after |
|---|---|---|
| page height | 2,846px | 1,342px |
| `Create Room →` | y 2,250 | y 746 |
| left column at first paint | 552x900 of empty background | the two Team Rooms |
| account chrome above the form | 1,141px | 0 |

The hero sat at y=1,123 because the grid centred a 197px column against a 2,233px one,
so the headline was below the fold with nothing around it and the top-left quadrant of
the viewport was empty. Every room URL rendered as `htt…` — a link box 200px wide
showing three characters.

**The cause is a content model, not a spacing value.** A single column is right on a
phone and wrong on a desktop where 552px sits unused beside it. The fix is the same
two-column shell the signed-out screen already used, with the empty column carrying the
thing a returning user came for. Nothing was invented: the panel is the room list that
was already there, given room to be legible.

**Everything in it was already on the same screen.** An "Account workspace / Your
workspace is ready" card under the headline that says it. A "Display name" tile above
the field that holds it. A "2 fixed room URLs ready" tile on top of the panel that lists
them. Three "Final Room / Final URLs" lines above the two cards that show them. A
"Create one-off room" button beside the Create tab. Five cards, one fact each. When a
screen restates itself this much the question is not which card to shrink — it is which
one is the real one.

**Four controls for one choice.** The form's team tab could only ever target the two
rooms the panel lists; its name field is `readOnly` for exactly that reason. It carried
a room picker, that readOnly name, and a live code preview for a choice already made
beside it. Signed in, the tab is gone and the panel is the path. It returns for a shared
`/t/…` link, which is the one room the panel cannot list.

**A no-default has a cost somewhere, and it lands where the two halves meet.** The role
picker deliberately has no default (a silent "voter" once stranded solo facilitators with
no way to record — see the comment on `setRole`). The panel's Open buttons need it, so on
a phone opening a Team Room was Open, scroll, pick, scroll back, Open. The ask is now
held in `pendingRoomKey` and completed when the role is picked, and `clearErr` drops it
so nothing opens by surprise later. Persisting the last role — as `recallName` already
does for the name — would remove the step entirely, but that is a product decision and
the no-default is deliberate, so it was left alone.

**Moving focus is not a substitute for putting the message where the eye is.** A refusal
fired from the panel printed in the single error slot above the call to action, 350px
away in the other column. Focus moved to the offending control, which does nothing
visible: a programmatic `focus()` does not match `:focus-visible`, so after a mouse click
there is no ring. Errors now name their field (`errField`) and print beside it.

**Three smaller things found while measuring.** `startFocusToken` was passed to
JoinScreen and never read, so the navbar's "Start a free room" — the one screen where it
is not a link somewhere else — did nothing at all, while `designsystem.test.js` carried a
comment describing what it was supposed to do. Every `.lbl` was a bare `<label>` with no
`htmlFor`, so the accessible name of the name, code, team, email and password fields was
the placeholder, which disappears when you type. And `scrollIntoView({behavior:"smooth"})`
is an explicit argument that beats the `scroll-behavior: auto` the reduced-motion block
sets in CSS — six call sites animated for people who asked them not to.

## What the tests now pin

- `no min-width override is cancelled by a later base rule` — walks every top-level rule
  and every `min-width` block and fails on any override the source order kills. It found
  seven dead declarations on its first run, four more than had been noticed by eye.
- `no run of reading-size text is crushed to line-height 1` — with a short exemption list
  for fixed boxes holding one glyph, each with its reason.
- `the navbar CTA steps down where the form already is` — the one-primary-per-screen rule
  is per screen, so a shared component sometimes has to change rank by route.
- `the dashboard-inside-the-form classes stay deleted` — nine class names that only ever
  existed to restate what the screen already said.
- `a Team Room is reachable one way, not four`.
- `asking for a room you cannot have yet is not a dead end`.
- `no label element is left dangling` — a `<label className="lbl">` must carry `htmlFor`.
  It found three more in the auth dialog on its first run than the sweep that prompted it.
- `a heading for a group of buttons is a group, not a label`.
- `no call site hard-codes smooth scrolling`.
- `the navbar CTA's focus token is actually consumed` — the cheapest possible guard
  against a control that promises something and does nothing.

## Two traps specific to this file

- The CSS is a JS **template literal**. A backtick inside a CSS comment ends the string
  and breaks the build with a parse error pointing at an unrelated line.
- `app.indexOf("SITE FOOTER")` in a test hits the CSS section header, not the component.
  Anchor slices on `function <Name>`, which is unique.

## Secrets

The 21st.dev MCP key was pasted in plaintext and is compromised. The user-scope config
now reads `${TWENTYFIRST_API_KEY}` instead of a literal, and the literal was scrubbed
from `~/.claude.json`, `~/.claude/history.jsonl`, the session transcripts and the shell
history by equal-length in-place overwrite (the transcripts have open append handles, so
rewriting them would have broken the running session).

Note for future scrubbing: grepping for a secret by its literal value writes it straight
back into the transcript of the session doing the grep. Match it by pattern instead.


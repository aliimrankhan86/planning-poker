<!-- ════════════════════════════════════════════════════════════════
     GENERATED FILE. DO NOT EDIT BY HAND.

     Regenerate:  npm run docs
     Source:      scripts/gen-ai-context.mjs
     Hand-written prose belongs in docs/AI-CONTEXT.hand.md, which is
     spliced in at the bottom of this file untouched.
     ════════════════════════════════════════════════════════════════ -->

# pointpoker: context for AI agents

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
| `src/App.js` | The entire app: CSS string, all components, all Firebase logic | 441 KB |
| `src/routeMeta.mjs` | Route table, SEO metadata, prerendered content. Read by the app **and** the build | 18 KB |
| `src/AdminDashboard.js` | Owner-only usage dashboard, lazy-loaded so users never download it | 20 KB |
| `scripts/prerender.mjs` | Writes one real HTML file per route after the CRA build | 8 KB |
| `scripts/build-rules.mjs` | Strips comments from the Firebase rules to make the console-pasteable copy | 1 KB |
| `scripts/gen-ai-context.mjs` | Generates this file | 11 KB |
| `database.rules.json` | Firebase rules, with comments. **Source of truth.** | 17 KB |
| `database.rules.publish.json` | Generated. This is what gets pasted into the Firebase console | 12 KB |

`src/App.js` is one big file on purpose. It keeps deployment trivial for a solo maintainer.
Do not split it without a reason that outweighs that.

## Product facts

- **Everything is free.** There is no paid tier, no Stripe, no licence keys. Any code or copy
  implying otherwise is a bug.
- **Room capacity: 20 people**, facilitators included. One constant,
  `MAX_PARTICIPANTS` in `src/routeMeta.mjs`, used by both the enforcement and the marketing copy.
- **Card decks:** fibonacci, tshirt, powers.
- **An account is needed only to host a Team Room** (the URL slug is derived from the account
  name, so without one two different teams could collide on the same room) and to keep sprint
  history. Joining any room, including a Team Room someone shared, never needs an account.
- **Rooms are disposable.** Deleted when everyone leaves; idle rooms are swept after an hour.

## Routes (16)

- `/`
- `/terms`
- `/privacy`
- `/about`
- `/support`
- `/trust`
- `/what-is-planning-poker`
- `/fibonacci-story-points`
- `/agile-estimation-tool`
- `/pricing`
- `/features`
- `/planning-poker-online`
- `/scrum-poker`
- `/story-point-estimation`
- `/remote-sprint-planning`
- `/admin`  (private, never indexed, never prerendered)

Every public route is prerendered at build time with its own title, description, canonical,
Open Graph tags and JSON-LD. `src/App.test.js` fails if two routes ever share metadata.

## Analytics events (27)

Anonymous daily counters at `/analytics/daily/{date}/{event}`. Integers only: no user IDs,
no personal data, nothing that could identify a person or a room.

| `consensus_first_vote` | `estimate_recorded` | `feature_copy` | `feature_csv` |
| `feature_invite` | `feature_paste` | `feature_queue` | `feature_timer` |
| `pricing_viewed` | `room_created` | `signup_completed` | `signup_started` |
| `visit_new` | `visit_return` | `wtp_15` | `wtp_30` |
| `wtp_5` | `wtp_dismissed` | `wtp_zero` |

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
- `npm run build` — `node scripts/gen-ai-context.mjs && react-scripts build && node scripts/prerender.mjs`
- `npm run test` — `react-scripts test`
- `npm run eject` — `react-scripts eject`
- `npm run build:rules` — `node scripts/build-rules.mjs`
- `npm run test:rules` — `node scripts/build-rules.mjs && PATH="$(/usr/libexec/java_home -v 21 2>/dev/null)/bin:$PATH" npx --yes firebase-tools emulators:exec --only database --project demo-pointpoker 'node scripts/rules-test.mjs'`
- `npm run prerender` — `node scripts/prerender.mjs`
- `npm run docs` — `node scripts/gen-ai-context.mjs`

## Tests

`npm test` — 65 test blocks across AdminDashboard.test.js, App.test.js, designsystem.test.js, estimation.test.js (more cases
than that at runtime, because `test.each` expands). They cover the things
that break silently: the estimation maths (consensus, stats, slugs), SEO route metadata
uniqueness, and the dashboard arithmetic that business decisions rest on.

`npm run test:rules` — 62 assertions against the real Firebase rules
engine in the emulator (needs JDK 21, which the script locates itself). The rules cannot
be checked by reading them and have to be deployed by hand, which is how two silent
outages happened. Run this after touching `database.rules.json`.

Run both before committing.

## Design system

Read `docs/DESIGN-SYSTEM.md` before writing any UI. The short version: use a
token, never a raw px or hex value; one `.btn` base class with four intents;
one primary action per screen; icons from `ICON_PATHS`, never emoji.

| Measure | Now | Note |
|---|---|---|
| Design tokens in `:root` | 70 | Type, spacing, elevation, motion, semantic colour |
| Icons in `ICON_PATHS` | 18 | One stroke family, `currentColor` |
| Distinct font sizes in CSS | 64 | Target is the 8-step scale; the rest is unmigrated legacy |
| Distinct padding pairs | 83 | Target is the 4px grid |
| Legacy button classes | 14 | Migrate onto `.btn` when you touch one |

The last three are deliberately unflattering. They are the size of the remaining
migration, and they should fall over time, never rise. `src/designsystem.test.js`
fails if the token layer, the button system or the no-emoji rule is broken.

## Components in App.js (33)

`Icon`, `BrandMark`, `BrandWordmark`, `NavLinkButton`, `RouteLink`, `NavBar`, `SiteFooter`, `LoginModal`, `CookieBanner`, `Confetti`, `MarketingSection`, `MarketingRelatedLinks`, `MarketingPageShell`, `PricingPage`, `AboutPage`, `SupportPage`, `TrustPage`, `WhatIsPlanningPokerPage`, `FibonacciStoryPointsPage`, `AgileEstimationToolPage`, `FeaturesPage`, `PlanningPokerOnlinePage`, `ScrumPokerPage`, `StoryPointEstimationPage`, `RemoteSprintPlanningPage`, `LegalPage`, `TermsPage`, `PrivacyPage`, `HistoryModal`, `JoinScreen`, `WtpPoll`, `RoomActionBar`, `GameScreen`

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

**Neither variation touched the real constraint.** The hero above the form —
title, subtitle and four trust pills — is about 600px on its own, which is why
the primary action still needs a 320px scroll on a laptop. That is the largest
remaining lever on this screen and it is untouched, deliberately, so the A/B
comparison isolated one variable. Anyone picking this up next should start
there rather than shaving the form further.

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


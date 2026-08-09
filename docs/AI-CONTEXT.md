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
| `src/App.js` | The entire app: CSS string, all components, all Firebase logic | 420 KB |
| `src/routeMeta.mjs` | Route table, SEO metadata, prerendered content. Read by the app **and** the build | 18 KB |
| `src/AdminDashboard.js` | Owner-only usage dashboard, lazy-loaded so users never download it | 20 KB |
| `scripts/prerender.mjs` | Writes one real HTML file per route after the CRA build | 8 KB |
| `scripts/build-rules.mjs` | Strips comments from the Firebase rules to make the console-pasteable copy | 1 KB |
| `scripts/gen-ai-context.mjs` | Generates this file | 9 KB |
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

`npm test` — 39 tests across AdminDashboard.test.js, App.test.js, estimation.test.js. They cover the things
that break silently: the estimation maths (consensus, stats, slugs), SEO route metadata
uniqueness, and the dashboard arithmetic that business decisions rest on.

`npm run test:rules` — 47 assertions against the real Firebase rules
engine in the emulator (needs JDK 21, which the script locates itself). The rules cannot
be checked by reading them and have to be deployed by hand, which is how two silent
outages happened. Run this after touching `database.rules.json`.

Run both before committing.

## Components in App.js (31)

`BrandMark`, `BrandWordmark`, `NavLinkButton`, `RouteLink`, `NavBar`, `SiteFooter`, `LoginModal`, `CookieBanner`, `Confetti`, `MarketingSection`, `MarketingRelatedLinks`, `MarketingPageShell`, `PricingPage`, `AboutPage`, `SupportPage`, `TrustPage`, `WhatIsPlanningPokerPage`, `FibonacciStoryPointsPage`, `AgileEstimationToolPage`, `FeaturesPage`, `PlanningPokerOnlinePage`, `ScrumPokerPage`, `StoryPointEstimationPage`, `RemoteSprintPlanningPage`, `LegalPage`, `TermsPage`, `PrivacyPage`, `HistoryModal`, `JoinScreen`, `WtpPoll`, `GameScreen`

---

<!-- Hand-written notes. This file IS edited by hand and is spliced verbatim into
     the bottom of the generated docs/AI-CONTEXT.md. Keep it to things a script
     cannot derive: intent, history, and traps. -->

## Things that will bite you

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


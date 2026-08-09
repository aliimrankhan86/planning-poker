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

**A funnel is only a funnel if both halves count the same people.** The account
funnel divided completed registrations by `signup_started`, which fired from the
navbar Sign in button — so every returning user, and every reopen of the dialog,
inflated the denominator, while the two paths that genuinely open the dialog to
register never fired it at all. The live dashboard read 24 started, 0 completed,
0%, which looks like a broken signup and was actually a broken metric. The event
now fires from the dialog's own `mode`, which covers both opening straight into
register and switching to it, and is ref-guarded against StrictMode's second
effect pass. Historical counts stay polluted: compare from 2026-08-09 onwards.

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
to cast a card and a Facilitator to record it, so it takes two tabs. Note the
role picker defaults to Participant, so a solo tester who creates a room and
never changes it reaches a revealed round with no way to record — the record
controls are all `isObs`-gated and a voter cannot promote themselves.

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

<!-- Hand-written notes. This file IS edited by hand and is spliced verbatim into
     the bottom of the generated docs/AI-CONTEXT.md. Keep it to things a script
     cannot derive: intent, history, and traps. -->

## Product discovery decision — 13 August 2026

The evidence record for the product name, a possible retrospective feature, and
Google Ads is [`docs/PRODUCT-DISCOVERY-2026-08-13.md`](PRODUCT-DISCOVERY-2026-08-13.md).
Its current decision is **spend USD 0 now**:

- keep `pointpoker.app`; a neutral URL that merely redirects to a blocked final
  hostname cannot solve a hostname block, and the domain's actual enterprise
  filter classifications have not yet been verified;
- research retrospective demand, but do not build a generic retrospective tool
  without interviews and committed design partners; and
- do not run the proposed USD 1/day Google Ads campaign before the six-week SEO
  review, a useful activation conversion, privacy-compatible attribution, and
  an account-specific Keyword Planner forecast exist.

This is “not yet”, not “never”. Review the dated evidence and its reopening
gates around 23 September 2026. Do not turn the documented firewall anecdote
into a claim that banks generally block Point Poker, competitor bundles into
proof of Point Poker demand, or a broad CPC benchmark into a Point Poker
forecast.

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

**The marketing bar measures itself; it does not clip, and it has no hide-widths
at all.** This note has now been wrong twice, both times because it wrote down a
width. First it said the links were hidden below 780px and that a scroll strip
meant nothing was unreachable; that shipped and was reported from a resized
window — "PRICING" followed by "SUPPO", cut down the middle at the container
edge, with no "Point Poker" beside the mark one screenshot narrower. The fix for
that replaced 780 with 520 and 1024, and *that* was reported the next day: the
whole bar on two lines from 1024 to 1065. Read the ladder below before adding a
third number.

`.navbar-links` was `overflow-x: auto`, and a scroller has exactly one response
to running out of room. Nobody drags a navbar sideways, so what it bought was a
page that looks broken. There is no scroller now — `.navbar-inner` is
`flex-wrap: wrap`, and a flex container breaks a line before it shrinks
anything, so the group that no longer fits moves down whole. `.navbar-right`
carries `margin-left: auto` because `justify-content: space-between` does
nothing to a single item, which is what that group is once the bar has wrapped.

The wrap has to be at the seam between the two groups and nowhere inside them.
Wrapping one level lower reads as the same fix and is not: it puts "Point
Poker" on a line underneath its own mark. `.navbar-left` must stay `nowrap`.
The wrap still exists and still matters — it is what a bar narrower than
328/327/334 (EN/PT/JA) falls back to once there is nothing left to give up — but
it is no longer how the bar answers a shortage of width in the ordinary case.

**The wrap is now the last resort, not the mechanism.** Replacing 780 with 520
and 1024 was still one number per element, and it was reported again a day
later: at 1024–1065 the whole bar went to two lines, because 1024 was the
English answer rounded the wrong way. The bar needs **990px in English, 1045 in
Portuguese, 1057 in Japanese** — three numbers, one bar, and there is no fourth
that would have been right either, because the appetite also moves with the
signed-in state and the reader's font size.

So it is asked, not predicted. `useBarFit` measures and writes `data-nav-fit`
on `.navbar`; CSS says only what each verdict looks like. Cheapest first:

| rung | gives up | why it is cheap |
|------|----------|-----------------|
| `full` | — | |
| `no-links` | the four marketing links | all four are in the footer |
| `no-label` | "Dark theme" | the thumb still shows the state |
| `short-cta` | the long CTA label | the button names itself |
| `minimal` | the wordmark | the mark is the same control, and names both |

The wordmark is last on purpose — it is the piece a reader notices missing, and
it was half the original report.

Lowest width at which each rung is reached, English / Portuguese / Japanese, from
**settled reads** against the production build: `short-cta` 434/433/440,
`no-label` 563/588/595, `no-links` 621/646/653. One line from 328/327/334
upwards. Every one of those is a number no stylesheet could have known.

**`full` is 1064–1068 in English** — measured 14 Aug 2026, `no-links` at 1063
and `full` at 1068. This note previously said 1055, which was wrong; the
Portuguese and Japanese figures it carried (1110/1123) come from the same pass
and should be treated as unmeasured until someone re-reads them.

**Measure with settled reads or not at all.** An ascending 1px sweep that reads
the attribute a fixed 40ms after each resize reports a threshold high, because
the observer has not caught up and the read returns the previous rung. But note
how the 1055 error happened: that lag is real, and it was then used to "correct"
a reading of 1068 that had been right all along. Re-measure; do not reason a
number into a different one. Set the width, then poll until the verdict and the
bar height both stop changing.

**Five rules that are not optional, each learned by breaking it.**

1. *Never measure inside a ResizeObserver by mutating the DOM.* The obvious
   implementation puts the bar back to `full`, reads the real widths, writes the
   verdict. It earns `ResizeObserver loop completed with undelivered
   notifications`, after which the browser **stops delivering to that observer at
   all** and the bar freezes on whatever rung it was on. It survives a scripted
   resize sweep and dies during a real drag. Measurement is read-only.
2. *Read-only is not enough — the callback must not WRITE during delivery
   either.* Rule 1 was fixed and the same error kept firing, because the verdict
   was still assigned inside the callback, and assigned on every pass including
   the great majority that change nothing. Setting an attribute to the value it
   already holds still invalidates style, which resizes the observed boxes,
   which schedules another pass. So: write only when the verdict actually
   differs, and have the observer schedule a `requestAnimationFrame` that writes
   in the next frame, outside the delivery it would otherwise extend.

   **This one shipped.** It was seen during verification, confirmed not to stop
   the observer, and written off as benign because the bar still worked. It is
   not benign — `react-scripts` turns any `window.onerror` into a **full-screen
   dev overlay**, so the app looked crashed on every drag, and in production it
   reaches `window.onerror` and anything reporting from it. "Still behaves
   correctly" is the wrong bar for something that raises an error event.
3. *Hidden is not `display: none`.* A hidden piece must keep a box or it
   measures 0, 0 reads as "there is room now", and the bar shows it, overflows,
   and hides it again next frame. Everything droppable is `position: absolute;
   visibility: hidden`.
4. *Ghosts anchor to `inset-inline-end`, not `left`.* A ghost keeps its full
   natural width; anchored at the start it hangs off the right of a phone and
   scrolls the whole page sideways — 21px of document overflow in English, 42 in
   Portuguese, from elements nobody can see.
5. *Width-buying rules key off a viewport width, never off the verdict.* Tie the
   `≤520` padding block to `[data-nav-fit]` and the bar tightens, re-measures,
   finds it now fits a rung up, loosens, and no longer fits — for ever. Deleting
   it instead makes the ladder perfectly monotonic and puts 360 and 375 — the
   two commonest phone widths there are — onto two lines. Measured both ways,
   and it was kept.

   Keeping it costs a **42px band in English only**: `no-label` is reached at
   507, lost again at 521 when the padding loosens, and regained at 563, so
   521–562 wears the short CTA label. Portuguese and Japanese show no reversal
   at all — both sit at `short-cta` either side of 520. An earlier draft called
   this "one four-pixel step", which was the lagging sweep talking. The wordmark
   is never involved, which is what makes the band acceptable.

`Switch` now names its own input (`aria-label`), which is what makes rule 2 safe
for the theme word: the name no longer lives in the span being hidden.

**Why no number could have worked.** The four labels measure 328px in English
and 359 in Portuguese; the call to action 151 against 176. Portuguese also
spelled the fourth link "Perguntas frequentes" — 209px, wider than its other
three combined, enough on its own to hold the bar on two lines at every desktop
width. It is `FAQ` now, the ordinary Brazilian Portuguese label, with
`nav.toFaq` still carrying the full phrase as the accessible name.

"the marketing bar" in `designsystem.test.js` holds eleven tests, seven added by
this pass (two of them guarding the ResizeObserver rules above); one more was rewritten under "the theme switch survives every width"
(six there). Each of the six new-or-changed ones was mutation-tested. Verified
by sweeping 320→1440 in all three languages against the production build: zero
clipped strips, zero document overflow, one line from 328/327/334 upwards.

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
label-left/value-right rows sharing `.pp-participant`'s geometry (`.prow` until
the roster moved into the design system), so the analytics panel
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

**`/licenses` is retired and `/ops` is admin-only.** The two dead licence flags
were backed up and removed from the live database on 11 August 2026. The node
has no rule, falls through to `$other`, and must stay inaccessible; do not
re-create it from an old Pro-era note. `/ops` is written by Cloud Functions
through the Admin SDK, which bypasses rules, so the client deny-all does not
affect it and no public rule should be added for convenience.

**The Firebase rules are the source of truth and require an explicit deploy.**
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

## The page had no leading at all — 14 August 2026

Reported by the owner as inconsistent typography between the join hero and
`/what-is-planning-poker`, then as "random spacing". Two findings.

**The H1s used different typefaces.** `.pp-hero__title` was `--font-display`
(Cormorant) and `.join-title` is `--font-ui` (Outfit), so the brand changed face
one click from the home page. `.pp-hero__title` is Outfit now, at the join
hero's `-0.03em`. The two keep different *sizes* — that is hierarchy, not drift.

**Nothing had ever set a document line-height.** Not `html`, not `body`. The
app's default leading was therefore the browser's `normal`: a font-metric guess,
~1.24 for Outfit and a different number for every fallback face. The type obeyed
the scale only where a rule happened to name a token, and **142 elements on the
home page alone were running on the guess**. That is the whole of "random
spacing" — not wrong values, missing ones.

```css
body { line-height: var(--lh-snug); }
button, input, select, textarea { line-height: inherit; }
```

The second line is required: the UA stylesheet pins form controls to `normal`,
so they do not inherit the page's leading unless told to.

Alongside it, five places where inheritance would not have supplied the right
value: `.pp-section-head__title` gained `--lh-tight` (it had none);
`.pp-section-head__sub` moved to `--lh-body` to match `.pp-hero__sub`, the same
18px sentence in the same role; `.marketing-prose` moved from `--fs-2` (the
*helper text* size) to `--fs-3`; `.marketing-list li` moved from `--fs-1` — the
scale's floor, reserved for uppercase micro-labels — to `--fs-3`; and
`.marketing-list` gained `max-width: var(--measure)`, having run 784px wide
(~80 characters) starting 36px left of the prose above it.

Two things to keep:

- **The declaration ceiling caught a duplicate the global rule had created.**
  Two elements had been given an explicit `line-height` that inheritance now
  supplies with an identical computed value. The test failed at 1373 > 1371 and
  the right answer was deleting both, not raising the ratchet. It stays at 1371.
- **A unitless line-height resolves against each element's own font-size**, which
  is why the list marker needs no declaration of its own: it inherits `1.6` and
  computes 13 × 1.6 while the text gets 16 × 1.6. That replaced `top: .22rem`, a
  number tuned by eye to one font size and wrong at every other.

**Never put a backtick in the App.js stylesheet, including in a comment.** The
whole `CSS` block is a JS template literal; one backtick ends the string and
takes the app down. Done twice while writing this.

## A focusable element must never be aria-hidden — 14 August 2026

Chrome logged this on every content page, and it was missed because the console
had been read *filtered to errors*, returning a cumulative buffer of stale dev
entries instead of the live warning:

```
Blocked aria-hidden on an element because its descendant retained focus.
Ancestor with aria-hidden: <button class="navbar-brand" aria-hidden="true" tabindex="-1">
```

**Read the console unfiltered, in a fresh tab, after interacting.** The dev
server's buffer spans the whole session.

The wordmark is aria-hidden on purpose — it is the same home control as the
labelled mark beside it, and one destination should not be announced twice. The
defect was shipping that as a `<button>`. The comment there claimed
`tabIndex={-1}` legalised it; it does not. `tabindex="-1"` removes an element
from *sequential* tab order only, and a pointer click still focuses it.

It is a `<span>` now. `inert` — which the browser message suggests — prevents
focus but also swallows the click, so it cannot be used on something that must
stay clickable. A span cannot take focus at all. Nothing is lost for keyboard or
screen-reader users: `BrandMark` directly above is a real button, with a real
name and the same `onClick`.

Two consequences worth keeping:

- **`display: inline-flex` on `.navbar-brand` is load-bearing.** `transform`
  does not apply to a non-replaced inline element, so a plain inline span would
  silently drop the `:hover` lift and give the 44px tap-target `::after` an
  inline box to hang off. A `<button>` was inline-block for free.
- **The ghosts were never at fault.** `visibility: hidden` refuses focus and
  releases it — verified by focusing a nav link at `full` and dragging to 500px,
  which moves focus to `body` with no warning. Only the aria-hidden button broke
  the rule.

Pinned by three tests in `describe("nothing hidden from assistive tech can take
focus")`, mutation-tested against the restored `<button>`.

The other console lines on that page are all dev-only, each checked: the failing
`ws://localhost:3000/ws` socket is CRA's HMR client (`sockjs` and
`webpack-dev-server` are absent from the build; the one `ws://` in the bundle is
Firebase RTDB's own transport), the React DevTools notice is a dev-mode
`console.info` whose string is absent from the build, and Speed Insights' debug
notice is replaced by `script.js` in production.

## Time up stops the clock, it does not turn the cards over — 14 August 2026

Reported by the owner as basic timer behaviour that was missing: when the
countdown ends, the facilitator should be the one who reveals, so the team can
talk first — or get more time.

What it used to do was reveal by itself. The tick at zero wrote
`revealed: true` from whichever browser happened to be driving the clock, which
is the wrong hand on the deck: a facilitator is running a ceremony out loud,
and the room's cards turned over mid-sentence, sometimes with a voter still
deciding, and with nothing to undo it. The panel even advertised it —
"Cards auto-reveal on zero".

Zero now stops the clock and nothing else. The facilitator gets:

- the action bar's primary relabelled to **"Time is up — reveal everyone's
  cards"**, in the place that button always sits;
- a warning panel saying the cards are still face down, and naming both options;
- the countdown row back, so "give them another 30 seconds" is one click.

Voters get "Time is up. The facilitator reveals the cards — you can still play
one until they do." — which is true: the deck is only locked at reveal, so a
late card still counts.

**The expired state is derived, not stored** (`isTimeUp` in
`src/estimation.js`). A stopped clock sitting on `remaining: 0` with nothing
revealed can only have got there by running out: a manual stop keeps the second
it stopped on, a new round restores the duration, both reveal paths write
`revealed` in the same breath as `remaining: 0`, and the "whoever started the
timer left" guard writes `running: false` alone. So there is no new Firebase
field, no `database.rules.json` change, and no second write that can drift out
of step with the first. Seven tests in `describe("isTimeUp")` pin each of those
states, because the derivation is only safe while they hold.

Auto-reveal when *everyone has voted* is untouched — that one is the table
finishing, not a clock expiring.

## The ghost variant is deleted — 14 August 2026 (reported by the owner)

"I want the important CTAs to be in colour… I am not a big fan of the ghost
variant." Applied product-wide, not to one screen.

`.pp-btn--ghost` was transparent fill, transparent border, `--text-2` label — a
line of text that happened to be clickable. It was carrying **nine real
controls**: Sign in, Sign out, Stop timer, Leave, Resend verification email,
Dismiss, and every Back link in the product including the admin dashboard's.

It is **deleted, not restyled**. The system already had three rungs that all
paint themselves, and every call site belonged to one of them:

| rung | means | where the ghosts went |
|------|-------|-----------------------|
| `--primary` | the one action of the screen | — |
| `--accent` | the action of *this panel* | **Stop timer**, which now matches the Start countdown it replaces |
| `--secondary` | a way out of this, and the default | Sign in, Sign out, Leave, Dismiss, Resend, both Back links, dashboard Back |

**`.dash-back` went with it** — eight declarations stripping a design-system
Button back to a text link (background, border, colour, font, size, tracking,
padding) from outside the component, which is the one thing App.js is not
allowed to do to a `pp-*` component. The dashboard's back control is an ordinary
secondary button now. **Ceiling 1369 → 1361.**

### The signed-in workspace, seen without an account

"Open Room 1 →" was the one call left as a neutral fill, and it is the returning
user's whole errand: the page greets them with "Welcome back" and offers a fixed
Team Room or a one-off session, and the gold was on Create Room — the *other*
path. It is `--accent` now, in both cards. Accent rather than a second primary,
so the screen keeps exactly one gold gradient.

**How it was verified without credentials, and how to do it again.** The panel
is gated on one line — `const signedIn = !!currentUser;` in `JoinScreen`.
Flipping it to `true` in the local dev build renders the whole workspace with
placeholder rooms ("Alex Johnson Team", "…Team 2"), which is enough to judge and
screenshot in both themes. Restore the line from a backup afterwards and confirm
with `grep -c` that no stub survives — this must never reach a commit.

Never take an account password to see a screen. There is almost always a gate to
flip locally, and a stub cannot lock anyone out, leak a session, or be
accidentally reused.

### What this cost, stated honestly

The navbar used to rank `ghost (Sign in) → secondary → primary`. On the join
screen the CTA is deliberately `secondary` (it only scrolls to a form already on
the page), so Sign in and "Start a free room" are now **the same weight there**.
That is a real flattening, and it is the right trade: the gold on that screen
belongs to "Create Room", which is the control that finishes the job, and
neither bar control is invisible any more. On the other thirteen routes the CTA
is `primary` and the rank is unchanged.

### The nav ladder did not move

Checked, because three notes in this file have been wrong about a nav number.
The border box lives on `.pp-btn` itself (`border: var(--bw-hair) solid
var(--btn-bd)`), so a transparent border occupies the same pixels as a coloured
one — **Sign in measures 78px either way**. `git stash` isolation on the same
dev server, settled reads: `full` at 1068 and `no-links` at 1063, both builds,
65px tall.

**A resize without a reload lies.** Going 1068 → 1063 and reading gave `full` at
113px — a wrapped, stuck bar. Reloading at 1063 gave `no-links` at 65px, which
matches the record. Reload between widths or the reading is hysteresis, not a
threshold.

### A test that passed with the rule broken

`expect(rule).toMatch(/--btn-bg:\s*(?!transparent)/)` is green on
`--btn-bg: transparent`: `\s*` backtracks to zero width and the lookahead then
runs against the space. Found by mutation-testing the rule I had just written.
It reads the value out and compares it now.

## Reveal shows the people first — 14 August 2026 (reported by the owner)

Asked for: the facilitator's reveal button in a yellow shade, clicking it should
show who voted what, and important buttons should stand out.

**The reveal button was already gold** — `variant="primary"`, an
`--action-gradient` from `#ffd978` to `#d99b1f`, the biggest thing on the
pre-reveal screen. Nothing to change there, and it is worth saying rather than
quietly claiming a fix.

**What was actually wrong was the order after the click.** The results panel
opened with the AVERAGE VOTE hero — the number, then min/median/max, then the
spread — and put WHO PICKED WHAT roughly **780px down the page**. So a
facilitator who pressed Reveal in front of a room saw a mean, and had to scroll
to find out who had actually said what. That is the one thing the table is
about to talk about, and the product's own guide says so: consensus comes out
of the conversation about the differences, not out of the average.

The cards come first now. Measured at the top of the page after a reveal, in a
943px viewport: the cards occupy 523–674 and the hero starts at 706, so both
are on screen and the faces are the thing you land on. Nothing is lost on a
consensus round — every card carries the same number — and the split-vote
decision card lower down already repeats votes shown, average and spread, which
is where a facilitator picking a number reads them anyway.

**Remove is red.** It was `variant="ghost"` in the participant rail: the same
weight as the name beside it, for an action that takes somebody's vote off the
table with no undo. It is `variant="danger"` now, the treatment End session
already wears, which gives the room one consistent word for "this takes
something away". Its visible label was also **hardcoded English** while only the
`aria-label` was translated, so pt and ja rooms had an English button in the
rail; it is `t("game.remove")` now.

**Ceiling ratcheted 1370 → 1369.** `.avg-hero-sub` declared
`margin-top: var(--sp-3)` while `.avg-hero > * + *` already supplied exactly
that, and the sub is never the first child. Verified on both live instances —
12px either way — then deleted.

### The timer-expiry flow, tested end to end

The owner asked for the whole path, not just the expiry: countdown runs out →
facilitator can still reveal → then record, re-vote, or anything else. Run
twice in a live three-browser room:

| step | result |
|------|--------|
| countdown reaches 0 | cards stay down, status **TIME IS UP**, gold enabled "Time is up — reveal everyone's cards" |
| Reveal | WHO PICKED WHAT first, with the voter's card and name |
| decision row | Record *n* & next item (gold, enabled), Re-vote, New sprint, End session (red) — all live |
| **Record** | advances to story 2 of 3, summary reads "User login flow, PROJ-42 → 8", 1 of 3 sized, 8 points total, analytics update |
| **Re-vote** | round resets, cards cleared, expired state gone, countdown row back |

## The exports carry the product's name — 14 August 2026

Asked for by the owner: the PDF should carry the logo and "Point Poker",
properly laid out, and the CSV should say where it came from. A file that lands
in a Slack channel or a Downloads folder outlives the session that made it, and
it is the only thing about this product a stranger ever sees.

### The PDF was the whole live room

`PrintReport` — mark, wordmark, domain, title, meta line, table, footer — had
existed all along. Nobody saw it, because it rendered **inside the summary
panel**, inside `.game-body`, and nothing hid the room. Pressing Print / PDF put
on paper: the action bar with "0 of 1 voted", an empty "Add an item" textarea, a
Countdown length `<select>`, the participant list, the analytics rail — controls,
on a sheet nobody can click — and the branded report somewhere below all of it.
Worse, the print theme only forces `#000` on `p, li, td, th`, so every label
that happened to be a `span` printed in its dark-theme grey onto white paper.

`PrintReport` renders **outside `.game-body`** now, and `.game-body` joined the
print hide-list. The sheet is the report and nothing else. Two more selectors
went into the same list, both free because a selector list costs no
declarations: `.skip-link`, and `body::before` — the felt is a full-bleed
`position: fixed` graphic, and on a printer told to keep background graphics it
washed every page green.

Verified by lifting the app's own `@media print` rules out of their media query
with `document.styleSheets` and screenshotting — the real cascade, not a
transcription of it.

### Where the CSV signs itself is the whole decision

The line is `game.summaryFooter`, the same sentence the Copy button uses, so the
two exports cannot drift apart. It goes **last, after a blank row, in the first
column**, and both of those are load-bearing:

- **Last**, because `/support` and `/remote-sprint-planning` both promise the
  file imports straight into Jira, Linear and Azure DevOps, and every one of
  those readers takes row 1 as the column names. A preamble renames the columns
  to an advert.
- **First column**, because an importer that reads past the blank row maps
  column 2 to Summary, finds it empty, and rejects the row. Put the sentence
  under Item instead and a careless import files a ticket named after our own
  marketing.

Serialisation moved out of the click handler into `summaryCsv` in
`src/estimation.js` — the file is a contract with somebody else's importer, so
its shape is testable without a browser. Seven tests, and the output was also
round-tripped through a real RFC 4180 parser: header plus data rows at three
columns each and unshifted, then a one-column footer row.

The filename already carried `Point-Poker-…` and still does. That is the second
place the brand appears, not the only one — the old comment claiming otherwise
is gone.

### Two things found on the way

- **`.prose a[href^="http"]::after` had never fired.** The print rule meant to
  spell out a link's destination on paper named `.prose`, and nothing in this
  product renders that class — the pages use `.marketing-prose`. Fixed rather
  than deleted, because the intent was right. The dead-class test missed it
  because "marketing-prose" contains the string it was looking for.
- **Marketing pages still print their labels in dark-theme grey.** Body prose is
  fine — `p, li, td, th` are forced to `#000` — but a label inside a stat card is
  a `span` and prints near-invisible on white. Not touched here: it is
  pre-existing, it is a different surface from the room's export, and doing it
  properly means checking ten routes in both themes. Worth a session of its own.

## Two sticky things, one z-index — 14 August 2026 (reported by the owner)

From a screenshot of a scrolled room: the action bar printed across the header.
"CARDS ARE UP" over "← Leave", "0 of 1 voted" over the invite link, the story
queue reading straight through the card.

**Three faults, and each was hiding the others.**

1. `.action-bar` stuck at `top: var(--sp-3)` — 12px from the top of the
   *viewport*, which is inside a header that measures 61–100px. It had never
   parked below the header; it parked behind it.
2. Its `z-index` was `var(--z-sticky)`, the header's own value. A tie goes to
   whichever comes later in the DOM, and that is the bar — so it painted on
   top of the header rather than under it. Fixing only the offset would have
   hidden the bar; fixing only the z-index would have left it stuck in the
   wrong place.
3. The card is 76% opaque, which is right for something sitting *on* the page
   and wrong for something the page slides *under*. Once the offset was fixed
   the story queue read through it. It is frosted now — `backdrop-filter:
   blur(20px)`, the same value `.hdr` uses, because they are the same material
   doing the same job one above the other. In the light theme the card surface
   is already fully opaque, so the blur only matters in dark.

**The header's height is measured, not written down.** `useHeaderHeight`
publishes it as `--hdr-h` on the document root and `.action-bar` sticks at
`calc(var(--hdr-h) + var(--sp-3))`. There is no number that would have worked:
the invite block stacks label, helper and URL on a desktop and collapses to a
button on a phone, and the round/stories-done/room-code chips arrive as the
session goes on. Same room, same page: **100px at 1280, 61px at 820**. The
token in `tokens.css` is a fallback — the one-row minimum, what the header is
before it has anything to say.

The hook obeys the three rules the marketing bar learned the hard way: the
ResizeObserver callback mutates nothing and only asks for a frame; the write
happens in that frame and only when the value changed; and it writes a custom
property the header's own height does not depend on, so there is no loop to
close. Verified with a listener attached during a resize sweep — zero
`ResizeObserver loop completed with undelivered notifications`.

**This is a desktop-only bug.** `.action-bar` is `position: static` below
780px, so the phone was never affected.

**The declaration ceiling stayed at 1370.** `backdrop-filter` was paid for by
deleting the `display: block` on `.timer-setup + .pp-hint`, which did nothing —
the hint is a `<p>`, `.pp-hint` sets no display, and reverting the declaration
on the live element computed `block` either way. The ratchet only goes down.

Five tests in `describe("what sticks under the room header")`, each
mutation-tested. Verified live at 820, 900, 1180 and 1280 in both themes:
constant 12px gap while stuck, zero overlap, zero document overflow.

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

The caption was removed rather than restyled. The navbar was a hard 64px with zero
horizontal slack at 1104px (it wraps now — see the marketing-bar note above — but
that grows a line for a *group*, not for a caption glued under one button), so
nothing could reserve room for it: it had accumulated
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

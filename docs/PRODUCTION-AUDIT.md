# Production readiness audit — 2026-08-10

One pass over the whole product: architecture, backend and data, frontend, security,
SEO, and QA. Findings are ranked by what they cost a real user, and every one that was
fixed is fixed with a test that fails if it comes back.

**Result:** 334 tests passing across 6 suites (300 before), 65 Firebase rule assertions
passing against the emulator, 6 Cloud Function tests passing, production build clean at
222.31 kB JS / 9.59 kB CSS with 15 prerendered route documents. Nothing committed.

---

## The shape of the biggest problem

Seven of the ten findings are one thing wearing different hats: **an operation fails and
the interface says nothing.** A rejected Firebase write became an unhandled rejection, a
read that could never reject left a button pressed forever, a synchronous throw landed in
an unawaited handler, a render error blanked the page.

In every case the person pressing the button sees the same thing — nothing — and in a
product where "it worked, wait for the others" also looks like nothing, that is the worst
possible failure mode. The previous commit's title says it out loud: *"stop five writes
failing in silence."* Five were found and fixed one at a time, as each was reported. Nine
more were still there. Fixing them individually again would have been fixing the symptom;
the finding is that nothing enforced the rule.

There is now a rule, and a test that walks every `await update|set|remove|push` in App.js
and fails on any that could reach a user as silence.

---

## Findings

### 1 · A single "." in the room code made the Join button do nothing — HIGH · fixed

`ref(db, \`rooms/${code}\`)` throws **synchronously** on `.` `#` `$` `[` `]`. The room-code
field accepted any character (`onChange` only upper-cased), and `go()` called `onJoin`
without awaiting or catching it. So the throw reached nobody: no toast, no console entry
the user would see, no state change. The button was simply dead.

The likeliest way in is not a typo. The Share button hands people a **URL**, and a URL
pasted into a box labelled "room code" contains `:` `/` `?` `.` — five illegal characters
and a guaranteed dead button.

**Fix.** `cleanRoomCode()` in `src/estimation.js`, applied at the field and at the
URL-derived prefill — the two places the value enters the app. A pasted share link has the
code lifted back out of it rather than stripped to nonsense; everything else is reduced to
base-36 and capped at the field's own `maxLength`.

Verified live: pasting `https://www.pointpoker.app/?room=A1B2C` leaves `A1B2C` in the
field. Typing `A1.B2` now reaches a real lookup and answers *Room "A1B2" not found* —
where before it answered nothing at all. Zero unhandled rejections in the console.

> Note on the naive version of this fix: stripping punctuation without extracting the code
> turns the pasted URL into a 12-character run of the domain, which is a perfectly legal
> room code. The lookup then fails on "no such room" instead of "that is a URL", and the
> person retypes the same paste. There is a test for exactly that.

### 2 · Nine Firebase writes could fail silently — HIGH · fixed

Playing a card, revealing, starting and stopping the timer, removing a participant, ending
the session, the timer reaching zero, the auto-reveal when everyone has voted, and the
five-hour expiry teardown — all bare `await`s.

The worst is `selectCard`, the most-pressed control in the product: a rejected vote left
the card unlifted and said nothing, so the table waits on a player who believes they have
already voted. The second worst is `endSession`, the one destructive action and the only
one behind a confirm: a rejected delete threw before every line below it, so the screen
never changed and the facilitator who had just confirmed *"permanently deletes all session
data"* was left sitting in the room with no idea whether it had happened.

**Fix.** One `write(failureMessage, run)` helper in `App()`, applied at all nine sites,
each with a message that says what did not happen. Three needed more than the helper:

- **The expiry teardown** leaves the room regardless of whether the delete lands, and picks
  its toast afterwards — the helper's message would have been overwritten by the success
  line three statements later. `reapStaleRooms` collects the room either way.
- **The per-second timer tick** stays quiet on failure, because the next second retries it.
  The zero-tick does not: the interval is already cleared by then, so a rejection there
  means the countdown stops and the cards never turn over.
- **`saveUserProfile`** deliberately still throws. Its two callers need opposite things
  from a failure — registration turns it into a visible error, the auth-state listener
  discards it so a profile write nobody asked for cannot block someone from using the app.
  A catch inside would take the first away. It carries a `throws: caller handles` marker,
  the one escape hatch the scanner honours, and a second test keeps the hatch to two uses.

### 3 · Three reads could hang forever — HIGH · fixed

```js
await new Promise((res) => onValue(ref(db, `rooms/${c}`), res, { onlyOnce: true }))
```

`onValue`'s third argument is an **options object, not an error callback**. On a failed
read the value callback never fires, so the promise never resolves *and* never rejects —
the Join and Open buttons stayed pressed for as long as anyone was willing to wait, and
the auto-reveal quietly stopped existing for the rest of the round.

**Fix.** `get()`, already imported, which rejects. Shorter code and a real error path.

### 4 · No error boundary — HIGH · fixed

The whole product is one component tree under one route. Any render error unmounted
everything and left a white page: no nav, no footer, no way back, and nothing to tell the
person whether the site was broken or their connection was.

**Fix.** `src/AppErrorBoundary.js`, wrapping `<App />`. It styles itself from the
`--boot-*` variables set in `index.html` before first paint, because the design system's
stylesheet is exactly the thing that might not be there — and it says the room outlived
the tab, which is true: the room is in Firebase and `myId` is in `sessionStorage`, so
reloading rejoins it.

Its own file rather than a few lines in `index.js`, because `index.js` mounts to the real
DOM at import time and a safety net nobody can render in a test is not a safety net. Six
tests, including one that checks the app is actually wrapped in it — a boundary can be
perfect and still catch nothing.

### 5 · Room codes came from `Math.random()` — MEDIUM · fixed

With no accounts on a room, the code **is** the access control: the rules grant read to
anyone who can name the room, because there is nothing else to check. Both ids came from
`Math.random().toString(36)`, which is wrong twice over for that job:

- `Math.random()` is a seeded PRNG whose future output follows from its past.
- `toString(36)` drops trailing zeros, so `slice(2, 10)` returns **fewer than eight
  characters about once in every 111,000 draws**. Measured, not assumed: 27 short ids in
  three million. (The five-character room code survived 3M draws intact — the claim is
  about `uid()`, and it is what a short player id would do to a room, not a room code.)

**Fix.** `randomId()` in `estimation.js`, drawing from `crypto.getRandomValues`. The
reject-the-tail line matters: 256 is not a multiple of 36, so a plain `% 36` leans on the
first four symbols, and an alphabet with a known lean is a smaller alphabet. Tests cover
length, alphabet reachability, uniformity across 90,000 symbols, and that `Math.random` is
never called.

The jsdom environment CRA pins has no `crypto` global, so `setupTests.js` wires Node's
real Web Crypto — closing a hole in the test environment, not in the product.

### 6 · The light theme painted a seam across every phone — MEDIUM · fixed

The page ground is written out in four files, in four languages, because three of them
must be right before the stylesheet that owns it has loaded. Two had drifted:

| Where | Was | Should be |
|---|---|---|
| `theme.js` `BROWSER_UI_COLOUR.light` | `#f6f3ea` | `#eceade` (`--paper-200`) |
| `manifest.json` `theme_color` / `background_color` | `#0c1a0f` | `#07110e` (`--felt-900`) |

`#f6f3ea` is three steps up the paper ramp from the colour the page actually paints, so
choosing the light theme on a phone put a pale band across the top of the screen. The
manifest still held the green from before the palette was rebuilt, matching nothing at
all — it drives the PWA splash and the Android task switcher.

Verified live: toggling to light now gives `--bg-page`, `--boot-bg` and the `theme-color`
meta all `#eceade`. Five tests read the tokens as the source of truth and check the other
four copies against them.

### 7 · The sitemap was a fourth, unenforced copy of the route table — MEDIUM · fixed

`routeMeta.mjs` already feeds the runtime router, the runtime `<head>`, and the build-time
prerender. `public/sitemap.xml` is hand-written, and a page missing from it is invisible in
the way that leaves no symptom: the site works, the page renders, nothing 404s, it simply
never gets crawled.

It happens to be correct today — all 15 routes present, none extra. Nothing was keeping it
that way. The project already stopped this class of drift twice (`build-rules.mjs` for the
security rules, `prerender.mjs` for the meta); this is the third. Five tests, covering both
directions, duplicates, absolute-and-canonical-host URLs, and the robots.txt room
exclusions.

---

## Checked and found correct

Worth recording, so the next audit does not re-derive it.

- **Firebase security rules.** 65 assertions pass against the emulator. Deny-all `$other`
  at the root; `/rooms` is not enumerable by any client (the room code would otherwise be
  worthless); `analytics` accepts only `+1` steps on a plausible date and a well-formed
  event name; `users` and `history` are owner-only; `admins` is write-denied to everyone,
  so nobody can promote themselves. `database.rules.publish.json` regenerates clean from
  the source, so the two cannot drift.
- **Cloud Functions.** No hard-coded SMTP secret. `escapeHtml` on every interpolated field
  in the notification email. `reapStaleRooms` is a scheduled trigger, not a public HTTP
  endpoint, and resets team rooms rather than deleting them because a team room is a
  permanent address. The signup notifier claims its work through a transaction, so a retry
  cannot double-send.
- **The admin dashboard** relies on the rules, not on its client-side gate. Correct: the
  gate is cosmetic and the enforcement is server-side.
- **No XSS surface.** No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`, no
  `document.write`, no `target="_blank"` without `rel`.
- **Secrets.** `.env` is gitignored and untracked, and holds only the public Firebase web
  config. No key material in the repo.
- **Effect hygiene.** All five `addEventListener` calls unsubscribe. Every `onValue`
  returns its unsub. The timer, session-check and auto-reveal intervals clear on unmount.
- **Headers.** `vercel.json` sets `nosniff`, `SAMEORIGIN`, a strict `Referrer-Policy`, a
  `Permissions-Policy` that closes camera/mic/geolocation/FLoC, immutable caching on
  hashed assets, and `noindex` on `/t/:slug`.
- **`window.confirm`** on the three destructive actions is a native element: accessible,
  keyboard-operable, focus-managed, and impossible to get wrong. Replacing it with a
  bespoke modal would be a downgrade wearing better clothes. Left alone deliberately.
- **The build.** Compiles clean with `CI=true` (warnings are errors). Prerender writes a
  real document per route with its own title, canonical and `<h1>`.

---

## Open, with reasons

**Create React App is archived.** `react-scripts@5.0.1` is unmaintained, which is where all
52 `npm audit` advisories live — `webpack-dev-server`, `ws`, `websocket-driver`, `yaml`.
**None of them ship**: they are build- and dev-time only, and nothing in that list appears
in the browser bundle. So this is not a live vulnerability, it is a supply of them with no
upstream fix. Migrating to Vite is the real answer and is a deliberate, separate piece of
work — not something to fold into an audit, where a broken build would be discovered by
users rather than by tests.

**Nothing caps how much a stranger can write.** Rooms are created without auth by design,
and RTDB rules cannot count children or rate-limit. An attacker can create rooms in a loop.
The control for this is a Firebase billing budget and alert in the console, not code —
worth setting before the product is promoted anywhere.

**Room-code entropy is 36⁵ ≈ 60.5M with public read.** That is the same model as any
join-by-code product, and rooms live at most five hours, so the live set is tiny relative
to the space. Accepted, and now at least drawn from a CSPRNG.

**Two capacity checks are read-then-write.** Two people joining a 19-person room at the
same moment can both pass. The cap is a product guideline, not a licence boundary, and the
fix would be a transaction on every join. Not worth it.

**Eleven of forty-eight design-system exports never render.** Carried over from the UI
overhaul: `Footer`, `Header`, `VoteHand`, `RevealCard`, `ParticipantList`, `AvatarStack`,
`Logo`, `Checkbox`, `Divider`, `Skeleton`, `TabPanel`. They are compositions, not
primitives — a half-finished migration target, not dead code. Finish or abandon it
deliberately; do not delete the target. (`Switch` came off this list when the theme
toggle became one — see Stage 9 in `docs/UI-OVERHAUL.md`.)

**`/admin` and the sprint-history modal remain unverified in the browser.** Both need a
signed-in owner account, which cannot be created from here. Signed-out and empty states are
clean, and both are covered by tests.

---

## Files changed

| File | Why |
|---|---|
| `src/App.js` | `write()` helper + 9 sites; `get()` for 2 hanging reads; sanitised code field and URL prefill; generators moved out |
| `src/estimation.js` | New room-addressing section: `randomId`, `playerId`, `mkCode`, `cleanRoomCode` |
| `src/AppErrorBoundary.js` | New — the last line of defence |
| `src/index.js` | Wraps `<App />` in the boundary |
| `src/setupTests.js` | Web Crypto for jsdom |
| `src/design-system/theme.js` | Light browser-chrome colour matches the page ground |
| `public/manifest.json` | PWA colours match the current palette |
| `src/estimation.test.js` | +16 — room addressing |
| `src/App.test.js` | +9 — sitemap agreement, no silent writes |
| `src/designsystem.test.js` | +5 — one ground colour across four files |
| `src/AppErrorBoundary.test.js` | New — +6 |

---

# Second pass — 2026-08-11 · the rules, under a real engine

The first pass read `database.rules.json` and reasoned about it. This one ran it.

`scripts/rules-test.mjs` already existed and already booted the emulator, so the whole
audit became empirical: write the attack, watch the rules engine allow or deny it, keep
the ones that mattered as permanent assertions. **65 → 81 assertions.** Everything below
was observed, not inferred.

## What held

No privilege escalation of any kind. A signed-in visitor cannot promote themselves to
admin, read the allowlist, probe a uid for admin status, read the analytics tree, read
another account's profile, write another account's history, or enumerate `/rooms`. The
deleted `licenses` node is unreachable. Writing `plan: "pro"` onto your own profile is
allowed and buys nothing — verified by trying it and then trying to read analytics.

The four writes the new delete feature makes — contiguous rewrite of `stories`, of
`rounds`, and both going to `null` — are all accepted. That was worth checking rather
than assuming: this session shipped them against the *deployed* rules, which are not the
rules in this repo.

Two things that looked like defects and are not:

- **A reaped team room has no `players` node.** `freshTeamRoomState()` writes
  `players: {}`, which Firebase does not store, so the reaper leaves a room the root
  `.validate` would reject as a creation. It does not matter: `.validate` does not
  cascade upward, so a browser joining that room writes only its own player node and is
  allowed. Joining, voting, starting a round and queueing a story all pass.
- **The last player cannot be removed.** Requiring `players` at the root means a write
  that empties it is rejected. `leaveRoom` deletes the whole room when it is the last one
  out, and `onDisconnect` only marks a player offline, so nothing reaches it. Both halves
  are pinned by assertions now, and the coupling is written down at the rule — it is the
  kind of thing a later "simplification" of `leaveRoom` would walk into, and it would
  fail inside an `onDisconnect` that no client ever hears back from.

## What did not — three fixed

### 8 · An unauthenticated write could seed a room with unbounded data — MEDIUM · fixed

`rooms/$roomId` takes writes with no auth, by design: the room code is the credential.
`stories/$storyIndex` and `rounds/$roundIndex` accepted **any key**. `stories/999999999`
was allowed. So was `stories/junkkey`. There is no way to bound a child count in a rules
expression, so nothing capped either list.

The index *is* the key, so constraining the key's format is the cap:
`$storyIndex.matches(/^[0-9]{1,3}$/)`. A thousand entries, ~200KB at the existing
per-name limit, and more backlog than a room will work through.

It is also a correctness fix. The client reads that node with `Object.values()` and sorts
rounds by `Number(key)` — an injected `junkkey` becomes a nameless story in the queue and
a `NaN` in the sort.

`addStory` refuses at the same number, because a multi-path update is atomic: one index
over the line rejects the entire paste, and the queue would have reported
*"check your connection"* for something that is not the connection. A test asserts the
rule's digit count and the client's constant describe the same limit.

### 9 · A profile email could carry a newline into a mail subject — LOW · fixed

`users/$uid/email` was length-checked and nothing else, and it leaves the database:
`notifyOwnerOnSignup` puts it straight into an SMTP subject line. A signed-in user could
store `a@b.com\nBcc: …` on their own profile — verified, allowed.

Nodemailer neutralises header injection and the HTML body is escaped, so this is the belt
to that pair of braces rather than a live exploit. Still: a field that reaches an SMTP
header should not be able to hold a newline. It is an allowlist pattern rather than a ban
on control characters, because the rules engine has no `\s` class — it rejects the
pattern outright, which is how the first attempt was caught.

### 10 · Analytics accepted counters on days that do not exist — LOW · fixed

`$date` matched `[0-1][0-9]-[0-3][0-9]`, so `2029-19-39` was a valid key. Bounded junk,
but junk in the one dataset that decides whether the product is worth continuing. The
regex now describes a calendar.

## Open, accepted, with reasons

- **Anyone holding a room code can grief the room** — delete it, reveal the cards, set
  `storiesDone` to 999. Verified allowed. This is the codeless design, not a defect: the
  code is the credential and there is nothing else to check. Worth stating plainly that
  **a Team Room's code is a slug of its name**, so `Product Team` → `product-team` is
  guessable in a way a random five-character code is not. Anyone naming a team room
  should know its URL is its password.
- **The 20-participant cap is client-side only.** A rule cannot count children, and
  unlike the story lists the key here is a random id rather than an index, so there is no
  format to constrain. Enforcing it needs a server-maintained counter — a real change,
  not a rule tweak.
- **`users/$uid/plan` still accepts any string.** Deliberate: legacy profiles created
  before the pivot carry `"pro"` and must still be able to re-save. It grants nothing,
  and there is now an assertion proving it grants nothing.

## Everything else this pass checked

`npm audit` reports 52 advisories, all transitive through `react-scripts`. Every flagged
package was grepped for in the built bundle — `grpc`, `protobufjs`, `node-forge`,
`shell-quote`, `websocket-driver`, `serialize-javascript`, `jsonpath`, `underscore` — and
**none of them ship**. They are build and dev-server tooling.

No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`, no `new Function` anywhere in
`src/`, `scripts/` or `functions/`. No `target="_blank"` without `rel="noopener"`. No
secrets in the tree: the Firebase config is read from `REACT_APP_*` env vars, the SMTP
password has no fallback default, `.env` is gitignored and only `.env.example` is tracked.
Every interpolation in the notification email's HTML body goes through `escapeHtml`.
ESLint clean across `src/` (one error fixed: `globalThis` needed an `es2020` env in
`setupTests.js`). Build clean. **373 Jest tests, 81 rule assertions.**

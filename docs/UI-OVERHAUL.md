<!-- Session log for the design-system overhaul begun 2026-08-10.
     Written as work happens so a dropped session can be resumed from here.
     Newest stage at the bottom. -->

# Design-system overhaul — running log

**Goal (user's words):** make the app premium and mature; the light theme is "very
bright", it wants subtler colour; motion where motion earns its place; fix visual
defects, bugs and code quality on the way. Guidance from `sovereign-ui`,
`apple-design`, `motion-ui`.

**Standing constraint:** no new runtime dependencies. `motion-ui` is applied as
principles (transform/opacity only, token durations, reduced-motion honoured,
motion that communicates state) expressed in the CSS the product already ships.
Adding the `motion` package to a 219 kB bundle for a planning-poker app does not
pay for itself.

## Baseline (before any change)

- `npm test` — 269 passing, 5 suites.
- Bundle 218.81 kB gzipped.
- Token layer already exists and is good: `src/design-system/tokens.css` holds
  semantic roles, dark on `:root`, light under `[data-theme="light"]`, plus a
  legacy bridge that re-points ~1,200 old names in `src/App.js`.
- `src/designsystem.test.js` (63 tests) enforces the rules; it is the regression
  net for everything below.

## Stage log

### Stage 0 — discovery (done)

Read `tokens.css`, `base.css`, the test names, and the AI context docs. Started the
dev server on an auto-assigned port (3000 was taken by another session; added
`autoPort: true` to `.claude/launch.json`).

### Stage 1 — the light theme had no value structure (done)

Measured rather than eyeballed. The whole light theme lived between **L\* 92.8 and
L\* 100** — a seven-point band at the very top of the range — which is exactly the
"very bright" complaint:

| role | was | L\* |
|---|---|---|
| page gradient, top stop | `#fffdfa` | 99.4 |
| `--surface-1` (every card) | `#fffefb` | 99.7 |
| `--surface-3` | `#ffffff` | 100.0 |
| `--bg-page` | `#f6f3ea` | 95.8 |

A card was **0.3 L\* from the page behind it** at the top of any page, so nothing
could read as raised; two-thirds down the same card was *lighter* than the page, so
elevation inverted mid-scroll. Body text ran 18.9:1 — nearly the maximum a screen
can produce, and past the point where more contrast helps. Control borders measured
**1.75:1**, which fails WCAG 2.2 SC 1.4.11 (3:1 for UI component boundaries) — every
input, checkbox, switch and secondary button in the light theme had an edge that was
not there.

**Fix — a new `--paper-*` ramp, five rungs, never inverting:**

```
paper-300  88.9   a band below the page      --bg-sunken
paper-200  92.6   the page                   --bg-page
paper-100  95.4   recessed in a card         --surface-2
paper-050  97.6   a card, a panel, an input  --surface-1
paper-025  99.0   modal, popover, toast      --surface-3
```

`--ivory-*` is now reserved for the face of a playing card, so in the light theme the
deck is the brightest, warmest object on the screen — which is the right hierarchy
for this product. Nothing is `#ffffff` any more, and the page gradient travels only
3.2 L\* with its brightest stop (94.0) below `--surface-2` (95.4), so it can never
cross a panel.

Text and borders re-solved against every surface each role actually lands on:
`--text-1` 15.0:1 on a card / 13.2:1 on the page, `--text-2` 8.5:1, `--text-3` 5.5:1
worst-case 5.3:1, `--border-strong` **3.27:1** (was 1.75:1), state surfaces pulled
down to L\* 92 so an alert settles into the page instead of glowing off it.

### Stage 2 — theme-blind literals in `src/App.js` (done)

`src/App.js` still hard-coded ~70 colour values that could not follow the theme.
Fixed by adding the missing token families rather than by patching each site:

- `--gold-fill-1/2/3`, `--gold-line-1/2`, `--gold-glow` — brass used as a *tint*
  was written by hand forty times, in two different golds (`201,145,42` from the
  pre-token build and `241,185,63` from the palette) at fourteen alphas. On paper a
  bright brass tint at 10% is invisible, which is why selected states in light had a
  gold border and no fill. Light swaps the hue to brass-600 and raises the alpha.
- `--glow-display / --glow-accent / --glow-numeral` — three hard-coded text-shadows
  (a black `0 12px 32px` under the hero headline, a 40px gold bloom and a black drop
  on the consensus burst, a 50px bloom on the agreed estimate). They are a
  dark-theme legibility device; on paper they are smudges. All three are `none` in
  light.
- `--inset-hi` — the hairline of light along a raised edge. Real on felt, `none` on
  paper.
- Flat-UI stock colours (`#3498db`, `#e74c3c`, `#2ecc71`, `#e67e22`…) mapped onto
  the existing `--info / --danger / --success / --warning` roles. `.outlier-tag.low`
  was `#3498db` on a tinted surface — below 4.5:1 in light.

**Two real accessibility bugs fixed on the way:**

1. `:focus-visible` in App.js painted `var(--gold2)` — brass-300 in *both* themes.
   On paper that is a **1.4:1 focus ring**, i.e. keyboard focus was invisible for
   every light-theme user. It has equal specificity to the correct rule in
   `base.css` and is injected later, so it won. Now `var(--focus)` (≥4.4:1 either
   theme). `.pcard:focus-visible` had the same bug with a literal gold.
2. `--border-strong` at 3:1, see above.

`.join-box` — the panel the whole product is entered through — carried a 155° three
-stop gradient, a white veil, a cyan inner ring, a 110px shadow off the elevation
scale, a full-panel `backdrop-filter`, and an infinitely shimmering rainbow hairline
(mint → gold → aqua, a permanent repaint for no state). Six treatments doing one
job. Now a flat `--surface-1`, the hairline, `--elev-3`, and one static brass rule
along the top edge.

Tests: 279 passing.

### Stage 3 — a measuring instrument, and what it cleared (done)

Eyeballing screenshots was finding the loud problems and missing the quiet ones,
so the audit became a script that runs in the live DOM (kept in the session
scratchpad, not shipped). Per route and per theme it reports text that fails
WCAG AA **against its real composited background**, targets under the WCAG 24px
floor and under the 44px HIG figure, text clipped by its own box, block siblings
that abut with no gap, and horizontal overflow.

The first version was wrong in a way worth recording: it read only
`background-color`, so anything sitting on a gradient or inside an inverse block
— the felt footer, both heroes, the primary button — resolved to the page colour
and reported a fake ~1.1:1 failure. Twelve "contrast failures" on `/pricing`
were all this. v2 also reads the colour stops inside `background-image` and
judges the **worst** stop, so a gradient is graded at its least legible point.

Re-run across all 15 marketing and SEO routes, in both themes, at 1280 / 375 /
320:

- **contrast failures: none.** Stage 1's ramp holds everywhere it lands.
- **clipped text: none. horizontal overflow: none**, at any width.
- Two real target findings, below.

`.footer-link` measured 27px in a stack with a 2px gap. It clears the WCAG 2.2
AA floor (24px) but not the 44px HIG figure, and the `::after` trick the navbar
uses cannot apply to a vertical stack — a 44px overlay on a 29px pitch steals the
neighbour's taps. So the pitch itself grew: `padding-block` to `--sp-2` (33px)
with the gap deleted so there is no dead strip between two targets, and to
`--sp-3` under `(pointer: coarse)` (41px). `.footer-link--inline` sits mid
-sentence in the legal note and takes SC 2.5.8's inline exception — left alone,
deliberately.

Also systemic, from `base.css`: `text-wrap: balance` on headings and
`text-wrap: pretty` on paragraphs, at zero specificity via `:where()`. "What free
does and does not mean here" was leaving *here* alone on its own line. Purely
additive — a browser without it wraps exactly as before.

### Stage 4 — the sign-in modal (done)

**Bug: the dialog scrolled sideways on a phone.** At 375px its content measured
419px against a 373px box and sat 22px off to the left, so the padding looked
gone on one side and the content was clipped on the other.

Cause, traced back rather than patched: `.pp-segmented__item` is `white-space:
nowrap`, and `flex: 1` will not shrink a flex item below its own min-content.
Three two-word modes — Sign in / Create account / Reset password — need 371px.
`.pp-modal` is a grid, a grid item's `min-width` is `auto`, so that 371px became
the track width and the whole dialog overflowed.

Two fixes, one systemic and one local:

- `.pp-modal > * { min-width: 0 }` — nothing inside a modal can ever widen the
  track again, whatever it is: a long room URL, a wide table, this control.
- `.pp-segmented--block .pp-segmented__item` gets `min-width: 0`, tighter inline
  padding, and `white-space: normal` — a long label takes a second line instead
  of the control taking a scrollbar.

**The preamble outranked the task.** Before the form the modal stacked a 52px
decorative logo, a card ("You never need an account to run a room…"), and a gold
hint ("Already registered? Sign in to restore your Team Rooms and sprint
history") under a subtitle that already said "Welcome back. Your Team Rooms and
sprint history are waiting." Three paraphrases of one sentence, and on a 375×812
phone they pushed the password field and the submit button **330px below the
fold**. The hint is deleted outright, the logo with it, and the card now shows
only where it is not a restatement — the account panel when signed in, and the
"you never needed one" reassurance on the tab where somebody is deciding whether
to create an account. Submit moved from ~1500px to **465px**: above the fold,
with "What an account adds" below it where persuasion belongs.

**A brass bar down the edge of every paper dialog.** `scrollbar-color` was
`var(--gold)`, and `--gold` is the brand gold in *both* themes by design — so
Firefox painted full-saturation brass on light paper while WebKit used the
correctly-themed `--scroll-thumb`. `scrollbar-color` cannot take a gradient, so
both themes gained `--scroll-thumb-flat`. The login modal also restated the
global scrollbar rules at its own width in the brand golds; those four rules are
deleted, it uses the themed global ones now.

### Stage 5 — the room, and a guard that was breaking the product (done)

**`body { overflow-x: hidden }` had disabled every `position: sticky` in the
app.** One hidden axis forces the other to compute to `auto`, which makes `body`
a scroll container; every sticky element then measured itself against a box with
nothing to scroll. It was set twice — in `src/App.js` and again in the boot CSS
in `public/index.html` — and it was guarding nothing: the Stage 3 sweep proves no
route overflows horizontally at 320, 375 or 1280. Both are gone.

That surfaced a second, older thing. The comment on `.action-bar` says it "sticks
to the bottom of the viewport, inside the thumb arc" on phones, via `position:
sticky; bottom: 0`. That has never worked, and could not: bottom stickiness pulls
a box **up** when its flow position would put it below the scrollport edge; it
does not push a box **down** from a flow position already on screen, and this bar
sits near the top of its column. What shipped instead was a full-bleed card with
two square corners and iOS home-indicator padding stranded mid-page — the one
panel in the room breaking the gutter every other panel keeps. A real thumb-arc
dock is `position: fixed` and costs 150px of an 812px screen for the whole
session; that is a product decision, not a CSS repair. On mobile the bar is now
`position: static`, in flow, in the same gutters as everything else, where it is
already the loudest thing above the fold. Desktop keeps its working top-sticky.

**Observers were the only blue in the product.** `.prow.obs` painted the row,
the border, the role label and the avatar in `--info` — the alert vocabulary —
to mean "runs the session". One hue, two meanings, and a cool blue row in a table
that is otherwise felt green and brass. Brass is already spoken for by `.voted`,
so the observer reads as the dealer instead: felt avatar, neutral raised row,
quiet `--text-3` label. Still distinct on three channels, now on-palette.
`--info-fill`, added for that row alone, is deleted with it.

**The boot CSS was flashing the pre-Stage-1 light theme.** `--boot-bg` in
`public/index.html` was still `#f6f3ea` (L\* 95.8) against the app's new
`--bg-page` at L\* 92.6, so the first paint of every cold load was brighter than
the page that replaced it. Also re-pointed: `--boot-fg`/`--boot-fg-2` to the
Stage 1 text ramp, and the boot scrollbar off its hard-coded `#c9922a`.

**Signed-out phones could not reach an account.** `.navbar:not(.authenticated)
.nav-btn-login { display: none }` at ≤520px hid Sign in, and the footer only
grows an Account column once you have one. Measured at 320px, the narrowest phone
still sold: logo 44 + toggle 36 + Sign in 66 + Start a free room 130 + gaps = 288
in a 288px content box, on one row, no overflow. It fits, so the rule is gone.

Tests: 280 passing throughout.

### Stage 6 — two banners, and a net (done)

On a desktop the room rendered the marketing navbar **and** the room header, so
the same wordmark and the same theme toggle appeared twice, 65px apart, and the
page carried two `role="banner"` landmarks. The phone breakpoint had already
reasoned this out and hidden the navbar in a room; the argument does not change
with width, so the rule moved out of the media query and `.hdr` now sticks at
`top: 0` everywhere.

Then the net. `src/designsystem.test.js` gained a block per decision above,
because a design system nobody checks is a document:

- the paper ramp is five rungs, nothing is `#fff`, and `--surface-1` stays above
  `--bg-page` — the elevation inversion of Stage 1 cannot come back
- `.pp-modal > *` may shrink, and `.pp-segmented--block` shrinks rather than
  overflows
- `overflow-x: hidden` never lands on `body`, in either stylesheet (comments
  stripped first, or the test matches the comment explaining the rule)
- `.prow.obs` does not borrow `--info`; no component paints `--cream` on felt
- `--boot-bg` in the light theme equals `--paper-200`, so the first paint of a
  cold load is the colour the app is about to draw

One existing test asserted `env(safe-area-inset-bottom)` in the phone action-bar
rule — it was encoding the dock that never worked. It now asserts the opposite,
with the reason.

**Where it landed:** 289 tests passing across 5 suites (from 269 at baseline).
Production build clean: **220.72 kB** gzipped, +1.92 kB on baseline, no new
runtime dependency; CSS 9.77 kB, +363 B; prerender wrote all 15 route documents.

### Stage 7 — the room's later screens, and what the sweep turned up (done)

The states left open at the end of Stage 6, driven for real rather than reasoned
about: a room with a facilitator and two voters, split vote → reveal → record →
a second round to consensus, then `/admin`. Light and dark, 1280 and 375.

**A card body had no rhythm, so one card collided with itself.** The
facilitator's split-vote card reads *"The votes are mixed. Select the estimate
your team agrees to record"* and then put its three stat tiles **0px** below
that sentence. `.inline-final-summary` declared `margin-bottom` and no
`margin-top`, because `.pp-card__body` is plain block flow and every card
holding more than one child hand-margins its own gaps. Rather than add the
fourth ad-hoc margin, the container got the rhythm: `.pp-card__body > * + *
{ margin-top: var(--sp-4) }`. Adjacent siblings' vertical margins collapse in
block flow, so this is a **floor, not a sum** — a child that already declares a
bigger gap keeps it. Verified in the page: the gap below the grid stayed 16px
rather than doubling to 32px.

`.avg-hero` had the identical defect one panel up — *"Use the range below to
guide the discussion"* sat flush on the range tiles — and took the identical
floor at `--sp-3`.

**The results card printed the same number twice.** `avgDisp` was the 5.5rem
hero under the label AVERAGE VOTE, and then again as the one **gold** tile in
the row beneath it, so the accent pulled the eye to the value the reader had
just finished reading instead of to the spread the row exists to show. The
helper text calls that row "the range", and an average is not part of a range.
The row is Min / Median / Max now.

**Three dead components, one of them holding a bug that had already been
fixed.** `Drawer`, `ActionBar` and their CSS were exported and rendered by
nothing. `ActionBar` was the one worth catching: `.pp-action-bar` still carried
`position: sticky; bottom: 0` and `env(safe-area-inset-bottom)` under a comment
promising it "sticks inside the thumb arc on phones" — the same claim removed
from App.js in Stage 5 once it turned out bottom stickiness only ever pulls a
box *up*. The next author to reach for `<ActionBar>` would have inherited the
fix in reverse. App.js's legacy `.toast` went the same way: dead, but painting
two hard-coded cream literals that answer neither theme, with `white-space:
nowrap` waiting to run off a phone. The rendered toast is `.pp-toast`, measured
at **15.5:1** and **8.75:1** on paper, no overflow at 375.

**Two felt surfaces reached past their own roles.** `.pp-card--felt` and
`.pp-footer__base` hard-coded `rgba(255,255,255,0.12)` instead of `--divider`.
Identical in light, more consistent in dark — but the reason they were literals
is the interesting part: `.pp-footer` was **missing from the inverse block's
selector list**, so a role there would have resolved to the light theme's dark
ink on felt. That is precisely the failure the block's own comment warns about
("A role left out does not fall back to something sensible"). `.pp-footer` is in
the list now.

**Two readings that looked like defects and were not.** A `1.07:1` secondary
button on `/admin` in dark was a CSS transition frozen mid-flight: the Browser
pane is hidden, so frames stop, `background-color` stayed at its pre-toggle
light value while `--btn-bg` already read the dark one. On a fresh paint it
measures **14.08:1**. And `THEAD 233>1` in the sprint table is the
`pp-table--stack` pattern correctly hiding a header from sight but not from a
screen reader.

**Everything else swept clean.** Room first-run, mid-vote, revealed-split,
revealed-consensus, recorded-with-analytics and `/admin`, in both themes at 1280
and 375: zero contrast failures, zero horizontal overflow, zero clipped text,
zero zero-gap siblings.

Eight tests added — 297 passing across 5 suites. Build clean: **220.81 kB**
gzipped JS (+40 B), CSS **9.59 kB** (−180 B, the deletions outweigh the floors).

### Stage 8 — the footer, and the alignment rule it broke (done)

Reported from a screenshot: the plan bar's rule sat hard against the footer
columns, and the legal note under the copyright was ragged with its last line
orphaned out to the right.

**The divider had air on one side only.** `.footer-plan-bar` carries
`padding-block: var(--sp-4)` and a `border-bottom`; `.footer-inner` carried
`padding-bottom` and nothing on top, so the brand mark and the LEGAL / PRODUCT
headings began **0px** below the line. `padding-bottom` → `padding-block`, and
the rule now has 16px above it and 32px below — measured 0 → 32.

**The legal note was right-aligned inside a box that moves.** `.footer-bottom`
is `flex-wrap` with `justify-content: space-between`. Above ~940px the copyright
and the note share a row and right-alignment looks deliberate. Below it the note
wraps to its own line, `space-between` puts its box hard **left** — and the
`text-align: right` kept running inside it. At 886px that rendered three lines
ragged down the left with *"affiliated with pointpoker."* pushed out to the
right, sitting under a left-aligned copyright. A `@media (max-width: 520px)`
rule already undid the alignment, so the failure had been half-diagnosed: the
wrap starts at ~940px, not 520.

Both are left-aligned now, which is correct in both configurations and needs no
breakpoint to undo. Measured at 886px, the four rendered line boxes start at
**27, 27, 27, 27**; at 1280px the two share a row, copy at 32 and note ending
flush with the container's right edge.

**Then the same question asked of the whole product.** Two scans: a static one
over every `text-align` declaration in all three stylesheets, and a live one
that flags any element whose text is pushed to an edge its stacked neighbour is
not, plus any divider whose next block starts within 12px of it. Run over the
room, `/`, `/pricing`, `/features`, `/trust`, `/terms` and `/admin`.

The footer note was the only real instance. Of the other 21 non-left
declarations, 19 are coherent centred blocks (`.pp-section-head` centres its
title *and* its sub, and centres itself with auto margins), one is
`.pp-table .pp-num` — right-aligning comparable figures is correct — and one,
`.a-kpis .pp-stat__meta`, was dead: no tile in that rail passes a meta, and the
tile is a baseline flex row rather than the stacked grid the rule was written
against. Deleted. Two divider hits are correct by design: the navbar's rule is
flush to `.app`, whose first text is 116px down, and adjacent accordion rows
share their divider.

The rule is now enforced rather than remembered — a test walks every CSS rule
and fails on any `text-align: right` outside a numeric column.

300 tests passing. Build clean: 221.31 kB gzipped JS, CSS unchanged at 9.59 kB.

### Stage 9 — two controls the user named (done)

Requested directly, both from screenshots.

**1. The theme control is a switch now, and it says which theme is on.**

It was an `IconButton` — a sun or a moon — whose accessible name stated the
outcome: "Switch to the light theme". The comment above it argued that a control
labelled with its own state is the most reliably misread thing on the web. That
argument is correct, and it is correct *about buttons*: a button has one
appearance and only its name to go on, so naming the state leaves the reader
guessing which half of the sentence they are looking at.

A switch does not have that problem, because a switch has a visible position.
`role="switch"` exists so the name can be the thing and `aria-checked` can be the
state. So the change was not "add a label to the button" — it was change the
role, which is what makes the state label legitimate.

- Renders the design system's existing `Switch`, which had never been used by
  anything. Twelve unrendered exports, now eleven.
- `checked` = light. Dark is the default, and a switch's on-position should be
  the thing you turned on.
- Visible word is the current theme, "Dark" / "Light". Accessible name is
  `Theme: Dark` / `Theme: Light` — it contains the visible word, which WCAG 2.5.3
  requires, because someone driving the page by voice says "click Dark" and has
  to hit it.
- The label is `min-width: 3.1em`. "Dark" and "Light" are different widths, and
  this is the only label in the product whose text changes while you look at it;
  without the pin, every toggle stepped the whole right-hand side of the navbar
  sideways. Measured: 99px in both states, `navbar-right` left edge unmoved.

**The mobile navbar broke, and the fix is not `display: none`.** Labelled, the
switch is 99px where the icon was 32. `.navbar-right` is `flex: 0 0 auto`, so at
375px it took 306 of the bar, squeezed `.navbar-left` to 29px, and the 44px brand
mark overflowed its own box and sat under the switch track — seven pixels of
overlap, caught in the browser, not in a test.

The tempting fix would have stranded people: `tokens.css` deliberately ignores
`prefers-color-scheme`, and there is no theme control in the footer, so these two
switches are the only doors to the light theme. Hidden, a phone is in dark for
good with nothing to click.

So the word goes at ≤780px and the switch stays — the same call already made two
rules up for the wordmark, at the same width, for the same reason. Nothing is
actually lost: a switch shows its state by position, and the accessible name is
on the input where CSS cannot reach it. Overlap 0, no horizontal scroll,
`Theme: Dark` intact.

**2. Countdown length and Start share a row.**

They are one decision — you pick 45 and press the thing next to it — and a
sentence of hint text used to sit between them.

- The hint moved out of `<Select hint=…>` to under the whole row. Two reasons:
  it describes the timer rather than the length, and a hint *inside* the field
  makes the field taller than the button, so nothing in the row can align to
  anything. Its `aria-describedby` is wired by hand now to keep the
  screen-reader announcement identical.
- `align-items: end`, not `center`: the select carries a label above it and the
  button does not, so the bottom edge is the only one the two share. Both are
  `min-height: var(--control-md)`, so aligning there lines up the whole of each.
  Measured: both 44px, bottoms at 433, 12px apart, hint 8px below.
- Wrap, not a breakpoint. This panel lives in a rail whose width does not track
  the viewport, so a media query would be measuring the wrong box. At 375px the
  two flex bases stop fitting and each takes a full row: 301px and 301px, 12px
  apart, no horizontal overflow.
- The hint sits 8px below the row rather than the panel's 16px, because it
  belongs to the row and a hint spaced like a sibling block reads as being about
  the whole panel.

Nine tests: five on the theme switch (switch contract, label-in-name, keyboard,
persistence, two-toggles-agree) replacing three that asserted the old button
contract, and four guarding the two layouts — including one that fails if
anything ever hides the theme switch instead of its word.

**343 tests, 6 suites.** Build 223.21 kB JS / 9.65 kB CSS, 15 prerendered routes.

### Stage 10 — the ranks were wrong, and the dark theme never got the fix the light one did (done)

Seven things reported from screenshots. Six of them turned out to be three
causes, so this is grouped by cause rather than by report.

**1. Nothing looked like a control in the dark theme.** "Start timer should
stand out", "End session should also stand out", "Add button in the story
queue" — three reports, one measurement. A secondary button's fill is 1.20:1
against the panel it sits on, so the only thing saying "this is pressable" was
its edge, and `--border-strong` measured **2.01:1** there. WCAG 2.2 SC 1.4.11
asks 3:1 of a component boundary.

The light theme had already been fixed for exactly this — its token carries a
comment reading "The old 0.26 measured 1.75:1, so every form control in the
light theme had an edge that was not there" — and the dark theme, the one that
is on by default, was left at 0.26. It is 0.40 now: **3.08:1**. That lifts every
input, select, secondary button and switch track in the default theme at once.

**2. Rank, which is a separate problem from fill.** None of those three buttons
can be the filled primary: the action bar always holds it while the room is live
(Copy the invite link → Reveal everyone's cards), and a second gold slab beside
it weakens both. But "secondary" is the rung for *a way out of this*, and Start
and Add are the point of the panels they sit in.

So the system gained the rung it was missing between the two — `.pp-btn--accent`,
keyed to the accent and outlined rather than filled. One accent, two weights.
`End session` stays `danger` but is filled now (`--danger-surface`, `--elev-1`)
for the same reason `--secondary` was fixed earlier: a control is one rung above
its container or it is not a control. Transparent-on-panel made the one
irreversible action in the room quieter than the Re-vote button beside it.

**3. The theme switch was two contrast failures stacked.** The track was painted
`--surface-2` — the *raised* fill of a control — where a groove wants the one
surface below the page; and the thumb was `--surface-1`, a surface defined
against a page that is nearly black, so the knob measured **1.15:1** against its
own track. The whole switch read as one flat pill with nothing in it.

Track is `--bg-sunken`, thumb is `--text-1`. Ink, not a surface: `--text-1` is
the one role guaranteed to contrast with whatever the theme puts behind it, and
it reads on the sunken track and on the gold one. Measured **18.73:1**. It also
went back to full size — it had been running a step small to save the navbar
8px, which cost it the two things that made it findable.

The label says **"Dark theme" / "Light theme"** now, and the `aria-label` is
gone: the visible text *is* the accessible name, which is the one arrangement
WCAG 2.5.3 cannot drift out of, because there is only one string to keep in
sync. Under 780px " theme" is clipped (not `display: none` — a clipped label is
still the accessible name, so what a phone stops showing it does not stop
saying), and in the join navbar, which cannot spare even one word, the whole
label is clipped. **This regressed first:** the full-size labelled switch is
166px, and it pushed the room header 55px past a 375px viewport. Caught by
measuring, fixed by the two-step clip. 0 overflow now.

**4. The role picker answers the question the tab already answered.** Create →
Facilitator, Join → Participant, Team → Facilitator; a shared `?room=` link
lands on Join, so it lands on Participant. Derived from the tab rather than
synced to it — an effect mirroring one into the other would need a flag for
"the user overrode this", and that flag is the `||`. A deliberate pick outranks
the tab from then on, in both directions.

The picker previously had *no* default, because defaulting everyone to voter
left a solo creator at a revealed round with no way to record. Defaulting by tab
removes that dead end without the mandatory click — the branch that produced it
is the one branch that now starts on facilitator. That made `requireRole()`
unreachable, and with it the whole resume dance it needed (hold the room the
user asked for, refuse it, focus the picker, re-open on the next click):
`pendingRoomKey`, `roleGroupRef`, the role error slot. All deleted. Deck was
already defaulting to Fibonacci; confirmed, not changed.

**5. The two role cards were the same height and a different shape.** They
stretch to the taller, so `Votes on each story` left **34.3px** of dead space
under it against the other's 14. And the card's single 4px gap put the icon the
same distance from the label as the label was from its own description, so all
three read as one run of text. A description now reserves the second line the
row was always going to need (`min-height: calc(2em * var(--lh-snug))`, dropped
on the compact variant, which has none), and the icon takes one extra step.
Both cards: 14px top, 14px bottom.

**6. The sized list can be corrected.** A ✕ per row in Sprint Analytics, behind
a dialog — the only action in the room that removes work the team already did,
and the only one with nothing to undo it. The dialog names the row and its
number, `Cancel` holds focus on open, and `Confirm delete` is the one solid-red
button in the product (`--danger-solid` / `--danger-solid-fg`: dark ink on
bright red in the dark theme, white on deep red in the light one, both ≥4.5:1).
Solid is right in a modal, which is its own screen, and nowhere else.

The logic is in `estimation.js` beside `sprintResetUpdates`, for the bug it
would otherwise have shipped with. Both storage paths — `stories/{i}` for a
named queue, `rounds/{n}` without one — are index-keyed, and both hand the next
key out of a counter. Punch a hole in `rounds` and leave `{0, 2}` with
`storiesDone` at 2, and the next recorded estimate writes `rounds/2` straight
over a real one, silently. Both lists are rewritten contiguously instead.
`consensusCount` is exact on the rounds path (a round stores `isConsensus`) and
clamped on the queue path (a story does not) — clamping is the honest failure:
alignment can never read above 100%.

Two smaller things fell out of it. The four columns did not fit the 258px rail —
the delete column rendered *past* the wrapper's scroll edge, focusable and off
screen — so the table's 16px gutters drop to 8px in this rail, and the action
column's heading is hidden rather than blank (`hideLabel` on `ResultsTable`),
because the stacked layout under 760px prints every heading in front of its cell.
And `width: 1%` is a column instruction that collapsed the delete cell to 8px in
that stacked layout, so it is undone there.

**27 new tests** (370 total, up from 343): nine on `deleteSizedItemUpdates`
including the reindex collision, five on button rank and the dark theme's
control edge, three on the role cards, five on the delete UI, five rewritten
role-selection tests, and one that fails if the clipped theme label is ever
"tidied up" to `display: none`.

**370 tests, 6 suites.** Build 224.21 kB JS (+993 B) / 9.8 kB CSS (+152 B),
15 prerendered routes.

### Still open

- **The product carries two design systems for the same UI.** 11 of the 48
  exports in `src/design-system/index.js` are never rendered, and they are the
  compositions rather than the primitives: `Footer`, `Header`, `VoteHand`,
  `RevealCard`, `ParticipantList`, `AvatarStack`, `Logo`, `Checkbox`,
  `Divider`, `Skeleton`, `TabPanel`. (`Switch` left this list in Stage 9 — the
  theme toggle renders it.) App.js uses the `pp-` primitives (Card,
  Chip, Button, Grid, StatTile, Toast, Modal) but its own compositions
  (`.pcard`, `.prow`, `.hdr`, `.site-footer`). Every defect in this stage lived
  on that seam. This looks like a migration that stopped halfway, so the right
  move is to finish or abandon it deliberately — not to delete the target. It
  is the largest remaining source of "styling is an issue".
- The playing-card faces (`.pcard`, `.pp-vote-card`) hold ~16 colour literals.
  These are deliberate — `tokens.css` says the deck is the one object allowed to
  be near-white in both themes — but `--surface-card-face` and `--ivory-*` exist
  and the components bypass them. Worth tokenising the red suit ink (`#b01020`,
  three occurrences) if nothing else.
- The authenticated `/admin` dashboard and the sprint-history modal were not
  reachable: both need a signed-in owner account, which this session could not
  create. Their signed-out and empty states are clean.
- The `rcol`-before-`lcol` order on phones puts an empty Sprint Analytics panel
  between the roster and the invite CTA on a brand-new room. It is above the
  fold at 812px so it is not a defect, but the panel earns its place only once
  it has data.

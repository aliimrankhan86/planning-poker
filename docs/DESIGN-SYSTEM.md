# pointpoker design system

The rules any new component follows. Tokens live in the `:root` block of the CSS
template literal at the top of `src/App.js`; this file explains what they are for
and why they were chosen. `src/designsystem.test.js` enforces the parts a test can
check, so this document cannot quietly drift from the code.

## Why this exists

Before it, `src/App.js` contained **18 separate button classes, 65 distinct font
sizes, and 86 distinct padding pairs**. Every new feature invented its own values,
so nothing looked related and every change risked a visual regression somewhere
else. That is the problem this solves. It is not about taste.

## The one rule

**Use a token. Never a raw px or hex value.** If no token fits, the design system
is missing something: add the token, then use it. Adding a one-off value is how
the file got to 65 font sizes.

---

## Colour

The brand palette (`--bg`, `--gold`, `--cream`, `--mint` and friends) is fixed and
does not change. Do not introduce new hues.

Components use **semantic roles**, not palette variables directly:

| Token | Use | Contrast on `--bg` |
|---|---|---|
| `--text-1` | Primary text, headings, values | 15.8:1 |
| `--text-2` | Secondary text, supporting labels | 9.9:1 |
| `--text-3` | Muted text, hints, disabled. **The floor.** | 6.7:1 |
| `--text-on-gold` | Text on a gold surface | 9.4:1 |
| `--action` | The primary action | — |
| `--focus` | Focus ring | — |
| `--danger` / `--success` / `--info` | State | — |

Nothing goes below `--text-3`. WCAG 2.2 AA needs 4.5:1 for body text and every
role above clears it with room to spare. Earlier versions of this app used opacity
`.45`, which measures 4.11:1 and fails.

**Colour never carries meaning alone** (WCAG 1.4.1). A destructive action is red
*and* says what it deletes. A consensus state is green *and* says "consensus".

## Type

Eight steps, 16px base, roughly a 1.25 major third.

| Token | Size | Use |
|---|---|---|
| `--fs-1` | 13px | Uppercase eyebrows, micro labels. **The floor.** |
| `--fs-2` | 15px | Helper text, secondary |
| `--fs-3` | 16px | Body, and **every interactive label** |
| `--fs-4` | 18px | Card titles |
| `--fs-5` | 22px | Section headings |
| `--fs-6` | 28px | Page headings |
| `--fs-7` | 36px | Hero |
| `--fs-8` | 48px | Display numerals (the agreed estimate) |

16px is a floor for anything a user types into. iOS silently zooms the viewport
when a focused input is smaller, which then breaks the layout behind it.

**Nothing is smaller than `--fs-1`, and `--fs-1` is 13px.** This is a tool for
the general public, whose eyes are not all twenty-five. The scale used to bottom
out at 12px and 150 declarations went under it anyway, down to `.52rem` — 8.3px.
The smallest text actually rendered on the home page measured **9.3px**. Every
one of those now resolves to a token, including the inline `style={{fontSize}}`
values in the JSX that a CSS-only sweep would have missed.

`src/designsystem.test.js` fails on any `font-size` written below the floor, so
this cannot quietly come back.

**Light text on a dark ground needs compensating.** Pale glyphs on a dark
surface bloom optically: they spread, and read thinner and tighter than the same
size on white. The correction is on three axes — a little more leading, a little
more tracking, one step more weight. `--fs-1-tracking` and `--fs-2-tracking`
carry the tracking part, applied to the 55 blocks that use the small roles and
do not already set their own letter-spacing. Display sizes have enough mass to
need none of this.

Line height travels with size: `--lh-tight` (1.15) for display, `--lh-snug` (1.35)
for UI, `--lh-body` (1.6) for prose. Weights are `--fw-regular` through
`--fw-bold`; hierarchy comes from size and weight, never colour alone.

**A line box has to hold the text inside it.** The navbar carried
"No sign-up · No card · No limits" at 13px with `line-height: 1`. Outfit's ink
at 13px measures **16.5px**, so the glyphs stood 3.5px taller than the box
allotted to them and the descenders of "sign-up" crossed the navbar's bottom
border. It read as squashed because it was squashed: the text was bigger than
its own line.

`line-height: 1` is legitimate for a *single glyph* in a fixed box — an icon
button's ✕, a card suit mark — where there is one character and no descender to
collide with anything. It is never right for a run of words at a reading size.
`src/designsystem.test.js` fails on any block that pairs `line-height: 1` with a
`--fs-1/2/3` font size, and keeps the single-glyph exemptions in one short list
with the reason next to each.

The tell to watch for: `position: absolute` plus `line-height: 1` plus
`white-space: nowrap` on the same element is almost always the signature of text
forced into a container that will not take it. Fix the container.

Use `font-variant-numeric: tabular-nums` for anything that counts or ticks. "3 of
12" reflowing to "10 of 12" mid-round is a layout shift nobody asked for.

## Spacing

A 4px grid: `--sp-1` (4px) through `--sp-16` (64px). Padding, margin and gap all
come from it. Nothing else.

## Radius, elevation, motion

Radii: `--r-sm` 10px, `--r-md` 14px, `--r-lg` 20px, `--r-full`.

Elevation is four steps, `--elev-0` to `--elev-3`. A shadow not on this scale is a
bug: inconsistent shadows are the fastest way to make a UI look assembled rather
than designed.

Motion: `--dur-fast` 120ms, `--dur-base` 200ms, `--dur-slow` 320ms, with
`--ease-out` for entrances and `--ease-in` for exits. **Exits run at about 65% of
entrances** so dismissals feel immediate while arrivals feel calm.

Animate `transform` and `opacity` only. Animating width, height, top or left
forces layout on every frame. Every animation respects
`prefers-reduced-motion: reduce`.

---

## Buttons

One base class, four intents, three sizes:

```html
<button class="btn btn--primary btn--lg btn--block">Reveal everyone's cards</button>
<button class="btn btn--secondary">Start 30s countdown</button>
<button class="btn btn--ghost btn--sm">Dismiss</button>
<button class="btn btn--danger">End session</button>
```

Intent is set through local custom properties (`--btn-bg`, `--btn-fg`, `--btn-bd`),
so a new variant is three declarations rather than a new class carrying its own
padding, font and radius. That is what produced 18 button classes.

**Exactly one `--primary` per screen.** If a screen seems to need two, the second
is a `--secondary`; if that still feels wrong, the screen is doing too much. This
is the single rule that fixed the room: it previously offered three full-width
calls to action stacked vertically and gave no clue which one mattered.

The rule is per *screen*, not per component, so a shared component may have to
step down on some routes. The navbar's "Start a free room" is the only call to
action in the bar on thirteen routes and is `--primary` there; on the join screen
it only scrolls to the form below it and focuses the first field, so it drops to
`--secondary` and leaves the gold to "Create Room", which is the control that
finishes the job. `NavBar` takes `onJoinScreen` for exactly this.

Ranking in the bar runs `--ghost` (Sign in) → `--secondary` → `--primary`. Three
visible tiers, one gold.

Every `.btn` is at least `--tap-min` (44px) tall. Sizes change padding and type,
never that floor. WCAG 2.2 AA (2.5.8) requires 24px; 44px is the Apple HIG figure
and the one that actually prevents mis-taps on a phone.

**Disabled primaries drop the gradient entirely** and become a flat inert surface.
Fading a gold gradient over dark green produces a muddy olive that still reads as
clickable, which is exactly how the old Reveal control looked active while doing
nothing.

## Choices

The second primitive. A `.btn` performs an action; a `.choice` holds state.

```html
<div class="choice-row">
  <button class="choice" aria-pressed="true">
    <span class="choice-label">Participant</span>
    <span class="choice-desc">Votes on each story</span>
  </button>
</div>
```

Role, deck, estimation mode and the join tabs were four classes for one shape —
an option in an exclusive group with a label, an optional description and a
selected state. Four copies had drifted into four paddings, four font sizes and
**two different selection colours**: the role picker used gold for Participant
and aqua for Facilitator, so "selected" looked like two different things on one
screen. One accent marks selection, and it is gold.

Selection is styled off `[aria-pressed="true"]`, never an `.active` class. The
accessible state and the visual state then cannot disagree, which is the bug
class that produces a control screen readers call unselected while it looks
selected.

Layout comes from `.choice-row` (flex, equal widths) or `.choice-grid`
(set `--choice-cols`). `.choice--compact` is the label-only, single-line form.

## Destructive actions

Rank by consequence, not by prominence. `End session` was a divider captioned
"End session", a full-width danger block saying "End session", and a hint
restating its effect — three labels and **34,848px²** for an irreversible
action, second only to the control that runs the session. It is now
`.btn--danger.btn--sm`, right-aligned above a hairline rule, at 5,646px².

A destructive control is findable, not loud. The confirmation dialog states the
consequence, so the button does not have to.

## Choices that cannot be undone

`deck` and `estimationMode` are **write-once**. `database.rules.json` validates
both with `newData.val() === data.val()`, because every vote is validated
against the room's deck — a mutable deck would break that invariant mid-round.
The client agrees: `setDeck` exists only in `JoinScreen`.

So the room has no settings screen, and cannot have one without relaxing that
rule. Anything irreversible must say so at the point of choice — nothing did,
so the only way to discover it was to want a different deck mid-session and
fail. This is also why the create form does not hide the deck behind a
disclosure: see the note in `docs/AI-CONTEXT.hand.md` on the two variations.

## Icons, and why there are no emoji

One stroke family: 24px grid, 1.75 stroke, round caps, `currentColor`, defined in
`ICON_PATHS` and rendered by `<Icon name="..." />`. Decorative and
`aria-hidden` by default; pass `title` only when the icon is the sole label for a
control, which should be rare.

Emoji were removed from all structural UI for four reasons:

1. They cannot inherit `currentColor`, so a disabled or muted control kept a
   full-saturation glyph and looked enabled.
2. They render from a different font on every OS (Apple Color Emoji, Segoe UI
   Emoji, Noto), so the brand cannot control them.
3. Screen readers read their CLDR name aloud. `🎲 0 stories estimated` was
   announced as "game die, 0 stories estimated".
4. They are always full colour and fight a restrained dark palette.

**Two deliberate exceptions.** Card suit glyphs (♦ ♠ ♥ ♣) stay: they are
typographic characters from the text font, they carry the casino theme, and they
are decorative inside cards that already show a value. And the single 🎉 in the
consensus burst stays, because it marks an emotional payoff rather than labelling
a control. `src/designsystem.test.js` fails if a third exception appears.

## Focus

Every interactive element shows a visible `:focus-visible` ring in `--focus`, at
least 2px, with an offset. Never remove an outline without replacing it. Focus
must not be obscured by sticky headers or bars (WCAG 2.4.11), which is why
scroll targets carry `scroll-margin`.

## Layering

A named scale, so nothing gets a `z-index` of 99999 again: `--z-base` 0,
`--z-sticky` 20, `--z-overlay` 40, `--z-modal` 100, `--z-toast` 1000.

---

## Source order is part of the system

CSS is one long string in `src/App.js`. At equal specificity the **later** rule
wins, so a `@media` block must sit **below** every base rule it overrides.

The hero shipped with its logo hard left and its headline centred, on the same
screen. Nothing was wrong with either rule: the `@media (min-width: 1024px)`
block had been written *above* the base rules, so seven of its declarations
silently did nothing — the title's alignment and desktop size, the subtitle's
alignment and measure, the trust strip's alignment, and a card animation
override. `.join-mark` happened to be declared above the block and did apply,
which is exactly why the mark and the headline ended up on different axes.

This had been hit once before, on `.join-box`, and was patched by scoping it to
`.join-layout .join-box` so it won on specificity instead of order. That fixed
one selector, left four broken, and put a comment explaining the trap directly
above the rules still falling into it. **Specificity is the wrong tool here.**
Move the block; do not out-specify it.

`src/designsystem.test.js` now fails if any `min-width` override is cancelled by
a rule written after it, anywhere in the file.

Two related traps in this file:

- The CSS lives in a **template literal**, so a backtick inside a CSS comment
  ends the string and breaks the build.
- Elements that belong to one visual group — a mark, its headline, its
  subtitle — must move alignment together. If a breakpoint moves one, it moves
  all of them, in the same block.

## Layout and placement

**Reading order is importance order.** In the room, the facilitator's primary
action comes first, then the optional timer, then the story queue. It used to be
the reverse: the optional timer carried the loudest treatment on the page while
the control that moves the session forward sat at the bottom, below the fold on a
phone, in a colour that read as disabled.

**One primary action, one fixed place, changing label.** The room's action bar
shows Reveal, then Record, then the next item, always in the same slot. A
facilitator is running a meeting, talking, and watching a queue at once. Every
extra control is a decision made while doing something else; one button in a
known place is a glance instead of a search. This is what the market leader does
and it is why their room feels simpler than ours despite having fewer features.

**On phones the action bar sticks to the bottom**, inside the thumb arc, with
`padding-bottom: max(--sp-4, env(safe-area-inset-bottom))` so it never sits under
the iOS home indicator.

**Do not render state that has not happened.** Empty analytics show one line
explaining what will appear, not three zeroes. Zeroes read as data.

## Copy

Covered in `docs/AI-CONTEXT.hand.md`, and it is part of the design:

- Never show an upsell to someone who already has the thing.
- State-dependent strings must be true in every state. A facilitator sitting alone
  is not "waiting for votes"; there is nobody who could vote.
- UK English.
- Buttons start with a verb and name the outcome: "Record 8 and continue", not
  "Submit".
- Watch em dashes. The audience is engineers and dense em-dash prose reads as
  machine-written.

---

## Migration status

Done: tokens, button system, icon set, room layout, and the option controls —
`.role-btn`, `.deck-btn`, `.estmode-btn` and `.tab-btn` are now `.choice`, and
`.btn-primary`'s five call sites are now `.btn--primary`.

Type is done too: every `font-size` in the CSS block and every inline
`style={{fontSize}}` in the JSX now resolves to a token, and a test enforces it.

The navbar is done: `.nav-btn-login`, `.nav-btn-register` and `.nav-btn-history`
were a parallel button implementation carrying their own padding, a 12px radius
off the 10/14/20 scale, `.83rem`/`.82rem` type (two more sizes within 0.3px of
`--fs-1`), a fourth gold gradient, and a 33px height against the 44px floor.
They render from `.btn` now; the class names survive only as hooks for the
responsive show/hide rules, which are about bar layout rather than how a button
looks. Every nav control measures 44px at every width.

`.btn-reveal-primary` is deleted. It had no call site left — the room's Reveal
moved into `RoomActionBar` and onto `.btn--primary` — and was carrying a fifth
gold gradient nothing rendered.

Not done:

- `.btn-new-session`, `.btn-next-round` and the marketing page buttons still
  carry their own padding, radius and colour values. Their type is on the scale;
  the rest is not.

Migrate opportunistically: when you touch a component, move it onto the tokens.
Do not do it as one sweeping change, because there is no visual regression test
to catch what it breaks — the type sweep and the navbar were safe only because
both were measured in a live browser at five widths before and after.

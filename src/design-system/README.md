# Point Poker design system

The implementation of the *Point Poker Design System* handoff. Theme: **modern casino** —
a felt-green table, one brass accent, ivory card faces, and a display serif for the words
that matter. Confident, not kitsch.

**Dark is the default.** Light is opt-in and is remembered.

```jsx
import { Button, VoteCard, Alert, ThemeToggle } from "./design-system";
```

Importing anything from this directory pulls in `tokens.css`, `base.css` and
`components.css`. `src/App.js` imports it once at the top; nothing else needs to.

---

## Files

| File | What it is |
|---|---|
| `tokens.css` | Palette, scales, and the semantic roles — once for dark, once for light. The single source of truth for every colour, size, radius, shadow and duration. |
| `base.css` | Element defaults. Deliberately thin (see below). |
| `components.css` | All 40-odd component classes, `pp-` prefixed. |
| `index.js` | The components, plus `ThemeToggle`. Import from here. |
| `icons.js` | `ICON_PATHS` — 20 glyphs, one stroke family. |
| `theme.js` | The theme store. JSX-free so nothing imports back into it. |
| `design-system.test.js` | 128 tests, including the WCAG maths for both themes. |

---

## Theming

### How dark stays the default

`tokens.css` puts the dark roles on `:root` as well as on `[data-theme="dark"]`. That
means dark is what renders before any JavaScript has run: first paint, a crawler, a
printed page, and a browser with scripting off all get it without waiting.

Light is reached one way only — the user presses the toggle. `theme.js` writes
`data-theme="light"` on `<html>` and remembers the answer under `pp-theme`. A synchronous
script in `public/index.html` reads that key in `<head>` on the next visit, before the
body exists, which is what stops a light-theme user seeing a dark flash on every
navigation.

**There is deliberately no `prefers-color-scheme` block.** The OS is not the product. A
user who has never touched the toggle gets dark whatever their system says, and the theme
never moves under someone who did not ask for it. The test suite fails if one is added.

> Changing the storage key means changing it in **two** places: `theme.js` and the boot
> script in `public/index.html`. There is a comment on both.

### Adding a colour

Never write a hex value in a component. Add a semantic role to **both** theme blocks in
`tokens.css` and use that. `design-system.test.js` fails if a role exists in one theme and
not the other — a role missing from light does not fall back to something sensible, it
keeps the dark value, which is how you get cream text on ivory paper and a screen that
reads as blank.

### Gold is two roles, not one

`--action` (and its gradient) is brass in **both** themes: gold with ink text is its own
surface and clears 9.4:1 on any ground, so the one primary action on a screen looks
identical either way.

`--action-quiet` is gold used as **text**, and it moves: `--brass-300` on felt,
`--brass-700` on ivory. The brass that paints a button is 1.5:1 as a label on paper. If
you are colouring type gold, you want `--action-quiet`.

---

## The legacy bridge

`src/App.js` is one 10,000-line component whose CSS is a template literal, and it spends
about 1,200 declarations on names like `--bg`, `--gold2` and `--surface2`. The bottom of
`tokens.css` re-points those old names at the semantic roles, which is what made the whole
existing app theme-aware in one edit instead of a thousand.

The dark column reproduces the values the app shipped before this system existed, so dark
renders as it did before. **New work uses the semantic roles directly** — the aliases are
a migration aid, not an API, and they will be deleted as the last of App.js's own CSS goes.

Three consequences worth knowing:

- **App.js must not declare `:root`.** Its `<style>` tag renders from the `<body>` and so
  wins over this stylesheet in `<head>`; redeclaring a token there pins the app to one
  theme. `designsystem.test.js` fails if a `:root` block reappears.
- **The same source order is why a leftover App.js rule beats a component.** A stale
  `.marketing-cta-strip { background: … }` silently won over `.pp-card--felt`, and the
  result was cream text on a gold gradient at 1.2:1 in light mode. When a class is handed
  to a design-system component, App.js must not also draw that element's surface.
- `color: var(--gold2)` in App.js was rewritten to `var(--gold-ink2)` in 51 places. Same
  reason as `--action-quiet`: the token that paints the primary button cannot also be the
  token that colours a label, because only one of them can move between themes.

## Inverse blocks: felt in a light theme

The footer, the felt hero and any `Card variant="felt"` stay felt-green in both themes —
they are the edge of the table, not paper laid on it. `tokens.css` re-points the whole role
set for those subtrees rather than rewriting the declarations inside them.

**Every role a component might reach for has to be in that block.** A role left out does
not fall back to something readable; it keeps the light value. `--action-quiet` was missing
once and the footer's `$0` chip rendered dark brass on dark felt at 2.6:1.

## Why `base.css` is nearly empty

App.js already ships its own reset, heading rules and link styling, and it wins every
collision by source order. So anything opinionated about bare elements belongs *there*.
Putting `a { }` in `base.css` would silently underline every link in the product that
App.js does not name explicitly. What is left is the set that cannot regress anything: the
page ground, the numeral rule, focus, and reduced motion.

---

## The page shell: bands and containers

Every page in the product is a stack of **bands**. Nothing else.

```jsx
<Section variant="felt">        {/* the band: edge to edge, owns the background   */}
  <Container flow>              {/* the measure: centred, one gap between blocks */}
    <SectionHead title="…" />
    <Prose>…</Prose>
    <Grid min="300px">…</Grid>
  </Container>
</Section>
```

- A **band** (`Section`) runs the full width of the window. It owns the background and
  the vertical rhythm (`--section-y`). It never sets a width.
- A **container** (`Container`) is the only thing in the product allowed to set a page
  width. `--container`, centred, with `--gutter` either side.

That split is what makes a full-bleed band possible — a felt wash or a hairline that
reaches both edges of a 2560px monitor — while the words inside it still land on the same
two vertical lines as the header. Put the width on the band and you lose the bleed; leave
it off both and the copy runs to the edge of the screen.

`.pp-container .pp-container` deliberately drops its cap and its padding, so a container
nested inside another is a no-op rather than a second gutter.

**A page shell must not measure itself.** Six of them used to: `.navbar-inner`, `.hdr-in`,
`.game-body` and three footer rows each wrote `max-width: 1160px; margin: 0 auto`, while
the home page's SEO band wrote nothing at all — so its headline began 20px from the window
and the brand above it began 250px in, on the same screen. They all carry `.pp-container`
now and `designsystem.test.js` fails if a page-width literal comes back.

### Headings are centred; body copy is not

`SectionHead` centres — both the text and the block. A band heading is the one thing on
the screen that says what the next 400px are about, and a symmetric column under it reads
as composed where a left-hung one reads as unfinished.

The exception is a heading that **shares a row with something else**: a panel heading above
its own table, the dashboard title beside its window picker, the home hero beside the join
form. Those take their neighbour's axis — `<SectionHead align="start" />` — because a
heading on a different axis to its own content is the first thing the eye catches.

Body copy stays left-aligned whatever the heading does. Centred prose loses the ragged
right edge the eye uses to find the start of the next line, and every line after the first
starts in a different place.

**Both are capped at `--measure` (68ch) and centred as a block.** The cap is line length,
not layout: 68ch is where a line stops being comfortable to read, and no container width
changes that. What *was* wrong is that the cap used to be left-aligned — inside a 1096px
band it left 382px hanging off the right, so a correct 714px reading measure read as "the
text is narrow". `margin-inline: auto` was the whole fix. If a block genuinely wants the
full band, it is not prose: it is a `Grid`, a table or a card.

### The three gaps

Largest last. Every space between two things is one of these, and a fourth value is a bug
rather than a decision:

| Token | Value | Between |
|---|---|---|
| `--gap` | 24px | tiles in a grid, columns in the room |
| `--block-y` | 40px | blocks inside one band — heading, prose, card grid, subsection |
| `--section-y` | 48→96px, fluid | bands |

`Container flow` (or `Section flow`) applies `--block-y` down its children, so a band's
internal spacing is one declaration rather than a margin on each block. Two children are
special-cased inside a flow because they would otherwise add a second gap on top of the
first: `SectionHead` loses its bottom margin, and a nested `Section` loses its padding —
a Section inside a band is a block, not a band.

### How it adapts

There are no per-breakpoint layout rules to maintain. Four fluid mechanisms cover it:

- `--gutter` clamps 16→32px, so a phone gives its content the screen and a monitor gives
  it air.
- `--section-y` clamps 48→96px — a phone never scrolls past 96px of nothing.
- `Grid min="…"` auto-fits: the column count follows the space, not a media query.
- `--container` caps the measure, so past ~1224px the page stops growing and starts
  centring. That is the whole large-screen behaviour.

The two real breakpoints left are structural, not cosmetic: the join screen goes
side-by-side at 1024px, and modals become bottom sheets under 560px.

---

## The ten rules

1. Use a token. Never a raw px or hex value. If none fits, add the token first.
2. Exactly one `--primary` per screen. If a screen needs two, the second is a secondary.
   A control is one rung ABOVE the surface it sits on, never level with it, and a
   disabled control is recessed below both. See "Elevation is what makes a button
   a button".
3. Selection is `aria-pressed` / `aria-selected`, never an `.active` class.
4. Nothing below 13px. Nothing below 16px in a field. Nothing below `--text-3`.
5. Colour never carries meaning alone — say it in words too.
6. Every control clears 44px.
7. Animate `transform` and `opacity` only, and respect `prefers-reduced-motion`.
8. Numbers are Outfit with `tabular-nums`. The serif is for words.
9. Do not render state that has not happened. Zeroes read as data.
10. Reading order is importance order.

Rules 1, 3, 4, 6, 7 and 8 are enforced by `design-system.test.js`. The rest need a person.

### Why 16px in a field is not negotiable

iOS silently zooms the viewport when a focused input is below 16px, and the layout behind
the field goes with it. It is the single most common cause of "the page jumps when I tap
the name box".

### Elevation is what makes a button a button

`--btn-bg` for `--secondary` was `--surface-1` — the exact value a `.pp-card` and a room
`.panel` paint themselves. Every secondary control in the product was therefore the same
colour as its own container, with a 1px `--border-strong` hairline as the only evidence it
could be pressed. It is `--surface-2` now: lighter on felt, darker on paper, raised in both.

That forced the other end of the ladder. Disabled was `--surface-2`, which would have made
a dead control and a live one share a fill. Disabled is `--tint-raise` — a whisper above
its container, still visibly a control, and distinct from `--secondary` on fill, text
colour and border at once, so no state is told apart by one signal alone.

| State | Fill | Sits |
|---|---|---|
| `--primary` | `--action-gradient` | its own surface, any ground |
| `--secondary` | `--surface-2` | one rung above the container |
| `--ghost` / `--danger` | transparent | flush; the label carries it |
| `:disabled` | `--tint-raise` | recessed, below the container's own step |

Guarded in `designsystem.test.js` → "buttons". If a secondary ever disappears into a
panel again, the container moved up a rung, not the button down one — fix the container.

### Why no emoji in structural UI

They cannot inherit `currentColor`, so a disabled control keeps a full-saturation glyph;
they render from a different font on every OS; screen readers announce their CLDR name
("game die, 0 stories estimated"); and they are always full colour against a restrained
palette. Two exemptions exist and no third may be added: the card suit glyphs (♦ ♠ ♥ ♣),
which are text characters, and the single 🎉 in the consensus burst.

---

## Decision table

| You need | Use | Not |
|---|---|---|
| A full-width band | `Section` | a div with a background and a max-width |
| To centre a page's content | `Container` | `max-width` + `margin: 0 auto` |
| Even spacing down a band | `Container flow` | a margin on each block |
| A heading over a band | `SectionHead` | an `h2` you align by hand |
| A heading over a panel or column | `SectionHead align="start"` | a centred one that fights its content |
| Perform an action | `Button` | a styled `div` |
| Hold a choice | `Choice` or `SegmentedControl` | a Button with an `.active` class |
| Swap a panel of content | `Tabs` | `SegmentedControl` |
| Tell the user something they must act on | `Alert` | `Toast` |
| Confirm something that already happened | `Toast` | `Alert` |
| An irreversible confirmation | `Modal` | a loud button |
| A number that updates | `StatTile` | a heading |
| No data yet | `EmptyState` | a zero |
| A fact about a thing | `Chip` | a Button |
| Switch theme | `ThemeToggle` | a `Switch` labelled "Dark mode" |

### Do

```jsx
<Button variant="primary" size="lg">Record 8 and continue</Button>

<Alert tone="warning" title="The deck is fixed once the room exists">
  Every vote is checked against it, so it cannot change mid-session.
</Alert>

<Grid min="280px">…</Grid>
<StatTile label="Median" value={median} />
```

### Do not

```jsx
// Two primaries on one screen — nothing tells the user which one finishes the job.
<Button variant="primary">Reveal</Button><Button variant="primary">End session</Button>

// Raw values. Both of these are how App.js reached 65 font sizes and 86 paddings.
<div style={{ padding: "13px 17px", borderRadius: 12, fontSize: "0.82rem" }} />

// Selection as a class — the visual state and the announced state can then disagree.
<button className={selected ? "pp-choice active" : "pp-choice"}>Fibonacci</button>

// A message with no surface of its own. This is how the old build lost its error text.
<p style={{ color: "#8a9a92", fontSize: 12 }}>That room has closed.</p>

// A page measuring itself. Six shells did this and drifted to four widths between them.
<div className="my-page" style={{ maxWidth: 1160, margin: "0 auto" }} />

// A second typeface. There is one, --font-ui, and --font-display no longer exists.
<span style={{ fontFamily: "Georgia, serif" }}>{count}</span>
```

---

## Accessibility

Beyond the rules above, the components carry their own behaviour rather than leaving it
to the caller:

- `Modal` and `Drawer` move focus in on open, return it to whatever opened them on close,
  close on Escape, trap Tab, and lock the page behind. Without that a modal is a div that
  looks like a dialog and the screen reader carries on reading the room underneath.
- `Tabs` implements the tablist pattern: arrow keys move between tabs, and only the
  selected tab is in the tab order, so Tab steps *past* the strip rather than through it.
- `Accordion` panels are `hidden`, not unmounted — the FAQ answers carry most of the SEO
  copy, and a crawler does not click.
- `IconButton` requires `label`. An icon is not a label.
- `ThemeToggle`'s accessible name states what pressing it will **do**, never what is
  currently true. A toggle labelled with its own state is the most reliably misread
  control on the web.
- `Timer` does not announce every tick — a countdown in an `aria-live` region makes a room
  unusable on a screen reader. The ring is `aria-hidden` and one `role="timer"` node
  carries the meaning.

---

## Responsive

Check every screen at 360, 768, 1024 and 1440. See **The page shell** above for how the
bands adapt; the rest of it:

- Card decks come off `.pp-grid` / `<Grid min="…">`. Do not write per-breakpoint column counts.
- Tables get `.pp-table--stack` unless the data is genuinely wide.
- Modals become bottom sheets under 560px — thumb reach, not a centred box.
- The action bar sticks inside the thumb arc on phones, clearing the iOS home indicator
  with `padding-bottom: max(--sp-4, env(safe-area-inset-bottom))`.
- Nothing scrolls horizontally except the tab strip and a deliberate table.

---

## What the migration actually touched in App.js

First pass — every raw value swapped for the role it was already standing in for, so dark
renders exactly as it did before and light became possible:

| What | Count |
|---|---|
| Hardcoded near-white inks (`rgba(239,242,247,…)`) → `--text-1/2/3` | 176 |
| `color: var(--gold2)` etc. → the `--gold-ink*` text roles | 62 |
| Page ground, felt washes and panel gradients → `--page-*` / `--surface-*` | 25 |
| Mint-tinted hairlines → `--border` / `--border2` | 41 |
| White "raise" overlays → `--tint-raise` / `--tint-raise-2` | 61 |
| Heavy black shadows → `--shadow-cast` / `--shadow-card` | 7 |

Second pass — the screens themselves were rebuilt out of these components, and App.js's
duplicate implementations were deleted:

| What | Result |
|---|---|
| `.btn` and its four intents → `Button` | whole block gone |
| `.lbl` / `.inp` / `.story-inp` → `TextField`, `Select` | gone |
| `.choice*` → `Choice` / `ChoiceRow` / `ChoiceGrid` | gone |
| `ICON_PATHS` + a second `Icon` → `icons.js` | gone |
| `useDialog` + two hand-rolled overlays → `Modal` | gone |
| `.a-kpi`, `.hi-card`, `.dash-kpi`, `.marketing-stat` → `StatTile` | four grids gone |
| `.summary-row`, `.a-story-row`, `.history-item` → `ResultsTable` | gone |
| two copies of an SVG countdown ring → `Timer` | ~100 lines gone |
| `.auth-status`, `.dash-verdict`, three room banners → `Alert` | gone |
| App.js CSS block | 3,003 → 1,523 lines |
| The whole file | 9,981 → 8,000 lines |

Third pass — the page shell. Six hand-written page widths and four hand-written page
gutters became one `Container`:

| What | Result |
|---|---|
| `max-width: 1160px; margin: 0 auto` × 6 (nav, room header, room body, 3 footer rows) | `.pp-container` |
| `max-width: 1180px` (dashboard), `1080px` (join) | `var(--container)` |
| `padding: 0 24px` / `0 14px` page gutters × 4 | `var(--gutter)`, from the container |
| Home SEO band, which had no container at all | `<Container flow>` |
| Ad-hoc gaps: `20px`, `16px`, `40px`, `18px`, `10px` | `--gap` / `--block-y` |

## Known rough edges

- **The card's own colours are literals, deliberately.** `--card-face-*`, `--card-ink-red`,
  `--card-edge` and `--card-gloss` in `tokens.css` do not move with the theme, because a
  playing card is a physical object and turning the room lights on does not repaint it.
  They are tokens, not loose hex — but they are theme-invariant tokens, which is the one
  documented exception in the system.
- ~~**The playing card is still App.js's own**~~ — reconciled 13 Aug 2026, and in the
  direction this note did not anticipate. The room's card was the better of the two, so it
  was promoted into the system rather than replaced by it: `pp-vote-card` now *is* the
  corner-pip card, same markup and same pixels, and App.js renders `<VoteCard>`. The same
  went for `RevealCard` and `ParticipantList`, both of which were thinner than the room's
  version — `ParticipantList` had no remove control and no revealed vote, so adopting it
  would have deleted working features. Use them; there is no second card any more.
- **The room's two-column split** (`.game-grid`, `.lcol`, `.rcol`, `.panel`) is local. The
  room's outer measure is `.pp-container` like everything else, but the 1fr/300px split
  inside it is an application shell, which the system does not model.

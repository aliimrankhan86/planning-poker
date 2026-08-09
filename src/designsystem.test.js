import { readFileSync } from "node:fs";
import { join } from "node:path";

/* A design system nobody checks is a document, not a system. These tests read
   the actual source so the rules in docs/DESIGN-SYSTEM.md cannot quietly rot.
   They are deliberately coarse: they guard the decisions that were expensive to
   make, not every line of CSS. */

const app = readFileSync(join(__dirname, "App.js"), "utf8");
const css = app.slice(app.indexOf("const CSS = `"), app.indexOf("`;", app.indexOf("const CSS = `")));

describe("design tokens exist", () => {
  const required = [
    // Type scale: eight steps, no more.
    "--fs-1", "--fs-2", "--fs-3", "--fs-4", "--fs-5", "--fs-6", "--fs-7", "--fs-8",
    // 4px spacing grid.
    "--sp-1", "--sp-2", "--sp-4", "--sp-8", "--sp-16",
    // Semantic text roles.
    "--text-1", "--text-2", "--text-3", "--text-on-gold",
    // Elevation, motion, layering, touch.
    "--elev-1", "--elev-3", "--dur-fast", "--ease-out", "--tap-min", "--z-modal",
  ];

  test.each(required)("%s is defined", (token) => {
    expect(css).toContain(`${token}:`);
  });
});

describe("button system", () => {
  test("has one base class with four intents and three sizes", () => {
    for (const cls of [
      ".btn {", ".btn--primary", ".btn--secondary", ".btn--ghost", ".btn--danger",
      ".btn--sm", ".btn--lg", ".btn--block",
    ]) {
      expect(css).toContain(cls);
    }
  });

  test("every button clears the 44px touch target floor", () => {
    // Sizes may change padding and type; they may not shrink the tap area.
    expect(css).toMatch(/\.btn\s*\{[^}]*min-height:\s*var\(--tap-min\)/s);
    expect(css).toMatch(/--tap-min:\s*44px/);
  });

  test("a disabled primary is inert rather than a dimmed gradient", () => {
    // Fading gold over dark green produces a muddy olive that still reads as
    // clickable. This is the bug that made the old Reveal control look active.
    expect(css).toMatch(/\.btn--primary:disabled[^{]*\{[^}]*opacity:\s*1/s);
  });

  test("motion is disabled for users who ask for reduced motion", () => {
    expect(css).toContain("prefers-reduced-motion");
  });
});

describe("icons, not emoji", () => {
  /* The line this draws is "can it inherit currentColor". Colour emoji cannot:
     they render from a separate colour font, so a disabled control keeps a
     full-saturation glyph. Monochrome typographic dingbats can, so the card
     suits (♦ ♠ ♥ ♣), the wild-card star and the tick and cross marks are fine
     and stay. The regex matches pictographs and anything carrying the emoji
     presentation selector U+FE0F, which is exactly the colour-font set. */
  const COLOUR_EMOJI = /[\u{1F000}-\u{1FAFF}]|️/gu;

  // One deliberate exception, documented in docs/DESIGN-SYSTEM.md.
  const ALLOWED = [
    "🎉", // the consensus burst: an emotional payoff, not a control label
  ];

  test("no colour emoji is used to label a control", () => {
    // Strip comments first: the blocks explaining this rule cite examples.
    const code = app
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    const found = [...new Set(code.match(COLOUR_EMOJI) || [])]
      .filter((e) => !ALLOWED.includes(e));

    expect(found).toEqual([]);
  });

  test("the icon set is one family with a single stroke width", () => {
    expect(app).toContain("ICON_PATHS");
    expect(app).toMatch(/strokeWidth="1\.75"/);
    // currentColor is the whole point: icons dim with their button's state.
    expect(app).toMatch(/stroke="currentColor"/);
  });

  test("decorative icons are hidden from screen readers", () => {
    expect(app).toMatch(/aria-hidden=\{title \? undefined : "true"\}/);
  });
});

describe("class names survive ad blockers", () => {
  /* A large share of this audience runs uBlock Origin, and EasyList's generic
     cosmetic filters hide anything whose class looks like advertising. The
     admin dashboard originally prefixed all 38 of its classes "ad-", short for
     admin, and the filter list hid every one of them with

       .ad-wrap:not(#google_ads_iframe_checktag) { display: none !important }

     Extensions inject that at USER origin, which outranks author !important
     and even an inline style, so nothing on the page could win it back. The
     failure is silent: the data loads, the DOM is complete, no error is
     logged, and the screen is simply blank. Never name a class after an ad. */
  const BAIT = /\b(?:ad|ads)-[a-z]|advert|sponsor|-ad\b|banner-ad|popup-|promo-/;

  const sources = {
    "App.js": app,
    "AdminDashboard.js": readFileSync(join(__dirname, "AdminDashboard.js"), "utf8"),
  };

  test.each(Object.keys(sources))("%s uses no ad-blocker bait in a class name", (file) => {
    const src = sources[file];
    const classNames = [
      ...[...src.matchAll(/className="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)),
      ...[...src.matchAll(/^\s*\.([a-z][a-z0-9-]*)/gm)].map((m) => m[1]),
    ];
    expect([...new Set(classNames.filter((c) => BAIT.test(c)))]).toEqual([]);
  });
});

describe("room layout", () => {
  test("the facilitator has exactly one primary action", () => {
    const bar = app.slice(app.indexOf("function RoomActionBar"), app.indexOf("function GameScreen"));
    expect((bar.match(/btn--primary/g) || []).length).toBe(1);
  });

  test("the action bar clears the iOS home indicator on phones", () => {
    expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  test("counts use tabular figures so they do not reflow as they climb", () => {
    expect(css).toMatch(/\.action-bar-count[^{]*\{[^}]*tabular-nums/s);
  });
});

describe("type floor", () => {
  /* This is a tool for the general public, which includes people who do not
     have young eyes. The scale bottomed out at --fs-1 12px, but 104 font-size
     declarations went under it anyway, down to .52rem — 8.3px. The smallest
     text actually rendered on the home page measured 9.3px.

     The floor is now 13px and it is the scale's own bottom step, so "smaller
     than --fs-1" is not expressible without adding a raw value, which this
     test forbids. */
  const FLOOR_REM = 0.8125; // 13px at a 16px root

  test("--fs-1 is the floor and is at least 13px", () => {
    expect(css).toMatch(/--fs-1:\s*0?\.8125rem/);
  });

  test("no font-size is written below the floor", () => {
    const offenders = [...css.matchAll(/font-size:\s*(0?\.\d+rem)/g)]
      .map((m) => m[1])
      .filter((v) => parseFloat(v) < FLOOR_REM);
    expect([...new Set(offenders)]).toEqual([]);
  });

  test("small text on a dark surface gets its legibility compensation", () => {
    /* Light type on a dark ground blooms and reads thinner than the same size
       on white, so the small roles carry a little extra tracking rather than
       being left to fend for themselves at the floor. */
    expect(css).toMatch(/\.fs-1-compensation|--fs-1-tracking/);
  });
});

describe("selectable options are one primitive", () => {
  /* .role-btn, .deck-btn, .estmode-btn and .tab-btn were four classes for one
     shape: an option in an exclusive group, carrying a label, an optional
     description and a selected state. Four copies meant four sets of padding,
     four font sizes and four hover treatments that had already drifted apart.
     They are not .btn — a .btn performs an action, a .choice holds state — so
     the system needs the second primitive, not a fifth copy of the first. */
  test("the .choice primitive exists", () => {
    for (const cls of [".choice {", ".choice-row", ".choice-grid"]) {
      expect(css).toContain(cls);
    }
  });

  test("selection is expressed through aria-pressed, not a class", () => {
    // Styling the selected state off [aria-pressed="true"] makes the accessible
    // name and the visual state impossible to disagree with each other.
    expect(css).toMatch(/\.choice\[aria-pressed="true"\]/);
  });

  test("the four legacy option classes are gone", () => {
    for (const cls of [".role-btn", ".deck-btn", ".estmode-btn", ".tab-btn"]) {
      expect(css).not.toContain(cls);
    }
  });

  test("options clear the 44px touch target floor", () => {
    expect(css).toMatch(/\.choice\s*\{[^}]*min-height:\s*var\(--tap-min\)/s);
  });

  test("the join screen's own call to action uses the button system", () => {
    // .btn-primary was a parallel button implementation carrying its own
    // padding, gradient and shadow — the single loudest control in the product
    // was the one control not on the system.
    expect(css).not.toMatch(/^\.btn-primary\s*\{/m);
  });
});

describe("destructive actions do not shout", () => {
  test("End session is not a full-width danger block", () => {
    /* Measured on the live room screen, `btn btn--danger btn--block` rendered
       at 34,848px² — the second-heaviest element on the page, behind only the
       primary action at 41,459px². An irreversible control that deletes the
       session for everyone should not compete with the control that runs it. */
    expect(app).not.toMatch(/btn--danger btn--block/);
  });

  test("it is labelled once, not three times over", () => {
    // A divider saying "End session", the button saying "End session", and a
    // hint restating its effect: three labels for one control.
    expect(css).not.toContain(".obs-danger-divider");
    expect(css).not.toContain(".end-session-hint");
  });
});

describe("irreversible choices say so", () => {
  test("the join screen states that the deck is fixed for the room", () => {
    /* database.rules.json validates deck and estimationMode with
       "!data.exists() || newData.val() === data.val()" — write-once, because
       every vote is validated against the room's deck. The client agrees:
       setDeck exists only in JoinScreen. Nothing told the user, so the only way
       to discover it was to want a different deck mid-session and fail. */
    expect(app).toMatch(/fixed for this room|cannot be changed after|can't be changed after/i);
  });
});

describe("an empty room asks for the thing it needs", () => {
  const bar = () => app.slice(app.indexOf("function RoomActionBar"), app.indexOf("function GameScreen"));

  test("the primary action invites people when nobody can vote", () => {
    /* A facilitator who has just made a room is alone in it. The primary slot
       held "Reveal everyone's cards", disabled, because there are no votes to
       reveal — the loudest control on the screen did nothing — while the one
       action that matters, sharing the link, was a secondary button inside a
       banner the user could dismiss. The slot now carries the invite. */
    expect(bar()).toMatch(/voterCount === 0/);
    expect(bar()).toMatch(/Copy the invite link|Copy invite link/);
  });

  test("it does not render a count of nothing", () => {
    // "0 of 0 voted" and an empty progress bar are state that has not
    // happened. The design system's own rule: zeroes read as data.
    expect(bar()).toMatch(/voterCount > 0 &&/);
  });
});

/* ── A media query cannot override a rule written below it ────────────
   The hero shipped with its logo hard left and its headline centred, on
   the same screen, at the same moment. The cause was source order, not
   design: the `@media (min-width: 1024px)` block was written ABOVE the
   base rules it meant to override. Same specificity, so the later rule
   wins, and four of the six overrides in that block silently did
   nothing. `.join-mark` was declared above the block and so did apply —
   which is precisely why the logo moved left while the title, the
   subtitle and the trust strip stayed centred.

   This had already been hit once, on `.join-box`, and the repair then
   was to scope it to `.join-layout .join-box` so it won on specificity
   instead of on order. That fixed one selector and left the other four
   broken, with a comment explaining the trap sitting directly above
   them. Specificity was the wrong tool: it patches one symptom and
   leaves the model wrong. Order is the model.
──────────────────────────────────────────────────────────────────────── */
describe("media queries come after the rules they override", () => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

  /* Walks top-level blocks, recording where each selector last sets each
     property, and which properties each min-width block tries to override. */
  const scan = (src) => {
    const base = new Map(); // "selector|prop" -> last index at depth 0
    const overrides = [];   // { selector, prop, at }
    const props = (decls) =>
      [...decls.matchAll(/(^|;)\s*([a-z-]+)\s*:/g)].map((m) => m[2]);
    const blocks = (text, offset) => {
      const found = [];
      let i = 0;
      while (i < text.length) {
        const open = text.indexOf("{", i);
        if (open === -1) break;
        let depth = 1;
        let j = open + 1;
        while (j < text.length && depth > 0) {
          if (text[j] === "{") depth++;
          else if (text[j] === "}") depth--;
          j++;
        }
        found.push({
          prelude: text.slice(i, open).trim(),
          body: text.slice(open + 1, j - 1),
          at: offset + i,
        });
        i = j;
      }
      return found;
    };

    for (const rule of blocks(src, 0)) {
      if (/^@media/.test(rule.prelude)) {
        if (!/min-width/.test(rule.prelude)) continue;
        for (const inner of blocks(rule.body, 0)) {
          if (/^@/.test(inner.prelude)) continue;
          for (const sel of inner.prelude.split(",").map((s) => s.trim())) {
            for (const prop of props(inner.body)) {
              overrides.push({ selector: sel, prop, at: rule.at });
            }
          }
        }
      } else if (rule.prelude && !rule.prelude.startsWith("@")) {
        for (const sel of rule.prelude.split(",").map((s) => s.trim())) {
          for (const prop of props(rule.body)) base.set(`${sel}|${prop}`, rule.at);
        }
      }
    }
    return { base, overrides };
  };

  test("no min-width override is cancelled by a later base rule", () => {
    const { base, overrides } = scan(stripped);
    const dead = overrides
      .filter((o) => {
        const at = base.get(`${o.selector}|${o.prop}`);
        return at !== undefined && at > o.at;
      })
      .map((o) => `${o.selector} { ${o.prop} }`);
    expect([...new Set(dead)]).toEqual([]);
  });
});

/* ── A line box has to hold the text inside it ─────────────────────────
   The navbar carried "No sign-up · No card · No limits" at 13px with
   `line-height: 1`. Outfit's ink at 13px measures 16.5px, so the glyphs
   stood 3.5px taller than the box allotted to them and the descenders of
   "sign-up" crossed the navbar's bottom border. It read as squashed
   because it was: the text was larger than its own line.

   `line-height: 1` is fine for a single glyph — an icon button, a suit
   mark, a card numeral — where there is one character and no descender
   to collide with anything. It is never right for a run of words at a
   reading size. The scale bottoms out at --lh-tight (1.15) for a reason.
──────────────────────────────────────────────────────────────────────── */
describe("small text is given room to breathe", () => {
  /* Exempt: fixed-size boxes holding exactly one glyph, where line-height 1
     is what centres that glyph rather than what crushes a sentence.
       .story-item-remove  24x24, renders "✕"
       .wtp-dismiss        26x26, renders "✕"
       .pcard-suit-sm      a single card suit mark
     A new entry here needs the same test: one character, fixed box. */
  const GLYPH_ONLY = [".story-item-remove", ".wtp-dismiss", ".pcard-suit-sm"];

  test("no run of reading-size text is crushed to line-height 1", () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const crushed = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(
        ([, , decls]) =>
          /font-size:\s*var\(--fs-[123]\)/.test(decls) &&
          /line-height:\s*1\s*[;}]?\s*$/m.test(decls),
      )
      .map(([, sel]) => sel.trim().split("\n").pop().trim())
      .filter((sel) => !GLYPH_ONLY.some((g) => sel.startsWith(g)));
    expect(crushed).toEqual([]);
  });
});

describe("the navbar does not hang text off its own edge", () => {
  /* The caption was absolutely positioned so it would not push the CTA out
     of alignment with Sign in, which meant nothing reserved room for it, so
     it had to be crushed to fit, and it still overflowed. Five hacks —
     absolute positioning, line-height 1, a 3px offset, nowrap, and
     display:none below 520px — held one line of text in a bar that is a
     hard 64px tall with zero horizontal slack. The bar was the wrong
     container. Every claim it made is stated more fully by the page it
     sits on: /pricing leads with "no paid tier, no trial countdown and no
     credit card field anywhere". */
  test("the absolutely positioned nav caption is gone", () => {
    expect(css).not.toContain(".nav-upgrade-sub");
    expect(app).not.toContain("nav-upgrade-sub");
  });
});

describe("one primary action per screen", () => {
  /* Migrating the navbar CTA onto .btn--primary gave the join screen two gold
     gradients of equal weight: "Start a free room" in the bar and
     "Create Room" in the form. The bar's control only scrolls to that form and
     focuses its first field, so ranking the two equally told the user the
     shortcut mattered as much as the thing it is a shortcut to. On every other
     route it is the only call to action in the bar and stays primary. */
  test("the navbar CTA steps down where the form already is", () => {
    const nav = app.slice(app.indexOf("function NavBar"), app.indexOf("function SiteFooter"));
    expect(nav).toMatch(/onJoinScreen \? "secondary" : "primary"/);
  });

  test("the join screen passes its own identity to the bar", () => {
    expect(app).toMatch(/onJoinScreen=\{screen === "join"\}/);
  });
});

describe("revealed round", () => {
  test("vote cards are marked inoperable to assistive tech once revealed", () => {
    /* The click and keydown handlers already return early when revealed, and
       the card drops out of the tab order. Neither fact reaches a screen
       reader: without aria-disabled it announces nine actionable buttons that
       do nothing when activated. */
    expect(app).toMatch(/aria-disabled=\{revealed\}/);
  });
});

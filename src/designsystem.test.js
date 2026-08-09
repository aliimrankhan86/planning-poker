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

describe("revealed round", () => {
  test("vote cards are marked inoperable to assistive tech once revealed", () => {
    /* The click and keydown handlers already return early when revealed, and
       the card drops out of the tab order. Neither fact reaches a screen
       reader: without aria-disabled it announces nine actionable buttons that
       do nothing when activated. */
    expect(app).toMatch(/aria-disabled=\{revealed\}/);
  });
});

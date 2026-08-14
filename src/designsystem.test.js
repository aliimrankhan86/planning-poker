import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* A design system nobody checks is a document, not a system. These tests read
   the actual source so the rules in docs/DESIGN-SYSTEM.md cannot quietly rot.
   They are deliberately coarse: they guard the decisions that were expensive to
   make, not every line of CSS. */

const app = readFileSync(join(__dirname, "App.js"), "utf8");
const css = app.slice(app.indexOf("const CSS = `"), app.indexOf("`;", app.indexOf("const CSS = `")));

/* Several assertions below say "this selector no longer appears". A CSS comment
   explaining WHERE a rule went necessarily quotes the selector it used to
   carry, so those assertions have to read the stylesheet with the prose taken
   out or they fail on their own footnotes. Strip once, here, rather than
   remembering to at every call site. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const cssCode = stripComments(css);

/* The tokens moved out of App.js's :root and into the design system, which now
   defines them once for dark (the default) and once for light. App.js must NOT
   redeclare them — its <style> tag renders from the body and would win over the
   imported stylesheet, pinning the app to a single theme. So the token tests
   read the design system, and a separate test below checks App.js stays out of
   the way. */
const tokens = readFileSync(join(__dirname, "design-system", "tokens.css"), "utf8");
const dsIndex = readFileSync(join(__dirname, "design-system", "index.js"), "utf8");
const dsIcons = readFileSync(join(__dirname, "design-system", "icons.js"), "utf8");
const dsCss = readFileSync(join(__dirname, "design-system", "components.css"), "utf8");

/* The UI copy moved out of App.js when the app was translated: App.js now holds
   t("key") and src/locales/en.mjs holds the English words. Assertions about
   *wording* read this; assertions about *structure* still read app. */
const strings = readFileSync(join(__dirname, "locales", "en.mjs"), "utf8");

/* Read by "the system rules" at the bottom of this file. base.css carries the
   reset and the global reduced-motion block, so it holds media queries the
   breakpoint rule has to see; fonts.css is the file that has to prove every
   family a token names is actually loaded. */
const baseCss = readFileSync(join(__dirname, "design-system", "base.css"), "utf8");
const fontsCss = readFileSync(join(__dirname, "..", "public", "fonts", "fonts.css"), "utf8");

/* A ceiling for the App.js stylesheet, not a target — see the last test.
   1674 CSS declarations across 486 rule blocks on 13 Aug 2026, after the audit
   sweep. It only ever goes down: lower it when a surface moves into the design
   system, and treat any need to raise it as a sign the surface was built in the
   wrong file. Comments are not counted, deliberately — see the test. */
const CSS_DECLARATION_CEILING = 1361;

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
    expect(tokens).toContain(`${token}:`);
  });

  test("App.js does not redeclare a themed token in its own :root", () => {
    expect(css).not.toMatch(/\n:root\s*\{/);
  });
});

/* The button system lives in the design system now. App.js had a second,
   near-identical copy — .btn with the same four intents — and two
   implementations of one control is how they drift. These tests moved with it.  */
describe("button system", () => {
  test("has one base class with five intents and three sizes", () => {
    for (const cls of [
      ".pp-btn {", ".pp-btn--primary", ".pp-btn--secondary", ".pp-btn--accent",
      ".pp-btn--danger", ".pp-btn--on-felt", ".pp-btn--sm", ".pp-btn--lg", ".pp-btn--block",
    ]) {
      expect(dsCss).toContain(cls);
    }
  });

  test("App.js keeps no second button system", () => {
    expect(css).not.toMatch(/\n\.btn\s*[,{]/);
    expect(css).not.toContain(".btn--primary");
  });

  /* Every rung of the ladder is visibly a control. The ghost variant was the
     exception — transparent fill, transparent border, --text-2 label — and it
     was carrying nine real actions: Sign in, Sign out, Stop timer, Leave,
     Resend verification email, Dismiss and every Back link in the product.
     Reported by the owner as buttons that are easy to miss. It is deleted
     rather than restyled: a rung whose whole idea is "looks like nothing" is
     not a rung, and the three that remain covered every call site. */
  test("no button is invisible", () => {
    // Comments stripped: the note explaining WHY the variant went necessarily
    // names it, and this assertion is that the selector is absent. Same trap
    // the print block fell into on 14 Aug.
    expect(stripComments(dsCss)).not.toContain(".pp-btn--ghost");
    const sources = ["App.js", "AdminDashboard.js", "design-system/index.js"]
      .map((f) => readFileSync(join(__dirname, f), "utf8"));
    sources.forEach((src) => expect(src).not.toContain('variant="ghost"'));
  });

  test("the three rungs that remain each paint themselves", () => {
    // Guards the guard: if a variant ever loses its fill it becomes the thing
    // that was just deleted, under a different name.
    /* Read the VALUE out and compare it, rather than asserting a pattern with
       a lookahead: /--btn-bg:\s*(?!transparent)/ passes on
       "--btn-bg: transparent", because \s* backtracks to zero width and the
       lookahead then runs against the space. Found by mutation-testing this
       very rule — it stayed green with the fill removed. */
    for (const v of ["primary", "secondary", "accent"]) {
      const rule = stripComments(dsCss).match(new RegExp(`\\.pp-btn--${v}\\s*\\{[^}]*\\}`, "s"));
      expect(rule).not.toBeNull();
      const fill = (rule[0].match(/--btn-bg:\s*([^;]+);/) || [])[1];
      expect(`${v}: ${fill}`).not.toBe(`${v}: transparent`);
      expect(fill).toBeTruthy();
    }
  });

  test("every button clears the 44px touch target floor", () => {
    // Sizes may change padding and type; they may not shrink the tap area.
    expect(dsCss).toMatch(/\.pp-btn\s*\{[^}]*min-height:\s*var\(--control-md\)/s);
    expect(tokens).toMatch(/--control-md:\s*44px/);
    expect(tokens).toMatch(/--tap-min:\s*44px/);
  });

  test("a small control still offers a 44px hit area", () => {
    /* --control-sm is 36px by design, which is the handoff's density. The
       painted box stays 36px and a pseudo-element grows the hit area to
       --tap-min, so rule 6 holds without redrawing the bar. */
    expect(dsCss).toMatch(/\.pp-btn--sm::after[^{]*\{[^}]*height:\s*var\(--tap-min\)/s);
  });

  /* Fill is the first thing read about a button, so no two states may share
     one. The rule these three guard: a live secondary sits one rung ABOVE its
     container, a dead control sits a whisper above it, and neither is the
     container's own value. */
  const fillOf = (selector) =>
    dsCss.match(new RegExp(`${selector}[^{]*\\{[^}]*?(?:--btn-bg|background):\\s*([^;]+);`, "s"))?.[1].trim();

  test("a disabled primary is inert rather than a dimmed gradient", () => {
    // Fading gold over dark green produces a muddy olive that still reads as
    // clickable. This is the bug that made the old Reveal control look active.
    expect(fillOf("\\.pp-btn:disabled")).toBe("var(--tint-raise)");
  });

  test("a secondary button is raised above the surface it sits on", () => {
    // It was painted --surface-1, the same value a .panel and a .pp-card paint
    // themselves, so the control was the exact colour of its own container and
    // only a hairline said it was pressable.
    expect(fillOf("\\.pp-btn--secondary")).toBe("var(--surface-2)");
  });

  test("a dead control is never painted like a live one", () => {
    expect(fillOf("\\.pp-btn:disabled")).not.toBe(fillOf("\\.pp-btn--secondary"));
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

  /* The icon set moved into the design system, so the family rules are checked
     where they now live. App.js is checked for the opposite: that it did not
     keep a second copy. */
  test("the icon set is one family with a single stroke width", () => {
    expect(dsIcons).toContain("ICON_PATHS");
    expect(dsIndex).toMatch(/strokeWidth="1\.75"/);
    // currentColor is the whole point: icons dim with their button's state.
    expect(dsIndex).toMatch(/stroke=\{filled \? "none" : "currentColor"\}/);
  });

  test("App.js does not keep a second icon family", () => {
    expect(app).not.toContain("const ICON_PATHS");
  });

  test("decorative icons are hidden from screen readers", () => {
    expect(dsIndex).toMatch(/aria-hidden=\{title \? undefined : true\}/);
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
    expect((bar.match(/variant="primary"/g) || []).length).toBe(1);
  });

  test("the action bar does not claim to dock to the phone's thumb arc", () => {
    // It never did: bottom stickiness pulls a box up when its flow position
    // would fall below the scrollport, it does not push a box down from a
    // position already on screen, and this bar sits near the top of its
    // column. What shipped was a full-bleed card with two square corners and
    // home-indicator padding stranded mid-page. See docs/UI-OVERHAUL.md.
    const phone = css.slice(css.indexOf("@media (max-width: 780px)"));
    const rule = phone.match(/\.action-bar\s*\{[^}]*\}/s);
    expect(rule).not.toBeNull();
    expect(rule[0]).not.toContain("bottom: 0");
    expect(rule[0]).not.toContain("env(safe-area-inset-bottom)");
  });

  test("counts use tabular figures so they do not reflow as they climb", () => {
    // The count is a Chip now; the figures rule travelled with it.
    expect(dsCss).toMatch(/\.pp-chip--count[^{]*\{[^}]*tabular-nums/s);
  });

  /* The cards come before the arithmetic. The results panel used to open with
     the AVERAGE VOTE hero and put the faces ~780px down, so a facilitator who
     pressed Reveal in front of a room saw a mean and had to scroll to find out
     who had said what — the one thing the table is about to discuss. The
     product's own guide says it: consensus comes out of the conversation about
     the differences, not out of the average. */
  test("reveal shows who picked what before it shows the average", () => {
    const results = app.slice(app.indexOf('className="panel panel-gold"'));
    const who = results.indexOf('className="who-section"');
    const hero = results.indexOf('className="avg-hero"');
    expect(who).toBeGreaterThan(-1);
    expect(hero).toBeGreaterThan(-1);
    expect(who).toBeLessThan(hero);
  });

  /* Removing somebody mid-round takes their vote off the table with no undo.
     As a ghost button it carried the same weight as the name beside it — easy
     to hit by accident, easy to miss on purpose. Red is the room's one word
     for "this takes something away", and End session already speaks it. */
  test("removing a participant looks like what it is", () => {
    const list = app.slice(app.indexOf("<ParticipantList>"), app.indexOf("</ParticipantList>"));
    const buttons = list.match(/<Button[\s\S]*?>/g) || [];
    expect(buttons.length).toBe(2);
    buttons.forEach((b) => expect(b).toContain('variant="danger"'));
    expect(list).not.toContain('variant="ghost"');
  });

  test("the remove control is translated, not hardcoded English", () => {
    // The aria-label was translated and the visible word was not, so pt and ja
    // rooms had an English button sitting in the participant rail.
    const list = app.slice(app.indexOf("<ParticipantList>"), app.indexOf("</ParticipantList>"));
    expect(list).not.toMatch(/>\s*Remove\s*</);
    expect(list).toMatch(/\{t\("game\.remove"\)\}/);
  });
});

/* ═══════ TWO STICKY THINGS, AND ONLY ONE OF THEM IS THE HEADER ═══════
   Reported from a screenshot: scrolling a room printed the action bar across
   the header — "CARDS ARE UP" over "← Leave", the vote count over the invite
   link. Two independent faults, each of which alone would have been visible,
   and which together looked like one:

     - the bar's offset was var(--sp-3), 12px from the top of the VIEWPORT,
       which is inside a header that measures 61-100px;
     - its z-index was var(--z-sticky), the header's own, so the tie went to
       whichever came later in the DOM. That is the bar.

   Fixing only the offset would have hidden the bar behind the header; fixing
   only the z-index would have left it stuck in the wrong place. Both are
   pinned, and so is the third thing the fix exposed: a card at 76% opacity is
   fine sitting ON the page and wrong with the page sliding UNDER it.
════════════════════════════════════════════════════════════════════════ */
describe("what sticks under the room header", () => {
  const rule = () => (cssCode.match(/\.action-bar\s*\{[^}]*\}/s) || [""])[0];

  test("the sticky bar reads the header's real height, not a spacing token", () => {
    // No literal can stand in for it: the invite block stacks three lines on a
    // desktop and collapses on a phone, and the badges beside the room code
    // arrive as the session goes on.
    expect(rule()).toMatch(/top:\s*calc\([^)]*var\(--hdr-h\)/);
  });

  test("the header wins when the two meet", () => {
    expect(rule()).toContain("z-index: var(--z-raised)");
    expect(rule()).not.toContain("var(--z-sticky)");
    // Guards the guard: the header is the one that keeps --z-sticky.
    expect(cssCode).toMatch(/\.hdr\s*\{[^}]*z-index:\s*var\(--z-sticky\)/s);
  });

  test("nothing reads through it while the page slides under", () => {
    expect(rule()).toContain("backdrop-filter: blur(");
  });

  test("--hdr-h has a fallback, and something measures the real one", () => {
    // The fallback is what the header is before it has anything to say. The
    // measurement is what makes it right for every state after that.
    expect(tokens).toMatch(/--hdr-h:\s*\d+px/);
    expect(app).toContain("function useHeaderHeight");
    expect(app).toMatch(/setProperty\("--hdr-h"/);
  });

  test("the measurement cannot start the loop it would be blamed for", () => {
    /* The marketing bar learned this twice: a ResizeObserver callback that
       writes — even the same value back — invalidates style, resizes the
       observed box and schedules itself again. So the callback only asks for a
       frame, and the write is guarded on the value having changed. */
    const hook = app.slice(app.indexOf("function useHeaderHeight"), app.indexOf("GLOBAL NAVBAR"));
    expect(hook).toMatch(/new ResizeObserver\(\(\)\s*=>\s*\{\s*if\s*\(frame\)\s*return;/);
    expect(hook).toContain("requestAnimationFrame");
    expect(hook).toMatch(/if\s*\(h === last/);
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
    expect(tokens).toMatch(/--fs-1:\s*0?\.8125rem/);
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
  /* The primitive lives in the design system, and it did on 13 Aug 2026 when
     these two tests were still reading App.js. App.js had kept a byte-for-byte
     copy of the .choice rules after Choice moved out — dead CSS that nothing
     rendered, and two green tests saying the primitive existed while pointing
     at the copy rather than the real one. Read components.css. */
  test("the .choice primitive exists", () => {
    for (const cls of [".pp-choice {", ".pp-choice-row", ".pp-choice-grid"]) {
      expect(dsCss).toContain(cls);
    }
  });

  test("selection is expressed through aria-pressed, not a class", () => {
    // Styling the selected state off [aria-pressed="true"] makes the accessible
    // name and the visual state impossible to disagree with each other.
    expect(dsCss).toMatch(/\.pp-choice\[aria-pressed="true"\]/);
  });

  test("the four legacy option classes are gone", () => {
    for (const cls of [".role-btn", ".deck-btn", ".estmode-btn", ".tab-btn"]) {
      expect(css).not.toContain(cls);
    }
  });

  test("options clear the 44px touch target floor", () => {
    expect(dsCss).toMatch(/\.pp-choice\s*\{[^}]*min-height:\s*var\(--tap-min\)/s);
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
    expect(strings).toMatch(/fixed for this room|cannot be changed after|can't be changed after/i);
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
       .story-item-remove    24x24, renders "✕"
       .wtp-dismiss          26x26, renders "✕"
       .pp-vote-card__suit   a single card suit mark
       .pp-chip__dot         7x7, renders nothing at all
       .pp-alert__icon       24x24 grid-centred disc, one glyph
       .pp-error::before     16x16 grid-centred disc, renders "!"
       .pp-avatar            fixed square, one or two uppercase initials — cap
                             height only, so there is no descender to clip, and
                             place-items centres the line box either way
     A new entry here needs the same test: one character, fixed box. */
  const GLYPH_ONLY = [
    ".story-item-remove", ".wtp-dismiss",
    ".pp-vote-card__suit", ".pp-chip__dot", ".pp-alert__icon", ".pp-avatar", ".pp-error",
  ];

  /* Both stylesheets, since the deck moved into the design system and took the
     one legitimate exemption with it. Scanning only App.js would have let the
     rule quietly stop covering the file the card now lives in. */
  test.each([["App.js", css], ["components.css", dsCss]])(
    "no run of reading-size text is crushed to line-height 1 — %s",
    (_label, source) => {
      const bare = stripComments(source);
      const crushed = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(
          ([, , decls]) =>
            /font-size:\s*var\(--fs-[123]\)/.test(decls) &&
            /line-height:\s*1\s*[;}]?\s*$/m.test(decls),
        )
        .map(([, sel]) => sel.trim().split("\n").pop().trim())
        .filter((sel) => !GLYPH_ONLY.some((g) => sel.startsWith(g)));
      expect(crushed).toEqual([]);
    },
  );
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

/* ── THE BAR GROWS A LINE, IT DOES NOT CUT ONE ───────────────────────────
   Reported from a resized window: "PRICING" followed by "SUPPO", sliced down
   the middle at the container edge — and, one screenshot narrower, no
   "Point Poker" beside the mark at all.

   Two mistakes, and only the first is interesting. The strip was an
   overflow-x: auto scroller, so when the bar filled up the browser did the one
   thing a scroller can do: clip. That was a deliberate choice once — nothing
   was unreachable, it was scrollable — but nobody drags a navbar sideways, so
   what the scroller actually bought was a page that looks broken.

   The second is the reason there is a test here rather than a bigger number.
   The wordmark and the strip were dropped at the same 780px, one figure for
   two elements of very different widths, and it was wrong in both directions:
   the wordmark still fits at 620 with 130px to spare, and the four links do
   not fit until about 1050 in English and 1160 in Portuguese, whose labels are
   wider. No single figure can be right for a bar whose contents change width
   with the language, so the bar wraps. The two numbers left are not fit
   thresholds any more; they are the widths below which each element stops
   being worth a line of its own.
──────────────────────────────────────────────────────────────────────── */
/* Chrome logs "Blocked aria-hidden on an element because its descendant
   retained focus" and the offending node is dropped from the a11y tree while
   still being reachable — a real defect, not a lint nit. The wordmark shipped
   as <button aria-hidden="true" tabIndex={-1}> on the theory that tabIndex={-1}
   made it legal; it does not, because tabindex="-1" only removes an element
   from SEQUENTIAL tab order and a pointer click still focuses it. */
describe("nothing hidden from assistive tech can take focus", () => {
  const FOCUSABLE = ["button", "a", "input", "select", "textarea", "summary"];
  /* Opening tags, so <span aria-hidden> containing a <button> is not matched —
     that nesting is caught live, not here. */
  const openingTags = app.match(/<[a-zA-Z][^>]*?aria-hidden=["{]?["']?true["'}]?[^>]*>/g) || [];

  test("no focusable element in App.js carries aria-hidden", () => {
    const offenders = openingTags
      .map((tag) => (tag.match(/^<([a-zA-Z]+)/) || [])[1])
      .filter((name) => FOCUSABLE.includes(name));
    expect(offenders).toEqual([]);
  });

  /* Non-vacuity: the regex must actually be finding the aria-hidden tags that
     legitimately exist (the print report, the decorative spans, the wordmark),
     or the test above passes by matching nothing at all. */
  test("the scan actually sees the aria-hidden markup", () => {
    expect(openingTags.length).toBeGreaterThanOrEqual(5);
  });

  /* tabIndex={-1} is not a licence for aria-hidden and must not come back as
     one. It is legitimate elsewhere (roving tabindex, focus targets), so this
     only forbids the two appearing on the SAME tag. */
  test("tabIndex={-1} is never used to excuse aria-hidden", () => {
    const both = openingTags.filter((tag) => /tabIndex=\{-1\}|tabindex=["']-1["']/.test(tag));
    expect(both).toEqual([]);
  });
});

describe("the marketing bar", () => {
  const rule = (selector) =>
    (cssCode.match(new RegExp(`(^|\\})\\s*${selector.replace(/[.]/g, "\\.")}\\s*\\{[^{}]*\\}`, "m")) || [""])[0];

  const mediaBodies = (query) => {
    const bodies = [];
    let from = 0;
    for (;;) {
      const start = cssCode.indexOf(`@media (${query})`, from);
      if (start === -1) return bodies;
      const open = cssCode.indexOf("{", start);
      let depth = 0;
      for (let i = open; i < cssCode.length; i++) {
        if (cssCode[i] === "{") depth++;
        else if (cssCode[i] === "}" && --depth === 0) {
          bodies.push(cssCode.slice(open + 1, i));
          from = i;
          break;
        }
      }
      if (from < start) return bodies;
    }
  };

  test("the links strip is not a scroller, so it has nothing to clip with", () => {
    expect(rule(".navbar-links")).not.toMatch(/overflow/);
    expect(cssCode).not.toContain(".navbar-links::-webkit-scrollbar");
  });

  test("the bar answers a shortage of width by growing a line", () => {
    const inner = rule(".navbar-inner");
    expect(inner).toMatch(/flex-wrap:\s*wrap/);
    // A fixed height cannot hold a second line, so the one-line case is a floor
    // rather than a measurement. `min-height` passes /[^-]height/ nowhere.
    expect(inner).toMatch(/min-height:/);
    expect(inner).not.toMatch(/[^-]height:\s*\d/);
  });

  test("the brand is one object and does not come apart", () => {
    // Wrapping one level lower reads as the same fix and is not: the left group
    // splitting between its two children put "Point Poker" on a line
    // underneath its own mark.
    expect(rule(".navbar-left")).not.toMatch(/flex-wrap:\s*wrap/);
  });

  test("the actions stay on the right when they are alone on their line", () => {
    // justify-content: space-between does nothing to a single item, and once
    // the bar wraps that is exactly what this group is.
    expect(rule(".navbar-right")).toMatch(/margin-left:\s*auto/);
  });

  /* The bar needs 991px in English, 1045 in Portuguese and 1057 in Japanese.
     No breakpoint can carry three numbers, and both times one was written down
     it was reported as a defect: the links rendered and were sliced in half
     between 781 and 1023, and then the whole bar went to two lines between 1024
     and 1065. What replaced it measures. These pin the properties that keep the
     measurement honest — each was mutation-tested. */
  const DROPPABLE = [".navbar-links", ".navbar-brand", ".nav-start-free-long",
                     ".nav-start-free-short", ".pp-switch__label"];

  test("nothing the bar can drop is dropped at a width", () => {
    /* A media query here is the defect coming back. The one exception is the
       last rung's padding, which is deliberately NOT keyed to the verdict — see
       below. */
    for (const sel of DROPPABLE) {
      const escaped = sel.replace(/[.]/g, "\\.");
      const hidden = new RegExp(`${escaped}[^{}]*\\{[^}]*(display:\\s*none|visibility:\\s*hidden)`, "g");
      for (const body of [...mediaBodies("max-width: 520px"), ...mediaBodies("max-width: 780px"),
                          ...mediaBodies("max-width: 1023.98px")]) {
        expect(body).not.toMatch(hidden);
      }
    }
  });

  /* Whole rules, selector included — a declaration block on its own cannot be
     matched back to the thing it hides. */
  const ghostRules = [cssCode, stripComments(dsCss)]
    .flatMap((source) => source.match(/[^{}]+\{[^{}]*\}/g) || [])
    .filter((r) => DROPPABLE.some((s) => r.split("{")[0].includes(s)))
    .filter((r) => /display:\s*none|visibility:\s*hidden/.test(r));

  test("what the bar hides, it can still measure", () => {
    /* display:none measures zero, zero reads as "there is room now", and the
       bar shows the piece, overflows, and hides it again on the next frame.
       Every hidden piece keeps a box. */
    expect(ghostRules.length).toBeGreaterThanOrEqual(3);
    for (const r of ghostRules) {
      expect(r).toMatch(/visibility:\s*hidden/);
      expect(r).not.toMatch(/display:\s*none/);
      expect(r).toMatch(/position:\s*absolute/);
    }
  });

  test("a hidden piece keeps its width without widening the document", () => {
    /* A ghost keeps its full natural width. Anchored at the inline start it
       hangs off the right of a phone and scrolls the whole page sideways —
       measured at 21px of document overflow in English, 42 in Portuguese. */
    for (const r of ghostRules) {
      expect(r).toMatch(/inset-inline-end:\s*0/);
      expect(r).not.toMatch(/[^-]left:\s*0/);
    }
  });

  test("the last rung buys width at a viewport size, not at its own verdict", () => {
    /* The ladder is only stable while the widths it reads do not depend on the
       rung it last chose. Tie the padding to [data-nav-fit] and the bar
       tightens, re-measures, finds it now fits a rung up, loosens, and no
       longer fits — for ever. */
    const keyed = cssCode.match(/\[data-nav-fit="[^"]*"\][^{}]*\{[^}]*\}/g) || [];
    expect(keyed.length).toBeGreaterThanOrEqual(2);
    for (const block of keyed) {
      expect(block).not.toMatch(/--btn-pad-inline|font-size|letter-spacing|padding|[^-]gap:/);
    }
  });

  test("the observer decides but does not write during delivery", () => {
    /* A ResizeObserver callback that resizes what it observes raises
       "ResizeObserver loop completed with undelivered notifications". That is a
       console warning, a FULL-SCREEN MODAL in react-scripts' dev overlay, and a
       window.onerror in production — it was shipped once and reported from the
       dev overlay. The observer schedules; the frame after it writes. */
    const hook = app.slice(app.indexOf("function useBarFit"), app.indexOf("GLOBAL NAVBAR"));
    expect(hook).toMatch(/new ResizeObserver\(applyOutsideDelivery\)/);
    expect(hook).toMatch(/requestAnimationFrame\(/);
    expect(hook).not.toMatch(/new ResizeObserver\(apply\)/);
  });

  test("a verdict that has not changed is not written back", () => {
    /* Assigning the same value still invalidates style, which resizes the
       observed boxes, which schedules another pass — for ever. Most passes
       change nothing and must touch nothing. */
    const hook = app.slice(app.indexOf("function useBarFit"), app.indexOf("GLOBAL NAVBAR"));
    expect(hook).toMatch(/if\s*\(next !== nav\.dataset\.navFit\)\s*nav\.dataset\.navFit = next/);
    expect(hook.match(/nav\.dataset\.navFit\s*=/g) || []).toHaveLength(1);
  });

  test("the switch names itself, so hiding its word costs nothing", () => {
    /* The word is hidden outright rather than clipped, which is only safe
       because the control no longer borrows its name from the span. */
    expect(dsIndex).toMatch(/aria-label=\{`\$\{word\}\$\{t\("theme\.suffix"\)\}`\}/);
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
    /* The card drops out of the tab order and loses its click handler once the
       cards are up. Neither fact reaches a screen reader: without aria-disabled
       it announces nine actionable buttons that do nothing when activated.
       VoteCard owns the attribute now — see design-system.test.js for the
       rendered proof — so all this file checks is that the room asks for it. */
    expect(app).toMatch(/locked=\{revealed\}/);
  });
});

/* ── The signed-in screen is the same product as the signed-out one ────
   It shipped as a second layout: the marketing shell (hero left, 480px
   form right) with an account dashboard stacked inside the form column.
   At 1440x900 that made the page 2,846px tall, put "Create Room" 1,350px
   below the fold, and left the entire left column empty — 552x900 of
   background, because the hero was centred against a 2,233px sibling.

   Everything in it was already stated somewhere else on the same screen:
   an "Account workspace / Your workspace is ready" card under the headline
   that says it, a "Display name" tile above the field that holds it, a
   "2 fixed room URLs ready" tile on top of the panel that lists them,
   three "Final Room / Final URLs" lines above the two cards that show
   them, and a "Create one-off room" button beside the Create tab.
──────────────────────────────────────────────────────────────────────── */
describe("the signed-in workspace", () => {
  const join = () => app.slice(app.indexOf("function JoinScreen"), app.indexOf("function WtpPoll"));

  test("the dashboard-inside-the-form classes stay deleted", () => {
    for (const cls of [
      ".workspace-shell", ".workspace-card", ".workspace-grid", ".workspace-stat",
      ".workspace-room-editor", ".workspace-action-btn", ".workspace-pill",
      ".team-room-choice-row", ".team-room-choice-btn",
    ]) {
      expect(css).not.toContain(cls);
    }
  });

  test("a Team Room is reachable one way, not four", () => {
    /* The form's team tab could only ever target the same two rooms the
       panel lists — its name field is readOnly for exactly that reason —
       so it carried a room picker, a readOnly name and a code preview for
       a choice already made beside it. The tab returns for a shared link,
       which is the one room the panel cannot list. */
    expect(join()).toMatch(/signedIn && !isSharedTeamRoomEntry \? \[\] :/);
    expect(join()).not.toContain("Choose Team Room");
  });

  test("Open needs nothing the form has not already answered", () => {
    /* Open used to be able to refuse: the role picker had no default, so it
       held the room you asked for, sent you down the page to pick a role, and
       resumed on the next click. The tab supplies a role now, so the refusal
       cannot happen and the machinery for recovering from it is gone. If a
       default is ever removed again, this fails and says what to put back. */
    expect(join()).not.toContain("pendingRoomKey");
    expect(join()).not.toMatch(/const requireRole =/);
    expect(join()).toMatch(/const role = pickedRole \|\| \(activeTab === "join" \? "voter" : "observer"\)/);
  });
});

describe("a label points at a field", () => {
  /* Every .lbl was a bare <label> with no htmlFor and no id on the input,
     so the accessible name of "Your Name", "Room Code" and "Team Name" was
     the placeholder — which disappears the moment you type. The ones that
     head a group of buttons are not labels at all: a <label> for a button
     group names nothing, so those are a <span> plus role="group". */
  test("no label element is left dangling", () => {
    const dangling = [...app.matchAll(/<label className="lbl"(?![^>]*htmlFor)/g)];
    expect(dangling).toHaveLength(0);
  });

  test("a heading for a group of buttons is a group, not a label", () => {
    expect(app).toMatch(/<span className="pp-label" id="join-role-label">/);
    expect(app).toMatch(/role="group" aria-labelledby="join-role-label"/);
  });
});

describe("reduced motion reaches the scrolling too", () => {
  /* scrollIntoView({behavior:"smooth"}) is an explicit argument and beats
     the scroll-behavior:auto that the prefers-reduced-motion block sets in
     CSS, so six call sites animated for people who asked them not to. The
     preference has to be read in JS; scrollBehavior() does it. */
  test("no call site hard-codes smooth scrolling", () => {
    expect(app).not.toContain('behavior: "smooth"');
    expect(app).toMatch(/matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)/);
  });
});

describe("a control that promises something does it", () => {
  test("the navbar CTA's focus token is actually consumed", () => {
    /* NavBar's "Start a free room" bumped startFocusToken, JoinScreen
       destructured it and never read it. On the join screen — the one
       screen where that button is not a link somewhere else — pressing it
       did nothing at all, while the design system documented it as
       scrolling to the form and focusing its first field. */
    const join = app.slice(app.indexOf("function JoinScreen"), app.indexOf("function WtpPoll"));
    expect(join).toMatch(/\}, \[startFocusToken\]\);/);
  });
});

/* The page used to measure itself in six places — .navbar-inner, .hdr-in,
   .game-body, .footer-inner, .footer-bottom and .footer-plan-bar each carried
   their own `max-width: 1160px; margin: 0 auto`, and the home page's SEO band
   carried none at all, so its headline started 20px from the window while the
   brand above it started 250px in. One container, declared once. */
describe("one page measure", () => {
  test("only the design system declares a container width", () => {
    expect(tokens).toContain("--container:");
    expect(dsCss).toContain("max-width: var(--container)");
    // No page-width literal survives in App.js.
    expect(css).not.toMatch(/max-width:\s*11\d\dpx/);
  });

  test("every band centres itself with .pp-container, not by hand", () => {
    for (const shell of [
      "navbar-inner pp-container",
      "hdr-in pp-container",
      "game-body pp-container",
      "footer-inner pp-container",
      "footer-bottom pp-container",
      "footer-plan-bar pp-container",
      "join-layout pp-container",
    ]) {
      expect(app).toContain(shell);
    }
    // …and none of them re-declares the centring the class already does.
    expect(css).not.toMatch(/\.(navbar-inner|hdr-in|game-body|footer-inner|footer-bottom)[^{]*\{[^}]*margin:\s*0 auto/);
  });

  test("the home page's SEO band puts its content in a container", () => {
    const band = app.slice(app.indexOf('<Section className="seo-section"'));
    expect(band.slice(0, 600)).toContain("<Container flow>");
  });

  test("a container inside a container does not pad twice", () => {
    expect(dsCss).toContain(".pp-container .pp-container");
  });
});

/* Three gaps, largest last: --gap between tiles, --block-y between blocks in a
   band, --section-y between bands. A page that invents a fourth is how 20px
   here and 26px there gets in. */
describe("one gap scale", () => {
  test("the three gap tokens are defined", () => {
    for (const t of ["--gap:", "--block-y:", "--section-y:"]) expect(tokens).toContain(t);
  });

  test("the grid and the room column come off the same token", () => {
    expect(dsCss).toMatch(/\.pp-grid\s*\{[^}]*gap:\s*var\(--gap\)/);
    expect(css).toMatch(/\.game-grid\s*\{[^}]*gap:\s*var\(--gap\)/);
    expect(css).toMatch(/\.lcol, \.rcol\s*\{[^}]*gap:\s*var\(--gap\)/);
  });

  test("a flow gives every block in a band the same gap", () => {
    expect(dsCss).toMatch(/\.pp-flow > \* \+ \*\s*\{\s*margin-top:\s*var\(--block-y\)/);
    // The two children that would otherwise add a second gap on top of it.
    expect(dsCss).toContain(".pp-flow > .pp-section-head { margin-bottom: 0; }");
    expect(dsCss).toContain(".pp-flow > .pp-section { padding-block: 0; }");
  });

  /* The same law one level down. Every block inside a room panel used to bring
     its own margin — 14px from three analytics sections, 0 from the timer's
     button, 24px from a Grid — so the Countdown length hint sat 8px under the
     select it describes and 0px above the button below it, and the panel's own
     20px padding made the bottom look twice the top. */
  test("a panel owns the gap between its children", () => {
    expect(css).toMatch(/\.panel > \* \+ \*\s*\{\s*margin-top:\s*var\(--sp-4\)/);
    expect(css).toMatch(/\.panel > \.ptitle \+ \*\s*\{\s*margin-top:\s*var\(--sp-3\)/);
    // The eyebrow must not add a second gap under the one it just declared.
    // Anchored: .workspace-panel is not a .panel and does carry its own.
    expect(css).not.toMatch(/\n\.ptitle\s*\{[^}]*margin-bottom/s);
  });

  test("no panel child re-declares the gap the panel already gives it", () => {
    for (const sel of ["a-align", "a-stories", "analytics-breakdown", "analytics-size-breakdown"]) {
      expect(css).not.toMatch(new RegExp(`\\.${sel}\\s*\\{[^}]*margin-top`, "s"));
    }
  });
});

/* A 68ch cap is line length, not layout — but left-aligned inside a 1096px band
   it left 382px hanging off the right, and a correct reading measure read as
   "the text is narrow". The cap stays; the block centres. */
describe("headings and reading measure", () => {
  test("a band heading is centred, block and text", () => {
    expect(dsCss).toMatch(/\.pp-section-head \{[^}]*margin-inline:\s*auto/);
    expect(dsCss).toMatch(/\.pp-section-head \{[^}]*text-align:\s*center/);
  });

  test("a heading that shares a row with its content can take that axis", () => {
    expect(dsCss).toContain(".pp-section-head--start");
    expect(dsIndex).toContain('align === "start" && "pp-section-head--start"');
    // The three that head a panel or a column rather than a band.
    const admin = readFileSync(join(__dirname, "AdminDashboard.js"), "utf8");
    expect(admin.match(/align="start"/g)).toHaveLength(2);
    expect(app).toContain('align="start"\n              title={t("join.yourTeamRooms")}');
  });

  test("prose keeps the reading cap and centres under it", () => {
    expect(dsCss).toMatch(/\.pp-prose \{[^}]*max-width:\s*var\(--measure\)[^}]*margin-inline:\s*auto/);
    // …and is never centred as text. Every line would start somewhere different.
    expect(dsCss).not.toMatch(/\.pp-prose \{[^}]*text-align:\s*center/);
  });
});

/* Priced in dollars: the audience is international, and a pound sign on a free
   product reads as "this is a UK thing" before it reads as "this is free". */
describe("currency", () => {
  test("no pound sign survives in anything a user sees", () => {
    for (const src of [app, readFileSync(join(__dirname, "AdminDashboard.js"), "utf8"),
                       readFileSync(join(__dirname, "routeMeta.mjs"), "utf8")]) {
      expect(src).not.toContain("£");
    }
    expect(app).not.toContain("POUNDS STERLING");
  });
});

/* A round used to end in three places: the record button at the top of the
   column above the timer, re-vote and new sprint below the story queue, and
   end session below that. Deciding meant scrolling past the estimate to reach
   the button that commits it. They are one row now, under the number. */
describe("a finished round has one set of controls", () => {
  const roundActions = app.slice(app.indexOf('className="round-actions"'),
                                 app.indexOf('className="obs-controls"'));

  test("record, re-vote, new sprint and end session are in the same row", () => {
    for (const label of ["recordButtonLabel", "Re-vote", "New sprint", "End session"]) {
      expect(roundActions).toContain(label);
    }
  });

  test("the row sits under the estimate, not above it", () => {
    // .avg-hero renders the agreed estimate; the actions must come after it in
    // source order, which is the order they are read and painted in.
    expect(app.indexOf('className="avg-hero"')).toBeLessThan(app.indexOf('className="round-actions"'));
  });

  test("the action bar above the estimate carries no button once revealed", () => {
    // It is status only after the reveal — otherwise the number and the button
    // that commits it are a scroll apart, which is what this replaced.
    expect(app).toMatch(/const primary = revealed\s*\?\s*null/);
  });

  test("only one control commits the estimate", () => {
    // The split-vote card had its own "Save selected estimate & …" button, so a
    // facilitator saw two primaries doing the same write.
    expect(app).not.toContain("Save selected estimate");
    expect(app.match(/onClick=\{handleAdvanceToNextItem\}/g) || []).toHaveLength(1);
  });

  test("the confirm dialogs are written once each", () => {
    // Three copies of the new-sprint confirm string drifted apart before.
    expect(strings.match(/Start a new sprint\? This clears/g) || []).toHaveLength(1);
    expect(strings.match(/End the session\? This disconnects/g) || []).toHaveLength(1);
    // …and each is reached from exactly one call site.
    expect(app.match(/t\("game\.confirmReset"\)/g) || []).toHaveLength(1);
    expect(app.match(/t\("game\.confirmEnd"\)/g) || []).toHaveLength(1);
  });
});

/* The sprint snapshot is three numbers in a 300px rail. An auto-fit grid put
   two on the first row and orphaned the third, and three columns is not the
   answer either: a 28px value has no room in an 80px column, and shrinking the
   number to fit repairs a layout problem with typography. */
describe("the sprint snapshot is a stack, not a grid", () => {
  test("the KPIs are not laid out by the auto-fit Grid", () => {
    expect(app).not.toMatch(/<Grid[^>]*className="a-kpis"/);
    expect(css).toMatch(/\.a-kpis\s*\{[^}]*flex-direction:\s*column/s);
  });

  /* The three rules that did this used to live in App.js as
     `.a-kpis .pp-stat*`, reaching into a design-system component from outside
     it. They are a variant of the tile, so they are now .pp-stat--inline and
     the tiles ask for it by prop. The behaviour this test guards is unchanged;
     only its address moved. */
  test("each KPI reads label-left, value-right on one line", () => {
    expect(dsCss).toMatch(/\.pp-stat--inline\s*\{[^}]*justify-content:\s*space-between/s);
    expect(dsCss).toMatch(/\.pp-stat--inline \.pp-stat__value\s*\{[^}]*font-size:\s*var\(--fs-5\)/s);
  });

  test("the KPI tiles ask for that variant rather than being restyled from outside", () => {
    const rail = app.match(/<div className="a-kpis">[\s\S]*?<\/div>/);
    expect(rail).not.toBeNull();
    expect(rail[0].match(/<StatTile/g)).toHaveLength(3);
    expect(rail[0].match(/\binline\b/g)).toHaveLength(3);
    // and App.js no longer owns any part of the tile's appearance
    expect(cssCode).not.toMatch(/\.a-kpis \.pp-stat/);
  });

  test("one sub-heading treatment for every section of the panel", () => {
    // Team Alignment was sentence case while its two peers were tracked
    // uppercase, so one panel announced three peer sections three ways.
    const rule = css.match(/\.a-section-title,\s*\n\.a-align-title,\s*\n\.analytics-breakdown-title\s*\{[^}]*\}/s);
    expect(rule).not.toBeNull();
    expect(rule[0]).toContain("text-transform: uppercase");
  });
});

/* ── the 2026-08 overhaul. Each of these guards a bug that shipped, not a
      preference. The reasoning is in docs/UI-OVERHAUL.md. ───────────────── */

describe("the light theme keeps its value ladder", () => {
  const light = tokens.slice(tokens.indexOf('[data-theme="light"] {'));
  const paper = { "--paper-025": 99.0, "--paper-050": 97.6, "--paper-100": 95.4,
                  "--paper-200": 92.6, "--paper-300": 88.9 };

  test("the paper ramp is five rungs and nothing is pure white", () => {
    for (const rung of Object.keys(paper)) expect(tokens).toContain(`${rung}:`);
    // #fff as a surface is what made the old light theme "very bright".
    const lightSurfaces = light.slice(0, light.indexOf("\n}"));
    expect(lightSurfaces).not.toMatch(/--surface-[123]:\s*#fff\b/i);
    expect(lightSurfaces).not.toMatch(/--surface-[123]:\s*#ffffff\b/i);
  });

  test("a card never sits below the page it is on", () => {
    // --surface-1 (a card) must be lighter than --bg-page, at every scroll
    // position: the page gradient's brightest stop stays under --surface-2.
    expect(light).toMatch(/--bg-page:\s*var\(--paper-200\)/);
    expect(light).toMatch(/--surface-1:\s*var\(--paper-050\)/);
    expect(paper["--paper-050"]).toBeGreaterThan(paper["--paper-200"]);
  });
});

describe("nothing can force a modal to scroll sideways", () => {
  test("a modal's grid items may shrink", () => {
    expect(dsCss).toMatch(/\.pp-modal > \*\s*\{[^}]*min-width:\s*0/s);
  });

  test("a full-width segmented control shrinks instead of overflowing", () => {
    const rule = dsCss.match(/\.pp-segmented--block \.pp-segmented__item\s*\{[^}]*\}/s);
    expect(rule).not.toBeNull();
    expect(rule[0]).toContain("min-width: 0");
    expect(rule[0]).toContain("white-space: normal");
  });
});

describe("overflow-x: hidden never lands on body", () => {
  // One hidden axis makes the other compute to auto, body becomes a scroll
  // container, and every position: sticky in the product stops sticking.
  const boot = readFileSync(join(__dirname, "..", "public", "index.html"), "utf8");
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
  test.each([["App.js CSS", css], ["boot CSS", boot]])("%s", (_label, source) => {
    expect(stripComments(source)).not.toMatch(/body\s*\{[^}]*overflow-x:\s*hidden/s);
  });
});

describe("one accent, one meaning", () => {
  test("the observer row does not borrow the alert blue", () => {
    const rule = dsCss.match(/\.pp-participant--observer\s+\{[^}]*\}/s);
    expect(rule).not.toBeNull();
    expect(rule[0]).not.toContain("--info");
  });

  test("no component paints --cream on a felt background", () => {
    // 1.3:1 in the light theme, where --cream is near the page colour.
    expect(dsCss).not.toMatch(/background:\s*var\(--felt-\d+\);\s*color:\s*var\(--cream\)/);
  });
});

describe("the boot shell paints the same ground the app does", () => {
  const boot = readFileSync(join(__dirname, "..", "public", "index.html"), "utf8");
  test("--boot-bg matches --bg-page in the light theme", () => {
    // Otherwise every cold load flashes a brighter cream before React lands.
    expect(boot).toMatch(/\[data-theme="light"\][^}]*--boot-bg:\s*#eceade/);
    expect(tokens).toMatch(/--paper-200:\s*#eceade/i);
  });
});

describe("a container with children has a rhythm of its own", () => {
  /* Both of these shipped a collision: the facilitator's split-vote card put
     its stat tiles flush against the sentence telling you to read them, and the
     results hero did the same to its range row. In each case the container was
     plain block flow, so every child had to hand-margin its own gap and one
     forgot. The floor collapses with a larger declared margin, so it can only
     ever add the missing gap. */
  test.each([
    ["a card body", dsCss, /\.pp-card__body > \* \+ \*\s*\{[^}]*margin-top:\s*var\(--sp-\d\)/s],
    ["the results hero", css, /\.avg-hero > \* \+ \*\s*\{[^}]*margin-top:\s*var\(--sp-\d\)/s],
  ])("%s spaces its own children", (_label, source, rule) => {
    expect(source).toMatch(rule);
  });
});

describe("the results card states each number once", () => {
  test("the range row is min, median and max — the average is the hero", () => {
    const hero = css.slice(css.indexOf(".avg-hero {"), css.indexOf(".avg-hero-consensus"));
    expect(hero).toBeTruthy();
    const range = app.match(/<Grid min="110px" className="avg-hero-range">[\s\S]*?<\/Grid>/);
    expect(range).not.toBeNull();
    for (const key of ["game.min", "game.median", "game.max"]) {
      expect(range[0]).toContain(`label={t("${key}")}`);
    }
    // avgDisp is already printed, six lines up, at 5.5rem.
    expect(range[0]).not.toContain('t("game.average")');
  });
});

describe("the design system does not keep a second copy of a fixed bug", () => {
  test("no .pp-action-bar survives to re-offer the phone dock", () => {
    // .action-bar's sticky-bottom "thumb arc" was removed from App.js once it
    // turned out bottom stickiness only pulls a box up. The design system held
    // an unrendered twin with the same rule, waiting for the next author.
    expect(dsCss).not.toMatch(/^\.pp-action-bar\s*\{/m);
    expect(dsIndex).not.toMatch(/export function ActionBar/);
  });

  test("the room's toast has one implementation", () => {
    // App.js kept a .toast rule matching nothing, painting two hard-coded cream
    // literals and white-space: nowrap. The rendered toast is .pp-toast.
    expect(css).not.toMatch(/^\.toast\s*\{/m);
    expect(dsCss).toMatch(/\.pp-toast\s*\{/);
  });
});

describe("felt surfaces reach for a role, not a literal", () => {
  /* The inverse block re-points every role inside a felt subtree. A component
     that hard-codes white-alpha instead looks right by luck and stops moving
     when the role is tuned — and a component NOT listed in that block gets the
     light value on felt, which is how you get ink at 1.2:1. */
  test.each([[".pp-card--felt"], [".pp-footer__base"]])("%s uses a border role", (sel) => {
    const rule = dsCss.match(new RegExp(sel.replace(".", "\\.") + "\\s*\\{[^}]*\\}", "s"));
    expect(rule).not.toBeNull();
    expect(rule[0]).not.toMatch(/border(-top)?-color:\s*rgba\(255,255,255/);
    expect(rule[0]).toMatch(/var\(--divider\)/);
  });

  test("every felt subtree selector is in the inverse block", () => {
    const inverse = tokens.slice(tokens.indexOf("INVERSE BLOCKS IN LIGHT"));
    const selectors = inverse.slice(0, inverse.indexOf("{"));
    for (const sel of [".site-footer", ".pp-footer", ".pp-card--felt", ".pp-section--felt"]) {
      expect(selectors).toContain(sel);
    }
  });
});

describe("nothing is left aligned against itself", () => {
  /* The footer's legal note was text-align: right inside a flex item that wraps
     onto its own line below ~940px. Once it wrapped, space-between put the box
     on the LEFT and the right-alignment still ran inside it: three lines ragged
     down the left edge with the last one orphaned out to the right, directly
     under a left-aligned copyright. */
  test("the footer's legal note does not right-align", () => {
    const rule = css.match(/\.footer-legal-note\s*\{[^}]*\}/s);
    expect(rule).not.toBeNull();
    expect(rule[0]).not.toMatch(/text-align:\s*(right|end)/);
  });

  test("right alignment is reserved for columns of numbers", () => {
    // Right-aligning prose is how you get an orphan. Numbers are the one case
    // it is correct: comparable figures line up on their last digit.
    const numeric = /pp-num|tabular|dash-bar-value/;
    for (const [label, source] of [["App.js", css], ["components.css", dsCss]]) {
      const rules = source.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{[^{}]*\}/g) || [];
      const offenders = rules
        .filter((r) => /text-align:\s*(right|end)/.test(r))
        .map((r) => r.split("{")[0].trim())
        .filter((sel) => !numeric.test(sel));
      expect({ [label]: offenders }).toEqual({ [label]: [] });
    }
  });
});

describe("a divider has air on both sides", () => {
  test("the footer columns clear the plan bar's rule", () => {
    // .footer-plan-bar carries a border-bottom and 16px of its own padding
    // above it; .footer-inner had padding-bottom only, so the brand mark and
    // the column headings started hard against the line.
    const rule = css.match(/\.footer-inner\s*\{[^}]*\}/s);
    expect(rule).not.toBeNull();
    expect(rule[0]).toMatch(/padding-block:\s*var\(--sp-\d\)/);
    expect(rule[0]).not.toMatch(/padding-bottom:/);
  });
});

/* ── ONE GROUND COLOUR, FOUR FILES ───────────────────────────────────────
   The colour behind the page is written out four times, in four languages,
   because three of them have to be right before the stylesheet that owns it
   has loaded: the boot block in index.html paints before first paint, the
   manifest paints the PWA splash and the Android task switcher, and theme.js
   repaints the mobile browser chrome on every toggle. None of them can read a
   CSS custom property, so all any of them can do is repeat the value — and
   two of them had drifted. theme.js said the light ground was #f6f3ea, three
   steps up the paper ramp from the #eceade the page actually paints, so
   choosing the light theme on a phone put a pale seam across the top of the
   screen. The manifest still held #0c1a0f, the green from before the palette
   was rebuilt, matching nothing at all.
─────────────────────────────────────────────────────────────────────────── */
describe("the ground is the same colour everywhere it is written down", () => {
  const indexHtml = readFileSync(join(__dirname, "..", "public", "index.html"), "utf8");
  const manifest = JSON.parse(readFileSync(join(__dirname, "..", "public", "manifest.json"), "utf8"));
  const themeJs = readFileSync(join(__dirname, "design-system", "theme.js"), "utf8");

  // The tokens are the source of truth; everything else is a copy of them.
  const value = (name) => tokens.match(new RegExp(`${name}:\\s*(#[0-9a-f]{3,8})`, "i"))?.[1];
  const dark = value("--felt-900");
  const light = value("--paper-200");

  test("the tokens the copies are copying still exist", () => {
    expect(dark).toBeTruthy();
    expect(light).toBeTruthy();
    // --bg-page must still resolve to them, or every assertion below is
    // checking agreement with a colour the page no longer paints.
    expect(tokens).toMatch(/--bg-page:\s*var\(--felt-900\)/);
    expect(tokens).toMatch(/--bg-page:\s*var\(--paper-200\)/);
  });

  test("the pre-paint boot block matches", () => {
    expect(indexHtml).toMatch(new RegExp(`:root\\s*\\{[^}]*--boot-bg:\\s*${dark}`, "i"));
    expect(indexHtml).toMatch(new RegExp(`\\[data-theme="light"\\]\\s*\\{[^}]*--boot-bg:\\s*${light}`, "i"));
  });

  test("the theme-color meta matches, and dark is the unqualified default", () => {
    expect(indexHtml).toMatch(new RegExp(`<meta name="theme-color" content="${dark}"`, "i"));
  });

  test("the theme toggle repaints the browser chrome to the same two colours", () => {
    const pair = themeJs.match(/BROWSER_UI_COLOUR\s*=\s*\{([^}]*)\}/)?.[1] || "";
    expect(pair).toMatch(new RegExp(`dark:\\s*"${dark}"`, "i"));
    expect(pair).toMatch(new RegExp(`light:\\s*"${light}"`, "i"));
  });

  test("the PWA manifest matches", () => {
    expect(manifest.theme_color.toLowerCase()).toBe(dark.toLowerCase());
    expect(manifest.background_color.toLowerCase()).toBe(dark.toLowerCase());
  });
});

/* ── THE BRAND ASSETS EXIST AND ARE THE RIGHT SIZE ───────────────────────
   Every icon is generated from assets/brand-mark-master.png by
   scripts/make-icons.py, which is deliberately not wired into `npm run build`
   (it needs Pillow, which is not a project dependency). That makes drift
   possible: someone edits the manifest, or trims an asset, and nothing fails
   until a browser asks for a file that is not there.
──────────────────────────────────────────────────────────────────────── */
describe("brand assets", () => {
  const publicDir = join(__dirname, "..", "public");
  const manifestJson = JSON.parse(readFileSync(join(publicDir, "manifest.json"), "utf8"));

  test("every icon the manifest promises is actually shipped", () => {
    for (const icon of manifestJson.icons) {
      expect(`${icon.src}:${existsSync(join(publicDir, icon.src))}`).toBe(`${icon.src}:true`);
    }
  });

  test("the manifest declares a maskable icon that is not also the 'any' icon", () => {
    // One file marked "any maskable" gets its corners cropped by Android's
    // mask. The edge-to-edge art needs a separate padded variant.
    const maskable = manifestJson.icons.filter((i) => (i.purpose || "").includes("maskable"));
    expect(maskable.length).toBeGreaterThan(0);
    for (const i of maskable) expect(i.purpose).toBe("maskable");
  });

  test("the files index.html links to exist", () => {
    const html = readFileSync(join(publicDir, "index.html"), "utf8");
    const hrefs = [...html.matchAll(/<link[^>]+href="%PUBLIC_URL%\/([^"?]+)/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(`${h}:${existsSync(join(publicDir, h))}`).toBe(`${h}:true`);
  });

  test("the nav mark stays at least 3x the largest size any screen draws it", () => {
    // PNG header: width and height are big-endian uint32 at byte 16 and 20.
    const png = readFileSync(join(publicDir, "brand-mark.png"));
    const width = png.readUInt32BE(16);
    const app = readFileSync(join(__dirname, "App.js"), "utf8");
    const drawn = [...app.matchAll(/<BrandMark[^>]*?size=\{(\d+)\}/gs)].map((m) => Number(m[1]));
    // The default (no size prop) is the 44px nav mark.
    const largest = Math.max(44, ...drawn);
    expect(drawn.length).toBeGreaterThan(0); // the regex must still match the call sites
    expect(`${width}px source for a ${largest}px mark`)
      .toBe(`${Math.max(width, largest * 3)}px source for a ${largest}px mark`);
  });
});

/* ── THE THEME HAS EXACTLY ONE DOOR ──────────────────────────────────────
   tokens.css deliberately ignores prefers-color-scheme — dark is the product
   default whatever the OS says — and there is no theme control in the footer.
   So the switch in the navbar and the one in the room header are the only two
   ways a light-theme user can reach the light theme, and hiding either one
   locks that person into dark permanently with no error and nothing to click.

   This nearly happened. The switch is 99px labelled where the icon button it
   replaced was 32, .navbar-right is flex: 0 0 auto, and at 375px it took 306 of
   the bar, squeezed .navbar-left to 29px and left the 44px brand mark
   overflowing under the switch track. The tempting fix is display: none.
─────────────────────────────────────────────────────────────────────────── */
describe("the theme switch survives every width", () => {
  const rulesFor = (source, selectorPattern) =>
    (source.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{[^{}]*\}/g) || [])
      .filter((r) => selectorPattern.test(r.split("{")[0].trim()));

  test("nothing anywhere hides the switch itself", () => {
    for (const [label, source] of [["App.js", css], ["components.css", dsCss]]) {
      const hidden = rulesFor(source, /pp-theme-switch\s*(,|\{|$)/)
        .filter((r) => /display:\s*none|visibility:\s*hidden/.test(r));
      expect({ [label]: hidden }).toEqual({ [label]: [] });
    }
  });

  test("the narrow bar drops the word, not the control", () => {
    /* Two steps, because the two rows this switch lives in have different
       amounts of room. The component drops " theme" for itself; the navbar,
       which cannot spare even one word, takes the label whole. */
    expect(dsCss).toMatch(/\.pp-theme-switch__suffix\s*\{[^}]*clip-path/);
    /* The bar's step used to be a `.navbar .pp-theme-switch .pp-switch__label`
       rule in App.js — one file reaching past the component boundary into
       another's internals. It is a state of the switch, so the switch owns it
       and a container asks for it by name.
       The word is hidden outright rather than clipped to 1px, and the two are
       not interchangeable here: the container decides this by measuring, and a
       word clamped to 1px reports that restoring it would cost one pixel. It
       restores it, overflows by the hundred the word really takes, and wraps
       the bar it was protecting — observed at 640px in Portuguese. */
    const ghost = dsCss.match(/\[data-nav-fit[^{]*\.pp-switch__label\s*\{[^}]*\}/);
    expect(ghost).not.toBeNull();
    expect(ghost[0]).toMatch(/visibility:\s*hidden/);
    expect(ghost[0]).not.toMatch(/display:\s*none|width:\s*1px|clip-path/);
    expect(cssCode).not.toMatch(/\.pp-theme-switch \.pp-switch__label/);
  });

  test("only the bar that runs out of room asks to be compacted", () => {
    // The navbar cannot spare the word on a phone. The room header is roomier
    // and keeps it — so exactly one of the two call sites passes the prop.
    expect(app.match(/<ThemeToggle\b[^/>]*\/>/g)).toEqual(
      expect.arrayContaining(["<ThemeToggle compactOnNarrow />", "<ThemeToggle />"]),
    );
    expect(app.match(/<ThemeToggle compactOnNarrow \/>/g)).toHaveLength(1);
  });

  test("the label is width-pinned so toggling cannot shove the navbar", () => {
    // "Dark" and "Light" are different widths. Without this the whole right
    // side of the bar steps sideways every time anyone switches theme.
    const rule = rulesFor(dsCss, /\.pp-theme-switch \.pp-switch__label/);
    expect(rule.join("")).toMatch(/min-width:/);
  });

  test("the visible word and the accessible name are the same string", () => {
    /* They used to be two strings — "Dark" on screen, "Theme: Dark" to a
       screen reader — which satisfies WCAG 2.5.3 only for as long as nobody
       edits one of them. There is one now, and no aria-label to drift from. */
    expect(dsIndex).toMatch(
      /label=\{<>\{word\}<span className="pp-theme-switch__suffix">\{t\("theme.suffix"\)\}<\/span><\/>\}/,
    );
    // …and the word itself is the translated one, not a hardcoded "Dark".
    expect(dsIndex).toMatch(/const word = light \? t\("theme.light"\) : t\("theme.dark"\);/);
    expect(dsIndex.slice(dsIndex.indexOf("export function ThemeToggle"), dsIndex.indexOf("export function ThemeToggle") + 700))
      .not.toContain("aria-label");
  });

  test("the knob is not painted in a surface", () => {
    /* --surface-1 is defined against the page, and in the default theme the
       page is nearly black — so the raised knob was a dark disc in a dark
       groove at 1.15:1, and the switch read as one flat pill. Ink contrasts
       with whatever the theme puts behind it; that is what the role is for. */
    const thumb = rulesFor(dsCss, /\.pp-switch__thumb$/).join("");
    expect(thumb).toMatch(/background:\s*var\(--text-1\)/);
    const track = rulesFor(dsCss, /\.pp-switch__track$/).join("");
    expect(track).toMatch(/background:\s*var\(--bg-sunken\)/);
  });
});

/* ── THE PANEL'S ACTION IS NOT THE SCREEN'S ─────────────────────────────
   Start countdown, Add and End session were all reported as not standing out,
   and all three were the same defect: a secondary button's fill measures 1.2:1
   against the panel it sits on in the dark theme, so the only thing saying
   "control" was a 2.0:1 hairline. That is below the 3:1 WCAG 2.2 SC 1.4.11
   asks of a component boundary, and the light theme had already been fixed for
   exactly this and the dark one left behind.

   The fill is a separate problem from the rank. None of these three can be the
   filled primary — the action bar always holds that while the room is live —
   so they take the rung between primary and secondary instead.
─────────────────────────────────────────────────────────────────────────── */
describe("a control is one rung above the thing it sits on", () => {
  const alpha = (decl) => Number((decl.match(/rgba\([^)]*?,\s*([\d.]+)\s*\)/) || [])[1]);

  test("the dark theme's control edge clears 3:1, like the light one", () => {
    // 0.26 measured 2.01:1 on a panel; 0.40 measures 3.08:1. The comment above
    // the token carries the numbers — this holds the value they describe.
    // Up to the first light-theme block — matching the selector with its
    // brace, so the mention of it in the file's header comment is not it.
    const dark = tokens.slice(0, tokens.indexOf('[data-theme="light"] {'));
    expect(alpha(dark.match(/--border-strong:[^;]+;/)[0])).toBeGreaterThanOrEqual(0.4);
  });

  test("there is a rung between primary and secondary, and it is the one accent", () => {
    expect(dsCss).toMatch(/\.pp-btn--accent\s*\{/);
    const rule = dsCss.slice(dsCss.indexOf(".pp-btn--accent"), dsCss.indexOf("}", dsCss.indexOf(".pp-btn--accent")));
    expect(rule).toMatch(/--btn-fg:\s*var\(--action-quiet\)/);
    expect(rule).not.toMatch(/--action-gradient/);   // that belongs to primary alone
    /* And its edge is the same one every other control draws. --border-gold
       measures 2.74:1 on a dark panel and 1.77:1 on a light one — gold cannot
       be a 3:1 boundary on paper, which is the whole reason --action-quiet
       exists. The accent is in the fill and the label. */
    expect(rule).toMatch(/--btn-bd:\s*var\(--border-strong\)/);
  });

  test("Start countdown and Add take it, and neither takes primary", () => {
    /* The timer block renders behind !revealed and Add renders always, so
       either one as primary would put a second gold slab beside Reveal. */
    const start = app.slice(app.indexOf('t("game.startCountdown"') - 500, app.indexOf('t("game.startCountdown"'));
    expect(start).toMatch(/variant="accent"/);
    const add = app.slice(app.indexOf("<Icon name=\"plus\" size={16} /> Add") - 260, app.indexOf("<Icon name=\"plus\" size={16} /> Add"));
    expect(add).toMatch(/variant="accent"/);
  });

  test("End session is a filled control, not red text in a box", () => {
    const rule = dsCss.slice(dsCss.indexOf(".pp-btn--danger {"), dsCss.indexOf("}", dsCss.indexOf(".pp-btn--danger {")));
    expect(rule).not.toMatch(/--btn-bg:\s*transparent/);
    expect(rule).toMatch(/--btn-bg:\s*var\(--danger-surface\)/);
  });

  test("solid red exists for a confirm dialog and is not loose in the page", () => {
    expect(dsCss).toMatch(/\.pp-btn--danger-strong\s*\{/);
    // Exactly one caller: the delete confirmation. A solid destructive button
    // anywhere else outranks the action the screen is actually for.
    expect([...app.matchAll(/variant="danger-strong"/g)]).toHaveLength(1);
  });
});

/* ── A ROW OF CHOICES IS ONE SHAPE ───────────────────────────────────────
   The role cards stretch to the taller of the two, so "Votes on each story"
   left 34px of dead space under it while "Runs the session and does not vote"
   left 14 — same border, same padding, visibly different card. And the card's
   single gap put the icon 4px from the label and the label 4px from its own
   description, so all three read as one run of text.
─────────────────────────────────────────────────────────────────────────── */
describe("the role cards", () => {
  const rule = (pattern) =>
    (dsCss.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{[^{}]*\}/g) || [])
      .filter((r) => pattern.test(r.split("{")[0].trim())).join("");

  test("a description reserves the second line the row was going to need", () => {
    expect(rule(/^\.pp-choice__desc$/)).toMatch(/min-height:\s*calc\(2em/);
  });

  test("the compact variant, which has no description, is not padded out", () => {
    expect(rule(/^\.pp-choice--compact \.pp-choice__desc$/)).toMatch(/min-height:\s*0/);
  });

  test("the icon is a rung of its own, not the first word of the label", () => {
    expect(rule(/^\.pp-choice__icon$/)).toMatch(/margin-bottom:/);
  });
});

/* ── DELETING A RECORDED ESTIMATE ────────────────────────────────────────
   The only action in the room that removes work the team already did. It is
   also the only one behind a dialog, because it is the only one with nothing
   to undo it.
─────────────────────────────────────────────────────────────────────────── */
describe("the sized list can be corrected", () => {
  const modal = app.slice(app.indexOf("open={!!pendingDelete}"), app.indexOf("open={!!pendingDelete}") + 1400);

  test("the dialog names the row, not just the act", () => {
    // "Are you sure?" over a list of five is a question about the wrong thing.
    expect(modal).toMatch(/pendingDelete\.name/);
    expect(modal).toMatch(/pendingDelete\.estimate/);
  });

  test("two ways out, and the safe one holds focus", () => {
    expect(modal).toMatch(/data-autofocus[\s\S]*?t\("game\.cancel"\)/);
    expect(modal).toMatch(/t\("game\.confirmDelete"\)/);
  });

  test("the delete button carries the row in its name, not just an X", () => {
    expect(app).toMatch(/label=\{t\("game\.deleteEstimateAria", \{ estimate: st\.estimate, name: st\.name \}\)\}/);
    expect(strings).toMatch(/"game\.deleteEstimateAria": "Delete the \{estimate\} estimate for \{name\}"/);
  });

  test("the action column's heading is hidden, never dropped", () => {
    /* An empty heading breaks the stacked layout under 760px, which prints
       every heading in front of its cell — the button would sit on a line
       with nothing naming it. */
    expect(app).toMatch(/\{ key: "remove", label: t\("game\.colRemove"\), hideLabel: true \}/);
    expect(dsIndex).toMatch(/c\.hideLabel \? <span className="pp-visually-hidden">/);
  });

  test("and the column instruction that sizes it does not survive the stack", () => {
    // width: 1% is how the column stays 36px wide; in the stacked layout every
    // cell is its own flex row and the same rule collapsed the button to 8px.
    //
    // The two widths must be THE SAME width, which is the point of asserting
    // them against each other rather than against a number. They were 760 here
    // and 640 in components.css, so for 120px of viewport the override fired
    // against a table that had not stacked yet. Both are on the tablet
    // breakpoint now and neither can move without the other.
    const stackAt = dsCss.match(/@media \(max-width: (\d+)px\) \{\s*\.pp-table--stack thead/);
    const undoAt = css.match(/@media \(max-width: (\d+)px\) \{\s*\.a-story-list td:last-child \{[^}]*width:\s*auto/);
    expect(stackAt).not.toBeNull();
    expect(undoAt).not.toBeNull();
    expect(undoAt[1]).toBe(stackAt[1]);
  });
});

/* ── ONE DECISION, ONE ROW ───────────────────────────────────────────────
   Countdown length and Start are a single two-step action, and a hint used to
   sit between them. The row that fixed that has to keep three properties, and
   each of them is a thing that was wrong before.
─────────────────────────────────────────────────────────────────────────── */
describe("the timer row", () => {
  const rule = (pattern) =>
    (css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{[^{}]*\}/g) || [])
      .filter((r) => pattern.test(r.split("{")[0].trim())).join("");

  test("aligns on the bottom edge, the only one the two controls share", () => {
    // The select carries a label above it and the button does not, so
    // align-items: center would hang the button off the select's midpoint.
    expect(rule(/^\.timer-setup$/m)).toMatch(/align-items:\s*end/);
  });

  test("wraps instead of reaching for a breakpoint", () => {
    // The panel sits in a rail whose width does not track the viewport, so a
    // media query here would be measuring the wrong box entirely. The row has
    // to fall apart on its own, at whatever width it stops fitting.
    expect(rule(/^\.timer-setup$/m)).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(/^\.timer-setup > \.pp-btn$/m)).toMatch(/flex:\s*1 1/);
  });

  test("the hint is still wired to the control it describes", () => {
    // It moved out of <Select hint=…> to sit under the whole row, which means
    // the aria-describedby that came free with the hint prop is now by hand.
    expect(app).toMatch(/id="timer-length"/);
    expect(app).toMatch(/aria-describedby="timer-length-hint"/);
    expect(app).toMatch(/id="timer-length-hint"/);
  });
});

/* ── EXPORTS THAT LEAVE THE APP CARRY THE BRAND ──────────────────────────
   The product is dark-first, and a browser strips background colours when it
   prints. Before the print stylesheet, printing any page gave you pale cream
   text on white paper: close to a blank sheet. And nothing that left the app
   said where it came from.

   The split is deliberate. A CSV cannot hold a logo, and a branding row above
   the header would break the Jira / Linear / Azure DevOps import that
   /support and /remote-sprint-planning both promise, because every one of
   those readers takes row 1 as the column names. So the CSV is branded on the
   filename only, and the printable report is where the mark actually goes.
──────────────────────────────────────────────────────────────────────── */
describe("printed and downloaded exports", () => {
  /* Comments stripped, and not as tidiness: the rules below assert that
     selectors are PRESENT, and the prose in this block names the very
     selectors it explains. Without the strip, deleting `.game-body` from the
     hide-list still passed because the comment above it says ".game-body".
     Caught by mutation-testing the rule, which is the point of doing it. */
  const printBlock = stripComments(app.match(/@media print \{[\s\S]*?\n\}/g)?.join("\n") || "");

  test("print forces paper colours, or the dark theme prints as a blank sheet", () => {
    expect(printBlock).toMatch(/background:\s*#fff\s*!important/);
    expect(printBlock).toMatch(/color:\s*#000\s*!important/);
  });

  test("the mark survives a printer told not to print backgrounds", () => {
    // It has to be an <img>: a background-image is precisely what that setting
    // discards. print-color-adjust then stops a colour printer flattening it.
    expect(app).toMatch(/<img className="print-report__mark" src="\/brand-mark\.png"/);
    expect(printBlock).toMatch(/print-color-adjust:\s*exact/);
    expect(printBlock).toMatch(/-webkit-print-color-adjust:\s*exact/);
  });

  test("the report names the product and the domain", () => {
    expect(app).toMatch(/print-report__brand">\s*Point Poker/);
    expect(app).toMatch(/print-report__foot[\s\S]{0,200}Generated by Point Poker/);
  });

  test("the table header repeats when a long list runs to a second sheet", () => {
    expect(printBlock).toMatch(/thead\s*\{\s*display:\s*table-header-group/);
  });

  test("controls are not printed, because paper cannot be clicked", () => {
    expect(printBlock).toMatch(/\.summary-actions/);
    expect(printBlock).toMatch(/\.navbar/);
  });

  test("both CSV filenames carry the brand", () => {
    expect(app).toMatch(/a\.download = `Point-Poker-\$\{\(code \|\| "session"\)/);
    const admin = readFileSync(join(__dirname, "AdminDashboard.js"), "utf8");
    expect(admin).toMatch(/a\.download = `Point-Poker-analytics-/);
  });

  test("the CSV body stays machine-clean so the promised import keeps working", () => {
    /* The header argument must be the column names and nothing else — a
       branding preamble there silently renames every column. The shape of the
       file, including where the provenance line may sit, is enforced properly
       in summaryCsv's own tests (src/estimation.test.js); this only checks
       that the room still hands it the three arguments in the right order and
       has not gone back to assembling rows by hand. */
    const csvFn = app.match(/const downloadSummaryCsv = useCallback\(\(\) => \{[\s\S]*?\n {2}\}/)?.[0] || "";
    expect(csvFn).toBeTruthy();
    expect(csvFn).toMatch(
      /summaryCsv\(\s*\[t\("game\.colIndex"\), t\("game\.colItem"\), t\("game\.colEstimate"\)\]/,
    );
    expect(csvFn).not.toMatch(/const rows = /);
  });

  test("the CSV signs itself with the same sentence the Copy button uses", () => {
    // One product, one line. Two exports saying it differently is how a
    // wording change lands in one of them and not the other.
    const csvFn = app.match(/const downloadSummaryCsv = useCallback\(\(\) => \{[\s\S]*?\n {2}\}/)?.[0] || "";
    const copyFn = app.match(/const copySummary = useCallback\(async \(\) => \{[\s\S]*?\n {2}\}/)?.[0] || "";
    expect(csvFn).toMatch(/t\("game\.summaryFooter"/);
    expect(copyFn).toMatch(/t\("game\.summaryFooter"/);
    expect(strings).toMatch(/"game\.summaryFooter":\s*"[^"]*Point Poker/);
  });

  /* ── What the Print / PDF button actually puts on paper ──────────────────
     It used to be the whole live room: the action bar, an empty "Add an item"
     textarea, a Countdown length <select>, the participant list — controls, on
     a sheet nobody can click — with the branded report somewhere below all of
     it. And because the print theme only forces #000 on p/li/td/th, every
     label that happened to be a span printed in its screen grey onto white.

     PrintReport renders outside .game-body now, and .game-body is in the
     hide-list, so the sheet is the report and nothing else. Both halves are
     pinned: move the component back inside and the first test fails; drop the
     selector and the second does. */
  test("the report is not inside the room it reports on", () => {
    /* Counted, not eyeballed: every <div> opened between the room's opening
       tag and the report must be closed again, and the room's own <div> closed
       on top — one more close than open. Inside the room the balance is
       negative, because the panel, the column and the grid are all still open.
       An earlier version of this test looked for three closing divs in a row
       and passed either way; there are plenty of those inside the room. */
    const a = app.indexOf('className="game-body');
    const b = app.indexOf("<PrintReport", a);
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    const between = app.slice(a, b);
    const opens = (between.match(/<div\b/g) || []).length;
    const closes = (between.match(/<\/div>/g) || []).length;
    expect(closes - opens).toBe(1);
  });

  test("the live room is not what gets printed", () => {
    expect(printBlock).toMatch(/\.game-body/);
    // The felt is a full-bleed fixed graphic; on a printer told to keep
    // backgrounds it washes every sheet green.
    expect(printBlock).toMatch(/body::before/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   THE SYSTEM RULES

   Everything above guards a decision. This block guards the SHAPE of the
   stylesheet, and it exists because docs/DESIGN-SYSTEM.md already said most of
   it and the code drifted anyway. A rule nobody can break by accident is worth
   more than a rule everybody agreed to.

   The audit these came out of (13 Aug 2026) found: a display typeface that
   never loaded on any machine, eleven breakpoints with an unowned band between
   two of them, twelve rendered font sizes against a scale of eight, 61
   off-grid spacing values, 26 hardcoded font stacks and nine raw z-indexes.
   Every one of them would have failed one of the tests below on the day it was
   written.

   @media print is exempt throughout. A print sheet is a different medium: it
   is black on white paper, it is not themed, it has no motion and no layering,
   and the design system has no print layer for it to draw from.
   ═══════════════════════════════════════════════════════════════════════════ */
describe("the system rules", () => {
  /* The CSS block is a template literal, so a comment quoting a selector is
     indistinguishable from the selector itself to a regex. Strip prose first,
     then split the print sheet off. */
  const code = stripComments(css);
  const printAt = code.indexOf("@media print");
  const screenCss = printAt === -1 ? code : code.slice(0, printAt);
  const dsCode = stripComments(dsCss);

  /* Declarations, as [property, value] pairs, from the screen stylesheet. */
  const declarations = (source) =>
    [...source.matchAll(/([-a-z]+)\s*:\s*([^;{}]+)[;}]/g)].map((m) => [m[1], m[2].trim()]);

  const valuesOf = (source, prop) =>
    declarations(source).filter(([p]) => p === prop).map(([, v]) => v);

  // ── 1 ────────────────────────────────────────────────────────────────────
  test("App.js does not restyle a design-system component from outside it", () => {
    /* Positioning a component INSIDE its parent is normal CSS and stays legal:
       .timer-setup > .pp-btn { flex: 1 1 11rem } is the parent's business.
       Repainting one is not — that is the component's business, and two files
       owning one component is how they drift. So the check is on the property,
       not the selector. */
    const APPEARANCE = /^(background|color|border|box-shadow|font|letter-spacing|text-transform|padding|opacity|filter)/;
    const offences = [...screenCss.matchAll(/([^{}]*\.pp-[^{}]*)\{([^{}]*)\}/g)]
      .flatMap(([, sel, body]) =>
        declarations(body)
          .filter(([p]) => APPEARANCE.test(p))
          .map(([p, v]) => `${sel.trim().split("\n").pop().trim()} { ${p}: ${v} }`),
      );
    expect(offences).toEqual([]);
  });

  /* Rules 2, 3, 4, 7 and 8 read BOTH stylesheets. They read only App.js until
     13 Aug 2026, which was fine while App.js was where the un-migrated CSS
     lived — and stopped being fine the moment the deck moved into
     components.css, because the migration would have carried the card's type
     and spacing straight out from under every rule meant to police it. A rule
     that a refactor can walk out of is not a rule. */
  const SHEETS = [["App.js", screenCss], ["components.css", dsCode]];

  // ── 2 ────────────────────────────────────────────────────────────────────
  test.each(SHEETS)("every font-size is a token — %s", (_label, source) => {
    /* html { font-size: 16px } is the rem base every other step is expressed
       against. It is the one place a literal is the correct answer. */
    const bad = valuesOf(source, "font-size")
      .filter((v) => !/^var\(--(fs|pc)-/.test(v) && v !== "inherit" && v !== "16px");
    expect(bad).toEqual([]);
  });

  test("the rem base is declared exactly once, in App.js", () => {
    expect(screenCss).toMatch(/html\s*\{[^}]*font-size:\s*16px/);
  });

  // ── 3 ────────────────────────────────────────────────────────────────────
  test.each(SHEETS)("every padding, margin and gap is on the 4px grid — %s", (_label, source) => {
    /* 1px, 2px and 3px survive as literals: hairlines, the inset on a chip and
       optical nudges under the grid's own resolution. Anything larger that is
       not a --sp-* is a private decision about spacing.
       scroll-margin/scroll-padding are excluded — they clear the sticky bars,
       so they are a measurement of the layout rather than a step in it. */
    const bad = declarations(source)
      .filter(([p]) => /^(padding|margin|gap|row-gap|column-gap)(-|$)/.test(p))
      .flatMap(([p, v]) =>
        (v.match(/-?\d+(?:\.\d+)?px/g) || [])
          .filter((px) => Math.abs(parseFloat(px)) > 3)
          .map((px) => `${p}: ${v}  (${px})`),
      );
    expect(bad).toEqual([]);
  });

  // ── 4 ────────────────────────────────────────────────────────────────────
  test.each(SHEETS)("every font-family and font-weight is a token — %s", (_label, source) => {
    expect(valuesOf(source, "font-family").filter((v) => !/^var\(--font-/.test(v) && v !== "inherit")).toEqual([]);
    expect(valuesOf(source, "font-weight").filter((v) => !/^var\(--fw-/.test(v) && v !== "inherit")).toEqual([]);
  });

  // ── 5 ────────────────────────────────────────────────────────────────────
  test("every media query is on the one breakpoint scale", () => {
    /* Three widths. .98 on the STOP form only, so a fractional viewport under
       browser zoom or Windows scaling lands in exactly one of any adjacent
       pair. The full reasoning is in the BREAKPOINTS block in tokens.css. */
    const ALLOWED = new Set(["max-width: 519.98px", "max-width: 520px", "min-width: 520px",
                             "max-width: 779.98px", "max-width: 780px", "min-width: 780px",
                             "max-width: 1023.98px", "min-width: 1024px"]);
    const found = [];
    for (const source of [code, dsCode, stripComments(baseCss)]) {
      for (const [, q] of source.matchAll(/@media\s*\(((?:max|min)-width:\s*[\d.]+px)\)/g)) {
        if (!ALLOWED.has(q.replace(/\s+/g, " "))) found.push(q);
      }
    }
    expect(found).toEqual([]);
  });

  // ── 6 ────────────────────────────────────────────────────────────────────
  test("every family a --font-* token names is actually loaded", () => {
    /* THE ONE THAT WOULD HAVE CAUGHT CORMORANT. A missing @font-face does not
       throw, warn, or look wrong on the machine it was written on — it falls
       silently through to the next candidate, so a Mac shows Iowan Old Style,
       Windows shows Georgia, and the brand has no display face on either.
       Only the FIRST family in a stack is ours; the rest are the fallbacks. */
    const SYSTEM = /^(ui-|system-ui|-apple-system|sans-serif|serif|monospace|cursive)/;
    const declared = [...fontsCss.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]);
    const wanted = [...tokens.matchAll(/--font-[\w-]*:\s*([^;]+);/g)]
      .map((m) => m[1].split(",")[0].trim().replace(/^['"]|['"]$/g, ""))
      .filter((f) => !SYSTEM.test(f));
    expect(wanted.length).toBeGreaterThan(0);
    for (const family of wanted) expect(declared).toContain(family);
  });

  test("and every font file that ships is one something asks for", () => {
    // The other direction: three Cormorant weights nothing could request were
    // shipping 69kB to every visitor. A file with no @font-face is dead weight.
    const files = readdirSync(join(__dirname, "..", "public", "fonts")).filter((f) => f.endsWith(".woff2"));
    const referenced = [...fontsCss.matchAll(/url\('\.\/([^']+)'\)/g)].map((m) => m[1]);
    expect(files.filter((f) => !referenced.includes(f))).toEqual([]);
  });

  // ── 7 ────────────────────────────────────────────────────────────────────
  test.each(SHEETS)("every z-index is a token — %s", (_label, source) => {
    expect(valuesOf(source, "z-index").filter((v) => !/^var\(--z-/.test(v))).toEqual([]);
  });

  // ── 8 ────────────────────────────────────────────────────────────────────
  test.each(SHEETS)("every transition and animation is on the motion scale — %s", (_label, source) => {
    /* Exempt: infinite ambient loops. A 2s heartbeat is a state being HELD,
       not a change being made, so it is not on the transition scale and should
       not be forced onto it. Named here so the exemption is a decision.
       Also exempt: the reduced-motion block's .001ms, which is the mechanism
       that turns all of this off. */
    const AMBIENT = /\binfinite\b/;
    /* Take the var() references out before looking for raw values, or
       "var(--ease-out)" reads as the bare keyword "ease-out" and every
       correctly-tokenised rule reports itself. */
    const raw = (v) => v.replace(/var\(--[\w-]+\)/g, "");
    const bad = declarations(source)
      .filter(([p]) => /^(transition|animation)(-|$)/.test(p))
      .filter(([, v]) => !AMBIENT.test(v) && !v.includes(".001ms"))
      .filter(([, v]) => /\d+(?:\.\d+)?m?s\b/.test(raw(v)) || /\b(ease|ease-in|ease-out|ease-in-out|linear|cubic-bezier)\b/.test(raw(v)))
      .map(([p, v]) => `${p}: ${v}`);
    expect(bad).toEqual([]);
  });

  test("nothing in the stylesheet can terminate the template literal", () => {
    /* The CSS is a JS template literal, so a backtick or a ${...} anywhere in
       it — including inside a comment quoting a selector — ends the string and
       the file stops parsing. It fails loudly at build time, but it fails a
       long way from the character that caused it: babel reports "Missing
       semicolon" pointing at whatever JS follows, which is why this happened
       twice in one afternoon. Cheaper to state the rule than to re-diagnose it.
       Interpolation is legal in the JSX below and nowhere in here. */
    const body = css.slice("const CSS = `".length);
    expect(body).not.toContain("`");
    expect(body).not.toContain("${");
  });

  // ── 9 ────────────────────────────────────────────────────────────────────
  test("every class in every stylesheet is one something can render", () => {
    /* A selector that matches nothing is not an error, so nothing ever fails
       and it sits there looking authoritative. This codebase had 40-odd of
       them on 13 Aug 2026 and two of them were actively misleading:

         .prow.obs / .pcard:first-child style rules whose element had been
         renamed underneath them, so a later reader "fixed" the rule that was
         already dead and left the live one alone;

         a byte-for-byte copy of the whole .choice primitive, kept in App.js
         after Choice moved into the design system, with three green tests
         asserting the primitive existed — against the copy.

       The rest were the paid tier: .seo-plan-card.pro, .footer-plan-badge.pro,
       .marketing-plan-card.pro and friends, still styling a plan that had been
       deleted months earlier.

       Classes built by interpolation (`pp-btn--${variant}`) can't be found by
       name, so any class starting with a prefix that appears before a ${ in
       source counts as live. That admits a few genuinely-dead modifiers rather
       than failing on live ones, which is the right way round for a rule that
       gates every commit. */
    const sources = [
      ...readdirSync(__dirname).filter((f) => /\.(js|mjs)$/.test(f) && !/\.test\./.test(f)).map((f) => join(__dirname, f)),
      ...readdirSync(join(__dirname, "design-system")).filter((f) => /\.(js|mjs)$/.test(f) && !/\.test\./.test(f)).map((f) => join(__dirname, "design-system", f)),
      ...readdirSync(join(__dirname, "locales")).map((f) => join(__dirname, "locales", f)),
      join(__dirname, "..", "public", "index.html"),
      join(__dirname, "..", "scripts", "prerender.mjs"),
    ];
    // App.js's own stylesheet is not a consumer of itself.
    const markup = sources.map((f) => readFileSync(f, "utf8")).join("\n").replace(css, "");
    const prefixes = [...markup.matchAll(/([\w-]+)\$\{/g)].map((m) => m[1]).filter((p) => p.includes("-"));
    const rendered = (c) =>
      new RegExp(`(^|[^\\w-])${c}([^\\w-]|$)`).test(markup) || prefixes.some((p) => c.startsWith(p));

    for (const [label, source] of [["App.js", css], ["components.css", dsCss], ["base.css", baseCss]]) {
      const dead = [...new Set(
        // url(...) holds an inline SVG whose xmlns makes "www.w3.org" look like
        // a class called w3. Strip the payloads before reading selectors.
        [...stripComments(source).replace(/url\([^)]*\)/g, "url()").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]),
      )].filter((c) => !rendered(c));
      expect({ [label]: dead }).toEqual({ [label]: [] });
    }
  });

  // ── 10 ───────────────────────────────────────────────────────────────────
  test("the App.js stylesheet does not grow", () => {
    /* A ceiling, not a target. The direction of travel is the point: every
       component that moves into the design system should take its CSS with it,
       so this number goes down and never up. Lower it when it does; needing to
       raise it means a surface was built in the wrong file.

       DECLARATIONS, not lines. Lines were the obvious metric and the wrong one:
       this codebase explains its decisions in comments, and a rule that makes
       documentation cost the same as CSS teaches people to delete the comments.
       Declarations measure the surface App.js actually owns, which is the thing
       that should shrink.

       It is the only rule here that cannot be satisfied by renaming something. */
    const rules = [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const declarations = rules.reduce(
      (n, [, , body]) => n + body.split(";").filter((d) => d.trim()).length, 0);
    expect({ declarations }).toEqual({ declarations: expect.any(Number) });
    expect(declarations).toBeLessThanOrEqual(CSS_DECLARATION_CEILING);
  });
});

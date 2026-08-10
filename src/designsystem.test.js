import { readFileSync } from "node:fs";
import { join } from "node:path";

/* A design system nobody checks is a document, not a system. These tests read
   the actual source so the rules in docs/DESIGN-SYSTEM.md cannot quietly rot.
   They are deliberately coarse: they guard the decisions that were expensive to
   make, not every line of CSS. */

const app = readFileSync(join(__dirname, "App.js"), "utf8");
const css = app.slice(app.indexOf("const CSS = `"), app.indexOf("`;", app.indexOf("const CSS = `")));

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
      ".pp-btn {", ".pp-btn--primary", ".pp-btn--secondary", ".pp-btn--ghost",
      ".pp-btn--danger", ".pp-btn--on-felt", ".pp-btn--sm", ".pp-btn--lg", ".pp-btn--block",
    ]) {
      expect(dsCss).toContain(cls);
    }
  });

  test("App.js keeps no second button system", () => {
    expect(css).not.toMatch(/\n\.btn\s*[,{]/);
    expect(css).not.toContain(".btn--primary");
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

  test("the action bar clears the iOS home indicator on phones", () => {
    expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  test("counts use tabular figures so they do not reflow as they climb", () => {
    // The count is a Chip now; the figures rule travelled with it.
    expect(dsCss).toMatch(/\.pp-chip--count[^{]*\{[^}]*tabular-nums/s);
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

  test("asking for a room you cannot have yet is not a dead end", () => {
    // Open needs a role, and the role picker has no default by design. The
    // ask is held until the role is picked, then completed — otherwise
    // opening a room on a phone is Open, scroll, pick, scroll back, Open.
    expect(join()).toContain("pendingRoomKey");
    expect(join()).toMatch(/clearErr = \(\) => \{[^}]*setPendingRoomKey\(""\)/);
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
    expect(app).toContain('align="start"\n              title="Your Team Rooms"');
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
    expect(app.match(/Start a new sprint\? This clears/g) || []).toHaveLength(1);
    expect(app.match(/End the session\? This disconnects/g) || []).toHaveLength(1);
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

  test("each KPI reads label-left, value-right on one line", () => {
    expect(css).toMatch(/\.a-kpis \.pp-stat\s*\{[^}]*justify-content:\s*space-between/s);
  });

  test("one sub-heading treatment for every section of the panel", () => {
    // Team Alignment was sentence case while its two peers were tracked
    // uppercase, so one panel announced three peer sections three ways.
    const rule = css.match(/\.a-section-title,\s*\n\.a-align-title,\s*\n\.analytics-breakdown-title\s*\{[^}]*\}/s);
    expect(rule).not.toBeNull();
    expect(rule[0]).toContain("text-transform: uppercase");
  });
});

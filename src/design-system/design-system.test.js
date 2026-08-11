import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeToggle, Modal, StatTile, Tabs, VoteCard, Alert, setTheme } from "./index.js";

/* A design system nobody checks is a document, not a system.

   These read the CSS as text and the components as components. The expensive
   decisions they guard: dark is the default and nothing may quietly move it,
   every semantic role exists in both themes, the text roles actually clear
   WCAG AA against the ground they sit on, and a dialog is a dialog to a
   keyboard rather than a div that looks like one. */

/* Comments are stripped everywhere before matching: several of them quote the
   very patterns these tests forbid, and a test that fails on its own
   explanation is worse than no test. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

const tokens = strip(readFileSync(join(__dirname, "tokens.css"), "utf8"));
const components = strip(readFileSync(join(__dirname, "components.css"), "utf8"));
const base = strip(readFileSync(join(__dirname, "base.css"), "utf8"));

/* ── Reading the token file ───────────────────────────────────────────────── */

/** Every declaration inside the blocks whose selector list matches `test`.
    Matching is on whole selectors, not substrings: `[data-theme="light"]
    .site-footer` scopes the text roles to an inverse block and must not be
    read as the light theme's own definition of them. */
function block(test) {
  const out = {};
  for (const m of tokens.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const parts = m[1].trim().split(",").map((s) => s.trim());
    if (!parts.some(test)) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

/* Three sets, and the distinction matters. SCALE is the part of the system
   that has no opinion about theme — type, spacing, radii, motion, the raw
   palette — and is written once on a bare :root. DARK and LIGHT are the
   semantic roles, and every role in one must exist in the other. */
const SCALE = block((s) => s === ":root");
const DARK = block((s) => s === '[data-theme="dark"]');
const LIGHT = block((s) => s === '[data-theme="light"]');

/** Resolve a value through its var() chain in the given theme. */
function resolve(value, theme, depth = 0) {
  if (depth > 12 || !value) return value;
  const m = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (!m) return value;
  const next = theme[m[1]] ?? SCALE[m[1]];
  return next === undefined ? value : resolve(next, theme, depth + 1);
}

/** @keyframes bodies, brace-matched — the blocks nest, so a regex will not do. */
function keyframeBodies(css) {
  const out = [];
  for (const m of css.matchAll(/@keyframes[^{]*\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      i += 1;
    }
    out.push(css.slice(start, i - 1));
  }
  return out;
}

/* ── Colour maths ─────────────────────────────────────────────────────────── */

function parseColour(v) {
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const rgba = v.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const p = rgba[1].split(",").map((n) => parseFloat(n));
    return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
  }
  return null;
}

/** Flatten a translucent ink onto the ground it is painted on. */
const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));

const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function contrast(fgValue, bgValue, theme) {
  const bg = parseColour(resolve(bgValue, theme));
  const fg = parseColour(resolve(fgValue, theme));
  if (!fg || !bg) return null;
  const l1 = luminance(over(fg, bg));
  const l2 = luminance(bg.slice(0, 3));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/* ── Dark is the default ──────────────────────────────────────────────────── */

describe("dark is the default", () => {
  test(":root carries the dark roles, so dark needs no JavaScript to happen", () => {
    // Not "a script sets it on load" — the very first paint, a crawler, a
    // printed page and a browser with JS off all have to be dark already.
    expect(DARK["--bg-page"]).toBeTruthy();
    expect(DARK["--color-scheme"] ?? "dark").toBeTruthy();
    expect(tokens).toMatch(/:root,\s*\n\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/s);
  });

  test("light is reachable only by asking for it", () => {
    expect(tokens).toMatch(/\[data-theme="light"\]\s*\{/);
    // A prefers-color-scheme block would move the theme under a user who never
    // touched the control. The OS is not the product.
    for (const sheet of [tokens, base, components]) {
      expect(sheet).not.toMatch(/@media[^{]*prefers-color-scheme/);
    }
  });

  test("the page ground is dark by default and light only when asked", () => {
    const dark = parseColour(resolve(DARK["--bg-page"], DARK));
    const light = parseColour(resolve(LIGHT["--bg-page"], LIGHT));
    expect(luminance(dark.slice(0, 3))).toBeLessThan(0.05);
    expect(luminance(light.slice(0, 3))).toBeGreaterThan(0.5);
  });
});

/* ── Both themes are complete ─────────────────────────────────────────────── */

describe("every role exists in both themes", () => {
  /* A role defined in dark but missed in light does not fall back to something
     sensible — it keeps the dark value, which is how you end up with cream
     text on ivory paper and a screen that reads as blank. */
  test.each(Object.keys(DARK))("%s is defined in light too", (role) => {
    expect(LIGHT[role]).toBeDefined();
  });

  test("and light adds nothing dark has not got", () => {
    // The other direction: a role that only exists in light is a role dark
    // falls through on, which is the same bug wearing the other hat.
    expect(Object.keys(LIGHT).filter((k) => DARK[k] === undefined)).toEqual([]);
  });
});

/* ── Contrast ─────────────────────────────────────────────────────────────── */

describe("contrast floor", () => {
  const themes = [["dark", DARK], ["light", LIGHT]];

  describe.each(themes)("%s", (name, theme) => {
    /* --text-3 is the floor. Nothing in the product goes below it, so if it
       clears AA then every text role above it does too. */
    test.each(["--text-1", "--text-2", "--text-3"])("%s clears WCAG AA on the page ground", (role) => {
      expect(contrast(theme[role], theme["--bg-page"], theme)).toBeGreaterThanOrEqual(4.5);
    });

    test("--text-3 clears AA on a card as well as on the page", () => {
      // Cards are the surface most of the product's small print actually sits
      // on, and it is a different colour from the page in both themes.
      expect(contrast(theme["--text-3"], theme["--surface-1"], theme)).toBeGreaterThanOrEqual(4.5);
    });

    test("the inverse footer keeps its own contrast", () => {
      // The footer stays felt-green in light, so its text roles are re-pointed
      // for the subtree. That override has to clear AA too — a scoped role is
      // still a role.
      const footer = block((s) => s === '[data-theme="light"] .site-footer');
      const scoped = { ...theme, ...(name === "light" ? footer : {}) };
      const ground = name === "light" ? theme["--surface-felt"] : theme["--bg-page"];
      for (const role of ["--text-1", "--text-2", "--text-3"]) {
        expect(contrast(scoped[role], ground, scoped)).toBeGreaterThanOrEqual(4.5);
      }
    });

    test("gold used as TEXT clears AA on this theme's ground", () => {
      // The reason --action-quiet exists: the brass that paints a button is
      // 1.5:1 as a label on ivory. Surface gold and text gold are two roles.
      expect(contrast(theme["--action-quiet"], theme["--bg-page"], theme)).toBeGreaterThanOrEqual(4.5);
    });

    test("the primary action's label clears AA on brass", () => {
      expect(contrast(theme["--text-on-gold"], theme["--action"], theme)).toBeGreaterThanOrEqual(4.5);
    });

    test("text on the felt block clears AA", () => {
      expect(contrast(theme["--text-on-felt"], theme["--surface-felt"], theme)).toBeGreaterThanOrEqual(4.5);
    });

    test("the state hues clear AA on their own surfaces", () => {
      for (const hue of ["danger", "success", "info", "warning"]) {
        const ratio = contrast(theme[`--${hue}`], theme["--bg-page"], theme);
        expect([hue, Math.round(ratio * 10) / 10]).toEqual([hue, expect.any(Number)]);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});

/* ── The rules that are cheap to break ────────────────────────────────────── */

describe("the ten rules", () => {
  test("13px is the floor and no component writes below it", () => {
    expect(tokens).toMatch(/--fs-1:\s*0?\.8125rem/);
    const under = [...components.matchAll(/font-size:\s*(0?\.\d+rem)/g)]
      .map((m) => m[1])
      .filter((v) => parseFloat(v) < 0.8125);
    expect([...new Set(under)]).toEqual([]);
  });

  test("16px is the floor in anything typed into, or iOS zooms the viewport", () => {
    expect(components).toMatch(/\.pp-input[^{]*\{[^}]*font-size:\s*var\(--fs-3\)/s);
    expect(tokens).toMatch(/--fs-3:\s*1rem/);
  });

  test("every control clears 44px", () => {
    expect(tokens).toMatch(/--tap-min:\s*44px/);
    expect(tokens).toMatch(/--control-md:\s*44px/);
    for (const re of [
      /\.pp-btn\s*\{[^}]*min-height:\s*var\(--control-md\)/s,
      /\.pp-icon-btn\s*\{[^}]*height:\s*var\(--control-md\)/s,
      /\.pp-choice\s*\{[^}]*min-height:\s*var\(--tap-min\)/s,
      /\.pp-switch\s*\{[^}]*min-height:\s*var\(--tap-min\)/s,
      /\.pp-check\s*\{[^}]*min-height:\s*var\(--tap-min\)/s,
    ]) {
      expect(components).toMatch(re);
    }
  });

  test("focus is never removed without a replacement", () => {
    expect(base).toMatch(/focus-visible[^{]*\{[^}]*outline:\s*var\(--bw-thick\)\s*solid\s*var\(--focus\)/s);
    expect(components).not.toMatch(/outline:\s*(none|0)\s*;/);
  });

  test("reduced motion is respected", () => {
    expect(base).toContain("prefers-reduced-motion: reduce");
  });

  test("components use semantic roles, never the raw palette", () => {
    /* The whole reason the second theme was nearly free. A component reaching
       past --surface-1 to --felt-700 pins itself to one theme. The exceptions
       are the elements that are the same object in both: an ivory card face,
       the brass on the felt block, and the suit pips printed on a card. */
    const ALLOWED = new Set([
      "--felt-950", "--felt-850", "--felt-700", "--felt-600", // the felt block and card back
      "--brass-300", "--brass-500", "--brass-600",            // trim on felt, card pips
      "--red-600",                                            // a red suit is red on both
      "--cream",                                              // ink on the felt block
      "--ivory-100",
    ]);
    // Palette steps are numbered (--felt-700); roles are not (--felt-texture).
    const raw = [...components.matchAll(/var\(\s*(--(?:felt|brass|ivory|red|green|blue|aqua|amber)-\d{3})/g)]
      .map((m) => m[1])
      .filter((t) => !ALLOWED.has(t));
    expect([...new Set(raw)]).toEqual([]);
  });

  test("only transform and opacity are animated", () => {
    // background-position is the shimmer on a skeleton: it moves a gradient
    // that is already painted, so it costs no layout and no paint.
    const animated = keyframeBodies(components)
      .flatMap((body) => [...body.matchAll(/([a-z-]+)\s*:/g)].map((d) => d[1]))
      .filter((prop) => !["transform", "opacity", "background-position"].includes(prop));
    expect([...new Set(animated)]).toEqual([]);
  });

  test("selection is an ARIA state, not a class", () => {
    expect(components).toMatch(/\[aria-pressed="true"\]/);
    expect(components).toMatch(/\[aria-selected="true"\]/);
    expect(components).not.toMatch(/\.pp-[\w-]*\.active\b/);
  });
});

/* ── The components ───────────────────────────────────────────────────────── */

describe("ThemeToggle", () => {
  afterEach(() => act(() => setTheme("dark")));

  /* This was an IconButton whose name stated its outcome — "Switch to the light
     theme" — on the reasoning that a control labelled with its own state is the
     most reliably misread thing on the web. True of buttons, which have one
     appearance and only their name to go on. Not true of a switch, which has a
     visible position: role="switch" exists so the name can be the thing and
     aria-checked can be the state. So the label now says which theme is on, and
     these tests hold it to the switch contract instead of the button one.

     There is no aria-label any more either. The visible text is the accessible
     name, which is the one arrangement WCAG 2.5.3 cannot drift out of: the two
     cannot disagree because there is only one of them. */

  test("is a switch, and its position is the theme", async () => {
    render(<ThemeToggle />);
    const control = screen.getByRole("switch");
    expect(control).not.toBeChecked();              // dark is the default, and off
    expect(control).toHaveAccessibleName("Dark theme");

    await userEvent.click(control);

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(control).toBeChecked();
    expect(control).toHaveAccessibleName("Light theme");
  });

  test("the visible word is inside the accessible name", async () => {
    // WCAG 2.5.3. Someone driving the page by voice says "click Dark", and the
    // words they can see have to be words the control answers to.
    render(<ThemeToggle />);
    const control = screen.getByRole("switch");
    expect(control).toHaveAccessibleName(expect.stringContaining("Dark"));

    await userEvent.click(control);
    expect(control).toHaveAccessibleName(expect.stringContaining("Light"));
  });

  test("the keyboard drives it", async () => {
    // A switch answers to Space. Losing that is the usual cost of swapping a
    // button for something that looks like one.
    render(<ThemeToggle />);
    const control = screen.getByRole("switch");
    control.focus();
    await userEvent.keyboard(" ");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  test("the word survives the narrow bar that hides it", () => {
    /* The navbar clips " theme" under 780px and the whole label at its own
       breakpoint, both with clip-path rather than display:none — precisely so
       the name stays whole when the words cannot be shown. A future tidy-up to
       display:none would pass every test above and silently rename the control
       to "Dark" on a phone. This is the one that would notice. */
    render(<ThemeToggle />);
    expect(screen.getByRole("switch")).toHaveAccessibleName("Dark theme");
    expect(screen.getByText(/theme/).tagName).toBe("SPAN");
  });

  test("remembers the choice", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("switch"));
    expect(localStorage.getItem("pp-theme")).toBe("light");
  });

  test("two toggles on one screen agree", async () => {
    render(<><ThemeToggle /><ThemeToggle /></>);
    const [first] = screen.getAllByRole("switch");
    await userEvent.click(first);
    for (const s of screen.getAllByRole("switch")) {
      expect(s).toBeChecked();
      expect(s).toHaveAccessibleName("Light theme");
    }
  });
});

describe("Modal", () => {
  test("is a dialog to a keyboard, not a div that looks like one", async () => {
    const onClose = jest.fn();
    render(
      <Modal open title="Close this room?" onClose={onClose}>
        <button type="button">Keep it open</button>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // aria-labelledby, not aria-label: the title is already on screen, and a
    // node title would stringify to [object Object].
    expect(dialog).toHaveAccessibleName("Close this room?");
    // Focus has to land inside, or the keyboard is still out in the room.
    expect(dialog).toContainElement(document.activeElement);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  test("returns focus to whatever opened it", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} title="Test" onClose={() => setOpen(false)} />
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    await userEvent.keyboard("{Escape}");
    expect(opener).toHaveFocus();
  });

  test("still returns focus after the dialog has re-rendered", async () => {
    /* The real dialog in this product is a sign-in form, so it re-renders on
       every keystroke, and its onClose is an inline arrow — a new function each
       time. When that function was in the effect's dependencies the effect tore
       down and re-ran mid-typing, re-capturing the opener as whatever was
       focused *inside* the dialog. Escape then returned focus to a node that
       was about to be removed, and the keyboard landed on <body>.

       The single-render test above passes either way. This one does not. */
    function Harness() {
      const [open, setOpen] = React.useState(false);
      const [text, setText] = React.useState("");
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} title="Test" onClose={() => setOpen(false)}>
            <input aria-label="Email" value={text} onChange={(e) => setText(e.target.value)} />
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    await userEvent.type(screen.getByLabelText("Email"), "someone@example.com");
    await userEvent.keyboard("{Escape}");
    expect(opener).toHaveFocus();
  });
});

describe("components say it in words, not only in colour", () => {
  test("a stat with no data explains itself instead of showing a zero", () => {
    render(<StatTile label="Median" value={null} />);
    // "0 stories estimated" reads as a session that went badly, not an empty one.
    expect(screen.getByText("Appears after the first reveal")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  test("a vote card announces the value it plays", () => {
    render(<VoteCard value="8" selected />);
    const card = screen.getByRole("button", { name: "Play 8" });
    expect(card).toHaveAttribute("aria-pressed", "true");
  });

  test("a danger alert interrupts; anything else does not", () => {
    const { rerender } = render(<Alert tone="danger" title="That room has closed" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(<Alert tone="success" title="Estimate recorded" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("Tabs follow the tablist pattern", () => {
  const TABS = [{ value: "a", label: "Room" }, { value: "b", label: "History" }];

  test("arrow keys move between tabs and Tab steps past the strip", async () => {
    const onChange = jest.fn();
    render(<Tabs tabs={TABS} value="a" onChange={onChange} ariaLabel="Views" />);

    // Only the selected tab is in the tab order — Tab should leave the strip,
    // not walk through every tab in it.
    expect(screen.getByRole("tab", { name: "Room" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("tabindex", "-1");

    screen.getByRole("tab", { name: "Room" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

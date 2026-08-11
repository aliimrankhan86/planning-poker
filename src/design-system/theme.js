import { useSyncExternalStore } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   Point Poker design system — theme

   DARK IS THE DEFAULT and stays the default. tokens.css puts the dark roles on
   :root, so dark is what renders before this module has run at all: no-JS,
   first paint, crawler, and print all get it. Light is only ever reached by
   the user asking for it, and the answer is remembered.

   There is deliberately no prefers-color-scheme fallback. A user who has never
   touched the toggle gets dark whatever their OS says — this is a product with
   a felt-green table, not a document, and the theme must not move under
   someone who did not ask.

   The no-flash boot script in public/index.html reads the same storage key
   before first paint. Change STORAGE_KEY here and you must change it there.
   ═══════════════════════════════════════════════════════════════════════════ */

export const STORAGE_KEY = "pp-theme";
export const DEFAULT_THEME = "dark";

/* The mobile browser chrome sits directly above the page, so these have to be
   the page ground exactly: --felt-900 and --paper-200, which are what
   --bg-page resolves to in each theme. Light was #f6f3ea, three steps up the
   paper ramp from the #eceade the page actually paints — a pale seam across
   the top of every phone the moment anyone chose the light theme. Change
   either token in tokens.css and change it here; designsystem.test.js fails if
   these two and the boot values in public/index.html stop agreeing. */
const BROWSER_UI_COLOUR = { dark: "#07110e", light: "#eceade" };

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null; // Safari private mode, or a browser with storage blocked.
  }
}

/* A module-level store rather than useState, because the toggle appears on more
   than one screen and two useState copies of the same DOM attribute drift the
   moment either one changes. */
let current =
  (typeof document !== "undefined" && document.documentElement.dataset.theme) ||
  readStored() ||
  DEFAULT_THEME;

const listeners = new Set();

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot() {
  return current;
}

/* The server render and the pre-rendered HTML have no user preference, so they
   must agree on the default or React logs a hydration mismatch. */
function getServerSnapshot() {
  return DEFAULT_THEME;
}

export function setTheme(next) {
  const theme = next === "light" ? "light" : "dark";
  if (theme === current) return;
  current = theme;

  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* Not being able to remember the choice is not a reason to refuse it. */
  }

  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute("content", BROWSER_UI_COLOUR[theme]);

  listeners.forEach((fn) => fn());
}

/** Current theme plus a setter. `const [theme, set] = useTheme()`.
    The ThemeToggle control itself lives in index.js with the other components;
    this file stays JSX-free so nothing imports back into it. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [theme, setTheme];
}

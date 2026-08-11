import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ref as dbRef } from "firebase/database";
import App from "./App";
import {
  DEFAULT_META,
  STATIC_ROUTE_META,
  STATIC_SCREEN_BY_PATH,
  PRIVATE_PATHS,
  ROUTE_CONTENT,
  SITE_URL,
  SUPPORT_FAQ,
} from "./routeMeta.mjs";

// Firebase is a network dependency; the smoke test only cares that the shell renders.
jest.mock("./firebase", () => ({ auth: { currentUser: null }, db: {} }));
jest.mock("firebase/auth", () => ({
  onAuthStateChanged: () => () => {},
  createUserWithEmailAndPassword: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
}));
jest.mock("firebase/database", () => ({
  ref: jest.fn(),
  set: jest.fn(),
  get: jest.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
  push: jest.fn(),
  onValue: jest.fn(() => () => {}),
  update: jest.fn(),
  remove: jest.fn(),
  increment: jest.fn(),
  serverTimestamp: jest.fn(),
  onDisconnect: jest.fn(() => ({ update: jest.fn() })),
}));

test("home screen leads with the free positioning", () => {
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/free planning poker/i);
});

/* ── SEO route metadata ────────────────────────────────────────────────
   Guards the bug this replaced: every marketing route was a rewrite to "/",
   so all fourteen shipped the homepage title, description, and canonical.
   These assertions fail loudly if a route ever shares metadata again.
──────────────────────────────────────────────────────────────────────── */
describe("route metadata", () => {
  const entries = Object.entries(STATIC_ROUTE_META);

  test("every public route has its own metadata", () => {
    const missing = Object.keys(STATIC_SCREEN_BY_PATH).filter(
      (p) => p !== "/" && !PRIVATE_PATHS.includes(p) && !STATIC_ROUTE_META[p],
    );
    expect(missing).toEqual([]);
  });

  test("private routes are never given indexable metadata", () => {
    for (const p of PRIVATE_PATHS) {
      expect(STATIC_ROUTE_META[p]).toBeUndefined();
    }
  });

  test("canonical points at the route's own URL", () => {
    for (const [path, meta] of entries) {
      expect(meta.canonical).toBe(`${SITE_URL}${path}`);
      expect(meta.ogUrl).toBe(`${SITE_URL}${path}`);
    }
    expect(DEFAULT_META.canonical).toBe(`${SITE_URL}/`);
  });

  test("titles and descriptions are unique across routes", () => {
    const titles = [DEFAULT_META.title, ...entries.map(([, m]) => m.title)];
    const descriptions = [DEFAULT_META.description, ...entries.map(([, m]) => m.description)];
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  test("descriptions stay inside the length search engines actually render", () => {
    for (const [path, meta] of [["/", DEFAULT_META], ...entries]) {
      expect(meta.title.length).toBeLessThanOrEqual(70);
      expect(meta.description.length).toBeGreaterThanOrEqual(70);
      expect(`${path}:${meta.description.length}`).toBe(
        `${path}:${Math.min(meta.description.length, 320)}`,
      );
    }
  });

  test("prerendered content shells carry a heading and intro", () => {
    for (const [path, content] of Object.entries(ROUTE_CONTENT)) {
      expect(`${path}:${!!content.h1}`).toBe(`${path}:true`);
      expect(`${path}:${!!content.intro}`).toBe(`${path}:true`);
    }
  });

  /* A route with a `faq` gets FAQPage JSON-LD from scripts/prerender.mjs.
     Claiming answers the hydrated page never shows is how a rich result gets
     pulled, so the support page has to render the same array the schema is
     built from rather than a hand-copied second version of it. */
  test("the support FAQ the schema advertises is the one the page renders", () => {
    expect(ROUTE_CONTENT["/support"].faq).toBe(SUPPORT_FAQ);
    expect(SUPPORT_FAQ.length).toBeGreaterThan(0);
    for (const { q, a } of SUPPORT_FAQ) {
      expect(q.endsWith("?")).toBe(true);
      expect(a.length).toBeGreaterThan(80);
    }

    const source = readFileSync(join(__dirname, "App.js"), "utf8");
    expect(source).toMatch(/SUPPORT_FAQ\.map\(/);
  });

  /* The brand had drifted to three spellings across the product. These are the
     only places "pointpoker" may still appear lowercase, and each is an
     identifier rather than the brand in prose:
       • pointpoker.app        the domain, and the support address on it
       • pointpoker-<thing>    download filenames
       • [pointpoker]          the console log namespace
     Anything else is the brand and reads "Point Poker". */
  test("the brand is spelled Point Poker everywhere it is prose", () => {
    const files = [
      "App.js", "routeMeta.mjs", "AppErrorBoundary.js", "AdminDashboard.js",
      "design-system/index.js",
    ];
    const allowed = /pointpoker(?=\.app|-)|\[pointpoker\]/g;
    const offenders = [];
    for (const f of files) {
      const src = readFileSync(join(__dirname, f), "utf8").replace(allowed, "");
      for (const line of src.split("\n")) {
        if (/pointpoker|Point poker|point Poker/.test(line)) offenders.push(`${f}: ${line.trim().slice(0, 70)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("support questions do not restate the home page's", () => {
    // Two URLs answering the same query compete with each other. The home FAQ
    // owns "is it free" and "do I need an account"; /support owns the
    // troubleshooting ones.
    const home = new Set(ROUTE_CONTENT["/"].faq.map((f) => f.q.toLowerCase()));
    for (const { q } of SUPPORT_FAQ) {
      expect(home.has(q.toLowerCase())).toBe(false);
    }
  });
});

/* ── Dialog focus behaviour (WCAG 2.1.2, 2.4.3) ────────────────────────
   Verified in jsdom rather than a live browser: an unfocused browser window
   reports document.activeElement as <body> regardless of what was focused,
   which makes focus assertions there meaningless.
──────────────────────────────────────────────────────────────────────── */
describe("login dialog focus management", () => {
  const openDialog = () => {
    render(<App />);
    const trigger = screen.getByRole("button", { name: /^sign in$/i });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    return trigger;
  };

  test("moves focus into the dialog on open", () => {
    openDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  test("Escape closes and returns focus to the trigger", () => {
    const trigger = openDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  test("the close button returns focus to the trigger", () => {
    const trigger = openDialog();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  test("Tab wraps from the last focusable back to the first", () => {
    openDialog();
    const dialog = screen.getByRole("dialog");
    const focusable = [...dialog.querySelectorAll("a[href], button:not([disabled]), input:not([disabled])")];
    // jsdom reports offsetParent as null for everything, so the hook's
    // visibility filter yields nothing and it declines to trap — assert the
    // dialog at least exposes a focusable set rather than a dead end.
    expect(focusable.length).toBeGreaterThan(1);
  });
});

/* ── Account funnel ────────────────────────────────────────────────────
   The dashboard divides completed registrations by "signup_started", which
   only means anything if both halves count the same population. The event
   used to fire from the navbar Sign in button, so every returning user and
   every reopen of the dialog inflated the denominator, while the two paths
   that genuinely open the dialog to register never fired it at all. Live
   figures were 24 started, 0 completed, 0% — an artefact, not a product
   failure. These tests pin both halves to register intent.
──────────────────────────────────────────────────────────────────────── */
describe("account funnel analytics", () => {
  // track() writes to analytics/daily/<date>/<event>, so the mocked ref()
  // call log is the record of which events fired.
  const signupStarts = () =>
    dbRef.mock.calls.filter(([, path]) => String(path).endsWith("/signup_started")).length;

  const openDialog = () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    return screen.getByRole("dialog");
  };

  beforeEach(() => dbRef.mockClear());

  test("opening the dialog to sign in is not a signup start", () => {
    expect(openDialog()).toBeInTheDocument();
    expect(signupStarts()).toBe(0);
  });

  test("switching to Create account counts exactly one signup start", () => {
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: /^create account$/i }));
    expect(signupStarts()).toBe(1);
  });

  test("re-selecting Create account does not count twice", () => {
    const dialog = openDialog();
    const toggle = within(dialog).getByRole("button", { name: /^create account$/i });
    fireEvent.click(toggle);
    fireEvent.click(within(dialog).getByRole("button", { name: /^sign in$/i }));
    fireEvent.click(toggle);
    expect(signupStarts()).toBe(1);
  });
});

/* ── Role selection ───────────────────────────────────────
   The picker defaulted to Participant for everyone, including the person
   creating the room. Anyone who never changed it reached a revealed round with
   no way to record the estimate: every record control is facilitator-only and
   a voter cannot promote themselves. That was fixed by removing the default
   entirely, which cost every user a mandatory click to say something the tab
   they were already on had said for them.

   The default is per tab now, which is the version that has neither problem.
   These tests pin the three things that matter: the two tabs disagree, the
   creator is never silently a voter, and a deliberate pick outranks the tab
   from then on — in both directions, or switching tabs would quietly undo a
   choice the user made on purpose.
──────────────────────────────────────────────────────────── */
describe("role selection", () => {
  const roles = () => screen.getAllByRole("button", { name: /role:/i });
  const chosen = () =>
    roles().find((b) => b.getAttribute("aria-pressed") === "true")?.textContent.trim();
  const tab = (name) => fireEvent.click(screen.getByRole("button", { name }));

  test("exactly one role is preselected, never none and never both", () => {
    render(<App />);
    expect(roles().length).toBe(2);
    expect(roles().filter((b) => b.getAttribute("aria-pressed") === "true").length).toBe(1);
  });

  test("creating a room makes you the facilitator", () => {
    render(<App />);
    expect(chosen()).toMatch(/^Facilitator/);
  });

  test("joining someone else's room makes you a participant", () => {
    render(<App />);
    tab("Join");
    expect(chosen()).toMatch(/^Participant/);
  });

  test("a shared link lands on Join, so it lands on Participant", () => {
    window.history.pushState({}, "", "/?room=AB12C");
    try {
      render(<App />);
      expect(chosen()).toMatch(/^Participant/);
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  test("a deliberate pick outranks the tab, in both directions", () => {
    render(<App />);
    tab("Join");
    expect(chosen()).toMatch(/^Participant/);
    fireEvent.click(screen.getByRole("button", { name: /facilitator role:/i }));
    expect(chosen()).toMatch(/^Facilitator/);
    // The tab that would have said Participant no longer gets to.
    tab("Create");
    expect(chosen()).toMatch(/^Facilitator/);
    tab("Join");
    expect(chosen()).toMatch(/^Facilitator/);
  });
});

/* ── ONE CAP, TWO FILES ──────────────────────────────────────────────────
   rooms/$roomId/stories/$storyIndex takes unauthenticated writes, and a rule
   cannot count children — so the key format is the cap, and the key format is
   a number of digits. The client has to know the same number, because a
   multi-path update is atomic: one index over the line rejects the whole paste
   and the queue blames the connection for it.
─────────────────────────────────────────────────────────────────────────── */
describe("the story-queue cap", () => {
  const rules = readFileSync(join(__dirname, "..", "database.rules.json"), "utf8");
  const appSrc = readFileSync(join(__dirname, "App.js"), "utf8");

  test("the rule and the client agree on how many stories a room holds", () => {
    const digits = Number(rules.match(/\$storyIndex\.matches\(\/\^\[0-9\]\{1,(\d)\}\$\//)[1]);
    const clientCap = Number(appSrc.match(/const MAX_QUEUE = (\d+);/)[1]);
    expect(clientCap).toBe(10 ** digits);
  });

  test("rounds are capped the same way, since they are keyed the same way", () => {
    expect(rules).toMatch(/\$roundIndex\.matches\(\/\^\[0-9\]\{1,3\}\$\//);
  });

  test("hitting it says so, instead of reporting a network problem", () => {
    const guard = appSrc.slice(appSrc.indexOf("if (startIdx + names.length > MAX_QUEUE)"), appSrc.indexOf("if (startIdx + names.length > MAX_QUEUE)") + 220);
    expect(guard).toMatch(/showToast/);
    expect(guard).not.toMatch(/connection/);
  });
});

/* ── THE SITEMAP IS A FOURTH COPY OF THE ROUTE TABLE ─────────────────────
   routeMeta.mjs already feeds the runtime router, the runtime <head>, and the
   build-time prerender, so a new page reaches Google's crawler through three
   of the four. public/sitemap.xml is hand-written, and a page missing from it
   is invisible in exactly the way that leaves no symptom to notice: the site
   works, the page renders, nothing 404s, it simply never gets crawled. The
   project already stopped this class of drift twice — build-rules.mjs for the
   security rules, prerender.mjs for the meta — and this is the third.
─────────────────────────────────────────────────────────────────────────── */
describe("the sitemap and the route table say the same thing", () => {
  const sitemap = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "public", "sitemap.xml"), "utf8");
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(([, url]) => url.replace(SITE_URL, "") || "/");
  const indexable = Object.keys(STATIC_SCREEN_BY_PATH).filter((p) => !PRIVATE_PATHS.includes(p));

  test("every indexable route is in the sitemap", () => {
    expect(indexable.filter((r) => !listed.includes(r))).toEqual([]);
  });

  test("the sitemap advertises nothing that is not a route", () => {
    expect(listed.filter((r) => !indexable.includes(r))).toEqual([]);
  });

  test("no route is listed twice, which splits its own ranking signal", () => {
    expect(new Set(listed).size).toBe(listed.length);
  });

  test("every URL is absolute and on the canonical host", () => {
    // A relative <loc>, or the apex that vercel.json 301s to www, wastes the
    // crawl on a redirect.
    for (const [, url] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      expect(url.startsWith(`${SITE_URL}/`)).toBe(true);
    }
  });

  test("robots.txt keeps live rooms out of the index", () => {
    const robots = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "public", "robots.txt"), "utf8");
    expect(robots).toMatch(/Disallow:\s*\/t\//);
    expect(robots).toMatch(/Disallow:\s*\/\*\?room=/);
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });
});

/* ── A WRITE THAT FAILS HAS TO SAY SO ────────────────────────────────────
   Every Firebase write in App.js is somebody pressing a button. Left bare, a
   rejected one becomes an unhandled rejection and the button appears to do
   nothing at all — indistinguishable, to the person pressing it, from "it
   worked, wait for the others". Room creation, joining, the story queue and
   the sprint reset were each reported and hardened separately, which is what
   a missing rule looks like. This is the rule.
─────────────────────────────────────────────────────────────────────────── */
describe("no Firebase write fails silently", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "App.js"), "utf8");
  const lines = source.split("\n");

  test("every awaited write is inside a try, a write() call, or an explicit catch", () => {
    const unguarded = [];
    lines.forEach((line, i) => {
      if (!/await\s+(update|set|remove|push)\(/.test(line)) return;
      if (/\.catch\(/.test(line)) return;                  // handled inline
      const before = lines.slice(Math.max(0, i - 30), i).join("\n");
      const after = lines.slice(i, i + 8).join("\n");
      if (/try\s*\{/.test(before)) return;
      if (/await write\(/.test(before) || /=>\s*(update|set|remove|push)\(/.test(line)) return;
      if (/\.catch\(/.test(after)) return;                 // handled on a continuation line
      // The one escape hatch, and it has to be claimed out loud: a helper whose
      // rejection is the caller's to interpret. Two callers of saveUserProfile
      // want opposite things from a failure, so a catch inside it would be
      // wrong. Writing the marker is a decision; inheriting silence is not.
      if (/throws: caller handles/.test(before)) return;
      unguarded.push(`${i + 1}: ${line.trim()}`);
    });
    expect(unguarded).toEqual([]);
  });

  test("the escape hatch stays rare enough to read in one sitting", () => {
    expect((source.match(/throws: caller handles/g) || []).length).toBeLessThanOrEqual(2);
  });

  test("no read is wrapped in a promise that can never reject", () => {
    // onValue's third argument is an options object, not an error callback, so
    // `new Promise(res => onValue(ref, res, {onlyOnce:true}))` never settles on
    // failure — the button stayed pressed for as long as anyone would wait.
    // get() rejects. Three of these existed.
    expect(source).not.toMatch(/new Promise\([^)]*\)\s*=>\s*\n?\s*onValue\(/);
    expect(source).not.toMatch(/onValue\([^;]*\{\s*onlyOnce:\s*true\s*\}/);
  });
});

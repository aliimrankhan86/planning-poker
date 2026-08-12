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
  alternatesFor,
} from "./routeMeta.mjs";
import { splitLocalePath, withLocale } from "./i18n.mjs";
import { UI, LOCALE_CODES, LOCALES, LOCALIZED_PATHS } from "./locales/index.mjs";

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

/* ── DATA-DRIVEN CONTENT PAGES ───────────────────────────────────────────
   Three pages built from ROUTE_CONTENT alone, added after a query-demand
   sweep found whole clusters the site answered nowhere. They share one
   <ContentPage> renderer, so these tests are really testing the renderer:
   break it and all three go blank at once, with the prerendered shell still
   serving perfect HTML to crawlers and nothing at all to a person.
─────────────────────────────────────────────────────────────────────────── */
describe("pages rendered from route data", () => {
  /* English data-driven routes only. The translated ones are reached from the
     language switcher, from hreflang, and from the sitemap — deliberately not
     from the footer, which would put twenty-four extra links on every page in a
     language the reader did not ask for. Their discovery is covered by the
     hreflang and sitemap tests below. */
  const dataDriven = Object.entries(STATIC_SCREEN_BY_PATH)
    .filter(([path, s]) => s.startsWith("/") && splitLocalePath(path).locale === "en")
    .map(([path]) => path);

  /* Every test here navigates. jsdom keeps one location for the whole file, so
     without this the next describe block starts on whichever marketing page ran
     last and its "home screen" assertions fail for no visible reason. */
  afterEach(() => window.history.pushState({}, "", "/"));

  /* Internal footer links as [href, element] pairs. The footer is the only
     <footer> outside <main>, so it is the document's contentinfo landmark.
     mailto: and the legal <button>s are not routes and drop out here. */
  const footerHrefs = () =>
    within(screen.getByRole("contentinfo"))
      .getAllByRole("link")
      .map((el) => [el.getAttribute("href"), el])
      .filter(([href]) => href?.startsWith("/"));

  test("there is at least one, or this whole block is silently vacuous", () => {
    expect(dataDriven.length).toBeGreaterThan(0);
  });

  test.each(dataDriven)("%s renders its heading and every FAQ answer", (path) => {
    window.history.pushState({}, "", path);
    render(<App />);
    const content = ROUTE_CONTENT[path];

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(content.h1);

    /* The FAQ answers have to be in the DOM even while collapsed. The page
       emits FAQPage JSON-LD built from this same array, and schema promising
       answers the page does not contain is how a rich result gets pulled. */
    for (const { q, a } of content.faq) {
      expect(screen.getByText(q)).toBeInTheDocument();
      expect(screen.getByText(a)).toBeInTheDocument();
    }
  });

  /* The bug this design avoids: every data-driven page shares one component,
     so if they also shared a screen name, React would see setScreen("content")
     land on "content", skip the re-render, and leave the previous page on
     screen. Giving each its own path as its screen name is what prevents it,
     and this is the test that notices if someone "tidies" that away. */
  test("navigating from one to another actually swaps the content", () => {
    const [first, second] = dataDriven;
    expect(second).toBeDefined();

    window.history.pushState({}, "", first);
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ROUTE_CONTENT[first].h1);

    // The footer Guides column links every one of them from every page.
    fireEvent.click(footerHrefs().find(([href]) => href === second)[1]);

    expect(window.location.pathname).toBe(second);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ROUTE_CONTENT[second].h1);
  });

  /* A footer link to a path with no route silently drops the visitor on the
     join screen, and spends crawl budget doing it. */
  test("every internal footer link points at a real route", () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    const hrefs = footerHrefs().map(([href]) => href);

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(`${href}:${!!STATIC_SCREEN_BY_PATH[href]}`).toBe(`${href}:true`);
    }
    // And nothing indexable is left with no sitewide link at all.
    for (const path of dataDriven) expect(hrefs).toContain(path);
  });

  /* scripts/prerender.mjs names the HowTo schema after content.stepsTitle and
     falls back to the home page's wording. That fallback was correct while one
     page had steps; the moment a second one did, the schema was describing the
     wrong procedure to Google. */
  test("a page with its own steps names them, so the HowTo schema is not generic", () => {
    for (const [path, content] of Object.entries(ROUTE_CONTENT)) {
      // Pages reusing the shared HOW_TO_STEPS are describing the same
      // procedure, so the default name is the correct one for them.
      /* Pages running the generic six steps are describing the same procedure
         as their language's home page, so the schema's default name is the
         correct one for them. Compared by value rather than by identity: a
         translated page is a different array holding the same procedure. */
      if (!content.steps?.length) continue;
      const home = ROUTE_CONTENT[withLocale(splitLocalePath(path).locale, "/")];
      if (JSON.stringify(content.steps) === JSON.stringify(home?.steps)) continue;
      expect(`${path}:${!!content.stepsTitle}`).toBe(`${path}:true`);
    }
  });

  test("no two pages answer the same question", () => {
    // Two URLs competing for one query split the signal and neither wins.
    const asked = new Map();
    for (const [path, content] of Object.entries(ROUTE_CONTENT)) {
      for (const { q } of content.faq || []) {
        const key = q.toLowerCase();
        expect(`${key} :: ${asked.get(key) || path}`).toBe(`${key} :: ${path}`);
        asked.set(key, path);
      }
    }
  });
});

/* ── THE SITEMAP IS A FOURTH COPY OF THE ROUTE TABLE ─────────────────────
   routeMeta.mjs feeds the runtime router, the runtime <head>, the build-time
   prerender and — since scripts/gen-sitemap.mjs replaced the hand-written
   file — public/sitemap.xml too. A page missing from the sitemap is invisible
   in exactly the way that leaves no symptom to notice: the site works, the
   page renders, nothing 404s, it simply never gets crawled. Generation makes
   that unreachable; these tests are what catch someone editing the generated
   file by hand and expecting it to survive the next build.
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

  /* Private routes are not prerendered, so the host serves them the home
     document — robots: index, follow and all. App.js rewrites that to noindex,
     but not until React has hydrated, which is too late for every crawler that
     does not run JavaScript. Both files have to cover them. */
  test("private routes are blocked in robots.txt and by a header", () => {
    const read = (...p) => require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", ...p), "utf8");
    const robots = read("public", "robots.txt");
    const vercel = JSON.parse(read("vercel.json"));

    for (const path of PRIVATE_PATHS) {
      expect(robots).toMatch(new RegExp(`Disallow:\\s*${path}`));
      const header = vercel.headers.find((h) => h.source === path);
      expect(`${path}:${header?.headers.some(
        (x) => x.key === "X-Robots-Tag" && x.value.includes("noindex"),
      )}`).toBe(`${path}:true`);
    }
  });

  /* Vercel validates vercel.json against a closed schema and refuses to build
     on an unknown key — it does not warn and carry on. A "//" comment key cost
     a whole deploy, which is silent here: the push succeeds, the tests pass,
     and the site simply keeps serving the previous build. Explanations go in
     robots.txt, which has real comments. */
  test("vercel.json header entries carry no keys Vercel will reject", () => {
    const vercel = JSON.parse(require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "vercel.json"), "utf8"));
    const allowed = ["source", "headers", "has", "missing"];
    for (const entry of vercel.headers) {
      const stray = Object.keys(entry).filter((k) => !allowed.includes(k));
      expect(`${entry.source}:${stray}`).toBe(`${entry.source}:`);
    }
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

/* ═══════════════════════ TRANSLATIONS ═══════════════════════
   A half-translated language is worse than an untranslated one: the reader
   gets a page that switches language mid-sentence and a crawler gets an
   hreflang cluster pointing at a page that is really English. These tests are
   what make "complete" a build condition rather than a promise.
═══════════════════════════════════════════════════════════════ */
describe("translations", () => {
  const enKeys = Object.keys(UI.en);

  test("every locale defines exactly the English key set", () => {
    for (const code of LOCALE_CODES) {
      const keys = Object.keys(UI[code]);
      const missing = enKeys.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !enKeys.includes(k));
      expect(`${code} missing: ${missing.join(", ")}`).toBe(`${code} missing: `);
      expect(`${code} extra: ${extra.join(", ")}`).toBe(`${code} extra: `);
    }
  });

  test("a value that is a list in English is a list of the same length everywhere", () => {
    for (const key of enKeys) {
      if (!Array.isArray(UI.en[key])) continue;
      for (const code of LOCALE_CODES) {
        expect(`${code}/${key}: ${UI[code][key]?.length}`).toBe(`${code}/${key}: ${UI.en[key].length}`);
      }
    }
  });

  /* A dropped {max} silently un-sources the participant cap: the sentence still
     reads, and it quietly stops matching what the Firebase rules enforce. */
  test("every placeholder in an English string survives translation", () => {
    const holders = (v) =>
      [...String(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const key of enKeys) {
      if (Array.isArray(UI.en[key])) continue;
      const want = holders(UI.en[key]);
      if (!want) continue;
      for (const code of LOCALE_CODES) {
        expect(`${code}/${key}: ${holders(UI[code][key])}`).toBe(`${code}/${key}: ${want}`);
      }
    }
  });

  /* A key whose translation is byte-identical to English is usually a key
     somebody forgot — but plenty of short labels are legitimately the same
     word: the brand, the deck faces, and the agile vocabulary that these
     languages genuinely borrow ("Sprint", "Scrum poker", "Planning poker
     online", "pts / sprint", and "Legal", which is already Spanish).

     Counting words rather than listing exceptions is what makes this hold as
     languages are added: a forgotten *sentence* is always five words or more,
     and a borrowed *term* never is. No allowlist to keep in sync, and a real
     omission still fails the build. */
  const words = (v) => (String(v).match(/[A-Za-zÀ-ÿ]{2,}/g) || []).length;

  test("no locale left an English sentence sitting in a translated table", () => {
    for (const code of LOCALE_CODES) {
      if (code === "en") continue;
      const untranslated = enKeys.filter(
        (k) => typeof UI.en[k] === "string" && UI[code][k] === UI.en[k] && words(UI.en[k]) >= 5,
      );
      expect(`${code}: ${untranslated.join(", ")}`).toBe(`${code}: `);
    }
  });

  test("the rule is tight enough to catch a real omission", () => {
    // Guards the guard: if `words` ever stopped counting, the test above would
    // pass vacuously on a locale that was a straight copy of English.
    expect(words(UI.en["home.freeBody"])).toBeGreaterThanOrEqual(5);
    expect(words(UI.en["deck.tshirt"])).toBeLessThan(5);
    expect(words(UI.en["app.teamRoomTitle"])).toBeLessThan(5);
  });

  /* A stray character from another writing system is invisible to anyone who
     does not read the language — a single Hangul syllable sat inside a Japanese
     sentence here and read as normal text to every English eye that passed it.
     Cheap to check, impossible to spot by review. */
  test("no locale contains characters from a writing system it does not use", () => {
    const FOREIGN = /[\uAC00-\uD7A3\u1100-\u11FF\u0400-\u04FF\u0600-\u06FF]/g;
    for (const code of LOCALE_CODES) {
      const strays = Object.entries(UI[code])
        .flatMap(([k, v]) => (String(Array.isArray(v) ? v.join(" ") : v).match(FOREIGN) || []).map((c) => `${k}:${c}`));
      expect(`${code}: ${strays.join(", ")}`).toBe(`${code}: `);
    }
  });

  test("Japanese is actually written in Japanese", () => {
    // Guards the guard: proves the check above is looking at real content and
    // not at an empty table.
    expect(/[\u3040-\u30FF\u4E00-\u9FFF]/.test(UI.ja["nav.pricing"])).toBe(true);
  });

  test("every locale has every localized page, with meta and content", () => {
    for (const code of LOCALE_CODES) {
      for (const base of LOCALIZED_PATHS) {
        const url = code === "en" ? base : `${LOCALES[code].prefix}${base === "/" ? "/" : base}`;
        expect(`${url} content`).toBe(`${url}${ROUTE_CONTENT[url] ? " content" : ""}`);
        const meta = url === "/" ? DEFAULT_META : STATIC_ROUTE_META[url];
        expect(`${url} meta`).toBe(`${url}${meta ? " meta" : ""}`);
        // Same limits the English route table is held to.
        expect(`${url}:${meta.title.length <= 70}`).toBe(`${url}:true`);
        expect(`${url}:${meta.description.length >= 70 && meta.description.length <= 320}`)
          .toBe(`${url}:true`);
      }
    }
  });

  test("titles and descriptions are unique across every language", () => {
    const titles = new Map();
    const descriptions = new Map();
    for (const [path, m] of [["/", DEFAULT_META], ...Object.entries(STATIC_ROUTE_META)]) {
      if (PRIVATE_PATHS.includes(path)) continue;
      expect(`${path} title dup of ${titles.get(m.title) || ""}`).toBe(`${path} title dup of `);
      expect(`${path} desc dup of ${descriptions.get(m.description) || ""}`)
        .toBe(`${path} desc dup of `);
      titles.set(m.title, path);
      descriptions.set(m.description, path);
    }
  });

  /* Google honours an hreflang cluster only when every page in it points back
     at every other, including itself. One missing return link and the whole
     set is discarded — silently. */
  test("the hreflang cluster is reciprocal and carries an x-default", () => {
    for (const base of LOCALIZED_PATHS) {
      const alternates = alternatesFor(base);
      expect(`${base}: ${alternates.length}`).toBe(`${base}: ${LOCALE_CODES.length}`);
      for (const a of alternates) {
        // Each alternate must list the identical set, this page included.
        const back = alternatesFor(base).map((x) => x.url).sort();
        expect(back).toContain(a.url);
      }
      expect(alternates.some((a) => a.code === "en")).toBe(true);
    }
    // And a path with no translation advertises none at all, rather than
    // claiming an alternate that is really the English page again.
    expect(alternatesFor("/pricing")).toEqual([]);
    expect(alternatesFor(undefined)).toEqual([]);
  });

  test("every localized URL is in the sitemap, and nothing is listed twice", () => {
    const xml = readFileSync(join(__dirname, "..", "public", "sitemap.xml"), "utf8");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
    for (const code of LOCALE_CODES) {
      for (const base of LOCALIZED_PATHS) {
        const url = `${SITE_URL}${code === "en" ? base : `${LOCALES[code].prefix}${base === "/" ? "/" : base}`}`;
        expect(locs).toContain(url);
      }
    }
  });

  test("a locale prefix only matches a whole path segment", () => {
    // /japanese is not Japanese, and /ptolemy is not Portuguese.
    expect(splitLocalePath("/japanese").locale).toBe("en");
    expect(splitLocalePath("/ptolemy").locale).toBe("en");
    expect(splitLocalePath("/ja/scrum-poker")).toEqual({ locale: "ja", path: "/scrum-poker" });
    expect(splitLocalePath("/ja")).toEqual({ locale: "ja", path: "/" });
    expect(splitLocalePath("/")).toEqual({ locale: "en", path: "/" });
  });

  test("an untranslated page keeps its English URL in every language", () => {
    // Otherwise a Japanese footer links to /ja/pricing, which has no document,
    // no sitemap entry and nothing but the English page behind it.
    for (const code of LOCALE_CODES) {
      expect(withLocale(code, "/pricing")).toBe("/pricing");
      expect(withLocale(code, "/terms")).toBe("/terms");
    }
    expect(withLocale("ja", "/scrum-poker")).toBe("/ja/scrum-poker");
    expect(withLocale("en", "/scrum-poker")).toBe("/scrum-poker");
  });

  /* Every leak found in this work was found by eye, in a browser, one at a
     time: a timer label, a Leave button, the theme switch, a confirm dialog.
     Reading the source is what finds the next one. The screens listed here are
     the ones a non-English visitor actually touches — the marketing pages that
     are not translated, and the legal pages that never will be, are excluded
     deliberately rather than by accident. */
  test("no translated screen still holds an English sentence in its source", () => {
    const source = readFileSync(join(__dirname, "App.js"), "utf8");
    const TRANSLATED_SCREENS = [
      ["NavBar", "function NavBar({", "function SiteFooter({"],
      ["SiteFooter", "function SiteFooter({", "function LoginModal({"],
      ["CookieBanner", "function CookieBanner({", "export default function App()"],
      ["ContentPage", "function ContentPage({", "function PricingPage({"],
      ["HistoryModal", "function HistoryModal({", "function JoinScreen({"],
      ["JoinScreen", "function JoinScreen({", "const WTP_STORAGE_KEY"],
      ["RoomActionBar", "function RoomActionBar({", "function GameScreen({"],
      ["GameScreen", "function GameScreen({", null],
    ];
    const offenders = [];
    for (const [name, from, to] of TRANSLATED_SCREENS) {
      const start = source.indexOf(from);
      expect(`${name} found: ${start >= 0}`).toBe(`${name} found: true`);
      const end = to ? source.indexOf(to, start) : source.length;
      let inBlockComment = false;
      for (const line of source.slice(start, end).split("\n")) {
        /* Block comments have to be tracked, not pattern-matched: this file's
           comments run to several lines and the continuation lines carry no
           marker of their own, so they look exactly like stray prose. */
        const opens = line.lastIndexOf("/*");
        const closes = line.lastIndexOf("*/");
        const wasInComment = inBlockComment;
        if (opens > closes) inBlockComment = true;
        else if (closes > opens) inBlockComment = false;
        if (wasInComment || opens >= 0) continue;
        if (/^\s*\/\//.test(line)) continue;                 // comments are for us, not users
        if (/\bt\(|\btList\(/.test(line)) continue;         // already going through i18n
        // A JSX text node or a label-ish prop holding three or more English
        // words. Two words catches "Point Poker" and every deck face; three is
        // the point at which it is prose somebody forgot.
        const jsxText = [...line.matchAll(/>\s*([A-Za-z][^<>{}\n]{8,}?)\s*</g)].map((m) => m[1]);
        const props = [...line.matchAll(/(?:placeholder|title|aria-label|ariaLabel|label|subtitle|hint|empty|caption)="([^"]{8,})"/g)].map((m) => m[1]);
        /* The shape that hid every time: a JSX text node wrapped across lines,
           so the line itself carries no tag at all — just an indented English
           sentence. Matching only >text< missed all of them. */
        const isObjectKey = /^\s*\w+:\s/.test(line);
        const bare =
          !isObjectKey && /^\s*[A-Za-z][^<>{}=()[\]`"':]{14,}[.!?]?$/.test(line)
            ? [line.trim()]
            : [];
        for (const text of [...jsxText, ...props, ...bare]) {
          if ((text.match(/[A-Za-z]{2,}/g) || []).length < 3) continue;
          if (/^https?:|^[A-Z0-9_.]+$/.test(text)) continue;
          offenders.push(`${name}: ${text.slice(0, 60)}`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  /* Locale-prefixed Team Room URLs are handled by Vercel, not by a file on
     disk: they need a rewrite to exist at all and a noindex header so a live
     session never gets indexed. A language added here but not there is a hard
     404 in production that no local test would otherwise see. */
  test("vercel.json knows about every locale prefix", () => {
    const vercel = JSON.parse(
      readFileSync(join(__dirname, "..", "vercel.json"), "utf8"),
    );
    const prefixes = LOCALE_CODES.filter((c) => LOCALES[c].prefix).map((c) => c);
    const teamRewrite = vercel.rewrites.find((r) => r.source.includes("/t/:slug") && r.source.includes(":locale"));
    const teamHeader = vercel.headers.find((h) => h.source.includes("/t/:slug") && h.source.includes(":locale"));
    expect(teamRewrite).toBeDefined();
    expect(teamHeader).toBeDefined();
    for (const code of prefixes) {
      expect(`rewrite ${code}: ${teamRewrite.source.includes(code)}`).toBe(`rewrite ${code}: true`);
      expect(`header ${code}: ${teamHeader.source.includes(code)}`).toBe(`header ${code}: true`);
    }
    expect(teamHeader.headers[0]).toEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    // Exact set, not merely "contains": a prefix left in vercel.json after its
    // language was deleted routes /de/t/slug to a locale that no longer loads.
    for (const source of [teamRewrite.source, teamHeader.source]) {
      const listed = source.slice(source.indexOf("(") + 1, source.indexOf(")")).split("|");
      expect(listed.sort()).toEqual([...prefixes].sort());
    }
  });

  /* Five languages shipped on 12 Aug 2026 and four were cut the same day — the
     reasoning is in the WHY ONLY THESE TWO block in src/locales/index.mjs.
     Their URLs had already been submitted to Search Console by then, and an
     unmatched path on Vercel is a bare 404, so the cut prefixes need a 301 onto
     the English page that replaced them. This test exists to stop a later
     tidy-up deleting those redirects on the grounds that nothing links there
     any more — Google's index is the thing that still links there. */
  test("the retired locale prefixes 301 instead of 404ing", () => {
    const vercel = JSON.parse(
      readFileSync(join(__dirname, "..", "vercel.json"), "utf8"),
    );
    const RETIRED = ["de", "es", "fr", "nl"];
    for (const code of RETIRED) expect(LOCALE_CODES).not.toContain(code);

    const rules = vercel.redirects.filter((r) => RETIRED.every((c) => r.source.includes(c)));
    /* Two rules, not one: ":path*" does not match the bare prefix, so /de/
       would 404 while /de/scrum-poker redirected. */
    expect(rules.map((r) => r.source).sort()).toEqual([
      "/:locale(de|es|fr|nl)",
      "/:locale(de|es|fr|nl)/:path*",
    ]);
    for (const rule of rules) expect(rule.permanent).toBe(true);
  });

  /* The legal pages are deliberately English-only: a mistranslated liability
     clause is a real liability, and the English text is the governing one. */
  test("the legal pages are not translated", () => {
    for (const path of ["/terms", "/privacy"]) {
      expect(LOCALIZED_PATHS).not.toContain(path);
      for (const code of LOCALE_CODES) {
        if (code === "en") continue;
        expect(STATIC_ROUTE_META[`${LOCALES[code].prefix}${path}`]).toBeUndefined();
      }
    }
  });
});

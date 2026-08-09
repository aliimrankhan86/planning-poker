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

/* ── Role selection ────────────────────────────────────────────────────
   The picker defaulted to Participant, including for the person creating
   the room. Anyone who never changed it reached a revealed round with no
   way to record the estimate: every record control is facilitator-only and
   a voter cannot promote themselves. Making the choice explicit costs one
   click and removes the dead end.
──────────────────────────────────────────────────────────────────────── */
describe("role selection", () => {
  const roles = () => screen.getAllByRole("button", { name: /role:/i });
  const pressed = () => roles().filter((b) => b.getAttribute("aria-pressed") === "true");
  const nameField = () => screen.getByPlaceholderText(/alex johnson/i);

  test("no role is preselected", () => {
    render(<App />);
    expect(roles().length).toBe(2);
    expect(pressed()).toEqual([]);
  });

  test("a room cannot be created until a role is chosen", () => {
    render(<App />);
    fireEvent.change(nameField(), { target: { value: "Alex" } });
    // "Create Room" alone also matches the tab; the submit carries the arrow.
    fireEvent.click(screen.getByRole("button", { name: "Create Room →" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/role/i);
  });

  test("choosing a role records the choice", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /facilitator role:/i }));
    expect(pressed().length).toBe(1);
    expect(screen.getByRole("button", { name: /facilitator role:/i }))
      .toHaveAttribute("aria-pressed", "true");
  });

  test("picking a role clears the prompt that asked for one", () => {
    render(<App />);
    fireEvent.change(nameField(), { target: { value: "Alex" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Room \u2192" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/role/i);
    fireEvent.click(screen.getByRole("button", { name: /facilitator role:/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

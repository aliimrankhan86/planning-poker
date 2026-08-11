import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import AppErrorBoundary from "./AppErrorBoundary";

/* The one component whose job is to work on the day everything else does not.
   Untested, a typo in getDerivedStateFromError would be invisible until the
   exact moment it was needed, which is the worst possible moment to find out. */

const Boom = () => {
  throw new Error("render exploded");
};

// React logs caught render errors to console.error by design; so does the
// boundary itself. Silencing it keeps a passing run readable, and asserting on
// the call is how we know the error still reaches a place someone can see it.
let errorLog;
beforeEach(() => {
  errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorLog.mockRestore();
});

test("children render untouched when nothing throws", () => {
  render(
    <AppErrorBoundary>
      <p>the actual app</p>
    </AppErrorBoundary>,
  );
  expect(screen.getByText("the actual app")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a throwing child becomes a message instead of a blank page", () => {
  render(
    <AppErrorBoundary>
      <Boom />
    </AppErrorBoundary>,
  );
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent(/something went wrong/i);
  // The white page's real cost is that it offers nothing to do next.
  expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
});

test("the error still reaches the console for whoever is debugging it", () => {
  render(
    <AppErrorBoundary>
      <Boom />
    </AppErrorBoundary>,
  );
  expect(errorLog).toHaveBeenCalledWith(
    "[pointpoker] render failed",
    expect.objectContaining({ message: "render exploded" }),
    expect.anything(),
  );
});

test("it says the room outlived the tab, because it did", () => {
  // Someone whose room screen just died needs to know whether they have lost
  // the session. They have not: the room is in Firebase, and reloading rejoins
  // it — myId is in sessionStorage and survives.
  render(
    <AppErrorBoundary>
      <Boom />
    </AppErrorBoundary>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(/room lives on the server/i);
});

test("it paints from the pre-paint variables, not the design system", () => {
  // The stylesheet is exactly the thing that might have failed. These four
  // variables are set in a <style> block inside index.html's <head> and follow
  // the chosen theme, so they are the only colours safe to reach for here.
  const source = readFileSync(join(__dirname, "AppErrorBoundary.js"), "utf8");
  const indexHtml = readFileSync(join(__dirname, "..", "public", "index.html"), "utf8");
  const used = [...source.matchAll(/var\((--boot-[a-z0-9-]+)\)/g)].map(([, v]) => v);

  expect(used.length).toBeGreaterThan(0);
  for (const name of new Set(used)) expect(indexHtml).toContain(`${name}:`);
  expect(source).not.toMatch(/className=/);
});

test("the app is actually wrapped in it", () => {
  // The boundary can be perfect and still catch nothing.
  const entry = readFileSync(join(__dirname, "index.js"), "utf8");
  expect(entry).toMatch(/<AppErrorBoundary>\s*<App \/>\s*<\/AppErrorBoundary>/);
});

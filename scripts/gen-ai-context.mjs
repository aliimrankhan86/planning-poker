/* ═══════════════════ SELF-UPDATING AI CONTEXT ═══════════════════
   Writes docs/AI-CONTEXT.md by reading the codebase, so the notes an AI
   agent reads on session start can never drift from the code.

   Everything in the generated file is derived, never hand-typed:
   route table, analytics events, product constants, file sizes, npm
   scripts, Firebase rule shape, test count. Prose that genuinely needs a
   human lives in docs/AI-CONTEXT.hand.md and is spliced in verbatim.

   Runs automatically:
     • npm run build            (before the CRA build)
     • .githooks/pre-commit     (so a commit never ships stale docs)
   Or on demand:  npm run docs
════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(p, "utf8");
const kb = (p) => `${Math.round(statSync(p).size / 1024)} KB`;

const app = read("src/App.js");
const routeMeta = read("src/routeMeta.mjs");
const pkg = JSON.parse(read("package.json"));
const rules = JSON.parse(read("database.rules.json").replace(/(^|\s)\/\/.*$/gm, ""));

/* ── derive ───────────────────────────────────────────────────────── */

const grab = (src, re) => [...src.matchAll(re)].map((m) => m[1]);

const routes = grab(routeMeta, /^\s{2}"(\/[^"]*)":\s"/gm);
const privatePaths = grab(routeMeta, /export const PRIVATE_PATHS = \[([^\]]*)\]/g)
  .flatMap((s) => s.split(",").map((x) => x.trim().replace(/"/g, "")))
  .filter(Boolean);
const events = [...new Set([
  ...grab(app, /track\("([a-z0-9_]+)"\)/g),
  ...grab(app, /trackOnce\("([a-z0-9_]+)"/g),
  ...grab(app, /\{ key: "(wtp_[a-z0-9]+)"/g),
])].sort();
const bucketEvents = [...new Set(grab(app, /"(table_[a-z0-9_]+|session_[a-z0-9_]+)"/g))].sort();
const maxParticipants = (routeMeta.match(/MAX_PARTICIPANTS = (\d+)/) || [])[1];
const deckBlock = app.slice(
  app.indexOf("const DECK_DEFINITIONS = {"),
  app.indexOf("const DECK_KEYS =", app.indexOf("const DECK_DEFINITIONS = {")),
);
const decks = grab(deckBlock, /^\s{2}([a-z]+):\s*\{/gm);
const components = grab(app, /^function ([A-Z]\w+)\(/gm);
if (!maxParticipants) {
  throw new Error("Could not derive MAX_PARTICIPANTS for docs/AI-CONTEXT.md.");
}
if (!decks.length) {
  throw new Error("Could not derive card decks for docs/AI-CONTEXT.md.");
}
/* One level deep, because the design system keeps its tests beside itself. A
   flat readdir here silently under-reported the suite the moment src/ grew a
   subdirectory. */
const testFiles = readdirSync("src", { withFileTypes: true }).flatMap((e) =>
  e.isDirectory()
    ? readdirSync(join("src", e.name))
        .filter((f) => f.endsWith(".test.js"))
        .map((f) => join(e.name, f))
    : e.name.endsWith(".test.js")
      ? [e.name]
      : [],
);
const testCount = testFiles
  .map((f) => (read(join("src", f)).match(/^\s*test\(/gm) || []).length)
  .reduce((a, b) => a + b, 0);
const topLevelRuleNodes = Object.keys(rules.rules).filter((k) => !k.startsWith("."));
const analyticsRead = rules.rules.analytics?.[".read"] || "(none)";
const ruleAssertions = existsSync("scripts/rules-test.mjs")
  ? (read("scripts/rules-test.mjs").match(/^await (allow|deny)\(/gm) || []).length
  : 0;

/* Design system health. These three numbers are why the token layer exists:
   before it there were 18 button classes, 65 font sizes and 86 padding pairs.
   Regenerating them on every build means the docs show the real figure, so
   drift is visible in a diff rather than discovered a year later. */
const cssBlock = app.slice(app.indexOf("const CSS = `"), app.indexOf("`;", app.indexOf("const CSS = `")));
const uniq = (re, src = cssBlock) => new Set(src.match(re) || []).size;
/* Tokens live in the design system now, not in App.js's :root. App.js must not
   redeclare them — its <style> renders from the body and would win over the
   imported sheet, pinning the app to one theme. */
const dsTokens = read("src/design-system/tokens.css");
const dsIcons = read("src/design-system/icons.js");
const designStats = {
  fontSizes: uniq(/font-size: *[0-9.]+(?:rem|px)/g),
  paddingPairs: uniq(/padding: *[0-9]+px [0-9]+px/g),
  buttonClasses: uniq(/^\.[a-z][a-z0-9-]*(?:btn|button)[a-z0-9-]*/gm),
  tokens: uniq(/^ {2}--[a-z0-9-]+:/gm, dsTokens),
  themedRoles: new Set(
    (dsTokens.slice(dsTokens.indexOf('[data-theme="light"] {')).match(/^ {2}--[a-z0-9-]+:/gm) || []),
  ).size,
  icons: (dsIcons.match(/^ {2}[a-zA-Z]+: "[Mm][^"]+",$/gm) || []).length,
  rawHexInApp: uniq(/(?<![-\w])color: *#[0-9a-fA-F]{3,8}/g),
};

const hand = existsSync("docs/AI-CONTEXT.hand.md")
  ? read("docs/AI-CONTEXT.hand.md")
  : "_(no hand-written notes yet: create docs/AI-CONTEXT.hand.md)_";

const list = (arr, per = 4) => {
  const rows = [];
  for (let i = 0; i < arr.length; i += per) rows.push(`| ${arr.slice(i, i + per).join(" | ").padEnd(1)} |`);
  return rows.join("\n");
};

/* ── write ────────────────────────────────────────────────────────── */

const out = `<!-- ════════════════════════════════════════════════════════════════
     GENERATED FILE. DO NOT EDIT BY HAND.

     Regenerate:  npm run docs
     Source:      scripts/gen-ai-context.mjs
     Hand-written prose belongs in docs/AI-CONTEXT.hand.md, which is
     spliced in at the bottom of this file untouched.
     ════════════════════════════════════════════════════════════════ -->

# Point Poker: context for AI agents

Free planning poker for agile teams. React SPA, Firebase Realtime Database, hosted on Vercel.

**Read this file first. It is regenerated from the code on every build and commit, so it cannot be out of date.**

## The one-paragraph version

Someone opens the site, types a name, and gets a room in about ten seconds. They paste the
link into their team chat. Everyone picks a card privately, all cards flip at once, and the
facilitator records the agreed number and moves to the next story. No account, no payment,
no ads. An optional free account reserves two permanent room URLs and stores sprint history.

## Where things live

| File | What it is | Size |
|---|---|---|
| \`src/App.js\` | The entire app: CSS string, all components, all Firebase logic | ${kb("src/App.js")} |
| \`src/routeMeta.mjs\` | Route table, SEO metadata, prerendered content. Read by the app **and** the build | ${kb("src/routeMeta.mjs")} |
| \`src/AdminDashboard.js\` | Owner-only usage dashboard, lazy-loaded so users never download it | ${kb("src/AdminDashboard.js")} |
| \`src/design-system/tokens.css\` | Every colour, size, radius, shadow and duration. Dark on \`:root\`, light under \`[data-theme="light"]\` | ${kb("src/design-system/tokens.css")} |
| \`src/design-system/components.css\` | The \`pp-\` component classes | ${kb("src/design-system/components.css")} |
| \`src/design-system/index.js\` | The React components. Import from here | ${kb("src/design-system/index.js")} |
| \`src/design-system/README.md\` | The rulebook: theming, the ten rules, the decision table | ${kb("src/design-system/README.md")} |
| \`scripts/prerender.mjs\` | Writes one real HTML file per route after the CRA build | ${kb("scripts/prerender.mjs")} |
| \`scripts/build-rules.mjs\` | Strips comments from the Firebase rules to make the console-pasteable copy | ${kb("scripts/build-rules.mjs")} |
| \`scripts/gen-ai-context.mjs\` | Generates this file | ${kb("scripts/gen-ai-context.mjs")} |
| \`database.rules.json\` | Firebase rules, with comments. **Source of truth.** | ${kb("database.rules.json")} |
| \`database.rules.publish.json\` | Generated. This is what gets pasted into the Firebase console | ${kb("database.rules.publish.json")} |

\`src/App.js\` is one big file on purpose. It keeps deployment trivial for a solo maintainer.
Do not split it without a reason that outweighs that.

## Product facts

- **Everything is free.** There is no paid tier, no Stripe, no licence keys. Any code or copy
  implying otherwise is a bug.
- **Room capacity: ${maxParticipants} people**, facilitators included. One constant,
  \`MAX_PARTICIPANTS\` in \`src/routeMeta.mjs\`, used by both the enforcement and the marketing copy.
- **Card decks:** ${decks.join(", ")}.
- **An account is needed only to host a Team Room** (the URL slug is derived from the account
  name, so without one two different teams could collide on the same room) and to keep sprint
  history. Joining any room, including a Team Room someone shared, never needs an account.
- **Rooms are disposable.** Players marked offline for an hour are removed; rooms reach their
  hard session limit after five hours, and the scheduled reaper deletes expired one-off rooms
  or resets expired Team Rooms to a reusable shell.

## Routes (${routes.length})

${routes.map((r) => `- \`${r}\`${privatePaths.includes(r) ? "  (private, never indexed, never prerendered)" : ""}`).join("\n")}

Every public route is prerendered at build time with its own title, description, canonical,
Open Graph tags and JSON-LD. \`src/App.test.js\` fails if two routes ever share metadata.

## Analytics events (${events.length + bucketEvents.length})

Anonymous daily counters at \`/analytics/daily/{date}/{event}\`. Integers only: no user IDs,
no personal data, nothing that could identify a person or a room.

${list(events.map((e) => `\`${e}\``))}

Bucketed (one counter per band, so the dashboard stays chartable):

${list(bucketEvents.map((e) => `\`${e}\``))}

Add an event only when you can name the decision it changes. An unused counter is noise on
the dashboard, not free insight.

## Firebase shape

Top-level nodes: ${topLevelRuleNodes.map((n) => `\`${n}\``).join(", ")}.

Analytics read rule: \`${analyticsRead}\`

To grant yourself the dashboard, add \`/admins/<your-uid>: true\` by hand in the Firebase
console. No client can write to \`/admins\`, so nobody can promote themselves.

## Commands

${Object.entries(pkg.scripts).map(([k, v]) => `- \`npm run ${k}\` — \`${v}\``).join("\n")}

## Tests

\`npm test\` — ${testCount} test blocks across ${testFiles.join(", ")} (more cases
than that at runtime, because \`test.each\` expands). They cover the things
that break silently: the estimation maths (consensus, stats, slugs), SEO route metadata
uniqueness, and the dashboard arithmetic that business decisions rest on.

\`npm run test:rules\` — ${ruleAssertions} assertions against the real Firebase rules
engine in the emulator (needs JDK 21, which the script locates itself). The rules cannot
be checked by reading them and have to be deployed by hand, which is how two silent
outages happened. Run this after touching \`database.rules.json\`.

Run both before committing.

## Design system

Read \`src/design-system/README.md\` before writing any UI. The short version: use
a token, never a raw px or hex value; one primary action per screen; selection is
\`aria-pressed\`, never a class; icons from \`ICON_PATHS\`, never emoji.

**Dark is the default and needs no JavaScript** — the dark roles sit on \`:root\`, so
first paint, crawlers and a no-JS browser all get it. Light is opt-in via
\`[data-theme="light"]\`, set by \`ThemeToggle\` and remembered under \`pp-theme\`.
There is deliberately no \`prefers-color-scheme\` block: the theme never moves under
a user who did not ask. Components import from \`src/design-system\`; App.js's old
\`--bg\` / \`--gold\` names are aliases of the semantic roles, which is what made the
existing 10k-line file theme-aware without rewriting it.

| Measure | Now | Note |
|---|---|---|
| Design tokens | ${designStats.tokens} | Type, spacing, elevation, motion, semantic colour |
| Roles defined per theme | ${designStats.themedRoles} | Every one exists in both, or light falls back to a dark value |
| Icons in \`ICON_PATHS\` | ${designStats.icons} | One stroke family, \`currentColor\` |
| Distinct font sizes in CSS | ${designStats.fontSizes} | Target is the 8-step scale; the rest is unmigrated legacy |
| Distinct padding pairs | ${designStats.paddingPairs} | Target is the 4px grid |
| Legacy button classes in App.js | ${designStats.buttonClasses} | The button system is \`Button\` / \`.pp-btn\`; these are leftover skins |
| Raw hex text colours left in App.js | ${designStats.rawHexInApp} | All on a surface that is identical in both themes |

The bottom four are deliberately unflattering. They are the size of the remaining
migration, and they should fall over time, never rise.
\`src/designsystem.test.js\` guards the button system and the no-emoji rule;
\`src/design-system/design-system.test.js\` computes the actual WCAG contrast of
every semantic role in both themes and fails if one drops below AA.

## Components in App.js (${components.length})

${components.map((c) => `\`${c}\``).join(", ")}

---

${hand}
`;

mkdirSync("docs", { recursive: true });
writeFileSync("docs/AI-CONTEXT.md", out);
console.log(`docs/AI-CONTEXT.md regenerated (${routes.length} routes, ${events.length + bucketEvents.length} events, ${testCount} tests)`);

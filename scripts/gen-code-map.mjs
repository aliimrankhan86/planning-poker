/* ════════════════════════════════════════════════════════════════
   Writes docs/claude-project/CODE-MAP.md: every tracked source file,
   its size, and the top-level functions, components and constants it
   defines, with line numbers and the comment directly above each one.
   Also the Firebase database shape, read from the published rules.

   Why it exists: the Claude.ai "Point Poker" project syncs this repo
   from GitHub, and App.js is 8,500 lines. The map lets an assistant
   find where something lives before it reads the file.

   Run: node scripts/gen-code-map.mjs   (also in the pre-commit hook
   and `npm run docs`). Deterministic: no dates or hashes, so the file
   only changes when the code does.
   ════════════════════════════════════════════════════════════════ */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "docs/claude-project/CODE-MAP.md";

const tracked = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const files = tracked.filter(
  (f) =>
    /\.(js|mjs|css|json|py|html)$/.test(f) &&
    !f.includes("package-lock") &&
    !f.startsWith("public/fonts") &&
    !f.startsWith("docs/claude-project/") &&
    !f.startsWith(".claude/") &&
    f !== "public/manifest.json",
);

const DECL = [
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/,
  /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:\(|function|\w+\s*=>|React\.memo|memo\(|lazy\(|React\.lazy|\{|\[|`|"|new )/,
];

function commentAbove(lines, i) {
  const buf = [];
  for (let j = i - 1; j >= 0 && j > i - 25; j--) {
    const s = lines[j].trim();
    if (s.startsWith("//")) { buf.unshift(s.replace(/^\/+\s*/, "")); continue; }
    if (s.endsWith("*/") || s.startsWith("*") || s.startsWith("/*")) {
      buf.unshift(s.replace(/^\/?\*+\s?|\s*\*+\/?$/g, "").trim());
      if (s.startsWith("/*")) break;
      continue;
    }
    break;
  }
  const text = buf
    .filter((x) => x && !/^[─═\-=*\s]+$/.test(x))
    .join(" ")
    .replace(/[─═]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

const out = [];
out.push("# Point Poker: code map\n");
out.push(
  "Regenerated from the repository by `scripts/gen-code-map.mjs` on every commit (pre-commit hook) and by `npm run docs`. Do not edit by hand. " +
    "Every tracked source file, its size, and the top-level functions, components and constants it defines, with line numbers and the comment directly above each one. " +
    "Test files list their describe and test names. Use it to find where something lives before reading the file.\n",
);
out.push("## Files\n\n| File | Lines | Size |\n|---|---:|---:|");
for (const f of files) {
  const n = readFileSync(f, "utf8").split("\n").length;
  out.push(`| \`${f}\` | ${n} | ${Math.floor(statSync(f).size / 1024)} KB |`);
}
out.push("");

for (const f of files.filter((x) => /\.(js|mjs)$/.test(x))) {
  const lines = readFileSync(f, "utf8").split("\n");
  const items = [];
  const isTest = f.endsWith(".test.js");
  lines.forEach((l, i) => {
    if (isTest) {
      const m = l.match(/^\s*(describe|test|it)(?:\.each\([^)]*\))?\(\s*["'`](.+?)["'`]/);
      if (m) items.push(`- L${i + 1} ${m[1] === "describe" ? "" : "  "}${m[1]}: ${m[2].slice(0, 120)}`);
      return;
    }
    for (const re of DECL) {
      const m = l.match(re);
      if (m) {
        const why = commentAbove(lines, i);
        items.push(`- L${i + 1} \`${m[1]}\`${why ? `: ${why}` : ""}`);
        break;
      }
    }
  });
  if (!items.length) continue;
  out.push(`## \`${f}\`\n`);
  out.push(items.join("\n"));
  out.push("");
}

out.push("## Firebase Realtime Database shape\n");
out.push("From `database.rules.publish.json`. Rule keys in brackets.\n");
const rules = JSON.parse(readFileSync("database.rules.publish.json", "utf8"));
(function walk(node, path, depth) {
  if (!node || typeof node !== "object" || depth > 6) return;
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith(".")) continue;
    const p = `${path}/${k}`;
    const keys = v && typeof v === "object" ? Object.keys(v).filter((x) => x.startsWith(".")) : [];
    out.push(`${"  ".repeat(depth)}- \`${p}\`${keys.length ? ` (${keys.join(", ")})` : ""}`);
    walk(v, p, depth + 1);
  }
})(rules.rules || {}, "", 0);
out.push("");

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out.join("\n"));
console.log(`${OUT} regenerated (${files.length} files)`);

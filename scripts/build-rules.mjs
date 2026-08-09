// Strips comments from database.rules.json to produce the console-pasteable
// database.rules.publish.json. Run after editing the rules so the two cannot drift.
//   node scripts/build-rules.mjs
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("database.rules.json", "utf8");
const stripped = src
  .split("\n")
  .map((line) => line.replace(/(^|\s)\/\/.*$/, ""))
  .filter((line) => line.trim() !== "")
  .join("\n");

const parsed = JSON.parse(stripped); // throws loudly if the rules are malformed
writeFileSync("database.rules.publish.json", JSON.stringify(parsed, null, 2) + "\n");
console.log("database.rules.publish.json rebuilt");

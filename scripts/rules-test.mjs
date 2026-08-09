/* ═══════════════════ FIREBASE RULES TESTS ═══════════════════
   The rules are the only part of this product that cannot be checked by
   reading the code, cannot be exercised by the Jest suite, and have to be
   deployed by hand. They have caused two silent production outages:

     • a missing .parent() made every queued-story estimate fail
     • analytics read permission made every event write fail

   Both would have been caught by a single assertion. This file is that
   assertion, run against the real rules engine in the emulator.

   Run:  npm run test:rules
   The harness starts the emulator, runs this, and shuts it down.

   Everything here talks to the REST API with no auth token, so every request
   is evaluated exactly as an anonymous browser would be. Seeding also goes
   through the public rules, which means the setup itself is a test: if a
   legitimate room can no longer be created, the seed fails loudly.
═══════════════════════════════════════════════════════════════ */

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
const NS = process.env.RULES_TEST_NS || "demo-pointpoker-default-rtdb";
const url = (path) => `http://${HOST}/${path}.json?ns=${NS}`;

const put = async (path, value) => {
  const res = await fetch(url(path), { method: "PUT", body: JSON.stringify(value) });
  return res.ok;
};
const patch = async (path, value) => {
  const res = await fetch(url(path), { method: "PATCH", body: JSON.stringify(value) });
  return res.ok;
};
const canRead = async (path) => (await fetch(url(path))).ok;

let passed = 0;
const failures = [];
const expect = async (label, promise, want) => {
  const got = await promise;
  if (got === want) passed += 1;
  else failures.push(`${label}\n      expected ${want ? "ALLOW" : "DENY"}, got ${got ? "ALLOW" : "DENY"}`);
};
const allow = (label, p) => expect(label, p, true);
const deny = (label, p) => expect(label, p, false);

const room = (over = {}) => ({
  createdAt: Date.now(),
  revealed: false,
  round: 1,
  plan: "free",
  deck: "fibonacci",
  players: { p1: { id: "p1", name: "Ali", role: "voter", voted: false } },
  timer: { running: false, duration: 60, remaining: 60 },
  ...over,
});

const today = new Date().toISOString().slice(0, 10);

/* ── ROOMS ──────────────────────────────────────────────────────────── */

await allow("a guest can create a well-formed free room", put("rooms/ABC12", room()));
await deny("a room missing required fields is rejected", put("rooms/BAD01", { createdAt: 1 }));
await deny("a room cannot claim the removed paid tier", put("rooms/BAD02", room({ plan: "pro" })));
await deny("an unknown deck is rejected", put("rooms/BAD03", room({ deck: "tarot" })));
await deny("an unlisted top-level room field is rejected", put("rooms/BAD04", room({ isAdmin: true })));

/* The regression that shipped: rooms/$id/stories/$i/estimate looked up the
   deck two parents up instead of three, resolved stories/deck (null), and
   rejected every estimate a facilitator tried to record from the queue. */
await allow("a queued story accepts a valid estimate for the room's deck", put("rooms/ABC12/stories/0", { name: "Login page" }));
await allow("  …and recording that estimate succeeds", put("rooms/ABC12/stories/0/estimate", "8"));
await deny("  …but a value from a different deck does not", put("rooms/ABC12/stories/0/estimate", "XL"));
await deny("  …and neither does an arbitrary number", put("rooms/ABC12/stories/0/estimate", "7"));

await allow("the no-queue round path records an estimate too", put("rooms/ABC12/rounds/0", { estimate: "8", isConsensus: true }));

await allow("a player may cast a card from the room's deck", put("rooms/ABC12/players/p1/vote", "13"));
await deny("a player may not cast a card from another deck", put("rooms/ABC12/players/p1/vote", "XXL"));
await deny("a player id must match its key", put("rooms/ABC12/players/p2", { id: "spoofed", name: "X", role: "voter", voted: false }));
await deny("a player name is length-capped", put("rooms/ABC12/players/p3", { id: "p3", name: "x".repeat(41), role: "voter", voted: false }));
await deny("a story name is length-capped", put("rooms/ABC12/stories/1", { name: "x".repeat(201) }));
await deny("the timer cannot be set beyond its bounds", put("rooms/ABC12/timer/duration", 99999));

/* ── ANALYTICS ──────────────────────────────────────────────────────── */

await deny("analytics cannot be read by an anonymous visitor", canRead("analytics"));
await deny("  …not even a single counter", canRead(`analytics/daily/${today}/room_created`));

/* This pair is the whole reason the harness exists. The counter starts absent,
   so the first write can only pass through the `!data.exists() && val === 1`
   branch. The second write is a server-side increment, and it can only pass
   through the `data.exists() && val === data.val() + 1` branch — which proves
   increment() is resolved to a concrete number *before* validation runs. If
   that were not true, the rule would reject every analytics event in
   production and the dashboard would silently read zero, exactly as it did
   before. The third write confirms the stored value really moved to 2. */
await allow("a new counter starts at one", put(`analytics/daily/${today}/room_created`, 1));
await allow("increment() resolves before validation and steps by exactly one", put(`analytics/daily/${today}/room_created`, { ".sv": { increment: 1 } }));
await deny("  …so re-writing 1 over the stored 2 is now rejected", put(`analytics/daily/${today}/room_created`, 1));

await deny("a counter cannot be inflated in a single write", put(`analytics/daily/${today}/estimate_recorded`, 999999));
await deny("a counter cannot jump by more than one", put(`analytics/daily/${today}/room_created`, 500));
await deny("a counter cannot be reset to erase a day", put(`analytics/daily/${today}/room_created`, 0));
await deny("a counter cannot be decremented", put(`analytics/daily/${today}/room_created`, { ".sv": { increment: -1 } }));
await deny("a counter cannot be a string", put(`analytics/daily/${today}/room_created`, "lots"));

await deny("event names cannot contain spaces or capitals", put(`analytics/daily/${today}/Room Created`, 1));
await deny("event names cannot be unbounded", put(`analytics/daily/${today}/${"e".repeat(60)}`, 1));
await deny("implausible dates are rejected", put("analytics/daily/9999-01-01/room_created", 1));
await deny("non-dates are rejected", put("analytics/daily/not-a-date/room_created", 1));

/* ── OWNER-ONLY ANALYTICS ───────────────────────────────────────────────
   The dashboard must be readable by the owner and nobody else. The browser UI
   is not the gate — a determined visitor can edit React state, change the URL,
   or call the SDK from the console. These assertions are the gate, and they
   are enforced by Firebase, not by anything shipped to the client. */

await deny("the analytics tree is unreadable", canRead("analytics"));
await deny("  …and so is the daily node the dashboard subscribes to", canRead("analytics/daily"));
await deny("  …and so is a single day", canRead(`analytics/daily/${today}`));
await deny("  …and so is one counter within a day", canRead(`analytics/daily/${today}/room_created`));
await deny("nobody can promote themselves to admin", put("admins/attacker", true));
await deny("  …nor via a nested path under their uid", put("admins/attacker/granted", true));
await deny("  …nor by patching the admins node wholesale", patch("admins", { attacker: true }));
await deny("the admin allowlist cannot be enumerated", canRead("admins"));
await deny("another account's admin flag is unreadable", canRead("admins/someone-else"));

/* Room codes are the only thing protecting a session, so the room list itself
   must never be enumerable — otherwise anyone could walk into every live room
   on the site. */
await deny("the room list cannot be enumerated", canRead("rooms"));
await allow("a room is readable by anyone holding its code", canRead("rooms/ABC12"));

/* ── PRIVATE AND REMOVED NODES ──────────────────────────────────────── */

await deny("the removed licences node is unreadable", canRead("licenses/AAAA-BBBB-CCCC-DDDD"));
await deny("the removed licences node is unwritable", put("licenses/AAAA-BBBB-CCCC-DDDD", { active: true }));
await deny("another user's profile is unreadable", canRead("users/someone-else"));
await deny("another user's profile is unwritable", patch("users/someone-else", { email: "x@y.z" }));
await deny("another user's sprint history is unreadable", canRead("history/someone-else"));
await deny("undeclared top-level paths are denied", put("anything-else", { hello: "world" }));

/* ── REPORT ─────────────────────────────────────────────────────────── */

if (failures.length) {
  console.error(`\n  ✗ ${failures.length} rule assertion(s) failed (${passed} passed):\n`);
  failures.forEach((f) => console.error(`    ✗ ${f}\n`));
  process.exit(1);
}
console.log(`\n  ✓ all ${passed} Firebase rule assertions passed\n`);

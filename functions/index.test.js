/* Smoke test for the Cloud Functions bundle.
   Run with: npm test  (uses the Node built-in runner, no dependencies)

   This exists because a broken functions/index.js cannot be caught by reading
   it. `firebase deploy` uploads the source, runs it in the cloud, and a module
   that throws on import fails there rather than here — and the deploy output
   does not always make that obvious. Loading the module locally catches a bad
   require, a renamed API after a dependency bump, and a syntax error, which is
   every way a runtime upgrade has broken this file so far.

   admin.database() refuses to construct without a database URL, so the config
   the Cloud Functions runtime would normally inject is supplied here. Nothing
   in the module opens a connection at import time, so no network I/O happens. */
/* The database is in the US multi-region, so its URL is on firebaseio.com.
   Do not "correct" this to a europe-west1.firebasedatabase.app address: that
   host answers 404 with {"error":"Database lives in a different region"}. */
process.env.FIREBASE_CONFIG = JSON.stringify({
  databaseURL: "https://planning-poker-b6ac1-default-rtdb.firebaseio.com",
  projectId: "planning-poker-b6ac1",
});
process.env.GCLOUD_PROJECT = "planning-poker-b6ac1";

const test = require("node:test");
const assert = require("node:assert");

const fns = require("./index.js");

test("the module loads without throwing", () => {
  assert.ok(fns, "index.js exported nothing");
});

test("exports exactly the two live functions", () => {
  assert.deepStrictEqual(
    Object.keys(fns).sort(),
    ["notifyOwnerOnSignup", "reapStaleRooms"],
  );
});

test("notifyOnProActivation stays deleted", () => {
  /* It fired on every write to /users/{uid}, so every sign-in invoked it, and
     it emailed about a Pro tier the product no longer has. The rules accept any
     string for users/$uid/plan, so a signed-in user could have written
     plan:"pro" to their own profile and triggered it. Do not reintroduce a
     plan-watching trigger without a plan to watch. */
  assert.strictEqual(fns.notifyOnProActivation, undefined);
});

test("both functions are deployable triggers, not plain objects", () => {
  // A v1 trigger carries __trigger/__endpoint metadata. Without it the deploy
  // succeeds and creates nothing, which is how reapStaleRooms went missing.
  for (const name of ["notifyOwnerOnSignup", "reapStaleRooms"]) {
    assert.ok(fns[name].__endpoint, `${name} has no __endpoint metadata`);
  }
});

test("reapStaleRooms is scheduled, not left as an HTTP endpoint", () => {
  assert.ok(
    fns.reapStaleRooms.__endpoint.scheduleTrigger,
    "reapStaleRooms is not on a schedule",
  );
});

test("no SMTP secret is hard-coded as a fallback", () => {
  /* firstNonEmpty() takes a literal default as its last argument, which makes
     it very easy to "fix" a missing credential by typing it in. SUPPORT_EMAIL
     and the host legitimately have literal defaults; the password must never. */
  const src = require("node:fs").readFileSync(`${__dirname}/index.js`, "utf8");
  const passBlock = src.slice(src.indexOf("const SMTP_PASS"), src.indexOf(");", src.indexOf("const SMTP_PASS")));
  assert.ok(
    !/"[^"]{6,}"/.test(passBlock),
    "SMTP_PASS has a string literal fallback, which would be a committed secret",
  );
});

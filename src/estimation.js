/* ═══════════════ ESTIMATION MATHS + ROOM ADDRESSING ═══════════════
   The pure core of the product, kept out of App.js so it can be tested
   without a browser, a Firebase mock, or a rendered component.

   Nothing here touches React, Firebase, or the DOM. If it needs to,
   it belongs in App.js instead. (crypto.getRandomValues, used by the code
   generator below, is none of those three — it is a platform global, and
   the whole point of preferring it is that it is not something we wrote.)
════════════════════════════════════════════════════════════════════ */

// A card that expresses a size. "?" means "I cannot size this", and an absent
// or empty value means the player is flagged as voted but has no card yet —
// Firebase stores `vote` and `voted` separately, so that state is reachable.
const isSizedVote = (v) => typeof v === "string" && v !== "" && v !== "?";

/**
 * Derives everything the reveal screen shows from the current player list.
 *
 * @param {Array<{role?: string, vote?: string|null, voted?: boolean}>} players
 * @returns {{
 *   voters: Array, voted: Array, votes: Array<string|null|undefined>,
 *   avg: number|null, median: number|null, min: number|null, max: number|null,
 *   spread: number|null, allSame: boolean, isFullTableAgreement: boolean,
 *   isRealConsensus: boolean, unanimousUnknown: boolean, consensusEstimate: string,
 * }}
 */
export function tally(players = []) {
  const voters = (players || []).filter((p) => p && p.role === "voter");
  const voted = voters.filter((p) => p.voted);
  const votes = voted.map((p) => p.vote);

  // T-shirt sizes (XS…XXL) are deliberately excluded: Number("M") is NaN and
  // would poison the average, the median and the spread.
  const nums = votes.filter((v) => isSizedVote(v) && !Number.isNaN(Number(v))).map(Number);
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  const median = !sorted.length
    ? null
    : sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const min = nums.length ? Math.min(...nums) : null;
  const max = nums.length ? Math.max(...nums) : null;

  // Everyone who voted picked the same real card.
  const allSame = voted.length >= 1 && new Set(votes).size === 1 && isSizedVote(votes[0]);
  // "Agreed" for the alignment metric means the whole table voted and matched,
  // not just the two people who happened to click before the reveal.
  const isFullTableAgreement = allSame && voted.length === voters.length;
  // Only celebrate when there was actually a table to agree with.
  const isRealConsensus = isFullTableAgreement && voters.length > 1;
  // A room full of "?" is the opposite of agreement: nobody could size the item.
  const unanimousUnknown = voted.length > 0 && votes.every((v) => v === "?");

  return {
    voters,
    voted,
    votes,
    avg,
    median,
    min,
    max,
    spread: min !== null && max !== null ? max - min : null,
    allSame,
    isFullTableAgreement,
    isRealConsensus,
    unanimousUnknown,
    consensusEstimate: allSame ? votes[0] : "",
  };
}

/**
 * The room-relative paths a new sprint has to blank, and what to blank them to.
 *
 * This is a list, and the bug it exists to prevent is a short one. The counters
 * used to be zeroed while the records they counted survived: storiesDone went
 * to 0 with every queued estimate still attached, every recorded round still in
 * `rounds`, and activeStory still pointing past the end of the queue. The panel
 * then read "Stories sized 0" directly above "Stories sized (1)" listing an
 * estimate. Counters and records reset together, or neither does.
 *
 * The backlog itself survives: the stories keep their names and the queue
 * rewinds to the top, because the confirm promises to clear votes and rounds,
 * not to delete what somebody typed.
 *
 * @param {{players?: object, stories?: object, timer?: {duration?: number}}} roomData
 * @returns {Record<string, unknown>} room-relative path → value, for one
 *   multi-path update. `null` deletes.
 */
export function sprintResetUpdates(roomData = {}) {
  const upd = {};
  for (const id of Object.keys(roomData?.players || {})) {
    upd[`players/${id}/voted`] = false;
    upd[`players/${id}/vote`] = null;
  }
  for (const idx of Object.keys(roomData?.stories || {})) {
    upd[`stories/${idx}/estimate`] = null;
  }
  upd.activeStory = 0;
  upd.rounds = null;
  upd.revealed = false;
  upd.round = 1;
  upd.storiesDone = 0;
  upd.streak = 0;
  upd.consensusCount = 0;
  upd["timer/running"] = false;
  upd["timer/remaining"] = roomData?.timer?.duration || 30;
  upd["timer/startedBy"] = null;
  return upd;
}

/**
 * Un-record one already-sized item, as room-relative update paths.
 *
 * Two storage paths feed the sized list. A room with a named queue keeps its
 * estimates on the queue at `stories/{i}`; a room without one keeps bare
 * records at `rounds/{n}`. The caller says which list the row came from and
 * where in it, because filtering the list for display loses that address.
 *
 * Both lists are index-keyed and both hand out the next key from a counter —
 * `activeStory` for the queue, `storiesDone` for the rounds — so a hole in the
 * middle is not survivable. Delete `rounds/1` of three and leave the gap, and
 * the next estimate recorded writes `rounds/2`, which is still occupied, and
 * overwrites it with no error anywhere. Both lists are therefore rewritten
 * contiguously, which is also what removeStory does to the queue.
 *
 * consensusCount is the one number that cannot always be exact. A round stores
 * `isConsensus`, so removing one subtracts the right amount; a queued story
 * does not, so that branch can only clamp. Clamping is the honest failure:
 * alignment can never read above 100%, and the figure corrects itself over the
 * rest of the sprint.
 *
 * @param {{stories?: object, rounds?: object, storiesDone?: number,
 *          consensusCount?: number, activeStory?: number}} roomData
 * @param {"story"|"round"} kind which list the row came from
 * @param {number} index its position in that list, before display filtering
 * @returns {Record<string, unknown>|null} room-relative path → value for one
 *   multi-path update, or null if the index does not name anything.
 */
export function deleteSizedItemUpdates(roomData = {}, kind, index) {
  const nextDone = Math.max(0, (roomData?.storiesDone || 0) - 1);
  const consensus = roomData?.consensusCount || 0;
  const upd = { storiesDone: nextDone };

  if (kind === "story") {
    const list = Object.values(roomData?.stories || {});
    if (!(index >= 0 && index < list.length)) return null;
    const next = list.filter((_, i) => i !== index);
    const activeIdx = roomData?.activeStory ?? 0;
    // One write for the whole list: a multi-path update may not carry both a
    // parent path and its own children, so `stories` is replaced wholesale.
    upd.stories = next.length ? Object.fromEntries(next.map((s, i) => [i, s])) : null;
    upd.activeStory = index < activeIdx ? activeIdx - 1 : activeIdx;
    upd.consensusCount = Math.min(consensus, nextDone);
    return upd;
  }

  const list = Object.entries(roomData?.rounds || {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, v]) => v);
  if (!(index >= 0 && index < list.length)) return null;
  const next = list.filter((_, i) => i !== index);
  upd.rounds = next.length ? Object.fromEntries(next.map((r, i) => [i, r])) : null;
  upd.consensusCount = Math.min(
    Math.max(0, consensus - (list[index].isConsensus ? 1 : 0)),
    nextDone,
  );
  return upd;
}

/**
 * True when the countdown ran out and the cards are still face down.
 *
 * Derived rather than stored, and it costs nothing to keep it that way: only
 * the tick at zero leaves a stopped clock sitting on `remaining: 0` with
 * nothing revealed. A manual stop keeps the seconds it stopped on, a new round
 * restores the duration, and both reveal paths write `revealed` in the same
 * breath as `remaining: 0` — so no other state collides with this one, and
 * Firebase needs no extra field and no rules change to carry it.
 *
 * The room-level "whoever started the timer has left" guard writes
 * `running: false` alone, leaving whatever second it stopped on, which is why
 * that path does not read as expired either.
 */
export const isTimeUp = (timer, revealed) =>
  !!timer && timer.running !== true && timer.remaining === 0 && revealed !== true;

/** Formats a number for display: whole numbers bare, otherwise one decimal. */
export const showNum = (n) =>
  n === null || n === undefined ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1);

/* ── ROOM ADDRESSING ────────────────────────────────────────────────────
   A room code is the entire access control on a live session: the security
   rules grant read to anyone who can name the room, because with no accounts
   there is nothing else to check. Everything in this section either mints one
   of those names or cleans one somebody typed, so it lives next to teamCode
   and it is tested.
─────────────────────────────────────────────────────────────────────────── */

export const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * A random string of `len` symbols drawn uniformly from `alphabet`.
 *
 * Both ids used to come from `Math.random().toString(36)`, which is wrong twice
 * over for a secret: the generator is a seeded PRNG whose future output follows
 * from its past, and toString(36) drops trailing zeros, so `slice(2, 10)`
 * returns fewer than eight characters roughly once in every 111,000 draws
 * (measured, not assumed — 27 short ids in three million).
 *
 * The reject-the-tail line is what keeps the symbols uniform: 256 is not a
 * multiple of 36, so plain `% 36` would make the first four letters slightly
 * likelier than the rest, and an alphabet with a known lean is a smaller
 * alphabet.
 */
export const randomId = (len, alphabet = CODE_ALPHABET) => {
  const limit = 256 - (256 % alphabet.length);
  const out = [];
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len - out.length))) {
      if (b < limit) out.push(alphabet[b % alphabet.length]);
    }
  }
  return out.join("");
};

/** Per-tab player id. Lowercase so it never looks like a room code in a URL. */
export const playerId = () => randomId(8, CODE_ALPHABET.toLowerCase());

/** A fresh ad-hoc room code. Five symbols of base-36 = 60,466,176 rooms. */
export const mkCode = () => randomId(5);

/**
 * Turns whatever is in the "room code" box into something safe to address a
 * room with.
 *
 * The share button hands people a URL, so a URL is what gets pasted here — the
 * code is lifted back out of it rather than mangled. Everything else is
 * stripped to base-36, because `ref(db, `rooms/${code}`)` throws *synchronously*
 * on ".", "#", "$", "[" and "]", and nothing awaited the join handler: the
 * throw reached nobody, so the Join button did nothing at all and never said
 * why. A single "." was enough.
 */
export const cleanRoomCode = (value) => {
  // `?? ""`, not a default parameter: URLSearchParams.get returns null for a
  // missing key, a default only fires on undefined, and String(null) is "NULL"
  // — a perfectly legal five-character room code that does not exist.
  const text = String(value ?? "");
  const fromShareUrl = text.match(/[?&]room=([^&#\s]+)/i)?.[1];
  return (fromShareUrl ?? text).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
};

/**
 * Derives a stable, human-readable URL slug from a team name.
 * "RPA Build Team" → "rpa-build-team". Must stay deterministic: the slug *is*
 * the room address, so a change here sends a team to a different room.
 */
export const teamCode = (name) =>
  String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // strip punctuation, keep slug hyphens
    .replace(/\s+/g, "-") // spaces → hyphens
    .replace(/-{2,}/g, "-") // collapse runs
    .replace(/^-|-$/g, "") // trim the ends
    .slice(0, 24) // cap the URL
    .replace(/-$/, "") // the cap can land on a separator
  || "team";

/**
 * The four headline numbers and the trend badge the sprint-history modal shows.
 *
 * `history` arrives newest-first — App.js sorts it by `endedAt` descending —
 * and that ordering is load-bearing: the trend compares the front half against
 * the back half, so reversing the sort silently points the arrow the wrong way.
 *
 * Velocity, best and trend read only sessions that scored numeric points,
 * because a t-shirt sprint has no `totalPoints` to average. Consensus is the
 * deliberate exception — every sprint has a rate — so it divides by all of them.
 */
export function sprintHistoryStats(history = []) {
  const totalSprints = history.length;
  const pointSessions = history.filter((h) => h.totalPoints > 0);

  const avgVelocity = pointSessions.length
    ? Math.round(pointSessions.reduce((s, h) => s + h.totalPoints, 0) / pointSessions.length)
    : 0;
  const bestSprint = pointSessions.length
    ? Math.max(...pointSessions.map((h) => h.totalPoints))
    : 0;
  const avgConsensus = totalSprints
    ? Math.round(history.reduce((s, h) => s + (h.consensusRate || 0), 0) / totalSprints)
    : 0;

  // ceil(n/2) < n for every n >= 2, so `older` is never the empty slice that
  // would make olderAvg NaN and drop the badge without saying why.
  let trend = null;
  if (pointSessions.length >= 2) {
    const half = Math.ceil(pointSessions.length / 2);
    const recent = pointSessions.slice(0, half);
    const older = pointSessions.slice(half);
    const recentAvg = recent.reduce((s, h) => s + h.totalPoints, 0) / recent.length;
    const olderAvg = older.reduce((s, h) => s + h.totalPoints, 0) / older.length;
    /* Rule 5: an arrow alone is a colour-coded glyph. The word beside it is
       what a screen reader and a colour-blind reader actually get. */
    if (recentAvg > olderAvg * 1.05) trend = { icon: "↑", label: "Improving", tone: "success" };
    else if (recentAvg < olderAvg * 0.95) trend = { icon: "↓", label: "Declining", tone: "danger" };
    else trend = { icon: "→", label: "Steady", tone: "gold" };
  }

  return { totalSprints, avgVelocity, bestSprint, avgConsensus, trend };
}

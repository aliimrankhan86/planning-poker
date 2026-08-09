/* ═══════════════════ ESTIMATION MATHS ═══════════════════
   The pure core of the product, kept out of App.js so it can be tested
   without a browser, a Firebase mock, or a rendered component.

   Nothing here touches React, Firebase, or the DOM. If it needs to,
   it belongs in App.js instead.
═══════════════════════════════════════════════════════════ */

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

/** Formats a number for display: whole numbers bare, otherwise one decimal. */
export const showNum = (n) =>
  n === null || n === undefined ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1);

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

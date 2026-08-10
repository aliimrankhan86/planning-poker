import { tally, teamCode, sprintResetUpdates } from "./estimation";

/* The estimation maths is the product. If `tally` is wrong the app still
   renders, still feels fine, and quietly records the wrong number into a
   team's sprint history. Nothing else in the suite would notice. */

const voter = (vote, voted = vote !== undefined) => ({ role: "voter", vote, voted });

describe("tally: consensus", () => {
  test("an empty table is not consensus and produces no stats", () => {
    const t = tally([]);
    expect(t.allSame).toBe(false);
    expect(t.isRealConsensus).toBe(false);
    expect(t.avg).toBeNull();
    expect(t.median).toBeNull();
    expect(t.spread).toBeNull();
  });

  test("one person agreeing with themselves is not a consensus worth celebrating", () => {
    const t = tally([voter("5")]);
    expect(t.allSame).toBe(true);
    expect(t.isFullTableAgreement).toBe(true);
    expect(t.isRealConsensus).toBe(false); // needs more than one voter
  });

  test("the whole table picking the same card is real consensus", () => {
    const t = tally([voter("8"), voter("8"), voter("8")]);
    expect(t.isRealConsensus).toBe(true);
    expect(t.consensusEstimate).toBe("8");
  });

  test("agreement among early voters is not full-table agreement", () => {
    // Two matched votes, one person still thinking.
    const t = tally([voter("5"), voter("5"), voter(undefined, false)]);
    expect(t.allSame).toBe(true);
    expect(t.isFullTableAgreement).toBe(false);
    expect(t.isRealConsensus).toBe(false);
  });

  test("a table that unanimously played ? has agreed on nothing", () => {
    const t = tally([voter("?"), voter("?")]);
    expect(t.allSame).toBe(false);
    expect(t.unanimousUnknown).toBe(true);
    expect(t.consensusEstimate).toBe("");
  });

  test("a ? among real votes breaks consensus but not the stats", () => {
    const t = tally([voter("5"), voter("5"), voter("?")]);
    expect(t.allSame).toBe(false);
    expect(t.unanimousUnknown).toBe(false);
    expect(t.avg).toBe(5); // the ? is not a zero
  });

  test("someone marked as voted with no card is not agreement", () => {
    // Firebase stores `vote` and `voted` as separate fields, so this state is
    // representable. Treating it as consensus would fire confetti over a blank
    // and offer an empty estimate to record.
    expect(tally([voter(undefined, true), voter(undefined, true)]).allSame).toBe(false);
    expect(tally([voter(null, true)]).allSame).toBe(false);
    expect(tally([voter("", true)]).allSame).toBe(false);
  });

  test("observers never count toward the table", () => {
    const t = tally([voter("3"), voter("3"), { role: "observer", voted: false }]);
    expect(t.isFullTableAgreement).toBe(true);
    expect(t.isRealConsensus).toBe(true);
  });
});

describe("tally: numeric stats", () => {
  test("averages, median and spread over an odd count", () => {
    const t = tally([voter("1"), voter("2"), voter("3")]);
    expect(t.avg).toBe(2);
    expect(t.median).toBe(2);
    expect(t.min).toBe(1);
    expect(t.max).toBe(3);
    expect(t.spread).toBe(2);
  });

  test("median of an even count is the midpoint of the two centres", () => {
    const t = tally([voter("1"), voter("2"), voter("3"), voter("5")]);
    expect(t.avg).toBe(2.75);
    expect(t.median).toBe(2.5);
  });

  test("t-shirt sizes are excluded from numeric stats rather than becoming NaN", () => {
    const t = tally([voter("M"), voter("L"), voter("XL")]);
    expect(t.avg).toBeNull();
    expect(t.median).toBeNull();
    expect(t.spread).toBeNull();
  });

  test("t-shirt agreement still registers as consensus", () => {
    const t = tally([voter("M"), voter("M")]);
    expect(t.isRealConsensus).toBe(true);
    expect(t.consensusEstimate).toBe("M");
    expect(t.avg).toBeNull();
  });
});

describe("teamCode", () => {
  test("turns a team name into a readable slug", () => {
    expect(teamCode("RPA Build Team")).toBe("rpa-build-team");
  });

  test("falls back to 'team' rather than producing an empty URL", () => {
    for (const input of ["", "   ", "!!!", "***", null, undefined]) {
      expect(teamCode(input)).toBe("team");
    }
  });

  test("strips punctuation and emoji, collapses whitespace and hyphens", () => {
    expect(teamCode("  Ali's   Team!! 🎲  ")).toBe("alis-team");
    expect(teamCode("Web -- Platform")).toBe("web-platform");
  });

  test("caps at 24 characters without leaving a trailing hyphen", () => {
    // 23 chars then a space: a naive slice cuts mid-separator and yields "…-".
    const slug = teamCode("abcdefghijklmnopqrstuvw x");
    expect(slug.length).toBeLessThanOrEqual(24);
    expect(slug).not.toMatch(/-$/);
  });

  test("is stable, so the same team always lands on the same room", () => {
    expect(teamCode("Product Team")).toBe(teamCode("  PRODUCT   team  "));
  });
});

/* The reset that did not reset. A new sprint zeroed storiesDone, streak and
   consensusCount and left every estimate that produced them, so the analytics
   panel reported "Stories sized 0" above a list of sized stories. The point of
   testing the payload rather than the write is that the bug was an omission —
   three paths missing from a list of thirteen. */
describe("sprintResetUpdates", () => {
  const room = {
    players: { a: { voted: true, vote: "5" }, b: { voted: true, vote: "21" } },
    stories: { 0: { name: "Login", estimate: "13" }, 1: { name: "Search", estimate: "5" } },
    rounds: { 0: { estimate: "13", isConsensus: true } },
    timer: { duration: 45 },
    storiesDone: 2,
    activeStory: 2,
  };

  test("clears every estimate the counters are counting", () => {
    const upd = sprintResetUpdates(room);
    expect(upd["stories/0/estimate"]).toBeNull();
    expect(upd["stories/1/estimate"]).toBeNull();
    expect(upd.rounds).toBeNull();
    expect(upd.storiesDone).toBe(0);
    expect(upd.consensusCount).toBe(0);
    expect(upd.streak).toBe(0);
  });

  test("rewinds the queue so the room is not sitting past its last story", () => {
    expect(sprintResetUpdates(room).activeStory).toBe(0);
  });

  test("keeps the backlog — the confirm promises votes and rounds, not names", () => {
    const paths = Object.keys(sprintResetUpdates(room));
    expect(paths).not.toContain("stories");
    expect(paths.filter((p) => /^stories\//.test(p)).every((p) => p.endsWith("/estimate"))).toBe(true);
  });

  test("takes every player's card back and closes the reveal", () => {
    const upd = sprintResetUpdates(room);
    expect(upd["players/a/voted"]).toBe(false);
    expect(upd["players/a/vote"]).toBeNull();
    expect(upd["players/b/vote"]).toBeNull();
    expect(upd.revealed).toBe(false);
    expect(upd.round).toBe(1);
  });

  test("stops the timer and restores the room's own countdown length", () => {
    expect(sprintResetUpdates(room)["timer/remaining"]).toBe(45);
    expect(sprintResetUpdates({})["timer/remaining"]).toBe(30);
    expect(sprintResetUpdates(room)["timer/running"]).toBe(false);
    expect(sprintResetUpdates(room)["timer/startedBy"]).toBeNull();
  });

  test("an empty room resets without inventing player or story paths", () => {
    const upd = sprintResetUpdates({});
    expect(Object.keys(upd).some((p) => /^players\/|^stories\//.test(p))).toBe(false);
    expect(upd.storiesDone).toBe(0);
  });

  test("every value is a legal write — no undefined reaches Firebase", () => {
    // update() throws on undefined; null is the documented delete.
    expect(Object.values(sprintResetUpdates(room)).every((v) => v !== undefined)).toBe(true);
  });
});

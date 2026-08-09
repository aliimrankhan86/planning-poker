import { tally, teamCode } from "./estimation";

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

import {
  tally,
  teamCode,
  sprintResetUpdates,
  deleteSizedItemUpdates,
  cleanRoomCode,
  mkCode,
  playerId,
  CODE_ALPHABET,
} from "./estimation";

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

describe("deleteSizedItemUpdates", () => {
  const queueRoom = () => ({
    stories: {
      0: { name: "Login", estimate: "5" },
      1: { name: "Search", estimate: "8" },
      2: { name: "Export", estimate: "13" },
    },
    activeStory: 3,
    storiesDone: 3,
    consensusCount: 3,
  });
  const roundRoom = () => ({
    rounds: {
      0: { estimate: "5", isConsensus: true },
      1: { estimate: "8", isConsensus: false },
      2: { estimate: "13", isConsensus: true },
    },
    storiesDone: 3,
    consensusCount: 2,
  });

  /* THE BUG THIS EXISTS FOR. Both lists are index-keyed and the next key comes
     from a counter, so a gap is not an empty slot — it is a collision waiting
     for the next recorded estimate. Punch out rounds/1 and leave {0, 2} with
     storiesDone at 2, and the next record writes rounds/2 straight over a
     real estimate, with no error raised anywhere. */
  test("the rounds map is left contiguous, so the next record cannot land on one", () => {
    const upd = deleteSizedItemUpdates(roundRoom(), "round", 1);
    expect(Object.keys(upd.rounds)).toEqual(["0", "1"]);
    expect(upd.rounds[1].estimate).toBe("13");
    // The invariant the collision breaks: next key === storiesDone.
    expect(Object.keys(upd.rounds).length).toBe(upd.storiesDone);
  });

  test("the queue is left contiguous too, and the pointer follows it back", () => {
    const upd = deleteSizedItemUpdates(queueRoom(), "story", 0);
    expect(Object.keys(upd.stories)).toEqual(["0", "1"]);
    expect(upd.stories[0].name).toBe("Search");
    expect(upd.activeStory).toBe(2);
    expect(upd.storiesDone).toBe(2);
  });

  test("removing an item the queue has not reached leaves the pointer alone", () => {
    // Not reachable from the sized list today — everything in it is behind the
    // pointer — but the alternative is a pointer that walks backwards past
    // estimates that are still recorded.
    const room = { ...queueRoom(), activeStory: 1 };
    expect(deleteSizedItemUpdates(room, "story", 2).activeStory).toBe(1);
  });

  test("a round knows whether it was a consensus, so that one is exact", () => {
    expect(deleteSizedItemUpdates(roundRoom(), "round", 1).consensusCount).toBe(2);
    expect(deleteSizedItemUpdates(roundRoom(), "round", 0).consensusCount).toBe(1);
  });

  test("a queued story does not, so that one clamps and never reads over 100%", () => {
    const upd = deleteSizedItemUpdates(queueRoom(), "story", 1);
    expect(upd.consensusCount).toBe(2);
    expect(upd.consensusCount).toBeLessThanOrEqual(upd.storiesDone);
  });

  test("deleting the last one empties the list instead of leaving {}", () => {
    // Firebase does not store an empty object; writing one is a delete with
    // extra steps, and `{}` here would read back as a node that still exists.
    const one = { stories: { 0: { name: "Login", estimate: "5" } }, activeStory: 1, storiesDone: 1, consensusCount: 1 };
    expect(deleteSizedItemUpdates(one, "story", 0).stories).toBeNull();
    expect(deleteSizedItemUpdates({ rounds: { 0: { estimate: "5", isConsensus: true } }, storiesDone: 1, consensusCount: 1 }, "round", 0).rounds).toBeNull();
  });

  test("counters never go below zero, whatever the room says they were", () => {
    const upd = deleteSizedItemUpdates({ rounds: { 0: { estimate: "5", isConsensus: true } } }, "round", 0);
    expect(upd.storiesDone).toBe(0);
    expect(upd.consensusCount).toBe(0);
  });

  test("an index that names nothing writes nothing", () => {
    for (const i of [-1, 3, 99]) {
      expect(deleteSizedItemUpdates(queueRoom(), "story", i)).toBeNull();
      expect(deleteSizedItemUpdates(roundRoom(), "round", i)).toBeNull();
    }
    expect(deleteSizedItemUpdates({}, "story", 0)).toBeNull();
  });

  test("every value is a legal write — no undefined reaches Firebase", () => {
    for (const upd of [deleteSizedItemUpdates(queueRoom(), "story", 1),
                       deleteSizedItemUpdates(roundRoom(), "round", 1)]) {
      expect(Object.values(upd).every((v) => v !== undefined)).toBe(true);
    }
  });
});

/* ── ROOM ADDRESSING ────────────────────────────────────────────────────
   With no accounts on a room, the code is the access control and the address
   at once. These guard both halves: that a minted code is unguessable and the
   length it claims to be, and that a typed one can never reach Firebase in a
   shape that throws.
─────────────────────────────────────────────────────────────────────────── */

describe("cleanRoomCode", () => {
  // Firebase's own list. ref() throws synchronously on any of these, and the
  // throw used to land in an unawaited handler: the button did nothing at all.
  test.each([".", "#", "$", "[", "]"])(
    "strips %s, which makes ref() throw before it reaches the network",
    (ch) => {
      expect(cleanRoomCode(`A1${ch}B2`)).toBe("A1B2");
    },
  );

  test("takes the code out of a pasted share link", () => {
    expect(cleanRoomCode("https://www.pointpoker.app/?room=A1B2C")).toBe("A1B2C");
    expect(cleanRoomCode("https://www.pointpoker.app/?room=A1B2C&utm=x")).toBe("A1B2C");
  });

  test("a link is not merely stripped of punctuation", () => {
    // The naive fix. It yields a 12-character run of the domain, which is a
    // perfectly legal room code — so the lookup fails on "no such room"
    // instead of on "that is a URL", and the person retypes the same paste.
    expect(cleanRoomCode("https://www.pointpoker.app/?room=A1B2C")).not.toContain("POINT");
  });

  test("uppercases, trims and caps at the field's own maxLength", () => {
    expect(cleanRoomCode("  a1b2c  ")).toBe("A1B2C");
    expect(cleanRoomCode("a".repeat(40))).toHaveLength(12);
  });

  test("survives the empty, null and non-string cases", () => {
    expect(cleanRoomCode()).toBe("");
    expect(cleanRoomCode(null)).toBe("");
    expect(cleanRoomCode(12345)).toBe("12345");
  });

  test("what it emits is always a legal Firebase key", () => {
    const illegal = /[.#$[\]/]/;
    for (const input of ["a.b", "a/b/c", "?room=x#y", "$$$", "[]", "../../admin"]) {
      expect(cleanRoomCode(input)).not.toMatch(illegal);
    }
  });
});

describe("room codes are minted, not guessed", () => {
  test("mkCode is always exactly five symbols of the code alphabet", () => {
    // The bug this replaces: Math.random().toString(36) drops trailing zeros,
    // so the old generator could return fewer characters than it promised.
    for (let i = 0; i < 5000; i++) {
      const c = mkCode();
      expect(c).toHaveLength(5);
      expect(c).toMatch(/^[A-Z0-9]{5}$/);
    }
  });

  test("playerId is always exactly eight, lowercase", () => {
    for (let i = 0; i < 5000; i++) expect(playerId()).toMatch(/^[a-z0-9]{8}$/);
  });

  test("every symbol in the alphabet is reachable", () => {
    // A modulo that quietly excluded symbols would shrink the keyspace without
    // shortening the code, which is the failure that leaves no trace.
    const seen = new Set(Array.from({ length: 4000 }, mkCode).join(""));
    expect(seen.size).toBe(CODE_ALPHABET.length);
  });

  test("no symbol is meaningfully likelier than another", () => {
    // 256 % 36 !== 0, so a plain `% 36` leans on the first four symbols.
    // 90,000 draws puts the expected count per symbol at 2,500.
    const counts = new Map();
    for (const ch of Array.from({ length: 18000 }, mkCode).join("")) {
      counts.set(ch, (counts.get(ch) || 0) + 1);
    }
    const tallies = [...counts.values()];
    expect(Math.max(...tallies) / Math.min(...tallies)).toBeLessThan(1.25);
  });

  test("does not draw from Math.random", () => {
    const spy = jest.spyOn(Math, "random");
    mkCode();
    playerId();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

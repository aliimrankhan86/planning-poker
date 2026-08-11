/* ═══════════════════════ ROUTE METADATA ═══════════════════════
   Single source of truth for per-route SEO metadata and the static
   content shell. Imported by:
     • src/App.js          — applies metadata client-side on navigation
     • scripts/prerender.mjs — writes a real HTML file per route at build time

   Before this existed, every marketing URL was a Vercel rewrite to "/", so
   crawlers and social unfurlers that do not execute JavaScript saw the
   homepage title, description, and canonical on all fourteen routes.
═══════════════════════════════════════════════════════════════ */

export const SITE_URL = "https://www.pointpoker.app";
// ?v=2 is a cache-buster, not a real query. LinkedIn, Facebook, Slack and X all
// key their unfurl cache on the image URL, so replacing og-image.png in place
// left them serving the old card that still advertised a Pro tier.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png?v=2`;
export const MAX_PARTICIPANTS = 20;

// One address for the support copy, the ContactPoint in the JSON-LD, and the
// mailto on /support. CRA inlines the REACT_APP_ var in the bundle; the
// prerender script reads the same var from the real environment at build time,
// so the schema and the page can never advertise two different addresses.
export const SUPPORT_EMAIL =
  process.env.REACT_APP_SUPPORT_EMAIL || "support@pointpoker.app";

export const DEFAULT_META = {
  title: "Free Planning Poker Online — No Sign-Up, No Limits | Point Poker",
  description:
    "Free online planning poker for agile and scrum teams. Everything is free: 20 people per room, unlimited rounds, unlimited stories, all three card decks, a countdown timer, facilitator analytics and CSV export. No account needed and no ads.",
  canonical: `${SITE_URL}/`,
  robots: "index, follow",
  ogUrl: `${SITE_URL}/`,
};

export const STATIC_SCREEN_BY_PATH = {
  "/": "join",
  "/terms": "terms",
  "/privacy": "privacy",
  "/about": "about",
  "/support": "support",
  "/trust": "trust",
  "/what-is-planning-poker": "whatIsPlanningPoker",
  "/fibonacci-story-points": "fibonacciStoryPoints",
  "/agile-estimation-tool": "agileEstimationTool",
  "/pricing": "pricing",
  "/features": "features",
  "/planning-poker-online": "planningPokerOnline",
  "/scrum-poker": "scrumPoker",
  "/story-point-estimation": "storyPointEstimation",
  "/remote-sprint-planning": "remoteSprintPlanning",
  "/admin": "admin",
};

// Owner-only usage dashboard: never indexed, never prerendered, never linked
// from public navigation.
export const PRIVATE_PATHS = ["/admin"];

const meta = (path, title, description, extra = {}) => ({
  title,
  description,
  canonical: `${SITE_URL}${path}`,
  ogUrl: `${SITE_URL}${path}`,
  robots: "index, follow",
  ...extra,
});

export const STATIC_ROUTE_META = {
  "/about": meta(
    "/about",
    "About Point Poker | Why This Free Planning Poker Tool Exists",
    "Why Point Poker exists, what it deliberately leaves out that other sprint-planning tools include, and why every feature is free for every team.",
  ),
  "/support": meta(
    "/support",
    "Planning Poker Help and FAQ | Point Poker Support",
    "Help with Point Poker: how to join a room, reveal votes, handle a split estimate, reuse a Team Room link, and export to CSV. Plus how long a room lasts.",
  ),
  "/trust": meta(
    "/trust",
    "Trust, Privacy, and Reliability | Point Poker",
    "What Point Poker does with your data. No advertising, no third-party tracking scripts, nothing sold on, public legal and support routes, and room rules validated on the server.",
  ),
  "/what-is-planning-poker": meta(
    "/what-is-planning-poker",
    "What Is Planning Poker? A Practical Guide for Agile Teams",
    "What planning poker is, why agile teams use it, and how revealing every card at once stops the first number spoken from anchoring the room.",
  ),
  "/fibonacci-story-points": meta(
    "/fibonacci-story-points",
    "Fibonacci Story Points Explained (1, 2, 3, 5, 8, 13, 21)",
    "Why agile teams estimate in Fibonacci story points, what each number means in practice, and how to land on an agreed estimate without pretending to a precision nobody has.",
  ),
  "/agile-estimation-tool": meta(
    "/agile-estimation-tool",
    "Free Agile Estimation Tool for Sprint Planning | Point Poker",
    "A free agile estimation tool for sprint planning and backlog refinement, with facilitator controls and analytics that show which stories the team disagreed on.",
  ),
  "/pricing": meta(
    "/pricing",
    "Planning Poker Pricing — Free for Every Team | Point Poker",
    "There is no paid tier. Every Point Poker feature is free for every team: 20 people per room, unlimited voting rounds and unlimited stories, with no trial clock and no ads.",
  ),
  "/features": meta(
    "/features",
    "Planning Poker Features — All Free | Point Poker",
    "Simultaneous reveal, three card decks, story and task queues, paste a whole backlog in one go, a countdown timer, facilitator analytics, CSV export and permanent Team Rooms. All of it free.",
  ),
  "/planning-poker-online": meta(
    "/planning-poker-online",
    "Planning Poker Online, Free, for Remote Agile Teams",
    "Run planning poker online in any browser. Create a room, paste the link into your team chat, and everyone reveals together. Nothing to install and no account needed.",
  ),
  "/scrum-poker": meta(
    "/scrum-poker",
    "Free Scrum Poker App for Sprint Planning | Point Poker",
    "A free scrum poker app for sprint planning and backlog refinement. Up to 20 people per room, which covers a full scrum team plus product, design and QA.",
  ),
  "/story-point-estimation": meta(
    "/story-point-estimation",
    "Story Point Estimation: Free Tool and Practical Guide",
    "Better story point estimation using planning poker and Fibonacci cards, with consensus analytics that flag which stories still need clearer acceptance criteria.",
  ),
  "/remote-sprint-planning": meta(
    "/remote-sprint-planning",
    "Remote Sprint Planning Tool — Free | Point Poker",
    "Run remote sprint planning in a shared planning poker room with facilitator controls, a Team Room link your squad reuses every sprint, and live alignment analytics.",
  ),
  "/terms": meta(
    "/terms",
    "Terms of Service | Point Poker",
    "The Point Poker Terms of Service. Acceptable use, liability limits and account rules for the free planning poker app.",
  ),
  "/privacy": meta(
    "/privacy",
    "Privacy Policy | Point Poker",
    "The Point Poker Privacy Policy. What gets stored, how long it is kept, your UK GDPR rights, and why there are no advertising or third-party tracking cookies.",
  ),
};

/* ── STATIC CONTENT SHELL ───────────────────────────────────────────
   Rendered into #root at build time so crawlers that do not run
   JavaScript (and social unfurlers) receive real, on-topic content and
   working internal links. React replaces it on hydration.
─────────────────────────────────────────────────────────────────── */

const HOME_FAQ = [
  {
    q: "Is this planning poker tool actually free?",
    a: `Yes, all of it, for everyone. Up to ${MAX_PARTICIPANTS} participants, unlimited voting rounds, unlimited stories, all three card decks, the queue, the countdown timer, facilitator analytics, CSV and clipboard export, and two fixed Team Rooms. There is no credit card field anywhere, no trial clock and no advertising.`
  },
  {
    q: "Do I need to create an account?",
    a: "No. Type your name, create a room, share the link. A free account does two things and nothing else: it reserves two permanent Team Room URLs to you so no other team can claim them, and it keeps your sprint history when you switch devices.",
  },
  {
    q: "How many people can join a planning poker session?",
    a: `Up to ${MAX_PARTICIPANTS} people per room, and that count includes facilitators as well as voters. For a bigger group than that, run two rooms side by side and merge the results.`,
  },
  {
    q: "How is this different from other free planning poker tools?",
    a: "Most free tiers cap something that matters. Seven participants. Nine votes a game. Five issues a session. Or they run ads and keep the timer and the averages for paying customers. Nothing here is capped and there are no ads.",
  },
  {
    q: "Why use Fibonacci numbers for story points?",
    a: "Nobody can reliably tell a 7 from an 8. The widening Fibonacci gaps (1, 2, 3, 5, 8, 13, 21, 34) force a choice between sizes that are actually different, which makes the estimate faster and more honest.",
  },
  {
    q: "Does this work for remote and distributed teams?",
    a: "Yes. Paste the room link into Slack, Teams or the meeting chat and everyone joins from the browser they already have open, on desktop or phone.",
  },
];

/* The support FAQ. Exported because App.js renders these same eight answers on
   /support and the prerender turns them into FAQPage JSON-LD. Two consumers,
   one definition: schema that claims answers the page does not show is the
   fastest way to lose a rich result.

   Deliberately troubleshooting questions, not "what is planning poker" ones.
   Those live on the home page and the guide pages, and two URLs answering the
   same query cannibalise each other. */
export const SUPPORT_FAQ = [
  {
    q: "How do I join a planning poker room?",
    a: "Open the link the facilitator shared, type your real name, choose Participant or Facilitator, and you are in. No account, no email confirmation. If someone gave you a five-character room code instead of a link, type that into the join box on the home page.",
  },
  {
    q: "How long does a planning poker room last?",
    a: "Five hours from the moment it was created. You get a warning ten minutes before the end, and if you are signed in the session is written to your sprint history. A cleanup job runs every six hours and removes anything past the cut-off, so a room is not a place to park a backlog between sprints.",
  },
  {
    q: "My room has disappeared. Can I get it back?",
    a: "No, and there is no undo. A room and its votes are deleted once the session ends. Download the CSV or copy the summary before you close the tab. If the same team estimates together every sprint, sign in and use a Team Room instead: the URL stays put and every session lands in your sprint history.",
  },
  {
    q: "How do I reveal the votes?",
    a: "The facilitator reveals, either with the reveal button or by pressing R once everyone has played a card. Participants cannot reveal, which is the whole mechanism: the cards flip together so nobody anchors on the first number said out loud.",
  },
  {
    q: "The team voted differently. What now?",
    a: "Ask the highest and lowest voters to explain their reasoning before anyone changes a card. That disagreement is the reason to run the ceremony at all, and it usually surfaces an acceptance criterion nobody had written down. Then the facilitator either runs another vote or records the agreed number from the deck. The average on screen is for discussion only and never saves by itself.",
  },
  {
    q: "Can I get a room link that stays the same every sprint?",
    a: `Yes. Sign in and you get two Team Rooms. The URL comes from your team name, so "Product Team" becomes a link your squad bookmarks once and reuses every fortnight. Both are free, and the account exists mainly to stop another team claiming the same slug.`,
  },
  {
    q: "How do I get the estimates into Jira or a spreadsheet?",
    a: "Download the session as CSV, or copy the summary to your clipboard. Both sit in the facilitator panel. The CSV opens in Excel, Google Sheets or Numbers, and imports into Jira, Linear and Azure DevOps without retyping anything.",
  },
  {
    q: "How do I contact Point Poker support?",
    a: `Email ${SUPPORT_EMAIL} with the room code or Team Room URL, what you expected to happen, and what happened instead. That is usually enough to reproduce it first try. This is a small product run by one person, so there is no paid SLA behind it, but mail gets read and answered.`,
  },
];

const HOW_TO_STEPS = [
  "Create a room, or open a link someone shared with you",
  "Add the story or task you are estimating",
  "Everyone plays a card at the same time — Fibonacci, T-shirt, or Powers of 2",
  "Reveal together, and discuss only where the estimates differ",
  "The facilitator records the agreed estimate",
  "Move straight to the next item without resetting the room",
];

const ALL_LINKS = [
  ["/", "Free planning poker"],
  ["/features", "Features"],
  ["/pricing", "Pricing"],
  ["/planning-poker-online", "Planning poker online"],
  ["/scrum-poker", "Scrum poker"],
  ["/story-point-estimation", "Story point estimation"],
  ["/remote-sprint-planning", "Remote sprint planning"],
  ["/agile-estimation-tool", "Agile estimation tool"],
  ["/what-is-planning-poker", "What is planning poker?"],
  ["/fibonacci-story-points", "Fibonacci story points"],
  ["/about", "About"],
  ["/trust", "Trust and privacy"],
  ["/support", "Support"],
];

export const ROUTE_CONTENT = {
  "/": {
    h1: "Free Planning Poker for Agile Teams",
    intro:
      "Point Poker is a free online planning poker tool for agile and scrum teams. Create a room, drop the link into Slack, Teams or Zoom, and everyone reveals their estimate at the same time. There is nothing to install and no account needed to play.",
    body: [
      `Every feature is free for every team. Other planning poker tools cap the free tier at seven participants, or nine votes a game, or they put the timer and the averages behind a paid plan. Here you get ${MAX_PARTICIPANTS} people per room, unlimited voting rounds, unlimited stories, all three card decks, the timer, the full facilitator analytics and export, for nothing.`,
      "Simultaneous reveal is the whole point. Everyone votes privately, the cards flip together, and nobody anchors on the first number said out loud. Where the estimates differ, the spread and the outliers are marked so the discussion starts at the disagreement instead of finding its way there.",
    ],
    steps: HOW_TO_STEPS,
    faq: HOME_FAQ,
  },
  "/features": {
    h1: "Planning Poker Features — All Free",
    intro:
      "Everything below is included for every team at no cost: the live planning flow and the repeatable operational layer that brings the same team back sprint after sprint.",
    bullets: [
      "Simultaneous vote reveal that removes anchoring bias",
      "Fibonacci (1–34), T-shirt sizing (XS–XXL), and Powers of 2 decks",
      "Story or task mode — queue, banners, and analytics adapt to the choice",
      "Bulk paste import: one item per line, straight from Jira, Linear, or a spreadsheet",
      "Countdown timer to time-box a round when you want one",
      "Facilitator analytics: consensus rate, spread, outliers, re-vote tracking",
      "Clipboard summary and CSV download for your sprint tool",
      "Keyboard shortcuts: 1–9 to vote, R to reveal, N for the next item",
      `Rooms for up to ${MAX_PARTICIPANTS} people, facilitators included`,
      "Two fixed Team Room URLs and sprint history with a free account",
    ],
  },
  "/pricing": {
    h1: "Planning Poker Pricing: Everything Is Free",
    intro:
      "There is no paid tier, no trial countdown, and no credit card field anywhere on Point Poker. Every feature is free for everyone while we grow the user base.",
    body: [
      `One plan, $0: up to ${MAX_PARTICIPANTS} participants per room, unlimited voting rounds, unlimited stories, all card decks, the countdown timer, facilitator analytics, clipboard and CSV export, and two fixed Team Rooms with a free account.`,
      "A planning poker tool is only useful if the whole team will actually open it, and paywalls kill that on the first invite. The plan is to keep every feature free, watch how many teams use it, and only look at paid add-ons once there is a real user base to serve. If that day comes, everything described here stays free.",
      "You are not the product either: no advertising, no third-party analytics scripts, no session recording, nothing sold on.",
    ],
  },
  "/planning-poker-online": {
    h1: "Planning Poker Online for Remote Agile Teams",
    intro:
      "Run planning poker online in any browser. Create a room, invite the team with one link, reveal together, and estimate stories fast without installs or account setup.",
    body: [
      "Everyone joins from the browser they already have open — desktop or mobile, no extension, no app store, no sign-up. Paste the link into Slack, Teams, or the meeting chat and the room fills in seconds.",
      "The facilitator drives reveal, re-votes, and the item queue. Everyone else just plays a card. That keeps a distributed ceremony to the length it should be.",
    ],
  },
  "/scrum-poker": {
    h1: "Free Scrum Poker App for Sprint Planning",
    intro:
      "Use Point Poker as a scrum poker app for sprint planning and backlog refinement, with fast, unbiased story-point discussions across a distributed team.",
    body: [
      "Scrum poker and planning poker are the same ceremony under two names: the team sizes work relatively, votes simultaneously, and talks only about the gaps.",
      `Rooms hold up to ${MAX_PARTICIPANTS} people including facilitators, which covers a full scrum team plus product, design, and QA in one session.`,
    ],
  },
  "/story-point-estimation": {
    h1: "Story Point Estimation Tool and Guide",
    intro:
      "Improve story point estimation with planning poker, Fibonacci cards, facilitator guidance, and clearer team consensus during backlog refinement.",
    body: [
      "Story points measure relative size, not hours. The value comes from the conversation a disagreement forces, which is why simultaneous reveal matters more than the number itself.",
      "The Team Alignment score tracks how often the whole team agreed on the first vote. A low score is not a people problem — it usually means the acceptance criteria are not clear enough yet.",
    ],
  },
  "/remote-sprint-planning": {
    h1: "Remote Sprint Planning Tool",
    intro:
      "Run remote sprint planning with a shared planning poker room, facilitator controls, reusable Team Room links, and live sprint analytics.",
    body: [
      "Team Rooms give a recurring squad two fixed URLs so nobody recreates and re-shares a room every sprint. Bookmark them once and they work every fortnight.",
      "Session summaries copy to the clipboard or download as CSV, so estimates land in Jira, Linear, Azure DevOps, or a spreadsheet without retyping.",
    ],
  },
  "/agile-estimation-tool": {
    h1: "Agile Estimation Tool for Sprint Planning",
    intro:
      "Point Poker works as an agile estimation tool for sprint planning, backlog refinement, facilitator-led voting, and clearer story-point discussions across remote teams.",
    body: [
      "Estimation tooling should disappear into the ceremony. Create a room, work the queue, record the agreed number, move on — the tool never asks for a signup mid-meeting.",
      "Facilitator analytics show consensus rate, spread, distribution, and re-votes, so retro conversations about estimation quality have data behind them.",
    ],
  },
  "/what-is-planning-poker": {
    h1: "What Is Planning Poker?",
    intro:
      "Planning poker is a consensus estimation technique where every team member privately picks a card representing effort, then everyone reveals at the same time.",
    body: [
      "The simultaneous reveal is the whole mechanism. If people call out numbers in sequence, the first number anchors everyone after it, and the estimate becomes a measure of seniority rather than complexity.",
      "When the cards disagree, the highest and lowest voters explain their reasoning. That conversation — not the arithmetic — is where the value is, because it surfaces hidden assumptions and missing acceptance criteria before the sprint starts.",
    ],
    steps: HOW_TO_STEPS,
  },
  "/fibonacci-story-points": {
    h1: "Fibonacci Story Points Explained",
    intro:
      "Agile teams estimate in Fibonacci story points — 1, 2, 3, 5, 8, 13, 21, 34 — because uncertainty grows with size, and the widening gaps stop teams pretending otherwise.",
    body: [
      "Nobody can reliably tell a 7 from an 8. The Fibonacci gaps force a real choice between clearly different sizes, which makes estimates faster and more honest.",
      "A large card is a signal, not a number: 21 and 34 usually mean the story should be split before it enters a sprint.",
    ],
  },
  "/about": {
    h1: "About Point Poker",
    intro:
      "Point Poker exists because sprint planning tools kept getting heavier while the ceremony itself stayed simple: size the work, agree, move on.",
    body: [
      "The product is deliberately narrow — run planning poker well, keep the room flow clean, and add only what improves repeat use.",
      "Nothing is locked behind billing. Every feature is free for every team while we find out how many teams this is genuinely useful to.",
    ],
  },
  "/trust": {
    h1: "Trust, Privacy, and Reliability",
    intro:
      "Practical trust signals behind Point Poker: clear support, public legal routes, no ads or tracking cookies, and room safeguards that keep live sessions understandable.",
    body: [
      "No advertising networks, no third-party analytics scripts, no session recording, and nothing sold on. The only usage data collected is an anonymous daily count of events such as 'a room was created'.",
      "Rooms are temporary by design. A room and its votes are deleted when everyone leaves, and idle rooms are swept automatically.",
    ],
  },
  "/support": {
    h1: "Planning poker help and support",
    intro:
      "The questions below cover almost everything people write in about: joining a room, revealing votes, what to do with a split estimate, and where a room goes when it ends.",
    body: [
      "You never need an account to run or join a room. A free account reserves two permanent Team Room URLs to you and keeps sprint history across devices, and that is all it does.",
      `If your question is not answered here, email ${SUPPORT_EMAIL}. This is a small product run by one person, so there is no paid SLA behind it, but mail reaches a person rather than a ticket queue.`,
    ],
    faq: SUPPORT_FAQ,
  },
};

export const PRERENDER_LINKS = ALL_LINKS;

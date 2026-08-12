/* ═══════════════════════ ROUTE METADATA ═══════════════════════
   Single source of truth for per-route SEO metadata and the static
   content shell. Imported by:
     • src/App.js          — applies metadata client-side on navigation
     • scripts/prerender.mjs — writes a real HTML file per route at build time

   Before this existed, every marketing URL was a Vercel rewrite to "/", so
   crawlers and social unfurlers that do not execute JavaScript saw the
   homepage title, description, and canonical on all fourteen routes.
═══════════════════════════════════════════════════════════════ */

import {
  LOCALES,
  LOCALE_CODES,
  TRANSLATED_LOCALES,
  LOCALIZED_PATHS,
  CONTENT as LOCALE_CONTENT,
  META as LOCALE_META,
  loadLocale,
  loadAllLocales,
} from "./locales/index.mjs";

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
  "/agile-estimation-tool": "agileEstimationTool",
  "/pricing": "pricing",
  "/features": "features",
  "/story-point-estimation": "storyPointEstimation",
  "/remote-sprint-planning": "remoteSprintPlanning",
  /* Routes below render from ROUTE_CONTENT via <ContentPage>, so adding one
     costs a data object rather than a hand-written component.

     Their "screen" is their own path. That is deliberate: the screen name has
     to differ per page or React bails out of the state update when you
     navigate between two of them and the old page stays on screen. Using the
     path means there is no second name to invent, no inverse lookup, and no
     per-page line in the render switch. Nothing else in the app uses a screen
     name starting with "/". */
  "/what-is-planning-poker": "/what-is-planning-poker",
  "/pointing-poker": "/pointing-poker",
  "/story-points-to-hours": "/story-points-to-hours",
  "/planning-poker-jira": "/planning-poker-jira",
  /* Converted from hand-written components. They were the three pages Search
     Console showed carrying real impressions against a ~140-word prerender —
     and their FAQs could not earn FAQPage schema while the answers lived in
     JSX the prerender never saw. Data-driven, the two renderers cannot drift. */
  "/scrum-poker": "/scrum-poker",
  "/planning-poker-online": "/planning-poker-online",
  "/fibonacci-story-points": "/fibonacci-story-points",
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
  /* The three routes below were added after a query-demand sweep found large
     clusters the site answered nowhere:
       • the naming cluster — "pointing poker", "poker planning", "sprint
         poker", "estimation poker", "agile poker" are the same ceremony under
         five names, and we ranked for none of the other four
       • "story points to hours" and its variants, one of the highest-volume
         questions in the whole space
       • "planning poker jira" and the other tracker/chat queries
     One page each. Five near-identical synonym pages would be doorway pages,
     which is a penalty rather than a ranking. */
  "/pointing-poker": meta(
    "/pointing-poker",
    "Pointing Poker Online — Free Tool, No Sign-Up Needed",
    "Pointing poker, poker planning, sprint poker, estimation poker and scrum poker are five names for one ceremony: everyone sizes the work privately, then all the cards turn over together. Play it free here, up to 20 people per room, no account.",
  ),
  "/story-points-to-hours": meta(
    "/story-points-to-hours",
    "Story Points to Hours: Why There Is No Conversion Rate",
    "Story points do not convert to hours, and a fixed ratio quietly turns them back into the time estimates they replaced. What teams are really asking when they want the conversion, and how to forecast a sprint with velocity instead — worked example included.",
  ),
  "/planning-poker-jira": meta(
    "/planning-poker-jira",
    "Planning Poker for Jira — Free, No Plugin to Install",
    "Run planning poker alongside Jira, Linear or Azure DevOps without a Marketplace plugin or an admin approval queue. Paste the backlog in one go, estimate together, export the agreed points as CSV, and bulk-update the tracker you already use.",
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
  {
    q: "Is scrum poker the same as planning poker?",
    a: "Yes, and so are pointing poker, poker planning, sprint poker, estimation poker and agile poker. Six names, one ceremony: private sizing, simultaneous reveal, then a discussion wherever the cards disagree. This tool runs all of them, because they are the same thing.",
  },
  {
    // Deliberately not "how many hours is a story point?" — that query belongs
    // to /story-points-to-hours, and two of our own URLs answering it splits
    // the signal so neither ranks. This is the adjacent question, and it hands
    // the deeper one off.
    q: "Can we estimate in hours instead of story points?",
    a: "You can put any numbers you like on the cards, but hours undo most of what the ceremony is for: they invite false precision, and they stop being comparable the moment the team's makeup changes. Points measure relative size instead, and a date comes from measured velocity rather than from converting each card.",
  },
  {
    q: "Do I need a Jira plugin to use this?",
    a: "No, and there isn't one. Paste your issues into the room queue in a single go, estimate together, then export the agreed points as CSV and bulk-update Jira, Linear or Azure DevOps from the file. Nothing to install and no admin approval needed.",
  },
  /* These two were rendered on the home page but were missing from this list,
     so the FAQPage schema and the page disagreed in both directions at once.
     The page now renders this array, which is the only way the two can agree. */
  {
    q: "What is the Team Alignment score?",
    a: "The Team Alignment score, which only facilitators see, is the percentage of stories that reached consensus on the first vote — every voter playing the same card. A high score means the backlog is well defined. A low one flags stories that need clearer acceptance criteria before the sprint starts, which is more useful than it sounds.",
  },
  {
    q: "What happens to my session data?",
    a: "Rooms are temporary. A room and its votes are deleted when the session ends, and idle rooms are swept automatically. There is no advertising and there are no third-party analytics cookies. Sprint history is stored only if you are signed in, and only for you.",
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
  ["/pointing-poker", "Pointing poker and poker planning"],
  ["/story-points-to-hours", "Story points to hours"],
  ["/planning-poker-jira", "Planning poker with Jira"],
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
      "If you know the ceremony as scrum poker, pointing poker, poker planning, sprint poker, estimation poker or agile poker, this is that. Six names, one game, and the same room runs all of them.",
    ],
    sections: [
      {
        title: "Built for the person running the session",
        intro:
          "Most of the friction in an estimation meeting lands on the facilitator, so most of the tooling here is theirs.",
        bullets: [
          "Only the facilitator can reveal, so the table never turns over early",
          "Queue the whole backlog up front by pasting it in, one item per line",
          "A countdown timer to time-box a round, when a round needs one",
          "Consensus rate, spread, outliers and re-vote counts, live as you go",
          "Record the agreed number and move to the next item without resetting the room",
          "Keyboard shortcuts: 1–9 to vote, R to reveal, N for the next item",
        ],
      },
      {
        title: "What it costs, and where the catch usually is",
        intro:
          "Free planning poker tools normally have a limit somewhere. These are the ones teams actually run into, and where this tool sits against each.",
        bullets: [
          "Votes per game — some free tiers stop at nine rounds. Unlimited here.",
          "Items per session — some stop at five issues. Unlimited here.",
          "People per room — free tiers commonly cap around ten. Twenty here, facilitators included.",
          "Room creation — some meter it with credits. Uncapped here.",
          "Advertising — some free rooms carry ads. None here, and no third-party trackers.",
          "Timer and averages — often reserved for paid plans. Included here.",
        ],
      },
      {
        title: "Works with the tools you already have",
        intro:
          "Nothing to install, for anyone, including whoever administers your tracker.",
        body: [
          "Paste a backlog straight out of Jira, Linear, Azure DevOps or a spreadsheet into the queue, size it as a team, then export the agreed estimates as CSV and bulk-update the tracker. There is no plugin, no OAuth prompt and no admin approval ticket standing between you and Thursday's refinement session.",
          "Sharing works the same way. The room is a URL, so it goes into Slack, Teams, Zoom, Meet or a calendar invite and everyone joins from the browser they already have open, on a laptop or a phone.",
        ],
      },
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
    eyebrow: "Planning poker online",
    h1: "Planning Poker Online for Remote Agile Teams",
    intro:
      "Run planning poker online in any browser. Create a room, invite the team with one link, reveal together, and estimate stories fast without installs or account setup.",
    highlights: [
      { value: "One link", label: "Paste it in Slack, Teams, or the call" },
      { value: "No install", label: "Any browser, desktop or mobile" },
      { value: "Live", label: "Everyone reveals at the same moment" },
    ],
    body: [
      "Everyone joins from the browser they already have open — desktop or mobile, no extension, no app store, no sign-up. Paste the link into Slack, Teams, or the meeting chat and the room fills in seconds.",
      "The facilitator drives reveal, re-votes, and the item queue. Everyone else just plays a card. That keeps a distributed ceremony to the length it should be.",
    ],
    stepsTitle: "How to run planning poker online",
    stepsIntro:
      "Five steps, and the only one that needs preparation is the baseline.",
    steps: [
      "Open a room and share the link. Nobody needs an account, so latecomers can join mid-session without breaking the flow.",
      "Agree a baseline story everyone remembers, and give it a number. Every later estimate is relative to that one.",
      "Read the item, then everyone plays a card privately. Nothing is visible until the whole table has voted.",
      "Reveal together, and ask the highest and lowest voters what they are each looking at. That is where the useful information is.",
      "Record the agreed number and move on. Re-vote once if the discussion genuinely changed what people think.",
    ],
    sections: [
      {
        title: "What changes when the room is remote",
        intro:
          "The ceremony is the same. The failure modes are different, and they are mostly about who speaks first.",
        bullets: [
          "In a video call, the first person to unmute sets the anchor. A simultaneous reveal removes that entirely — nobody sees a number until everyone has committed to one.",
          "Silence reads as agreement on a call when it usually means someone is not sure. A card forces a position from everyone, including the quiet half of the team.",
          "Screen-shared spreadsheets put one person in control of the record. A shared room lets everybody see the same state without anyone driving.",
          "Timezone-split teams lose the most to overrunning meetings, which is why a stopping rule matters more here than in a room.",
        ],
      },
      {
        title: "Using it alongside the call you are already on",
        intro:
          "This is not a replacement for the meeting — it is the estimation surface inside it.",
        body: [
          "Keep the video call for the conversation and put the room on a second window or a phone. The room carries the votes and the queue; the call carries the discussion about the spread. Trying to do both in one window is what makes people drop off the call to find the link.",
          "For a team that estimates every fortnight, a Team Room gives you a URL built from the team name that stays the same between sessions, so it can live in the recurring calendar invite rather than being re-shared each time.",
        ],
      },
    ],
    faq: [
      {
        q: "How do you play planning poker online?",
        a: "Open a room, share the link with the team, and read out the item being estimated. Everyone picks a card privately, the facilitator reveals all votes at once, and the team discusses only where the estimates disagree before agreeing a final number. Then the next item. The online part changes nothing about the method — it only removes the physical deck and the shared table.",
      },
      {
        q: "Can you run planning poker during a video call?",
        a: "Yes, and that is the usual setup. Keep Zoom, Teams, or Meet open for the discussion and use the room for the voting, either in a second window or on a phone. Paste the room link into the meeting chat so nobody has to hunt for it.",
      },
      {
        q: "What happens if someone joins late or loses connection?",
        a: "They open the same link and rejoin. A refresh puts you back into the room you were already in rather than starting a new session, so a dropped connection or a closed laptop lid does not cost you the round or the queue.",
      },
      {
        q: "Can a distributed team estimate without meeting at all?",
        a: "You can collect the votes asynchronously, but you will lose most of the benefit. The value of planning poker is in the conversation the disagreement triggers — a spread of 3 to 13 with nobody there to explain it is just a number nobody trusts. If the team genuinely cannot meet, estimate a smaller set of items in a shorter live session instead.",
      },
      {
        q: "Is there a free planning poker tool with no sign-up?",
        a: "Point Poker is free with no account required to create or join a room, and no participant limit tier — the room holds up to 20 people whoever you are. Signing in is optional and only adds Team Rooms with a reusable URL, plus sprint history.",
      },
    ],
    related: [
      { href: "/scrum-poker", kicker: "Scrum", title: "Scrum poker", copy: "The same ceremony under the name scrum teams tend to use for it." },
      { href: "/planning-poker-jira", kicker: "Trackers", title: "Planning poker with Jira", copy: "Paste the backlog in, get the estimates out. No plugin, no admin approval." },
      { href: "/features", kicker: "Product", title: "All features", copy: "Decks, timers, story queue, sprint history and CSV export." },
    ],
  },
  "/scrum-poker": {
    eyebrow: "Scrum poker",
    h1: "Free Scrum Poker App for Sprint Planning",
    intro:
      "Use Point Poker as a scrum poker app for sprint planning and backlog refinement, with fast, unbiased story-point discussions across a distributed team.",
    highlights: [
      { value: "Scrum", label: "Built for refinement and sprint planning" },
      { value: "Fair", label: "Votes reveal together, so nobody anchors" },
      { value: "Free", label: "No account, no card, no seat limit" },
    ],
    body: [
      "Scrum poker and planning poker are the same ceremony under two names: the team sizes work relatively, votes simultaneously, and talks only about the gaps.",
      `Rooms hold up to ${MAX_PARTICIPANTS} people including facilitators, which covers a full scrum team plus product, design, and QA in one session.`,
    ],
    sections: [
      {
        title: "Where scrum poker fits in the sprint",
        intro:
          "The ceremony earns its time in the two places where the team has to agree on size before it commits to anything.",
        bullets: [
          "Backlog refinement — size the items coming up, and find the ones whose acceptance criteria are too thin to size at all.",
          "Sprint planning — work the queue, and leave with a sprint the whole team has actually agreed to rather than one the loudest voice set.",
          "Mid-sprint, when a story turns out bigger than it looked — re-size it as a team instead of letting one person absorb the surprise.",
        ],
      },
      {
        title: "What a scrum poker tool has to get right",
        intro:
          "Most of the value is in the reveal. Everything else is logistics.",
        bullets: [
          "Simultaneous reveal — if one estimate lands before the others, the rest drift toward it. That bias is the whole reason the ceremony exists.",
          "A facilitator who does not vote — the Scrum Master or whoever runs the room needs to watch the spread, not add to it.",
          "A spread that is visible, not averaged away — a 3 against a 13 is the useful part of the session, and averaging it hides the disagreement.",
          "A join flow with no account — a guest who has to sign up before voting is a guest who joins five minutes late.",
        ],
      },
      {
        title: "Running the session without it overrunning",
        intro:
          "Estimation meetings sprawl when the discussion has no stopping rule. These are the ones that hold.",
        bullets: [
          "Size relative to a story everyone remembers, not in hours. Pick that baseline before the first vote.",
          "Discuss the outliers only. If the table is within one card of each other, record it and move on.",
          "Time-box the discussion, then re-vote. A second vote after two minutes of context beats ten minutes of debate.",
          "A story nobody can size is a finding, not a failure — send it back for splitting rather than guessing at it.",
        ],
      },
    ],
    faq: [
      {
        q: "What is scrum poker?",
        a: "Scrum poker is a consensus estimation technique where each member of a scrum team privately picks a card representing the relative size of a backlog item, everyone reveals at once, and the team discusses the disagreements before agreeing a number. It is the same practice as planning poker — scrum teams simply tend to call it scrum poker.",
      },
      {
        q: "Does the Scrum Guide require planning poker?",
        a: "No. The Scrum Guide does not mention planning poker, story points, or any specific estimation technique — it only says the Developers size the work. Scrum poker is a widely used convention that fits Scrum well, not a rule you are failing to follow if you estimate some other way.",
      },
      {
        q: "Who should take part in scrum poker?",
        a: "Everyone who will do the work votes — developers, QA, and anyone else delivering the item. The Product Owner answers questions about intent but does not usually vote, since they are not estimating their own effort. The Scrum Master facilitates and stays out of the voting entirely.",
      },
      {
        q: "What do you do when the team cannot agree on an estimate?",
        a: "Ask the highest and lowest voters to explain what they are seeing — they are usually looking at different work. Then re-vote. If a second round still splits the table, the story is generally too vague or too large, and splitting it is a better outcome than settling on a middle number nobody believes.",
      },
      {
        q: "How long should a scrum poker session take?",
        a: "Around a minute or two per item once the team has a baseline, so a refinement session of ten to fifteen items fits comfortably in half an hour. Sessions that run long are usually a symptom of items arriving without acceptance criteria, not of the estimation itself being slow.",
      },
    ],
    related: [
      { href: "/what-is-planning-poker", kicker: "Guide", title: "What is planning poker?", copy: "The method itself, and why the simultaneous reveal is the part that matters." },
      { href: "/fibonacci-story-points", kicker: "Deck", title: "Fibonacci story points", copy: "Why the gaps widen, and what a 21 or a 34 is really telling you." },
      { href: "/story-point-estimation", kicker: "Practice", title: "Story point estimation", copy: "Turning the votes into estimates the team will still stand behind next sprint." },
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
  /* Converted from a hand-written component, which had drifted from this
     object in two directions at once: its h1 was a 110-character sentence
     where the prerender and the BreadcrumbList both said "What Is Planning
     Poker?", and its three sections were invisible to every crawler that does
     not run JavaScript. The six translations of this page were written with a
     full FAQ, so leaving the English one without meant the source language was
     the thinnest of the seven — and a translation asserting more than its
     original is backwards. */
  "/what-is-planning-poker": {
    eyebrow: "Guide",
    h1: "What Is Planning Poker?",
    intro:
      "Planning poker is a consensus estimation technique where every team member privately picks a card representing effort, then everyone reveals at the same time. Consensus comes out of the conversation about the differences, not out of the average.",
    highlights: [
      { value: "Private", label: "Everyone estimates before anyone sees a number" },
      { value: "Together", label: "The cards all turn over at once" },
      { value: "Relative", label: "Size compared, not hours counted" },
    ],
    body: [
      "The simultaneous reveal is the whole mechanism. If people call out numbers in sequence, the first number anchors everyone after it, and the estimate becomes a measure of seniority rather than complexity. When the table turns over at once, there is no anchor.",
      "When the cards disagree, the highest and lowest voters explain what they are each looking at. That conversation — not the arithmetic — is where the value is, because it surfaces hidden assumptions and missing acceptance criteria before the sprint starts rather than halfway through it.",
    ],
    sections: [
      {
        title: "Where the method came from",
        body: [
          "James Grenning described the technique in 2002, during an estimation meeting that was getting away from him. Mike Cohn's Agile Estimating and Planning put the name in front of most of the industry three years later. The Scrum Guide does not require it anywhere — it says only that the Developers size the work. Planning poker is therefore a widely used convention that fits Scrum well, not a rule you are breaking by estimating some other way.",
          "The name comes from the cards and the simultaneous reveal, not from betting. Each player holds a hand of numbered cards, plays one face down, and the whole table turns over together. Nothing is wagered and there is no winner.",
        ],
      },
      {
        title: "Why relative size rather than hours",
        intro: "An estimate in hours promises a precision nobody has at the moment of estimating.",
        bullets: [
          "People are bad at estimating absolute durations and good at comparing two things. Story points use the ability that actually works.",
          "Hours are attached to a person. \"Two days\" is two days for whom? Relative size holds for the team and stays comparable when somebody else picks the work up.",
          "The uncertainty is inside the size. A 13 is large partly because nobody is sure what is in it, and an hours figure hides that.",
          "The date comes later, from measured velocity: points completed per sprint. That sharpens every sprint, where a conversion table drifts further from reality the longer it is used.",
        ],
      },
      {
        title: "How a round runs",
        intro: "The same in a room or across six time zones.",
        bullets: [
          "The Product Owner reads the item out and answers questions, but does not usually vote — they are not estimating their own effort.",
          "Everyone who will do the work picks a card privately. Development and QA both vote.",
          "All cards reveal at the same time.",
          "If everyone is within one card of each other, record the number and move on.",
          "If not, the highest and lowest voters explain briefly, then re-vote. Two minutes of context beats ten of debate.",
          "If a second round still splits the table, the item is usually too large or too vague. Splitting it is a better outcome than a middle number nobody believes.",
        ],
      },
    ],
    stepsTitle: "Planning poker in six steps",
    steps: HOW_TO_STEPS,
    faq: [
      {
        q: "What is planning poker in simple terms?",
        a: "Planning poker is an estimation technique for agile teams: everyone privately picks a card carrying a number for the effort of a piece of work, then everyone reveals at the same time. Where the numbers differ the team discusses briefly and votes again, until they agree. Picking privately is what stops everyone converging on the first number said out loud.",
      },
      {
        q: "How does a round of planning poker work?",
        a: "The Product Owner presents the item and answers questions. Everyone who will do the work picks a card privately. All the cards reveal at once. If they are close, the number is recorded. If not, the highest and lowest voters explain what they are seeing and the team re-votes. With a little practice each item takes one to two minutes.",
      },
      {
        q: "Who takes part in planning poker?",
        a: "Everyone who will do the work: development, QA, and anyone else contributing. The Product Owner answers questions about intent but does not usually vote. The Scrum Master facilitates and stays out of the voting, so they can watch the spread rather than add to it.",
      },
      {
        q: "What numbers are used in planning poker?",
        a: "Most often the Fibonacci sequence: 1, 2, 3, 5, 8, 13, 21 and 34, almost always with a ? card meaning \"I cannot size this from what I have been told\". The gaps widen on purpose, because uncertainty grows with size. T-shirt sizes (XS to XXL) and powers of 2 are common alternatives and work just as well.",
      },
      {
        q: "What do you do when the team cannot agree?",
        a: "Ask the highest and lowest voters to explain what they are each picturing — almost always they are looking at different work. Then re-vote. If a second round still splits the table, the story is usually too vague or too large, and splitting it beats settling on a middle number nobody stands behind.",
      },
    ],
    related: [
      { href: "/planning-poker-online", kicker: "Workflow", title: "Planning poker online", copy: "How the product turns the ceremony into a browser-first, live estimation flow." },
      { href: "/fibonacci-story-points", kicker: "Deck", title: "Fibonacci story points", copy: "Why the gaps widen, and what a 21 or a 34 is really telling you." },
      { href: "/scrum-poker", kicker: "Ceremony", title: "Scrum poker", copy: "Where the method gets used: refinement and sprint planning." },
    ],
  },
  "/fibonacci-story-points": {
    eyebrow: "Fibonacci story points",
    h1: "Fibonacci Story Points Explained",
    intro:
      "Agile teams estimate in Fibonacci story points — 1, 2, 3, 5, 8, 13, 21, 34 — because uncertainty grows with size, and the widening gaps stop teams pretending otherwise.",
    highlights: [
      { value: "1→34", label: "The deck Point Poker opens with" },
      { value: "Wider gaps", label: "Bigger work, less precision, honestly" },
      { value: "21+", label: "Usually means split it, not size it" },
    ],
    body: [
      "Nobody can reliably tell a 7 from an 8. The Fibonacci gaps force a real choice between clearly different sizes, which makes estimates faster and more honest.",
      "A large card is a signal, not a number: 21 and 34 usually mean the story should be split before it enters a sprint.",
    ],
    sections: [
      {
        title: "Why the gaps widen",
        intro:
          "The sequence is not chosen for its mathematics. It is chosen because the spacing matches how confidence actually decays.",
        body: [
          "Between 1 and 2 you are choosing between two things you understand well, and the difference is real. Between 21 and 34 you are choosing between two things you barely understand, and a finer scale would only invite false precision. The widening gaps encode that: the bigger the work, the coarser the honest answer.",
          "This is also why a team that argues over 8 versus 13 for ten minutes is usually arguing about scope, not size. On a Fibonacci deck adjacent cards are far apart on purpose, so a genuine split between them means the two voters are picturing different work.",
        ],
      },
      {
        title: "The deck Point Poker uses",
        intro:
          "1, 2, 3, 5, 8, 13, 21, 34, and a ? card.",
        body: [
          "The ? is not a zero and not a joke — it means \"I cannot size this from what I have been told\", which is a legitimate and useful answer. A table of question marks says the item needs work before it needs an estimate, and Point Poker deliberately does not treat a unanimous ? as consensus.",
          "Plenty of teams use a modified sequence instead — 0, ½, 1, 2, 3, 5, 8, 13, 20, 40, 100 is the common variant, rounding the large end for readability. Either works. What matters is that the team uses one deck consistently, because story points only mean anything relative to the team's own past estimates.",
        ],
        bullets: [
          "T-shirt sizes (XS to XXL) do the same job when a team wants to avoid numbers entirely — Point Poker excludes them from the numeric average for obvious reasons.",
          "Powers of 2 (1, 2, 4, 8, 16, 32) is the other common alternative, and behaves much like Fibonacci in practice.",
        ],
      },
      {
        title: "Using the deck well",
        intro:
          "The sequence does not produce good estimates on its own. These habits do.",
        bullets: [
          "Anchor on a baseline story first. A 3 means nothing until the team agrees on one story that is a 3.",
          "Never record a number that is not on the deck. A 4 or a 6 means the team split and someone averaged it, and the history stops being comparable.",
          "Treat a split as information. Re-vote after the two ends of the spread explain themselves; do not average.",
          "Re-baseline occasionally. A team that has been running a year has usually drifted, and that is normal rather than a problem to fix retroactively.",
        ],
      },
    ],
    faq: [
      {
        q: "What is the Fibonacci sequence for story points?",
        a: "Most teams use 1, 2, 3, 5, 8, 13, 21 and 34, where each number is the sum of the two before it. Many use a modified version — 0, ½, 1, 2, 3, 5, 8, 13, 20, 40, 100 — which rounds the large end. Point Poker opens with 1 to 34 plus a ? card.",
      },
      {
        q: "What does a 13-point story mean?",
        a: "It means the team thinks the item is large and is less confident about it than about anything smaller. In most teams a 13 is the last size still worth putting in a sprint, and a 21 or above is a prompt to split the story rather than an estimate to plan around.",
      },
      {
        q: "Should the team use a 0 or a half-point card?",
        a: "Only if you have real work that small. A 0 is useful for an item that is genuinely free because it rides along with another story, and a ½ for trivial changes. Both tend to cause more debate than they save, which is why the default deck here starts at 1.",
      },
      {
        q: "What if the team is split between 3 and 5?",
        a: "Ask both sides what they are picturing — a two-card split almost always means someone is including work the other person is not. Then re-vote and record whichever card the team lands on. Do not record a 4: it is not on the deck, and the moment your history contains numbers the deck cannot produce, comparing sprints stops working.",
      },
      {
        q: "Is there a Fibonacci estimation template we can use?",
        a: "The deck is the template — there is nothing to download or configure. Open a room and the Fibonacci sequence is already the active deck, with T-shirt sizes and powers of 2 available if the team prefers those. If you want the results as a file afterwards, each session exports to CSV.",
      },
    ],
    related: [
      { href: "/story-points-to-hours", kicker: "Guide", title: "Story points to hours", copy: "Why there is no conversion rate, and what to forecast with instead." },
      { href: "/scrum-poker", kicker: "Ceremony", title: "Scrum poker", copy: "Where the deck gets used: refinement and sprint planning." },
      { href: "/what-is-planning-poker", kicker: "Guide", title: "What is planning poker?", copy: "The method itself, and why everyone reveals at once." },
    ],
  },
  "/pointing-poker": {
    eyebrow: "Pointing poker",
    highlights: [
      { value: "6 names", label: "One ceremony, six things teams call it" },
      { value: "1 game", label: "Private vote, reveal together, discuss the gap" },
      { value: "$0", label: "Every feature, every team, no account" },
    ],
    related: [
      { href: "/what-is-planning-poker", kicker: "Guide", title: "What is planning poker?", copy: "The ceremony itself: why the simultaneous reveal is the part that does the work." },
      { href: "/fibonacci-story-points", kicker: "Guide", title: "Fibonacci story points", copy: "Why the gaps widen, and what a 21 or a 34 is really telling you." },
      { href: "/", kicker: "Product", title: "Open a free room", copy: "No account, no install. Create a room and paste the link into your team chat." },
    ],
    h1: "Pointing Poker: The Same Game Under Six Names",
    intro:
      "Pointing poker is planning poker. So are poker planning, sprint poker, estimation poker, agile poker and scrum poker. One ceremony, six labels, and the mechanism underneath is identical every time: everyone picks a card privately, all the cards turn over at once, and the team talks about the gap.",
    body: [
      "Which name you use mostly says where you learned it rather than what you do. James Grenning described the technique in 2002, and Mike Cohn's Agile Estimating and Planning put the name \"planning poker\" in front of most of the industry three years later. \"Scrum poker\" attaches it to the framework teams usually run it inside. \"Pointing poker\" and \"story point poker\" name the unit instead of the ceremony. \"Poker planning\" is the same two words the other way round. \"Sprint poker\" names the meeting it happens in. None is more correct than the others, and no tool behaves differently depending on which one you typed into Google.",
      "What every version shares is the simultaneous reveal, and that is the part doing the work. When people call out numbers in turn, the first number spoken becomes an anchor and everyone after it drifts toward it — so the estimate ends up measuring seniority rather than complexity. Turning all the cards over at the same moment removes the anchor. That is the whole trick, and it is why a ceremony that looks slightly silly on paper has outlasted most of the estimation techniques that replaced it.",
    ],
    sections: [
      {
        title: "The six names and where each comes from",
        bullets: [
          "Planning poker — the original name, from the 2002 technique and the 2005 book that popularised it",
          "Scrum poker — the same ceremony, named after the framework most teams run it inside",
          "Pointing poker — named after the unit, the story point, rather than the meeting",
          "Poker planning — the same two words in the other order, common outside English-first teams",
          "Sprint poker — named after the meeting, usually sprint planning or backlog refinement",
          "Estimation poker and agile poker — generic labels for the same private-vote-then-reveal loop",
        ],
      },
      {
        title: "What stays the same whichever name you use",
        bullets: [
          "Everyone sizes the work privately, so nobody sees a number before choosing their own",
          "All cards reveal at the same instant, which is what removes the anchoring bias",
          "Numbers come from a scale with widening gaps, usually Fibonacci, so close calls are not on the table",
          "Disagreement is the point — the highest and lowest voters explain, and that surfaces missing acceptance criteria",
          "The team agrees one number and moves on, rather than averaging its way to a decision nobody holds",
        ],
      },
    ],
    faq: [
      {
        q: "What is pointing poker?",
        a: "Pointing poker is a consensus estimation technique where every team member privately picks a card representing the size of a piece of work, and everyone reveals at the same time. It is the same thing as planning poker — the name just refers to the story point rather than to the planning meeting.",
      },
      {
        q: "Is pointing poker the same as planning poker?",
        a: "Yes. Pointing poker, planning poker, poker planning, scrum poker, sprint poker, estimation poker and agile poker all describe one ceremony: private sizing, simultaneous reveal, discussion where the cards disagree. Any tool built for one works for all of them, including this one.",
      },
      {
        q: "What is poker planning?",
        a: "Poker planning is planning poker with the two words swapped, and it means exactly the same thing. The order varies by team and by region rather than by method — there is no difference in how the session is run.",
      },
      {
        q: "What is sprint poker?",
        a: "Sprint poker is planning poker named after the meeting it usually happens in. Teams run it during sprint planning or backlog refinement to size the items they are considering pulling into the next sprint.",
      },
      {
        q: "Is there a free pointing poker tool?",
        a: `Yes, this one. Every feature is free for every team: up to ${MAX_PARTICIPANTS} people per room, unlimited rounds, unlimited stories, all three card decks, the timer, facilitator analytics and CSV export. No account is needed to run or join a room, and there are no ads.`,
      },
      {
        q: "Why is it called poker at all?",
        a: "Because of the cards and the simultaneous reveal, not because anyone is betting. Each player holds a hand of numbered cards, plays one face down, and the whole table turns over together. Nothing is wagered and there is no winner.",
      },
    ],
  },
  "/story-points-to-hours": {
    eyebrow: "Story points and time",
    highlights: [
      { value: "No rate", label: "A point is relative size, not a unit of clock time" },
      { value: "Velocity", label: "Points completed per sprint, measured not assumed" },
      { value: "A range", label: "How an honest forecast gets reported" },
    ],
    related: [
      { href: "/fibonacci-story-points", kicker: "Guide", title: "Fibonacci story points", copy: "Why 1, 2, 3, 5, 8, 13 and not a smooth scale — the gaps carry the uncertainty." },
      { href: "/story-point-estimation", kicker: "Guide", title: "Story point estimation", copy: "Running the estimate itself, and what a split vote is actually telling you." },
      { href: "/", kicker: "Product", title: "Size a real story", copy: "Open a free room and try it on something you have to estimate this sprint." },
    ],
    h1: "Story Points to Hours: There Is No Conversion Rate",
    intro:
      "There is no correct number of hours in a story point, and a team that settles on one has quietly gone back to estimating in time. That is the honest answer. The useful answer is that this is almost always a forecasting question wearing a disguise — and forecasting has a real method that does not need a conversion at all.",
    body: [
      "A story point measures relative size: effort, complexity and uncertainty rolled into one number. A 5 is meant to be roughly five times the size of a 1 for your team, this quarter, with the people you currently have. It is not five times any fixed amount of clock time, and the same 5 in another team's backlog may take a completely different number of days.",
      "The reason a fixed ratio breaks is that uncertainty is the part you cannot convert. A 1-point story is well understood, so the spread of durations it could actually take is narrow. A 13 is large partly because nobody is sure what is inside it, so its spread is wide. Multiplying both by the same hours-per-point number throws away precisely the information the bigger card was carrying, and hands a stakeholder a figure that looks more precise than anything the team said.",
    ],
    sections: [
      {
        title: "What to do instead: forecast with velocity",
        intro:
          "Velocity is points completed per sprint, measured rather than assumed. It answers the question the conversion was reaching for, and it gets more accurate over time instead of less.",
        body: [
          "Say a team finished 8, 13 and 9 points over its last three sprints. Average velocity is 10 points a sprint, with an observed range of 8 to 13. A 40-point backlog is therefore about four sprints — and reported honestly, three to five.",
          "That forecast is built entirely from what this team actually did. It needs no hours-per-point number, it accounts for the team's real capacity including meetings and support work, and it sharpens every sprint as the sample grows. A conversion table does the opposite: it hides a change in velocity instead of measuring it, so it drifts further from reality the longer it is used.",
        ],
      },
      {
        title: "Why the question keeps coming up",
        bullets: [
          "Somebody outside the team needs a date, and points do not answer that on their own — velocity does",
          "A new team has no velocity yet, so points feel unanchored for the first two or three sprints",
          "Time-based reporting or billing is imposed from elsewhere, and points have to be translated at the boundary",
          "The team is using points as a relabelled day estimate already, in which case the conversion just makes it visible",
        ],
      },
      {
        title: "The one place a rough figure is defensible",
        body: [
          "If you must give a boundary figure — a contract, a budget line, an external commitment — derive it from your own velocity and state it as a range, not a rate. \"Our last six sprints ran 8 to 13 points, so this 40-point scope is three to five sprints\" is defensible, because every number in it was measured. \"One point is six hours\" is not, because that number was chosen.",
          "Keep the conversion at the boundary and out of the estimation session. The moment the team starts sizing cards by mentally multiplying to hours, the ceremony has stopped measuring relative size and the wide-gap scale has no purpose left.",
        ],
      },
    ],
    faq: [
      {
        q: "How many hours is a story point?",
        a: "There is no fixed answer, and that is by design. Story points measure relative size rather than duration, so the number of hours in a point differs between teams and drifts within one team as it learns the domain. If you need a duration, use your team's measured velocity — points completed per sprint — rather than an hours-per-point rate.",
      },
      {
        q: "How many hours is 5 story points?",
        a: "Nobody can tell you without knowing the team, and any tool that answers with a number is guessing. A 5 means roughly five times the size of your team's 1-point reference story. To turn that into time, divide the sprint's points by the sprint length using your own recent velocity, and quote the result as a range.",
      },
      {
        q: "How do you convert story points to days?",
        a: "You do not convert them item by item. You forecast in aggregate: take the points the team actually completed in recent sprints, average them, and divide the remaining scope by that velocity. A team averaging 10 points a sprint will take about four sprints to clear 40 points — a forecast built from measurement rather than from a chosen ratio.",
      },
      {
        q: "Why should story points not be converted to hours?",
        a: "Because the conversion discards the uncertainty the scale exists to express. A 1 is well understood and a 13 is not, so their ranges of possible durations are nothing alike. Applying one multiplier to both produces a precise-looking number with none of the precision, and it re-creates the time estimates story points were adopted to get away from.",
      },
      {
        q: "How do you estimate a sprint without converting points to hours?",
        a: "Pull work until the points add up to roughly your recent average velocity, then stop. A team that has completed 8, 13 and 9 points in three sprints plans around 10 and treats anything above 13 as optimistic. No hours are involved at any step, and the plan is anchored to what the team has actually delivered.",
      },
      {
        q: "Do story points measure time at all?",
        a: "Indirectly and in aggregate, never per item. Effort is one of the three things a point rolls up, alongside complexity and uncertainty, so a bigger number does correlate with more time. But the correlation only becomes useful once you have several sprints of completed points to average, and it holds for a batch of stories rather than for any single card.",
      },
    ],
  },
  "/planning-poker-jira": {
    eyebrow: "Planning poker and Jira",
    highlights: [
      { value: "0 plugins", label: "Nothing to install, nothing for an admin to approve" },
      { value: "Paste in", label: "A whole backlog into the queue, one item per line" },
      { value: "CSV out", label: "Bulk-update Jira, Linear or Azure DevOps from the export" },
    ],
    related: [
      { href: "/features", kicker: "Product", title: "Feature breakdown", copy: "Bulk paste, the story queue, facilitator analytics and what the CSV contains." },
      { href: "/remote-sprint-planning", kicker: "Guide", title: "Remote sprint planning", copy: "Running the ceremony across a distributed team, and reusing one room every sprint." },
      { href: "/", kicker: "Product", title: "Open a free room", copy: "Paste this sprint's issues in and size them. No account and no admin ticket." },
    ],
    h1: "Planning Poker with Jira, Without Installing Anything",
    intro:
      "Point Poker has no Jira plugin. You do not need one: paste your issues into a room, estimate them together, export the agreed points as CSV, and bulk-update Jira from the file. No Marketplace install, no admin approval queue, and everyone who is not facilitating just opens a link.",
    body: [
      "Most planning poker tools that advertise a Jira integration need somebody with Jira admin rights to install an app, approve its permission scopes, and frequently move the team onto a paid plan first. In a lot of organisations that is a two-week ticket for a ceremony that is happening on Thursday. The workflow below runs this afternoon, and works the same whether your tracker is Jira, Linear, Azure DevOps, Trello, GitHub Projects or a spreadsheet.",
      "What you give up is automatic write-back. With an installed plugin the estimate lands on the issue the moment you record it; here you record estimates in the room and push them to the tracker in one bulk edit at the end. For an hour of refinement that is a single extra step. If your team genuinely needs per-issue write-back as it happens, an installed plugin is the better fit, and it is worth saying so plainly rather than pretending otherwise.",
    ],
    // Names the HowTo schema as well as the on-page heading, so the structured
    // data describes this procedure rather than the home page's.
    stepsTitle: "How to run planning poker with Jira, step by step",
    stepsIntro: "Five steps, and none of them is an install.",
    steps: [
      "In Jira, select the issues you are refining and copy the keys and summaries",
      "Open a Point Poker room and paste the whole list into the queue, one item per line",
      "Work the queue: everyone votes, the cards reveal together, the facilitator records the agreed number",
      "Download the session CSV, which pairs each item with its final estimate",
      "Back in Jira, bulk-edit the same issues and set Story Points from the CSV column",
    ],
    sections: [
      {
        title: "Why bulk paste is the part that matters",
        body: [
          "The queue accepts one item per line, so a backlog copied straight out of a Jira filter, a Linear view or a spreadsheet lands in the room in a single paste. That is the step that usually justifies an integration, and it takes about five seconds without one.",
          "Keep the issue key at the start of each line. It survives into the CSV export, which is what makes the bulk edit at the other end a paste rather than a retyping exercise.",
        ],
      },
      {
        title: "The same flow for other trackers",
        bullets: [
          "Linear — copy identifiers and titles from a view, paste in, export CSV, bulk update",
          "Azure DevOps — the CSV imports through the standard work item import, mapping to Effort or Story Points",
          "Trello, GitHub Projects, Asana, Monday, ClickUp, Notion — any tool that takes a CSV or a bulk edit",
          "A spreadsheet — the CSV opens directly in Excel, Google Sheets or Numbers",
        ],
      },
      {
        title: "Running it inside Slack, Teams, Zoom or Meet",
        body: [
          "There is no Slack app or Teams app either, and for the same reason: the room is a URL. Paste it into the channel or the meeting chat and everyone joins from the browser already open in front of them, on a laptop or a phone. Nobody installs anything and nobody signs in.",
          "On a video call, the facilitator usually shares their screen so the table and the reveal are visible to the room, while each person votes on their own device. That works identically in Zoom, Teams, Meet and Webex because none of them are involved.",
        ],
      },
    ],
    faq: [
      {
        q: "Does Point Poker have a Jira integration?",
        a: "No. There is no Marketplace plugin, no OAuth connection and no write-back to issues. The supported path is bulk paste in and CSV export out, which needs no admin permissions and works with every tracker rather than one. If per-issue write-back matters more to your team than avoiding the install, a plugin-based tool is the honest recommendation.",
      },
      {
        q: "How do I use planning poker with Jira for free?",
        a: "Copy the issue keys and summaries from your Jira filter, paste them into a Point Poker room queue one per line, estimate as a team, then export the CSV and bulk-edit Story Points in Jira from it. Every part of that is free here, with no participant cap below 20 and no limit on how many issues you size in a session.",
      },
      {
        q: "How do I get the estimates back into Jira?",
        a: "Download the session CSV from the facilitator panel. It pairs every item with its agreed estimate, so if you kept the Jira key at the start of each line you can bulk-edit the same set of issues and fill Story Points straight from the export. The clipboard summary works too if you would rather paste into a ticket comment.",
      },
      {
        q: "Does this work with Azure DevOps, Linear or Trello?",
        a: "Yes, and in exactly the same way, because nothing in the flow is Jira-specific. Anything you can copy a list out of can be pasted into the queue, and the CSV export imports anywhere that accepts a CSV — Azure DevOps work item import, Linear, Trello, GitHub Projects, or a spreadsheet.",
      },
      {
        q: "Can I run planning poker inside Microsoft Teams or Slack?",
        a: "You can run it from Teams or Slack without an app: paste the room link into the channel or meeting chat and everyone joins in their browser. There is no Teams app and no Slack bot to install, so there is nothing for an IT administrator to approve before Thursday's refinement session.",
      },
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

/* ── LOCALE ROUTES ──────────────────────────────────────────────────
   The translated pages are folded into the same three tables the English
   ones live in, keyed by their full path ("/de/scrum-poker"). Everything
   downstream — the router, applyRouteMeta, <ContentPage>, the prerenderer,
   the sitemap — then works on them without knowing locales exist.

   `locale` and `basePath` ride along on each meta entry so the prerenderer
   can emit the right <html lang>, og:locale, JSON-LD inLanguage and the
   hreflang set without re-parsing the URL it was handed.
─────────────────────────────────────────────────────────────────── */

// The translations are written with {max} and {email} rather than a literal
// 20 and a literal address, so the participant cap the Firebase rules enforce
// cannot drift away from the cap six languages of marketing copy advertise.
const VARS = { max: MAX_PARTICIPANTS, email: SUPPORT_EMAIL };
const fillVars = (node) => {
  if (typeof node === "string") {
    return node.replace(/\{(\w+)\}/g, (m, k) => (k in VARS ? String(VARS[k]) : m));
  }
  if (Array.isArray(node)) return node.map(fillVars);
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fillVars(v)]));
  }
  return node;
};

export const localeUrl = (code, path) => {
  const { prefix } = LOCALES[code];
  if (!prefix) return path;
  return path === "/" ? `${prefix}/` : `${prefix}${path}`;
};

/* English pages in the translated set need the same alternates the translated
   ones carry, or the hreflang cluster is one-directional and Google ignores it.

   "/" is deliberately not written into STATIC_ROUTE_META: sitemapPaths()
   builds ["/", ...Object.keys(STATIC_ROUTE_META)], so adding it here would
   put the home page in the sitemap twice. It carries its tags on DEFAULT_META
   instead, which is the object every consumer already falls back to. */
DEFAULT_META.locale = "en";
DEFAULT_META.basePath = "/";
for (const path of LOCALIZED_PATHS) {
  if (path === "/") continue;
  STATIC_ROUTE_META[path] = { ...STATIC_ROUTE_META[path], locale: "en", basePath: path };
}

/* The router has to recognise every locale URL from the first render, or a
   direct hit on /de/scrum-poker falls through to the join screen before the
   German chunk has landed. These are just path-to-path strings — no
   translation involved — so they are installed eagerly and cost nothing.

   The home page is the app, so its locale URL renders JoinScreen. Every other
   localized page is prose, and its screen is its own path — the same trick
   STATIC_SCREEN_BY_PATH already uses for the English data pages. */
for (const code of TRANSLATED_LOCALES) {
  for (const path of LOCALIZED_PATHS) {
    STATIC_SCREEN_BY_PATH[localeUrl(code, path)] = path === "/" ? "join" : localeUrl(code, path);
  }
}

/* The words arrive with the language chunk. Idempotent, so calling it twice —
   which the tests and the prerenderer both do — is harmless. */
export function installLocaleRoutes(code) {
  if (!LOCALE_CONTENT[code] || !LOCALE_META[code]) return false;
  for (const path of LOCALIZED_PATHS) {
    const url = localeUrl(code, path);
    const m = LOCALE_META[code][path];
    ROUTE_CONTENT[url] = fillVars(LOCALE_CONTENT[code][path]);
    STATIC_ROUTE_META[url] = {
      title: fillVars(m.title),
      description: fillVars(m.description),
      canonical: `${SITE_URL}${url}`,
      ogUrl: `${SITE_URL}${url}`,
      robots: "index, follow",
      locale: code,
      basePath: path,
    };
  }
  return true;
}

/* Fetch a language and wire its pages into the route tables. This is what
   src/index.js awaits before the first render. */
export async function activateLocale(code) {
  const resolved = await loadLocale(code);
  installLocaleRoutes(resolved);
  return resolved;
}

/* Every language at once, for the prerenderer, the sitemap generator and the
   tests. None of those ships to a browser, so the size does not matter there. */
export async function activateAllLocales() {
  await loadAllLocales();
  TRANSLATED_LOCALES.forEach(installLocaleRoutes);
}

/* Every URL a path exists at, including its own — reciprocal by construction,
   which is the condition Google puts on honouring any hreflang at all. */
export const alternatesFor = (basePath) =>
  LOCALIZED_PATHS.includes(basePath)
    ? LOCALE_CODES.map((code) => ({
        code,
        hreflang: LOCALES[code].hreflang,
        url: `${SITE_URL}${localeUrl(code, basePath)}`,
      }))
    : [];

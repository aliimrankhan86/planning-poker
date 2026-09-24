# Point Poker: project brief

Last updated: 24 September 2026. Owner: Ali Khan. Live site: https://www.pointpoker.app

This file is the current state of the product, its search performance and the open work. It is updated as the last step of every major change (see `docs/claude-project/README.md`). Newer dated notes from Ali override it.

This repo is public. Account details are kept in the private notes and the Claude.ai project instructions, not here.

---

## 1. The product

Someone opens the site, types a name and has a room in about ten seconds. They paste the link into the team chat. Everyone picks a card privately, all cards turn over at once, and the facilitator records the agreed number and moves to the next story. No account, no payment, no ads. An optional free account reserves two permanent Team Room URLs and stores sprint history.

| Fact | Current value |
|---|---|
| Price | Free for everyone, indefinitely. No paid tier, Stripe, licence keys, trial clock, card fields or ads |
| Room capacity | 20 people including facilitators (`MAX_PARTICIPANTS` in `src/routeMeta.mjs`) |
| Accounts | Optional. Needed only to reserve two Team Room URLs and keep sprint history. Guests never need one |
| Decks | Fibonacci (1, 2, 3, 5, 8, 13, 21, 34, ?), T-shirt (XS to XXL, ?), Powers of 2 (1 to 32, ?) |
| Deck and mode | Write-once per room. Changing mid-room is a rejected feature, not a missing one |
| Roles | Backend `voter` and `observer`. Users see "Facilitator" for observer |
| Session limits | Hard limit five hours. Offline players removed after one hour. Reaper runs every six hours |
| Features | Simultaneous reveal, story or task queue, bulk paste, countdown timer (time up hands the choice to the facilitator), re-vote, facilitator analytics, clipboard, CSV and PDF export |
| Languages | English at root, Portuguese `/pt/`, Japanese `/ja/` |
| Translated pages | `/`, `/what-is-planning-poker`, `/scrum-poker`, `/fibonacci-story-points` only |
| Retired languages | `/de/`, `/es/`, `/fr/`, `/nl/` permanently redirect to English |
| Support | support@pointpoker.app |

## 2. Stack and where things live

- React 19 single-page app (Create React App), Firebase Realtime Database and Email/Password Auth, Firebase Functions (signup notifications, stale-room reaper), Vercel hosting, Outfit font self-hosted.
- Repo: https://github.com/aliimrankhan86/planning-poker (public). Local copy: `~/Documents/planning-poker`.
- `src/App.js`: the whole app in one file, deliberately.
- `src/routeMeta.mjs`: route table, SEO metadata, prerendered page content, FAQ and HowTo schema. The single source for every page's words.
- `src/locales/pt.mjs`, `src/locales/ja.mjs`: translations. `src/locales/index.mjs` holds `LOCALIZED_PATHS`.
- `scripts/prerender.mjs`: writes one real HTML document per route after the build (26 documents).
- `scripts/gen-sitemap.mjs`: generates `public/sitemap.xml` (26 URLs). `lastmod` is the last commit date of `routeMeta.mjs`.
- `vercel.json`: redirects (apex to www, retired locales, untranslated locale paths), Team Room rewrites, security and noindex headers.
- `database.rules.json`: Firebase rules source of truth. `database.rules.publish.json` is generated.
- Project docs: `docs/AI-CONTEXT.md` (generated, read first), `CLAUDE.md` and `AGENTS.md` (gitignored operational notes), `PROGRESS.md` (dated history), `PROJECT.md` (summary and pending queue), `docs/claude-project/` (this brief, the generated code map and dated Search Console snapshots, synced into the Claude.ai project).

## 3. Routes

Public, prerendered: `/`, `/features`, `/pricing`, `/about`, `/support`, `/trust`, `/terms`, `/privacy`, `/what-is-planning-poker`, `/planning-poker-online`, `/scrum-poker`, `/pointing-poker`, `/fibonacci-story-points`, `/story-point-estimation`, `/story-points-to-hours`, `/agile-estimation-tool`, `/planning-poker-jira`, `/remote-sprint-planning`, plus the Portuguese and Japanese versions of the four translated pages.

Private or noindex: `/admin` (owner dashboard), `/t/<slug>` and `/pt|ja/t/<slug>` (Team Rooms), `?room=` URLs.

Search intent ownership:

| Intent | Page |
|---|---|
| Brand, "free planning poker online" | `/` |
| "scrum poker" and variants | `/scrum-poker` |
| "pointing poker", "poker planning", "sprint poker", "estimation poker", "agile poker" | `/pointing-poker` (one page on purpose, never split). Since 24 Sep 2026 it is a tool page: the room form sits in its hero |
| "planning poker online" | `/planning-poker-online` |
| "what is planning poker" | `/what-is-planning-poker` |
| Fibonacci story points | `/fibonacci-story-points` |
| Story points to hours | `/story-points-to-hours` (answers honestly: there is no conversion rate) |
| Jira, Linear, Azure DevOps, Teams | `/planning-poker-jira` (no plugin exists and the page says so) |

## 4. SEO history that explains the numbers

- **Before 9 Aug 2026 the site was broken for search.** Every marketing route canonicalised to the home page, so Google treated them as duplicates. Do not use data before 9 Aug as a baseline.
- **9 Aug:** prerender fix. Every route became a real document with its own title, canonical and schema.
- **11 to 12 Aug:** thin pages rebuilt from data (for example `/scrum-poker` went from 139 to 756 words, with FAQ schema). `/pointing-poker`, `/story-points-to-hours`, `/planning-poker-jira` added.
- **12 Aug:** seven languages shipped, cut to Portuguese and Japanese the same day. Reason: Dutch and German searchers already use English loanwords, Japan and Brazil do not have good English-language options.
- **17 Aug:** prerendered footer stopped linking untranslated pages under a locale prefix. `/agile-estimation-tool` and `/story-point-estimation` rebuilt from data.
- **23 Sep:** six-week re-pull done. Changes below.

## 5. Search Console at the six-week review

Property `sc-domain:pointpoker.app`. The full query and page tables are in `SEARCH-CONSOLE-2026-09-23.md` in this folder.

### Site trend

- Impressions about 250 a week through July, 700 to 1,160 a week from mid-August.
- Clicks about 1 a week before, 5 to 7 a week now.
- Weighted average position about 53 in July, 37.8 in the week of 14 Sep.
- 3 months to 20 Sep: 37 clicks, 6,610 impressions, average position 49.5.

### Query positions: baseline versus now

Baseline is 10 May to 9 Aug 2026. "Now" is 23 Aug to 20 Sep 2026.

| Query | Baseline position | Now position | Now impressions | Page |
|---|---:|---:|---:|---|
| pointing poker | 63.0 | 16.9 | 423 | `/` (27.2) and `/pointing-poker` (7.7) |
| point poker (brand) | 12.7 | 5.2 | 122 | `/` |
| scrum poker | 58.7 | 44.0 | 216 | `/scrum-poker` |
| story points fibonacci | 56.4 | 32.9 | 38 | `/fibonacci-story-points` |
| scrumpoker | 36.4 | 33.4 | 10 | `/scrum-poker` |
| sprint poker | 59.6 | 57.5 | 30 | `/scrum-poker`, `/pointing-poker` |
| poker planning | 80.7 | 73.1 | 225 | `/what-is-planning-poker` |
| planning poker | 80.4 | 78.2 | 312 | `/what-is-planning-poker` |

### Pages, 3 months to 20 Sep

| Page | Clicks | Impressions | Position |
|---|---:|---:|---:|
| `/` | 20 | 1,232 | 20.1 |
| `/what-is-planning-poker` | 0 | 1,468 | 76.7 |
| `/scrum-poker` | 2 | 1,312 | 45.4 |
| `/planning-poker-jira` | 1 | 509 | 69.0 |
| `/features` | 0 | 500 | 49.3 |
| `/fibonacci-story-points` | 1 | 394 | 38.4 |
| `/agile-estimation-tool` | 2 | 328 | 60.8 |
| `/about` | 0 | 282 | 43.3 |
| `/pointing-poker` | 1 | 182 | 17.1 |
| `/planning-poker-online` | 0 | 181 | 68.7 |
| `/ja/` | 6 | 142 | 47.6 |
| `/ja/scrum-poker` | 2 | 128 | 42.8 |
| `/remote-sprint-planning` | 0 | 118 | 66.0 |
| `/pricing` | 0 | 108 | 51.9 |
| `/story-point-estimation` | 0 | 107 | 72.7 |

### What the numbers say

- The August fixes worked. Every page they touched moved up.
- The home page is the strongest asset: 20 of 37 clicks, position 20, and it ranks for the commercial variants ("planning poker online free" 27, "free planning poker" 38).
- Japanese is the best-converting segment: `/ja/*` took 368 impressions and 9 clicks at position 39 (2.4% CTR against 0.6% site-wide). 11 Japanese-script queries, led by プランニングポーカー (161 impressions, position 68, landing on `/ja/`) and スクラムポーカー (20, position 18.8).
- Portuguese: 74 impressions, 1 click. Brazilian searchers use English loanwords ("planning poker scrum", "plan poker"). No Portuguese-language queries yet.
- "planning poker" is treated by Google as informational and sits at about 78 among Wikipedia and long-established exact-match domains. On-page work will not move it. Links will.
- Jira cluster ("jira planning poker", "scrum poker for jira", "planning poker in jira" and similar) is roughly 400 impressions at positions 58 to 80.
- `/scrum-poker` impressions fell about 67% from 12 Sep. Diagnosis: "scrum poker" slipped from position 37 to 42, which is results page 4 to page 5. The page is indexed, its canonical is correct and there is no cannibalisation. Normal movement at this depth, not a fault.
- `/scrum-poker` audience: US 304 impressions, Switzerland 153, Netherlands 143, Germany 105, Brazil 100, UK 83. 80% desktop.

### Indexing at the review

- Sitemap: 26 discovered pages, correct. Resubmitted 23 Sep.
- Indexed 30 against 26 in the sitemap. The extra URLs were untranslated locale paths (`/pt/about`, `/pt/planning-poker-online`, `/ja/planning-poker-online`) that served the English home page with a 200. Fixed 23 Sep with a permanent redirect to the English page. Indexed should fall back towards 26.
- Page with redirect: 10, all correct (http and apex variants plus retired locale URLs). Expect up to six more as the fixed locale URLs are recrawled.
- Core Web Vitals: no data (not enough traffic).

## 6. Changes shipped 23 to 24 Sep 2026

- **`/pointing-poker` is a tool page.** `<RoomQuickStart>` sits in the hero (set by `ROUTE_CONTENT["/pointing-poker"].quickStart`, rendered through `MarketingPageShell`'s `heroAside`) and creates a room as facilitator, in stories mode, through the home page's `handleCreate`. Title "Pointing Poker: Free Online Tool, No Sign-Up | Point Poker", H1 "Free Pointing Poker for Agile Teams". Reason: "pointing poker" is the query that shows the site most and every result above it is a working tool.
- **Internal links to `/pointing-poker`** from the home page's own copy, the related cards on `/what-is-planning-poker`, `/scrum-poker` and `/planning-poker-online`, and the footer ("Pointing poker").
- **Titles:** home "Free Planning Poker Online: No Sign-Up, No Ads | Point Poker" (the old "No Limits" contradicted the 20-person cap). "| Point Poker" added to `/planning-poker-online` and `/planning-poker-jira`. `/scrum-poker` "Scrum Poker Online: Free App, No Sign-Up | Point Poker", with a step-by-step HowTo section, a deck section, two new FAQs, and its false "no seat limit" claim fixed.
- **Structured data:** WebSite `alternateName: ["PointPoker"]`, the generic SoftwareApplication alternate names removed, `creator` Paramount Consultants, shown in the footer as "Built and run by Paramount Consultants".
- **Routing:** untranslated `/pt/*` and `/ja/*` paths 301 to English (`vercel.json`, pinned to `LOCALIZED_PATHS` by a test). `routeKey()` in `src/App.js` resolves a trailing slash (`/scrum-poker/`) to the same page, while locale homes such as `/pt/` keep theirs.
- **Deploys:** the Vercel project had lost its GitHub connection after 17 Aug. Reconnected, and pushes deploy again.
- Tests pin all of it (514 pass). Build: 26 prerendered documents.

## 7. Decisions in force

- **Spend USD 0** (13 Aug 2026 discovery record). Google Ads only after: reviewed post-fix baseline, owner and QA traffic excluded, an activated-session conversion (ideally a facilitator recording at least three estimates), privacy-compatible attribution, repeat usage by real teams, a stated value per activated team, and an account-specific Keyword Planner forecast.
- **Keep pointpoker.app.** Some enterprise filters can misclassify planning poker sites, but there is no evidence of widespread blocking and no dated vendor lookup yet. A redirect to a blocked hostname fixes nothing.
- **Retrospectives: research, do not build.** Needs 10 to 15 facilitator interviews and three to five teams committed to using a prototype for two consecutive sprints.
- **No machine translation of more pages** and never of Terms or Privacy.
- **No fabricated review or rating markup.** No claims of integrations that do not exist.
- **Off-site link-building is closed (24 Sep 2026).** Ali will not sign up to any more websites. The listings that exist are kept alive by the weekly follow-up in `LINK-BUILDING.md`. Ranking work from here is on-site SEO and Search Console.
- **Pay for nothing** (listings, priority reviews, featured slots, links) unless it is highly recommended.
- **Leave the Paramount Consultants cross-links as they are.** A normal "our products" setup. Adding more would start to look like a link scheme.
- **One scheduled item only.** Point Poker follow-ups run from "Point Poker: weekly follow-up" (see `LINK-BUILDING.md`). New follow-ups become rows in its checklist, never new scheduled tasks.

## 8. What to expect (assessment, 24 Sep 2026)

This is a judgement, not a measurement. The 4 Nov review is the evidence.

- **"pointing poker" is the realistic win.** It sat at 16.9, the top of page 2, and the 24 Sep changes target it directly. Page 1 within one to two months is plausible and would be the biggest traffic gain from this work.
- **"planning poker" (about 78) and "scrum poker" (about 44) will not reach page 1 on this work.** The sites above have years of links from other websites, and off-site link-building is closed, so these move slowly.
- **The directory listings** add a trickle of visitors and some trust. Most directory links carry little ranking weight.
- **The Paramount Consultants link** helps Google see a real business behind the product and helped it find the pages. It carries little ranking weight because Google discounts links between sites with the same owner, and Paramount's own site is new.
- **The next lever is on-site:** pages for searches with weaker competition, the Portuguese and Japanese versions, and whatever Search Console flags.

## 9. Open work

1. Three room defects reported 14 Aug 2026, not reproduced or fixed: "the buttons" (control not named), the time-up message is unclear (facilitator and voter see different copy), viewing what others estimated "isn't fixed". Collect a screenshot, viewport width, role and round state first.
2. Native-speaker review of the four Portuguese and four Japanese pages. Then decide on a Japanese `/planning-poker-online` page.
3. Search Console review on 4 Nov 2026, run by the weekly follow-up. Check:
   - "pointing poker": average position (16.9 before) and whether Google has stopped splitting it between `/` and `/pointing-poker`
   - `/scrum-poker` positions for "scrum poker", "scrum poker online", "free scrum poker", "scrum poker app"
   - Indexed count falling back towards 26, redirects rising by up to six
   - `/ja/*` clicks and the position of プランニングポーカー
   - Links report: which external sites Google has picked up
4. After that review: the on-site changes it points to (see section 8).
5. `/features` prerenders H1 "Planning Poker Features — All Free" but the hand-built page renders a different H1. Align them.
6. Optional: both pointpoker.app and paramountconsultants.online redirect the apex to `www` with a 307 (Vercel's default). Google has consolidated on `www` anyway. Switching to 308 is tidy-up, by hand in Vercel > Domains > Edit.
7. Discovery evidence still to collect: filtering vendor categories (Palo Alto, FortiGuard, BrightCloud), real organisation-network access tests, facilitator interviews.

## 10. Access and deployment

- **Search Console:** Domain property `sc-domain:pointpoker.app`. It sits under a separate Google account, not Ali's default one (named in the private notes and the project instructions).
- **Vercel:** project `planning-poker` under "Ali Khan's projects" (Hobby). Login needs Ali's passkey. Connected to GitHub, production branch `main`.
- **Deploy:** push to `main`. Then confirm the commit shows a Vercel status on GitHub. No status within a minute means the push was not picked up.
- **Firebase:** project `planning-poker-b6ac1`. Rules and Functions deploy separately with the Firebase CLI and must be verified live. Use the `firebaseio.com` host for REST checks.
- **Verification commands:** `CI=true npm test -- --runInBand --watchAll=false`, `npm run build`, `npm run test:rules` for rules, `npm --prefix functions test` for Functions.
- **Vercel "Project Link not found"** on a project's Git settings page means the Vercel GitHub App has lost access to that repo. The app is installed on `aliimrankhan86` with "Only select repositories"; fix it at GitHub > Settings > Applications > Vercel > Repository access. Both `planning-poker` and `paramount-codebase` are selected as of 24 Sep 2026.
- **Paramount Consultants:** paramountconsultants.online (repo `paramount-codebase`, on Vercel). Point Poker page at `/products/point-poker`. Search Console Domain property `sc-domain:paramountconsultants.online` under the same Google account as Point Poker, verified by a TXT record in Vercel DNS.
- **Scheduled follow-up:** "Point Poker: weekly follow-up", a self-renewing reminder that runs only when a checklist row is due (first run 7 Oct 2026, 09:00 UTC) in the Cowork conversation linked to Ali's Mac. How it works is in `LINK-BUILDING.md`.
- The repo lives in an iCloud-synced Documents folder. Stray files such as `.git/index 2` are sync artefacts.

## 11. Traps worth remembering

- A CSS class starting `ad-`, `ads-`, `promo-`, `popup-` or containing `advert` or `sponsor` is hidden by ad blockers. A test enforces this.
- Vercel `:path*` does not match a trailing-slash path. Use `:path(.*)`. Verify every routing change live, with and without a trailing slash.
- Adding a translated page means updating `LOCALIZED_PATHS` and the locale-redirect exclusion in `vercel.json`.
- An empty `/rooms` node does not mean Team Rooms are gone. Teams live on `/users`, history on `/history`.
- Stale `plan: "pro"` fields on old user profiles grant nothing. Do not rebuild entitlement logic around them.
- Search Console's Pages report lags. URL Inspection reflects the live index.
- Two other products use almost this name: PointPoker at pointpoker.co (a Jira Marketplace app) and point.poker. Always write "Point Poker" with the pointpoker.app link.

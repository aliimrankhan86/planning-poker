# Point Poker: getting other sites to link here

Last updated: 24 September 2026.

Links from other sites are the main thing holding Point Poker back in Google. The page content was fixed in August and September 2026, but "scrum poker" (position 44) and "planning poker" (78) will not reach page 1 without independent links. This file is the working plan: where to get listed, the copy to use, and what has been done.

Research behind it (24 Sep 2026): 22 round-up articles from 2023 to 2026 were checked and none lists Point Poker. Almost all are written by rival planning poker vendors, so asking them to add a competitor rarely works. Free directories and curated lists that accept submissions give the better return.

## Rules

- **Same name, same link, same description everywhere.** Two unrelated products share almost this name: PointPoker at pointpoker.co (a Jira Marketplace app, Phoenix AZ) and point.poker. Always write "Point Poker" with https://www.pointpoker.app/ so Google and directories never merge them.
- **Never claim what the product does not do.** There is no Jira plugin (it is paste in, estimate, export CSV). There is no paid tier. The room cap is 20 people.
- **No fake reviews, no review swaps, no paid links, no link exchanges.** Google treats these as link spam, and G2 bans incentivised reviews without disclosure.
- **Do not add Point Poker to Wikipedia.** Wikipedia's conflict-of-interest rules forbid it.
- **Community answers only where someone is actually asking for a tool,** and always say you built it.

## Listing copy (use as written)

| Field | Copy |
|---|---|
| Name | Point Poker |
| URL | https://www.pointpoker.app/ |
| Tagline (56 characters) | Free planning poker for agile teams. No sign-up, no ads. |
| Short description (148 characters) | Free online planning poker and scrum poker. Share one link, everyone votes in private and the cards reveal together. Up to 20 people, no account. |
| Pricing | Free. No paid tier, no trial, no card details. |
| Platform | Web browser, desktop and mobile. Nothing to install. |
| Languages | English, Portuguese, Japanese |
| Category | Agile project management, estimation, team meetings |
| Maker | Paramount Consultants (UK) |
| Support | support@pointpoker.app |
| Logo | https://www.pointpoker.app/logo512.png |
| Alternatives to list it against | PlanITpoker, Pointing Poker (pointingpoker.com), Planning Poker Online, Scrum Poker Online, planningpoker.com |

**Long description (about 120 words):**

Point Poker is a free planning poker tool for agile and scrum teams. The facilitator creates a room and shares one link in Slack, Teams or Zoom. Everyone picks a card in private, then all the cards turn over at the same moment, so the first number said out loud never anchors the rest of the team. Rooms hold up to 20 people with no account needed to join. It has Fibonacci, T-shirt and Powers of 2 decks, a story queue you can paste a whole backlog into, a countdown timer and facilitator analytics that show where the team disagreed. The agreed points export as CSV for Jira, Linear or Azure DevOps. Every feature is free, with no ads and no tracking cookies.

**Feature list:**

- Simultaneous reveal
- Fibonacci, T-shirt and Powers of 2 decks
- Up to 20 people per room, facilitators included
- No account needed to create or join a room
- Paste a whole backlog into the story queue
- Countdown timer
- Facilitator analytics: consensus, spread, outliers
- CSV export for Jira, Linear and Azure DevOps
- Two permanent Team Room links with a free account
- English, Portuguese and Japanese
- No ads, no tracking cookies

**Screenshots** (made 24 Sep 2026 from a live demo room with made-up names: Sam facilitating, Priya, Tom, Kenji and Ana voting). They are in `Claude outputs/listing-assets/` on Ali's Mac, which git ignores: `1-vote-in-private.jpg`, `2-cards-reveal-together.jpg`, `3-start-a-room.jpg`, `4-phone.jpg` (portrait, 390px wide) and `point-poker-logo.png` (512px square, same file as `public/logo512.png`). Reuse them for G2 and Product Hunt. Still missing: the facilitator analytics panel. To remake them, run a room on the live site in a headless browser with four voter contexts. The card buttons are labelled "Vote 5" and so on, the cards reveal on their own once everyone has voted, and the facilitator records with "Record 5 as the agreed estimate" then "Record 5 & next item".

**Name on SaaSHub:** PointPoker.app, not Point Poker. SaaSHub already gives the name "Point Poker" and the slug `point-poker` to point.poker, a different product, so the domain-style name keeps the two apart.

## Where to submit, best value for effort first

Each of these needs an account in Ali's name. Claude cannot create accounts.

| # | Where | How | Notes |
|---|---|---|---|
| 1 | AlternativeTo | Sign in, "Add application", then suggest Point Poker as an alternative on https://alternativeto.net/software/planitpoker/ and https://alternativeto.net/software/planning-poker/ | Free. The PlanITpoker page lists 25 alternatives and Point Poker is not one |
| 2 | SaaSHub | https://www.saashub.com/submit, then verify the product | Done 24 Sep 2026, see the log. Competitors picked at submission replace the separate "Suggest an alternative" step |
| 3 | G2 (also covers Capterra and GetApp since G2 bought them in Feb 2026) | https://www.g2.com/products/new | Free profile, reviewed in 3 to 5 business days. Category: Project Management |
| 4 | free-for-dev (GitHub list, about 124k stars) | Pull request adding Point Poker under "Issue Tracking and Project Management", next to planitpoker.com and point.poker. Use their PR template and tick every box | **Write the PR yourself.** Their contributing guide says PRs written with AI are closed without review. Lead with what is different: 20 people free, no sign-up, CSV export for Jira, three languages |
| 5 | awesome-agile (GitHub, 1.5k stars) | One pull request adding one line to `Estimation.md`, alphabetically before "Pointing Poker", in the format `- [Point Poker](https://www.pointpoker.app/) (Web app) - "Takeaway."` | https://github.com/lorabv/awesome-agile/blob/master/CONTRIBUTING.md. Check the repo still merges PRs before spending time |
| 6 | Product Hunt | Launch in the Meetings category | Free. Other planning poker tools have launched there. Needs a launch day plan: screenshots, a first comment, a few people ready to try it |
| 7 | Scrum Expert, free online scrum tools page | https://www.scrumexpert.com/tools/free-online-scrum-tools/ invites suggestions through its contact page | Email below |
| 8 | Zenhub's "best planning poker tools" | Author Rich Elliott, via support@zenhub.com or feedback.zenhub.com | Zenhub is not a planning poker vendor and already lists free tools from other companies. Email below |
| 9 | SW Academy (Brazil) | Company news form on swacademy.com.br | Pitch the Portuguese version at /pt/. Email below |
| 10 | Uneed | https://www.uneed.best/submit-a-tool | Free queue. Skip the paid fast track |

Lower value, only if time allows: Liquitim's planning poker article (updates often), Teaminal's list of 21 tools, zenika's awesome-remote-work, a guest post pitch to The Digital Project Manager (https://thedigitalprojectmanager.com/write-for-us/).

## Emails (send from your own address)

**Scrum Expert** (through the contact page)

Subject: A free planning poker tool for your free online scrum tools page

Hello,

Your free online scrum tools page invites suggestions, so here is one. Point Poker (https://www.pointpoker.app/) is a free planning poker tool I built and run. Rooms hold up to 20 people with no sign-up, it has Fibonacci, T-shirt and Powers of 2 decks, and the agreed estimates export as CSV for Jira. There is no paid tier and no advertising.

If it fits the page, I would be glad to see it listed. Happy to answer any questions.

Ali Khan
Point Poker

**Zenhub** (to Rich Elliott)

Subject: A free tool for your planning poker round-up

Hi Rich,

I read your "Best Planning Poker Tools for 2025" piece. You cover a good spread of free options, so I wanted to put one more in front of you for the next update.

Point Poker (https://www.pointpoker.app/) is free with no paid tier: up to 20 people per room, no account needed to join, three card decks, a story queue you can paste a backlog into, and CSV export for Jira. It also runs in Portuguese and Japanese.

If it is useful for a future revision, it is all yours to try. Thanks for the article.

Ali Khan

**SW Academy** (company news form, in Portuguese)

Assunto: Point Poker, planning poker gratuito em português

Olá,

Vi o artigo sobre técnicas e ferramentas gratuitas de planning poker. O Point Poker (https://www.pointpoker.app/pt/) é uma ferramenta gratuita de planning poker com versão em português: salas de até 20 pessoas, sem cadastro para entrar, baralhos Fibonacci, camisetas e potências de 2, e exportação em CSV para o Jira. Não há plano pago nem anúncios.

Se fizer sentido para uma atualização do artigo, fico à disposição.

Ali Khan

(Have a native speaker check the Portuguese before sending.)

## Progress log

| Date | What | Result |
|---|---|---|
| 24 Sep 2026 | paramountconsultants.online/products/point-poker published, six followed links into pointpoker.app | Live. Same owner, so it helps discovery and brand association more than rankings |
| 24 Sep 2026 | AlternativeTo: Point Poker submitted (username Ali-Imran, signed in with the same Google account as Search Console). 31 alternatives suggested: PlanITpoker plus 30 other planning poker tools | Waiting in the free review queue. The $5 priority review was declined on purpose; revisit only if AlternativeTo proves to send real traffic |
| 24 Sep 2026 | Uneed: listing saved (uneed.best/tool/point-poker) with logo, OG image and two screenshots, in the free waiting line | Launches **10 Feb 2027**. Needs an upvote score of 10 on the day to stay published and 20 for a followed link. Below 10 it drops out and cannot rejoin the free line, so line up 10 to 20 people to upvote that morning. Paid slots ($14.99, $29.99) and the $249 directory package declined |
| 24 Sep 2026 | Scrum Expert: suggestion for the Free Online Scrum Tools page sent through the contact form, from support@pointpoker.app | Awaiting reply. The page only lists tools with no paid version, which Point Poker meets |
| 24 Sep 2026 | Zenhub: email to support@zenhub.com for Rich Elliott (author of "Best Planning Poker Tools for 2025"), from support@pointpoker.app | Sent. Low odds: Zenhub ranks its own product first |
| 24 Sep 2026 | SW Academy (Brazil): free editorial suggestion in Portuguese to contato@swacademy.com.br, pointing at /pt/ | Sent. Their official route is a paid release (R$40 per article with a followed link), which is a paid link and was not used. If they reply offering it, decline |
| 24 Sep 2026 | G2 | On hold (Ali's decision). G2 blocks automated browsers ("Access is temporarily restricted"), so it has to be done by hand in a normal browser |
| 24 Sep 2026 | Product Hunt | Deferred. One launch only: plan it (date, first comment, supporters), ideally around the Uneed launch in Feb 2027 |
| 24 Sep 2026 | awesome-agile | Dropped. The repo has merged 8 pull requests in its whole history, none recent |
| 24 Sep 2026 | SaaSHub: listed as **PointPoker.app** at https://www.saashub.com/pointpoker-app (account `pointpoker`, registered by Ali with support@pointpoker.app). Full profile: tagline, markdown description with the feature list, six features, platform Web, pricing Free linking `/pricing`, released March 2026, UK, 1 to 9 staff, not open source, logo and three screenshots. Categories: Agile Project Management, Team Collaboration, Project Management, Task Management, Work Collaboration. Competitors: PlanITpoker, Planning poker online, Scrumpoker Online, Planning Poker, DinoSize, Firepoker, PlanningWith.Cards | Verified (status ACTIVE) on 24 Sep 2026, pending approval for up to 32 days. Once approved it shows as a verified alternative on all seven competitors' pages, including /planitpoker-alternatives, /planning-poker-online-alternatives and /planning-poker-alternatives. **Verification lasts one quarter: re-verify by 24 Dec 2026** (Manage > Verification > Verify). $75 Priority+ declined. The "SaaSHub Experts" nomination game shown after verifying was skipped |
| To do | free-for-dev | Ali writes and opens the pull request himself. The repo closes AI-written or AI-edited PRs and blocks the account. Entry goes under "Issue Tracking and Project Management" after planitpoker.com; say point.poker is a different product; leave the template's last checkbox unticked |

## Weekly check (the one scheduled task works from this)

One scheduled task, **"Point Poker: weekly follow-up"**, runs every Wednesday at 09:00 UTC (10:00 UK in summer, 09:00 in winter). Its prompt only says "follow the Weekly check in LINK-BUILDING.md", so the instructions live here and change with the repo. There are no other Point Poker scheduled tasks. To stop it, pause or delete it under Scheduled in the Claude app. To change what it does, edit this section.

Each run:

1. Read the checklist below. Work only on rows with Status "Pending" whose "From" date is today or earlier.
2. Do the Claude rows. Record each result in the Progress log above, then set the row to "Done" with the date. If a row could not be finished, leave it Pending with a short note so the next run tries again. A row marked "Repeats" gets a new row with the next date when it is done.
3. Never do Ali's rows. Mention a dated Ali row when it falls due. Mention the undated Ali rows only in the first run of each month, in one line.
4. If a file changed: commit on the Mac with `git -c core.hooksPath=.githooks commit` (message ending with the Co-Authored-By line for Claude), push with the Push button in VS Code's Source Control Graph (VS Code is granted at click tier), check `git status` shows main level with origin, then re-sync the "Point Poker" Claude project (hover the GitHub card, click its sync icon).
5. Message Ali only when something was done, something needs him or something failed. Otherwise end with "Nothing due this week".
6. After row 8 is Done, change this task's schedule to monthly (cron `0 9 1 * *`). When no Claude rows are Pending, disable the task and tell Ali which of his rows are still open.

If Ali's Mac or Chrome cannot be reached (the computer tools are missing or fail), read this file from GitHub (https://raw.githubusercontent.com/aliimrankhan86/planning-poker/main/docs/claude-project/LINK-BUILDING.md), do only the checks that work on public pages, change nothing, leave every row Pending and say once that the Mac was unreachable. If the tools are missing on every run, the task's "Require this computer" setting is off.

Never create accounts, enter passwords, pay for anything, vote, send email, post, or open pull requests without Ali's go-ahead in chat. Style for anything written: UK English, no em or en dashes, no semicolons, lead with the answer.

### Checklist

| # | From | Item | Owner | Status |
|---|---|---|---|---|
| 1 | 30 Sep 2026 | **SaaSHub approval** (due by 26 Oct 2026). Look for PointPoker.app in the list itself on https://www.saashub.com/planitpoker-alternatives, /planning-poker-online-alternatives and /planning-poker-alternatives (the logged-in header always shows PointPoker.app, ignore it). Once listed, record whether the link to pointpoker.app on https://www.saashub.com/pointpoker-app is followed or nofollow | Claude | Pending |
| 2 | 30 Sep 2026 | **AlternativeTo publication.** Is Point Poker (submitted 24 Sep, user Ali-Imran) published, and listed on https://alternativeto.net/software/planitpoker/about/? Record the outbound link rel | Claude | Pending |
| 3 | 30 Sep 2026 | **Outreach replies.** In Zoho Mail (mail.zoho.eu, support@pointpoker.app) look for replies from Scrum Expert, Zenhub, SW Academy or any directory. Summarise them for Ali, never reply. Mark Done on 28 Oct 2026 if nothing has come | Claude | Pending |
| 4 | 4 Nov 2026 | **Search Console review.** Search Console as the Point Poker Google account (authuser=3, property sc-domain:pointpoker.app). Last 28 days against the 28 days to 20 Sep 2026: "pointing poker" 423 impressions, position 16.9, split between / (27) and /pointing-poker (7.7), "scrum poker" 44, "planning poker" 78. Report those queries plus "planning poker online", "scrum poker online" and "point poker", whether the pointing poker split has ended, top pages, indexing problems and linking sites. Three to five recommendations with evidence. Record as a dated section in PROJECT-BRIEF.md. No code changes in the run | Claude | Pending |
| 5 | 9 Dec 2026 | **SaaSHub re-verification** (lapses 24 Dec 2026). On https://www.saashub.com/manage/pointpoker-app check the details are still true, fix any that are not, click the free "Verify" link, ignore Priority+ and the "SaaSHub Experts" page, confirm status ACTIVE with today's date. If SaaSHub wants a login, Ali must sign in. Repeats: add a new row about 80 days on | Claude | Pending |
| 6 | 27 Jan 2027 | **Uneed launch prep.** Confirm https://www.uneed.best/tool/point-poker still launches 10 Feb 2027 and the listing is complete (assets in `Claude outputs/listing-assets/`). Check Uneed's current launch-day rules. Write two short messages in Ali's voice, one for WhatsApp or LinkedIn DMs and one LinkedIn post, honest and saying he built it, and save them as a Zoho draft to support@pointpoker.app titled "Uneed launch messages". Do not send. Tell Ali to line up 10 to 20 real people | Claude | Pending |
| 7 | 10 Feb 2027 | **Uneed launch day.** Report the upvote score, rank and when voting closes. Remind Ali to send the drafted messages. Needs 10 to stay published, 20 for a followed link | Claude | Pending |
| 8 | 17 Feb 2027 | **Uneed result.** Did it stay published, and is the link followed? Record it | Claude | Pending |
| 9 | Any time | **free-for-dev** pull request, written by Ali himself (the repo closes AI-written PRs). Entry under "Issue Tracking and Project Management". Say point.poker, already listed there, is a different product | Ali | Pending |
| 10 | Any time | **awesome-remote-work** pull request (entry ready below). Claude opens it once Ali says go in chat | Ali says go | Pending |
| 11 | Any time | **awesome-no-login-web-apps** pull request (entry ready below). Claude opens it once Ali says go in chat | Ali says go | Pending |
| 12 | Any time | **Indie Hackers** product page. Ali signs in at https://www.indiehackers.com with the same Google account as Search Console, then Claude fills the product page | Ali, then Claude | Pending |
| 13 | On hold | **G2** (also covers Capterra and GetApp). Ali's decision | Ali | On hold |
| 14 | Deferred | **Product Hunt.** One launch only, planned near the Uneed launch | Ali | Deferred |

### Entries ready to submit

**awesome-remote-work** (https://github.com/zenika-open-source/awesome-remote-work, active, last merge Aug 2026, no rule against AI-written PRs). In README.md, section "💪 Productivity", on the line after PlanITpoker:

`- [Point Poker, free planning poker for remote agile teams with no sign-up](https://www.pointpoker.app/)`

Commit message in their gitmoji style: `📝 Add Point Poker to Productivity`. PR text: "Point Poker is a free planning poker tool for remote agile teams. The facilitator shares one link, everyone votes in private and the cards turn over together. No account needed to join, up to 20 people per room. I built it and run it, no paid tier."

**awesome-no-login-web-apps** (https://github.com/aviaryan/awesome-no-login-web-apps, very active, merges weekly). PR title `Add Point Poker`. At the bottom of "Utilities (uncategorized)":

`* [Point Poker](https://www.pointpoker.app/) - Planning poker for agile teams. Create a room, share the link, and everyone votes in private before the cards turn over together. Up to 20 people per room with CSV export. An optional free account keeps permanent team rooms.`

Fill the PR template: the URL, a two-line explanation (core features need no account, which is the list's rule), and tick all three boxes truthfully.

### Researched and not worth doing now (24 Sep 2026)

SourceForge (free, no account, but free listings show the website as plain text, no link), TrustRadius and SoftwareSuggest (no planning poker tools listed, no link), SaaSworthy (free tier only through a sales form, no clickable link), Crozdesk (asks for a marketing budget, nofollow), Microlaunch (2 to 3 month free queue, nofollow), Peerlist (links only for the weekly top 5), StackShare (followed link but it now covers developer and AI tools, long shot). Skip: Fazier (free tier needs a link back, which is a link exchange), Slant (site down), remote.tools (no longer a tools directory).

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

## Dates to check

| When | What |
|---|---|
| By 26 Oct 2026 | SaaSHub approval (up to 32 days from 24 Sep). Check that PointPoker.app appears on https://www.saashub.com/planitpoker-alternatives and whether its link to pointpoker.app is followed. Log the result above |
| 4 Nov 2026 | Search Console review. Also look for referral visits from AlternativeTo and SaaSHub |
| By 24 Dec 2026 | SaaSHub re-verification. A lapsed product loses the verified-alternative placement. Repeat every quarter |
| Early Feb 2027 | Uneed: line up 10 to 20 people to upvote on launch morning |
| 10 Feb 2027 | Uneed launch day. Below 10 upvotes it drops out for good |

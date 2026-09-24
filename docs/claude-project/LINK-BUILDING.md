# Point Poker: listings and the weekly follow-up

Last updated: 24 September 2026.

**Off-site work is closed.** On 24 Sep 2026 Ali decided not to sign up to any more websites. The listings below exist and the weekly follow-up keeps them alive. Google rankings now come from on-site SEO and Search Console (see `PROJECT-BRIEF.md`). Do not propose new directories, launch sites, GitHub lists or outreach unless Ali reopens this.

Keep this file current by overwriting: when a status changes, edit the cell. History lives in git and `PROGRESS.md`.

## Listings that exist

| Site | What | Status | Link value |
|---|---|---|---|
| paramountconsultants.online | Ali's consultancy. Point Poker page at /products/point-poker with six followed links into pointpoker.app, a /products index and "Built by us" boxes. Point Poker's footer credits Paramount back | Live since 24 Sep 2026 | Same owner, so Google gives it little ranking weight. It helps trust and discovery. Do not add more cross-links |
| SaaSHub | Listed as **PointPoker.app** because point.poker owns the name "Point Poker" there. https://www.saashub.com/pointpoker-app, account `pointpoker` on support@pointpoker.app. Full profile, seven planning poker competitors, verified | Awaiting approval (up to 32 days from 24 Sep 2026). Verification lapses every quarter, next renewal by 24 Dec 2026 | Unknown until approved |
| AlternativeTo | Submitted 24 Sep 2026 by user Ali-Imran (Google sign-in). 31 alternatives suggested | In the free review queue | Unknown until published |
| Uneed | https://www.uneed.best/tool/point-poker in the free line, logo and screenshots | Launches 10 Feb 2027. Needs an upvote score of 10 that day to stay published and 20 for a followed link. Below 10 it drops out for good | Followed only at 20 or more |
| Scrum Expert | Suggestion for the Free Online Scrum Tools page, sent through its contact form | Sent 24 Sep 2026, no reply yet | Editorial |
| Zenhub | Email to support@zenhub.com for Rich Elliott, author of its planning poker round-up | Sent 24 Sep 2026, low odds | Editorial |
| SW Academy (Brazil) | Free editorial suggestion in Portuguese pointing at /pt/ | Sent 24 Sep 2026. If they offer their paid release (R$40), decline: it is a paid link | Editorial |

## Rules

- Same name, same link everywhere: "Point Poker" with https://www.pointpoker.app/. PointPoker at pointpoker.co (a Jira Marketplace app) and point.poker are different products. SaaSHub is the one exception, where the name is PointPoker.app.
- Never claim what the product does not do: no Jira plugin (paste in, estimate, export CSV), no paid tier, up to 20 people per room.
- Pay for nothing (listings, priority reviews, featured slots, links) unless it is highly recommended. Paid links breach Google's spam policy anyway.
- No fake reviews, no review or link swaps, no Wikipedia edits.

## Listing copy

Use this when a listing needs checking or renewing.

| Field | Copy |
|---|---|
| Name | Point Poker (PointPoker.app on SaaSHub) |
| URL | https://www.pointpoker.app/ |
| Tagline | Free planning poker for agile teams. No sign-up, no ads. |
| Short description | Free online planning poker and scrum poker. Share one link, everyone votes in private and the cards reveal together. Up to 20 people, no account. |
| Pricing | Free. No paid tier, no trial, no card details. Page: https://www.pointpoker.app/pricing |
| Platform | Web browser, desktop and mobile. Nothing to install |
| Languages | English, Portuguese, Japanese |
| Maker | Paramount Consultants (UK) |
| Support | support@pointpoker.app |
| Assets | Logo, three screenshots and a phone screenshot in `Claude outputs/listing-assets/` in Ali's project folder (gitignored). Made from a live demo room with made-up names |

Long description: Point Poker is a free planning poker tool for agile and scrum teams. The facilitator creates a room and shares one link in Slack, Teams or Zoom. Everyone picks a card in private, then all the cards turn over at the same moment, so the first number said out loud never anchors the rest of the team. Rooms hold up to 20 people with no account needed to join. It has Fibonacci, T-shirt and Powers of 2 decks, a story queue you can paste a whole backlog into, a countdown timer and facilitator analytics that show where the team disagreed. The agreed points export as CSV for Jira, Linear or Azure DevOps. Every feature is free, with no ads and no tracking cookies.

## Weekly check

One scheduled item, **"Point Poker: weekly follow-up"**, fires at 09:00 UTC on a Wednesday (10:00 UK in summer, 09:00 in winter), only when something is due: weekly while the October checks are open, then on each row's date. It is a one-off reminder delivered back into the Cowork conversation that set it up, because that conversation is linked to Ali's Mac. A cloud scheduled task cannot reach the Mac unless "Require this computer" is on, and that switch is not offered for tasks created from chat. Each run does the work below and then books the next one, so there is only ever one Point Poker item in Scheduled. Its message only says "follow the Weekly check in LINK-BUILDING.md", so the instructions live here and change with the repo. To stop it, delete it under Scheduled in the Claude app. To change what it does, edit this section.

Each run:

1. Read the checklist below. Work only on rows with Status "Pending" whose "From" date is today or earlier.
2. Do each due row. Overwrite the matching Status cell in "Listings that exist" with the result and today's date, then set the checklist row to "Done" with the date. If a row could not be finished, leave it Pending with a short note so the next run tries again. A row marked "Repeats" is rewritten with its next date when done, not duplicated.
3. Anything that needs Ali (a login, upvotes, a decision) goes in the message to him, once.
4. If a file changed: commit on the Mac with `git -c core.hooksPath=.githooks commit` (message ending with the Co-Authored-By line for Claude), push with the Push button in VS Code's Source Control Graph (VS Code is granted at click tier), check `git status` shows main level with origin, then re-sync the "Point Poker" Claude project (hover the GitHub card, click its sync icon).
5. Message Ali only when something was done, something needs him or something failed. Otherwise end with "Nothing due this week".
6. Book the next run with `send_later` into this same conversation, named "Point Poker: weekly follow-up", at 09:00 UTC on the earliest of: next Wednesday if any row that is already due is still Pending, otherwise the "From" date of the next Pending row. Check with `list_triggers` that exactly one Point Poker item is pending, never more. When no row is Pending, book nothing.

If Ali's Mac or Chrome cannot be reached (the computer tools are missing or fail), read this file from GitHub (https://raw.githubusercontent.com/aliimrankhan86/planning-poker/main/docs/claude-project/LINK-BUILDING.md), do only the checks that work on public pages, change nothing, leave every row Pending and say once that the Mac was unreachable. Still book the next run. If the Mac is unreachable three weeks running, tell Ali the conversation has lost its link to his Mac.

Never create accounts, enter passwords, pay for anything, vote, send email, post, or open pull requests without Ali's go-ahead in chat. Style for anything written: UK English, no em or en dashes, no semicolons, lead with the answer.

### Checklist

| # | From | Item | Status |
|---|---|---|---|
| 1 | 7 Oct 2026 | **SaaSHub approval** (due by 26 Oct 2026). Look for PointPoker.app in the list itself on https://www.saashub.com/planitpoker-alternatives, /planning-poker-online-alternatives and /planning-poker-alternatives (the logged-in header always shows PointPoker.app, ignore it). Once listed, record whether the link to pointpoker.app on https://www.saashub.com/pointpoker-app is followed or nofollow | Pending |
| 2 | 7 Oct 2026 | **AlternativeTo publication.** Is Point Poker published, and listed on https://alternativeto.net/software/planitpoker/about/? Record the outbound link rel | Pending |
| 3 | 7 Oct 2026 | **Outreach replies.** In Zoho Mail (mail.zoho.eu, support@pointpoker.app) look for replies from Scrum Expert, Zenhub, SW Academy or any directory. Summarise them for Ali, never reply. Mark Done on 28 Oct 2026 if nothing has come | Pending |
| 4 | 4 Nov 2026 | **Search Console review.** Search Console as the Point Poker Google account (authuser=3, property sc-domain:pointpoker.app). Last 28 days against the baseline in `PROJECT-BRIEF.md` section 5 and the checks in its Open work. Report what moved, give three to five on-site recommendations with evidence, and save the numbers as a new `SEARCH-CONSOLE-<date>.md`, updating the brief to point at it. No code changes in the run | Pending |
| 5 | 9 Dec 2026 | **SaaSHub renewal** (lapses 24 Dec 2026). On https://www.saashub.com/manage/pointpoker-app check the details against the listing copy above, fix any that are wrong, click the free "Verify" link, ignore Priority+ and the "SaaSHub Experts" page, confirm status ACTIVE with today's date. If SaaSHub wants a login, Ali must sign in. Repeats about every 80 days | Pending |
| 6 | 27 Jan 2027 | **Uneed launch prep.** Confirm the listing still launches 10 Feb 2027 and is complete. Check Uneed's current launch-day rules. Write two short messages in Ali's voice, one for WhatsApp or LinkedIn DMs and one LinkedIn post, honest and saying he built it, and save them as a Zoho draft to support@pointpoker.app titled "Uneed launch messages". Do not send. Tell Ali to line up 10 to 20 real people | Pending |
| 7 | 10 Feb 2027 | **Uneed launch day.** Report the upvote score, rank and when voting closes. Remind Ali to send the drafted messages | Pending |
| 8 | 17 Feb 2027 | **Uneed result.** Did it stay published, and is the link followed? Record it | Pending |

## Decided against (24 Sep 2026)

- **Dropped when Ali closed sign-ups:** G2 (which also covers Capterra and GetApp), Product Hunt, free-for-dev, the awesome-remote-work and awesome-no-login-web-apps GitHub lists, Indie Hackers.
- **No fit or no link:** awesome-agile (inactive repo), SourceForge (website shown as plain text), TrustRadius and SoftwareSuggest (no planning poker tools, no link), SaaSworthy (sales form, no clickable link), Crozdesk (asks for a marketing budget, nofollow), Microlaunch (months-long free queue, nofollow), Peerlist (links only for the weekly top 5), StackShare (now developer and AI tools). Fazier's free tier needs a link back, which is a link exchange. Slant was down. remote.tools is no longer a directory.
- **Round-up articles:** 22 checked, nearly all written by rival vendors, none list Point Poker. Not worth pitching.
- **Paid options declined:** AlternativeTo $5 priority review, Uneed $14.99, $29.99 and $249, SaaSHub $75 Priority+, SW Academy R$40 paid release.

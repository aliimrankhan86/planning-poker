# Product discovery decision record — 13 August 2026

Status: **accepted for the current discovery window; review after the six-week
Search Console pull around 23 September 2026.**

Repository, production-counter, and external-source evidence was checked on 13
August 2026 unless another date is stated. Policies, prices, classifications,
and benchmarks can change and must be rechecked when a decision is reopened.

This is the durable evidence record for three founder questions:

1. Could the Point Poker name be blocked by banks or other institutions because
   `poker` is associated with gambling?
2. Is a retrospective feature worth adding?
3. Is a Google Search Ads experiment at approximately USD 1/day for 30 days
   worth running now?

The short answer is: **spend USD 0 now, keep the current domain, research
retrospectives without building a generic retrospective product, and wait for
cleaner organic and product evidence before advertising.**

This record distinguishes verified facts, market evidence, inference, and
unknowns. Later agents must not turn an inference or an anecdote into a fact.

## Executive decisions

| Question | Current decision | Confidence | Reopen when |
|---|---|---:|---|
| Name and institutional blocking | Keep `pointpoker.app`. Do not buy an alternate domain or use a redirect workaround now. Validate actual filter classifications and access failures first. | Medium | Independent organisations or filtering vendors repeatedly misclassify/block the site after recategorisation attempts. |
| Retrospectives | Discovery is worthwhile; a full generic retrospective feature is not approved. Investigate a smaller estimation-reflection wedge first. | High for “do not build now”; product demand remains unknown | Interviews expose a repeated unmet problem and several real teams commit to using a prototype in consecutive sprints. |
| Google Ads | Do not run the USD 1/day campaign now. Current paid acquisition has no attributable economic outcome and the likely sample is too small. | High | Clean post-fix baseline, an activation conversion, privacy-compatible attribution, real repeat usage, and an account-specific Keyword Planner forecast all exist. |

These are discovery guardrails, not permanent prohibitions. They prevent spend
or scope expansion until the missing evidence exists.

## Product and measurement baseline

Point Poker is currently a focused, free planning-poker application:

- no account is required for a one-off room or invited guest;
- an account reserves two Team Room URLs and retains sprint history;
- rooms support up to 20 people including facilitators;
- there is no paid tier, advertising, Stripe flow, licence key, trial clock, or
  paid entitlement; and
- the intended product shape is a narrow tool that disappears into the
  estimation ceremony rather than a broad project-management suite.

The generated product facts are in [AI-CONTEXT.md](AI-CONTEXT.md), and the
current strategy is in [PROJECT.md](../PROJECT.md#-analytics--business-metrics-guide).

### Production telemetry snapshot

A read-only production Firebase snapshot was taken on 13 August 2026 for daily
counters from 9–13 August inclusive:

| Counter | Events |
|---|---:|
| `visit_new` | 45 |
| `visit_return` | 40 |
| `room_created` | 41 |
| `room_created_team` | 2 |
| `team_room_reentered` | 0 |
| `estimate_recorded` | 22 |
| session-duration bands, combined | 8 |
| `joined_facilitator` | 52 |
| `joined_voter` | 29 |
| WTP answer bands, combined | 0 |
| `wtp_dismissed` | 0 |
| `device_desktop` | 41 |
| `device_mobile` | 21 |

These are **event counts, not verified people or cohorts**. `visit_new` is
guarded once per browser storage profile; `visit_return` can fire once per
browser per day. Clearing storage or using another browser changes that state,
and the same person can contribute to more than one counter or day. The period
also contains substantial owner production QA documented in
[PROGRESS.md](../PROGRESS.md), so this snapshot cannot establish market demand,
retention, or conversion.

The application has no campaign, UTM, `gclid`, referrer, or advertising-cohort
tracking. Its current analytics are first-party aggregate Firebase counters;
see the event definitions in [`src/App.js`](../src/App.js). The WTP prompt is
only eligible after a facilitator has recorded at least three estimates. Zero
answers at this early stage means insufficient evidence, not proven refusal to
pay.

The pre-9-August Search Console history is also not a clean SEO baseline. Before
the prerender/canonical repair, marketing routes presented the homepage
canonical and were treated as duplicates. The exact warning and comparison
plan are recorded in [AI-CONTEXT.md](AI-CONTEXT.md) and
[PROGRESS.md](../PROGRESS.md#for-the-six-week-re-pull).

## Question 1 — the Point Poker name and institutional blocking

### Verified evidence

Enterprise web-security products classify sites into content categories:

- [Palo Alto URL categories](https://docs.paloaltonetworks.com/advanced-url-filtering/administration/url-filtering-basics/url-categories)
  say site content is a main categorisation consideration. The gambling
  category concerns sites facilitating gambling involving real or virtual
  money; unknown/newly encountered sites can be handled separately.
- [Microsoft Global Secure Access categories](https://learn.microsoft.com/en-us/entra/global-secure-access/reference-web-content-filtering-categories)
  define gambling around online gambling, lotteries, and betting agencies.
- [FortiGuard web-filter categories](https://www.fortiguard.com/webfilter/categories)
  similarly include betting, lotteries, and casinos under gambling.

Point Poker provides estimation, not chance-based wagering. It has no stake,
prize, betting transaction, or gambling gameplay. It therefore falls outside
Google's substantive definition of gambling, which involves staking something
of value on a chance-based outcome to win something of value:
[Google Ads gambling policy](https://support.google.com/adspolicy/answer/15132179?hl=en).

There is nevertheless direct evidence that false positives can occur. In a
2020 discussion about `planningpokeronline.com`, one user reported that a work
firewall blocked it as “online gambling”; another reported that `poker online`
terminology could trigger filtering. This is a documented incident, **not a
prevalence estimate**:
[Hacker News discussion](https://news.ycombinator.com/item?id=23219444).

Planning Poker Online also states that some users' games fail to load because
of organisational security firewalls, without attributing the failures to its
name: [competitor FAQ](https://planningpokeronline.com/faqs/).

The Point Poker repository's historical notes describe a “casino-app look”; see
[`PROJECT.md`](../PROJECT.md#2026-03--modern-2026-casino-style-visual-refresh).
The local, gitignored `CLAUDE.md` is more explicit and calls the theme
“Bet365-style dark forest green”.
This does not prove blocking. It is a reasonable human-perception and
classification risk multiplier alongside the word `poker`.

Registry data records `pointpoker.app` as created on 29 March 2026:
[Google Registry RDAP](https://pubapi.registry.google/rdap/domain/pointpoker.app).
No claim is made about any vendor's current “new domain” threshold.

### Unknowns that must stay unknown until measured

- No bank-specific block-rate study was found.
- No evidence supports saying that banks generally block Point Poker.
- Palo Alto, FortiGuard, and BrightCloud's current category lookup flows require
  CAPTCHA interaction. The research did not obtain a reproducible current
  verdict for `pointpoker.app`.
- There is no measured count of Point Poker users who encountered a corporate
  block.

### Why a redirect is not the answer

If `neutral.example` redirects to `pointpoker.app`, the browser must still load
`pointpoker.app`. A hostname block therefore still wins.

A second domain serving the application directly might pass a naive
hostname-only filter, but it would not solve content categorisation, an
unapproved-SaaS policy, or an enterprise security review. It would also add
authentication, canonical URL, SEO, support, storage, and brand complexity.
The app generates room links from `window.location.origin`, so a directly
served alias would preserve its host in shared links; technical feasibility is
not evidence that the alias is strategically justified.

A real domain move carries search cost and operational obligations. Google's
site-move guidance calls for permanent redirects, both properties to be
verified, and redirects to remain for at least 180 days, with possible search
fluctuation: [Google Change of Address guidance](https://support.google.com/webmasters/answer/9370220?hl=en).

### Decision and validation gate

Keep the name and domain. Do not purchase or deploy a neutral alias as a filter
workaround.

Before reconsidering:

1. Manually check `pointpoker.app` in
   [Palo Alto Test A Site](https://urlfiltering.paloaltonetworks.com/query/),
   [FortiGuard Web Filter Lookup](https://www.fortiguard.com/webfilter), and
   [BrightCloud URL/IP Lookup](https://brightcloud.com/tools/url-ip-lookup.php).
2. Save the date, vendor, category, and screenshot; submit a recategorisation
   request for every false classification.
3. Ask people on several genuine target-organisation networks to open the home
   page, create a room, join its shared URL, and confirm live updates work.
4. Record the vendor and precise failure. Do not count an employer's general
   “unapproved SaaS” policy as proof that the word `poker` caused the block.
5. Reconsider branding only after repeated independent failures survive normal
   recategorisation/unblock processes.

If institutional adoption becomes a target, examine casino-adjacent visual
signals and publish clear trust/security information before assuming a domain
change is necessary. TeamRetro's enterprise positioning—SOC 2 Type II, SAML,
SCIM, audit logs, regional hosting, and SLA—also illustrates that enterprise
adoption can depend on security/procurement controls rather than naming alone:
[TeamRetro](https://www.teamretro.com/).

## Question 2 — whether to add retrospectives

### Verified market and practice evidence

The Sprint Retrospective is an official Scrum event. Its purpose is to plan ways
to increase quality and effectiveness by inspecting people, interactions,
processes, tools, and the Definition of Done, then identifying useful changes:
[Scrum Guide 2020](https://scrumguides.org/docs/scrumguide/v2020/2020-Scrum-Guide-US.pdf).

Planning poker and retrospectives serve the same facilitators and teams at
nearby points in the sprint cadence. Several products bundle them:

- [Parabol pricing](https://www.parabol.co/pricing/) currently lists
  retrospectives and sprint poker together. Its free tier includes up to two
  teams, ten meetings per month, unlimited users, and limited history.
- [TeamRetro](https://www.teamretro.com/) bundles retrospectives, health checks,
  and estimation, with anonymous brainstorming/voting, actions, reporting, and
  enterprise controls.
- [Pokify](https://pokify.dev/Plans) combines planning poker with a
  Start/Stop/Continue retrospective.
- [EasyRetro](https://easyretro.io/) offers templates, public/private boards,
  voting, comments, grouping, export, and integrations.

This validates **workflow adjacency and competition**. Competitor product pages
do not establish Point Poker demand, independent market size, or willingness to
pay.

A credible retrospective workflow is more than a notes field. Atlassian's
facilitation guide includes psychological safety, gathering feedback, finding
patterns, and action items with owners and deadlines:
[Atlassian retrospective play](https://www.atlassian.com/team-playbook/plays/retrospective).

A longitudinal empirical study covering 37 retrospectives over nearly three
years found that teams frequently discussed local and controllable issues, but
participant bias, weak evidence, complexity, and lack of control could leave
issues unresolved or repeated. This supports action follow-through rather than
a decorative board:
[Empirical Software Engineering study](https://link.springer.com/article/10.1007/s10664-016-9464-2).

### Product and technical implications

Point Poker's present model is estimation-specific: deck, estimation mode,
stories, votes, rounds, and history. A credible retrospective adds a separate
model for cards, optional anonymity, grouping, dot votes, phases, actions,
owners, due dates, carry-over, export, retention, and deletion.

Retrospective content can also be more sensitive than story estimates. The
privacy and institutional trust bar therefore rises. This is a meaningful
product expansion, not a small option on the create-room form.

The market already contains capable free and paid alternatives. Building a
generic clone now would weaken Point Poker's narrow positioning before repeat
usage or demand is understood.

### Decision

Do not build a full generic retrospective product now. Research the adjacent
need.

The more differentiated hypothesis is an **estimation reflection** using data
Point Poker already creates. After a split estimate or re-vote, a facilitator
might capture:

- the reason estimates diverged;
- one learning or assumption;
- one decision or follow-up action; and
- recurring disagreement patterns in Team Room history.

This is a product hypothesis, not validated demand.

### Discovery gate before implementation

The following numbers are internal decision thresholds, not universal research
facts:

1. Interview 10–15 facilitators or Scrum Masters about their most recent real
   retrospective, current tool, failures, action completion, switching cost,
   anonymity, privacy, and payment—not whether a hypothetical feature “sounds
   useful”.
2. Look for the same unmet problem to recur without leading the interviewee.
3. Recruit three to five real teams willing to use a prototype for at least two
   consecutive sprints. Compliments and waitlist clicks are weaker than a
   commitment to use it.
4. Prototype the flow before implementing durable storage and integrations.
5. Approve implementation only if teams return, complete the workflow, and
   carry actions forward.

If validated, the first credible release should be a separate Team Room
surface: Start/Stop/Continue, optional anonymity, grouping, dot voting, no more
than three resulting actions, owner/due date, export, and explicit retention and
deletion. Do not begin with AI summaries, a large template library, or external
integrations.

## Question 3 — Google Ads at USD 1/day for 30 days

### Verified budget and market evidence

Google describes the setting as an **average daily budget**, not a strict daily
cap. A campaign may spend up to twice the average on a particular day; the
monthly charging limit for most campaigns is 30.4 times the average daily
budget: [Google Ads budget guidance](https://support.google.com/google-ads/answer/2375454?hl=en).

An account-specific forecast was not obtained. Google Keyword Planner can
forecast clicks, impressions, and conversions using the actual keywords,
geography, bids, and budget; this is the appropriate evidence before choosing a
test budget: [Keyword Planner forecasts](https://support.google.com/google-ads/answer/7337243?hl=en).

A broad 2025 benchmark across search-advertising campaigns reported an average
CPC of USD 5.26 across industries and USD 5.58 for Business Services:
[LocalIQ search benchmarks](https://localiq.com/blog/search-advertising-benchmarks/).
This is a sensitivity reference, **not a Point Poker CPC forecast**.

| Actual CPC scenario | Approximate clicks from USD 30 |
|---:|---:|
| USD 0.25 | 120 |
| USD 0.50 | 60 |
| USD 1.00 | 30 |
| USD 2.00 | 15 |
| USD 5.26 broad benchmark | 5–6 |

At the likely low sample sizes, a result of a few activated rooms would be too
weak to distinguish repeatable demand from chance. USD 30 can be a research
budget later; it is not currently a credible growth experiment.

### Why the experiment has no economic answer today

Point Poker currently has no revenue, lifetime value, paid conversion, or
reliable retention measure. Any paid-acquisition cost is therefore greater
than current direct revenue from that user. Advertising could validate a
message or keyword, but it cannot yet demonstrate financial sustainability.

The app also cannot attribute its useful outcomes to a campaign. Google Ads
conversion measurement normally requires a website data source or Google tag:
[Google conversion setup](https://support.google.com/google-ads/answer/16560108?hl=en).
Google documents that its tag can set cookies containing identifiers and ad
click information:
[Google tag cookie behaviour](https://support.google.com/google-ads/answer/7548399?hl=en&ref_topic=3165803).
Adding that tag would require an explicit privacy/product decision because the
current product deliberately avoids third-party analytics and tracking cookies.

Without attribution, the campaign can count clicks but cannot reliably connect
them to room creation, teammate invitation, three completed estimates, a
returning team, Team Room adoption, or willingness to pay.

The organic measurement window also only began after the 9–12 August SEO and
localisation repairs. Paid traffic does not pollute Search Console's organic
reports, but it would mix into the application's aggregate usage counters.

### Advertising-policy risk

Point Poker is not gambling under Google's published substantive definition.
However, Google says a regulated-industry label can sometimes be applied because
content or terminology is associated with a regulated industry even when the
actual offering is compliant; false labels can be appealed:
[Google policy-label appeals](https://support.google.com/google-ads/answer/9338593?hl=en).

Ad approval is plausible, but it must not be promised in advance.

### Decision and gate for a future experiment

Do not run Google Ads during the present measurement window. Reopen the decision
only when all of these exist:

1. The six-week post-fix Search Console and product baseline has been reviewed.
2. Owner/QA activity is excluded or separately identifiable.
3. The conversion is an activated session, preferably a facilitator recording
   at least three estimates—not a click or account registration.
4. Campaign attribution is privacy-compatible and documented.
5. Several real teams show repeat usage.
6. There is an explicit economic or strategic value for an activated team.
7. Keyword Planner predicts enough clicks at the chosen location and keywords
   to answer the experiment's question.

If those gates pass, use Search only, start with exact-match high-intent planning
poker terms, and exclude casino/betting intent. Google describes exact match as
providing the most control:
[Google keyword match types](https://support.google.com/google-ads/answer/14996023?hl=en).
Use an estimation-specific landing page, a fixed total cap, an activated-room
conversion, and a written stop rule. Do not use Display or a broad automated
campaign for a tiny validation budget.

## Action calendar

### 13–20 August 2026 — no-spend evidence collection

- Complete the five already-planned Search Console indexing requests.
- Manually record the three domain-category lookup results and file any
  recategorisation request.
- Begin target-organisation access tests; collect the filtering vendor and exact
  error rather than a general report that “the bank blocked it”.
- Recruit retrospective interviewees and real planning-poker teams.
- Do not buy a domain, build a full retrospective, or start paid advertising.

### Before 23 September 2026

- Complete native Portuguese and Japanese review as already planned.
- Aim to complete 10–15 retrospective interviews and identify possible design
  partners.
- Let real organic product use accumulate without paid traffic.
- Preserve the current first-party telemetry posture unless a separate privacy
  decision approves campaign attribution.

### Around 23 September 2026

- Run the exact six-week Search Console checklist in `PROGRESS.md`.
- Separate real usage from production QA as far as the available data permits.
- Review activated-session depth, Team Room returns, search impressions and
  positions, non-English queries, confirmed access failures, and interview
  evidence.
- Apply the three reopening gates in this document. Do not treat the calendar
  date alone as permission to spend or build.

### After the review

- **Name/domain:** change only if confirmed repeated blocks remain after normal
  recategorisation or IT review.
- **Retrospective:** prototype only if repeated pain and committed design
  partners exist; prefer estimation reflection over a generic clone.
- **Ads:** use Keyword Planner before setting a budget; run only if attribution
  and an economically meaningful activation outcome exist.

## Evidence quality and limitations

| Evidence type | What it can establish | What it cannot establish |
|---|---|---|
| Repository and production counters | Current product, implementation, event definitions, early aggregate activity | Unique users, uncontaminated retention, future demand |
| Official Scrum/Google/security-vendor documentation | Definitions, platform rules, recommended processes | Point Poker's current vendor classification or campaign outcome |
| Competitor product/pricing pages | Current feature bundles and competitive alternatives | Independent market size, customer satisfaction, Point Poker demand |
| Documented firewall anecdote | False gambling classification has happened to a planning-poker service | Frequency across companies or banks |
| Internal decision thresholds | A disciplined go/no-go process | Universal statistical or industry standards |

Known gaps at the time of writing:

- no current Palo Alto, FortiGuard, or BrightCloud verdict for the domain;
- no bank-specific prevalence data;
- no interviews with Point Poker retrospective prospects;
- no account-specific Keyword Planner forecast;
- no paid-traffic conversion attribution; and
- no clean long-term activation, retention, or willingness-to-pay cohort.

Any later answer that fills one of these gaps must record the date, method,
source, and result here or in a successor dated decision record.

## Rules for future AI assistants

- Do not say banks generally block Point Poker; evidence only shows that some
  enterprise filters can falsely classify planning-poker sites.
- Do not claim the current domain is categorised as gambling until a dated
  lookup proves it.
- Do not recommend a redirect to a blocked final hostname as a solution.
- Do not turn competitor feature bundles into proof of Point Poker demand.
- Do not start a full retrospective implementation without the discovery gate.
- Do not call USD 30 a sustainable acquisition strategy while direct revenue
  and attributable lifetime value are zero.
- Do not use pre-9-August Search Console data as the post-fix baseline.
- Do not install a third-party advertising/conversion tag without an explicit
  privacy and product decision.
- Treat the current answer as **spend USD 0 now**, then review evidence around
  23 September—not as “never spend” or “never expand”.

# i18n / translation — working log

**Temporary file.** Everything durable folds into `PROGRESS.md` + `CLAUDE.md` at the end,
then this file gets deleted. It exists so that a usage-limit cut-off loses no knowledge.

Started 12 Aug 2026. Baseline commit: `801e934`.

---

## Why

Search Console's 90-day query list already contains searches in languages the site
has nothing to serve:

- `ストーリーポイントフィボナッチ` — Japanese, "story point fibonacci"
- `is planning poker nog wel relevant` — Dutch

`CLAUDE.md` had already flagged the lever and the demand evidence
(`planning poker kostenlos`, `o que é planning poker`, `scrum poker en ligne`),
and noted the competitor scrumpoker-online.org runs seven languages. It was
listed as "the largest remaining lever" and deliberately not done, because it
needs the **app** translated, not just the marketing pages.

## Locales

| Code | hreflang | Language | Evidence |
|------|----------|----------|----------|
| en   | `en`     | English  | current, stays at root — no `/en/` prefix, existing URLs must not move |
| de   | `de`     | German   | `planning poker kostenlos`; DACH scrum market |
| es   | `es`     | Spanish  | largest speaker base; `planning poker gratis` |
| fr   | `fr`     | French   | `scrum poker en ligne` |
| pt   | `pt-BR`  | Portuguese (Brazil) | `o que é planning poker`; large BR agile community |
| nl   | `nl`     | Dutch    | **in our own query list** |
| ja   | `ja`     | Japanese | **in our own query list** |

## Rules I am holding myself to

1. **No machine-translation feel.** Copy is written as native marketing copy in each
   language, not transliterated English. Agile vocabulary that is genuinely borrowed
   in the target language stays borrowed (`Story Points`, `Sprint`, `Backlog`,
   `Scrum`, `Product Owner`) — translating those *reads* wrong to a practitioner.
2. **No new claims.** A translated page may not assert anything the English page does
   not. Same facts, same limits, same honesty about there being no Jira plugin.
3. **English URLs do not move.** They are indexed. Locales are additive prefixes.
4. **Legal stays English.** `/terms` and `/privacy` are not translated and get no
   locale URL — a mistranslated liability clause is a real risk, and the English text
   is the governing one.
5. **Admin stays English.** Owner-only, `noindex`, one user, who is English-speaking.
6. **Complete by construction.** A test fails if any locale is missing any UI key or
   any localized route. Half-translated is worse than untranslated.

## Plan (staged so a cut-off never lands mid-refactor)

- [x] **S1** Recon: measure string surface, read router/prerender/sitemap
- [x] **S2** `src/i18n.mjs` — locale table, `t()`, path↔locale helpers
- [x] **S3** Route the locale prefix in App.js + prerender + sitemap + hreflang
- [x] **S4** German end-to-end (content pages + full app UI) — proves the machinery
- [x] **S5** Remaining locales as pure data: es, fr, pt, nl, ja
- [x] **S6** Convert app UI call sites to `t()` (NavBar, footer, Join, Game, modals)
- [x] **S7** Tests: key parity, route parity, hreflang reciprocity, no-English-leak
- [x] **S8** Build, browser-verify each locale, lint, full suite
- [x] **S9** Commit + push + Vercel deploy verify
- [x] **S10** Search Console: submit, inspect, check settings
- [x] **S11** Fold into PROGRESS.md / CLAUDE.md, delete this file

---

## Step log

### S1 — recon (done)
- `src/App.js` 8,394 lines; ~398 unique user-facing strings (260 JSX text nodes +
  144 literal props).
- Content already data-driven for 6 routes via `ROUTE_CONTENT` → `<ContentPage>`;
  9 marketing pages still hand-written JSX (`PricingPage`, `AboutPage`,
  `SupportPage`, `TrustPage`, `WhatIsPlanningPokerPage`, `AgileEstimationToolPage`,
  `FeaturesPage`, `StoryPointEstimationPage`, `RemoteSprintPlanningPage`).
- `public/index.html` is `<html lang="en">`, hardcoded. Zero `hreflang` anywhere.
- Build chain: `gen-ai-context` → `gen-sitemap` → `react-scripts build` → `prerender`.
- `prerender.mjs` writes one document per `STATIC_ROUTE_META` key. Locale routes
  therefore come free once they are in that table.

### S2–S4 — machinery + German end to end (done)
Commit 1. Files added: `src/i18n.mjs`, `src/locales/{index,en,de}.mjs`.

Design decisions worth keeping:
- **Locale is a property of the URL**, read once at startup, not React context.
  It cannot change without a navigation, so threading a `t` prop through thirty
  components would have bought nothing. `src/index.js` calls
  `initLocaleFromPath(window.location.pathname)`.
- **No Accept-Language sniffing.** Googlebot crawls as en-US from US IPs, so
  sniffing would serve it the English page at the German URL and eventually get
  the whole `/de/` folder dropped.
- **Locale routes are folded into the existing three tables** in routeMeta
  (`STATIC_SCREEN_BY_PATH`, `STATIC_ROUTE_META`, `ROUTE_CONTENT`) keyed by full
  path. Everything downstream — router, `applyRouteMeta`, `<ContentPage>`,
  prerender, sitemap — then works on them with no idea locales exist.
- **`withLocale` returns the English path for an untranslated page**, so a
  German footer links to `/pricing`, not to a `/de/pricing` with no document.
- **`{max}`/`{email}` placeholders** in the locale files, filled from
  `MAX_PARTICIPANTS`/`SUPPORT_EMAIL`. Keeps the locale files import-free, which
  is what keeps the module graph acyclic, and keeps six languages of marketing
  copy from drifting away from the cap the Firebase rules enforce.
- **Getters** on `DECK_DEFINITIONS` / `ESTIMATION_MODES` labels. Those objects
  are module-level constants evaluated at import time, before the locale is
  known; a getter resolves at read time instead. Zero call-site changes.
- **Language switcher is real `<a href>` links.** A client-side toggle would be
  invisible to a crawler and would leave the URL claiming a language the page
  no longer showed.

Two real defects found and fixed on the way:
1. **The home page's FAQPage schema did not match the page.** `HOME_FAQ` in
   routeMeta (9 questions, prerendered into JSON-LD) and `FAQ_ITEMS` in App.js
   (8 questions, rendered) had drifted: the schema claimed three answers that
   were nowhere on the page ("Is scrum poker the same as planning poker?", "Can
   we estimate in hours?", "Do I need a Jira plugin?") and the page showed two
   the schema never mentioned. Google's FAQPage rule is that the answer must be
   visible on the page, so that markup was ineligible at best and a violation at
   worst. The page now renders `ROUTE_CONTENT[home].faq`; the two orphaned
   questions were added to it, so nothing was lost. ~90 lines of JSX deleted.
2. **`estMode.singular === "task"`** — a comparison against a display string.
   Correct in English, silently false in every other language. Now
   `estMode.key === "tasks"`.

Tests: 411 pass. 8 assertions in `designsystem.test.js` moved from reading
`App.js` to reading `src/locales/en.mjs`, because that is where the words went.

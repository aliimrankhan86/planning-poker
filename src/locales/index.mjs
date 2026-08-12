/* ═══════════════════════ LOCALE REGISTRY ═══════════════════════
   The language table and the per-locale data, in one place that imports
   nothing. Everything else imports *this*, which is what keeps the graph
   acyclic:

     locales/index.mjs   ← imports nothing but the locale files
       ↑            ↑
     routeMeta.mjs  i18n.mjs        (routeMeta builds the routes,
       ↑            ↑                i18n runs the strings)
        \          /
          src/App.js  ·  scripts/prerender.mjs

   Adding a language is: one file beside this one, one line in LOCALES, one
   line in the import block. The parity tests in App.test.js fail until that
   language has every UI key and every localized page, so a half-finished
   translation cannot ship.
═══════════════════════════════════════════════════════════════ */
import * as en from "./en.mjs";

/* `prefix` is the URL segment. English deliberately has none: those URLs are
   already indexed and moving them to /en/ would throw away every ranking the
   site has, for no gain. English is therefore also the x-default.

   ── WHY ONLY THESE TWO ───────────────────────────────────────────────
   Seven languages shipped on 12 Aug 2026; five were cut the same day, before
   Google had indexed any of them. de, es, fr and nl are gone. The reasoning
   is worth keeping, because "add German back, it had the most traffic" is the
   obvious wrong move and the traffic data is what makes it look right.

   Twelve months of Search Console, grouped by language:

     Dutch ~610 · German ~500 · Portuguese 192 · Spanish ~95 · Japanese 85
     · French ~82        — and zero clicks from any of them.

   Then the query drill-down, which is what actually decided it. Every query
   from those markets is an English loanword: 26 of 26 Dutch queries
   ("planning poker" 231, "scrum poker" 136), 33 of 33 German. Cross-referenced
   against EF EPI 2025 the pattern is not a coincidence — the Netherlands is
   ranked #1 in the world for English proficiency (624) and Germany #4 (615).
   Those markets are already reaching the English pages. A translation gives
   them a second way to arrive somewhere they arrive at anyway.

   The two kept are the two where an English-only site is genuinely invisible:

     ja  EF EPI 446, "Very low" — the weakest English of any market that
         reaches this site. The one non-English query ever recorded in Search
         Console is Japanese: ストーリーポイントフィボナッチ. Competition is
         hobby-grade (Hatjitsu, Plapo, 見積もり場).
     pt  EF EPI 482, "Low". 192 impressions with no Portuguese content at all,
         and no dedicated Portuguese planning-poker tool appears to exist —
         only articles. Largest open gap found.

   German was the hardest cut and stays cut: it is the one market with real
   incumbents (consileon.de, scrumpoker-online.de, bleech.de, develappers.de),
   and develappers sells on "hosted in Germany, no tracking to the USA", which
   is not an objection a Firebase + Vercel app can answer.

   Honest caveat, so a later session does not over-read the numbers above:
   Search Console only reports queries a page actually got an impression for,
   and this site was English-only for its whole life. Native-language demand is
   systematically under-counted by that data — absence of German queries is not
   evidence of absent German demand. The EF proficiency split is what carries
   the argument; the impression counts only corroborate it.

   The cut prefixes 301 to their English equivalents in vercel.json. Deleting a
   locale is not enough on its own — those URLs were submitted to Search
   Console, and an unmatched path on Vercel is a bare 404. */
export const LOCALES = {
  en: { hreflang: "en",    ogLocale: "en_GB", inLanguage: "en-GB", label: "English",   prefix: "" },
  pt: { hreflang: "pt-BR", ogLocale: "pt_BR", inLanguage: "pt-BR", label: "Português", prefix: "/pt" },
  ja: { hreflang: "ja",    ogLocale: "ja_JP", inLanguage: "ja-JP", label: "日本語",     prefix: "/ja" },
};

export const DEFAULT_LOCALE = "en";
export const LOCALE_CODES = Object.keys(LOCALES);
export const TRANSLATED_LOCALES = LOCALE_CODES.filter((c) => c !== DEFAULT_LOCALE);

/* The pages that exist in every language.

   Deliberately not all eighteen. Six near-identical thin pages per language is
   the same doorway-page pattern the English site was just pulled out of, and
   translation nobody re-reads is how a site ends up with copy that quietly
   contradicts itself. These four are the ones with evidence behind them:

     /                          the app itself, plus "planning poker gratis
                                / 無料"
     /what-is-planning-poker    "o que é / とは" is the single largest
                                non-English query shape
     /fibonacci-story-points    ストーリーポイントフィボナッチ is in our own
                                Search Console query list, and "story points
                                fibonacci" is a top-five query in Brazil
     /scrum-poker               "scrum poker" is the #1 Brazilian query (36
                                impressions) and #2 in Japan

   Expanding the set later is data only: add a path here, add its content to
   both locale files, and the tests tell you when you have missed one.

   /terms and /privacy are deliberately absent. A mistranslated liability
   clause is a real liability, and the English text is the governing one. */
export const LOCALIZED_PATHS = [
  "/",
  "/what-is-planning-poker",
  "/fibonacci-story-points",
  "/scrum-poker",
];

/* ── ONE LANGUAGE PER VISITOR ────────────────────────────────────────
   Statically importing every language puts every translation in the main
   bundle — it cost +114 kB gzip back when there were seven of them, of which
   a given visitor needed one seventh. Nobody reads the site in two languages
   at once, so the split is worth keeping at two as well.

   Each translation is behind its own dynamic import, so webpack emits one
   chunk per language and a visitor downloads only theirs. English is the
   exception and stays static: it is the default locale, the fallback for
   every missing key, and the language most visitors are already getting —
   a chunk request for it would be a round trip to fetch what they always
   need. src/index.js awaits the active locale before the first render, so
   nothing ever renders half-translated.
─────────────────────────────────────────────────────────────────── */
const LOADERS = {
  pt: () => import(/* webpackChunkName: "locale-pt" */ "./pt.mjs"),
  ja: () => import(/* webpackChunkName: "locale-ja" */ "./ja.mjs"),
};

/* Filled in as languages arrive. English is present from the start, which is
   what makes t()'s English fallback safe at any moment. */
export const UI = { en: en.ui };
export const CONTENT = {};
export const META = {};

export async function loadLocale(code) {
  if (code === DEFAULT_LOCALE || UI[code]) return UI[code] ? code : DEFAULT_LOCALE;
  const loader = LOADERS[code];
  if (!loader) return DEFAULT_LOCALE;
  const mod = await loader();
  UI[code] = mod.ui;
  CONTENT[code] = mod.content;
  META[code] = mod.meta;
  return code;
}

/* Build-time consumers — the prerenderer, the sitemap generator, the tests —
   want every language at once, and none of them ships to a browser. */
export const loadAllLocales = () => Promise.all(TRANSLATED_LOCALES.map(loadLocale));

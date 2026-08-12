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
   site has, for no gain. English is therefore also the x-default. */
export const LOCALES = {
  en: { hreflang: "en",    ogLocale: "en_GB", inLanguage: "en-GB", label: "English",    prefix: "" },
  de: { hreflang: "de",    ogLocale: "de_DE", inLanguage: "de-DE", label: "Deutsch",    prefix: "/de" },
  es: { hreflang: "es",    ogLocale: "es_ES", inLanguage: "es-ES", label: "Español",    prefix: "/es" },
  fr: { hreflang: "fr",    ogLocale: "fr_FR", inLanguage: "fr-FR", label: "Français",   prefix: "/fr" },
  pt: { hreflang: "pt-BR", ogLocale: "pt_BR", inLanguage: "pt-BR", label: "Português",  prefix: "/pt" },
  nl: { hreflang: "nl",    ogLocale: "nl_NL", inLanguage: "nl-NL", label: "Nederlands", prefix: "/nl" },
  ja: { hreflang: "ja",    ogLocale: "ja_JP", inLanguage: "ja-JP", label: "日本語",      prefix: "/ja" },
};

export const DEFAULT_LOCALE = "en";
export const LOCALE_CODES = Object.keys(LOCALES);
export const TRANSLATED_LOCALES = LOCALE_CODES.filter((c) => c !== DEFAULT_LOCALE);

/* The pages that exist in every language.

   Deliberately not all eighteen. Six near-identical thin pages per language is
   the same doorway-page pattern the English site was just pulled out of, and
   35,000 words of translation nobody re-reads is how a site ends up with copy
   that quietly contradicts itself in five languages. These four are the ones
   with evidence behind them:

     /                          the app itself, plus "planning poker kostenlos
                                / gratis / gratuit / 無料"
     /what-is-planning-poker    "was ist / qué es / o que é / wat is / とは" is
                                the single largest non-English query shape
     /fibonacci-story-points    ストーリーポイントフィボナッチ is in our own
                                Search Console query list
     /scrum-poker               "scrum poker en ligne" — the French evidence

   Expanding the set later is data only: add a path here, add its content to
   all six locale files, and the tests tell you when you have missed one.

   /terms and /privacy are deliberately absent. A mistranslated liability
   clause is a real liability, and the English text is the governing one. */
export const LOCALIZED_PATHS = [
  "/",
  "/what-is-planning-poker",
  "/fibonacci-story-points",
  "/scrum-poker",
];

/* ── ONE LANGUAGE PER VISITOR ────────────────────────────────────────
   Statically importing all seven put every translation in the main bundle:
   +114 kB gzip, of which a given visitor needs one seventh. Nobody reads
   the site in six languages at once.

   Each translation is behind its own dynamic import, so webpack emits one
   chunk per language and a visitor downloads only theirs. English is the
   exception and stays static: it is the default locale, the fallback for
   every missing key, and the language most visitors are already getting —
   a chunk request for it would be a round trip to fetch what they always
   need. src/index.js awaits the active locale before the first render, so
   nothing ever renders half-translated.
─────────────────────────────────────────────────────────────────── */
const LOADERS = {
  de: () => import(/* webpackChunkName: "locale-de" */ "./de.mjs"),
  es: () => import(/* webpackChunkName: "locale-es" */ "./es.mjs"),
  fr: () => import(/* webpackChunkName: "locale-fr" */ "./fr.mjs"),
  pt: () => import(/* webpackChunkName: "locale-pt" */ "./pt.mjs"),
  nl: () => import(/* webpackChunkName: "locale-nl" */ "./nl.mjs"),
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

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
import * as de from "./de.mjs";
import * as es from "./es.mjs";
import * as fr from "./fr.mjs";
import * as pt from "./pt.mjs";

/* `prefix` is the URL segment. English deliberately has none: those URLs are
   already indexed and moving them to /en/ would throw away every ranking the
   site has, for no gain. English is therefore also the x-default. */
export const LOCALES = {
  en: { hreflang: "en",    ogLocale: "en_GB", inLanguage: "en-GB", label: "English",    prefix: "" },
  de: { hreflang: "de",    ogLocale: "de_DE", inLanguage: "de-DE", label: "Deutsch",    prefix: "/de" },
  es: { hreflang: "es",    ogLocale: "es_ES", inLanguage: "es-ES", label: "Español",    prefix: "/es" },
  fr: { hreflang: "fr",    ogLocale: "fr_FR", inLanguage: "fr-FR", label: "Français",   prefix: "/fr" },
  pt: { hreflang: "pt-BR", ogLocale: "pt_BR", inLanguage: "pt-BR", label: "Português",  prefix: "/pt" },
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

const MODULES = { en, de, es, fr, pt };

export const UI = Object.fromEntries(
  LOCALE_CODES.map((code) => [code, MODULES[code].ui]),
);

/* English content stays in routeMeta.mjs, which is the source language and the
   thing every translation was made from. Only the translations live here. */
export const CONTENT = Object.fromEntries(
  TRANSLATED_LOCALES.map((code) => [code, MODULES[code].content]),
);

export const META = Object.fromEntries(
  TRANSLATED_LOCALES.map((code) => [code, MODULES[code].meta]),
);

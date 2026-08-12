/* ═══════════════════════ i18n RUNTIME ═══════════════════════
   Locale resolution and string lookup. The data lives in src/locales/.

   The locale is a property of the URL, not of the browser, not of a cookie,
   and not of a toggle in the corner. That is the whole design:

     • a crawler asking for /de/ gets German, every time, with no JavaScript
     • one URL is one language, so hreflang and canonical mean what they say
     • Accept-Language sniffing would serve Googlebot (which crawls as en-US
       from US IPs) the English page at the German URL, which is the classic
       way to get an entire language folder dropped from the index

   Because the locale can only change by navigating, it is a module-level
   value read once at startup rather than React context threaded through
   thirty components. The language switcher is a real <a href> for the same
   reason: a client-side swap would be invisible to a crawler.
═══════════════════════════════════════════════════════════════ */
import {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_CODES,
  LOCALIZED_PATHS,
  UI,
} from "./locales/index.mjs";
import { MAX_PARTICIPANTS, SUPPORT_EMAIL } from "./routeMeta.mjs";

export {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_CODES,
  LOCALIZED_PATHS,
} from "./locales/index.mjs";

const PREFIXES = LOCALE_CODES.filter((c) => LOCALES[c].prefix).map((c) => [
  LOCALES[c].prefix,
  c,
]);

/* "/de/scrum-poker" → { locale: "de", path: "/scrum-poker" }
   "/scrum-poker"    → { locale: "en", path: "/scrum-poker" }
   "/de"             → { locale: "de", path: "/" }

   A prefix only counts when it is a whole segment, so /designers never reads
   as German. */
export function splitLocalePath(pathname = "/") {
  for (const [prefix, code] of PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return { locale: code, path: pathname.slice(prefix.length) || "/" };
    }
  }
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/* The inverse, with one rule that matters: a path with no translation returns
   its English URL. Without that, a German page's footer would link to
   /de/pricing — a URL that has no document, no entry in the sitemap, and
   nothing but the English page behind it. Linking straight to /pricing is
   both honest and the only version that resolves. */
export function withLocale(locale, path = "/") {
  const { prefix } = LOCALES[locale] || {};
  if (!prefix || !LOCALIZED_PATHS.includes(path)) return path;
  return path === "/" ? `${prefix}/` : `${prefix}${path}`;
}

/* Every URL this path exists at, for hreflang. Reciprocal by construction:
   each page in the set lists the whole set including itself, which is what
   Google requires before it will honour any of them. */
export function alternatesFor(path) {
  if (!LOCALIZED_PATHS.includes(path)) return [];
  return LOCALE_CODES.map((code) => ({
    code,
    hreflang: LOCALES[code].hreflang,
    path: withLocale(code, path),
  }));
}

let current = DEFAULT_LOCALE;

export const getLocale = () => current;

export function setLocale(code) {
  current = LOCALES[code] ? code : DEFAULT_LOCALE;
  return current;
}

/* Called once at startup by src/index.js. Kept separate from setLocale so the
   tests can drive the locale directly without touching window.location. */
export function initLocaleFromPath(pathname) {
  const { locale } = splitLocalePath(pathname);
  return setLocale(locale);
}

/* Substitutions the strings may use. Only two, and both are single-sourced
   elsewhere — the participant cap that the room rules actually enforce, and
   the support address that the JSON-LD ContactPoint advertises. Writing "20"
   into six languages of marketing copy is how the cap and the copy drift. */
const VARS = { max: MAX_PARTICIPANTS, email: SUPPORT_EMAIL };

const fill = (s, vars) =>
  typeof s === "string"
    ? s.replace(/\{(\w+)\}/g, (m, k) => {
        const v = vars?.[k] ?? VARS[k];
        return v === undefined ? m : String(v);
      })
    : s;

/* Falls back to English when a key is missing rather than rendering "{key}"
   at a user. The fallback is a seatbelt, not a strategy: the key-parity test
   fails the build long before anyone can see it fire. */
function lookup(key) {
  const table = UI[current] || UI[DEFAULT_LOCALE];
  const value = table[key];
  return value === undefined ? UI[DEFAULT_LOCALE][key] : value;
}

export function t(key, vars) {
  const value = lookup(key);
  if (value === undefined) return key;
  return fill(value, vars);
}

/* For the strings that are genuinely lists — bullet sets, ordered steps. */
export function tList(key, vars) {
  const value = lookup(key);
  return Array.isArray(value) ? value.map((v) => fill(v, vars)) : [];
}

/* ═══════════════════════ BUILD-TIME PRERENDER ═══════════════════════
   CRA ships one index.html for every URL. Combined with the Vercel rewrites
   that pointed every marketing path at "/", this meant Google's non-JS pass,
   Bing, the AI answer crawlers, and every link unfurler (Slack, LinkedIn,
   WhatsApp, X) saw the *homepage* title, description, and canonical on all
   fourteen marketing URLs. Fourteen pages competing as duplicates of "/".

   This writes a real HTML file per route with:
     • correct <title>, description, canonical, Open Graph, Twitter card
     • per-page JSON-LD (WebPage/FAQPage/HowTo + BreadcrumbList + Organization)
     • a static content shell inside #root so a crawler that never runs
       JavaScript still receives on-topic prose and working internal links

   React replaces the shell on hydration, so users see the full app.

   Run: node scripts/prerender.mjs   (wired into `npm run build`)
═══════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { contentModified } from "./gen-sitemap.mjs";
import {
  SITE_URL,
  DEFAULT_META,
  DEFAULT_OG_IMAGE,
  STATIC_ROUTE_META,
  PRIVATE_PATHS,
  ROUTE_CONTENT,
  PRERENDER_LINKS,
  SUPPORT_EMAIL,
  alternatesFor,
  localeUrl,
  activateAllLocales,
} from "../src/routeMeta.mjs";
import { LOCALES, UI } from "../src/locales/index.mjs";

/* Translations load per language in the browser; a build has to write every
   one of them, so it pulls the whole set in first. Top-level await, because
   the route tables have to be complete before the first document is rendered. */
await activateAllLocales();

const BUILD_DIR = "build";
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Shared with the sitemap so <lastmod> and dateModified can never disagree.
const CONTENT_MODIFIED = contentModified();

const ORGANISATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "Point Poker",
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/logo512.png`,
  // A published, machine-readable way to reach a human. Google and the answer
  // engines both read this as a trust signal, and it costs one object.
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: SUPPORT_EMAIL,
    url: `${SITE_URL}/support`,
    availableLanguage: "English",
  },
};

const WEBSITE = {
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: "Point Poker",
  url: `${SITE_URL}/`,
  publisher: { "@id": `${SITE_URL}/#organization` },
  inLanguage: "en-GB",
};

const SOFTWARE_APP = {
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#app`,
  name: "Point Poker",
  // Six names for one ceremony, and teams search for all six. This is the
  // machine-readable way to say so — the alternative is five near-identical
  // landing pages, which is a doorway-page penalty rather than a ranking.
  alternateName: [
    "Planning Poker",
    "Scrum Poker",
    "Pointing Poker",
    "Poker Planning",
    "Sprint Poker",
    "Estimation Poker",
  ],
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Agile estimation",
  operatingSystem: "Web browser",
  url: `${SITE_URL}/`,
  description: DEFAULT_META.description,
  // Free for everyone: one zero-price offer, no paid tier to advertise.
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "GBP",
    availability: "https://schema.org/InStock",
    description:
      "Every feature free for every team: up to 20 participants, unlimited rounds and stories, all card decks, timer, analytics, and CSV export. No account required.",
  },
  featureList: [
    "Simultaneous vote reveal — removes anchoring bias",
    "Fibonacci, T-shirt sizing, and Powers of 2 card decks",
    "Story and task queues with bulk paste import",
    "Countdown timer for time-boxed rounds",
    "Facilitator analytics: consensus rate, spread, outliers, re-votes",
    "Clipboard summary and CSV export",
    "Keyboard shortcuts for voting, reveal, and next item",
    "Two fixed Team Room URLs and sprint history with a free account",
    "No ads and no third-party tracking cookies",
  ],
  isAccessibleForFree: true,
  publisher: { "@id": `${SITE_URL}/#organization` },
};

function breadcrumb(path, title) {
  const items = [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
  ];
  if (path !== "/") {
    items.push({ "@type": "ListItem", position: 2, name: title, item: `${SITE_URL}${path}` });
  }
  return { "@type": "BreadcrumbList", itemListElement: items };
}

function graphFor(path, m, content) {
  const lang = LOCALES[m.locale || "en"].inLanguage;
  const nodes = [ORGANISATION, WEBSITE, breadcrumb(path, content?.h1 || m.title)];
  nodes.push({
    // /support is the page that tells you how to reach us, so it is a
    // ContactPage as well as a WebPage. schema.org allows the array form.
    "@type": path === "/support" ? ["WebPage", "ContactPage"] : "WebPage",
    "@id": `${SITE_URL}${path}#webpage`,
    url: `${SITE_URL}${path}`,
    name: m.title,
    description: m.description,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    inLanguage: lang,
    dateModified: CONTENT_MODIFIED,
  });
  // Every locale's home page describes the same application, in its own words.
  if ((m.basePath || path) === "/") {
    nodes.push({ ...SOFTWARE_APP, description: m.description });
  }
  if (content?.faq?.length) {
    nodes.push({
      "@type": "FAQPage",
      "@id": `${SITE_URL}${path}#faq`,
      mainEntity: content.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  if (content?.steps?.length) {
    nodes.push({
      "@type": "HowTo",
      "@id": `${SITE_URL}${path}#howto`,
      // Was hardcoded to the home page's wording. Once a second page carried a
      // different set of steps, the schema was describing the wrong procedure.
      name: content.stepsTitle || "How to run planning poker with your team",
      totalTime: "PT15M",
      estimatedCost: { "@type": "MonetaryAmount", currency: "GBP", value: "0" },
      step: content.steps.map((text, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: text,
        text,
      })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes });
}

/* The link block at the foot of every shell. On a translated page the four
   pages that exist in that language link to their own locale; everything else
   links to its English URL, because that is the only URL those pages have.
   Sending a Japanese reader to /ja/pricing — which has no document — would be
   a soft 404 authored on purpose. */
function shellLinks(path, locale) {
  const ui = UI[locale] || UI.en;
  const label = (href, fallback) => {
    const key = {
      "/": "footer.home",
      "/features": "footer.features",
      "/pricing": "nav.pricing",
      "/planning-poker-online": "footer.ppOnline",
      "/scrum-poker": "footer.guideScrum",
      "/story-point-estimation": "footer.guideEstimation",
      "/remote-sprint-planning": "footer.guideRemote",
      "/agile-estimation-tool": "footer.guideAgile",
      "/what-is-planning-poker": "footer.guideWhatIs",
      "/fibonacci-story-points": "footer.guideFib",
      "/pointing-poker": "footer.guidePointing",
      "/story-points-to-hours": "footer.guideHours",
      "/planning-poker-jira": "footer.guideJira",
      "/about": "footer.about",
      "/trust": "footer.trustRel",
      "/support": "footer.support",
    }[href];
    return (key && ui[key]) || fallback;
  };
  return PRERENDER_LINKS.filter(([href]) => localeUrl(locale, href) !== path)
    .map(
      ([href, fallback]) =>
        `<li><a href="${localeUrl(locale, href)}">${esc(label(href, fallback))}</a></li>`,
    )
    .join("");
}

function shellFor(path, m, content) {
  if (!content) {
    return `<h1>${esc(m.title.split("|")[0].trim())}</h1><p>${esc(m.description)}</p>`;
  }
  const locale = m.locale || "en";
  const ui = UI[locale] || UI.en;
  const parts = [`<h1>${esc(content.h1)}</h1>`, `<p>${esc(content.intro)}</p>`];
  (content.body || []).forEach((p) => parts.push(`<p>${esc(p)}</p>`));
  if (content.bullets?.length) {
    parts.push(`<ul>${content.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`);
  }
  // Sections carry the depth. Answer engines extract headed prose and lists far
  // more reliably than one undifferentiated wall, so each one keeps its own h2.
  (content.sections || []).forEach((s) => {
    parts.push(`<h2>${esc(s.title)}</h2>`);
    if (s.intro) parts.push(`<p>${esc(s.intro)}</p>`);
    (s.body || []).forEach((p) => parts.push(`<p>${esc(p)}</p>`));
    if (s.bullets?.length) {
      parts.push(`<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`);
    }
  });
  if (content.steps?.length) {
    parts.push(`<h2>${esc(content.stepsTitle || ui["page.howItWorks"])}</h2>`);
    parts.push(`<ol>${content.steps.map((b) => `<li>${esc(b)}</li>`).join("")}</ol>`);
  }
  if (content.faq?.length) {
    parts.push(`<h2>${esc(ui["page.faqTitle"])}</h2>`);
    content.faq.forEach((f) => {
      parts.push(`<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`);
    });
  }
  parts.push(`<h2>${esc(ui["page.relatedTitle"])}</h2><ul>${shellLinks(path, locale)}</ul>`);
  return parts.join("");
}

function render(template, path, m) {
  const content = ROUTE_CONTENT[path];
  const ogImage = m.ogImage || DEFAULT_OG_IMAGE;
  const url = m.canonical || `${SITE_URL}${path}`;
  const locale = m.locale || "en";
  let html = template;

  // The document's own language. Left at "en" on a Japanese page it tells every
  // screen reader to pronounce Japanese with English phonemes, and tells Google
  // the page is English regardless of what the hreflang says.
  html = html.replace(/<html lang="[^"]*"/i, `<html lang="${LOCALES[locale].hreflang}"`);

  const setMeta = (attr, key, value) => {
    const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, "i");
    if (re.test(html)) {
      html = html.replace(re, `$1${esc(value)}$2`);
    } else {
      html = html.replace("</head>", `    <meta ${attr}="${key}" content="${esc(value)}" />\n  </head>`);
    }
  };

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(m.title)}</title>`);
  setMeta("name", "description", m.description);
  setMeta("name", "robots", m.robots || "index, follow");
  setMeta("property", "og:title", m.title);
  setMeta("property", "og:description", m.description);
  setMeta("property", "og:url", m.ogUrl || url);
  setMeta("property", "og:image", ogImage);
  setMeta("name", "twitter:title", m.title);
  setMeta("name", "twitter:description", m.description);
  setMeta("name", "twitter:url", m.ogUrl || url);
  setMeta("name", "twitter:image", ogImage);
  setMeta("property", "og:locale", LOCALES[locale].ogLocale);
  html = html.replace(
    /<link rel="canonical"[^>]*>/i,
    `<link rel="canonical" href="${esc(url)}" />`,
  );

  /* hreflang. Only the pages that genuinely exist in more than one language
     get a cluster — advertising an alternate that is really the English page
     under a different URL is how a whole language folder gets dropped.
     x-default points at English, which is the fallback for every language we
     have not translated. */
  const alternates = alternatesFor(m.basePath || path);
  if (alternates.length) {
    const tags = alternates
      .map((a) => `    <link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.url)}" />`)
      .concat(
        `    <link rel="alternate" hreflang="x-default" href="${esc(
          alternates.find((a) => a.code === "en").url,
        )}" />`,
      )
      .join("\n");
    html = html.replace("</head>", `${tags}\n  </head>`);
  }

  // Replace every build-time JSON-LD block with one graph for this page.
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, "");
  html = html.replace(
    "</head>",
    `  <script type="application/ld+json">${graphFor(path, m, content)}</script>\n  </head>`,
  );

  html = html.replace(
    '<div id="root"></div>',
    `<div id="root"><div class="prerender-shell">${shellFor(path, m, content)}</div></div>`,
  );
  return html;
}

const templatePath = join(BUILD_DIR, "index.html");
if (!existsSync(templatePath)) {
  console.error(`prerender: ${templatePath} not found — run the CRA build first.`);
  process.exit(1);
}
const template = readFileSync(templatePath, "utf8");

// Home first, in place.
writeFileSync(templatePath, render(template, "/", DEFAULT_META));
let count = 1;

for (const [path, m] of Object.entries(STATIC_ROUTE_META)) {
  if (PRIVATE_PATHS.includes(path)) continue; // owner-only surfaces never get a public document
  const dir = join(BUILD_DIR, path.replace(/^\//, ""));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), render(template, path, m));
  count += 1;
}

console.log(`prerender: wrote ${count} route documents`);

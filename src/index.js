import React from "react";
import ReactDOM from "react-dom/client";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App";
import AppErrorBoundary from "./AppErrorBoundary";
import { initLocaleFromPath, LOCALES } from "./i18n.mjs";
import { activateLocale } from "./routeMeta.mjs";

/* The locale comes from the URL rather than from Accept-Language. The
   prerendered document already carries the right <html lang>; this keeps it
   right after a client-side navigation, and makes the locale correct on the
   CRA dev server, which has no prerender step. */
const locale = initLocaleFromPath(window.location.pathname);
document.documentElement.lang = LOCALES[locale].hreflang;

const root = ReactDOM.createRoot(document.getElementById("root"));

const start = () =>
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
      <SpeedInsights />
    </React.StrictMode>,
  );

/* English renders immediately; every other language waits for its chunk. The
   wait is not a blank screen — the prerendered HTML is already in #root and
   stays there until React replaces it, so the reader sees the finished page
   throughout. Rendering first and translating after would have been the worse
   trade: an English flash on a Japanese URL, and a second layout pass.

   A failed chunk still renders, in English, because that beats a blank page —
   and t() falls back to English key by key, so nothing shows a raw key. */
if (locale === "en") {
  start();
} else {
  activateLocale(locale)
    .catch((err) => console.error("[pointpoker] locale failed to load", err))
    .finally(start);
}

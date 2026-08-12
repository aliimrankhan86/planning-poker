import React from "react";
import ReactDOM from "react-dom/client";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App";
import AppErrorBoundary from "./AppErrorBoundary";
import { initLocaleFromPath, LOCALES } from "./i18n.mjs";

/* Before the first render, and from the URL rather than from Accept-Language.
   The prerendered document already carries the right <html lang>; this is what
   keeps it right after a client-side navigation, and what makes the locale
   correct when the app is served from the CRA dev server, which has no
   prerender step. */
const locale = initLocaleFromPath(window.location.pathname);
document.documentElement.lang = LOCALES[locale].hreflang;

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
    <SpeedInsights />
  </React.StrictMode>,
);

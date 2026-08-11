import React from "react";

/* ═══════════════════ LAST LINE OF DEFENCE ═══════════════════
   The whole product is one component tree under one route. A render error
   anywhere in it unmounts everything and leaves a white page with no nav, no
   footer and no way back — there is no second route to fall through to, and
   nothing tells the person whether the site is broken, their connection is, or
   they did something wrong.

   So this says what happened and offers the reload that clears almost all of
   them. It styles itself from the --boot-* variables in public/index.html,
   which are set before first paint and follow the chosen theme, because the
   design system's own stylesheet is exactly the thing that might not be there.
   Inline styles for the same reason: a class name is a promise that some other
   file loaded.

   Its own file, rather than a few lines inside index.js, only because index.js
   mounts to the real DOM at import time and a safety net nobody can render in
   a test is not a safety net.
═══════════════════════════════════════════════════════════════ */
export default class AppErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("[pointpoker] render failed", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          maxWidth: "34rem",
          margin: "0 auto",
          padding: "clamp(3rem, 12vh, 7rem) 1.5rem",
          color: "var(--boot-fg)",
          fontFamily: "'Outfit', 'Segoe UI', sans-serif",
          lineHeight: 1.65,
        }}
      >
        <h1 style={{ fontSize: "1.5rem", marginBottom: ".75rem", letterSpacing: "-.01em" }}>
          Something went wrong
        </h1>
        <p style={{ color: "var(--boot-fg-2)", marginBottom: "1.5rem" }}>
          Point Poker hit an unexpected error and could not finish drawing the page.
          Reloading usually fixes it. If you were in a room, your seat is still
          there — the room lives on the server, not in this tab.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            font: "inherit",
            fontWeight: 600,
            cursor: "pointer",
            padding: ".75rem 1.25rem",
            borderRadius: ".5rem",
            border: 0,
            background: "var(--boot-gold)",
            color: "#07110e",
          }}
        >
          Reload the page
        </button>
      </div>
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Point Poker design system — icons

   One stroke family: a 24px grid, 1.75 stroke, round caps and joins, drawn in
   currentColor. No icon font, no CDN set, no PNGs, and no emoji.

   Emoji are excluded from structural UI for four reasons: they cannot inherit
   currentColor, so a disabled control keeps a full-saturation glyph; they
   render from a different font on every OS; screen readers announce their CLDR
   name ("game die, 0 stories estimated"); and they are always full colour
   against a restrained palette. Two exemptions exist and no third one may be
   added — the card suit glyphs (♦ ♠ ♥ ♣), which are text characters from the
   display font, and the single 🎉 in the consensus burst.

   If you need a glyph that is not here, draw it in this style. Do not import a
   second family.
   ═══════════════════════════════════════════════════════════════════════════ */

export const ICON_PATHS = {
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  cards: "M8 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2zM5 7v11a2 2 0 0 0 2 2h9",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  chart: "M3 3v16a2 2 0 0 0 2 2h16M7 15l3.5-4 3 2.5L18 8",
  check: "M20 6 9 17l-5-5",
  close: "M18 6 6 18M6 6l12 12",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  play: "M6 4.5v15l13-7.5z",
  stop: "M7 7h10v10H7z",
  copy: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 18l-6-6 6-6",
  plus: "M12 5v14M5 12h14",
  refresh: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  broadcast: "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5",

  /* Added for the theme control. Same grid, same stroke, same caps — this is
     what "add it to the set" means, as opposed to importing a second family. */
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8",
};

/* The only two glyphs that are filled rather than stroked. */
export const FILLED_ICONS = ["play", "stop"];

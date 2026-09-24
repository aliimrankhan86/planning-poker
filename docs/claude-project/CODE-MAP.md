# Point Poker: code map

Regenerated from the repository by `scripts/gen-code-map.mjs` on every commit (pre-commit hook) and by `npm run docs`. Do not edit by hand. Every tracked source file, its size, and the top-level functions, components and constants it defines, with line numbers and the comment directly above each one. Test files list their describe and test names. Use it to find where something lives before reading the file.

## Files

| File | Lines | Size |
|---|---:|---:|
| `database.rules.json` | 331 | 19 KB |
| `database.rules.publish.json` | 260 | 11 KB |
| `firebase.json` | 15 | 0 KB |
| `functions/index.js` | 317 | 10 KB |
| `functions/index.test.js` | 74 | 3 KB |
| `functions/package.json` | 18 | 0 KB |
| `package.json` | 57 | 1 KB |
| `public/index.html` | 154 | 9 KB |
| `scripts/build-rules.mjs` | 16 | 0 KB |
| `scripts/gen-ai-context.mjs` | 255 | 13 KB |
| `scripts/gen-code-map.mjs` | 118 | 4 KB |
| `scripts/gen-sitemap.mjs` | 92 | 4 KB |
| `scripts/make-icons.py` | 75 | 2 KB |
| `scripts/make-og-image.py` | 176 | 7 KB |
| `scripts/prerender.mjs` | 346 | 13 KB |
| `scripts/rules-test.mjs` | 316 | 19 KB |
| `src/AdminDashboard.js` | 466 | 19 KB |
| `src/AdminDashboard.test.js` | 119 | 5 KB |
| `src/App.css` | 39 | 0 KB |
| `src/App.js` | 8654 | 397 KB |
| `src/App.test.js` | 1080 | 52 KB |
| `src/AppErrorBoundary.js` | 74 | 2 KB |
| `src/AppErrorBoundary.test.js` | 90 | 3 KB |
| `src/design-system/base.css` | 87 | 3 KB |
| `src/design-system/components.css` | 1139 | 71 KB |
| `src/design-system/design-system.test.js` | 501 | 22 KB |
| `src/design-system/icons.js` | 47 | 3 KB |
| `src/design-system/index.js` | 1005 | 40 KB |
| `src/design-system/theme.js` | 91 | 3 KB |
| `src/design-system/tokens.css` | 757 | 36 KB |
| `src/designsystem.test.js` | 2140 | 113 KB |
| `src/estimation.js` | 349 | 16 KB |
| `src/estimation.test.js` | 560 | 23 KB |
| `src/firebase.js` | 18 | 0 KB |
| `src/i18n.mjs` | 127 | 4 KB |
| `src/index.css` | 14 | 0 KB |
| `src/index.js` | 43 | 1 KB |
| `src/locales/en.mjs` | 630 | 32 KB |
| `src/locales/index.mjs` | 146 | 7 KB |
| `src/locales/ja.mjs` | 978 | 77 KB |
| `src/locales/pt.mjs` | 995 | 62 KB |
| `src/reportWebVitals.js` | 14 | 0 KB |
| `src/routeMeta.mjs` | 1256 | 87 KB |
| `src/setupTests.js` | 37 | 1 KB |
| `vercel.json` | 109 | 2 KB |

## `functions/index.js`

- L14 `firstNonEmpty`
- L69 `getTransporter`
- L85 `escapeHtml`
- L95 `formatTimestamp`
- L100 `notificationPath`
- L104 `beginNotification`
- L121 `markNotificationSent`
- L131 `markNotificationFailed`
- L140 `sendEmail`
- L152 `ownerSignupEmail`
- L241 `freshTeamRoomState`: A team room is a permanent address, so it is reset rather than deleted: the same URL has to keep working for the next sprint.

## `functions/index.test.js`

- L28   test: the module loads without throwing
- L32   test: exports exactly the two live functions
- L39   test: notifyOnProActivation stays deleted
- L48   test: both functions are deployable triggers, not plain objects
- L56   test: reapStaleRooms is scheduled, not left as an HTTP endpoint
- L63   test: no SMTP secret is hard-coded as a fallback

## `scripts/gen-ai-context.mjs`

- L18 `read`
- L19 `kb`
- L28 `grab`
- L34 `events`
- L39 `bucketEvents`
- L40 `maxParticipants`
- L79 `uniq`
- L85 `designStats`
- L101 `list`
- L109 `out`

## `scripts/gen-code-map.mjs`

- L19 `OUT`
- L35 `DECL`
- L40 `commentAbove`
- L61 `out`

## `scripts/gen-sitemap.mjs`

- L41 `CONTENT_SOURCE`: runs in production.
- L45 `LOCALE_SOURCE`: changed — a freshness signal that misses the edit that actually happened.
- L46 `CONTENT_SOURCES`
- L48 `contentModified`
- L61 `sitemapPaths`

## `scripts/prerender.mjs`

- L41 `BUILD_DIR`
- L42 `esc`
- L48 `ORGANISATION`
- L68 `MAKER`: the maker is part of telling Google which Point Poker this is.
- L75 `WEBSITE`
- L87 `SOFTWARE_APP`
- L125 `breadcrumb`
- L135 `graphFor`
- L190 `shellLinks`: a soft 404 authored on purpose.
- L221 `shellFor`
- L256 `render`

## `scripts/rules-test.mjs`

- L23 `url`
- L25 `put`
- L29 `patch`
- L33 `canRead`
- L48 `b64`: exactly a signed-in visitor; the other two are allowed both.
- L49 `asUser`
- L62 `failures`
- L63 `expect`
- L68 `allow`
- L69 `deny`
- L71 `room`
- L82 `today`
- L254 `ADMIN_UID`
- L261 `seedAsAdmin`: Seeding needs the emulator's admin bypass precisely because the rules let nobody else write this node — which is the property being tested. This is the one plac…
- L294 `profileWith`: signed-in user store a newline in a string bound for an SMTP header.

## `src/AdminDashboard.js`

- L36 `iso`
- L37 `pct`
- L38 `fmt`
- L43 `DEFAULT_RPM`: display-ad rates so the resulting number is a ceiling, not a forecast.
- L45 `WINDOWS`
- L53 `WTP_BANDS`: `usd` is the midpoint of each band, used to blend a stated monthly value. Kept separate from `value` because `value` becomes the response count.
- L60 `TABLE_BANDS`
- L67 `SESSION_BANDS`
- L74 `DECKS`
- L80 `FEATURES`
- L92 `Bars`
- L119 `Trend`
- L145 `Panel`
- L156 `AdminDashboard`

## `src/AdminDashboard.test.js`

- L36   test: shows the admin gate when the read is denied
- L42   test: asks unauthenticated visitors to sign in rather than erroring
- L47   test: headline KPIs sum every day in the window
- L59   test: sessions count ad-hoc rooms, new team rooms, and team re-entries
- L64   test: ad ceiling multiplies monthly sessions by the blended RPM
- L74   test: blended RPM shifts toward mobile as the device mix does
- L80   test: ad verdict refuses to encourage ads on thin volume
- L85   test: willingness-to-pay verdict withholds a conclusion under 20 answers
- L90   test: willingness-to-pay blends band midpoints across all answers
- L97   test: rates divide by the right denominator
- L110   test: an empty database renders zeroes rather than NaN or crashing

## `src/App.js`

- L112 `AdminDashboard`: Admin-only, so it is code-split: normal visitors never download it.
- L128 `_analyticsDate`: ANONYMOUS USAGE ANALYTICS Privacy-first. Daily integer counters at /analytics/daily/{date}/{event}. NO personal data, NO user IDs, NO IP addresses, NO third-par…
- L131 `track`: Fire-and-forget. Analytics must never block or break a session.
- L142 `trackOnce`: Some events are only meaningful once per browser (a new visitor) or once per day (device mix). localStorage is the dedupe key; it holds no personal data.
- L157 `bucketTableSize`: Buckets keep the counter set small and the dashboard readable. Exact values would mean one counter per possible number, which nobody can chart.
- L159 `bucketSessionMinutes`
- L164 `trackSessionLength`: How long a room stayed open. Ad revenue is a function of time-on-site, so this is the difference between "worth running ads" and "not worth the ad tag".
- L174 `trackVisit`: Called once per app load: visitor recency and device mix, the two inputs an ad-network RPM estimate actually depends on.
- L186 `saveSessionHistory`: SPRINT HISTORY Saves a session summary to Firebase /history/{uid} when a session ends. Requires an authenticated user — anonymous sessions are not recorded. Fai…
- L234 `routeKey`: "/pt/" are keyed with their slash), then without the trailing slash.
- L240 `getScreenForPath`
- L244 `upsertMeta`
- L254 `upsertLink`
- L267 `applyAlternates`: alternates in the head, pointing four URLs at the wrong page.
- L284 `applyRouteMeta`
- L323 `DECK_DEFINITIONS`: CARD DECKS Each deck is an array of card objects. The facilitator selects a deck when creating a room; the choice is stored in Firebase so all players see the s…
- L368 `getCards`: Derive cards for a given deck key, falling back to Fibonacci.
- L374 `ESTIMATION_MODES`: ESTIMATION MODE Controls whether the team is estimating User Stories or Tasks within stories. Stored in Firebase as room.estimationMode. All in-room copy adapts…
- L410 `getEstMode`
- L411 `INVALID_PLACEHOLDER_NAMES`
- L423 `TEAM_ROUTE`
- L425 `homePath`: Leaving a room in a Japanese session lands on /ja/, not on the English home.
- L430 `roomPath`: up, in the wrong language, because of a prefix the sharer never saw.
- L431 `teamRoomPath`
- L433 `countParticipants`
- L439 `scrollBehavior`: scrollIntoView({behavior:"smooth"}) beats the CSS scroll-behavior:auto that the reduced-motion block sets, so the preference has to be read here.
- L441 `revealElement`
- L446 `copyText`: Clipboard writes fail on http origins, in some in-app browsers, and when the user denies permission. Fall back to a hidden textarea, and always tell the caller …
- L471 `NAME_STORAGE_KEY`: Guests should not retype their name every sprint. Stored locally only — never sent anywhere except into the room they choose to join.
- L472 `rememberName`
- L475 `recallName`
- L480 `CSS`: CSS
- L2307 `ALIGN_BAR_TONE`: score text is amber — a split vote is the tool working, not an error.
- L2318 `sweepAwayPlayers`: Removes players whose socket dropped over an hour ago, from one room, by the clients still sitting in it. This used to live inside sweepStaleRooms, where it sha…
- L2361 `FOUNDER_ROOM_CONFIG`: FOUNDER ROOM DEFAULTS These client-visible values select the intended default deck and let the two established team URLs bootstrap without an account. They are …
- L2365 `getFounderRoomConfig`
- L2373 `isFounderRoom`
- L2374 `getFounderDefaultDeck`
- L2379 `Icon`: containers in this file still rely on; it is not a second Icon.
- L2394 `BrandMark`
- L2420 `PrintReport`
- L2461 `BrandWordmark`
- L2470 `NavLinkButton`
- L2486 `RouteLink`: because navTo does the prefixing and doing it twice would produce /de/de/.
- L2553 `useBarFit`: break.
- L2676 `useHeaderHeight`
- L2713 `NavBar`
- L2854 `languageTarget`
- L2863 `HeaderLanguageSwitcher`: the URL and document language in agreement.
- L2931 `LanguageSwitcher`
- L2959 `SiteFooter`
- L3078 `LoginModal`
- L3463 `CookieBanner`: COOKIE / STORAGE NOTICE
- L3491 `App`: MAIN APP
- L4750 `CONFETTI_COLORS`
- L4764 `Confetti`
- L4880 `MarketingSection`: heading does not get the gap twice.
- L4889 `MarketingRelatedLinks`
- L4911 `MarketingPageShell`
- L4992 `RoomQuickStart`: lands anyway. Name validation mirrors JoinScreen's validateEnteredName.
- L5034 `ContentPage`
- L5102 `PricingPage`
- L5207 `AboutPage`
- L5286 `SupportPage`
- L5348 `TrustPage`
- L5428 `FeaturesPage`
- L5505 `RemoteSprintPlanningPage`
- L5565 `getAuthErrorMessage`
- L5584 `getVerificationErrorMessage`
- L5597 `deriveDisplayNameFallback`
- L5610 `deriveTeamRoomName`
- L5616 `deriveDedicatedRoomOwnerSuffix`
- L5623 `buildDedicatedRoomLabel`
- L5631 `clampTeamRoomLabel`
- L5639 `deriveSecondaryTeamRoomName`
- L5650 `buildDedicatedTeamRoomsFromLabel`
- L5664 `deriveDedicatedRoomLabelPrefix`
- L5680 `resolveDedicatedTeamRooms`
- L5698 `saveUserProfile`
- L5730 `LegalPage`
- L5750 `TermsPage`
- L5935 `PrivacyPage`
- L6177 `HistoryModal`
- L6261 `JoinScreen`: JOIN SCREEN
- L7071 `WTP_STORAGE_KEY`
- L7072 `WTP_OPTIONS`
- L7079 `WtpPoll`
- L7130 `RoomActionBar`
- L7234 `GameScreen`

## `src/App.test.js`

- L43   test: home screen leads with the free positioning
- L53 describe: route metadata
- L56   test: every public route has its own metadata
- L63   test: private routes are never given indexable metadata
- L69   test: canonical points at the route
- L77   test: titles and descriptions are unique across routes
- L84   test: descriptions stay inside the length search engines actually render
- L94   test: prerendered content shells carry a heading and intro
- L105   test: the support FAQ the schema advertises is the one the page renders
- L128   test: the brand is spelled Point Poker everywhere it is prose
- L144   test: support questions do not restate the home page
- L160 describe: login dialog focus management
- L170   test: moves focus into the dialog on open
- L176   test: Escape closes and returns focus to the trigger
- L183   test: the close button returns focus to the trigger
- L190   test: Tab wraps from the last focusable back to the first
- L210 describe: account funnel analytics
- L224   test: opening the dialog to sign in is not a signup start
- L229   test: switching to Create account counts exactly one signup start
- L235   test: re-selecting Create account does not count twice
- L259 describe: role selection
- L265   test: exactly one role is preselected, never none and never both
- L271   test: creating a room makes you the facilitator
- L276   test: joining someone else
- L282   test: a shared link lands on Join, so it lands on Participant
- L292   test: a deliberate pick outranks the tab, in both directions
- L313 describe: the story-queue cap
- L317   test: the rule and the client agree on how many stories a room holds
- L323   test: rounds are capped the same way, since they are keyed the same way
- L327   test: hitting it says so, instead of reporting a network problem
- L341 describe: pages rendered from route data
- L365   test: there is at least one, or this whole block is silently vacuous
- L369   test: %s renders its heading and every FAQ answer
- L390   test: navigating from one to another actually swaps the content
- L407   test: every internal footer link points at a real route
- L424   test: a page with its own steps names them, so the HowTo schema is not generic
- L439   test: no two pages answer the same question
- L461 describe: the sitemap and the route table say the same thing
- L468   test: every indexable route is in the sitemap
- L472   test: the sitemap advertises nothing that is not a route
- L476   test: no route is listed twice, which splits its own ranking signal
- L480   test: every URL is absolute and on the canonical host
- L488   test: robots.txt keeps live rooms out of the index
- L500   test: private routes are blocked in robots.txt and by a header
- L520   test: vercel.json header entries carry no keys Vercel will reject
- L539 describe: no Firebase write fails silently
- L544   test: every awaited write is inside a try, a write() call, or an explicit catch
- L564   test: the escape hatch stays rare enough to read in one sitting
- L568   test: no read is wrapped in a promise that can never reject
- L584 describe: translations
- L587   test: every locale defines exactly the English key set
- L597   test: a value that is a list in English is a list of the same length everywhere
- L608   test: every placeholder in an English string survives translation
- L633   test: no locale left an English sentence sitting in a translated table
- L643   test: the rule is tight enough to catch a real omission
- L655   test: no locale contains characters from a writing system it does not use
- L664   test: Japanese is actually written in Japanese
- L670   test: every locale has every localized page, with meta and content
- L685   test: titles and descriptions are unique across every language
- L701   test: the hreflang cluster is reciprocal and carries an x-default
- L718   test: every localized URL is in the sitemap, and nothing is listed twice
- L730   test: a locale prefix only matches a whole path segment
- L739   test: an untranslated page keeps its English URL in every language
- L750 describe: header language selector
- L761   test: is visible in the header and offers every live language
- L773   test: keeps the equivalent translated page when switching
- L784   test: closes on Escape and returns focus to its trigger
- L800   test: no translated screen still holds an English sentence in its source
- L857   test: vercel.json knows about every locale prefix
- L886   test: the retired locale prefixes 301 instead of 404ing
- L926   test: an untranslated path under a live locale prefix 301s to English
- L978   test: the legal pages are not translated
- L996 describe: pointing poker is a tool page, not a doorway
- L997   test: its hero holds a room form that refuses a blank name and creates the room it describes
- L1025   test: the hero has one primary action: the form
- L1033   test: the home page links to it from its own copy, not only from the footer
- L1042   test: the guides closest to it link to it
- L1054 describe: a trailing slash is the same page
- L1055   test: %s renders its own page and metadata
- L1064   test: a hand-built page with a slash gets its own title and canonical too

## `src/AppErrorBoundary.test.js`

- L25   test: children render untouched when nothing throws
- L35   test: a throwing child becomes a message instead of a blank page
- L47   test: the error still reaches the console for whoever is debugging it
- L60   test: it says the room outlived the tab, because it did
- L72   test: it paints from the pre-paint variables, not the design system
- L85   test: the app is actually wrapped in it

## `src/design-system/design-system.test.js`

- L115 describe: dark is the default
- L116   test: :root carries the dark roles, so dark needs no JavaScript to happen
- L124   test: light is reachable only by asking for it
- L133   test: the page ground is dark by default and light only when asked
- L143 describe: every role exists in both themes
- L151   test: and light adds nothing dark has not got
- L160 describe: contrast floor
- L163 describe: %s
- L166   test: %s clears WCAG AA on the page ground
- L170   test: --text-3 clears AA on a card as well as on the page
- L176   test: the inverse footer keeps its own contrast
- L188   test: gold used as TEXT clears AA on this theme
- L194   test: the primary action
- L198   test: text on the felt block clears AA
- L202   test: the state hues clear AA on their own surfaces
- L214 describe: the ten rules
- L215   test: 13px is the floor and no component writes below it
- L223   test: 16px is the floor in anything typed into, or iOS zooms the viewport
- L228   test: every control clears 44px
- L242   test: focus is never removed without a replacement
- L247   test: reduced motion is respected
- L251   test: components use semantic roles, never the raw palette
- L270   test: only transform and opacity are animated
- L279   test: selection is an ARIA state, not a class
- L288 describe: ThemeToggle
- L303   test: is a switch, and its position is the theme
- L316   test: the visible word is inside the accessible name
- L327   test: the keyboard drives it
- L337   test: the word survives the narrow bar that hides it
- L348   test: remembers the choice
- L354   test: two toggles on one screen agree
- L365 describe: Modal
- L366   test: is a dialog to a keyboard, not a div that looks like one
- L386   test: returns focus to whatever opened it
- L403   test: still returns focus after the dialog has re-rendered
- L433 describe: components say it in words, not only in colour
- L434   test: a stat with no data explains itself instead of showing a zero
- L441   test: a vote card announces the value it plays
- L447   test: a locked card is still announced, but nothing about it is actionable
- L460   test: a danger alert interrupts; anything else does not
- L468 describe: a card that is also a link still looks like a card
- L472   test: an anchor card takes the card
- L477   test: the hover affordance uses a token that is legible in both themes
- L484 describe: Tabs follow the tablist pattern
- L487   test: arrow keys move between tabs and Tab steps past the strip

## `src/design-system/icons.js`

- L19 `ICON_PATHS`
- L46 `FILLED_ICONS`: The only two glyphs that are filled rather than stroked.

## `src/design-system/index.js`

- L30 `cx`
- L38 `Icon`: The single stroke family. Decorative and aria-hidden unless given a title.
- L68 `Logo`: a prop that silently does nothing is worse than no prop.
- L86 `Button`: The action primitive. Exactly one variant="primary" per screen.
- L104 `IconButton`: A square control whose only label is its glyph. `label` is required and becomes the accessible name — an icon alone is not a label.
- L119 `Choice`: An option in an exclusive group. Selection is aria-pressed — never a class, because a class lets the visual state and the announced state disagree.
- L145 `SegmentedControl`: Two to four mutually exclusive views. More than four wants Tabs.
- L196 `ThemeToggle`: nowhere else.
- L256 `Select`
- L280 `Switch`
- L290 `Checkbox`
- L309 `Card`: display serif, and nothing ever passed it.
- L331 `StatTile`: A measured number. Renders the sentence explaining what will appear here rather than a zero, because a zero reads as data — "0 stories estimated" looks like a f…
- L345 `Hero`: Page opening. Felt ground by default; paper for content pages.
- L369 `VoteCard`: to refuse the click, which is why onSelect is guarded here too.
- L400 `VoteHand`: The hand. Wraps; centres itself once the room drops to one column.
- L405 `RevealGrid`: The grid of played cards after the reveal.
- L412 `RevealCard`: that says the same thing, because a border alone is Rule 5's failure case.
- L429 `Chip`: States a fact. Never a control.
- L438 `Avatar`
- L451 `AvatarStack`
- L458 `ParticipantList`: and the two rows carry different controls.
- L464 `Participant`: One row. Rule 5: the brass ring on the avatar says "voted" and so does the word beside it — neither carries the meaning alone. `tone` drives both.
- L484 `ResultsTable`: Results grid. Stacks into labelled blocks below 640px rather than scrolling sideways; the data-label on each cell is what the stacked row echoes.
- L519 `ALERT_GLYPH`
- L523 `Alert`: An inline message with its own surface, border and icon disc — the thing the old build lacked, which is how it kept losing its own error text.
- L540 `ToastRegion`
- L548 `Toast`
- L564 `Progress`: every caller also states the number beside it.
- L580 `Skeleton`
- L585 `EmptyState`: One line explaining what will appear here. Never three zeroes.
- L595 `Timer`
- L624 `Tabs`: Tabs. The selected tab is marked four ways at once — weight, colour, a 3px brass bar and a tint — because a colour shift alone gets missed. Arrow keys move betw…
- L665 `TabPanel`
- L676 `Accordion`: Disclosure list. Carries the FAQ blocks that hold most of the SEO copy, so the answers stay in the DOM — a crawler does not click.
- L713 `Header`: Site and app bar. One primary action in the bar, ever.
- L755 `Footer`
- L790 `rememberDialogOpener`
- L808 `useDialog`: Everything a dialog owes a keyboard: focus moves in on open and back to whatever opened it on close, Escape dismisses, Tab cannot walk out into the page behind,…
- L891 `Modal`: Bottom sheet under 560px, centred box above it.
- L929 `Container`: The centred measure. A page sets its width here and nowhere else. `flow` puts one gap — `--block-y` — between every block inside it.
- L940 `Section`: A band: edge to edge, owns the background and the vertical rhythm. Put a Container inside it — a Section never carries the page width itself.
- L949 `Stack`
- L953 `Row`
- L963 `Grid`: The auto-fit grid every card deck in the product comes off. Set `min` in place of writing per-breakpoint column counts.
- L975 `Prose`
- L979 `Eyebrow`
- L986 `SectionHead`: rather than a band, and it takes that content's axis instead.
- L997 `Divider`
- L1001 `VisuallyHidden`

## `src/design-system/theme.js`

- L20 `STORAGE_KEY`
- L21 `DEFAULT_THEME`
- L30 `BROWSER_UI_COLOUR`: these two and the boot values in public/index.html stop agreeing.
- L32 `readStored`
- L49 `listeners`
- L51 `subscribe`
- L56 `getSnapshot`
- L62 `getServerSnapshot`: The server render and the pre-rendered HTML have no user preference, so they must agree on the default or React logs a hydration mismatch.
- L66 `setTheme`
- L87 `useTheme`: this file stays JSX-free so nothing imports back into it.

## `src/designsystem.test.js`

- L50 describe: design tokens exist
- L62   test: %s is defined
- L66   test: App.js does not redeclare a themed token in its own :root
- L74 describe: button system
- L75   test: has one base class with five intents and three sizes
- L84   test: App.js keeps no second button system
- L96   test: no button is invisible
- L106   test: the three rungs that remain each paint themselves
- L123   test: every button clears the 44px touch target floor
- L130   test: a small control still offers a 44px hit area
- L144   test: a disabled primary is inert rather than a dimmed gradient
- L150   test: a secondary button is raised above the surface it sits on
- L157   test: a dead control is never painted like a live one
- L161   test: motion is disabled for users who ask for reduced motion
- L166 describe: icons, not emoji
- L180   test: no colour emoji is used to label a control
- L195   test: the icon set is one family with a single stroke width
- L202   test: App.js does not keep a second icon family
- L206   test: decorative icons are hidden from screen readers
- L211 describe: class names survive ad blockers
- L240 describe: room layout
- L241   test: the facilitator has exactly one primary action
- L246   test: the action bar does not claim to dock to the phone
- L259   test: counts use tabular figures so they do not reflow as they climb
- L270   test: reveal shows who picked what before it shows the average
- L283   test: removing a participant looks like what it is
- L291   test: the remove control is translated, not hardcoded English
- L316 describe: what sticks under the room header
- L319   test: the sticky bar reads the header
- L326   test: the header wins when the two meet
- L333   test: nothing reads through it while the page slides under
- L337   test: --hdr-h has a fallback, and something measures the real one
- L345   test: the measurement cannot start the loop it would be blamed for
- L357 describe: type floor
- L368   test: --fs-1 is the floor and is at least 13px
- L372   test: no font-size is written below the floor
- L379   test: small text on a dark surface gets its legibility compensation
- L387 describe: selectable options are one primitive
- L399   test: the .choice primitive exists
- L405   test: selection is expressed through aria-pressed, not a class
- L411   test: the four legacy option classes are gone
- L417   test: options clear the 44px touch target floor
- L421   test: the join screen
- L429 describe: destructive actions do not shout
- L430   test: End session is not a full-width danger block
- L438   test: it is labelled once, not three times over
- L446 describe: irreversible choices say so
- L447   test: the join screen states that the deck is fixed for the room
- L457 describe: an empty room asks for the thing it needs
- L460   test: the primary action invites people when nobody can vote
- L470   test: it does not render a count of nothing
- L494 describe: media queries come after the rules they override
- L547   test: no min-width override is cancelled by a later base rule
- L571 describe: small text is given room to breathe
- L609 describe: the navbar does not hang text off its own edge
- L619   test: the absolutely positioned nav caption is gone
- L652 describe: nothing hidden from assistive tech can take focus
- L658   test: no focusable element in App.js carries aria-hidden
- L668   test: the scan actually sees the aria-hidden markup
- L675   test: tabIndex={-1} is never used to excuse aria-hidden
- L681 describe: the marketing bar
- L705   test: the links strip is not a scroller, so it has nothing to clip with
- L710   test: the bar answers a shortage of width by growing a line
- L719   test: the brand is one object and does not come apart
- L726   test: the actions stay on the right when they are alone on their line
- L741   test: nothing the bar can drop is dropped at a width
- L762   test: what the bar hides, it can still measure
- L774   test: a hidden piece keeps its width without widening the document
- L784   test: the last rung buys width at a viewport size, not at its own verdict
- L796   test: the observer decides but does not write during delivery
- L808   test: a verdict that has not changed is not written back
- L817   test: the switch names itself, so hiding its word costs nothing
- L824 describe: one primary action per screen
- L831   test: the navbar CTA steps down where the form already is
- L836   test: the join screen passes its own identity to the bar
- L841 describe: revealed round
- L842   test: vote cards are marked inoperable to assistive tech once revealed
- L866 describe: the signed-in workspace
- L869   test: the dashboard-inside-the-form classes stay deleted
- L879   test: a Team Room is reachable one way, not four
- L894   test: opening a Team Room is the action of its panel
- L903   test: Open needs nothing the form has not already answered
- L915 describe: a label points at a field
- L921   test: no label element is left dangling
- L926   test: a heading for a group of buttons is a group, not a label
- L932 describe: reduced motion reaches the scrolling too
- L937   test: no call site hard-codes smooth scrolling
- L943 describe: a control that promises something does it
- L944   test: the navbar CTA
- L960 describe: one page measure
- L961   test: only the design system declares a container width
- L968   test: every band centres itself with .pp-container, not by hand
- L984   test: the home page
- L989   test: a container inside a container does not pad twice
- L997 describe: one gap scale
- L998   test: the three gap tokens are defined
- L1002   test: the grid and the room column come off the same token
- L1008   test: a flow gives every block in a band the same gap
- L1020   test: a panel owns the gap between its children
- L1028   test: no panel child re-declares the gap the panel already gives it
- L1038 describe: headings and reading measure
- L1039   test: a band heading is centred, block and text
- L1044   test: a heading that shares a row with its content can take that axis
- L1053   test: prose keeps the reading cap and centres under it
- L1062 describe: currency
- L1063   test: no pound sign survives in anything a user sees
- L1076 describe: a finished round has one set of controls
- L1080   test: record, re-vote, new sprint and end session are in the same row
- L1086   test: the row sits under the estimate, not above it
- L1092   test: the action bar above the estimate carries no button once revealed
- L1098   test: only one control commits the estimate
- L1105   test: the confirm dialogs are written once each
- L1119 describe: the sprint snapshot is a stack, not a grid
- L1120   test: the KPIs are not laid out by the auto-fit Grid
- L1130   test: each KPI reads label-left, value-right on one line
- L1135   test: the KPI tiles ask for that variant rather than being restyled from outside
- L1144   test: one sub-heading treatment for every section of the panel
- L1156 describe: the light theme keeps its value ladder
- L1161   test: the paper ramp is five rungs and nothing is pure white
- L1169   test: a card never sits below the page it is on
- L1178 describe: nothing can force a modal to scroll sideways
- L1179   test: a modal
- L1183   test: a full-width segmented control shrinks instead of overflowing
- L1191 describe: overflow-x: hidden never lands on body
- L1196   test: %s
- L1201 describe: one accent, one meaning
- L1202   test: the observer row does not borrow the alert blue
- L1208   test: no component paints --cream on a felt background
- L1214 describe: the boot shell paints the same ground the app does
- L1216   test: --boot-bg matches --bg-page in the light theme
- L1223 describe: a container with children has a rhythm of its own
- L1238 describe: the results card states each number once
- L1239   test: the range row is min, median and max — the average is the hero
- L1252 describe: the design system does not keep a second copy of a fixed bug
- L1253   test: no .pp-action-bar survives to re-offer the phone dock
- L1261   test: the room
- L1269 describe: felt surfaces reach for a role, not a literal
- L1274   test: %s uses a border role
- L1281   test: every felt subtree selector is in the inverse block
- L1290 describe: nothing is left aligned against itself
- L1296   test: the footer
- L1302   test: right alignment is reserved for columns of numbers
- L1317 describe: a divider has air on both sides
- L1318   test: the footer columns clear the plan bar
- L1342 describe: the ground is the same colour everywhere it is written down
- L1352   test: the tokens the copies are copying still exist
- L1361   test: the pre-paint boot block matches
- L1366   test: the theme-color meta matches, and dark is the unqualified default
- L1370   test: the theme toggle repaints the browser chrome to the same two colours
- L1376   test: the PWA manifest matches
- L1389 describe: brand assets
- L1393   test: every icon the manifest promises is actually shipped
- L1399   test: the manifest declares a maskable icon that is not also the 
- L1407   test: the files index.html links to exist
- L1414   test: every unfurl points at the same version of the OG card
- L1429   test: the nav mark stays at least 3x the largest size any screen draws it
- L1455 describe: the theme switch survives every width
- L1460   test: nothing anywhere hides the switch itself
- L1468   test: the narrow bar drops the word, not the control
- L1489   test: only the bar that runs out of room asks to be compacted
- L1498   test: the label is width-pinned so toggling cannot shove the navbar
- L1505   test: the visible word and the accessible name are the same string
- L1518   test: the knob is not painted in a surface
- L1542 describe: a control is one rung above the thing it sits on
- L1545   test: the dark theme
- L1554   test: there is a rung between primary and secondary, and it is the one accent
- L1566   test: Start countdown and Add take it, and neither takes primary
- L1575   test: End session is a filled control, not red text in a box
- L1581   test: solid red exists for a confirm dialog and is not loose in the page
- L1596 describe: the role cards
- L1601   test: a description reserves the second line the row was going to need
- L1605   test: the compact variant, which has no description, is not padded out
- L1609   test: the icon is a rung of its own, not the first word of the label
- L1619 describe: the sized list can be corrected
- L1622   test: the dialog names the row, not just the act
- L1628   test: two ways out, and the safe one holds focus
- L1633   test: the delete button carries the row in its name, not just an X
- L1638   test: the action column
- L1646   test: and the column instruction that sizes it does not survive the stack
- L1668 describe: the timer row
- L1673   test: aligns on the bottom edge, the only one the two controls share
- L1679   test: wraps instead of reaching for a breakpoint
- L1687   test: the hint is still wired to the control it describes
- L1708 describe: printed and downloaded exports
- L1716   test: print forces paper colours, or the dark theme prints as a blank sheet
- L1721   test: the mark survives a printer told not to print backgrounds
- L1729   test: the report names the product and the domain
- L1734   test: the table header repeats when a long list runs to a second sheet
- L1738   test: controls are not printed, because paper cannot be clicked
- L1743   test: both CSV filenames carry the brand
- L1749   test: the CSV body stays machine-clean so the promised import keeps working
- L1764   test: the CSV signs itself with the same sentence the Copy button uses
- L1785   test: the report is not inside the room it reports on
- L1802   test: the live room is not what gets printed
- L1809   test: print inks every element, not a list of elements
- L1822   test: and every exemption from the ink outranks it deliberately
- L1857 describe: the system rules
- L1874   test: App.js does not restyle a design-system component from outside it
- L1899   test: every font-size is a token — %s
- L1907   test: the rem base is declared exactly once, in App.js
- L1912   test: every padding, margin and gap is on the 4px grid — %s
- L1929   test: every font-family and font-weight is a token — %s
- L1935   test: every media query is on the one breakpoint scale
- L1952   test: every family a --font-* token names is actually loaded
- L1967   test: and every font file that ships is one something asks for
- L1975   test: and every face the OG card asks for is one that still ships
- L1989   test: and every family declared is one a token can still name
- L2015   test: no stylesheet references a custom property that does not exist
- L2036   test: every z-index is a token — %s
- L2041   test: every transition and animation is on the motion scale — %s
- L2060   test: nothing in the stylesheet can terminate the template literal
- L2074   test: every class in every stylesheet is one something can render
- L2120   test: the App.js stylesheet does not grow

## `src/estimation.js`

- L14 `isSizedVote`: A card that expresses a size. "?" means "I cannot size this", and an absent or empty value means the player is flagged as voted but has no card yet — Firebase s…
- L27 `tally`: Derives everything the reveal screen shows from the current player list. @param {Array<{role?: string, vote?: string|null, voted?: boolean}>} players @returns {…
- L92 `sprintResetUpdates`: The room-relative paths a new sprint has to blank, and what to blank them to. This is a list, and the bug it exists to prevent is a short one. The counters used…
- L142 `deleteSizedItemUpdates`: estimates on the queue at `stories/{i}`; a room without one keeps bare records at `rounds/{n}`. The caller says which list the row came from and where in it, be…
- L187 `isTimeUp`: True when the countdown ran out and the cards are still face down. Derived rather than stored, and it costs nothing to keep it that way: only the tick at zero l…
- L199 `csvCell`: RFC 4180 escaping — item names routinely contain commas and quotes.
- L218 `summaryCsv`: Serialises the sprint summary. The provenance line goes LAST, after a blank row, and in the first column. Both of those are load-bearing: - last, because a prea…
- L225 `showNum`: Formats a number for display: whole numbers bare, otherwise one decimal.
- L236 `CODE_ALPHABET`
- L252 `randomId`: A random string of `len` symbols drawn uniformly from `alphabet`. Both ids used to come from `Math.random().toString(36)`, which is wrong twice over for a secre…
- L264 `playerId`: Per-tab player id. Lowercase so it never looks like a room code in a URL.
- L267 `mkCode`: A fresh ad-hoc room code. Five symbols of base-36 = 60,466,176 rooms.
- L280 `cleanRoomCode`: Turns whatever is in the "room code" box into something safe to address a room with. The share button hands people a URL, so a URL is what gets pasted here — th…
- L294 `teamCode`: Derives a stable, human-readable URL slug from a team name. "RPA Build Team" → "rpa-build-team". Must stay deterministic: the slug *is the room address, so a ch…
- L317 `sprintHistoryStats`: The four headline numbers and the trend badge the sprint-history modal shows. `history` arrives newest-first — App.js sorts it by `endedAt` descending — and tha…

## `src/estimation.test.js`

- L21 describe: tally: consensus
- L22   test: an empty table is not consensus and produces no stats
- L31   test: one person agreeing with themselves is not a consensus worth celebrating
- L38   test: the whole table picking the same card is real consensus
- L44   test: agreement among early voters is not full-table agreement
- L52   test: a table that unanimously played ? has agreed on nothing
- L59   test: a ? among real votes breaks consensus but not the stats
- L66   test: someone marked as voted with no card is not agreement
- L75   test: observers never count toward the table
- L82 describe: tally: numeric stats
- L83   test: averages, median and spread over an odd count
- L92   test: median of an even count is the midpoint of the two centres
- L98   test: t-shirt sizes are excluded from numeric stats rather than becoming NaN
- L105   test: t-shirt agreement still registers as consensus
- L113 describe: teamCode
- L114   test: turns a team name into a readable slug
- L118   test: falls back to 
- L124   test: strips punctuation and emoji, collapses whitespace and hyphens
- L129   test: caps at 24 characters without leaving a trailing hyphen
- L136   test: is stable, so the same team always lands on the same room
- L146 describe: sprintResetUpdates
- L156   test: clears every estimate the counters are counting
- L166   test: rewinds the queue so the room is not sitting past its last story
- L170   test: keeps the backlog — the confirm promises votes and rounds, not names
- L176   test: takes every player
- L185   test: stops the timer and restores the room
- L192   test: an empty room resets without inventing player or story paths
- L198   test: every value is a legal write — no undefined reaches Firebase
- L204 describe: deleteSizedItemUpdates
- L230   test: the rounds map is left contiguous, so the next record cannot land on one
- L238   test: the queue is left contiguous too, and the pointer follows it back
- L246   test: removing an item the queue has not reached leaves the pointer alone
- L254   test: a round knows whether it was a consensus, so that one is exact
- L259   test: a queued story does not, so that one clamps and never reads over 100%
- L265   test: deleting the last one empties the list instead of leaving {}
- L273   test: counters never go below zero, whatever the room says they were
- L279   test: an index that names nothing writes nothing
- L287   test: every value is a legal write — no undefined reaches Firebase
- L302 describe: cleanRoomCode
- L312   test: takes the code out of a pasted share link
- L317   test: a link is not merely stripped of punctuation
- L324   test: uppercases, trims and caps at the field
- L329   test: survives the empty, null and non-string cases
- L335   test: what it emits is always a legal Firebase key
- L343 describe: room codes are minted, not guessed
- L344   test: mkCode is always exactly five symbols of the code alphabet
- L354   test: playerId is always exactly eight, lowercase
- L358   test: every symbol in the alphabet is reachable
- L365   test: no symbol is meaningfully likelier than another
- L376   test: does not draw from Math.random
- L389 describe: sprintHistoryStats
- L393   it: returns zeroes rather than NaN for an empty history
- L399   it: defaults its argument, so a missing history does not throw
- L403   it: averages velocity over scoring sprints only, not every sprint
- L411   it: averages consensus over every sprint, including t-shirt ones
- L416   it: needs two scoring sprints before it will call a trend
- L421   it: reads the newest half as the recent one
- L427   it: calls a move inside ±5% steady rather than pretending it is a change
- L431   it: pairs every arrow with a word, so the badge is not colour and glyph alone
- L439   it: never slices an empty older half, whatever the count
- L460 describe: isTimeUp
- L461   test: a clock stopped on zero with the cards down is time up
- L465   test: a fresh room is not time up
- L469   test: a running clock is never time up, not even on its last second
- L474   test: a facilitator stopping the clock early is not time up
- L480   test: once the cards are up it is no longer time up
- L486   test: a new round clears it, because the duration is restored
- L490   test: a room with no timer node at all is not time up
- L510 describe: summaryCsv
- L516   test: row 1 is the column names, exactly as given
- L520   test: the data block is untouched and unshifted
- L526   test: the provenance line is last, after a blank row
- L532   test: it occupies the first column only, so an import rejects the row
- L539   test: no footer, no blank row — the file stays exactly the data
- L547   test: commas and quotes in an item name survive RFC 4180 escaping
- L552   test: an empty queue still produces a readable, signed file

## `src/firebase.js`

- L5 `firebaseConfig`

## `src/i18n.mjs`

- L45 `splitLocalePath`: as Japanese.
- L59 `withLocale`: both honest and the only version that resolves.
- L68 `alternatesFor`: Google requires before it will honour any of them.
- L79 `getLocale`
- L81 `setLocale`
- L88 `initLocaleFromPath`: Called once at startup by src/index.js. Kept separate from setLocale so the tests can drive the locale directly without touching window.location.
- L97 `VARS`: into every language of marketing copy is how the cap and the copy drift.
- L99 `fill`
- L110 `lookup`: fails the build long before anyone can see it fire.
- L116 `t`
- L123 `tList`: For the strings that are genuinely lists — bullet sets, ordered steps.

## `src/index.js`

- L18 `start`

## `src/locales/en.mjs`

- L13 `ui`

## `src/locales/index.mjs`

- L68 `LOCALES`: Console, and an unmatched path on Vercel is a bare 404.
- L74 `DEFAULT_LOCALE`
- L100 `LOCALIZED_PATHS`: clause is a real liability, and the English text is the governing one.
- L121 `LOADERS`
- L128 `UI`: Filled in as languages arrive. English is present from the start, which is what makes t()'s English fallback safe at any moment.
- L129 `CONTENT`
- L130 `META`
- L132 `loadLocale`
- L145 `loadAllLocales`: Build-time consumers — the prerenderer, the sitemap generator, the tests — want every language at once, and none of them ships to a browser.

## `src/locales/ja.mjs`

- L18 `ui`
- L617 `meta`
- L640 `content`

## `src/locales/pt.mjs`

- L13 `ui`
- L633 `meta`
- L656 `content`

## `src/reportWebVitals.js`

- L1 `reportWebVitals`

## `src/routeMeta.mjs`

- L23 `SITE_URL`
- L30 `DEFAULT_OG_IMAGE`: ?v=N is a cache-buster, not a real query. LinkedIn, Facebook, Slack and X all key their unfurl cache on the image URL, so replacing og-image.png in place left t…
- L40 `DEFAULT_META`
- L49 `STATIC_SCREEN_BY_PATH`
- L89 `PRIVATE_PATHS`: Owner-only usage dashboard: never indexed, never prerendered, never linked from public navigation.
- L91 `meta`
- L100 `STATIC_ROUTE_META`
- L211 `HOME_FAQ`
- L273 `SUPPORT_FAQ`: same query cannibalise each other.
- L308 `HOW_TO_STEPS`
- L317 `ALL_LINKS`
- L336 `ROUTE_CONTENT`
- L1164 `VARS`: The translations are written with {max} and {email} rather than a literal 20 and a literal address, so the participant cap the Firebase rules enforce cannot dri…
- L1165 `fillVars`
- L1176 `localeUrl`
- L1212 `installLocaleRoutes`: The words arrive with the language chunk. Idempotent, so calling it twice — which the tests and the prerenderer both do — is harmless.
- L1233 `activateLocale`: Fetch a language and wire its pages into the route tables. This is what src/index.js awaits before the first render.
- L1241 `activateAllLocales`: Every language at once, for the prerenderer, the sitemap generator and the tests. None of those ships to a browser, so the size does not matter there.
- L1248 `alternatesFor`: Every URL a path exists at, including its own — reciprocal by construction, which is the condition Google puts on honouring any hreflang at all.

## Firebase Realtime Database shape

From `database.rules.publish.json`. Rule keys in brackets.

- `/rooms` (.indexOn)
  - `/rooms/$roomId` (.read, .write, .validate)
    - `/rooms/$roomId/plan` (.validate)
    - `/rooms/$roomId/deck` (.validate)
    - `/rooms/$roomId/revealed` (.validate)
    - `/rooms/$roomId/round` (.validate)
    - `/rooms/$roomId/storiesDone` (.validate)
    - `/rooms/$roomId/streak` (.validate)
    - `/rooms/$roomId/consensusCount` (.validate)
    - `/rooms/$roomId/activeStory` (.validate)
    - `/rooms/$roomId/createdAt` (.validate)
    - `/rooms/$roomId/teamName` (.validate)
    - `/rooms/$roomId/founderRoom` (.validate)
    - `/rooms/$roomId/estimationMode` (.validate)
    - `/rooms/$roomId/players`
      - `/rooms/$roomId/players/$playerId` (.write, .validate)
        - `/rooms/$roomId/players/$playerId/id` (.validate)
        - `/rooms/$roomId/players/$playerId/name` (.validate)
        - `/rooms/$roomId/players/$playerId/role` (.validate)
        - `/rooms/$roomId/players/$playerId/vote` (.validate)
        - `/rooms/$roomId/players/$playerId/voted` (.validate)
        - `/rooms/$roomId/players/$playerId/online` (.validate)
        - `/rooms/$roomId/players/$playerId/disconnectedAt` (.validate)
        - `/rooms/$roomId/players/$playerId/$other` (.validate)
    - `/rooms/$roomId/timer`
      - `/rooms/$roomId/timer/running` (.validate)
      - `/rooms/$roomId/timer/duration` (.validate)
      - `/rooms/$roomId/timer/remaining` (.validate)
      - `/rooms/$roomId/timer/startedBy` (.validate)
      - `/rooms/$roomId/timer/$other` (.validate)
    - `/rooms/$roomId/stories`
      - `/rooms/$roomId/stories/$storyIndex` (.write, .validate)
        - `/rooms/$roomId/stories/$storyIndex/name` (.validate)
        - `/rooms/$roomId/stories/$storyIndex/estimate` (.validate)
        - `/rooms/$roomId/stories/$storyIndex/$other` (.validate)
    - `/rooms/$roomId/rounds`
      - `/rooms/$roomId/rounds/$roundIndex` (.write, .validate)
        - `/rooms/$roomId/rounds/$roundIndex/estimate` (.validate)
        - `/rooms/$roomId/rounds/$roundIndex/isConsensus` (.validate)
        - `/rooms/$roomId/rounds/$roundIndex/$other` (.validate)
    - `/rooms/$roomId/$other` (.validate)
- `/admins`
  - `/admins/$uid` (.read, .write)
- `/analytics` (.read)
  - `/analytics/daily`
    - `/analytics/daily/$date`
      - `/analytics/daily/$date/$event` (.write, .validate)
- `/users`
  - `/users/$uid` (.read, .write, .validate)
    - `/users/$uid/email` (.validate)
    - `/users/$uid/displayName` (.validate)
    - `/users/$uid/teamRoomName` (.validate)
    - `/users/$uid/teamRooms` (.validate)
      - `/users/$uid/teamRooms/primary` (.validate)
      - `/users/$uid/teamRooms/secondary` (.validate)
      - `/users/$uid/teamRooms/$other` (.validate)
    - `/users/$uid/plan` (.validate)
    - `/users/$uid/billingStatus` (.validate)
    - `/users/$uid/billingCycle` (.validate)
    - `/users/$uid/currency` (.validate)
    - `/users/$uid/proKey` (.validate)
    - `/users/$uid/createdAt` (.validate)
    - `/users/$uid/lastLoginAt` (.validate)
    - `/users/$uid/checkoutStartedAt` (.validate)
    - `/users/$uid/proActivatedAt` (.validate)
    - `/users/$uid/$other` (.validate)
- `/history`
  - `/history/$uid` (.read, .write)
    - `/history/$uid/$entryId` (.validate)
      - `/history/$uid/$entryId/roomCode` (.validate)
      - `/history/$uid/$entryId/teamName` (.validate)
      - `/history/$uid/$entryId/startedAt` (.validate)
      - `/history/$uid/$entryId/endedAt` (.validate)
      - `/history/$uid/$entryId/storiesDone` (.validate)
      - `/history/$uid/$entryId/totalPoints` (.validate)
      - `/history/$uid/$entryId/consensusRate` (.validate)
      - `/history/$uid/$entryId/storyCount` (.validate)
      - `/history/$uid/$entryId/stories`
        - `/history/$uid/$entryId/stories/$si` (.validate)
          - `/history/$uid/$entryId/stories/$si/name` (.validate)
          - `/history/$uid/$entryId/stories/$si/estimate` (.validate)
          - `/history/$uid/$entryId/stories/$si/$other` (.validate)
      - `/history/$uid/$entryId/$other` (.validate)
- `/$other` (.read, .write)

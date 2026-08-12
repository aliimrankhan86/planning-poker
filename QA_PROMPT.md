# Point Poker — reusable production QA prompt

Use this after a release. Replace credential placeholders only when account flows are in scope.

```text
Run a focused QA pass on https://www.pointpoker.app and report observed behaviour only.

Current product truth:
- Everything is free. There is no Pro tier, upgrade flow, Stripe checkout, or licence key.
- Rooms support 20 people including facilitators.
- No account is needed for a one-off room or to join a shared Team Room.
- A free account reserves two Team Room URLs and keeps sprint history.
- Live languages: English, Portuguese (/pt/), Japanese (/ja/).

Check:

1. Public landing and navigation
- Brand/logo, Pricing, Features, Support, Trust, and guides are reachable.
- /pricing clearly says everything is free and contains no upgrade CTA.
- No page advertises Pro, a trial, card payment, or a lower free-tier cap.

2. One-off room, signed out
- Create as Facilitator, copy invite, join in another tab as Participant.
- Vote, reveal, split-vote resolution, re-vote, record, new sprint, and end session.
- Test one queued story and one no-queue round.

3. Account and Team Rooms
- Sign in with [ACCOUNT_EMAIL] / [ACCOUNT_PASSWORD].
- Two stable Team Room URLs and sprint history are available.
- A guest can join a shared Team Room without signing in.
- Sign out leaves account-only history unavailable without breaking room joining.

4. Deck and mode coverage
- Fibonacci + User Stories.
- T-shirt + Tasks.
- Saved estimates always belong to the active deck.

5. Locales and routing
- /pt/ and /ja/ render in the URL language.
- Their translated guide links remain within that locale when a translation exists.
- /de/, /es/, /fr/, and /nl/ permanently redirect to English.
- Probe routing changes with and without a trailing slash.

6. Responsive/accessibility smoke
- 390px and desktop; dark and light themes.
- Keyboard focus, dialog close/restore, no horizontal overflow, no console errors.

Return:

POINT POKER QA RESULTS

PASS/FAIL BY AREA
- Public/navigation:
- One-off room:
- Account/Team Rooms:
- Decks/modes:
- Locales/routing:
- Responsive/accessibility:

FINDINGS
- Severity: blocker/high/medium/low — issue — exact observed behaviour

OVERALL
- Ready / Needs fixes
```

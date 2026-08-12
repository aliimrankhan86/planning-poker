# Point Poker

Free online planning poker for agile and Scrum teams. Start a real-time estimation room without an account, or create a free account for two reusable Team Room URLs and sprint history.

**Production:** [www.pointpoker.app](https://www.pointpoker.app)

## Product

- Up to 20 people per room, facilitators included
- Fibonacci, T-shirt sizing, and Powers of 2 decks
- Story or task queues, bulk paste, timer, simultaneous reveal, and re-voting
- Facilitator analytics plus clipboard, CSV, and PDF export
- Free accounts for two permanent Team Rooms and sprint history
- English, Portuguese (`/pt/`), and Japanese (`/ja/`)
- No paid tier, advertising, or card fields

## Stack

- React 19 single-page application
- Firebase Realtime Database and Email/Password Auth
- Firebase Functions for signup notifications and stale-room cleanup
- Vercel hosting and prerendered marketing routes
- Outfit, self-hosted

## Local development

Requires Node.js 22 and npm.

```bash
npm install
npm start
```

Create `.env.local` with the Firebase web configuration:

```text
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=...
REACT_APP_FIREBASE_DATABASE_URL=...
REACT_APP_FIREBASE_PROJECT_ID=...
REACT_APP_FIREBASE_STORAGE_BUCKET=...
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
```

`REACT_APP_SUPPORT_EMAIL` is optional; the app defaults to `support@pointpoker.app`.

## Verification

```bash
CI=true npm test -- --runInBand --watchAll=false
npm run test:rules
npm run build
```

The build regenerates the AI context, sitemap, production bundle, and 26 prerendered route documents.

## Deployment

Pushing `main` deploys the web app through Vercel. Firebase changes are separate:

```bash
npx firebase-tools deploy --only database
npx firebase-tools deploy --only functions
```

Database rules and both functions were deployed and production-verified on 11 August 2026. After any future Firebase deployment, verify live state rather than treating a successful local command as proof.

## Project context

- `docs/AI-CONTEXT.md` — generated current facts; read first
- `CLAUDE.md` — operational decisions and traps (gitignored)
- `PROGRESS.md` — dated session history and future checkpoints
- `PROJECT.md` — project overview plus the authoritative pending-work queue

## Licence

Private — all rights reserved.

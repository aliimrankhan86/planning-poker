# Planning Poker

A free online planning poker tool for agile and scrum teams. Run story points estimation sessions in seconds — no account required.

**Live site:** [planningpoker.app](https://planningpoker.app) _(update once domain is purchased)_

---

## Features

- **Instant sessions** — create a room and share the link, no signup needed
- **Multiple card decks** — Fibonacci (1–34), T-shirt sizing (XS–XXL), Powers of 2
- **Story queue** — add your full backlog and estimate each story in sequence
- **Real-time voting** — votes update live for all participants
- **Built-in timer** — countdown timer to keep rounds focused
- **Session summary** — copy all story point estimates at the end of a session
- **Team Room (Pro)** — persistent room with a fixed, shareable URL your team reuses every sprint
- **Results panel** — average, median, min, max, and spread displayed after reveal
- **Free tier** — up to 6 participants, all decks, full story queue
- **Pro tier** — up to 20 participants, Team Room, session export

---

## Tech Stack

- **Frontend:** React (single-page app)
- **Database:** Firebase Realtime Database
- **Hosting:** Vercel
- **Fonts:** Cormorant Garamond + Outfit (Google Fonts)

---

## Local Development

**Prerequisites:** Node.js 18+, npm

```bash
git clone <repo-url>
cd planning-poker
npm install
npm start
```

The app runs at `http://localhost:3000`.

**Environment variables** (create `.env.local`):

```
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=...
REACT_APP_FIREBASE_DATABASE_URL=...
REACT_APP_FIREBASE_PROJECT_ID=...
REACT_APP_FIREBASE_STORAGE_BUCKET=...
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
REACT_APP_SUPPORT_EMAIL=support@yourdomain.com
```

---

## Deployment

The app deploys automatically to Vercel on every push to `main`.

Set the environment variables above in your Vercel project settings (**Settings → Environment Variables**).

---

## Firebase Security Rules

Deploy `database.rules.json` to Firebase Console → Realtime Database → Rules before going live.

---

## Before Launch Checklist

- [ ] Buy domain and replace `YOUR_DOMAIN_HERE` in `public/index.html`, `public/robots.txt`, `public/sitemap.xml`
- [ ] Set `REACT_APP_SUPPORT_EMAIL` in Vercel environment variables
- [ ] Deploy `database.rules.json` to Firebase Console
- [ ] Submit sitemap to Google Search Console
- [ ] Create `public/og-image.png` (1200×630px) for social media previews

---

## Licence

Private — all rights reserved.

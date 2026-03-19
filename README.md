# 🃏 Planning Poker — RBA Dev Team

A real-time Planning Poker web app built for the RBA development team's sprint planning sessions. Team members join a shared room, vote on story points simultaneously, and reveal estimates together — making sprint estimation fast, fair, and fun.

---

## 📋 What This App Does

Planning Poker is an Agile estimation technique where each team member privately selects a card representing their story point estimate for a user story. Cards are revealed simultaneously to avoid anchoring bias. This app digitises that process so the team can run it remotely or in-person.

### Core Features

- **Single shared room** — everyone joins the same room automatically (no room codes needed)
- **Two roles** — Voter (Dev, QA, Designer) and Observer/Facilitator (Scrum Master, PO, BA)
- **Real-time voting** — votes sync live across all connected browsers via Firebase
- **Auto-reveal** — cards reveal automatically when all voters have voted
- **Estimation timer** — facilitator can start a 30/45/60 second countdown to keep sessions moving
- **Results display** — shows average, min, max, outliers, and highlights consensus
- **Consensus celebration** — confetti + banner fires when the entire team picks the same card
- **Session management** — facilitator controls reveal, next story, new sprint, and end session
- **Session auto-expiry** — sessions automatically end after 3 hours with a 10-minute warning
- **Invite link** — shareable URL so team members can join instantly

### Card Values

Uses the Fibonacci sequence: **1, 2, 3, 5, 8, 13, ?**
The `?` card is for when a voter is uncertain or needs more information before estimating.

---

## 👥 Team Context

This app is used by the RBA delivery team for sprint capacity planning and story estimation.

| Team Member    | Role                      | Sprint Capacity                                      |
| -------------- | ------------------------- | ---------------------------------------------------- |
| Jahangir Ali   | Lead Automation Developer | 8 days (10 days × 80/20 rule)                        |
| Todd Slaughter | RPA Developer             | 8 days (10 days × 80/20 rule)                        |
| Nick Baumer    | Solutions Architect       | 5 days (pre-agreed 50% — meetings & solution design) |

**Team baseline = 21 plannable days per sprint.**

### Capacity Rules

- **80/20 rule** applies to Jahangir & Todd — 20% buffer held for unplanned work, 80% is plannable delivery capacity
- **Nick is excluded from the 80/20 rule** — his 50% capacity is a pre-agreed arrangement reflecting his involvement in stakeholder meetings, solution design sessions, and architectural decisions
- **Typical Plannable Days = 21** — this is the agreed baseline used for velocity and points forecasting

---

## 🏗️ Architecture & How It Works

```
Browser (React)
    ↕  real-time sync
Firebase Realtime Database
    ↑
Vercel (hosting & deployment)
```

### Data Flow

1. User enters their name and selects a role (Voter or Observer)
2. App connects to a fixed Firebase room (`SPRINTROOM`)
3. Each player's vote is written to Firebase in real-time
4. All connected browsers listen to the same Firebase path and update instantly
5. When all voters have voted, cards auto-reveal (700ms delay for animation)
6. Facilitator can also manually reveal, start the next story, or end the session
7. On browser close, the player is automatically removed from the room

### Room Architecture

- **Fixed room mode** — everyone joins `SPRINTROOM` automatically. No room codes or URL params needed.
- The room is stored at `rooms/SPRINTROOM` in Firebase Realtime Database
- Each player has a unique random ID generated on join
- Room data includes: players, votes, round number, stories done, timer state, and session timestamp
- Rooms are deleted when the facilitator ends the session or after 3 hours

> **Note:** Dynamic room mode (shareable links with unique room codes) is built into the code but currently commented out. Search for `DYNAMIC ROOM MODE` comments in `App.js` to re-enable it.

---

## 🛠️ Tech Stack

| Technology                     | Purpose                                     | Version | Free Tier                                   |
| ------------------------------ | ------------------------------------------- | ------- | ------------------------------------------- |
| **React**                      | Frontend UI framework                       | 19.x    | Free (open source)                          |
| **Create React App**           | Project scaffolding & build tooling         | 5.0.1   | Free (open source)                          |
| **Firebase Realtime Database** | Real-time data sync between all players     | 12.x    | Free up to 1GB storage, 10GB/month transfer |
| **Vercel**                     | Hosting & automatic deployments from GitHub | —       | Free for personal/hobby projects            |

### Key Dependencies

```json
{
  "react": "^19.2.4",
  "react-dom": "^19.2.4",
  "firebase": "^12.10.0",
  "react-scripts": "5.0.1"
}
```

### No External UI Libraries

The entire UI is built with vanilla CSS-in-JS (injected via a `<style>` tag). No Tailwind, no Material UI, no component libraries — keeping the bundle lean.

### Fonts (via Google Fonts CDN)

- **Cormorant Garamond** — used for card numbers and headings (serif, elegant)
- **Outfit** — used for all body text and UI labels (sans-serif, clean)

---

## 📁 Project Structure

```
planning-poker/
├── public/
│   ├── index.html          # App shell
│   ├── favicon.svg         # App icon
│   └── manifest.json       # PWA manifest
├── src/
│   ├── App.js              # Entire application — all components, logic, and CSS live here
│   ├── firebase.js         # Firebase initialisation (reads from .env variables)
│   ├── index.js            # React entry point
│   └── App.css             # Minimal base styles (most styling is in App.js)
├── .env                    # Firebase config (NOT committed to Git — see setup below)
├── .gitignore              # Excludes .env, node_modules, build, .vercel
├── package.json            # Dependencies and scripts
└── README.md               # This file
```

> **Important for AI tools:** All application logic is in a single file — `src/App.js`. This is intentional for simplicity. The file contains: CSS constants, Firebase room logic, timer logic, confetti animation, JoinScreen component, GameScreen component, and all sub-components.

---

## ⚙️ Environment Variables

Firebase credentials are stored in a `.env` file which is **not committed to Git** (excluded via `.gitignore`).

To run locally, create a `.env` file in the project root with the following keys:

```env
REACT_APP_FIREBASE_API_KEY=your_value_here
REACT_APP_FIREBASE_AUTH_DOMAIN=your_value_here
REACT_APP_FIREBASE_DATABASE_URL=your_value_here
REACT_APP_FIREBASE_PROJECT_ID=your_value_here
REACT_APP_FIREBASE_STORAGE_BUCKET=your_value_here
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_value_here
REACT_APP_FIREBASE_APP_ID=your_value_here
```

For Vercel deployment, add these same keys as Environment Variables in the Vercel project settings.

---

## 🚀 Local Development

```bash
# Install dependencies
npm install

# Start development server
npm start
# Opens at http://localhost:3000

# Run tests
npm test

# Build for production
npm run build
```

---

## 🌐 Deployment

The app is deployed on **Vercel** and connected to this GitHub repository. Every push to `main` triggers an automatic deployment.

To deploy manually:

1. Push changes to `main` branch
2. Vercel automatically builds and deploys
3. Environment variables must be set in Vercel project settings (not in code)

---

## ⚠️ Firebase Studio Migration Notice

> **Received: 19 March 2026**

This project was originally developed using **Firebase Studio**, which is being shut down.

### Key Dates

| Date              | What Happens                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| **19 March 2026** | Firebase Studio enters shutdown phase. Still fully functional but migration tools become available |
| **22 June 2026**  | No new workspaces can be created. New account registration disabled                                |
| **22 March 2027** | Firebase Studio fully shut down. All remaining code becomes inaccessible                           |

### What This Means for This Project

- ✅ **No immediate action needed** — the app itself runs on Vercel and Firebase Realtime Database, which are **not affected**
- ✅ **Core Firebase services continue** — Firestore, Auth, and App Hosting are unaffected by the shutdown
- ⚠️ **Agent chat history cannot be migrated** — any AI-assisted development chat history from Firebase Studio will be lost
- 📦 **Code is already on GitHub** — this repository is the source of truth, so nothing is lost

### Recommended Actions Before June 2026

- Start any new workspaces or projects directly in **Google AI Studio** (web IDE) or **Google Antigravity** (desktop)
- Use the "Transfer to AI Studio" button (rolling out in Firebase Studio) for App Prototyping agent workspaces
- For IDE-based projects: use **Zip & Download** in Firebase Studio and open in Google Antigravity

More info: [Firebase Studio Migration Guide](https://firebase.google.com/docs/studio/migrate)

---

## 🤖 Notes for AI Coding Tools

If you're an AI assistant reading this to understand the codebase, here's what you need to know:

- **Single-file app** — all React components, CSS, and logic are in `src/App.js`. Do not split unless asked.
- **Fixed room** — `FIXED_ROOM_CODE = "SPRINTROOM"` hardcoded in `App.js`. Dynamic rooms are commented out.
- **No TypeScript** — plain JavaScript throughout.
- **No external component libraries** — all UI is custom CSS injected as a template literal string (`const CSS = \`...\``).
- **Firebase Realtime Database** (not Firestore) — uses `ref`, `set`, `update`, `remove`, `onValue` from `firebase/database`.
- **Credentials via environment variables** — never hardcode Firebase config. Always use `process.env.REACT_APP_*`.
- **Timer architecture** — the person who clicks "Start" drives the countdown locally using `setInterval` and writes remaining time to Firebase every second. Everyone else reads Firebase reactively. This avoids race conditions.
- **Auto-reveal logic** — when all voters have voted, a 700ms timeout fires a fresh Firebase read to confirm state before revealing, avoiding stale closure issues.
- **Session expiry** — sessions auto-delete from Firebase after 3 hours (`SESSION_MAX_MS`). A warning fires at 10 minutes remaining.
- **Capacity rules for this team** — Jahangir & Todd use 80/20 buffer (8 plannable days from 10). Nick uses 50% flat (5 days, no buffer). Team baseline = 21 plannable days.

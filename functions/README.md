# Point Poker Firebase Functions

This folder contains the production backend jobs that need Firebase Admin access.

## Functions

- `notifyOwnerOnSignup` sends one owner email when a new `/users/{uid}` profile is created. `/ops/notifications/{uid}` records idempotency/audit state.
- `reapStaleRooms` runs every six hours. It deletes expired one-off rooms and resets expired Team Rooms to reusable shells after the five-hour session limit.

Firebase Auth verification emails are sent by Firebase Auth from the frontend. The former Pro-activation notification trigger was deleted when the paid tier was removed; do not restore plan-watching email logic without a new product decision.

## Environment

Create `functions/.env` from `.env.example` and supply the SMTP and service-account values. The live deployment uses the App Engine default service account:

`planning-poker-b6ac1@appspot.gserviceaccount.com`

## Verification

```bash
npm --prefix functions install
npm --prefix functions test
```

The import-time test is mandatory after dependency or runtime changes; it catches Firebase Admin API breakage before deployment.

## Deploy

```bash
npx firebase-tools deploy --only functions
npx firebase-tools functions:list --project planning-poker-b6ac1
```

Do not treat the deploy command alone as proof. Confirm both functions are listed, then verify a fresh signup email or force-run the scheduled reaper when the change affects those paths.

Both functions were deployed and production-verified on 11 August 2026. Node 22, `maxInstances` limits, and the three-day Artifact Registry cleanup policy are live.

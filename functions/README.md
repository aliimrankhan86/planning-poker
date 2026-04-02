# pointpoker notification functions

This folder contains the backend notification layer for account signups and Pro activations.

## What it does

- Sends an owner notification email when a new `/users/{uid}` profile is created
- Sends an owner notification email when a user becomes active Pro
- Sends a user confirmation email when Pro becomes active
- Uses `/ops/notifications/{uid}` as an idempotency/audit path so repeated profile updates do not resend the same notification

## What it does not do

- It does not replace Firebase Auth email verification. Registration verification emails are sent from the frontend via Firebase Auth.
- It does not touch Stripe. Pro notifications currently trigger on the account profile transition to `plan=pro` + `billingStatus=active`.

## Environment

Create a local `functions/.env` from `.env.example` and set real values before deploying.

Required values:

- `APP_BASE_URL`
- `SUPPORT_EMAIL`
- `OWNER_NOTIFICATION_EMAIL`
- `ZOHO_SMTP_HOST`
- `ZOHO_SMTP_PORT`
- `ZOHO_SMTP_SECURE`
- `ZOHO_SMTP_USER`
- `ZOHO_SMTP_PASS`
- `MAIL_FROM_NAME`
- `FUNCTION_SERVICE_ACCOUNT`

## Deploy

1. Install function dependencies:
   - `cd functions && npm install`
2. Deploy Firebase Functions:
   - `firebase deploy --only functions`

If your project is missing the default Compute service account, keep `FUNCTION_SERVICE_ACCOUNT` pointed at the App Engine default service account:

- `planning-poker-b6ac1@appspot.gserviceaccount.com`

## Post-deploy checks

1. Register a brand new account.
2. Confirm the user receives a Firebase verification email.
3. Confirm the owner receives a signup notification email.
4. Activate Pro on a free account.
5. Confirm the owner receives a Pro activation notification.
6. Confirm the user receives a Pro activation email containing both dedicated Team Room URLs.

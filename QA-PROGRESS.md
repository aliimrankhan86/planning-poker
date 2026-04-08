# Live QA Audit — Progress Notes
**Date:** 6 April 2026
**Tester:** Claude (automated)
**Session:** Resuming from earlier context

---

## Status at pause

Flows 1–2 partially complete. Flow 2 (Pro upgrade) is blocked by a DB rules issue. Flows 3–4 not started.

---

## Flow 1: Fresh Free Signup — aliimrankhan86+1@gmail.com ✅ DONE

### Account created
- **Name:** Atlas Test
- **Email:** aliimrankhan86+1@gmail.com
- **UID:** `zn7rQhez0ZN7diLUgphPcaH27PG2`
- **Plan:** free ✅
- **billingStatus:** inactive ✅
- **displayName written:** Atlas Test ✅

### 🔴 DEFECT 1 (P0) — Verification email not delivered (now fixed)
**Root cause:** `www.pointpoker.app` was missing from Firebase Auth Authorised Domains.
App calls `sendEmailVerification(user, { url: 'https://www.pointpoker.app' })` but the domain wasn't authorised → `auth/unauthorized-continue-uri` on every attempt.
**Fix applied:** Added `www.pointpoker.app` to Firebase Auth → Settings → Authorised Domains. Active immediately, no deploy needed.
**Verification:** Gmail search across all folders (`in:everywhere from:pointpoker OR from:planning-poker.firebaseapp`) returned zero results — confirmed no email delivered before fix.

### 🔴 DEFECT 2 (P2) — Firebase Auth SMTP relay not configured
**Observed:** Auth → Templates → SMTP Settings shows all placeholder values (`support@yourdomain.com`, `smtp.host.com`). Toggle is OFF.
**Impact:** Verification emails send from `noreply@planning-poker-b6ac1.firebaseapp.com` rather than `noreply@pointpoker.app`. This undermines brand trust and may cause deliverability issues in Gmail. AGENTS.md claim "Zoho SMTP configured" refers only to Cloud Functions notification emails, NOT Firebase Auth verification emails. These are two separate systems.
**Fix needed:** Enable SMTP relay in Firebase Auth → Templates → SMTP Settings using Zoho credentials.

### 🟡 DEFECT 3 (P2) — Team Room data written to FREE user profile at signup
**Observed in Firebase DB:** `/users/zn7rQhez0ZN7diLUgphPcaH27PG2` has:
- `teamRoomName: "Atlas Test Team"`
- `teamRooms.primary: "Atlas Test Team"`
- `teamRooms.secondary: "Atlas Test Team 2"`

Free users should NOT have `teamRooms` written. These are Pro-only fields. They appear to be auto-written at profile creation time using `resolveDedicatedTeamRooms()` in `saveUserProfile`. The DB rule allows this (no restriction on teamRooms for free users), but it's semantically incorrect — free users won't use Team Rooms.
**Risk:** Could confuse future analytics and Pro feature gating logic.
**Fix needed:** Conditional in `saveUserProfile` / `writeProUserProfile` — don't write `teamRooms` for free users. Only write during Pro activation.

### UX observations (Flow 1)
- `verify_error` UI correctly shows both error message and "Resend" + "Continue to workspace" buttons ✅
- Resend correctly hits Firebase (rate-limit error proves function is called) ✅
- Resend shows "Too many verification attempts" on rapid retry ✅ (Firebase rate-limit, expected)
- "Continue to workspace" is available as escape hatch ✅

---

## Flow 2: Free-to-Pro Upgrade — PPRO-TEST-QA26-2026 🔴 BLOCKED

### Setup
- Created test license `PPRO-TEST-QA26-2026` with `active: true` in Firebase DB via Console.
- Attempted activation on Atlas Test account from the `verify_error` modal → activation section.

### Error observed
**"This key is attached to this account, but Pro setup did not finish. Try once more or contact support."**

This is the `retry` state from `validateAndSavePro`. It means:
1. License claim transaction ran and set `claimedBy: user.uid` ✅
2. `writeProUserProfile` call failed (threw) ❌
3. `reconcileProActivationState` also failed to write Pro profile ❌

### 🔴 DEFECT 4 (P0) — Pro activation writes fail consistently
**Likely cause:** The deployed Firebase DB rules for `/users/$uid` require:
```
root.child('licenses/' + proKey + '/claimedBy').val() === $uid
```
This cross-reference check may be failing if the rules were not re-deployed since the last rule change, OR there is a field validation conflict (e.g. the `$other: { ".validate": false }` rejecting a field being written by `writeProUserProfile` that isn't in the schema).

**What's confirmed:**
- `database.rules.json` (local) — rule looks correct
- Firebase Console Rules page loaded but was not fully compared at pause point
- The license transaction IS committing (`claimedBy` confirmed set to user UID in DB)
- `writeProUserProfile` writes: `{ email, displayName, teamRoomName, teamRooms, plan, billingStatus, createdAt, proKey, proActivatedAt, lastLoginAt }` — all fields are in the local rules schema

**Next step to diagnose:** Check the Rules Playground in Firebase Console to simulate the write and see the specific rejection reason. Also compare deployed rules vs `database.rules.json`.

---

## Fixes Applied During Session

| Fix | Type | Status |
|-----|------|--------|
| Added `www.pointpoker.app` to Firebase Auth Authorised Domains | Firebase Console | ✅ Done — live immediately |
| Created test license `PPRO-TEST-QA26-2026` for Flow 2 testing | Firebase Console | ✅ Done |

---

## Fixes Still Needed

| Defect | Priority | Fix |
|--------|----------|-----|
| D1: Verification email domain fix | P0 | ✅ Applied (authorised domain added) |
| D2: Firebase Auth SMTP not configured | P2 | Configure Zoho SMTP relay in Firebase Auth → Templates → SMTP Settings |
| D3: teamRooms written to free user profile | P2 | Don't write teamRooms in saveUserProfile for free users |
| D4: Pro activation `writeProUserProfile` fails | P0 | Diagnose rule mismatch; likely re-deploy `database.rules.json` |
| D5: White-below-fold CSS (production not redeployed) | P1 | `git push` / Vercel deploy |

---

## Flows Not Yet Run

- **Flow 2 (blocked):** Pro activation failing — cannot confirm Team Room naming, Pro UI
- **Flow 3:** Direct-to-Pro with `misteraliimran+1@gmail.com` — NOT STARTED
- **Flow 4:** Pro workspace UX (Team Rooms, no upsell for Pro users) — NOT STARTED
- **Email checks:** Owner notification email after Pro activation — NOT VERIFIED
- **Regression retesting:** Not done

---

## Resume Instructions (Next Session)

1. Start by reading AGENTS.md, PROJECT.md, PROGRESS.md as usual.
2. Share this file (`QA-PROGRESS.md`) at session start.
3. First task: Diagnose DEFECT 4 — check Firebase Rules Playground for the Pro profile write failure.
4. Likely fix: Re-deploy `database.rules.json` via `firebase deploy --only database` in terminal.
5. Once Pro activation works, confirm:
   - `plan: "pro"` in `/users/{uid}`
   - `billingStatus: "active"` in `/users/{uid}`
   - `claimedBy: uid` in `/licenses/PPRO-TEST-QA26-2026`
   - Owner notification email in Gmail / Zoho webmail
   - User Pro email (if configured)
6. Then run Flow 3 (misteraliimran+1@gmail.com) and Flow 4 (Pro workspace UX).
7. Then deploy white-below-fold CSS fix to Vercel.
8. Write final QA report.

### Test credentials
- **Atlas Test (Free→Pro upgrade):** aliimrankhan86+1@gmail.com / PointPokerQA2026!
- **Comet Test (Direct-to-Pro):** misteraliimran+1@gmail.com (not yet created)
- **Test license key:** PPRO-TEST-QA26-2026 (active, claimed by Atlas Test UID above)
- **Atlas Test UID:** `zn7rQhez0ZN7diLUgphPcaH27PG2`
- **Firebase project:** planning-poker-b6ac1

---

## Known Good
- Firebase Auth enabled and working (account creation, sign-in) ✅
- Realtime Database connected ✅
- Free user profile write works ✅
- Rate-limiting on verification email correctly handled in UI ✅
- `verify_error` and `verify_resending` states render correctly ✅
- License claiming transaction works (claimedBy correctly set) ✅
- Activation code UI accessible from modal during verify_error state ✅

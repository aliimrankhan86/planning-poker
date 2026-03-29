# pointpoker — Reusable Atlas QA Prompt

Paste this into ChatGPT Atlas after a release. Replace the bracketed credential placeholders before running.

```text
Run a focused QA pass on the live pointpoker app and report only observed behaviour.

Product:
- URL: https://www.pointpoker.app
- Free test account: [FREE_EMAIL] / [FREE_PASSWORD]
- Pro test account: [PRO_EMAIL] / [PRO_PASSWORD]

Check these areas:
1. Landing page and navbar
- Brand/logo visible
- `Plans` and `FAQ` nav items visible and understandable
- `Plans` scrolls to the on-page plans section
- `FAQ` scrolls to the FAQ section
- Pricing CTA still opens the pricing modal

2. Auth workflow
- Log in modal copy is clear
- Create account vs Sign in vs Reset password are easy to distinguish
- Starting upgrade while signed out sends the user into account creation/sign-in cleanly
- After auth, the user returns to pricing instead of getting stranded
- Signed-in account state clearly shows Free vs Pro

3. Free account behaviour
- Sign in with the free account
- Navbar shows free account state correctly
- History button is not shown for free
- Upgrade CTA still appears for free

4. Pro account behaviour
- Sign in with the Pro account
- Navbar shows Pro state clearly
- History button is visible
- Team Room access works without upgrade friction
- Pricing modal reflects active Pro state correctly

5. Room flow regressions
- Create room, join room, team room
- Voting, reveal, re-vote, new round
- Leave room / end session
- Mobile/touch card selection still behaves correctly

6. UX consistency
- Look for confusing labels, dead ends, mixed messaging, awkward transitions, or navigation friction
- Call out any mismatch between pricing/account copy and actual behaviour

Return results in this format:

POINTPOKER QA RESULTS

PASS/FAIL BY AREA
- Landing/nav:
- Auth workflow:
- Free account:
- Pro account:
- Room flow:
- UX consistency:

FINDINGS
- Severity: [blocker/high/medium/low] — [issue] — [exact observed behaviour]

NOTES
- Anything suspicious but not confirmed as a bug

OVERALL
- Ready / Needs fixes
```

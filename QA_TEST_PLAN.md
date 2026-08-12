# pointpoker — Comprehensive End-to-End QA Test Plan
> **Historical pre-pivot plan — do not execute as current QA.** This document
> tests retired Free/Pro, pricing, Stripe, and licence flows. Point Poker became
> free for everyone in August 2026. Use `QA_PROMPT.md` for the current
> production smoke test; keep this file only as historical regression context.

<!-- Share with any QA agent (ChatGPT, Codex, Claude) at the start of a QA session -->
<!-- Test against: https://www.pointpoker.app -->
<!-- Report format: PASS / FAIL / PARTIAL + exact observation -->

---

## How to Use This Document

Work through each section in order. For every test case:
- Record **PASS**, **FAIL**, or **PARTIAL**
- If FAIL or PARTIAL, record the exact symptom, URL, and reproduction steps
- Return the full results to the product owner (Ali) for triage

Tests marked **[BLOCKER]** must pass before public launch.
Tests marked **[PRO]** require a Pro account — use Ali's test account.
Tests marked **[MOBILE]** should be performed on a real mobile device or DevTools mobile viewport.

---

## 0. Pre-Test Setup

| # | Step |
|---|------|
| 0.1 | Open https://www.pointpoker.app in a fresh incognito/private window |
| 0.2 | Open browser DevTools → Console tab. Note any errors before testing |
| 0.3 | Set up two browser windows/tabs to simulate two participants |
| 0.4 | Have a test email address ready to register a free account |
| 0.5 | Confirm the Pro test account credentials are available |

---

## 1. Home Screen (Join Screen) — Anonymous

### 1.1 Page Load
| # | Test | Expected |
|---|------|----------|
| 1.1.1 | **[BLOCKER]** Load https://www.pointpoker.app | Page loads without console errors. Brand mark + "Point Poker" wordmark visible in navbar |
| 1.1.2 | **[BLOCKER]** Check page title in browser tab | "Free Planning Poker Online — pointpoker" |
| 1.1.3 | Check meta description exists | Right-click → View Page Source → search `<meta name="description"` — value should mention planning poker |
| 1.1.4 | Scroll to bottom of join screen | SEO content section visible (headings about what planning poker is, FAQ, etc.) |
| 1.1.5 | Check favicon | Browser tab shows the pointpoker brand mark icon |

### 1.2 NavBar — Anonymous State
| # | Test | Expected |
|---|------|----------|
| 1.2.1 | **[BLOCKER]** View navbar | "Log in" button and gold "✦ Get Pro" button visible. Both vertically aligned at same height |
| 1.2.2 | Check upgrade subtitle below Get Pro button | Small text reads "Team Room · 20 players · Sprint history" |
| 1.2.3 | Check button alignment precisely | "Log in" and "Get Pro" button tops/centres sit at identical vertical position — no offset |

### 1.3 Tab Navigation
| # | Test | Expected |
|---|------|----------|
| 1.3.1 | Click "Create Room" tab | Create form shown with name field, role selector (Voter/Facilitator), deck selector, and Create button |
| 1.3.2 | Click "Join Room" tab | Join form shown with name field and room code field |
| 1.3.3 | Click "Team Room" tab | Team room form shown. Pro gate badge visible. Clicking should prompt upgrade or login |

---

## 2. Room Creation — Free

| # | Test | Expected |
|---|------|----------|
| 2.1 | **[BLOCKER]** Enter name "Test Player", select Voter, leave deck as Fibonacci, click Create | Room created. URL changes to `/?room=XXXXX`. Game screen appears |
| 2.2 | Check game screen header | Room code displayed. "End Session" and back controls visible |
| 2.3 | Check free-tier upgrade strip at bottom | Gold strip visible: "Free plan · up to 6 voters · upgrade for a permanent Team Room..." with "✦ Upgrade to Pro" button |
| 2.4 | Copy invite link (share button or URL bar) and paste into second browser window | Second browser shows Join screen pre-filled with room code |
| 2.5 | In second window, enter name "Player 2", click Join | Player 2 joins. Both windows show each other in the player list |
| 2.6 | Confirm voter count shows correctly | Facilitator does not count toward voter limit; only voters count |

---

## 3. Voting Flow

| # | Test | Expected |
|---|------|----------|
| 3.1 | **[BLOCKER]** Player 1 clicks a card (e.g. "5") | Card highlights immediately (optimistic selection). Vote registered in Firebase |
| 3.2 | Player 2 clicks a card (e.g. "8") | Both players show as "voted" in player list |
| 3.3 | Check that votes are hidden before reveal | Cards shown face-down / as ticks — actual values not visible to other players |
| 3.4 | **[BLOCKER]** Click "Reveal Votes" (facilitator) | All votes revealed simultaneously. Vote breakdown chart shown |
| 3.5 | Check stats panel after reveal | Average, median, min, max displayed. Consensus detected if all same |
| 3.6 | Click "New Round" | Cards reset. Players can vote again. Round counter increments |
| 3.7 | Player 1 taps the same card twice on mobile [MOBILE] | Card stays selected — no toggle-off on repeat tap |
| 3.8 | Change vote before reveal | Player can click a different card — new vote overwrites old |

---

## 4. Card Decks

| # | Test | Expected |
|---|------|----------|
| 4.1 | Create a room with T-Shirt deck | Cards show XS, S, M, L, XL, XXL, ? |
| 4.2 | Create a room with Powers of 2 deck | Cards show 1, 2, 4, 8, 16, 32, ? |
| 4.3 | Vote with T-Shirt cards and reveal | Stats show votes but no numeric average (T-shirt values excluded from numeric stats) |
| 4.4 | Vote with Powers of 2 and reveal | Numeric stats calculated correctly |

---

## 5. Story Queue

| # | Test | Expected |
|---|------|----------|
| 5.1 | In a game room, add a story name e.g. "User authentication epic" | Story appears in the queue panel |
| 5.2 | Add 3 more stories | All 4 visible in queue |
| 5.3 | Vote and reveal on first story, then click "Record & Next" | Story marked with estimate. Next story becomes active. Stories Done counter increments |
| 5.4 | Add a story with very long name (200 chars) | Accepted and truncated gracefully in UI |
| 5.5 | Try to add a story with 201+ chars | Rejected or truncated at 200 chars |

---

## 6. Timer

| # | Test | Expected |
|---|------|----------|
| 6.1 | Start timer with default duration | Countdown visible. All players see the same timer |
| 6.2 | Let timer run to zero | Timer stops at 0. UI does not error |
| 6.3 | Start timer then stop before it finishes | Timer stops cleanly |
| 6.4 | Set custom duration and start | Timer runs for the custom duration |

---

## 7. Session Summary and Export

| # | Test | Expected |
|---|------|----------|
| 7.1 | Estimate several stories and check session summary panel | Shows list of stories with their estimates |
| 7.2 | Click "Copy Summary" | Clipboard contains formatted plain-text summary. Toast confirms "📋 Summary copied" |
| 7.3 | Paste clipboard into a text editor | Format is human-readable: story name → estimate |

---

## 8. Session Limits and End

| # | Test | Expected |
|---|------|----------|
| 8.1 | Try to add a 7th voter to a free room | 7th player sees toast: "Room full for voters (free tier: 6 max)..." |
| 8.2 | **[BLOCKER]** Facilitator clicks "End Session" | Confirmation prompt or immediate end. Room deleted. All players redirected to home |
| 8.3 | After session ends, URL returns to `/` | Browser URL shows `https://www.pointpoker.app/` |
| 8.4 | Refresh the page after session end | Home screen shown cleanly — no stale room state |

---

## 9. Authentication — Registration

| # | Test | Expected |
|---|------|----------|
| 9.1 | **[BLOCKER]** Click "Log in" in NavBar | Login modal appears |
| 9.2 | Switch to "Create account" tab | Registration form shown (name, email, password) |
| 9.3 | **[BLOCKER]** Register with valid email and password (8+ chars) | Account created. Modal closes. NavBar shows name + "Free" badge |
| 9.4 | Register with invalid email (e.g. "notanemail") | Validation error shown. No account created |
| 9.5 | Register with password under 8 characters | Validation error shown |
| 9.6 | Register with already-used email | Error: "email already in use" or similar |
| 9.7 | Sign out via NavBar | "Sign out" button. NavBar returns to anonymous state |

---

## 10. Authentication — Sign In

| # | Test | Expected |
|---|------|----------|
| 10.1 | **[BLOCKER]** Sign in with valid credentials | Modal closes. NavBar shows name and plan badge |
| 10.2 | Sign in with wrong password | Error message shown. Not signed in |
| 10.3 | Sign in with non-existent email | Error message shown |
| 10.4 | Click "Forgot password" | Password reset email flow triggered |
| 10.5 | Refresh page while signed in | User remains signed in (Firebase auth persistence) |
| 10.6 | Open new tab while signed in | User is signed in on new tab too |

---

## 11. NavBar — Authenticated Free User

| # | Test | Expected |
|---|------|----------|
| 11.1 | Sign in with a free account | NavBar shows display name, "Free" badge pill, "Sign out" button |
| 11.2 | Check upgrade CTA visibility | "✦ Upgrade to Pro" button still visible. Subtitle reads "Team Room · 20 players · Sprint history" |
| 11.3 | History button | NOT visible for free users |
| 11.4 | Click "✦ Upgrade to Pro" | Pricing modal opens |

---

## 12. Pricing Modal

| # | Test | Expected |
|---|------|----------|
| 12.1 | **[BLOCKER]** Open pricing modal (click "✦ Get Pro" or "✦ Upgrade to Pro") | Modal appears with Free vs Pro comparison |
| 12.2 | Check Free column features | Includes: up to 6 voters, all decks, reveal, story queue, facilitator mode |
| 12.3 | Check Pro column features | Includes: Permanent Team Room, up to 20 voters, sprint history, streak analytics, priority support |
| 12.4 | Sprint history in Pro features | **[BLOCKER]** "Sprint history — velocity trends and consensus insights" listed in Pro column |
| 12.5 | Currency toggle | Switch between GBP/USD/EUR — prices update correctly |
| 12.6 | Annual/monthly toggle | Annual shows discounted price. Monthly shows full price |
| 12.7 | Close modal | Modal closes. Background page state unchanged |
| 12.8 | Terms and Privacy links at bottom of modal | Open in new tab (target="_blank") |

---

## 13. Team Room — Pro Feature

| # | Test | Expected |
|---|------|----------|
| 13.1 | **[PRO]** Sign in as Pro user. Click "Team Room" tab | Form shown without paywall prompt |
| 13.2 | **[PRO]** Enter team name e.g. "Sprint Team" | URL navigates to `/t/sprint-team` |
| 13.3 | **[PRO]** Refresh page at `/t/sprint-team` | Room rejoined. Same room state loaded |
| 13.4 | **[PRO]** Second browser joins via `/t/sprint-team` URL directly | Player joins cleanly |
| 13.5 | Free user clicks "Team Room" tab | Upgrade gate shown or redirect to pricing |
| 13.6 | Founder room: navigate to `/t/rpa-build-team` | Room loads as Pro even without Pro account on Ali's devices |

---

## 14. Sprint History — Pro Feature

| # | Test | Expected |
|---|------|----------|
| 14.1 | **[PRO]** [BLOCKER]** Sign in as Pro. Complete an estimation session with at least 2 stories. End the session | "📊 History" button visible in NavBar |
| 14.2 | **[PRO]** Click "📊 History" button | History modal opens |
| 14.3 | **[PRO]** Check insights panel | Shows: avg velocity, best sprint, avg consensus %, trend arrow |
| 14.4 | **[PRO]** Check sprint list | Session just ended appears at top. Shows team name (or Sprint N), date, total points, stories count, consensus %, duration |
| 14.5 | **[PRO]** Complete a second session | Velocity trend updates. If recent > older: ↑ Improving |
| 14.6 | Free user — History button | NOT visible in NavBar |
| 14.7 | **[PRO]** Sign out and back in | History data persists (stored in Firebase) |

---

## 15. Footer

| # | Test | Expected |
|---|------|----------|
| 15.1 | **[BLOCKER]** Scroll to footer | Free vs Pro comparison bar visible at top of footer |
| 15.2 | Free plan bar | "Free" badge + "Up to 6 voters · All card decks · No account needed" |
| 15.3 | Pro plan bar | "Pro" badge + "Permanent Team Room · Up to 20 voters · Sprint history · From £5/mo" |
| 15.4 | "✦ Upgrade to Pro" in footer bar | Visible for free/anonymous users. Hidden for Pro users (shows "✓ You're on Pro") |
| 15.5 | **[BLOCKER]** Click "Terms of Service" in footer Legal column | Terms page loads within the SPA. Back button returns to home |
| 15.6 | **[BLOCKER]** Click "Privacy Policy" in footer Legal column | Privacy page loads within the SPA |
| 15.7 | Click "Data & GDPR" in footer | Same as Privacy Policy page |
| 15.8 | Click "Cookie Settings" | Cookie banner reappears at bottom of page |
| 15.9 | Click "Pro Plan — what's included" (free user) | Pricing modal opens |
| 15.10 | Click "Contact & Support" | Email client opens with `support@pointpoker.app` |
| 15.11 | Copyright year | Shows current year (2026) |

---

## 16. Terms of Service Page

| # | Test | Expected |
|---|------|----------|
| 16.1 | **[BLOCKER]** Navigate to https://www.pointpoker.app/terms | Terms of Service page loads. NavBar and footer still visible |
| 16.2 | Refresh the page at /terms | Page still shows Terms — not a 404 (Vercel rewrite working) |
| 16.3 | Check page content | 14 numbered sections present: Agreement, Description, Eligibility, Acceptable Use, Pro Subscription, Intellectual Property, Disclaimers, Limitation of Liability, Indemnification, Third-Party, Availability, Governing Law, General, Contact |
| 16.4 | Liability cap stated | £100 or 12 months' fees — whichever is greater |
| 16.5 | Governing law stated | England and Wales |
| 16.6 | "← Back" button | Returns to home screen. URL changes to `/` |
| 16.7 | Click logo in NavBar from /terms | Returns to home screen |

---

## 17. Privacy Policy Page

| # | Test | Expected |
|---|------|----------|
| 17.1 | **[BLOCKER]** Navigate to https://www.pointpoker.app/privacy | Privacy Policy page loads |
| 17.2 | Refresh at /privacy | Still loads — Vercel rewrite working |
| 17.3 | Check GDPR content | Sections: Who We Are, Data Collected, Legal Basis, How We Use, Cookies/Storage, Third-Party Processors, Retention, Your Rights, Complaint (ICO), Security, International Transfers, Children, Changes, Contact |
| 17.4 | All 7 DSAR rights listed | Access, Rectification, Erasure, Restriction, Portability, Object, Withdraw Consent |
| 17.5 | ICO reference | Website ico.org.uk and helpline 0303 123 1113 mentioned |
| 17.6 | Third-party processors named | Firebase (Google), Vercel, Stripe all listed with links to their policies |
| 17.7 | Support email linked | support@pointpoker.app appears as mailto link |
| 17.8 | "← Back" button | Returns to home |

---

## 18. Cookie Banner — GDPR

| # | Test | Expected |
|---|------|----------|
| 18.1 | **[BLOCKER]** Open in fresh incognito window | Cookie banner visible at bottom of page |
| 18.2 | Banner copy | States "essential browser storage only" — not "we use cookies" generically |
| 18.3 | Privacy and Terms links in banner | Open in **new tab** (not in same window — consent flow not interrupted) |
| 18.4 | **[BLOCKER]** Click "Accept & Continue" | Banner disappears. Refreshing page does NOT show banner again |
| 18.5 | Reset via footer "Cookie Settings" | Banner reappears |
| 18.6 | Check localStorage after accept | `pp_cookie_ok === "1"` set in browser localStorage |

---

## 19. Game Screen — Upgrade Strip

| # | Test | Expected |
|---|------|----------|
| 19.1 | Create a room as anonymous/free user. Enter game screen | Gold upgrade strip visible at bottom: "Free plan · up to 6 voters · upgrade for a permanent Team Room, sprint history, and up to 20 voters" |
| 19.2 | Click "✦ Upgrade to Pro" in strip | Pricing modal opens |
| 19.3 | **[PRO]** Enter game screen as Pro user | Upgrade strip NOT visible |

---

## 20. Facilitator Mode

| # | Test | Expected |
|---|------|----------|
| 20.1 | Create room as Facilitator role | Facilitator joins without a vote card. Reveal, New Round, End Session controls visible |
| 20.2 | Facilitator is not counted in voter total | Voter counter excludes the facilitator |
| 20.3 | Start timer as facilitator | Timer starts for all participants |
| 20.4 | Facilitator cannot vote | No card deck shown for facilitator |
| 20.5 | Auto-reveal when all voters voted | If all voters submit, cards reveal automatically after short delay |

---

## 21. Disconnect and Reconnect

| # | Test | Expected |
|---|------|----------|
| 21.1 | Player joins room, then closes their browser tab | Player is removed from room player list within seconds (Firebase onDisconnect) |
| 21.2 | Player refreshes their tab during a session | Player rejoins with their previous name if URL is still valid |
| 21.3 | Host closes browser during active session | Room is cleaned up (onDisconnect removes host player). Other players see disconnected state |

---

## 22. Multi-Player Sync

| # | Test | Expected |
|---|------|----------|
| 22.1 | Open room in 3 different browser tabs/windows | All 3 show same player list simultaneously |
| 22.2 | Player 1 votes | Players 2 and 3 see vote indicator update in real-time without refresh |
| 22.3 | Facilitator reveals | All 3 browsers show the reveal simultaneously |
| 22.4 | Facilitator starts new round | All 3 browsers reset their vote cards simultaneously |
| 22.5 | Add a story | All browsers see the new story in the queue immediately |

---

## 23. URL and Navigation

| # | Test | Expected |
|---|------|----------|
| 23.1 | Copy room URL (e.g. `/?room=AB123`) and open in new browser | Join screen pre-filled with room code |
| 23.2 | Navigate to `/terms` directly | Terms page loads. Navbar present |
| 23.3 | Navigate to `/privacy` directly | Privacy page loads |
| 23.4 | Navigate to a non-existent path e.g. `/foobar` | App loads (Vercel serves index.html). Screen defaults to join screen |
| 23.5 | Browser Back button from game screen | Returns to join screen. URL changes to `/` |
| 23.6 | Browser Back button from Terms page | Returns to join screen |

---

## 24. Mobile Responsiveness [MOBILE]

| # | Test | Expected |
|---|------|----------|
| 24.1 | Load home screen on iPhone/Android or DevTools mobile view (375px) | All content visible. No horizontal scroll. Tabs usable |
| 24.2 | Navbar on mobile | Brand wordmark may be hidden. "Log in" may be hidden. "Get Pro" and logo visible |
| 24.3 | Vote cards on mobile | Cards tappable. Selected state shows on first tap. Does not deselect on second tap |
| 24.4 | Cookie banner on mobile | Stacks vertically. Buttons full-width and tappable |
| 24.5 | Footer on mobile | Single column layout. All links accessible |
| 24.6 | Legal pages on mobile | Readable. Back button accessible at top |
| 24.7 | History modal on mobile | Scrollable. Insights row may stack. Sprint list readable |

---

## 25. Performance and Accessibility

| # | Test | Expected |
|---|------|----------|
| 25.1 | Run Lighthouse on home page (DevTools → Lighthouse) | Performance ≥ 80, Accessibility ≥ 85, Best Practices ≥ 85, SEO ≥ 90 |
| 25.2 | Tab through NavBar with keyboard | Focus ring visible on each interactive element |
| 25.3 | Check colour contrast on key text | Vote card numbers, headings, and body text pass 4.5:1 minimum |
| 25.4 | Check console for errors after full flow | Zero unhandled errors. Warnings acceptable |
| 25.5 | Check network tab — page load size | JS bundle under 200 kB gzipped |

---

## 26. Error States

| # | Test | Expected |
|---|------|----------|
| 26.1 | Try to join a non-existent room code | Error toast: room not found or similar. User stays on join screen |
| 26.2 | Enter join screen with expired room code in URL | Graceful fallback — join screen shown, code cleared or error shown |
| 26.3 | Firebase offline (DevTools → Network → Offline) | App degrades gracefully — does not crash. Shows connecting state |
| 26.4 | Submit empty name in Create form | Validation prevents submit. Error state shown |
| 26.5 | Submit empty room code in Join form | Validation prevents submit |

---

## 27. Analytics (Anonymous, Non-Blocking)

| # | Test | Expected |
|---|------|----------|
| 27.1 | Open Firebase Console → Realtime Database → `/analytics/daily/{today}` | Event keys appear: `room_created_free`, `player_joined`, `pricing_opened` etc. after performing those actions |
| 27.2 | Verify no PII in analytics path | Only integer counters — no emails, names, IPs, or user IDs |

---

## 28. Firebase Security Rules

| # | Test | Expected |
|---|------|----------|
| 28.1 | **[BLOCKER]** Attempt to read `/history/{anotherUsersUID}` from browser console | Permission denied. Firebase returns error |
| 28.2 | **[BLOCKER]** Attempt to write to `/users/{anotherUsersUID}` | Permission denied |
| 28.3 | Attempt to read `/analytics` | Permission denied (`.read: false`) |
| 28.4 | Create a room — all required fields present | Room created successfully (validate rules pass) |

---

## 29. Social and SEO Metadata

| # | Test | Expected |
|---|------|----------|
| 29.1 | Paste https://www.pointpoker.app into Twitter/X card validator | OG image shown, title and description correct |
| 29.2 | Paste URL into LinkedIn post composer | Preview image and description appear |
| 29.3 | Check structured data: https://search.google.com/test/rich-results | SoftwareApplication schema validates with no errors |
| 29.4 | Check robots.txt: https://www.pointpoker.app/robots.txt | Returns valid robots.txt with sitemap reference |
| 29.5 | Check sitemap: https://www.pointpoker.app/sitemap.xml | Valid XML sitemap listing the homepage URL |

---

## 30. Regression — Previously Fixed Bugs

| # | Test | Expected |
|---|------|----------|
| 30.1 | Mobile: vote a card, then tap the same card again | Vote does NOT deselect — card stays selected |
| 30.2 | After recording a story and moving to next, facilitator sees "Start Voting" | Controls reset correctly — no stuck state |
| 30.3 | Leave session → join screen shows clean state | Room code and team name inputs are cleared |
| 30.4 | Founder room `/t/rpa-build-team` loads as Pro | Team room accessible, plan shows Pro, no upgrade gate |
| 30.5 | `/t/rpa-build-team` does not trigger pricing modal | Founder detection prevents pricing redirect |

---

## Results Template

Copy this block and fill in your results:

```
## QA Results — [Date] — [Tester]

Test URL: https://www.pointpoker.app
Browser: [Chrome / Safari / Firefox / Edge] version [XX]
Mobile tested: [Yes / No] — device [iPhone XX / Samsung SX / DevTools 375px]

### Summary
- Total tests: 130+
- PASS:    ___
- FAIL:    ___
- PARTIAL: ___
- SKIPPED (Pro account not available): ___

### Failures and Partials

| Test # | Result | Symptom | Reproduction steps |
|--------|--------|---------|-------------------|
| x.x    | FAIL   |         |                   |

### Console Errors Observed
(paste any console errors here)

### Notes
(general observations, UX issues, edge cases not covered above)
```

---

## Triage Priority

After receiving QA results, address findings in this order:

1. **[BLOCKER]** failures — fix before any public announcement
2. Mobile usability failures — fix before ProductHunt / social launch
3. Performance / accessibility below threshold — fix before SEO push
4. Non-blocking UX observations — backlog for next session

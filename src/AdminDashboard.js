/* ═══════════════════════ ADMIN DASHBOARD ═══════════════════════
   Decision tool, not a vanity board. Every panel exists to answer one
   question the business actually has to decide:

     "Is anyone using this?"        → Reach + trend
     "Do they come back?"           → Retention
     "Who are they, how big?"       → Segments (device, table size, deck)
     "Should I run ads?"            → Ad ceiling, computed from real volume
     "What would they pay?"         → Poll results (the only honest source)

   Reads the aggregate counters at /analytics/daily/{date}/{event}. There is
   no personal data here to leak, but read access is still gated behind
   /admins/{uid} === true so competitors cannot scrape the numbers.

   Lazy-loaded from App.js: none of this ships to normal users.
═══════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useMemo } from "react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Grid,
  Icon,
  Progress,
  Row,
  SegmentedControl,
  SectionHead,
  StatTile,
  TextField,
} from "./design-system";
import { db } from "./firebase";
import { ref, onValue } from "firebase/database";

const DAY_MS = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);
const fmt = (n) => (n == null ? "—" : n.toLocaleString("en-GB"));

/* Ad-network reality check. Planning poker is a low-pageview product: roughly
   one page per session, no browsing. These RPMs are deliberately optimistic
   display-ad rates so the resulting number is a ceiling, not a forecast. */
const DEFAULT_RPM = { desktop: 4.0, mobile: 2.0 }; // $ per 1000 impressions

const WINDOWS = [
  { key: 7, label: "7 days" },
  { key: 30, label: "30 days" },
  { key: 90, label: "90 days" },
];

// `usd` is the midpoint of each band, used to blend a stated monthly value.
// Kept separate from `value` because `value` becomes the response count.
const WTP_BANDS = [
  { key: "wtp_zero", label: "$0 — free is the reason", usd: 0 },
  { key: "wtp_5", label: "Up to $5/mo", usd: 5 },
  { key: "wtp_15", label: "$6–15/mo", usd: 12 },
  { key: "wtp_30", label: "Over $15/mo", usd: 22 },
];

const TABLE_BANDS = [
  { key: "table_solo", label: "Solo" },
  { key: "table_2_4", label: "2–4" },
  { key: "table_5_8", label: "5–8" },
  { key: "table_9_20", label: "9–20" },
];

const SESSION_BANDS = [
  { key: "session_under_5m", label: "Under 5 min", minutes: 3 },
  { key: "session_5_20m", label: "5–20 min", minutes: 12 },
  { key: "session_20_60m", label: "20–60 min", minutes: 35 },
  { key: "session_over_60m", label: "Over 60 min", minutes: 75 },
];

const DECKS = [
  { key: "deck_fibonacci", label: "Fibonacci" },
  { key: "deck_tshirt", label: "T-shirt" },
  { key: "deck_powers", label: "Powers of 2" },
];

const FEATURES = [
  { key: "feature_queue", label: "Story queue" },
  { key: "feature_timer", label: "Countdown timer" },
  { key: "feature_paste", label: "Bulk paste import" },
  { key: "feature_invite", label: "Invite link copied" },
  { key: "feature_copy", label: "Summary copied" },
  { key: "feature_csv", label: "CSV downloaded" },
  { key: "feature_pdf", label: "Printed / saved as PDF" },
];

/* ── small presentational pieces ─────────────────────────────────────── */

function Bars({ rows, unit = "" }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (total === 0) {
    return <EmptyState title="No data in this window yet">Counts appear here as sessions are run.</EmptyState>;
  }
  return (
    <div className="dash-bars">
      {rows.map((r) => (
        <div className="dash-bar-row" key={r.key || r.label}>
          <span className="dash-bar-label">{r.label}</span>
          <Progress
            className="dash-bar-track"
            value={r.value}
            max={max}
            label={`${r.label}: ${fmt(r.value)}${unit}`}
          />
          <span className="dash-bar-value" data-numeric>
            {fmt(r.value)}{unit}
            <em>{pct(r.value, total)}%</em>
          </span>
        </div>
      ))}
    </div>
  );
}

function Trend({ series, label }) {
  const max = Math.max(1, ...series.map((d) => d.value));
  return (
    <div className="dash-trend">
      <div className="dash-trend-head">
        <span>{label}</span>
        <span className="dash-trend-max">peak {fmt(max)}</span>
      </div>
      <div className="dash-trend-plot" role="img" aria-label={`${label} per day`}>
        {series.map((d) => (
          <span
            key={d.date}
            className={`dash-trend-col${d.value === 0 ? " zero" : ""}`}
            style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
            title={`${d.date}: ${d.value}`}
          />
        ))}
      </div>
      <div className="dash-trend-axis">
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function Panel({ title, hint, children, wide }) {
  return (
    <Card as="section" className={`dash-panel${wide ? " wide" : ""}`}>
      <SectionHead align="start" title={title} subtitle={hint} />
      {children}
    </Card>
  );
}

/* ── main ─────────────────────────────────────────────────────────────── */

export default function AdminDashboard({ currentUser, onBack }) {
  const [days, setDays] = useState(30);
  const [raw, setRaw] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | denied
  const [rpmDesktop, setRpmDesktop] = useState(DEFAULT_RPM.desktop);
  const [rpmMobile, setRpmMobile] = useState(DEFAULT_RPM.mobile);

  useEffect(() => {
    if (!currentUser) { setState("denied"); return undefined; }
    const unsub = onValue(
      ref(db, "analytics/daily"),
      (snap) => { setRaw(snap.val() || {}); setState("ok"); },
      () => setState("denied"),
    );
    return () => unsub();
  }, [currentUser]);

  const dates = useMemo(() => {
    const today = Date.now();
    return Array.from({ length: days }, (_, i) => iso(today - (days - 1 - i) * DAY_MS));
  }, [days]);

  const m = useMemo(() => {
    const data = raw || {};
    const sum = (event) => dates.reduce((a, d) => a + (Number(data[d]?.[event]) || 0), 0);
    const series = (event) => dates.map((d) => ({ date: d, value: Number(data[d]?.[event]) || 0 }));

    const visitsNew = sum("visit_new");
    const visitsReturn = sum("visit_return");
    const roomsAdhoc = sum("room_created");
    const roomsTeam = sum("room_created_team");
    const roomsReentered = sum("team_room_reentered");
    const rooms = roomsAdhoc + roomsTeam + roomsReentered;
    const voters = sum("joined_voter");
    const facilitators = sum("joined_facilitator");
    const seats = voters + facilitators;
    const estimates = sum("estimate_recorded");
    const firstVoteAgreements = sum("consensus_first_vote");
    const desktop = sum("device_desktop");
    const mobile = sum("device_mobile");
    const pricingViews = sum("pricing_viewed");
    const signupsStarted = sum("signup_started");
    const signupsDone = sum("signup_completed");

    const sessionBands = SESSION_BANDS.map((b) => ({ ...b, value: sum(b.key) }));
    const sessionsMeasured = sessionBands.reduce((a, b) => a + b.value, 0);
    const avgMinutes = sessionsMeasured
      ? sessionBands.reduce((a, b) => a + b.value * b.minutes, 0) / sessionsMeasured
      : null;

    const wtp = WTP_BANDS.map((b) => ({ ...b, value: sum(b.key) }));
    const wtpDismissed = sum("wtp_dismissed");
    const wtpAnswers = wtp.reduce((a, b) => a + b.value, 0);
    const wtpPaying = wtp.filter((b) => b.value > 0 && b.key !== "wtp_zero")
      .reduce((a, b) => a + b.value, 0);
    // Blended monthly value across everyone who answered, zeros included.
    const wtpBlended = wtpAnswers
      ? wtp.reduce((a, b) => a + b.value * b.usd, 0) / wtpAnswers : null;

    // Ad ceiling. One ad impression per session is the honest assumption for a
    // single-page app that people open, use, and close.
    const deviceTotal = desktop + mobile || 1;
    const mobileShare = mobile / deviceTotal;
    const blendedRpm = rpmDesktop * (1 - mobileShare) + rpmMobile * mobileShare;
    const impressions = rooms; // one per session
    const adMonthly = (impressions / days) * 30 * (blendedRpm / 1000);

    return {
      visitsNew, visitsReturn, rooms, roomsAdhoc, roomsTeam, roomsReentered,
      voters, facilitators, seats, estimates, firstVoteAgreements,
      desktop, mobile, mobileShare, pricingViews, signupsStarted, signupsDone,
      sessionBands, sessionsMeasured, avgMinutes,
      wtp, wtpAnswers, wtpDismissed, wtpPaying, wtpBlended,
      blendedRpm, adMonthly,
      roomSeries: dates.map((d) => ({
        date: d,
        value: (Number(data[d]?.room_created) || 0)
          + (Number(data[d]?.room_created_team) || 0)
          + (Number(data[d]?.team_room_reentered) || 0),
      })),
      visitSeries: series("visit_new"),
      tableBands: TABLE_BANDS.map((b) => ({ ...b, value: sum(b.key) })),
      deckBands: DECKS.map((b) => ({ ...b, value: sum(b.key) })),
      featureBands: FEATURES.map((b) => ({ ...b, value: sum(b.key) })),
      seatsPerRoom: rooms ? (seats / rooms) : null,
      estimatesPerRoom: rooms ? (estimates / rooms) : null,
      returnRate: pct(visitsReturn, visitsNew + visitsReturn),
      alignment: pct(firstVoteAgreements, estimates),
      signupConversion: pct(signupsDone, signupsStarted),
      exportRows: dates.map((d) => ({ date: d, ...(data[d] || {}) })),
    };
  }, [raw, dates, days, rpmDesktop, rpmMobile]);

  const downloadCsv = () => {
    const keys = Array.from(
      new Set(m.exportRows.flatMap((r) => Object.keys(r).filter((k) => k !== "date"))),
    ).sort();
    const cell = (v = "") => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["date", ...keys].map(cell).join(",")];
    m.exportRows.forEach((r) => {
      lines.push([r.date, ...keys.map((k) => r[k] ?? 0)].map(cell).join(","));
    });
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Brand on the filename only; the rows stay machine-clean so a spreadsheet
    // reads row 1 as the column names.
    a.download = `Point-Poker-analytics-${iso(Date.now())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (state === "denied") {
    return (
      <div className="dash-wrap pp-container">
        <Alert
          tone="danger"
          title="Dashboard is admin-only"
          className="dash-gate"
          actions={<Button onClick={onBack}>← Back to Point Poker</Button>}
        >
          {currentUser
            ? <>Signed in as <strong>{currentUser.email}</strong>, but this account is not an admin.
                Add its Firebase UID under <code>/admins/&lt;uid&gt;: true</code> in the Realtime
                Database console, then reload.</>
            : <>Sign in with the owner account to view usage analytics.</>}
        </Alert>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="dash-wrap pp-container">
        <EmptyState title="Loading analytics…">Reading the daily counters.</EmptyState>
      </div>
    );
  }

  // Plain-English readout. The whole point of the dashboard is the sentence,
  // not the numbers — a number without a decision attached is decoration.
  const verdictAds = m.rooms < 200
    ? { tone: "warn", text: `Not enough volume to judge. ${fmt(m.rooms)} sessions in ${days} days is far below what any ad network will meaningfully monetise. Revisit at 1,000+ sessions/month.` }
    : m.adMonthly < 50
      ? { tone: "warn", text: `At current volume ads would return roughly $${m.adMonthly.toFixed(0)}/month. That does not cover the trust cost — your ad-supported competitors are exactly the ones users complain about.` }
      : { tone: "good", text: `Ads could plausibly return around $${m.adMonthly.toFixed(0)}/month at current volume. Weigh against the churn risk before adding a tag.` };

  const verdictWtp = m.wtpAnswers < 20
    ? { tone: "warn", text: `Only ${fmt(m.wtpAnswers)} answers so far. Do not price on this yet — 30+ responses is the minimum before the shape means anything.` }
    : { tone: m.wtpPaying / m.wtpAnswers > 0.4 ? "good" : "warn",
        text: `${pct(m.wtpPaying, m.wtpAnswers)}% of ${fmt(m.wtpAnswers)} facilitators say they would pay something. Blended stated value is about $${(m.wtpBlended ?? 0).toFixed(1)}/month per team.` };

  return (
    <div className="dash-wrap pp-container">
      <header className="dash-head">
        <div>
          <Button size="sm" onClick={onBack}>← Point Poker</Button>
          <SectionHead
            align="start"
            as="h1"
            title="Usage & decisions"
            subtitle="Anonymous aggregate counters. No personal data is collected or shown here."
          />
        </div>
        <Row className="dash-head-actions">
          <SegmentedControl
            ariaLabel="Time window"
            value={days}
            onChange={setDays}
            options={WINDOWS.map((w) => ({ value: w.key, label: w.label }))}
          />
          <Button onClick={downloadCsv}><Icon name="copy" size={16} /> Raw CSV</Button>
        </Row>
      </header>

      <Grid min="200px" className="dash-kpis">
        <StatTile label="New visitors" value={fmt(m.visitsNew)} meta={`${fmt(m.visitsReturn)} returning`} />
        <StatTile label="Sessions run" value={fmt(m.rooms)} meta={`${fmt(m.roomsReentered)} were a team coming back`} />
        <StatTile label="Seats filled" value={fmt(m.seats)} meta={`${fmt(m.facilitators)} facilitators · ${fmt(m.voters)} voters`} />
        <StatTile
          label="Estimates recorded"
          value={fmt(m.estimates)}
          meta={m.estimatesPerRoom ? `${m.estimatesPerRoom.toFixed(1)} per session` : undefined}
        />
      </Grid>

      <Grid min="340px" className="dash-grid">
        <Panel
          title="Reach"
          hint="Is anyone using this? A flat line here means the SEO work has not landed yet, not that the product is wrong."
          wide
        >
          <Trend series={m.roomSeries} label="Sessions per day" />
          <Trend series={m.visitSeries} label="New visitors per day" />
        </Panel>

        <Panel
          title="Stickiness"
          hint="The number that decides whether this is a product or a novelty. A team that re-enters its Team Room has adopted it into a ritual."
        >
          <Grid min="140px" className="dash-stats">
            <StatTile label="Visits that are a return" value={m.returnRate == null ? null : `${m.returnRate}%`} empty="No visits yet" />
            <StatTile label="Team Room re-entries" value={fmt(m.roomsReentered)} />
            <StatTile label="People per session" value={m.seatsPerRoom ? m.seatsPerRoom.toFixed(1) : null} empty="No sessions yet" />
            <StatTile label="Average session length" value={m.avgMinutes ? `${Math.round(m.avgMinutes)}m` : null} empty="No sessions measured" />
          </Grid>
          <Bars rows={m.sessionBands} />
        </Panel>

        <Panel
          title="Who is at the table"
          hint="Table size is the input to any per-seat pricing model. If most sessions are 2–4 people, per-seat pricing is dead on arrival."
        >
          <Bars rows={m.tableBands} />
        </Panel>

        <Panel title="Device mix" hint="Ad rates and layout priorities both hinge on this.">
          <Bars rows={[
            { key: "desktop", label: "Desktop", value: m.desktop },
            { key: "mobile", label: "Mobile", value: m.mobile },
          ]} />
        </Panel>

        <Panel title="Deck preference" hint="Which estimation vocabulary teams actually reach for.">
          <Bars rows={m.deckBands} />
        </Panel>

        <Panel
          title="Feature pull"
          hint="What people use unprompted. Anything near zero is either undiscoverable or unwanted — find out which before building more."
        >
          <Bars rows={m.featureBands} />
        </Panel>

        <Panel
          title="Account funnel"
          hint="Accounts are only needed for Team Rooms and history. A low completion rate means the value of an account is not landing."
        >
          <Grid min="140px" className="dash-stats">
            <StatTile label="Pricing page views" value={fmt(m.pricingViews)} />
            <StatTile label="Sign-up started" value={fmt(m.signupsStarted)} />
            <StatTile label="Sign-up completed" value={fmt(m.signupsDone)} />
            <StatTile label="Completion rate" value={m.signupConversion == null ? null : `${m.signupConversion}%`} empty="No sign-ups started" />
          </Grid>
        </Panel>

        <Panel
          title="Estimation quality"
          hint="Share of estimates the whole table agreed on first vote. This is the product working, and it is the number worth putting in marketing once it is stable."
        >
          <Grid min="140px" className="dash-stats">
            <StatTile label="First-vote agreement" value={m.alignment == null ? null : `${m.alignment}%`} gold empty="No estimates recorded" />
            <StatTile label="Unanimous first votes" value={fmt(m.firstVoteAgreements)} />
          </Grid>
        </Panel>

        <Panel
          title="Should you run ads?"
          hint="One impression per session is the honest assumption for a single-page tool. Adjust the RPMs to match a real network quote rather than trusting the defaults."
          wide
        >
          <Grid min="150px" className="dash-inputs">
            <TextField
              label="Desktop RPM ($)"
              type="number"
              min="0"
              step="0.5"
              value={rpmDesktop}
              onChange={(e) => setRpmDesktop(Math.max(0, Number(e.target.value) || 0))}
            />
            <TextField
              label="Mobile RPM ($)"
              type="number"
              min="0"
              step="0.5"
              value={rpmMobile}
              onChange={(e) => setRpmMobile(Math.max(0, Number(e.target.value) || 0))}
            />
            <StatTile label="Sessions / month" value={fmt(Math.round((m.rooms / days) * 30))} />
            <StatTile label="Blended RPM" value={`$${m.blendedRpm.toFixed(2)}`} />
            <StatTile label="Ceiling / month" value={`$${m.adMonthly.toFixed(0)}`} gold />
          </Grid>
          <Alert tone={verdictAds.tone === "good" ? "success" : "warning"} className="dash-verdict">
            {verdictAds.text}
          </Alert>
        </Panel>

        <Panel
          title="What would they pay?"
          hint="Asked once per facilitator, only after they have recorded three or more estimates. Stated preference, so treat it as a ceiling and halve it."
          wide
        >
          <Bars rows={m.wtp.map((b) => ({ key: b.key, label: b.label, value: b.value }))} />
          <p className="dash-dismissed">{fmt(m.wtpDismissed)} dismissed without answering</p>
          <Alert tone={verdictWtp.tone === "good" ? "success" : "warning"} className="dash-verdict">
            {verdictWtp.text}
          </Alert>
        </Panel>
      </Grid>

      <p className="dash-foot">
        Counters are written client-side and can be under-counted by ad blockers or private browsing.
        Treat every figure as a floor, and trust week-on-week direction over any single day.
      </p>
    </div>
  );
}

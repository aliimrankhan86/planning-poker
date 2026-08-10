import { render, screen, within } from "@testing-library/react";
import AdminDashboard from "./AdminDashboard";

/* The dashboard's job is arithmetic that a business decision rests on.
   A screenshot cannot catch a wrong denominator; this can. */

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// jest.mock factories may only close over identifiers prefixed with `mock`.
let mockSnapshot = null;
let mockDenied = false;

jest.mock("./firebase", () => ({ db: {} }));
jest.mock("firebase/database", () => ({
  ref: jest.fn(),
  onValue: (_ref, ok, fail) => {
    if (mockDenied) fail(new Error("permission_denied"));
    else ok({ val: () => mockSnapshot });
    return () => {};
  },
}));

const renderWith = (data) => {
  mockSnapshot = data;
  mockDenied = false;
  return render(<AdminDashboard currentUser={{ email: "owner@example.com" }} onBack={() => {}} />);
};

// Panels are found by their heading so a layout change does not silently
// re-point an assertion at the wrong numbers.
const panel = (title) => screen.getByRole("heading", { name: title }).closest("section");

afterEach(() => { mockSnapshot = null; mockDenied = false; });

test("shows the admin gate when the read is denied", () => {
  mockDenied = true;
  render(<AdminDashboard currentUser={{ email: "nobody@example.com" }} onBack={() => {}} />);
  expect(screen.getByText(/not an admin/i)).toBeInTheDocument();
});

test("asks unauthenticated visitors to sign in rather than erroring", () => {
  render(<AdminDashboard currentUser={null} onBack={() => {}} />);
  expect(screen.getByText(/sign in with the owner account/i)).toBeInTheDocument();
});

test("headline KPIs sum every day in the window", () => {
  renderWith({
    [today]: { visit_new: 10, room_created: 4, joined_voter: 12, joined_facilitator: 3, estimate_recorded: 20 },
    [yesterday]: { visit_new: 5, room_created: 2, joined_voter: 6, joined_facilitator: 2, estimate_recorded: 10 },
  });
  const kpis = document.querySelectorAll(".dash-kpis .pp-stat__value");
  expect(kpis[0]).toHaveTextContent("15"); // visitors 10 + 5
  expect(kpis[1]).toHaveTextContent("6");  // sessions 4 + 2
  expect(kpis[2]).toHaveTextContent("23"); // seats (12+3) + (6+2)
  expect(kpis[3]).toHaveTextContent("30"); // estimates 20 + 10
});

test("sessions count ad-hoc rooms, new team rooms, and team re-entries", () => {
  renderWith({ [today]: { room_created: 3, room_created_team: 2, team_room_reentered: 5 } });
  expect(document.querySelectorAll(".dash-kpis .pp-stat__value")[1]).toHaveTextContent("10");
});

test("ad ceiling multiplies monthly sessions by the blended RPM", () => {
  // 30 sessions today only, over a 30-day window = 1 session/day = 30/month.
  // All desktop, so blended RPM is the $4.00 desktop default.
  // 30 impressions × $4.00 / 1000 = $0.12 → rounds to $0.
  renderWith({ [today]: { room_created: 30, device_desktop: 30 } });
  const ads = panel("Should you run ads?");
  expect(within(ads).getByText("$4.00")).toBeInTheDocument(); // blended RPM, all desktop
  expect(within(ads).getByText("30")).toBeInTheDocument();    // sessions per month
});

test("blended RPM shifts toward mobile as the device mix does", () => {
  renderWith({ [today]: { room_created: 10, device_desktop: 0, device_mobile: 10 } });
  const ads = panel("Should you run ads?");
  expect(within(ads).getByText("$2.00")).toBeInTheDocument(); // pure mobile default
});

test("ad verdict refuses to encourage ads on thin volume", () => {
  renderWith({ [today]: { room_created: 12, device_desktop: 12 } });
  expect(screen.getByText(/Not enough volume to judge/i)).toBeInTheDocument();
});

test("willingness-to-pay verdict withholds a conclusion under 20 answers", () => {
  renderWith({ [today]: { wtp_zero: 3, wtp_5: 2 } });
  expect(screen.getByText(/Do not price on this yet/i)).toBeInTheDocument();
});

test("willingness-to-pay blends band midpoints across all answers", () => {
  // 10 × $0, 10 × $5, 10 × $12, 10 × $22 → mean $9.75, 75% would pay something.
  renderWith({ [today]: { wtp_zero: 10, wtp_5: 10, wtp_15: 10, wtp_30: 10 } });
  expect(screen.getByText(/75% of 40 facilitators/i)).toBeInTheDocument();
  expect(screen.getByText(/\$9\.8\/month per team/i)).toBeInTheDocument();
});

test("rates divide by the right denominator", () => {
  renderWith({
    [today]: {
      visit_new: 30, visit_return: 10,          // 25% of visits are returns
      estimate_recorded: 40, consensus_first_vote: 30, // 75% first-vote agreement
      signup_started: 20, signup_completed: 5,  // 25% completion
    },
  });
  expect(within(panel("Stickiness")).getByText("25%")).toBeInTheDocument();
  expect(within(panel("Estimation quality")).getByText("75%")).toBeInTheDocument();
  expect(within(panel("Account funnel")).getByText("25%")).toBeInTheDocument();
});

test("an empty database renders zeroes rather than NaN or crashing", () => {
  renderWith(null);
  document.querySelectorAll(".dash-kpis .pp-stat__value").forEach((el) => {
    expect(el.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });
  document.querySelectorAll(".ad-stats span, .ad-calc span").forEach((el) => {
    expect(el.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });
});

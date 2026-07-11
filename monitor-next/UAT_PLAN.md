# WISING Monitor — UAT Plan

User Acceptance Testing for the **cross-border tax exposure Monitor** dashboard
(`monitor-next`). This is the acceptance gate: business users (a tax professional
and a product owner) confirm the dashboard behaves per spec against a **frozen
demo dataset** before the build is accepted.

> Scope note: this covers the Monitor dashboard only (map, KPI categories, dynamic
> tables, alerts). The Layer 0/1/2 intake + conflict engine in the repo root is a
> separate acceptance track.

---

## 1. Environments & access

| Environment | Purpose | How testers reach it |
|---|---|---|
| **Hosted preview** | Click-through UAT, no install | Artifact URL (self-contained, frozen data) — shared by the product owner |
| **Local build** | Full Next.js app + geographic choropleth | `cd monitor-next && npm ci && npm run dev` → http://localhost:3000 |

**Build under test:** branch `claude/previous-session-memory-p4vb3m`, commit recorded on the sign-off sheet.
UAT runs against **frozen mock data** (`lib/mockData.js`) — no live connectors — so every
tester sees identical results and any defect maps to one exact version.

## 2. Frozen test dataset (the expected truth)

Testers should verify against these known values. Exposure is driven by **residency**
(days present vs the residency test) and **reporting** (a statutory money threshold),
using the thresholds in `engine/constants.js`.

**World (4 jurisdictions)**

| Jurisdiction | Taxable? | Resident? | Reporting metric | Expected status |
|---|---|---|---|---|
| 🇮🇳 India | Yes | Yes (215/182 days) | LRS $268k / $250k | **Exposed** (est. liability $68,400) |
| 🇺🇸 United States | No (FTC zeroes US tax) | Yes (240/183 SPT) | FBAR $128k / $10k | **Nexus Triggered** ($0 net) |
| 🇬🇧 United Kingdom | Yes | No (128/183 SRT) | UK income $41k / $90k | **Approaching** (70% → alert) |
| 🇦🇪 United Arab Emirates | No (no income tax) | Yes (196/183) | — | **Nexus Triggered** ($0) |

World KPI totals: **Exposed 1 · Approaching 1 · Nexus 2 · All 4**, total est. liability **$68,400**.

**US states (drill-down, 10)** — state *individual income tax*

| Status | States |
|---|---|
| **Exposed** (2) | California ($74,500), Illinois ($41,200) |
| **Approaching** (5) | New York, New Jersey, Massachusetts, Georgia, Colorado |
| **Nexus Triggered** (3) | Texas, Florida, Washington (no state income tax → $0) |

US-states KPI totals: **Exposed 2 · Approaching 5 · Nexus 3 · All 10**, total est. liability **$115,700**.

## 3. Roles

| Role | Who | Responsibility |
|---|---|---|
| UAT lead | Product owner | Owns this plan, triages defects, calls the go/no-go |
| Business tester | Tax professional | Executes cases, judges tax-logic correctness |
| Developer on call | Engineering | Fixes Critical/High defects, redeploys the UAT build |

## 4. Entry / exit criteria

**Entry (all must hold before UAT starts)**
- Build deployed to the UAT preview and the local build both launch without errors.
- Frozen dataset loaded; console shows the automated-alert log line on load.
- This plan and the defect log are shared with testers.

**Exit (all must hold to accept)**
- 100% of **Critical** and **High** cases **Pass**.
- No open Critical or High defect.
- Medium/Low defects are logged with an agreed disposition (fix-now or backlog).
- UAT lead signs Section 7.

## 5. Test cases

Priority: **C** = Critical (blocks acceptance), **H** = High, **M** = Medium.
Record Pass/Fail and a defect ID for any failure.

### A. Layout & navigation
| ID | Pri | Steps | Expected result | P/F |
|---|---|---|---|---|
| TC-01 | M | Load the dashboard | Left sidebar shows logo (WISING / Exposure Monitor), 7 main links (Monitor active), 3 footer links, and the user card "Aarav Sharma / Wising Inc." | |
| TC-02 | M | Read the header | Title **Monitor**, subtitle "Keep track of your cross-border tax exposure around the world", region dropdown top-right | |
| TC-03 | M | Read the data-source strip | Two live sources: **Plaid · Bank/brokerage feed** and **Travel log · Immigration/day-count** (not Stripe/Deel) | |

### B. Map visualization
| ID | Pri | Steps | Expected result | P/F |
|---|---|---|---|---|
| TC-04 | H | Inspect the world map | India = red (Exposed), UK = amber (Approaching), US & UAE = purple (Nexus); untracked countries neutral gray | |
| TC-05 | C | Confirm US colour | The United States renders **purple (Nexus)**, NOT red — verifies FTC zeroes the US tax so filings are owed but $0 liability | |
| TC-06 | H | Hover a tracked country | Tooltip shows the country name and its status label | |
| TC-07 | H | Click the United States | Map drills into a US-states choropleth; a "← Back to world" control appears | |
| TC-08 | H | In the states view, check no-tax states | Texas, Florida, Washington render **purple (Nexus)** — presence established but $0 state income tax | |
| TC-09 | M | Click "← Back to world" | Returns to the world map; dropdown resets to "All" | |

### C. KPI category cards
| ID | Pri | Steps | Expected result | P/F |
|---|---|---|---|---|
| TC-10 | C | Read the four cards (world view) | Exposed **1**, Approaching Exposure **1**, Nexus Triggered **2**, All Jurisdictions **4** | |
| TC-11 | H | Read the Exposed card detail | Shows total est. liability **$68,400** | |
| TC-12 | H | Click each card | The card highlights as active and the table below filters to that category | |
| TC-13 | H | Drill into the US, re-read cards | Exposed **2**, Approaching **5**, Nexus **3**, All **10**; liability **$115,700** | |

### D. Dynamic detail table (columns change per card)
| ID | Pri | Steps | Expected result | P/F |
|---|---|---|---|---|
| TC-14 | C | Select **Exposed** | Columns: Jurisdiction, Status (badge), Estimated Liability, Trigger Date, Income in Scope. India row: $68,400 · 2025-08-14 · $342,000 | |
| TC-15 | C | Select **Approaching Exposure** | Columns: Jurisdiction, Tracker (% bar), Reporting ($ current/limit), Presence (days current/threshold), Tax Resident. UK shows **70%** with a ⚠ alert marker, 128/183 days, Resident = No | |
| TC-16 | C | Select **Nexus Triggered** | Columns: Jurisdiction, Trigger Date, Income in Scope, Reporting owed, Tax Resident. US row shows "FBAR aggregate (FinCEN 114)" as reporting owed, Resident = Yes | |
| TC-17 | H | Every view | A flag (country) or state abbreviation appears next to each jurisdiction name | |
| TC-18 | M | Filter to a category with no members (e.g. after scoping) | Table shows an empty-state message, not a broken table | |

### E. Automated alerts
| ID | Pri | Steps | Expected result | P/F |
|---|---|---|---|---|
| TC-19 | C | Load with default data | An alerts banner reads "⚠️ United Kingdom is at 70% of its residency / reporting threshold" (UK > 60% but not yet resident) | |
| TC-20 | H | Open the browser console on load | A `[WISING alert:warning]` notification line is logged (the mock email/Slack hook fired) | |

### F. Region filter (dropdown)
| ID | Pri | Steps | Expected result | P/F |
|---|---|---|---|---|
| TC-21 | H | Choose **Asia** | Map/table scope to India only; KPI counts recompute (Exposed 1, rest 0) | |
| TC-22 | H | Choose **Europe** / **Middle East** | Scope to UK / UAE respectively; counts recompute correctly | |
| TC-23 | M | Choose **United States (drill to states)** | Enters the state-level view (same as clicking the US) | |

### G. Business-logic correctness (the tax rules UAT exists to catch)
| ID | Pri | Steps | Expected result | P/F |
|---|---|---|---|---|
| TC-24 | C | Reason about India | Taxable **and** threshold crossed ⇒ Exposed with a non-zero liability | |
| TC-25 | C | Reason about UAE / no-tax states | Threshold crossed **but not taxable** ⇒ Nexus Triggered, liability **$0** | |
| TC-26 | C | Reason about UK | Taxable jurisdiction, residency **not yet** established ⇒ Approaching, liability $0 | |
| TC-27 | H | Cross-check totals | Sum of category counts = All; sum of row liabilities = the Exposed-card total | |

## 6. Defect log

| ID | TC | Severity | Summary | Steps to reproduce | Expected | Actual | Status |
|----|----|----------|---------|--------------------|----------|--------|--------|
| D-001 | | | | | | | Open |

Severity: **Critical** (blocks a core workflow / wrong tax classification) · **High** (major, workaround exists) ·
**Medium** (cosmetic/minor) · **Low** (nice-to-have).

## 7. Sign-off

| Field | Value |
|---|---|
| Build / commit under test | |
| UAT window (start – end) | |
| Cases executed / passed | |
| Open Critical / High defects | |
| Decision | ☐ Accepted ☐ Accepted with conditions ☐ Rejected |
| UAT lead (name / date) | |
| Business tester (name / date) | |

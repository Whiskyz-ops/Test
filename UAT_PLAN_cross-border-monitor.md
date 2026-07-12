# WISING Cross-Border Monitor — UAT Plan

User Acceptance Testing for the **Cross-Border Monitor** — the engine-driven,
9-view tax-advisor application in `monitor-next/`.

> **Target build:** the `monitor-next` app on branch
> **`claude/india-us-tax-conflict-prototype-wpz0kl`** (the full, engine-wired
> version — *not* the simpler re-skin on `claude/previous-session-memory-p4vb3m`).
> Check out that branch before running UAT.

This is the acceptance gate: a tax professional confirms the app computes and
presents each India⇄US taxpayer correctly across every view, against a **frozen
set of 9 test profiles**, before the build is accepted.

---

## 1. What this app is (scope)

A single-page dashboard for a cross-border tax advisor (persona in the sidebar:
*Priya Menon · Verité Tax Advisors*). It runs the shared WISING engine
(`lib/engine/*`) over a taxpayer's Layer 1 intake data and renders **9 views**:

| # | View (sidebar) | What it shows |
|---|---|---|
| 1 | **Monitor** | Exposure world/US map, KPI category cards, dynamic detail table, automated alerts, Conflicts & Mismatches, Residency & Reporting-limit meters |
| 2 | **Clients** | Portfolio table across all profiles — residency, combined tax, residual double tax, conflicts, health score, next filing |
| 3 | **Residency** | India/US residency flags, day-counters, DTAA treaty position, residency/treaty conflicts |
| 4 | **Filings** | Compliance calendar, FTC Reconciliation, Tax Computation, Cross-Basis Reconciliation, FY↔CY apportionment |
| 5 | **Documents** | Documents to file, triggered by the taxpayer's facts (jurisdiction-tagged) |
| 6 | **Holdings** | Income by head (IN/US), securities & funds (PFIC), entities, property, retirement |
| 7 | **Business** | Business/entities with US treatment — SE tax, QBI, C-Corp, CFC/GILTI |
| 8 | **Accounts** | Reporting limits (FBAR/8938/LRS/FEIE) + foreign accounts |
| 9 | **Integrations** | Connected data sources (Trip Log, Plaid, Payroll/AIS, brokerage, MCA/ITR, DocuSign) |

Data is **engine-computed** for the India/US country rows (residency days, FBAR/LRS,
estimated tax, income exposed) via `lib/wising.js`. Two modes: **Demo** (built-in
sample taxpayer) and **Live** (reads the Layer 1 forms' `localStorage`). US **state**
residency (on the map drill-down) is illustrative mock data.

## 2. Environments & access

| Environment | Purpose | How |
|---|---|---|
| **Local build** | Full UAT with dev tools | `git checkout claude/india-us-tax-conflict-prototype-wpz0kl` → `cd monitor-next && npm install && npm run dev` → http://localhost:3000 |
| **Static/hosted** | Click-through for a remote tester | `npm run build` produces a static export in `monitor-next/out/` (per root `vercel.json`); deploy to Vercel or serve `out/` on any static host |

Notes:
- `predev`/`prebuild` auto-run `embed-font.js`, `sync-engine.js` (copies the root
  `engine/*` into `lib/engine/` — single source of truth), and `build-docs.js`.
- Node + npm required. First `npm install` pulls `react-simple-maps`, `world-atlas`,
  `us-atlas`, `lucide-react`, fonts.
- UAT runs against the **frozen 9 profiles** below — no live external connectors —
  so every tester sees identical results and any defect maps to one exact version
  (record the commit SHA on the sign-off sheet).

## 3. Frozen test dataset — the 9 profiles

Loaded from the **"Load test profile…"** dropdown on the Monitor utility bar. Each
seeds a complete `{router, india, us}` bundle, so the whole app populates from it.
The tester should confirm the app produces the right story for each:

| Profile (dropdown label) | Type | Key things it must exercise |
|---|---|---|
| **Dual Resident — H-1B** (Aarav Sharma) | Individual | Dual residency (India ROR + US SPT), DTAA Art. 4 tie-breaker, FTC shortfall, ISO→AMT, ESOP equity-comp sourcing, NIIT, PFIC on Indian MFs, Schedule FA inconsistency, carried-forward STCG loss |
| **US Resident · Indian income** (Rohan Mehta) | Individual | Green-card worldwide, Form 1116 FTC, PFIC, FBAR/8938, US self-employment tax (no US-India totalization), tips/overtime deductions (OBBBA), **FEIE claimed but ineligible** (must be flagged), 115BBE unexplained cash |
| **India ROR · US income** (Anita Desai) | Individual | ROR worldwide, Form 67/§90 relief, Schedule FA, files 1040-NR, FIRPTA withholding, W-8BEN missing, Chapter XII-A retained election, LTCG §112A exemption slice |
| **Founder · Indian company** (Vikram Rao) | Individual | CFC/GILTI/Form 5471, share buyback (s.69 LTCG @12.5% + promoter surcharge), **holding-period characterization mismatch** (IN 24-mo vs US 12-mo), Child Tax Credit, Trump Account cap breach |
| **US Citizen expat in India** (Grace Thomas) | Individual | Citizenship-based taxation, FEIE (bona-fide residence), PFIC, FBAR, covered-expatriate gift → Form 3520 + §2801, senior deduction |
| **Indian Pvt Ltd (company)** (Nimbus Analytics) | Business | Corporate tax §115BAA 22%, MAT check, ITR-6 — business profits, no salary/retirement |
| **US C-Corp + Indian sub** (Cloudspire) | Business | US C-Corp Form 1120 21% + Indian Pvt Ltd sub ITR-6, GILTI, cross-border structure |
| **Foreign Holdco · POEM in India** (Meridian) | Business | Entity residency by Place of Effective Management (s.6(3)); entity-level dual residency |
| **Sharma HUF** | Business | HUF control-and-management residency test, no individual §156 rebate, PAN–Aadhaar unlinked |

On first load (no profile chosen) the app runs the **Demo** sample taxpayer (Aarav
Sharma) — the badge reads **Demo**.

## 4. Roles

| Role | Who | Responsibility |
|---|---|---|
| UAT lead | Product owner | Owns this plan, triages defects, calls go/no-go |
| Business tester | Tax professional | Executes cases; judges tax-computation & conflict correctness |
| Developer on call | Engineering | Fixes Critical/High defects, redeploys the UAT build |

## 5. Entry / exit criteria

**Entry**
- Correct branch checked out; `npm run dev` and `npm run build` both succeed with no errors.
- App loads at localhost:3000 (or the hosted export); the Demo badge shows on first load.
- Console shows the automated-alert log line when a taxpayer approaches a threshold.
- This plan + defect log shared with testers.

**Exit**
- 100% of **Critical** and **High** cases **Pass**.
- No open Critical or High defect.
- Medium/Low defects logged with an agreed disposition.
- UAT lead signs Section 9.

## 6. Test cases

Priority: **C** = Critical (blocks acceptance), **H** = High, **M** = Medium.
Record Pass/Fail + a defect ID for any failure. Run Section A–B once, then the
per-view sections against the profiles noted.

### A. App shell & navigation
| ID | Pri | Steps | Expected | P/F |
|---|---|---|---|---|
| A1 | M | Load the app | Sidebar shows WISING logo, 9 nav items (Monitor active), the "Engine online · syncing Layer 1" line, 3 footer links, and the user card *Priya Menon / Verité Tax Advisors* | |
| A2 | M | Read the header | Title **Cross-Border Monitor**; subtitle = active client name · tax period (e.g. *Aarav Sharma · TY2026-27 (India) / TY2026 (US)*); Settings button + region dropdown | |
| A3 | H | Click each of the 9 nav items | Each view renders without error; the active item is highlighted (emerald→blue gradient) | |
| A4 | H | Observe sidebar badges | Monitor shows a conflicts count (alert-toned if any critical); Clients shows the profile count; Documents shows required-doc count; Filings shows next-deadline countdown | |

### B. Data modes & profiles (engine integration)
| ID | Pri | Steps | Expected | P/F |
|---|---|---|---|---|
| B1 | C | On load, read the mode pill | Badge reads **Demo** (engine ran the sample taxpayer); it is green/"online", not stuck on "Loading…" | |
| B2 | C | Open "Load test profile…" and pick each of the 9 | Header client name + every view updates to that taxpayer; the active profile persists in the dropdown | |
| B3 | H | Load a profile, then click **↻ Refresh** | Re-runs the engine; no error; values unchanged for the same data | |
| B4 | H | Open a Layer 1 link (Router / India / US) in a new tab, change a field, save, return | On focus/storage the Monitor auto-recomputes and the badge flips to **Live** | |
| B5 | M | Load a **Business** profile (e.g. Indian Pvt Ltd) | Residency-day meters are suppressed (entities have no "days present"); reporting/limit meters lead instead | |

### C. Monitor view
| ID | Pri | Steps | Expected | P/F |
|---|---|---|---|---|
| C1 | H | Inspect the exposure map (Demo/Aarav) | India and the US are colour-coded by status; untracked countries are neutral; a legend is shown | |
| C2 | H | Click the United States (or pick it in the dropdown) | Drills into a US-states choropleth; a "Back to world" control returns | |
| C3 | C | Read the 4 KPI cards | Titles: **Exposed**, **Approaching**, **Filing-only**, **All Jurisdictions**; Exposed shows "Est. tax $X" when tax > 0; clicking a card filters the table | |
| C4 | C | Select **Exposed** | Table columns: Region, Status, **Estimated Tax**, **Resident Since**, **Income Exposed** | |
| C5 | C | Select **Approaching** | Columns: Region, **Tracker** (% bar; ⚠ alert ≥60%), **Days Present** (n/threshold), **Reporting Exposure** ($ value/limit + label), **Physical Presence** | |
| C6 | C | Select **Filing-only** | Columns: Region, **Triggered**, **Reason ($0 tax)**, **Days Present**, **Physical Presence** | |
| C7 | H | Read the alerts banner (a profile that's approaching, e.g. one with a country 60–99% to threshold) | Banner lists "N automated alert(s)"; each names the region and the driver (residency days or reporting limit) | |
| C8 | H | Scroll to **Conflicts & Mismatches** | Findings list with severity chips (Critical/Warning/Info) and counts; filter chips work; a row expands to detail + **Action** + statute refs | |
| C9 | H | Scroll to **Residency & Reporting Limits** | StatMeter cards: residency day-budgets (individuals) + FBAR/8938/LRS/FEIE limits, each with a segmented bar and an "at current pace" projection tick | |

### D. Clients view
| ID | Pri | Steps | Expected | P/F |
|---|---|---|---|---|
| D1 | H | Open **Clients** | 5 stat tiles (Clients=9, At risk, Open critical, Combined tax, Residual double tax) + a table of all 9 profiles | |
| D2 | H | Read a row | Columns: Client (label + story), Type (Individual/Business), Residency (india/us status, DUAL flag if dual), Combined tax, Residual, Conflicts (critical·warning), Health bar+score, Next filing | |
| D3 | H | Click a client row | Loads that profile and navigates to the Monitor for that client | |
| D4 | M | Check sort | Rows sort by health score ascending (most at-risk first) | |

### E. Residency view
| ID | Pri | Steps | Expected | P/F |
|---|---|---|---|---|
| E1 | C | Load **Dual Resident — H-1B**, open Residency | A red **Dual tax residency** banner shows (resolve DTAA Art. 4 tie-breaker) | |
| E2 | H | Read the India/US residency flags | Each shows status + "Worldwide income taxed" vs "Source-income only" (+ citizen where applicable) | |
| E3 | H | Read Day-Counters | India + US day-counters with segmented bars and projected-flip labels | |
| E4 | H | Read DTAA Treaty Position | Rows for Art. 4 tie-breaker, TRC, Form 10F, PE in India, 1040-NR — each with an On file/Missing/Filed state matching the profile | |
| E5 | H | Load **US Resident · Indian income**, re-check | Not dual-resident (India NR); treaty rows reflect the missing TRC/Form 10F | |

### F. Filings view
| ID | Pri | Steps | Expected | P/F |
|---|---|---|---|---|
| F1 | H | Open **Filings** | Compliance calendar lists India + US deadlines with countdowns; overdue items are dimmed; jurisdiction tags (IN/US) present | |
| F2 | C | Read **FTC Reconciliation** | "Net unrelieved double tax" headline (red if > 0, green if 0); both directions (US-claims-India credit, India §90 relief) itemised | |
| F3 | C | Read **Tax Computation** | India block (₹, with ≈USD) + US block (USD), each with an effective-rate chip | |
| F4 | H | Click a Tax Computation / FTC row | A trace popup opens in place — **Source** (from Layer 1) or **Calculated** (formula + parts); rows marked ↗ jump to Holdings | |
| F5 | H | Read **Cross-Basis Reconciliation** | Table of the same income under India vs US law with a doubly-taxed column + total overlap; capsule chart renders above it | |
| F6 | M | Read **FY↔CY Apportionment** | Indian FY split across US calendar years both directions (feeds Form 67 / Form 1116) | |

### G. Documents view
| ID | Pri | Steps | Expected | P/F |
|---|---|---|---|---|
| G1 | H | Open **Documents** for a rich profile (Dual Resident) | "Documents to File" — required docs first with jurisdiction tag + reason; N/A docs dimmed; required count matches the sidebar badge | |
| G2 | H | Load **Founder · Indian company**, re-check | Form 5471 (and CFC/GILTI-related docs) appear as required | |

### H. Holdings view
| ID | Pri | Steps | Expected | P/F |
|---|---|---|---|---|
| H1 | H | Open **Holdings** (Dual Resident) | 4 stat tiles (securities, property rent, bank peak, retirement); India income-by-head and US income-by-head cards with totals | |
| H2 | C | Check **Securities & Funds** | Indian mutual funds held by a US person are tagged **PFIC · 8621** | |
| H3 | H | Load **Founder · Indian company**, check entities | Foreign corporation appears with **CFC · 5471** tag + GILTI inclusion | |
| H4 | M | From Filings, click a ↗ (holdings-linked) row | Navigates to Holdings and scroll-highlights the India or US income card | |

### I. Business view
| ID | Pri | Steps | Expected | P/F |
|---|---|---|---|---|
| I1 | H | Open **Business** for an individual with no entities | Empty-state message (no Schedule C / K-1 / corporate income) | |
| I2 | H | Load **US C-Corp + Indian sub**, open Business | Stat tiles (business income, SE tax, QBI, CFC count); US + Indian entity lists with C-Corp 21% / CFC·5471 tags; "how taxed" explainer | |

### J. Accounts view
| ID | Pri | Steps | Expected | P/F |
|---|---|---|---|---|
| J1 | C | Open **Accounts** (Dual Resident) | Reporting Limits: FBAR / 8938 / LRS / FEIE segmented bars with % and limit; a breached limit shows a **BREACHED** tag | |
| J2 | H | Read Foreign Accounts | Lists each foreign account with type, country flag, peak USD balance | |

### K. Integrations view
| ID | Pri | Steps | Expected | P/F |
|---|---|---|---|---|
| K1 | M | Open **Integrations** | 6 data sources; Trip Log / Plaid / Payroll·AIS / Brokerage = Connected; MCA·ITR / DocuSign = Connect | |

### L. Cross-view consistency & tax-logic correctness (what UAT exists to catch)
| ID | Pri | Steps | Expected | P/F |
|---|---|---|---|---|
| L1 | C | Compare Monitor "Estimated Tax" vs Filings "Tax Computation" total for the same client | They reconcile (same engine result feeds both) | |
| L2 | C | Compare Monitor conflicts count vs the sidebar Monitor badge vs the Conflicts panel | All three agree | |
| L3 | C | **US Resident · Indian income**: verify the FEIE error | A conflict flags "FEIE claimed but not eligible" (US green-card holder, 365 US days) and the exclusion is zeroed | |
| L4 | C | **Dual Resident — H-1B**: DTAA + FTC | Dual-residency conflict raised; FTC reconciliation shows a residual double-tax figure; treaty tie-breaker recorded (US) | |
| L5 | H | **India ROR · US income**: NR-in-US path | Files 1040-NR; FIRPTA + W-8BEN-missing conflicts raised; Schedule FA required for US assets | |
| L6 | H | **Business** profiles vs **Individual** profiles | Business profiles show entity/corporate treatment (ITR-6/1120/POEM/HUF) and suppress personal residency-day budgets | |

## 7. US-state drill — exact expected values (deterministic mock)

The state drill-down uses fixed mock data, so these are exact. Drill into the US and
click each KPI card:

| Category (KPI card) | States | Count |
|---|---|---|
| **Exposed** | California ($18,500), Illinois ($9,200) | 2 |
| **Approaching** | New York, New Jersey, Colorado, Massachusetts, Georgia | 5 |
| **Filing-only** | Texas, Florida, Washington (no state income tax → $0) | 3 |
| **All** | (all above) | 10 |

- Exposed card "Est. tax" total across states = **$27,700**.
- Texas/Florida/Washington must render as **Filing-only** with a "no state income tax"
  reason and Physical Presence = Yes (except WA, No) — verifies the $0-tax branch.
- New York shows Physical Presence = Yes but sits in **Approaching** (160/183 days) —
  confirms residency-day breach is separate from the presence flag.

## 8. Defect log

| ID | TC | Severity | Summary | Steps to reproduce | Expected | Actual | Status |
|----|----|----------|---------|--------------------|----------|--------|--------|
| D-001 | | | | | | | Open |

Severity: **Critical** (wrong tax result / blocks a view) · **High** (major, workaround
exists) · **Medium** (cosmetic/minor) · **Low** (nice-to-have).

## 9. Sign-off

| Field | Value |
|---|---|
| Branch / commit under test | |
| UAT window (start – end) | |
| Cases executed / passed | |
| Open Critical / High defects | |
| Decision | ☐ Accepted ☐ Accepted with conditions ☐ Rejected |
| UAT lead (name / date) | |
| Business tester (name / date) | |

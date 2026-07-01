# WISING — Monitor (Next.js exposure dashboard)

A Sphere-style **cross-border tax exposure monitoring** dashboard, skinned with
**income-tax semantics** (not sales-tax nexus). A world choropleth lights the
tracked jurisdictions (India, US, UK, UAE), a dropdown drills from the **United
States into state income-tax** exposure, clickable KPI category cards switch the
detail table's columns, and automated residency/reporting alerts fire. Built to
the provided spec, re-skinned for WISING's India ⇄ US individual product.

> Sibling to the vanilla Layer 2 prototype in the repo root. This is the
> **product-architecture** version (build + deploy); the root prototype stays the
> zero-build offline demo.

## Stack
Next.js 14 (App Router) · React 18 · Tailwind CSS · **react-simple-maps** (with
`world-atlas` + `us-atlas` topojson bundled locally, so the maps work offline).

## Run
```bash
cd monitor-next
npm install
npm run dev      # http://localhost:3000
# production: npm run build && npm start
```

## What it does
- **World map** — tracked jurisdictions (India, US, UK, UAE) are colour-coded by
  status. Click the US (or pick "United States" in the header dropdown) to **drill
  into a US-states choropleth**. "Back to world" returns.
- **Dropdown** — All · Asia · Europe · Middle East · **United States (drill to
  states)** · India.
- **KPI cards** (click to filter the table):
  - **Exposed** (red) — tax resident/threshold crossed **and** the jurisdiction
    levies income tax; liability accruing.
  - **Approaching** (amber) — taxable if resident, but residency / reporting
    threshold **not** yet hit.
  - **Nexus Triggered** (purple) — threshold crossed but **$0 tax**: FBAR/8938
    informational filings, or a no-income-tax state / UAE. Obligation without liability.
  - **All Jurisdictions** (gray) — total tracked.
- **Dynamic table** — columns change per selected card (Exposed → liability /
  trigger date / income in scope; Approaching → progress tracker, reporting $ vs
  limit, presence days vs residency test, tax-resident flag; Nexus → trigger date,
  income in scope, reporting owed, tax-resident flag). Flag/abbr next to every
  jurisdiction.
- **Automated alerts** (`lib/logic.js`):
  - `approachingAlerts()` fires when a taxable jurisdiction passes **60%** of its
    residency / reporting threshold.
  - `transitionAlerts()` fires when a jurisdiction newly becomes **Exposed**.
  - `sendNotification()` is the mock email/Slack hook.

## Income-tax semantics (this re-skin)
Instead of Stripe sales volume + product taxability, exposure is driven by:
- **Residency** — days present vs the residency test (US Substantial Presence ≥183
  weighted · India ≥182 · UK SRT · state ≥183-day). Source: a travel / immigration
  day-log. Replaces "physical presence".
- **Reporting** — a binding statutory money threshold per jurisdiction: **FBAR**
  $10k · **Form 8938** · **LRS** $250k · **state-source income**. Source: a bank /
  brokerage aggregator (Plaid-style). Replaces "transaction volume".
- **Taxable** — whether the jurisdiction levies **net** income tax after DTAA/FTC.
  The US is resident here but foreign tax credits zero out the US tax → it lands in
  **Nexus Triggered** (mandatory FBAR/8938/1040, $0 net tax) — the truthful analog
  of the spec's "breached but not taxable".

Thresholds mirror `engine/constants.js` (`LIMITS`) so the demo is truthful.

## Architecture
```
app/page.jsx          state (dropdown scope, active KPI category), composition
app/layout.jsx        root + globals
components/Sidebar     logo · nav · footer · user card
components/Header      title + jurisdiction dropdown
components/WorldMap    react-simple-maps world choropleth (+ legend)
components/UsStatesMap react-simple-maps US-states choropleth (drill-down)
components/KpiCards    clickable category summary cards
components/DetailTable column set switches by category
lib/mockData.js        financial feed (Plaid) + presence log mock: countries + US states
lib/logic.js           classify / KPIs / choropleth lookup / ALERT utilities
```

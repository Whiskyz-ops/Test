# WISING — Monitor (Next.js exposure dashboard)

A Sphere-style **regional exposure monitoring** dashboard: a world choropleth
(India + US lit), a dropdown to drill from the **United States into state-level**
exposure, clickable KPI category cards that switch the detail table's columns, and
automated threshold alerts. Built to the provided spec.

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
- **World map** — only tracked regions (India, US) are colour-coded by status.
  Click the US (or pick "United States" in the header dropdown) to **drill into a
  US-states choropleth**. "Back to world" returns.
- **Dropdown** — All · Asia · Canada · Europe · Latin America · **United States
  (drill to states)** · India.
- **KPI cards** (click to filter the table):
  - **Exposed** (red) — taxable **and** threshold breached; liability accruing.
  - **Approaching** (amber) — taxable, threshold **not** yet hit.
  - **Nexus Triggered** (purple) — threshold breached but **not** taxable ($0 liability).
  - **All Regions** (gray) — total tracked.
- **Dynamic table** — columns change per selected card (Exposed → liability/trigger/volume;
  Approaching → progress tracker, volume $ & # vs limits, physical presence;
  Nexus → trigger date, volume, physical presence). Flag/abbr next to every region.
- **Automated alerts** (`lib/logic.js`):
  - `approachingAlerts()` fires when a taxable region passes **60%** of its threshold.
  - `transitionAlerts()` fires when a region newly becomes **Exposed**.
  - `sendNotification()` is the mock email/Slack hook.

## Architecture
```
app/page.jsx          state (dropdown scope, active KPI category), composition
app/layout.jsx        root + globals
components/Sidebar     logo · nav · footer · user card
components/Header      title + region dropdown
components/WorldMap    react-simple-maps world choropleth (+ legend)
components/UsStatesMap react-simple-maps US-states choropleth (drill-down)
components/KpiCards    clickable category summary cards
components/DetailTable column set switches by category
lib/mockData.js        billing (Stripe) + HR (Deel) mock: countries + US states
lib/logic.js           classify / KPIs / choropleth lookup / ALERT utilities
```

## Adapting to individual India-US tax
The spec's semantics are sales-tax nexus (product taxability, transaction volume).
For your income-tax product these map to: **residency day-thresholds** (SPT 183 /
India 182), **reporting thresholds** (FBAR / 8938 / LRS), and **physical presence
= days in country**. Swap the `economic` block in `mockData.js` for those metrics
and the same UI/logic carries over.

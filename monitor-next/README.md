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

## Wired to the shared engine (Layer 1 → Monitor)
The India + US country rows are **computed by the shared engine** (`engine/*.js` at
the repo root), not mocked:

- `scripts/sync-engine.js` (runs on `predev`/`prebuild`) copies the root engine
  into `lib/engine/` so there's a single source of truth.
- `lib/wising.js` imports the engine and maps `WISING.analyze()` →
  `WISING.monitor()` output onto the Monitor's region rows (residency days,
  FBAR/LRS reporting, estimated tax, income exposed).
- The **Layer 1 intake forms** (`public/router.html`, `layer1_india.html`,
  `layer1_us.html`) are served **same-origin**, so filling them writes the
  `wising_*` localStorage keys that the Monitor reads. Use **Refresh from Layer 1**
  (or it auto-refreshes on focus / storage events). **Load demo taxpayer** runs the
  engine on the built-in sample.

The badge shows `LIVE · engine` (reading your Layer 1 data) or `DEMO · engine`.

### Still mock
**US state-level** residency (CA/NY/TX…) remains illustrative — the engine computes
country-level India/US + a US residency day-counter, but not per-state residency yet.
That's the next engine extension.

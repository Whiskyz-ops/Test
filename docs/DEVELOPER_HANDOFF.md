# WISING — Developer Handoff & Integration Guide

This is the single entry point for a developer taking the prototype to production.
It explains **what the code is, how it runs, the data contract, and exactly where
to plug in a real backend.**

> TL;DR: The **tax engine is plain, framework-free JavaScript** and is the crown
> jewel. It already runs in Node with zero changes. The dashboard is a **Next.js
> (React) app**. "Integrating properly" mostly means: move the engine server-side
> behind an API, replace `localStorage` with a real datastore, and add
> auth/persistence. The engine itself does not need rewriting to do that.

---

## 1. Stack

| Part | Tech |
|---|---|
| Dashboard (`monitor-next/`) | **Next.js 14** (App Router) · **React 18** · **JavaScript/JSX** (no TS) · **Tailwind CSS** · `react-simple-maps` |
| Tax engine (`engine/`) | **Vanilla JavaScript** (ES5-style IIFEs attaching to a global `WISING`). No framework, no build step. Runs in a browser `<script>` **and** in Node via `require()`. |
| Layer 1 intake forms | Standalone **HTML + vanilla JS + Tailwind** (`layer1_india.html`, `layer1_us.html`, `router.html`) |
| Persistence (today) | **`localStorage`** only. No backend, no database. |

`index.html` in a build is **compiled output**, not source — Next.js emits it plus
`_next/static/chunks/*.js`. Edit the `.jsx` source, not the HTML.

---

## 2. Repo map

```
engine/                     ← THE ENGINE (source of truth, pure JS, portable)
  constants.js              ← FX, thresholds, tax tables, storage-key contract
  normalize.js              ← Layer 1 JSON → normalized model (the input schema)
  computation.js            ← India + US tax, FTC, FEIE gate, cross-basis
  conflicts.js              ← WISING.analyze() entry point; findings/documents/FTC
  monitoring.js             ← residency day-counters, calendar, health, alerts
  profiles.js               ← demo test taxpayers (WISING.PROFILES)
  sample-data.js            ← the default demo taxpayer (WISING.SAMPLE)

layer1_india.html           ← India intake (writes localStorage 'wising_layer1_india_state')
layer1_us.html              ← US intake    (writes 'wising_us_state')
router.html                 ← profile router (writes 'wising_router_state')

monitor-next/               ← the dashboard (Next.js)
  app/page.jsx              ← shell, state, view switching
  components/               ← Sidebar, Header, KpiCards, DetailTable, WorldMap,
                              UsStatesMap, Views.jsx (all tab panels)
  lib/wising.js             ← bridges the engine to React (analyze/snapshot/profiles)
  lib/logic.js              ← status classification, KPI rollups, palette
  lib/engine/               ← GENERATED copy of /engine (do not edit; see §7)
  scripts/sync-engine.js    ← copies /engine → lib/engine on predev/prebuild
  next.config.mjs           ← static-export config (see §6)

docs/                       ← this file + COVERAGE_AND_ARCHITECTURE.md
```

---

## 3. Run it

```bash
cd monitor-next
npm install
npm run dev        # http://localhost:3000  (live dev server)
# or
npm run build      # static export → monitor-next/out/  (open out/index.html offline)
```

`predev`/`prebuild` run `scripts/sync-engine.js`, which copies `/engine/*.js` into
`monitor-next/lib/engine/` so the app and the root engine never drift.

The engine also runs standalone in Node (this is how the logic is unit-tested):

```js
["constants","normalize","computation","monitoring","conflicts","profiles","sample-data"]
  .forEach(f => require("./engine/" + f + ".js"));
const W = globalThis.WISING;
const result = W.analyze({ india: W.SAMPLE.india, us: W.SAMPLE.us, router: W.SAMPLE.router });
```

---

## 4. Data flow

```
Layer 1 forms ──write──▶ localStorage ──read──▶ WISING.normalize() ──▶ WISING.compute()
  (India/US JSON)         (3 keys)               (model)               (tax/FTC/cross-basis)
                                                                            │
        dashboard ◀── React (lib/wising.js) ◀── WISING.analyze() ◀─────────┘
                                                 (findings, documents, monitoring…)
```

- **`WISING.analyze(opts)`** is the single engine entry point.
  `opts = { router, india, us }` — pass the three Layer 1 JSON blobs directly
  (used for tests/profiles), or omit them and the engine reads `localStorage`.
- It returns: `{ model, computed, findings, documents, ftcReport, taxComputation,
  reconciliation, monitoring, summary }`.
- The **input schema** = whatever `normalize.js` reads (`safe(...)` paths). Treat
  `normalize.js` as the contract spec between Layer 1 and the engine.

### localStorage contract (`engine/constants.js › STORAGE_KEYS`)

| Key | Written by | Holds |
|---|---|---|
| `wising_router_state` | `router.html` | taxpayer profile (dual/single, base year, US flags) |
| `wising_layer1_india_state` | `layer1_india.html` | India intake JSON |
| `wising_us_state` | `layer1_us.html` | US intake JSON |
| `wising_active_profile` | dashboard | which demo profile is loaded (demo only) |

---

## 5. Integration checklist (taking it to production)

1. **Move the engine server-side.** `engine/*.js` already runs in Node unchanged.
   Wrap `WISING.analyze()` in an API endpoint (`POST /analyze` with the three
   blobs → returns the result object). Keeps the tax logic off the client.
2. **Replace `localStorage` with a datastore + API.** The Layer 1 forms currently
   persist to `localStorage`; point them at your API instead. The engine doesn't
   care where the JSON comes from — it just needs the same shapes `normalize.js`
   expects.
3. **Wire the real Layer 1 forms** (they already emit the correct shapes) or, better,
   rebuild them as React components inside the app and POST to the API.
4. **Auth / multi-tenant / persistence** — none exists yet. Add before real client data.
5. **Recommended: migrate `engine/` to TypeScript.** This is a tax engine; typing the
   model (and INR vs USD money objects) will catch a real class of bugs. It can be
   done incrementally (engine first, then the React app).
6. **Drop the static-export hacks** once served by a real server (see §6).

---

## 6. Static-export notes (why `index.html` works offline)

`next.config.mjs` uses `output: "export"`, `assetPrefix: "."`, `images.unoptimized`.
The relative `assetPrefix` makes the bundle work from `file://` (double-click). When
you serve the app from a real server/CDN, remove `assetPrefix: "."` and (usually)
`output: "export"` and serve Next normally. The Layer 1 HTML files are copied into
`monitor-next/public/` so the export can link to them.

---

## 7. Gotchas

- **Never edit `monitor-next/lib/engine/`** — it is generated from `/engine` by
  `sync-engine.js`. Edit `/engine/*.js`; the copy is refreshed on `npm run dev/build`.
  (It is committed so the app builds without the root; treat it as build output.)
- The engine files are **side-effect IIFEs** that attach to a global. **Import order
  matters**: `constants → normalize → computation → monitoring → conflicts → profiles`.
- If the dev server serves stale chunks after an engine change, kill lingering
  `next-server`/`next start` processes and rebuild.
- FX is a **flat 83.0 INR/USD** (`constants.js › FX`). Production needs per-date rates.

---

## 8. Demo vs production data

- `engine/sample-data.js` (`WISING.SAMPLE`) is the **default demo taxpayer**;
  `engine/profiles.js` (`WISING.PROFILES`) are the **one-click test taxpayers**.
  Both are fixtures for the demo — replace with real intake in production.
- Some cross-basis / computation rows are **planning-grade** (flagged `estimate`),
  because Layer 1 doesn't yet capture every line-item. To make them filing-exact,
  collect and wire:
  - **Per-transaction FX** (Rule 115 / SBI TTBR) instead of the flat rate.
  - **US rental depreciation** basis (currently modeled) — needs the property's
    depreciable cost basis.
  - **Capital-gains cost basis + acquisition dates** for US holding-period /
    USD-basis recomputation.
  - **FEIE foreign-housing exclusion** (only the base FEIE amount is modeled).
- Tax tables in `constants.js` are TY2025/FY2025-26; they need annual maintenance.

---

## 9. Where the value is

`engine/` is deliberately decoupled from the UI. A developer can lift the whole
folder into any backend (Node/serverless) and get the full India⇄US computation,
FTC/cross-basis reconciliation, FEIE gate, PFIC/CFC/FBAR/LRS detection, residency
day-counting and the compliance calendar — without touching React. Start there.

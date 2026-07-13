# WISING — India ⇄ US Tax Conflict Detection (Prototype)

A cross-border tax-intelligence prototype for tax professionals. It takes the two
**Layer 1 intake forms** (India + US) as the data base, runs a **computation engine**
and a **conflict-detection engine** over their combined output, and renders the
result on a single **Layer 2 dashboard** — the main value proposition.

> ⚠️ Planning estimates only. This is a prototype, **not** a substitute for
> professional tax advice or a tax-return computation.

---

## The three layers

| Layer | File | Role |
|------|------|------|
| **L0 — Router** | `router.html` | Establishes the taxpayer profile (dual / single, base year, US status flags). Writes `wising_router_state`. Both Layer 1 forms redirect here if it's missing. |
| **L1 — India intake** | `layer1_india.html` | Your India specialist form (verbatim). Writes `wising_layer1_india_state`. |
| **L1 — US intake** | `layer1_us.html` | Your US specialist form (verbatim). Writes `wising_us_state`. |
| **L2 — Monitor** | `monitor-next/` | The Next.js (React) conflict dashboard. Reads both L1 states and runs the engine. `npm run build` emits a static bundle to `monitor-next/out/`. |

> **Developers:** start with **[`docs/DEVELOPER_HANDOFF.md`](docs/DEVELOPER_HANDOFF.md)** — stack, run steps, the engine API, the `localStorage` data contract, and the production-integration checklist.

The Layer 1 forms already cross-link to `router.html`, `layer1_india.html`,
`layer1_us.html` and **`dtaa_bridge.html` ("DTAA Bridge Compiler")** in their own
navigation — so this prototype slots directly into the forms you provided. No edits
were made to the intake forms themselves.

### How the layers connect: the data flow (L0 → L1 → L2)

The demo data travels **Layer 0 → Layer 1 → Layer 2**, and every layer shares it
through the browser's `localStorage`:

```
Router (L0) ─┐
India form (L1) ─┼─▶ localStorage ─┬─▶ forms hydrate (show the data)
US form (L1) ─┘   (3 wising_* keys) └─▶ Monitor (L2) reads + computes

pick a test profile in the Monitor ─▶ writes the 3 keys ─▶ forms populate
edit a form + it saves ─────────────▶ writes the keys  ─▶ Monitor re-runs (live)
```

> **⚠️ This only works when everything is served from ONE web address (origin).**
> `localStorage` is tied to the exact address a page was saved under. If the Monitor
> is on one address (e.g. `localhost:3000`) and you open a form on another (e.g. a
> `file://` double-click, or `localhost:8099`), they get **separate** localStorage and
> can't see each other — the forms look empty even though nothing is broken. The
> launcher below guarantees one address.

### Easiest way to run (no terminal)

Double-click **`start.command`** (macOS/Linux) or **`start.bat`** (Windows). On the
first run it builds the app bundle (needs Node.js); after that it serves the router,
both Layer 1 forms **and** the Monitor from a single address
(`http://localhost:8099/`) and opens your browser. Leave the window open during the
demo. Then: **pick a test profile in the Monitor's dropdown**, and click the
**Router / India / US** links at the top — each form opens already populated from
that profile. Edit a form and the Monitor updates when you return to it.

### Run with a server (manual)

The launcher just automates this — build the single-origin bundle, then serve it:

```bash
cd monitor-next && npm install && npm run build   # → monitor-next/out/
cd out && python3 -m http.server 8099             # serve the bundle (NOT the repo root)
# then open http://localhost:8099/
```

`monitor-next/out/` is a self-contained bundle: the Monitor's `index.html` plus
same-origin copies of `router.html`, `layer1_india.html`, `layer1_us.html` and
`engine/*.js` (the build copies them in). This is exactly what the Vercel deployment
serves, so local matches production.

> Note: `http://localhost:8099` only works while that server command is running on
> *your* machine. If the link "won't open," the server isn't running.

### Styling / offline demo

The Layer 2 pages (`index.html`, `router.html`, `dtaa_bridge.html`) ship a
**self-contained Tailwind build** at `assets/tailwind.css` — **no CDN**, so the
investor demo works with no network. Rebuild after changing classes:

```bash
npm install        # one-time (tailwindcss + @tailwindcss/forms)
npm run build:css  # regenerate assets/tailwind.css
npm run watch:css  # rebuild on save while developing
```

The two Layer 1 intake forms are left exactly as you provided them (they load
Tailwind from their own CDN); only the Layer 2 pages were made offline-safe.

Flow: the **Monitor** (`monitor-next`, served at `/`) is Layer 2 → `router.html`
(set profile / Layer 0) → `layer1_india.html` / `layer1_us.html` (collect data,
Layer 1) → back to the Monitor to see conflicts. Pick a test profile in the Monitor
to seed all three at once.

The Monitor also works **standalone**: if no Layer 1 data is found in `localStorage`
it renders a realistic demo taxpayer in-memory (so the value proposition is always
visible) — but note that in-memory demo does **not** populate the forms. To see the
forms populated, pick a test profile from the dropdown first (that writes the shared
`localStorage` keys the forms read).

---

## The engine (`/engine`)

Pure, side-effect-free JavaScript on a global `WISING` namespace, loaded as plain
`<script>` tags (no build step, no bundler). Pipeline:

```
constants.js     FX anchor, statutory thresholds, TAX TABLES, document rule-book
      │
normalize.js     read both L1 states  →  one currency-normalized model
      │           · sums India's per-quarter income into an annual figure
      │           · maps real form fields (US wages_w2[].wages_box1_usd, etc.)
      │           · every money node carries BOTH {inr, usd}
computation.js   residency · FULL India tax (slab/regime · §87A · surcharge w/
      │           marginal relief · cess · special CG rates) · FULL US tax
      │           (AGI · std/itemized · ordinary + preferential LTCG/QDI · NIIT
      │           · addl Medicare) · FTC §904 limitation BOTH directions
conflicts.js     rule-book → ranked findings · document checklist · FTC report
      │           · tax-computation breakdown tables
      │
  WISING.analyze({india, us, router})   →   { summary, findings, documents,
                                ftcReport, taxComputation, computed, model }
```

### Live linkage to the Layer 1 forms

The dashboard reads the forms' own `localStorage` keys and **reflects live input**:
on load it prefers live Layer 1 data (`LIVE` badge); a `storage` event (you save a
form in another tab) or returning focus re-runs the engine automatically. The
**demo taxpayer is rendered in-memory only** — it never writes to `localStorage`,
so it can't mask the data you enter in the forms. India income entered across the
four quarters is summed to an annual figure (mirrors the form's
`aggregateAnnualState()`).

### What it detects (the four value-prop modules)

1. **Conflicts & Mismatches** — dual residency, unresolved DTAA Art. 4 tie-breaker,
   treaty relief claimed without TRC/Form 10F, FTC shortfall (residual double tax),
   tax-year (FY vs CY) apportionment, FX-basis, PFIC (Indian mutual funds → Form 8621),
   CFC (Indian company → Form 5471/GILTI), Indian retirement-account treatment, and a
   per-head doubly-taxed-income breakdown.
2. **Limit Monitoring** — FBAR ($10k), Form 8938 (status/residence table), LRS
   ($250k RBI cap), FEIE — as gauges with `ok / approaching / breached` status.
3. **Documents to File** — the catalogue in `constants.js`, each triggered by the
   taxpayer's facts, tagged by jurisdiction (IN / US) with the reason it fired.
4. **FTC Reconciliation** — driven by the two **computed** liabilities: US Form 1116
   credit pool + §904 limitation + carryover, India §90 relief, and the headline
   **net unrelieved double tax**. A **Tax Computation** panel shows the full India
   (INR) and US (USD) breakdowns behind those FTC numbers.

The dashboard is **interactive**: animated KPIs, an income-composition doughnut, a
tax-exposure/relief chart with a credited-vs-double-taxed split, expandable conflict
cards, and a **what-if bar** (India NEW/OLD regime · FX slider · FEIE toggle) that
re-runs the full engine live. See **`DEMO_SCRIPT.md`** for a 3-minute investor
walkthrough (pairs with the recorded `wising-dashboard-demo.webm`).

### Run the engine headless (Node)

```bash
node -e '
global.window = global;
["constants","normalize","computation","conflicts","sample-data"]
  .forEach(m => require("./engine/"+m+".js"));
const S = window.WISING.SAMPLE;
const r = window.WISING.analyze({ router:S.router, india:S.india, us:S.us });
console.log(JSON.stringify(r.summary, null, 2));
'
```

---

## Key assumptions (all in `engine/constants.js`)

- **FX:** flat `83.0 INR/USD` (matches the forms' hydration). The engine flags that
  statutory FTC requires the per-transaction TT buying rate (Rule 115 / SBI TTBR).
- **Thresholds / brackets** are prototype defaults for **FY2025-26 / TY2025** and are
  not the live statutory tables. A production build would source these from a
  versioned rule service. Change them in one place: `constants.js`.

## Files added by this prototype

```
index.html              router.html            dtaa_bridge.html
dashboard-standalone.html   (single-file, double-click, offline)
start.command  start.bat    (double-click launchers: server + browser)
layer1_india.html       layer1_us.html         (your two forms, copied verbatim)
engine/constants.js     engine/normalize.js    engine/computation.js
engine/conflicts.js     engine/sample-data.js
assets/tailwind.css     assets/tailwind.input.css   tailwind.config.js
scripts/build-standalone.js   package.json     README.md
```

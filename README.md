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
| **L2 — DTAA Bridge** | `dtaa_bridge.html` | The conflict dashboard. Reads both L1 states and runs the engine. |
| Landing | `index.html` | Overview + demo snapshot, links into every layer. |

The Layer 1 forms already cross-link to `router.html`, `layer1_india.html`,
`layer1_us.html` and **`dtaa_bridge.html` ("DTAA Bridge Compiler")** in their own
navigation — so this prototype slots directly into the forms you provided. No edits
were made to the intake forms themselves.

### How the layers connect

### Easiest way to run (no terminal)

- **Just the dashboard:** double-click **`dashboard-standalone.html`** — a single
  self-contained file (engine + CSS inlined). Opens offline with the demo taxpayer,
  no server, no wifi. Best for a quick investor demo.
- **The full flow** (router → forms → dashboard): double-click **`start.command`**
  (macOS/Linux) or **`start.bat`** (Windows). It starts a local server in the folder
  and opens your browser automatically. Leave the window open during the demo.

### Run with a server (full flow, manual)

The router → forms → dashboard flow shares data through the browser's `localStorage`,
which is origin-scoped — so for that flow, **serve the folder over one origin**
instead of opening the files directly:

```bash
cd Test
python3 -m http.server 8099     # or: npm run serve
# then open http://localhost:8099/index.html
```

> Note: `http://localhost:8099` only works while that server command is running on
> *your* machine. If the link "won't open," the server isn't running — use the
> double-click options above instead.

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

Flow: `index.html` → `router.html` (set profile) → `layer1_india.html` /
`layer1_us.html` (collect data) → `dtaa_bridge.html` (see conflicts).

The dashboard also works **standalone**: if no Layer 1 data is found it auto-loads
a realistic demo taxpayer so the value proposition is always visible. You can also
**Import JSON** (a `{india, us, router}` bundle or a single state) on the dashboard.

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

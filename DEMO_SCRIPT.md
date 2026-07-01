# WISING — Investor Demo Script (≈3 minutes)

A rehearsable, click-by-click walkthrough of the Layer 2 dashboard. Pairs with
the recorded video (`wising-dashboard-demo.webm`).

**Setup (before you present):** unzip the package and **double-click
`dashboard-standalone.html`** — it opens offline with the demo taxpayer, no
server or wifi needed. (For the live form → dashboard flow, use `start.command` /
`start.bat` instead.)

The demo persona: **Aarav Sharma** — Indian citizen on an H-1B in the US. Resident
in *both* countries. The textbook cross-border case.

---

## 0 · The one-liner (say this first)
> "For an Indian professional in the US, the same income gets taxed twice, and the
> compliance burden is brutal. WISING ingests both countries' data, computes both
> tax positions, and instantly shows every conflict, every filing, and exactly how
> much money is stuck in double taxation. Here it is."

## 1 · The headline (KPI row) — ~20s
Point to the four cards animating in:
- **5 critical conflicts**, 11 warnings.
- **$8,737 residual double tax** — "real money double-taxed *after* foreign tax credits."
- **13 filings required** across both countries.
> "One screen. In a real engagement this is hours of a CPA's manual work."

## 2 · The core conflict (residency strip) — ~15s
Point to **🇮🇳 ROR ⇄ 🇺🇸 Resident Alien → DUAL RESIDENT**.
> "He's a tax resident of both countries — so both tax his *worldwide* income.
> That's the root of every downstream problem, and our engine detects it automatically."

## 3 · The visuals — ~25s
- **Income Composition** doughnut: "Worldwide income, ~$267k, split across Indian
  salary, business, rent, and US wages/gains."
- **Tax Exposure & Relief** bars: India tax + US tax = **combined $59,892**; the green
  **After FTC relief** bar shows the credit working — and the **CREDITED vs
  DOUBLE-TAXED** split bar shows **$8,737 still stuck**.
> "This is the value proposition in one picture: we quantify the leak."

## 4 · Make it live — the what-if bar — ~35s (the 'wow')
This proves it's a real engine, not slides.
1. **India regime → OLD:** residual jumps to **~$11,321**. "Regime choice moves the
   number in real time."  → toggle back to **NEW**.
2. **FX slider:** drag it — every figure re-prices live. "Currency timing is a real
   planning lever; we model it."
3. **Claim FEIE** checkbox: watch limits/credits react. → click **Reset**.
> "Every control re-runs the full India + US computation instantly."

## 5 · Conflicts & documents — ~30s
- Filter chips: **Critical 5 / Warning 11 / Info 1**. Click **Critical**.
- Expand **"Foreign Tax Credit shortfall"**: read the plain-English **Action** line
  and the statute pills (Form 1116, §904).
- Scroll to **Documents to File**: "13 filings auto-triggered — FBAR, 8938, 8621
  (PFIC), 5471, Form 67, TRC, Schedule FA — each with *why* it fired."

## 6 · Under the hood (credibility) — ~20s
Scroll to **Tax Computation** + **FTC Reconciliation**.
> "These aren't guesses — full India computation (slabs, §87A, surcharge, cess) and
> US computation (brackets, preferential rates, NIIT), and the FTC §904 limitation
> in both directions. Transparent and auditable."

## 6.5 · The Monitoring tab — the "always-on" story — ~30s
Click the **📡 Monitoring** tab. This is the Sphere-style continuous-compliance angle.
- **Compliance health: 8/100 — At risk.** "One number for the whole cross-border position."
- **Alerts feed:** prioritized — critical conflicts, a breached FBAR, LRS *on track to breach*.
- **Residency day-counters:** "We count days in both countries and date exactly when
  he became resident — US crossed ~May 6, India ~Oct 14. For someone mid-move, we
  predict the *flip date* before it happens."
- **Threshold projections:** "Not just 'you're at 82%' — 'at this pace you cross the
  ₹250k LRS cap around Jan 1.' We warn *before* the breach."
- **Compliance calendar:** "Every deadline with a countdown — India ITR + Form 67 due in 30 days."
> "This is the difference between a filing-season tool and a year-round platform."

## 7 · Close — ~15s
> "Two intake forms in, one intelligence layer out. It catches what people miss,
> sizes the exposure, and lists exactly what to file. That's WISING."

---

### Backup Q&A
- **"Is this real tax advice?"** — "Planning-grade for now (current-year tables);
  the rules live in one versioned module. It surfaces and sizes issues — a
  professional still signs the return."
- **"Where does the data come from?"** — "The two Layer 1 specialist intake forms;
  the dashboard reads them live and reflects edits instantly."
- **"India + US only?"** — "First corridor. The engine (normalize → compute →
  conflicts) is corridor-agnostic; new treaties are new rule packs."

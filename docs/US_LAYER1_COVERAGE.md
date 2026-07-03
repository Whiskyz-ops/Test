# US Layer 1 → Monitor — Compliance Coverage Audit

Step-by-step audit of the **US Layer 1** intake against what the Monitor currently
surfaces. For each compliance area: **what Layer 1 collects**, the **coverage
status**, **where it shows in the Monitor today**, and if not covered, **where it
will land** (which tab / engine module).

**Legend** — ✅ Covered · 🟡 Partial (read but simplified / display-only) · ❌ Not yet

**Monitor surfaces referenced:** *Monitor* (map + KPIs + Conflicts), *Residency*,
*Holdings* (income & assets), *Filings* (calendar + FTC + tax computation +
cross-basis), *Documents* (form checklist), *Accounts* (reporting limits + foreign
accounts). Engine modules: `normalize.js` (intake→model), `computation.js` (tax),
`conflicts.js` (findings/documents/FTC), `monitoring.js` (residency/calendar).

---

## 1. Residency & Status determination

| Layer 1 step | Status | Where in Monitor / where it will come |
|---|---|---|
| Tax entity type (individual / entity) | ✅ | `model.entity`; drives which computation runs. Residency + Filings. |
| LLC IRS classification election | ❌ | Engine reads entity kind but not the check-the-box election. → `normalize` entity block + a Filings note. |
| Filing status (single/MFJ/MFS/HOH) + NRA restriction | 🟡 | Used for brackets/std deduction/NIIT thresholds. The NRA-can't-MFJ restriction + §6013(h)/(g) elections are **not** modelled. → `computation` + a Conflicts check. |
| Community property (MFS) | ❌ | → `computation` (income splitting) + Conflicts. |
| Taxpayer ID type / visa / dependents | 🟡 | Dependents feed nothing yet; visa feeds SPT exempt-status only loosely. → Residency detail + credits. |
| Green card: grant date, I-407 surrender, **exit tax** (§877A), years-held | ❌ | Residency treats green-card = resident, but **expatriation / exit tax** is not detected. → Residency + a new critical Conflict. |
| Substantial Presence Test — 3-year day tracker, excluded days, exempt individual | 🟡 | SPT **result** (resident/not) drives residency; the Monitor shows the current-year day-counter. The **weighted 3-year formula, excluded days, exempt-individual** are read on the form but the engine uses the pre-computed status, not the raw calc. → `monitoring` day-counter + `computation` residency. |
| First-year election / dual-status year | ❌ | → Residency + `computation`. |
| DTAA Article 4 tie-breaker wizard | ✅ | Residency tab (DTAA Treaty Position) + Monitor conflict ("resolved / not run"); applied end-to-end in `computation` (loser → source basis). |
| Treaty docs: TRC, Form 8833, 1040-NR | ✅ | Residency (TRC / 10F / 1040-NR rows) + Documents + "treaty relief without docs" conflict. |

## 2. State residency & multi-state

| Layer 1 step | Status | Where |
|---|---|---|
| Domicile, year-start/end home, states-lived list | ❌ | The US-states map is **illustrative only** — it is not computed from these fields. → new **state-residency engine** feeding the US drill-down map. |
| Statutory residency (NY 183-day + abode, CA FTB domicile/exit) | ❌ | Same — needs the state engine. → Monitor US drill-down + Conflicts. |
| Multi-state apportionment, economic/sales nexus, gross receipts by state | ❌ | → state-residency + business-nexus engine. |
| Military / duty-station, community-property state | ❌ | → state engine. |

> **State tax is the single biggest gap.** Today the state map is a demo visual; making it live is "Phase: US-state residency."

## 3. Employment income (W-2)

| Layer 1 | Status | Where |
|---|---|---|
| W-2 wages / paystubs (+ withholding, Medicare wages) | ✅ | Holdings → *US income by head* (Wages); `computation` taxes it; withholding feeds the calendar/FTC. |

## 4. Investments & capital gains (1099-B)

| Layer 1 | Status | Where |
|---|---|---|
| Short-term / long-term gains, proceeds, cost basis | ✅ | Holdings (US income by head — ST/LT gains); `computation` applies ordinary vs LTCG 0/15/20 + the cross-basis re-characterization. |
| RSU cost-basis warning | ❌ | → Conflicts (RSU basis trap) + Equity-comp coverage (§9). |
| QSBS §1202 exclusion | ❌ | → `computation` (gain exclusion) + Conflicts. |
| Real-estate sale §121 exclusion | ❌ | → `computation` + Conflicts. |
| Collectibles 28% rate | ❌ | → `computation` special-rate. |
| Capital-loss carryovers (ST/LT) | ❌ | → `computation` (offset gains). |
| Crypto / VDA transactions | ❌ | → Holdings (asset class) + `computation` (gains) + Conflicts (reporting). |

## 5. Interest & dividends (Schedule B)

| Layer 1 | Status | Where |
|---|---|---|
| US bank interest, ordinary & qualified dividends | ✅ | Holdings (US income by head); `computation` (ordinary + qualified-rate split). |
| Treasury/OID, seller-financed, **tax-exempt** interest | 🟡 | Plain interest covered; OID / tax-exempt / muni **not** separated (tax-exempt should be excluded + feed AMT/NIIT). → `normalize` + `computation`. |

## 6. Rental income (Schedule E)

| Layer 1 | Status | Where |
|---|---|---|
| Gross US rental + expenses | ✅ | Holdings (US income by head — Rental; Property card); `computation` + cross-basis (US depreciation vs India 30%). Depreciation is currently **modeled**, not from a basis schedule. |

## 7. Other income (Schedule 1 / 1099-G / SSA)

| Layer 1 | Status | Where |
|---|---|---|
| Social Security (SSA-1099) | 🟡 | Read into US retirement income (`usRetirementIncome`) as ordinary; the **85% taxable cap** is not applied. → `computation`. |
| State/local refunds, unemployment, alimony, royalties, COD (1099-C), HSA distributions, gambling/misc | ❌ | → `normalize` (Other-income head) + Holdings + `computation`. |

## 8. Business & self-employment

| Layer 1 | Status | Where |
|---|---|---|
| Schedule C, K-1 (1065 / 1120-S / 1041), 1120 C-Corp | 🟡 | Amounts flow into `businessUs`; C-Corp taxed 21%, pass-through $0-at-entity. **Sch F (farm), trust K-1** partially. Holdings shows business income. |
| **SE tax** (Schedule SE, 15.3%) | ❌ | Self-employment income is taxed at income rates but **SE tax is not added**. → `computation` (material gap for the self-employed). |
| **QBI §199A** 20% deduction | ❌ | → `computation` + Conflicts (SSTB/limits). |
| SE above-the-line (SE health, Solo-401k/SEP) | 🟡 | Retirement contributions captured in Holdings; the **deduction** isn't applied to AGI. → `computation`. |
| Balance sheet / Sch L, M-1, M-2 (book-tax reconciliation) | ❌ | → `computation` (C-Corp) + a Business detail panel. |
| Depreciation (MACRS / §179 / bonus), UBIA | ❌ | → `computation` (business net) + cross-basis rental. |
| Foreign branch / FDE (Form 8858), branch K-1 | ❌ | → International (§11) + Documents. |

## 9. Equity & cap table (RSU / ISO / NSO / ESPP / QSBS)

| Layer 1 | Status | Where |
|---|---|---|
| RSU vests, ISO/NSO exercises, ESPP, restricted stock | ❌ | Entirely uncovered — **ISO exercise is a top AMT trigger**. → Holdings (equity comp) + `computation` (ordinary + AMT) + Conflicts. |

## 10. International income & assets

| Layer 1 | Status | Where |
|---|---|---|
| Foreign wages / interest / dividends / ST-LT CG / rental / pension | ✅ | Holdings (foreign heads) + cross-basis + FTC (Filings). Core of the India⇄US value prop. |
| Section 988 currency gains/losses | ❌ | → `computation` + Conflicts. |
| **FEIE (Form 2555)** — tax home, bona-fide / physical-presence tests, housing | ✅ | Eligibility **gated** (Monitor conflict "FEIE claimed but not eligible" + applied in `computation` with §911 no-double-dip). Housing exclusion not yet modelled. |
| **FBAR** peak balance | ✅ | Accounts (reporting limits) + Monitor conflict (breach) + Documents (FinCEN 114). |
| **Form 8938 (FATCA)** | ✅ | Accounts + Documents; threshold table now keys off the §911 abroad facts. |
| Foreign bank accounts list | ✅ | Accounts (Foreign Accounts) — drives FBAR / Schedule FA. |
| Other financial assets (FATCA / **PFIC**) | ✅ | Holdings (Securities, PFIC · 8621 tag) + Monitor conflict + Documents (8621). |
| **Form 5471 (CFC / GILTI / Subpart F)** | ✅ | Monitor conflict (definitive from ownership) + Holdings (CFC tag + GILTI) + Documents + cross-basis routing. |
| Form 8865 (foreign partnership), 8858 (FDE), 5472 (inbound) | ❌ | Read on the form; not surfaced. → Documents + Conflicts. |
| Foreign gifts / trusts (Form 3520) | 🟡 | 3520 fires for Indian retirement (PPF/EPF); **foreign gifts** 3520 not. → Conflicts + Documents. |
| Treaty FDAP rates, ECI/FDAP classification, **FIRPTA** withholding | ❌ | → `computation` (FDAP/ECI split) + Conflicts (FIRPTA on US real-estate sale by NRA). |

## 11. Retirement

| Layer 1 | Status | Where |
|---|---|---|
| US: Traditional/Roth IRA, 401(k) employee/match, Roth 401(k), HSA, Solo-401k, SEP | ✅ | Holdings → *Retirement Accounts* (this-year contributions). The **deduction to AGI** isn't applied yet → `computation`. |
| IRA / 401(k) distributions, pension | ✅ | `usRetirementIncome` → ordinary income (Holdings + `computation`). |
| Indian retirement (US tax exposure): trust review, 3520 flag | ✅ | Monitor conflict ("EPF/PPF/NPS taxed differently by the US") + Holdings + Documents (3520). |
| SECURE Act 2.0 RMD | ❌ | → `computation` (forced income) + Conflicts (missed-RMD penalty). |

## 12. Deductions & credits

| Layer 1 | Status | Where |
|---|---|---|
| Standard vs itemized; SALT (capped), mortgage interest, charity, medical | 🟡 | `computation` applies standard/itemized incl. SALT cap. **Mortgage acquisition-date limit, appreciated-asset charity, disaster loss** not refined. |
| Credits: Child/Dependent Care, AOTC, Lifetime Learning, 529 | ❌ | No credits are applied. → `computation` (credits reduce tax) + a Filings credits panel. |

## 13. AMT (§55)

| Layer 1 | Status | Where |
|---|---|---|
| AMT preference adjustments, private-activity-bond interest | ❌ | **AMT is not computed at all** — a real gap given ISO exercises + high earners. → `computation` (parallel AMT) + Conflicts. |

## 14. NIIT (§1411)

| Layer 1 | Status | Where |
|---|---|---|
| Net Investment Income Tax 3.8% | ✅ | `computation` (NIIT on investment income over the threshold) → Filings tax computation. |

## 15. Foreign Tax Credit (§904)

| Layer 1 | Status | Where |
|---|---|---|
| FTC baskets, foreign taxes | ✅ | Filings → FTC Reconciliation (Form 1116 limitation, carryover, residual) + cross-basis. **Per-basket** (passive vs general) limitation is simplified to one basket. → `computation` refinement. |

## 16. Estimated tax / safe harbor

| Layer 1 | Status | Where |
|---|---|---|
| 1040-ES quarterly, prior-year tax (110%/90% safe harbor) | 🟡 | The **deadlines** appear in the Filings compliance calendar; the **underpayment / safe-harbor calc** is not done. → `computation` + calendar. |

## 17. Additional Medicare (§3101(b)(2))

| Layer 1 | Status | Where |
|---|---|---|
| Additional Medicare 0.9% | 🟡 | `computation` uses the **form-provided** figure rather than computing it from wages/SE. → `computation`. |

---

## Scorecard

| Bucket | Count | Examples |
|---|---|---|
| ✅ Covered | ~18 | Residency + Art.4 tie-breaker, W-2, cap gains, interest/dividends, rental, foreign income, FEIE gate, FBAR, 8938, PFIC/8621, CFC/5471/GILTI, FTC/1116, NIIT, US + Indian retirement, cross-basis |
| 🟡 Partial | ~10 | Filing-status/NRA rules, SPT raw calc, business (no SE tax/QBI), Social Security 85%, deductions, FTC baskets, estimated-tax calc, Add'l Medicare |
| ❌ Not yet | ~20 | **State tax (biggest)**, AMT, equity comp/ISO, SE tax, QBI §199A, credits (AOTC/care/529), crypto/§988, QSBS/§121/collectibles/loss-carryovers, expatriation/exit tax, FIRPTA, 8865/8858/5472, foreign-gift 3520, RMD |

## Recommended fill order (highest impact first)
1. **SE tax + QBI §199A** — anyone self-employed is currently mis-taxed. (`computation`)
2. **AMT** — needed the moment ISO/equity-comp or high earners appear. (`computation`)
3. **Credits** (child care, AOTC, LLC, 529) — directly change tax owed. (`computation`)
4. **Equity comp (RSU/ISO/ESPP)** — income + AMT + a Holdings panel.
5. **US-state residency engine** — makes the state map real (NY/CA statutory tests, nexus).
6. **Capital-gains specials** (QSBS/§121/collectibles/loss carryovers, crypto/§988).
7. **Expatriation/exit tax, FIRPTA, 8865/8858/5472, foreign-gift 3520** — completeness of the international suite.

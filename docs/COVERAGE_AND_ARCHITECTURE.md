# WISING — Layer 1 Coverage Audit & Multi-Entity Architecture

**Status:** design doc (no code changes). Written to agree scope before building
comprehensive field coverage and multi-entity support.

**Scope of this doc**
- **Part A–E:** a field-by-field audit of what the two Layer 1 forms *collect*
  vs what the engine currently *consumes*, and which gaps actually change tax.
- **Part F–H:** the multi-entity architecture (data model, engine, frontend) so
  every tax entity the user selects in Layer 1 is kept separate with its own
  computation and frontend, then consolidated to the owner.

Source of truth for field names: `layer1_india.html` (`state`, schema
`layer1_india_v5_1`) and `layer1_us.html` (`usState`, schema `layer1_us_v1`).
Engine = `engine/{constants,normalize,computation,monitoring,conflicts}.js`.

---

## Part A — How to read this

Coverage legend for every field group:

| Mark | Meaning |
|---|---|
| ✅ **Wired** | Read by `normalize.js` and used in `computation`/`monitoring`/`conflicts`. |
| 🟡 **Partial** | Read, but simplified/flattened (loses detail that changes tax). |
| ⛔ **Not consumed** | Collected by Layer 1, ignored by the engine today. |

"Changes tax?" flags whether wiring the gap materially moves the numbers (so we
can prioritise).

**Headline:** the engine is a correct **cross-border MVP slice**, not a
comprehensive return engine. Approx **30–40%** of collected fields are consumed
(the cross-border-critical ones). The rest is captured but inert.

---

## Part B — India Layer 1 coverage (`state`)

| Section | Key fields | Coverage | Changes tax? |
|---|---|---|---|
| `profile` | entity_type, tax_regime, pan_aadhaar_linked, turnover_lte_400cr, is_section_8, mat_book_profit, opt_115ba/baa/bab, mfg dates | 🟡 entity_type/regime read; **115BA/BAA/BAB, MAT book profit, s.8, mfg incentives ⛔** | Yes (company rates/MAT) |
| `residency_detail` | final status, days, POEM, deemed-resident paths, crew/visit flags | 🟡 final status + days read; **the determination inputs ⛔** (we trust the form's final status) | Status yes; inputs no |
| `dtaa` | trc_status, treaty_residence, PE, treaty_elections, mfn, forced_nr | ✅ (elections/MFN 🟡) | Yes |
| `compliance_docs` | trc, form_10f, **section_197_cert**, chapter_xiia_elected | 🟡 TRC/10F read; **197 cert, Ch. XII-A ⛔** | 197/XIIA yes (rates) |
| `bank_accounts[]` | peak_balance_inr, type | ✅ peak → FBAR/Sch FA | Reporting |
| `property` | properties[] (rent, municipal tax, co-owner %, interest) | 🟡 annual value only; **capital-gains on sale, co-ownership, §24(b) interest ⛔** | Yes (CG, HP loss) |
| `financial_holdings[]` | asset_type, value, buy/sell | 🟡 **mutual funds → PFIC flag only**; equity CG ⛔ | Yes (CG) |
| `commodities`, `unlisted_equity`, `share_buyback` | transactions[] | ⛔ | Yes (CG, deemed dividend) |
| `domestic_income.salary` | taxable_salary, gross, HRA, LTA, perquisites, ESOP, NPS employer, pro-tax, prior employer | 🟡 **taxable_salary only**; **HRA/LTA/perquisites/ESOP exemptions ⛔** | Yes (exemptions, ESOP perq) |
| `domestic_income.house_property` | properties[] (GAV, 30% ded, §24(b), SOP, loss set-off) | 🟡 net value; **interest/loss set-off logic ⛔** | Yes |
| `domestic_income.business_income` | **business_entries[]**, presumptive_scheme, expenses{~30 fields}, asset_blocks (depreciation), speculative/F&O turnover+income, s41, partner_firms[], msme_payables, amt_credit, s40b remuneration, s44bbb, s35AD, tonnage 115V | 🟡 **net_profit per entry summed only**; **everything else ⛔** (presumptive, depreciation, F&O, disallowances, partner firms, AMT) | **Yes — large** |
| `domestic_income.capital_gains` | short_term_15_pct | 🟡 simple STCG; full CG engine ⛔ | Yes |
| `other_sources` | savings/FD/bond interest, dividend, gifts>50k, family pension, lottery/gaming, deemed dividend (buyback), EPF/PPF interest taxable, NPS/PF withdrawal, angel tax, LIC, clubbing (minor/spouse) | 🟡 interest+dividend; **gaming/lottery (115BB), gifts, clubbing, taxable PF/NPS, deemed dividend ⛔** | Yes (special rates) |
| `deductions` | s80C, 80CCC/CCD1, **80CCD1B**, 80D (+parents/senior/preventive), 80DD, 80DDB, 80U, **80G[]**, 80GGB/GGC, 80GG, 80TTA/TTB, 80E, 80EEA/EE, 80M | 🟡 80C/80CCD1B/80D/80TTA; **80G, 80E, 80EEA, 80U/DD/DDB, 80GG, 80M, disability NRI-block ⛔** | Yes |
| `carry_forward_losses` | business/speculative/STCG/LTCG/HP loss CF, unabsorbed depreciation, s79 shareholding change | ⛔ | **Yes — large** |
| `lrs_outbound` | total remitted, purpose, foreign income received | ✅ amount → LRS monitor; purpose 🟡 | Limit monitoring |
| `tax_credits` | advance tax Q1–4, TDS, TCS, Form 26AS, **foreign_tax_credit[]** | 🟡 advance+TDS summed; **per-country FTC array, 26AS reconcile ⛔** | FTC |
| `surcharge_buckets` | income by rate bucket (111A/112A/115A/115BB/dividend) | ⛔ (engine recomputes surcharge itself) | Consistency |
| `nro_repatriation` | cumulative USD, pending, TDS on NRO | ⛔ | Reporting |
| `foreign_assets` / `foreign_income` | has_foreign_assets, assets[] | ⛔ (Schedule FA driven only from US-side accounts) | Sch FA completeness |
| `gift_received`, `salary_exemptions`, `other_exemptions` | (populated by sub-flows) | ⛔ | Yes |
| `quarters` Q1–Q4 | per-quarter income snapshots | ✅ summed to annual (`indiaAnnualSlice`) | Advance-tax pacing |

---

## Part C — US Layer 1 coverage (`usState`)

| Section | Key fields | Coverage | Changes tax? |
|---|---|---|---|
| `profile` | **tax_entity_type**, **llc_tax_election**, incorporation_state, filing_status, ssn/itin, dependents, spouse_is_us_person | 🟡 filing_status read; **entity_type/LLC election NOT branched ⛔** | **Yes (see Part F)** |
| `us_residency_detail` | SPT day-weighting, green card, exempt-individual, closer-connection, first-year choice, §6013(g), treaty residence, start/end dates | 🟡 final status + citizen/GC/SPT/days; **SPT weighting, exemptions, elections ⛔** | Status yes |
| `state_residency` | jan1/dec31 domicile, footprint[], moved, CA safe-harbor, **NY 183-day + abode + 548-rule**, MSRRA military, secondary states[] | ⛔ **entirely unused** | **Yes (state tax)** — this is the Monitor state-drill gap |
| `income_us_source` | wages_w2[], interest, ord/qual dividends, STCG/LTCG, rental, royalty, **self_employment[]**, **partnerships_k1[]**, **s_corporations_k1[]**, **c_corporations_1120[]**, **farming_schedule_f[]**, **trusts_estates_k1[]**, IRA/401k/SS distributions, crypto[], loss carryovers, QOF/QSBS/1031/installment/collectibles flags | 🟡 wages/interest/div/CG/rental; **all K-1 pass-throughs, SE, crypto, loss carryovers, special assets ⛔** | **Yes — large** |
| `income_foreign_source` | foreign wages[], interest, dividends, STCG/LTCG, rental, pension, §988[] | 🟡 amounts read; **§988, per-item sourcing ⛔** | Yes |
| `equity_compensation` | ISO/NSO/RSU/ESPP/83(b) exercises[] | ⛔ **ISO → AMT preference not computed** | **Yes (AMT)** |
| `foreign_earned_income` | FEIE claim, physical-presence/bona-fide, housing exclusion | 🟡 claim + amount; **housing exclusion, qualification test ⛔** | Yes |
| `bank_accounts[]`, `financial_holdings[]`, `fbar_aggregate_peak_usd`, `form_8938_required` | balances | ✅ FBAR peak; 🟡 8938 threshold table | Reporting |
| `real_estate` | properties[] (rent, expenses, §1031, depreciation, FIRPTA) | ⛔ (only hydrated from India side) | Yes |
| `retirement_accounts` | trad/Roth IRA, 401k, backdoor Roth, HSA, SEP, solo-401k, RMD, **indian EPF/PPF/NPS** | 🟡 Indian EPF/PPF/NPS → 3520/FBAR flag; **US contributions/deductions ⛔** | Yes |
| `foreign_entities` | owns_10pct corp/partnership/DE, **foreign_corporations[]**, partnerships[], disregarded[], pfic_holdings[] | 🟡 **flags only** (CFC/PFIC conflict); **GILTI/Subpart-F/962 not computed ⛔** | **Yes (see Part F)** |
| `foreign_gifts_and_trusts` | gifts>100k, foreign trusts, covered-expat gift | ⛔ (3520 flagged via PPF only) | Reporting |
| `itemized_deductions_and_credits` | SALT, mortgage, charitable, medical, HSA, student loan, CTC, dependent care, education, saver, 529, **QBI** | 🟡 SALT/mortgage/charitable/medical; **QBI, credits (CTC/education/care) ⛔** | Yes (credits) |
| `amt_inputs` | ISO preference, SALT add-back, AMTI, TMT, AMT due, MTC carryforward | ⛔ **AMT not computed** | **Yes** |
| `niit_inputs` | MAGI, NII, threshold | ✅ engine computes NIIT | — |
| `ftc_inputs` | claims_ftc, simplified<300, accrued method, carryovers, **ftc_baskets[]** | 🟡 engine computes FTC itself; **baskets/carryovers/accrued election ⛔** | FTC precision |
| `withholding_and_estimated` | fed/state withholding, estimated Q1–4, prior-year tax, addl-Medicare | ✅ | — |
| `nra_specific` | files_1040nr, §6013(h), W-8BEN, W-7, **ECI/FDAP**, treaty_rate_claims[], FIRPTA, LRS investor | 🟡 1040NR/treaty-residence flags; **ECI/FDAP split, treaty rates, FIRPTA ⛔** | Yes (NRA tax) |

---

## Part D — Gaps that materially change tax (priority order)

1. **Multi-entity separation** (Part F) — S-corp/C-corp/partnership/Indian company are their own taxpayers; today flattened. *Biggest.*
2. **India business engine** — presumptive (44AD/ADA/AE), depreciation (asset_blocks), F&O/speculative, disallowances, partner-firm share.
3. **Carry-forward losses** (both sides) — change taxable income directly.
4. **US K-1 pass-throughs & SE** — partnerships/S-corp/C-corp/farm/trust income + SE tax.
5. **Equity comp / ISO → AMT** (US) and **ESOP perquisite** (India).
6. **Full capital-gains engine** (both) — property/equity/MF transaction-level, §112A/111A, §54 series.
7. **US state residency** — CA/NY statutory rules, MSRRA (unblocks live Monitor state drill-down).
8. **Salary exemptions** (HRA/LTA/perquisites) and **full Chapter VI-A** (India); **QBI + credits** (US).
9. **Special-rate income** (India 115BB gaming/lottery; deemed dividend) and **NRA ECI/FDAP** (US).

---

## Part E — What "comprehensive" wiring involves

- **`normalize.js`:** extend to read every section above into the unified model
  (currency-normalized, quarter-aware). Mechanical but large.
- **`computation.js`:** add the sub-engines the gaps require (India business/
  presumptive/depreciation/CG/losses; US AMT/K-1/SE/QBI/credits/state).
- **`conflicts.js` / `monitoring.js`:** new findings & thresholds unlocked by the
  new data (e.g., ISO-AMT alert, carry-forward expiry, presumptive turnover cap,
  NY 183-day).
- Keep everything **planning-grade & versioned** in `constants.js`.

---

## Part F — Multi-Entity Architecture

### F.1 Problem
A single "client" is often a **set of tax entities**: the individual (resident of
IN and/or US) plus companies, LLCs, partnerships, S/C-corps, trusts, HUF. Each is
a **separate taxpayer** with its own return, residency, computation, filings and
deadlines — and they **interrelate** (K-1 pass-through, dividends, GILTI/Subpart-F,
loans, salary). Today the engine flattens all of this into the individual. We need
first-class entities, kept separate, then consolidated.

### F.2 Data model — an *entity graph*

```jsonc
Engagement {
  client: { name, advisor, baseYear },
  entities: [ Entity, ... ],
  relationships: [ Edge, ... ]
}

Entity {
  id: "ent_1",
  kind: "individual" | "in_company" | "in_llp" | "in_firm" | "huf"
      | "us_scorp" | "us_ccorp" | "us_partnership" | "us_llc" | "us_trust",
  jurisdiction: "IN" | "US",
  returnForm: "ITR-2" | "ITR-3" | "ITR-6" | "1040" | "1120-S" | "1120" | "1065" | "1041",
  residency: {                    // entity-appropriate test
    // individual: ROR/RNOR/NR or SPT; company: POEM (IN) / state of incorporation (US)
    status, test, daysOrPoem
  },
  layer1Ref: { form: "india"|"us", path: "domestic_income.business_income.business_entries[0]" },
  income, deductions, tax,        // per-entity computed block (same shape as today, scoped)
  filings: [ { form, jurisdiction, dueDate, status } ],
  monitoring: { thresholds, projections, alerts }
}

Edge {                            // ownership / flow between entities
  from: "ent_owner",              // owner entity id
  to: "ent_child",                // owned entity id
  ownershipPct: 100,
  flow: "k1_passthrough" | "dividend" | "gilti" | "subpart_f" | "salary" | "loan" | "capital"
}
```

**Where entities come from in Layer 1**
- India: `profile.entity_type`; each `domestic_income.business_income.business_entries[]`
  and `partner_firms[]` → an entity; company if `entity_type==='company'`.
- US: `profile.tax_entity_type` / `llc_tax_election`; each `partnerships_k1[]`,
  `s_corporations_k1[]`, `c_corporations_1120[]`, `trusts_estates_k1[]`,
  `foreign_entities.foreign_corporations[]` → an entity.

### F.3 Engine flow (per entity → consolidate)
1. **Build the graph** from both Layer 1 states (an "entity extractor" in `normalize`).
2. **Compute each entity** with the right module:
   - IN company → 22%/25%/15% regimes, MAT, surcharge, cess (ITR-6).
   - US S-corp/partnership → entity return (mostly informational) + **K-1 out**.
   - US C-corp → 21% + potential PFIC/GILTI interplay.
   - Individual/HUF → current India/US individual engines.
3. **Flow along edges** to owners: K-1 pass-through into the owner's income;
   dividends; **GILTI/Subpart-F inclusion** for a US person owning an IN/foreign
   company; §962 election option.
4. **Consolidate** to each individual owner, then run the existing **cross-border
   layer** (residency conflicts, FTC, treaty) at the owner level.
5. **Conflicts at two levels:** entity-level (e.g., IN company POEM-in-India →
   dual company residency; PFIC on a fund held *inside* an entity) and owner-level
   (dual residency, FTC shortfall).

### F.4 Frontend design
- **Entity switcher** (header): "Consolidated ▾ / Aarav Sharma (Individual) /
  Sharma Consulting Pvt Ltd (IN Co) / Cloudscale LLC (US)". Scopes every view.
- **Per-entity dashboard**: each entity gets its own conflict/computation/filings
  panels (reusing today's components, scoped to that entity).
- **Consolidated (household) view**: rolls up all entities + the inter-entity
  flows (a small ownership graph diagram).
- **Monitor gains an entity dimension**: filter/group the exposure map & tables by
  entity as well as jurisdiction (e.g., "Sharma Consulting Pvt Ltd — India ITR-6
  due, GILTI inclusion on the US side").
- **Filings/Documents** become per-entity (ITR-6 for the company, 5471 for the
  owner, 1120-S + K-1 for the S-corp, …).

### F.5 Keeping entities separate (the core requirement)
- Every computed number is stored **on its entity node**, never merged globally.
- Consolidation is an **explicit, traceable roll-up** (edges), not a flatten — so
  you can always drill from the household number back to the entity that produced it.
- Cross-entity effects (GILTI, K-1, dividends) are **edges with formulas**, shown
  in the UI as flows, not hidden sums.

---

## Part G — Refactor / build plan (phased)

| Phase | Deliverable | Notes |
|---|---|---|
| **0** | *This doc* | ✅ scope agreed |
| **1** | Entity extractor + registry in `normalize` (individual + IN company + US pass-throughs) | Non-breaking: default = single individual |
| **2** | Per-entity computation modules (IN company, US S/C-corp, partnership) | Reuse existing individual engines |
| **3** | Inter-entity flows (K-1, dividends, GILTI/Subpart-F, §962) + consolidation | The hard tax logic |
| **4** | Frontend: entity switcher, per-entity views, Monitor entity dimension | Reuse components, add scope |
| **5** | Comprehensive Layer 1 field coverage fill-in (Parts B–D gaps) | Iterative by priority (Part D) |
| **6** | US state-residency engine (folds into entity/jurisdiction model) | Unblocks live state drill-down |
| **T** | **Demo test profiles** (`engine/profiles.js` + one-click loader + picker) — Part I | 2–3 individual profiles ship now; entity profiles after Phase 1 |

**Compatibility:** Phase 1 keeps the current single-individual behaviour as the
default (one entity), so nothing breaks while the graph is introduced.

---

## Part I — Demo test profiles (seamless one-click scenarios)

**Goal:** never type into a Layer 1 form during a demo. Pick a named profile →
both forms, the dashboard, and the Monitor all populate from it instantly.

**What already exists:** both forms have a `prefillPersona()` panel, but the
personas are **per-form, uncoordinated, and don't set the router** — so they can't
drive a whole cross-border scenario across every surface.

**Design:**
- A shared `engine/profiles.js` — an array of named profiles, each a complete
  `{ router, india, us }` bundle (same shapes the forms persist).
- A **profile loader**: writes the three `localStorage` keys
  (`wising_router_state`, `wising_layer1_india_state`, `wising_us_state`) and
  broadcasts a `storage` event, so open forms + dashboard + Monitor all refresh.
- A small **profile picker** UI (on the router/landing and as a dev affordance in
  the forms) — one click loads the whole scenario.
- Each profile is crafted to showcase a **specific conflict story**; profiles are
  **multi-entity-ready** (can include a business entity once Phase 1 lands).

**Proposed starter scenarios:**
1. **Dual-resident H-1B** (Aarav Sharma) — ROR + US SPT; the FTC/tie-breaker case (today's sample).
2. **Deemed RNOR / high-earner NRI** — s.6(1A), TRC/10F missing, LRS near cap.
3. **US citizen expat in India** — FEIE + foreign earned income + PFIC on Indian MFs.
4. **Founder with an Indian company** — individual + `in_company` entity → 5471/GILTI (exercises multi-entity once Phase 1 lands).

**Plan slot:** build after Phase 1 (so profiles can include entities), but the
2–3 individual-only profiles can ship immediately against the current engine.

---

## Part H — Honest limitations to keep stating
- Planning-grade tables (FY2025-26 / TY2025), not a filing engine.
- The engine trusts the Layer 1 forms' *final residency status* rather than
  re-deriving it from the determination inputs.
- FX is a flat anchor; statutory FTC needs per-transaction TT rates.
- Until Phases 1–4 land, multi-entity numbers are **flattened into the individual**
  and US-state rows in the Monitor are **illustrative**.

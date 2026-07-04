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
| `dtaa` | trc_status, treaty_residence, PE, treaty_elections, mfn, forced_nr | ✅ (elections/MFN 🟡); PE now drives the `pe_article7` finding (Art. 7 survives the tie-breaker) | Yes |
| `compliance_docs` | trc, form_10f, **section_197_cert**, chapter_xiia_elected | 🟡 TRC/10F read; Ch. XII-A now read and flags `chapter_xiia_not_computed` (election honoured, tax NOT yet recomputed at flat rates); **197 cert still ⛔** | XIIA flagged, not computed; 197 still open |
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
| `foreign_assets` / `foreign_income` | has_foreign_assets, assets[] | 🟡 `has_foreign_assets` now cross-checked against the US form (`schedule_fa_inconsistent`) — catches the two Layer 1 forms flatly disagreeing; the `assets[]` detail itself is still ⛔ | Sch FA completeness + a real cross-form data-integrity gap |
| `gift_received`, `salary_exemptions`, `other_exemptions` | (populated by sub-flows) | ⛔ | Yes |
| `quarters` Q1–Q4 | per-quarter income snapshots | ✅ summed to annual (`indiaAnnualSlice`) | Advance-tax pacing |

---

## Part C — US Layer 1 coverage (`usState`)

| Section | Key fields | Coverage | Changes tax? |
|---|---|---|---|
| `profile` | **tax_entity_type**, **llc_tax_election**, incorporation_state, filing_status, ssn/itin, dependents, spouse_is_us_person | 🟡 filing_status read; **entity_type/LLC election NOT branched ⛔** | **Yes (see Part F)** |
| `us_residency_detail` | SPT day-weighting, green card, exempt-individual, closer-connection, first-year choice, §6013(g), treaty residence, start/end dates | 🟡 final status + citizen/GC/SPT/days; **SPT weighting, exemptions, elections ⛔** | Status yes |
| `state_residency` | jan1/dec31 domicile, footprint[], moved, CA safe-harbor, **NY 183-day + abode + 548-rule**, MSRRA military, secondary states[] | 🟡 domicile/primary state, footprint, CA/NY flags now read and drive a **new "state treaty not binding" conflict finding**; full day-count/statutory-residency computation and the Monitor state-drill map are still ⛔ | **Yes (state tax)** — computation still the Monitor state-drill gap |
| `income_us_source` | wages_w2[], interest, ord/qual dividends, STCG/LTCG, rental, royalty, **self_employment[]**, **partnerships_k1[]**, **s_corporations_k1[]**, **c_corporations_1120[]**, **farming_schedule_f[]**, **trusts_estates_k1[]**, IRA/401k/SS distributions, crypto[], loss carryovers, QOF/QSBS/1031/installment/collectibles flags | 🟡 wages/interest/div/CG/rental; **all K-1 pass-throughs, SE, crypto, loss carryovers, special assets ⛔** | **Yes — large** |
| `income_foreign_source` | foreign wages[], interest, dividends, STCG/LTCG, rental, pension, §988[] | 🟡 amounts read; **§988, per-item sourcing ⛔** | Yes |
| `equity_compensation` | ISO/NSO/RSU/ESPP/83(b) exercises[] | 🟡 **ISO bargain-element spread now feeds AMT** (`iso_exercises[].amt_preference_spread_usd` → `amtPrefs`); NSO/RSU/ESPP ordinary income and cross-border sourcing still ⛔ | AMT done; NSO/RSU sourcing still yes |
| `foreign_earned_income` | FEIE claim, physical-presence/bona-fide, housing exclusion | 🟡 claim + amount; **housing exclusion, qualification test ⛔** | Yes |
| `bank_accounts[]`, `financial_holdings[]`, `fbar_aggregate_peak_usd`, `form_8938_required` | balances | ✅ FBAR peak; 🟡 8938 threshold table | Reporting |
| `real_estate` | properties[] (rent, expenses, §1031, depreciation, FIRPTA) | ⛔ (only hydrated from India side) | Yes |
| `retirement_accounts` | trad/Roth IRA, 401k, backdoor Roth, HSA, SEP, solo-401k, RMD, **indian EPF/PPF/NPS** | 🟡 Indian EPF/PPF/NPS → 3520/FBAR flag; **US contributions/deductions ⛔** | Yes |
| `foreign_entities` | owns_10pct corp/partnership/DE, **foreign_corporations[]**, partnerships[], disregarded[], pfic_holdings[] | 🟡 **flags only** (CFC/PFIC conflict); **GILTI/Subpart-F/962 not computed ⛔** | **Yes (see Part F)** |
| `foreign_gifts_and_trusts` | gifts>100k, foreign trusts, covered-expat gift | ✅ drives `foreign_gift_3520` (penalty-exposure finding) and `covered_expat_gift_tax` (§2801, a real tax, not just reporting); widened the `form_3520` trigger beyond PPF | Reporting + real tax (§2801) |
| `itemized_deductions_and_credits` | SALT, mortgage, charitable, medical, HSA, student loan, CTC, dependent care, education, saver, 529, **QBI** | 🟡 SALT/mortgage/charitable/medical; **QBI, credits (CTC/education/care) ⛔** | Yes (credits) |
| `amt_inputs` | ISO preference, SALT add-back, AMTI, TMT, AMT due, MTC carryforward | ✅ AMT (§55) now computed (AMTI, exemption phase-out, TMT vs regular tax) incl. ISO preference; 🟡 MTC carryforward (Form 8801) not tracked | Done; MTC carryforward remains |
| `niit_inputs` | MAGI, NII, threshold | ✅ engine computes NIIT | — |
| `ftc_inputs` | claims_ftc, simplified<300, accrued method, carryovers, **ftc_baskets[]** | 🟡 engine computes FTC itself; **baskets/carryovers/accrued election ⛔** | FTC precision |
| `withholding_and_estimated` | fed/state withholding, estimated Q1–4, prior-year tax, addl-Medicare | ✅ | — |
| `nra_specific` | files_1040nr, §6013(h), W-8BEN, W-7, **ECI/FDAP**, treaty_rate_claims[], FIRPTA, LRS investor | ✅ a dedicated `computeNraTax()` path now taxes ECI at graduated brackets (itemized-only) and FDAP flat at the claimed treaty rate / 30% (Schedule NEC), dispatched whenever `files_form_1040nr` is set without a §6013(g)/(h) election; US-side FTC is correctly zeroed (NRAs aren't taxed on foreign income). `form_8288_a/b` (FIRPTA remittance forms) still ⛔ | Computed for ECI/FDAP split; FIRPTA forms still doc-only |

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

## Part D.1 — Conflict-detection audit (this pass)

A dedicated pass over `engine/conflicts.js` against the Layer 1 fields above, scoped to
**conflict-detection completeness** (not the full computation-engine gaps in Part D). Closed:

- **NIIT / Additional Medicare not offset by the FTC** (`niit_medicare_not_creditable`) — these
  surtaxes sit outside §901/§904 entirely; the old FTC panel could read as "fully credited" while
  this residue silently stood. Now called out on its own whenever both apply.
- **No US-India Totalization Agreement** (`no_totalization_agreement`) — unlike ~30 countries with
  a US Totalization Agreement, a self-employed dual-resident owes full US SE tax with no
  double-coverage relief; this was entirely unflagged.
- **State residency vs. the federal treaty position** (`state_treaty_not_binding`) — the DTAA and
  the Article 4 tie-breaker are FEDERAL-only; a taxpayer can still be a full worldwide-income state
  resident (CA/NY domicile or statutory-day tests) with no state-level foreign tax credit. Wires a
  first slice of the previously-unused `state_residency` Layer 1 section (Part C) into a finding —
  the full day-count/statutory engine and Monitor state-drill map (Part D #7) are still open.
- **CFC / Form 5471 finding was overclaiming** — it read "computes the GILTI / Subpart F inclusion
  ... numbers already worked out," but no §951A/tested-income/QBAI computation exists anywhere in
  `computation.js`; the entity flow-through model (Part F) hasn't landed. Reworded to flag the
  required filing honestly without implying a liability number that isn't actually computed —
  important because this tool is read by tax professionals who will trust a stated "computed" figure.
- **ISO → AMT preference wiring** (Part D #5, half of it) — `equity_compensation.iso_exercises[]`
  carries its own `amt_preference_spread_usd` (FMV − strike × shares) but `normalize.js` never read
  it, so a real AMT trigger was silently dropped. Now summed into `deductions.us.amtPrefs`.
- **Equity-comp cross-border sourcing** (`equity_comp_sourcing`) — India's ESOP perquisite
  (s.17(2)(vi)) and the US's RSU-vest/NSO-exercise ordinary income are usually the same multi-year
  award split by country; when both fire in the same year, neither side applies a workday-based
  Art. 15/16 allocation, so the same tranche can be fully taxed twice. Flags it; the day-count
  allocation itself is still a manual step (needs vest-date-by-vest-date workday data Layer 1
  doesn't collect).
- **Foreign gifts / trusts** (`foreign_gift_3520`, `covered_expat_gift_tax`) — `foreign_gifts_and_trusts`
  was collected by Layer 1 but completely unused; Form 3520's *no-tax-but-25%-penalty* trap (gifts
  >$100k, foreign trust beneficiary) and the §2801 covered-expatriate transfer tax (an actual tax on
  the US recipient, not just an information return) were both silent. Also widened the `form_3520`
  document trigger, which previously only fired off PPF/EPF.
- **Permanent establishment survives the tie-breaker** (`pe_article7`) — `dtaa.has_permanent_establishment_in_india`
  was read into the model but never consumed anywhere. Article 7 gives India a taxing right on
  PE-attributable business profits regardless of who wins the Article 4 tie-breaker; this is a real,
  previously-silent gap — confirmed against the demo profile fixtures, where one profile (~$964k of
  Indian business income behind a PE) produced zero PE-related findings before this fix.
- **Chapter XII-A (s.115H/115C) election** (`chapter_xiia_not_computed`) — `compliance_docs.chapter_xiia_elected`
  was collected but ignored; when elected, India tax should be computed under this concessional
  flat-rate regime instead of slab rates, which the engine doesn't do. Flags the honesty gap rather
  than silently returning a wrong number.

- **NRA / Form 1040-NR** (`nra_fdap_flat_rate`, `nra_w8ben_missing`, `firpta`) — `nra_specific` was
  read only for a `files_1040nr` flag; the ECI/FDAP split, treaty-rate claims, W-8BEN, and FIRPTA
  withholding were all collected and ignored. Confirmed as a real, previously-silent gap: one demo
  profile has genuine 1040-NR FDAP income and produced zero NRA-related findings before this fix.
- **Actual NRA tax computation** — went further than a flag: added `computeNraTax()` in
  `computation.js`, dispatched from `computeUsTax()` whenever `files_form_1040nr` is set without a
  §6013(g)/(h) election. It taxes ECI at graduated brackets (itemized deductions only — NRAs
  generally can't claim the standard deduction) and FDAP flat at the claimed treaty rate / 30%
  statutory default (Schedule NEC), using Layer 1's own pre-classified `us_eci_income_usd` /
  `us_fdap_income_usd`. Also had to guard `computeFtc()`: the `: 1` fallback in the creditable-fraction
  math (correct for the ordinary case) was silently presenting an NRA's full India tax as an
  unrelieved US-side FTC shortfall, when in fact the US never taxes an NRA's foreign-source income at
  all — caught this while building the fix, not before. `taxComputation.us` gets a dedicated
  ECI/FDAP-split breakdown instead of the resident-style row set when `isNra` is true.

- **Cross-form data-integrity check** (`schedule_fa_inconsistent`) — a different category of gap from
  everything else in this audit: not a missing tax-law finding, but a missing CONSISTENCY check
  between the two independently-filled Layer 1 forms. When India's own form says "no foreign assets"
  while the US form shows US-source income/accounts for the same India-ROR taxpayer, the two forms
  are flatly contradicting each other — nothing today compared them against one another before this.

**Still open in conflict detection** (tracked here, not yet built): entity-level dual residency for
an Indian company under POEM vs. US management-and-control, a numeric GILTI/Subpart F computation
once Part F lands (blocked on Layer 1 not collecting tested income/E&P/QBAI), Chapter XII-A actual
flat-rate recomputation (blocked on Layer 1 not tagging which income is a "specified foreign-exchange
asset"), and the equity-comp sourcing day-count allocation (blocked on Layer 1 not collecting
per-tranche workday-in-country data) — all three remaining items need new Layer 1 fields, not just
engine wiring, so they stay flagged rather than computed.

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

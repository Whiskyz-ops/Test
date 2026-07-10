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
| `other_sources` | savings/FD/bond interest, dividend, gifts>50k, family pension, lottery/gaming, deemed dividend (buyback), EPF/PPF interest taxable, NPS/PF withdrawal, angel tax, LIC, clubbing (minor/spouse) | ✅ lottery/online-gaming (s.115BB/115BBJ) now computed at the correct flat 30% (uncapped surcharge, no rebate) and drives `special_rate_gaming_winnings`; unexplained income (s.115BBE) flagged via `s115bbe_unexplained_income` (not computed — the ~78% effective rate with zero relief is high-risk to get wrong); interest+dividend already read; **gifts, clubbing, taxable PF/NPS, deemed dividend still ⛔** | Gaming done; rest open |
| `deductions` | s80C, 80CCC/CCD1, **80CCD1B**, 80D (+parents/senior/preventive), 80DD, 80DDB, 80U, **80G[]**, 80GGB/GGC, 80GG, 80TTA/TTB, 80E, 80EEA/EE, 80M | 🟡 80C/80CCD1B/80D/80TTA; **80G, 80E, 80EEA, 80U/DD/DDB, 80GG, 80M, disability NRI-block ⛔** | Yes |
| `carry_forward_losses` | business/speculative/STCG/LTCG/HP loss CF, unabsorbed depreciation, s79 shareholding change | 🟡 raw counts read and drive `carry_forward_losses_not_applied` (honesty disclosure — an unset-off loss overstates current-year tax and the FTC/double-tax figures); **actual set-off computation still ⛔** | **Yes — large**, still open |
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

- **Entity-level dual residency, India side** (`entity_dual_residency_poem`) — India Layer 1 added a
  `company_residency` section (raw POEM facts: board-meeting location, key-management location,
  director split) feeding its own client-side solver, same pattern as the individual residency
  wizard. The engine reads the raw facts (not the form's derived POEM guess) plus the existing
  `is_indian_company` flag: when a company is on file as NOT Indian-incorporated but still resolves
  to ROR, that combination *is* the POEM-in-India signal — India's s.6(3) test only reaches ROR for
  a foreign-incorporated company via POEM. Confirming the OTHER side's own residency test (e.g. US
  place-of-incorporation) still needs the US Layer 1 changes, which are in progress separately.
- **ESOP per-grant data** — `esop_perquisite_events[]` (grant date, vest/exercise date, per-grant
  perquisite value) replaces relying on the single annual `esop_perquisite_inr` total when itemized;
  `equity_comp_sourcing` and the equity-comp aggregate now prefer the per-grant sum. Sets up (but
  doesn't yet finish) date-matching against US RSU grant dates once the equivalent US Layer 1 fields
  land.
- **Specified foreign-exchange asset tagging** — `financial_holdings` transactions now carry
  `is_specified_foreign_exchange_asset`, plus three new asset-class options (NRI specified debenture
  / company deposit / govt security). Chapter XII-A eligibility can now be identified per-transaction
  rather than inferred; the flat-rate recomputation itself is still open (see below).

## Part D.2 — India Layer 1 deeper pass (second round, post-restructure)

A follow-up pass after India Layer 1 was substantially restructured (step-wizard reorder, new
sections) by the user/Antigravity. First confirmed no regressions — every field path the engine
already depended on (profile, residency_detail, dtaa, deductions, etc.) still exists after the
restructure. Then went beyond the 3 originally-scoped items:

- **Special-rate winnings actually computed** (`special_rate_gaming_winnings`) — s.115BB (lottery/
  betting) and s.115BBJ (online gaming) income was previously invisible to the *entire* model (not
  even in total income), despite being real, flat-30%-taxed income and a genuine cross-border
  double-tax candidate when the US also taxes worldwide income. Now aggregated, taxed at the correct
  flat 30% with no basic exemption/deduction/rebate, and — importantly — kept OUT of the CG/dividend
  15%-surcharge-cap bucket (s.115BB does not get that cap; verified the surcharge delta at a >₹2cr
  income level matches the uncapped 25% rate, not a wrongly-capped 15%).
- **s.115BBE unexplained income flagged** (`s115bbe_unexplained_income`) — ~78% effective rate,
  denies every deduction/exemption/set-off with no exceptions. Flagged rather than computed (unlike
  115BB above) — getting a provision this punitive wrong is worse than leaving it explicit.
- **Carry-forward losses surfaced** (`carry_forward_losses_not_applied`) — collected but not applied
  anywhere in the computation; an unset-off loss overstates current-year tax and, downstream, the
  FTC/double-tax headline figures. Flagged as an honesty disclosure rather than computed (full set-off
  ordering — business → speculative → capital → house property, 8-year limits, inter-head
  restrictions — is a bigger lift than fits this pass).
- **Deemed dividend on buyback** (`deemed_dividend_buyback_mismatch`) — `deemed_dividend_from_buyback_inr`
  (s.2(22)(f), effective 1-Oct-2024: full buyback consideration taxed as dividend at slab rates, share
  cost becomes a capital loss) was computed by the form but never read anywhere. Now included in total
  income (taxed at slab rates, same bucket as ordinary dividend) and drives a new characterization-
  mismatch finding: India taxes the cash as dividend, the US almost certainly taxes the same cash as
  capital gain/return of capital — same money, different character, which can distort the FTC basket.
- **Retirement mismatch quantified** — `retirement_mismatch` previously only checked whether an EPF/
  PPF/NPS account *existed*; it now reads the actual `taxable_epf_interest_inr` /
  `taxable_nps_withdrawal_inr` figures Layer 1 collects and states the US-taxable exposure as a real
  dollar amount when available, instead of a generic warning with no figure attached.

**Still open in conflict detection** (tracked here, not yet built): the US side of entity dual
residency (needs the US Layer 1 changes in progress), a numeric GILTI/Subpart F computation once
Part F lands (blocked on Layer 1 not collecting tested income/E&P/QBAI), Chapter XII-A's actual
flat-rate recomputation (now identifiable per-transaction, but not yet computed), the equity-comp
sourcing day-count allocation (still needs per-tranche workday-in-country data on both sides), actual
loss set-off computation, and the remaining `other_sources` items (gifts, clubbing, taxable PF/NPS
withdrawal, deemed dividend on buyback) which are collected but still unused.

---

## Part D.3 — DTAA visibility pass (third round)

The user audited the demo profiles and, separately, flagged that the DTAA aspect of the product
"is not visible at all." Investigated before touching code and found two concrete, previously-unread
Layer 1 fields:

- **Article 4 tie-breaker reasoning** — Layer 1's `evaluateTieBreaker()` walks permanent home →
  centre of vital interests → habitual abode → nationality and records each step's raw answer
  (`dtaa.tb_home` / `tb_cvi` / `tb_abode` / `tb_nationality`), but the engine only ever read the final
  winner (`dtaa_treaty_residence`). Added `describeTieBreak()` in `conflicts.js`, which mirrors Layer
  1's own step sequence, so `dual_residency_resolved` now states WHICH test decided it (e.g. "Art.
  4(2)(a): centre of vital interests is closer to the US"), not just the verdict. Also added a
  distinct MAP-required variant of `dual_residency` (same finding id, different text) for the genuine
  Art. 4(3) case where all four tests come back "tie" — that's a competent-authority procedure, not
  an incomplete form, and conflating the two would send a tax professional back to re-run a wizard
  that's already been exhausted.
- **Per-income-stream treaty elections** — `dtaa.treaty_elections[]` (e.g. claiming Art. 11(2)(b) 15%
  on India-source interest instead of the ~20%+cess s.115A domestic withholding) was captured by Layer
  1 and had zero references anywhere in the engine. Now read into `model.treaty.treatyElections`,
  folded into the `treaty_docs_missing` trigger condition (claiming a per-stream treaty rate is itself
  a treaty claim, same as claiming treaty residence), and surfaced as its own `dtaa_treaty_elections`
  finding listing each stream/article/rate on file.
- **Not done in this pass, flagged separately**: an actual s.115A-vs-treaty-rate computation (i.e.
  recomputing India withholding tax under the elected rate) — the new finding surfaces what's claimed,
  it doesn't yet validate the rate against the treaty text or recompute tax under it.
- **Fixed in a follow-up pass**: HUF fell through to the individual slab computation path in
  `computeIndiaTax()` and incorrectly received the §87A rebate, which s.87A restricts to a "resident
  individual." Gated the rebate on `model.entity.indiaKind === "individual"` — HUF/AOP/BOI/trust still
  share the same slab structure (correct — s.87A is the only piece that's individual-only), they just
  no longer get the rebate. Verified with a synthetic ₹6L-income test: an individual still gets the
  full rebate (₹0 net tax), an otherwise-identical HUF now correctly owes ₹10,400 — confirmed no
  existing demo profile is HUF-typed, so all 8 profiles' figures are unchanged.

---

## Part D.4 — DTAA detail + PAN/Aadhaar (fourth round)

User feedback on the Part D.3 findings: the treaty-election finding named the elected rate but not
what it was displacing, and didn't say anything about document status for that specific claim; also
flagged a completely separate gap — Layer 1's PAN/Aadhaar-linked toggle had zero effect anywhere.

- **`dtaa_treaty_elections` now shows the domestic s.115A rate being displaced**, per stream, so the
  election reads as "interest @ 15% (Art 11(2)(b)) (vs 20% domestic s.115A rate — treaty saves 5
  points)" instead of just the bare elected rate. If the elected rate isn't actually lower than the
  domestic default, the finding says so explicitly ("elected rate is NOT lower; confirm this is really
  beneficial") rather than silently taking the number at face value.
- **The same finding now self-checks TRC/Form 10F status** instead of relying on the separate
  `treaty_docs_missing` finding to imply the connection: if either is missing, severity bumps from INFO
  to WARNING and the detail states plainly that these specific elections are at risk of being denied
  and defaulting back to the full domestic rate u/s 90(4).
- **New finding `pan_not_linked_aadhaar`** — `profile.pan_aadhaar_linked` was captured by Layer 1 (the
  profile step's Aadhaar-linked toggle) and had zero references anywhere in the engine. An unlinked PAN
  is "inoperative" under Rule 114AAA: every payer must withhold at the higher default rate u/s
  206AA/206CC (generally 20%, or double the TCS rate) regardless of any slab/special/treaty rate that
  would otherwise apply, refunds are withheld, and interest keeps accruing. CRITICAL severity — this
  silently invalidates every other withholding-rate figure on the page when it fires.
- **New demo profile `sharma_huf`** (Part I) exercises both this round's PAN/Aadhaar finding and the
  Part D.3 HUF-vs-individual §87A fix in one place, and `dual_resident_h1b` (Aarav) now carries a real
  Art. 4 tie-break path and a treaty election so the Part D.3 reasoning/election capabilities actually
  render in the one-click demo (they didn't have a trigger before this round).

---

## Part D.5 — Overclaiming audit + real loss set-off (fifth round)

User spot-checked 4 findings against the actual code and found: (1) the AMT finding didn't say which
country's AMT it was, (2) asked whether NIIT/Medicare exclusion from the FTC base was actually
verified (it was — see below), (3) said carry-forward losses should be a real computation, not a
flag, and (4) asked what the retirement-account finding's recommendation text actually meant. Audited
every `"WISING ..."` claim in `conflicts.js`'s recommendation text against the real implementation and
found the same overclaiming pattern in several more places.

**Confirmed overclaims, fixed:**
- `amt_applies` — title/detail didn't say this is a US-only tax (IRC §55, no India equivalent); now
  explicit.
- `dual_residency` — said WISING "produces Form 8833" and "TRC/Form 10F support"; it only flags them
  as required on the filing checklist. Corrected to say so.
- `ftc_gap` — said WISING "books the excess credit to the §904(c) carryover schedule... tests treaty
  re-sourcing... tracked year over year"; **none of this exists** — this is a single-year snapshot
  calculator with no cross-year persistence and no re-sourcing test anywhere in the code. Corrected to
  state the carryover is *eligible* under §904(c) but must be manually re-entered next year, and that
  re-sourcing isn't tested automatically.
- `form67_required` — said WISING "prepares and e-files Form 67... no manual action needed"; there is
  no e-filing capability in this codebase. Corrected to "flags... as required on the filing checklist."
- `retirement_mismatch` — said WISING "checks whether each account is a treaty-protected pension
  (Article 20) or a trust" (no such check exists anywhere) and "adds the yearly interest to US income"
  (previously **false** — see the real fix below, now true). Corrected the Article 20/trust claim to
  say plainly that's a determination the user must make themselves.
- `cfc_below_threshold` — milder overclaim ("re-checks automatically... flags the moment ownership
  changes" implied background monitoring); corrected to "recomputes every time you re-run the numbers."

**Verified NOT a bug** (user's question 2): `usIncomeTaxUsd`, the base used for the US-side FTC
limitation, is `ordinaryTax + preferentialTax` only — NIIT, Additional Medicare, SE tax and AMT are all
deliberately excluded. So the "these surtaxes aren't creditable" finding is consistent with the actual
FTC computation; there's no double-counting or accidental crediting anywhere.

**Real gap, now fixed**: `taxable_epf_interest_inr` / `taxable_nps_withdrawal_inr` were read only to
*display* inside the `retirement_mismatch` finding text — never added to the actual US tax computation.
Folded into `aggregateUsIncome()`'s foreign-source interest/pension (gated on `res.us.worldwide`, same
condition the finding itself uses), so this now genuinely changes the US tax total. Verified with a
controlled before/after diff: $542 of taxable EPF interest raises US tax by ~$173.

**Real carry-forward loss set-off, now computed** (`computeLossSetOff` in `computation.js`): reads the
`final_allowed_amount_inr` Layer 1 already resolves per entry (late-filing denial, new-regime HP/
business-depreciation restrictions already baked in) and sequences the actual set-off against this
year's income: business loss → business income only (s.72); house-property loss → house-property
income only (s.71B, no inter-head for b/f); STCG loss → STCG then any remainder against LTCG (s.74);
LTCG loss → LTCG only; unabsorbed depreciation (s.32(2)) → business → house property → capital gains →
other non-salary income, no time limit. `carry_forward_losses_not_applied` now reports what was
actually applied vs. what's still carrying forward, with three distinct states (fully set off /
partially / none) verified via the `dual_resident_h1b` (full STCG-loss absorption) and `sharma_huf`
(nothing to absorb against) demo profiles.

**Known, disclosed simplification carried over**: speculative business loss (s.73) can only be set off
against speculative business income, which Layer 1 doesn't collect as a separate bucket from ordinary
business income — so a speculative loss always stays fully carried forward here rather than being
(wrongly) absorbed against ordinary business income.

**Fixed in an immediate follow-up**: `totalIncomeInr` and `grossTotalIncomeInr` in `computeIndiaTax`
used gross LTCG (pre-loss-set-off AND pre-s.112A-exemption) while `specialTaxInr`/
`capEligibleSpecialTaxInr` (and, downstream, the surcharge threshold test) used the exemption-adjusted
`ltcgTaxableInr` — the exempt slice of LTCG was silently inflating total income even though it isn't
part of total income at all. Both now use `ltcgTaxableInr` consistently. Verified with a synthetic
₹6L-salary + ₹5L-LTCG test: before the fix, `totalIncomeInr` was ₹11,00,000 (included the full exempt
₹1,25,000); after the fix it's the correct ₹9,75,000.

**Bifurcated across demo profiles** (user: every change we make needs a one-click way to see it, spread
across different profiles rather than piled onto one or two): at the time of the LTCG fix, no demo
profile carried LTCG income at all, and the NPS half of the EPF/NPS income-wiring fix (Part D.5) and
the "partially set off" state of loss set-off (only "fully" and "none" existed) had no trigger either.
Added, one case per profile so each demonstrates something distinct:
- **`india_ror_us_income`** (Anita) — ₹300,000 LTCG (above the ₹1,25,000 s.112A exemption), exercising
  the gross-vs-exemption-adjusted fix. Verified: `grossTotalIncomeInr` = ₹39,75,000 = salary (36L) +
  interest (2L) + net LTCG (3L − 1.25L = 1.75L), confirmed by hand.
- **`us_citizen_expat_india`** (Grace) — ₹30,000 taxable NPS withdrawal, distinct from Aarav's EPF-
  interest case; verified it raises her US tax the same way.
- **`founder_indian_company`** (Vikram) — a ₹1L current-year STCG gain against a ₹2.5L brought-forward
  STCG loss: ₹1L absorbed, ₹1.5L still carrying forward — the "partially set off" branch, distinct from
  Aarav's full absorption and the HUF's total non-absorption.

---

## Part D.6 — DTAA treaty elections actually computed (sixth round)

User pushed back on "WISING does not yet recompute India withholding tax under these elected rates" —
asked whether Schedule FA/FSI's foreign-income figures meant this was actually calculable. Investigation
found: royalty/FTS/capital_gains genuinely have no income amount anywhere in Layer 1 to apply a rate to
(confirmed by re-reading `renderDtaaElections()` in `layer1_india.html` — the table has no amount
column, `elected_rate`/`treaty_article` are read-only auto-filled reference values). But **interest and
dividend do have real income figures** (`model.income.india.interest`/`.dividend`), and there was no
reason those couldn't be computed — I'd been wrong to call the whole feature alert-only.

Deeper issue found in the process: **s.115A (and therefore any DTAA election under it) only applies to
a genuine domestic NON-RESIDENT** — a ROR who "cedes" treaty residence to the US in an Article 4
tie-break is still domestically resident and pays ordinary slab rates on India-source interest/dividend
regardless of the treaty outcome. The original treaty-election demo was on Aarav (ROR) — conceptually
wrong profile. Moved to Rohan and Vikram (both domestically NR).

**Implemented**: `computeIndiaTax()` now pulls India-source interest/dividend OUT of the slab bucket for
NR taxpayers and taxes it under s.115A at whichever is lower — the domestic default (`S115A_RATES` in
`constants.js`, shared with the finding text so they can't drift) or a DTAA-elected rate, but **only**
when TRC/Form 10F support the claim. Critically, `resolveS115aRate()` takes `Math.min(domestic, elected)`
— s.90(2) guarantees the assessee whichever is more beneficial, never a worse rate just because a
(possibly mistaken) election is on file. Royalty/FTS/capital_gains elections remain disclosed-only,
correctly, since there's still no income figure to apply them to.

**Also found and fixed in the same pass**: §87A rebate was gated on entity type (Part D.3's HUF fix) but
not on residency status — an NR individual was still getting the "resident individual"-only rebate.
Fixed by adding `!isNR` to the gate (RNOR still qualifies — only genuine NR does not).

**Bifurcated across profiles to show three distinct outcomes**:
- **`us_resident_indian_income`** (Rohan) — a genuinely beneficial interest election (15% vs. 20%
  domestic) that's **denied** because TRC/Form 10F are missing; computation correctly falls back to the
  20% domestic rate.
- **`founder_indian_company`** (Vikram) — a dividend election on file at 25% (worse than the 20%
  domestic rate) with TRC/Form 10F **present**; computation correctly ignores the election anyway since
  domestic is more beneficial (s.90(2) protection working as intended, not just "election not applied").
- Removed the (conceptually incorrect) election from Aarav; verified via harness that both NR profiles'
  §87A rebate is now ₹0, and that the s.115A tax lines appear in the tax computation table breakdown.

---

## Part D.7 — Per-election amounts + royalty/FTS now computed (seventh round)

User sent an updated `layer1_india.html` adding a per-election `amount_inr` box to the DTAA table (so
the taxpayer enters the specific rupee amount being claimed against each treaty rate, instead of the
engine assuming an election covers 100% of a stream). Audited the file first (diff against the prior
upload after stripping CRLF noise — only ~30 real lines changed): both earlier bug fixes carried
through untouched, the new Amount column and colspan updates were correct, and a new defensive
"force-hide POEM section" reset at the top of `syncResidencyUI()` was verified NOT a regression (the
`entity === 'company'` branch further down still correctly re-shows it). Found one new bug —
`updateDtaaElection`'s generic branch didn't parse `amount_inr` through `parseINRCurrency()` like every
other money field in the file — sent as a one-line Antigravity fix, confirmed applied in the next
upload (single-line diff, nothing else touched), then adopted the file into both repo copies.

**Implemented**: `computeS115aStream()` in `computation.js` replaces the old flat-rate `resolveS115aRate`
approach. For interest/dividend (which have a broader `other_sources` aggregate), each matching election's
`amount_inr` is a CLAIM against that aggregate — capped so elections can't claim more than the total
exists, and whatever part of the aggregate isn't covered by any election still gets taxed, just at the
plain domestic rate. For royalty/FTS (no aggregate exists anywhere in Layer 1 — the election table is
the only place this income is ever recorded), the summed election amounts ARE the total for that stream,
computed for the first time. Each election's rate is still `Math.min(domestic, elected)` per s.90(2), and
still gated on TRC/Form 10F being on file.

**Bifurcated to show four distinct real outcomes across two profiles** (rather than one contrived
example):
- **Rohan** — ₹1.5L of his ₹2.6L NRO interest claimed at 15% (denied, docs missing, falls back to 20%
  on the whole ₹2.6L) + a new ₹4L royalty stream at 15% (denied for the same reason, and would have been
  worse than the 10% domestic rate anyway even with docs).
- **Vikram** — his existing ₹5L dividend election at 25% (still correctly ignored, 20% domestic wins) +
  a new ₹2L interest election at 15% with TRC/Form 10F **present** — this one genuinely succeeds
  (effective rate 15% vs. 20% domestic), the first demo of an election actually lowering tax.

Verified via node harness (exact rupee figures checked by hand: Rohan's royalty tax = ₹4,00,000 × 10% =
₹40,000; Vikram's interest tax = ₹2,00,000 × 15% = ₹30,000) and live in the dashboard.

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
| **T** | **Demo test profiles** (`engine/profiles.js` + one-click loader + picker) — Part I | Done — 9 realistic profiles (5 individual, 4 entity, incl. HUF), covering every finding id |

**Compatibility:** Phase 1 keeps the current single-individual behaviour as the
default (one entity), so nothing breaks while the graph is introduced.

---

## Part I — Demo test profiles (seamless one-click scenarios)

**Status: built.** `engine/profiles.js` ships 9 named profiles, each a
realistic, internally-coherent persona (no synthetic "test everything" filer —
an earlier `kitchen_sink_qa` profile was tried and deliberately removed; every
finding it covered was instead folded into a genuine persona below).
`loadProfile(id)` writes all three `localStorage` keys (`wising_router_state`,
`wising_layer1_india_state`, `wising_us_state`), wipes any other `wising_*` key
first (no bleed-through from a previously loaded profile or a manually-edited
Layer 1 form), and broadcasts `storage`/`wising:profile` events so open forms,
the dashboard, and the Monitor all refresh from one click — no manual typing
during a demo.

**The 9 profiles:**
1. **`dual_resident_h1b`** — Aarav Sharma, senior tech hire in California. India ROR + US SPT; the flagship FTC/tie-breaker case. An ISO exercise triggers `amt_applies` and mirrors an ESOP grant from his prior Indian employer (`equity_comp_sourcing`); also carries `niit_medicare_not_creditable`, `carry_forward_losses_not_applied`, `state_treaty_not_binding` (California), a Schedule FA form-consistency slip (`schedule_fa_inconsistent`), and a walked-through Art. 4 tie-break (permanent home ambiguous → CVI decides for the US). No treaty election here — he's domestically ROR, and s.115A (what an election overrides) only applies to a genuine NR; see Rohan and Vikram below for that.
2. **`us_resident_indian_income`** — Rohan Mehta, US green-card holder with Indian rent/dividends/mutual funds and a US-side consulting gig. FTC (Form 1116), PFIC, FBAR, a below-10%-threshold India business stake (`cfc_below_threshold`), `no_totalization_agreement` on his US self-employment tax, occasional online-gaming winnings (`special_rate_gaming_winnings`), an unexplained cash deposit (`s115bbe_unexplained_income`), and a genuinely-beneficial interest treaty election (15% vs 20% domestic) that's **denied** because TRC/Form 10F are missing — computation correctly falls back to the domestic rate.
3. **`india_ror_us_income`** — Anita Desai, Indian ROR (formerly NRI) with US rental/dividends/brokerage. `nra_fdap_flat_rate`, `nra_w8ben_missing`, `firpta` on a US property sale, a retained Chapter XII-A election (`chapter_xiia_not_computed`) kept after becoming ROR, and ₹3L LTCG above the s.112A exemption (exercises the gross-vs-exemption-adjusted `totalIncomeInr` fix).
4. **`founder_indian_company`** — Vikram Rao, US resident owning 100% of an Indian Pvt Ltd. `cfc` / Form 5471, a partial share buyback from his own company (`deemed_dividend_buyback_mismatch`), a brought-forward STCG loss bigger than this year's STCG gain (the "partially set off" state of loss set-off), and a dividend treaty election on file at 25% (worse than the 20% domestic rate) with TRC/Form 10F **present** — computation correctly ignores the election since domestic is more beneficial (s.90(2) protection, not just "not applied").
5. **`us_citizen_expat_india`** — Grace Thomas, US citizen living in India. FEIE + PFIC (citizenship-based taxation), a gift from her father — a long-term green-card holder who relinquished it and was found to be a covered expatriate (`foreign_gift_3520`, `covered_expat_gift_tax`), and a taxable NPS withdrawal (the NPS half of the EPF/NPS US-income wiring, distinct from Aarav's EPF-interest case).
6. **`india_pvt_ltd`** — Business POV: Indian domestic company, §115BAA, ITR-6.
7. **`us_ccorp_indian_sub`** — Business POV: Delaware C-Corp with an Indian subsidiary; GILTI.
8. **`foreign_holdco_poem_india`** — Business POV: foreign-incorporated (Singapore) holding company whose Place of Effective Management facts resolve it to an Indian tax resident anyway (`entity_dual_residency_poem`) — entity-level dual residency with no individual-style tie-breaker.
9. **`sharma_huf`** — Business POV: an HUF managing ancestral property and FD investments in India. Control-and-management residency test (not day-count, not POEM). Sits right at the §87A rebate threshold — demonstrates the entity-aware fix that HUF is not entitled to the individual-only rebate. PAN also unlinked from Aadhaar (`pan_not_linked_aadhaar`).

**Coverage guarantee:** every finding `id` emitted by `detectConflicts()` in
`conflicts.js` fires in at least one of the 9 profiles — verified by running
`WISING.analyze()` against all 9 and diffing the union of triggered ids against
every `add(id, ...)` call site in the source. When a new finding is added to
`conflicts.js`, extend the existing profile whose persona it fits most
naturally (don't reach for a synthetic kitchen-sink profile) so this stays
true — otherwise there is no one-click way to verify the new finding actually
renders.

---

## Part H — Honest limitations to keep stating
- Planning-grade tables (FY2025-26 / TY2025), not a filing engine.
- The engine trusts the Layer 1 forms' *final residency status* rather than
  re-deriving it from the determination inputs.
- FX is a flat anchor; statutory FTC needs per-transaction TT rates.
- Until Phases 1–4 land, multi-entity numbers are **flattened into the individual**
  and US-state rows in the Monitor are **illustrative**.

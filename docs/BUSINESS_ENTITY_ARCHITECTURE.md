# Business & Multi-Entity Architecture — Spec

**Supersedes Part F/G of `COVERAGE_AND_ARCHITECTURE.md`.** Those sections described an entity-graph architecture that was never built; what shipped instead (`BusinessView.jsx`, a flat entity list) is simpler and the two were never reconciled. This document replaces both with a spec grounded in what Layer 1 *actually* collects today (verified by direct grep against `layer1_india.html` / `layer1_us.html`, not recalled from the old plan) and a phased build order.

**Directive this doc executes on:** *"We need multi-entity architecture and a thorough spec for the business entities — we cannot keep it shallow at all."*

---

## 0. The finding that reframes everything

**India business/firm/company computation is not "shallow" — it is currently non-functional against real Layer 1 data.**

`normalize.js` reads `b.net_profit_inr` off every `business_entries[]` item (lines 143 and 1228) to build both the business-income aggregate *and* the entity tax base (`computeIndiaEntityTax`'s `taxable = inc.total.inr` at computation.js:554, used for company 22%/25%/15%+MAT **and** firm/LLP flat-30% computation alike).

`net_profit_inr` **does not exist anywhere in `layer1_india.html`.** Grep across the entire 18,000+-line form for that field name returns zero matches. The form collects turnover, receipts (digital/cash split), a full expense-category breakdown, depreciation asset blocks, F&O/speculative splits, partner-firm remuneration, MSME payment timing — and never computes or exports a net-profit summary.

The only place `net_profit_inr` is ever set is hand-authored demo data in `engine/profiles.js` (Rohan Mehta's consulting firm, Nimbus Analytics Pvt Ltd, Cloudspire India, Meridian Holdings) — every one of which bypasses the real computation path by injecting a number the actual form structurally cannot produce. **Every business/company/firm demo profile in this app works only because it cheats past a computation gap that would zero out any real filer's business income.**

A parallel, smaller version of the same bug exists on the US side: `partnerships_k1[].guaranteed_payments_usd` is fully collected by Layer 1 US (with correct per-K1 branch aggregation) but is read **nowhere** in `normalize.js` — not into `businessUs`, not into SE-tax base, not into QBI exclusion. A general partner's guaranteed payments (SE-tax-subject, QBI-*ineligible*, unlike ordinary K-1 income) are silently dropped from income entirely.

**Phase 0 below fixes both of these before anything else, because every other phase's numbers are meaningless until the base computation actually runs.**

---

## 1. What Layer 1 already collects, by entity type

Verified directly against the two forms — this is the actual current data model, not the old plan's sketch.

### India — `domestic_income.business_income` (per-entry: `business_entries[]`)

| Field group | Contents |
|---|---|
| Entry identity | `business_name`, `nature`, `presumptive_scheme`, `turnover_inr`, `digital_receipts_inr`, `cash_receipts_inr`, `ada_digital_receipts_inr`, `ada_cash_receipts_inr` (44ADA split), `gross_receipts_inr`, `branches[]` |
| Expenses (full category breakdown, `expenses{}`) | Rent, repairs, salary/wages, bonus/commission, interest on borrowed capital, insurance, bad debts, other; s.40A(3) cash-payment-limit tracking (`total_cash_payments_exceeding_35k_inr`, `cash_limit_type`); s.40(a) non-TDS payment disallowance (`payments_to_non_residents_no_tds_inr`, `payments_to_residents_no_tds_inr` — **already read** for the disallowance finding, not yet fed into net profit); s.35 R&D (own revenue/capital, donation to approved body); s.35D preliminary expenses + amortization year; s.35DDA VRS payments + first year; F&O-specific (STT/CTT paid, brokerage, exchange charges, advisory/data subscriptions, margin interest, home-office/internet proportion); employer PF/ESI contribution + due-date-paid flag (s.36(1)(va)/s.43B disallowance trigger) |
| Depreciation | `asset_blocks[]` (opening WDV, additions, block rate — s.32 WDV method) |
| F&O / speculative | `speculative_income_inr`, `speculative_turnover_inr`, `non_speculative_income_inr`, `fno_turnover_inr` — collected as **separate** buckets (correct — F&O is non-speculative business income per the s.43(5) proviso; speculative equity delivery-fail trades are a genuinely separate, ring-fenced bucket that can only be set off against speculative income) |
| Remissions | `s41_remission_income_inr`, `s41_bad_debt_recovery_inr` |
| Partner-firm pass-through | `partner_firms[]`: `firm_name`, `entity_type`, `remuneration_from_entity_inr`, `interest_on_capital_from_entity_inr`, `profit_share_exempt_inr` |
| Other presumptive/specified regimes | `s44bbb_receipts_inr` (foreign companies, civil construction/turnkey power projects, presumptive 10%), `specified_business_s35AD_inr` (s.35AD capital expenditure deduction for specified businesses — cold chain, warehousing, hotels, etc.), `tonnage_tax_115V_inr` (shipping companies, tonnage-based presumptive scheme) |
| Compliance | `msme_payables[]` (s.43B(h), Finance Act 2023 — unpaid-beyond-terms MSME dues disallowed), `amt_credit_bf_inr` (AMT/MAT credit brought forward — **the same field serves both s.115JC non-corporate AMT and s.115JD corporate MAT credit**, the form relabels the UI text by entity type rather than using two fields), `s44AD_last_exit_ay` + `s44AD_opted_current_year` (5-year presumptive lock-in) |
| Entity classification | `profile.entity_type`: `individual` \| `huf` \| `firm` \| `llp` \| `company` |

*Correction from the first version of this doc:* the first pass truncated its read of `business_income{}` and missed the s.44BBB/s.35AD/s.115V row entirely — added above, and as gap-tracker IN-26.

### US — entity-bearing arrays in `income_us_source` + `corporate_financials`

| Array | Contents | Currently in `businessEntities()`? |
|---|---|---|
| `self_employment[]` | Sole prop, SE-tax + QBI eligible | ✅ |
| `farming_schedule_f[]` | Farm income | ✅ |
| `partnerships_k1[]` | `ordinary_business_income_usd`, **`guaranteed_payments_usd`** (SE-tax base, QBI-ineligible), `self_employment_earnings_usd`, `depreciation_allocation_usd`, `section_179_usd`, branch-aggregated | 🟡 partial — guaranteed payments dropped (see §0) |
| `s_corporations_k1[]` | `scorp_income_usd`/`ordinary_business_income_usd`, QBI-eligible, not SE-tax, `section_179_usd` | ✅ (income only) |
| `c_corporations_1120[]` | `taxable_income_usd`/`net_income_usd`, 21% flat, plus `corporate_financials.schedule_m1{}` (book-to-tax reconciliation: net income per books, federal tax expense, 50%-meals disallowance, tax-vs-book depreciation difference, taxable income) and `schedule_m2{}` (retained-earnings roll-forward) | ✅ (income only — Schedule M-1/M-2 collected but never read) |
| `trusts_estates_k1[]` | Present with its own QBI-addition helper (`addK1Qbi`) | ❌ **entirely absent from `businessEntities()`** |
| **Depreciable assets (`asset-row` UI, used across Sch C/farm/rental/K-1/1120)** | Full MACRS system: asset class (3/5/7/15/27.5/39-year, correct published rates in the dropdown itself), date placed in service (mid-year convention/bonus eligibility), cost basis, **§179 immediate expensing** (form shows the correct 2025-published caps: $1,160,000 / $2,890,000 phase-out — verify current for TY2026 before computing), **bonus depreciation** checkbox | ❌ **entirely uncomputed** — this is a US-side twin of the India `asset_blocks[]` gap, not previously documented |
| `foreign_entities.foreign_corporations[]` | GILTI/CFC | ✅ (flag-level; no NCTI quantification — tracked as XB-14 in the gap tracker) |

*Correction from the first version of this doc:* the first pass covered India depreciation (`asset_blocks[]`, §2.4) but never checked whether the US side had an equivalent — it does, and it's collected with more granularity (real MACRS class rates, §179, bonus depreciation) than the India side. Added above, and as gap-tracker US-18.

*Second correction (13 Jul 2026):* `schedule_c_businesses[]`, listed above as "✅" covered, was never actually real — Layer 1 US has no UI that populates it (`self_employment[]`, which has a full add-row UI, is the real Schedule-C path and was always the one actually carrying data). The array was a dead reference on both sides: the engine read it (always empty, so a no-op) and one leftover form-side reference read it too. Both removed rather than wired, since the functionality it was meant to represent already fully exists under `self_employment[]`. Found by `scripts/audit/field-coverage.js`.

`profile.tax_entity_type` (`individual`/`ccorp`/`scorp`/`partnership`/`trust`) plus `profile.llc_tax_election` already drive `computeUsEntityTax`'s routing (C-corp 21% flat vs S-corp/partnership pass-through), confirmed in `computation.js`.

---

## 2. Per-entity computation depth — what "not shallow" actually requires

This is the bulk of the real work, and (critically) **almost none of it needs new Layer 1 fields** — it's engine computation against data that already exists.

### 2.1 India — real net profit per `business_entries[]` item (replaces the phantom field)

```
if presumptive_scheme selected:
    44AD-equivalent (s.58 table): rate = 6% on digital_receipts, 8% on cash_receipts
    44ADA-equivalent (professionals): rate = 50% on gross_receipts (ada_* split)
    44AE-equivalent (goods carriages): per-vehicle deemed income × vehicle count
else (regular books):
    net_profit = gross_receipts
               − Σ(expenses{} deductible categories)
               − current-year depreciation (from asset_blocks[], WDV method,
                 half-rate if held < 180 days in year of addition)
               + s41_remission_income + s41_bad_debt_recovery
               − disallowances:
                   − s.40A(3): cash payments over the limit, 100% disallowed
                   − s.40(a)(i)/(ia): non-TDS payments, 30%/100% disallowed
                     (ALREADY READ for the existing disallowance finding —
                     just needs to also flow into net profit, not just the flag)
                   − s.43B(h): unpaid MSME dues beyond agreed/45-day terms,
                     from msme_payables[]
               − F&O/speculative kept OUT of this figure (see 2.2)
```

Threshold tests already captured and ready to enforce: presumptive turnover caps (₹2cr / ₹3cr business, ₹50L / ₹75L professional, both gated on <5% cash receipts — verified current under ITA 2025 s.58), and the 5-year re-entry lock-in (`s44AD_last_exit_ay`).

### 2.2 F&O / speculative — keep genuinely separate, per Layer 1's own (correct) split

- **F&O** (`fno_turnover_inr`, `non_speculative_income_inr`): ordinary PGBP income, added into the same net-profit pool as 2.1, eligible for tax-audit-threshold testing on turnover.
- **Speculative** (`speculative_income_inr`, `speculative_turnover_inr`): a *ring-fenced* bucket — can only be set off against speculative income/losses (s.113 old / renumbered), never against ordinary business profit. This mirrors the VDA-never-loss-set-off pattern already built for crypto — same shape of rule, different head.

### 2.3 Partner-firm pass-through (`partner_firms[]`)

- `remuneration_from_entity_inr` + `interest_on_capital_from_entity_inr` → taxable PGBP income to the partner (subject to the s.40(b) cap **at the firm's own return**, which this app doesn't prepare — so trust the entered figure, don't re-derive the cap).
- `profit_share_exempt_inr` → genuinely exempt to the partner (already taxed at the firm level) — must **not** be added to the partner's taxable income; only shown for completeness/reconciliation.

### 2.4 Depreciation as its own line, not folded silently

Track current-year depreciation charge separately from net profit (needed both to *compute* net profit per 2.1 and because `unabsorbedDepreciationCf` already exists downstream in loss set-off — the current-year charge needs to actually flow into that carryforward pool when it exceeds the year's business income).

### 2.5 US — two fixes, both data-complete already

- Add `trusts_estates_k1[]` to `businessEntities()` (§0) — same shape as the other K-1 arrays, straightforward.
- Fold `guaranteed_payments_usd` into: (a) `businessUs` income, (b) SE-tax base (guaranteed payments to a general partner ARE self-employment income), (c) **excluded** from QBI (guaranteed payments are explicitly QBI-ineligible under §199A — this must NOT follow the same `qbiIncome +=` line as ordinary K-1 income, or QBI would be overstated).

### 2.6 US depreciation, §179, bonus depreciation, and Schedule M-1 (gap tracker US-18)

The asset-row UI (§1) already carries real MACRS class rates (3/5/7/15/27.5/39-year), §179 immediate-expensing amount, a bonus-depreciation checkbox, cost basis, and placed-in-service date — across Schedule C, farm, rental, and K-1-branch contexts. None of it is computed:

```
per asset:
    macrs_deduction = cost_basis × published_rate[asset_class]
                       (half-year / mid-quarter convention from placed-in-service date
                       — the published rate table already bakes in half-year for most classes)
    if section_179_claimed: reduce cost_basis by the §179 amount BEFORE computing
                             MACRS on the remainder (can't double-deduct); enforce the
                             $1,160,000 cap / $2,890,000 phase-out (verify TY2026 figures
                             before shipping — OBBBA may have adjusted these, check current)
    if bonus_depreciation checked: 100% first-year (post-OBBBA restoration) on
                             qualifying property placed in service, taken BEFORE
                             regular MACRS on the remaining basis
```

Schedule M-1 (`corporate_financials.schedule_m1`) is the book-to-tax bridge for C-corp filers specifically — `net_income_per_books + federal_tax_expense + meals_disallowed_50 + tax_depreciation_over_book = taxable_income`. This is captured as a full reconciliation but the engine currently reads only `c_corporations_1120[].taxable_income_usd` directly (bypassing M-1 entirely) — fine if that field is always populated correctly by the form, worth confirming rather than assuming.

### 2.7 India — s.44BBB / s.35AD / s.115V (gap tracker IN-26)

Three narrower presumptive/specified regimes, lower priority than 2.1 (smaller affected population) but real, fully-data-complete gaps:
- **s.44BBB**: foreign companies engaged in civil construction/turnkey power-project business — 10% of gross receipts deemed profit, flat presumptive, no expense computation needed.
- **s.35AD**: 100% capital-expenditure deduction for specified businesses (cold chain, warehousing, hospitals, hotels, etc.) in the year incurred — an alternative to normal depreciation for that asset, not a supplement to it.
- **s.115V (tonnage tax)**: shipping companies — presumptive income based on net tonnage × per-day rate schedule, not actual profit at all. A shipping company that's opted in has its `tonnage_tax_115V_inr` figure used directly, bypassing 2.1's net-profit computation entirely for that entry.

### 2.8 Explicitly out of scope (confirmed, not just omitted)

- **Transfer pricing (s.92 / IRC §482)** — already tracked as gap-tracker XB-8, disclosure-flag only ("related-party cross-border dealing detected"), no arm's-length-price computation, by design. Genuinely not rule-encodable at the depth an ALP study requires.
- **S-corp reasonable-compensation testing, built-in-gains tax, accumulated E&P tracking** — checked directly: none of the underlying data (shareholder wage-vs-distribution split, prior C-corp E&P balance, asset built-in-gain basis) exists anywhere in Layer 1 US. Not a computation gap so much as a data-collection gap that would need new fields before it's even a candidate for Phase 1-level work — parking here rather than adding a false "buildable now" row.

---

## 3. Entity graph — the architectural layer Part F originally asked for

Per-entity computation (§2) must be correct **before** this layer means anything — an entity graph consolidating wrong numbers is worse than no graph. Sequenced after §2 for that reason.

```
Entity {
  id, kind: "individual" | "in_huf" | "in_firm" | "in_llp" | "in_company"
          | "us_scorp" | "us_ccorp" | "us_partnership" | "us_llc" | "us_trust"
          | "foreign_corp",
  jurisdiction, returnForm,
  layer1Ref: { form, path },     // traceable back to the exact Layer 1 source
  income, deductions, tax        // per-entity computed block, §2's output
}

Edge {
  from, to, ownershipPct,
  flow: "k1_passthrough" | "dividend" | "gilti" | "subpart_f" | "partner_remuneration" | "salary"
}
```

**Entity extraction sources** (confirmed against §1's inventory):
- India: `profile.entity_type` for the primary entity; each `business_entries[]` item with `entity_type !== 'individual'`; each `partner_firms[]` item (an edge INTO the individual, not a separate computed entity — the firm's own return isn't prepared here).
- US: each `partnerships_k1[]` / `s_corporations_k1[]` / `c_corporations_1120[]` / `trusts_estates_k1[]` item; each `foreign_entities.foreign_corporations[]` item.

**Flows to model as edges, not silent sums** (this is the actual "not shallow" ask — every cross-entity dollar traceable to its source):
- K-1 pass-through → owner's income (already partially true via flat aggregation; make it an explicit edge so the UI can show *which* entity produced *which* slice)
- GILTI/Subpart F inclusion, US person owning ≥10% of a foreign (or Indian) corporation, with the §962 election option — currently disclosure-only (gap tracker XB-14); needs CFC financial statement fields (E&P, QBAI, tested income) Layer 1 doesn't collect yet — this is the one piece of §3 genuinely blocked on new fields, not just engine work.
- Partner remuneration/interest/exempt-share (§2.3) as an edge from firm → partner.

---

## 4. Frontend — per-entity views, not just the flat list

Once §3's graph exists:
- Entity switcher (Consolidated ▾ / each entity by name) scoping every view, not just `BusinessView`.
- Per-entity Filings/Documents (ITR-5 for the firm, ITR-6 for the company, 5471 for the CFC owner, 1120-S+K-1 for the S-corp).
- `BusinessView` gains a real drill-down: click an entity row → see its own income/deduction/tax breakdown, not just the summary line it has today.

---

## 5. Phased build order

| Phase | Deliverable | Blocked on new Layer 1 fields? | Depends on |
|---|---|---|---|
| **0** | ✅ **Shipped.** Fix the phantom `net_profit_inr` bug (real net-profit computation, §2.1 — presumptive s.44AD/44ADA/44AE plus regular-books-from-clean-expenses; depreciation/F&O/disallowances deliberately deferred to Phase 1) + fold `guaranteed_payments_usd` and Box 14A into US income/SE/QBI correctly (§2.5 — turned out Box 14A was never read at all, not just guaranteed payments) | No | — |
| **1** | India depreciation from `asset_blocks[]` (§2.4) ✅ **shipped**, disallowances s.40A(3)/40(a)/43B(h) folded into net profit ✅ **shipped** (found and fixed along the way: `scope_payer_tds` and IN-23's own prior claim that this was "already flowing in" traced to dead code — `_evaluateSurchargeBuckets`' calculator reads a top-level `business_income.expenses` object no rendered input ever writes to; also fixed a Phase-0 bug, employer PF/ESI deducted unconditionally instead of gated on s.43B(d)'s paid-before-due-date flag), F&O/speculative separation (§2.2) — next, partner-firm pass-through (§2.3) — last | No | Phase 0 |
| **1b** | US depreciation/§179/bonus from the asset-row UI (§2.6) — same shape of work as Phase 1, different jurisdiction, can run in parallel to it | No | Phase 0 |
| **2** | `trusts_estates_k1[]` added to `businessEntities()` (§2.5) | No | — (independent, can run parallel to 0/1) |
| **3** | Entity graph model + extractor in `normalize()` (§3) | No | Phases 0-2 (needs correct per-entity numbers first) |
| **4** | Inter-entity flow edges (K-1, dividends, partner remuneration) wired as traceable edges, not silent sums | No | Phase 3 |
| **5** | GILTI/Subpart-F NCTI quantification (gap tracker XB-14) | **Yes** — CFC financials (E&P, QBAI, tested income) | Phase 3 |
| **6** | Frontend entity switcher + per-entity Filings/Documents/drill-down (§4) | No | Phase 3-4 |
| **7** | Presumptive lock-in disclosure, non-corporate AMT (gap tracker IN-5), MSME-disallowance finding, s.44BBB/35AD/115V (§2.7) | No | Phase 0-1 |

Phases 0-2, 1b, and 6-7 need zero Layer 1 changes — same "buildable now" pattern as the rest of the gap tracker. Only Phase 5 is genuinely blocked on new fields. §2.8's exclusions (transfer pricing, S-corp reasonable-comp/BIG/E&P) are deliberately not in this table — TP is a recorded XB-8 decision, and the S-corp items need new fields before they're even candidates.

## 6. Cross-references

- `docs/GAP_TRACKER.md` IN-5 (non-corporate AMT), IN-6 (presumptive depth), XB-14 (GILTI/NCTI) all fold into this spec's phases — update their status there as each phase ships, don't duplicate tracking.
- `docs/COVERAGE_AND_ARCHITECTURE.md` Part F/G/H — superseded by this document; Part H's "flattened into the individual" claim is also stale as of the `BusinessView` ship (entities already show separately, just not as a graph) — see the pointer added there.

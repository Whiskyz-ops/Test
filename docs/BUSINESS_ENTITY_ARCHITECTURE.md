# Business & Multi-Entity Architecture — Spec

**Supersedes Part F/G of `COVERAGE_AND_ARCHITECTURE.md`.** Those sections described an entity-graph architecture that was never built; what shipped instead (`BusinessView.jsx`, a flat entity list) is simpler and the two were never reconciled. This document replaces both with a spec grounded in what Layer 1 *actually* collects today (verified by direct grep against `layer1_india.html` / `layer1_us.html`, not recalled from the old plan) and a phased build order.

**Directive this doc executes on:** *"We need multi-entity architecture and a thorough spec for the business entities — we cannot keep it shallow at all."*

**India and US are both first-class jurisdictions in this spec.** An earlier version of this document structured itself India-first — four fully-numbered India subsections (§2.1-2.4) followed by two terser US subsections tacked on after (§2.5-2.6), a "Phase 1" that was India-only with US depreciation demoted to a lettered "Phase 1b" satellite, and an entire concern (residency/entity-type determination) that existed for both countries in the live engine but had no section in this doc at all. Restructured (this pass) so every concern gets one section with India and US presented as equal-weight, side-by-side tracks — including two concerns (residency/entity-type determination, conflict detection, return-form determination) that were previously undocumented here even though they're real, load-bearing parts of "business entity architecture" and were shipped separately, tracked only as scattered `GAP_TRACKER.md` rows with no structural home in this spec.

---

## 0. The finding that reframes everything

**India business/firm/company computation is not "shallow" — it was, at the time this doc was first written, non-functional against real Layer 1 data. Since fixed (Phase 0, below).**

`normalize.js` read `b.net_profit_inr` off every `business_entries[]` item to build both the business-income aggregate *and* the entity tax base (`computeIndiaEntityTax`, used for company 22%/25%/15%+MAT **and** firm/LLP flat-30% computation alike).

`net_profit_inr` **does not exist anywhere in `layer1_india.html`.** Grep across the entire 18,000+-line form for that field name returns zero matches. The form collects turnover, receipts (digital/cash split), a full expense-category breakdown, depreciation asset blocks, F&O/speculative splits, partner-firm remuneration, MSME payment timing — and never computes or exports a net-profit summary.

The only place `net_profit_inr` was ever set was hand-authored demo data in `engine/profiles.js` — every business/company/firm demo profile worked only because it cheated past a computation gap that would have zeroed out any real filer's business income.

**The exact same shape of bug existed on the US side, not a smaller afterthought of it:** `partnerships_k1[].guaranteed_payments_usd` was (and Box 14A alongside it) fully collected by Layer 1 US but read **nowhere** in `normalize.js` — not into `businessUs`, not into SE-tax base, not into QBI exclusion. A general partner's guaranteed payments (SE-tax-subject, QBI-*ineligible*, unlike ordinary K-1 income) were silently dropped from income entirely.

**Phase 0 fixed both of these together, in the same pass, because every other phase's numbers are meaningless until the base computation actually runs — for either country.**

---

## 1. What Layer 1 already collects, by entity type

Verified directly against the two forms — this is the actual current data model, not the old plan's sketch.

### 1.1 Entity classification & residency-determination fields

Both sides collect the raw facts that decide *what kind of taxpayer this is* and *which country's residency test applies* — this is the data §2 (below) is built on, and it was entirely missing from earlier versions of this table even though it's exactly as load-bearing as the income fields in §1.2.

| | India | US |
|---|---|---|
| Entity type | `profile.entity_type`: `individual` \| `huf` \| `firm` \| `llp` \| `company` \| `trust` \| `ngo` \| `society` \| `political_party` \| `aop` \| `boi` \| `ajp` \| `local` | `profile.tax_entity_type`: `individual` \| `ccorp` \| `scorp` \| `partnership` \| `trust` \| `llc` (→ `profile.llc_tax_election` resolves the LLC's actual federal classification) |
| Residency test — company/entity | `residency_detail.is_indian_company` (incorporation, s.6(3) — unconditional if true); when false, `company_residency{}`: `board_meetings_primarily_outside_india`, `key_management_location`, `directors_in_india_count`/`directors_outside_india_count` (POEM facts) | `profile.incorporated_in_us` / `profile.incorporation_state` — place of organization (IRC §7701(a)(4)), collected only when `tax_entity_type` is `ccorp`/`scorp`/`partnership`/`trust` |
| Residency test — HUF/firm/LLP/AOP/BOI/trust/etc | `residency_detail.is_wholly_outside_india` (s.6(2)/s.6(4) control-and-management test) | *(no equivalent entity kind on the US side — a US trust uses the same incorporation-style organizational test as the row above, not a separate control-and-management concept)* |
| Cross-border scope | `router.jurisdiction` (`dual`/`single_india`/`single_us`, Layer 0), `router.us_days`/`is_us_citizen`/`has_green_card`/`has_us_source_income_or_assets` | *(same router object — the fields above ARE the US-side scope signal; there's no separate India-side "has_india_source_income_or_assets" field since India is this tool's base jurisdiction)* |

### 1.2 Income & expense fields

#### India — `domestic_income.business_income` (per-entry: `business_entries[]`)

| Field group | Contents |
|---|---|
| Entry identity | `business_name`, `nature`, `presumptive_scheme`, `turnover_inr`, `digital_receipts_inr`, `cash_receipts_inr`, `ada_digital_receipts_inr`, `ada_cash_receipts_inr` (44ADA split), `gross_receipts_inr`, `branches[]` |
| Expenses (full category breakdown, `expenses{}`) | Rent, repairs, salary/wages, bonus/commission, interest on borrowed capital, insurance, bad debts, other; s.40A(3) cash-payment-limit tracking (`total_cash_payments_exceeding_35k_inr`, `cash_limit_type`); s.40(a) non-TDS payment disallowance (`payments_to_non_residents_no_tds_inr`, `payments_to_residents_no_tds_inr`); s.35 R&D (own revenue/capital, donation to approved body); s.35D preliminary expenses + amortization year; s.35DDA VRS payments + first year; F&O-specific (STT/CTT paid, brokerage, exchange charges, advisory/data subscriptions, margin interest, home-office/internet proportion); employer PF/ESI contribution + due-date-paid flag (s.36(1)(va)/s.43B disallowance trigger) |
| Depreciation | `asset_blocks[]` (opening WDV, additions, block rate — s.32 WDV method) |
| F&O / speculative | `speculative_income_inr`, `speculative_turnover_inr`, `non_speculative_income_inr`, `fno_turnover_inr` — collected as **separate** buckets (correct — F&O is non-speculative business income per the s.43(5) proviso; speculative equity delivery-fail trades are a genuinely separate, ring-fenced bucket that can only be set off against speculative income) |
| Remissions | `s41_remission_income_inr`, `s41_bad_debt_recovery_inr` |
| Partner-firm pass-through | `partner_firms[]`: `firm_name`, `entity_type`, `remuneration_from_entity_inr`, `interest_on_capital_from_entity_inr`, `profit_share_exempt_inr` |
| Other presumptive/specified regimes | `s44bbb_receipts_inr` (foreign companies, civil construction/turnkey power projects, presumptive 10%), `specified_business_s35AD_inr` (s.35AD capital expenditure deduction for specified businesses — cold chain, warehousing, hotels, etc.), `tonnage_tax_115V_inr` (shipping companies, tonnage-based presumptive scheme) |
| Compliance | `msme_payables[]` (s.43B(h), Finance Act 2023 — unpaid-beyond-terms MSME dues disallowed), `amt_credit_bf_inr` (AMT/MAT credit brought forward — **the same field serves both s.115JC non-corporate AMT and s.115JD corporate MAT credit**, the form relabels the UI text by entity type rather than using two fields), `s44AD_last_exit_ay` + `s44AD_opted_current_year` (5-year presumptive lock-in) |
| Company-specific elections | `profile.opt_115baa` / `opt_115bab` / `opt_115ba` (concessional-rate elections — gated to domestic-incorporated companies only, see §2), `profile.turnover_lte_400cr`, `profile.mat_book_profit` (s.115JB book-profit MAT base, distinct from taxable income) |

#### US — entity-bearing arrays in `income_us_source` + `corporate_financials`

| Array | Contents | Currently in `businessEntities()`? |
|---|---|---|
| `self_employment[]` | Sole prop, SE-tax + QBI eligible, per-item `assets[]` (§1 depreciation fields below) | ✅ |
| `farming_schedule_f[]` | Farm income | ✅ |
| `partnerships_k1[]` | `ordinary_business_income_usd`, `guaranteed_payments_usd` (SE-tax base, QBI-ineligible), `self_employment_earnings_usd`, `depreciation_allocation_usd`, `section_179_usd`, branch-aggregated, passive boxes (interest/dividends/cap gains/rental/royalty) | ✅ |
| `s_corporations_k1[]` | `ordinary_income_usd` (Box 1), QBI-eligible, not SE-tax, `section_179_usd`, passive boxes | ✅ |
| `c_corporations_1120[]` | `taxable_income_usd`/`net_income_usd`, 21% flat, plus `corporate_financials.schedule_m1{}` (book-to-tax reconciliation) and `schedule_m2{}` (retained-earnings roll-forward) | ✅ |
| `trusts_estates_k1[]` | Ordinary income, QBI-addition helper (`addK1Qbi`), passive boxes | ✅ |
| **Depreciable assets (`asset-row` UI, used across Sch C/farm/rental/K-1/1120)** | Full MACRS system: asset class (3/5/7/15/27.5/39-year), date placed in service (convention/bonus eligibility), cost basis, §179 immediate expensing, bonus-depreciation checkbox | 🟡 Schedule C (`self_employment[].assets[]`) and Schedule F (`farming_schedule_f[].assets[]`) computed, one shared taxpayer-wide §179 pool; K-1/1120 asset rows remain deliberately out of scope (double-count risk against Box 1, see §3.4) |
| `foreign_entities.foreign_corporations[]` | GILTI/CFC ownership | ✅ (flag-level; no NCTI dollar quantification — tracked as XB-14) |

`profile.tax_entity_type` (`individual`/`ccorp`/`scorp`/`partnership`/`trust`) plus `profile.llc_tax_election` drive `computeUsEntityTax`'s routing (C-corp 21% flat vs S-corp/partnership pass-through) and `entity.usReturnForm` (§4, below).

---

## 2. Residency & entity-type determination

**Was entirely undocumented in this spec** even though it's exactly as load-bearing as §3's income computation — a taxpayer's residency status decides *which country's rate schedule and worldwide-vs-source basis applies at all*, before any net-profit number matters. Shipped this pass (gap tracker IN-34, XB-18, XB-19).

### 2.1 India

- **Company**: `residency_detail.is_indian_company === true` → unconditionally resident (s.6(3), place of incorporation controls, no POEM test reached). When `false`, residency instead turns on **Place of Effective Management** — `company_residency{}`'s board-meeting location, key-management location, and director in-India/outside-India split. A foreign-incorporated company whose POEM facts point to India is resident here *without ceasing to be resident wherever it's actually incorporated* — a genuine entity-level dual residency with no individual-style Article 4 tie-breaker to mechanically resolve it (Article 4(3) sends companies to competent-authority mutual agreement instead). Domestic-incorporated status also separately gates which rate schedule applies (§3.7) — incorporation controls **residency**, but is not the only thing that controls the **rate schedule**, and conflating the two was the exact bug IN-34 fixed.
- **HUF / firm / LLP / AOP / BOI / trust / etc.**: a different, qualitative test (s.6(2)/s.6(4)) — resident **unless** control and management of its affairs is wholly outside India (`residency_detail.is_wholly_outside_india`). Not a day-count test, not POEM — a third distinct residency mechanism from the two above. HUF carries one further wrinkle: once the HUF itself is resident, ROR-vs-RNOR sub-status (s.6(6)(b)) still turns on the **karta's own individual day-count**, separately from the HUF's own control-and-management determination.

### 2.2 US

- **ccorp / scorp / partnership / trust**: domestic status by **place of organization/incorporation** (IRC §7701(a)(4) for corporations; analogous organized-under-state-law tests for the others) — `profile.incorporated_in_us` / `incorporation_state`. **Never** a day-count/presence test — Substantial Presence (§7701(b)) is an individual-only concept and does not apply to an entity at all, regardless of how many days anyone associated with it spends in the US.
- When `tax_entity_type` is left at its `individual` default because **no separate US entity was ever organized** for this taxpayer (common for an India-only company/HUF/firm with zero US nexus), that absence of a ccorp/scorp/partnership/trust election is itself the fact: the taxpayer is foreign to the US by default, with no US-side residency test to run at all — not "an individual who happens to score 0 days."

### 2.3 Cross-border jurisdiction scope

A taxpayer can be **exposed to only one of the two countries**, and the Monitor now reflects that dynamically rather than always rendering a dual-country picture:

- `model.meta.hasIndiaScope` / `hasUsScope` are derived from what was actually reported — `router.us_days > 0`, `is_us_citizen`, `has_green_card`, `has_us_source_income_or_assets` — not from whether Layer 1's `india`/`us` object merely exists in the bundle (both always do, as a shell, so neither Layer 1 form crashes if opened) and not from Router's own `jurisdiction` toggle alone (a real preparer can leave that on "Dual" out of habit while never entering a single US fact). Router's own explicit "India only"/"US only" selection still wins outright when a preparer deliberately sets it.
- When a taxpayer has no real scope on one side (e.g. an India-incorporated company with zero US presence), the Monitor's header entity badge, residency Flag cards, Residency Determination panel entries, and DTAA Treaty Position card (Article 4 tie-breaker / TRC / Form 10F / PE / 1040-NR are all meaningless without real dual exposure) now render **only** the in-scope country — instead of fabricating a "US: Individual" badge or a 0/183-day Substantial Presence bar for a taxpayer with no US nexus at all.

---

## 3. Income / net-profit computation depth per entity

This is the bulk of the original "not shallow" ask, and (critically) **almost none of it needs new Layer 1 fields** — it's engine computation against data that already exists. Each concern below is one section with India and US presented side by side, rather than all India concerns followed by all US concerns.

### 3.1 Net profit / entity-level taxable income

**India** — real net profit per `business_entries[]` item (replaces the phantom `net_profit_inr` field, §0):

```
if presumptive_scheme selected:
    44AD-equivalent (s.58 table): rate = 6% on digital_receipts, 8% on cash_receipts
    44ADA-equivalent (professionals): rate = 50% on gross_receipts (ada_* split)
    44AE-equivalent (goods carriages): per-vehicle deemed income × vehicle count
else (regular books):
    net_profit = gross_receipts
               − Σ(expenses{} deductible categories)
               − current-year depreciation (§3.4)
               + s41_remission_income + s41_bad_debt_recovery
               − disallowances: s.40A(3) cash-payment limit, s.40(a)(i)/(ia)
                 non-TDS payments, s.43B(h) unpaid MSME dues
               − F&O/speculative kept OUT of this figure (§3.2)
```

Threshold tests captured and enforced: presumptive turnover caps (₹2cr/₹3cr business, ₹50L/₹75L professional, gated on <5% cash receipts under ITA 2025 s.58), and the 5-year re-entry lock-in (`s44AD_last_exit_ay`). Company rate-schedule selection (s.115BAB 15% / s.115BAA 22% / s.115BA 25% flat / default turnover-gated 25%-or-30%) is gated to **domestic-incorporated companies only** (§2.1) — a foreign-incorporated company resident via POEM computes under the separate foreign-company schedule (35% flat, lower 2%/5% surcharge tiers, MAT-exempt absent an India PE) regardless of any 115BAA/BAB/BA election on file.

**US** — two fixes, both data-complete:
- `partnerships_k1[].guaranteed_payments_usd` (and Box 14A alongside it) fold into `businessUs` income and the SE-tax base — a general partner's guaranteed payments ARE self-employment income — but are explicitly **excluded** from QBI (§199A carves guaranteed payments out by statute; this must not follow the same `qbiIncome +=` line as ordinary K-1 income, or QBI would be overstated).
- `c_corporations_1120[]`'s own taxable income is derived from **Schedule M-1** (`corporate_financials.schedule_m1{}`: net income per books + federal tax expense + 50%-meals-disallowed + foreign-taxes-deducted-not-credited + interest-expense-limitation + other additions − tax-exempt interest − tax depreciation in excess of book − other subtractions — the real Form 1120 Line 1-10 structure) whenever Layer 1 US actually collected one, falling back to `business_income_usd` only when it didn't (trusts excluded — Form 1041 doesn't carry Schedule M-1, matching Layer 1's own gate).

### 3.2 Character/type separation of trading income

**India — F&O vs. speculative**, kept genuinely separate per Layer 1's own (correct) split:
- **F&O** (`fno_turnover_inr`, `non_speculative_income_inr`): ordinary PGBP income, added into the same net-profit pool as §3.1, eligible for tax-audit-threshold testing on turnover.
- **Speculative** (`speculative_income_inr`, `speculative_turnover_inr`): a *ring-fenced* bucket — can only be set off against speculative income/losses (s.113), never against ordinary business profit. Mirrors the VDA-never-loss-set-off pattern already built for crypto — same shape of rule, different head.

**US** — no direct equivalent is currently modeled. §1256 mark-to-market contract treatment and straddle rules (which would be the closest US analog to a speculative/ordinary split) are not captured by Layer 1 US or this engine today; noted here as an open question for a future pass rather than a tracked gap-tracker row, since it hasn't been verified with the same grep-first discipline as the rest of this document.

### 3.3 Pass-through / distributive-share income

**India — partner-firm pass-through** (`partner_firms[]`):
- `remuneration_from_entity_inr` + `interest_on_capital_from_entity_inr` → taxable PGBP income to the partner (subject to the s.40(b) cap **at the firm's own return**, which this app doesn't prepare — the entered figure is trusted rather than re-derived).
- `profit_share_exempt_inr` → genuinely exempt to the partner (already taxed at the firm level under s.10(2A)) — not added to taxable income, shown only for reconciliation.

**US — K-1 aggregation across all three K-1 types**: a shared helper folds interest/ordinary+qualified dividends/STCG/LTCG(+net s.1231 gain)/rental+royalty boxes from `partnerships_k1[]`, `s_corporations_k1[]`, and `trusts_estates_k1[]` into the same aggregate buckets their directly-held counterparts use, bridging the real field-name variants across the three forms (e.g. `royalties_usd` vs `royalty_income_usd`). `trusts_estates_k1[]` (previously entirely absent from `businessEntities()`) now feeds ordinary income into `businessUs`/QBI on the same footing as the other two K-1 types.

### 3.4 Depreciation

**India** — real s.32 WDV block-of-assets computation from `asset_blocks[]` (opening WDV + additions − sale, half-rate under the <180-day proviso), plus s.32(1)(iia) additional depreciation for new manufacturing/power-generation plant & machinery. Tracked as its own line (not folded silently into net profit) because `unabsorbedDepreciationCf` needs the current-year charge to flow into loss-set-off carryforward when it exceeds the year's business income.

**US** — real IRS Pub 946 multi-year MACRS tables (200%-DB half-year convention for 3/5/7-year property, 150%-DB for 15-year, straight-line mid-month for 27.5/39-year real property), current §179 figures ($2,560,000 cap / $4,090,000 phase-out, OBBBA TY2026), and 100% bonus depreciation (permanently restored by OBBBA for property placed in service after 19 Jan 2025) — with taxpayer-wide §179 aggregation across businesses (cap, phase-out reduction, active-income limitation, proportional scaling). **Scoped to `self_employment[].assets[]` (Schedule C) and `farming_schedule_f[].assets[]` (Schedule F)** — both fully computed, multi-year-aware (an asset placed in service in a prior year correctly looks up that year's MACRS table row, not year-1 every year), sharing ONE taxpayer-wide §179 aggregation pool (real law caps/phases out §179 across ALL of a taxpayer's directly-owned trades/businesses together, not per-array). Farm's own income computation had a deeper, previously-undiscovered bug on the way to this fix: `net_profit_usd`/`gross_income_usd` are phantom fields (never written by the live form, exactly like self-employment's own pre-fix bug) — real gross income is the sum of `itemized_income{}`'s 8 Schedule F line items (netted against the accrual-method cost-of-purchases/inventory swing when applicable), and farm income previously never reached actual taxable income at all, only the SE-tax base, and only via the phantom field. K-1/1120 asset rows remain **deliberately out of scope, not just deprioritized**: those entities' Box 1 ordinary income is already net of the entity's own regular/bonus depreciation (only §179 is separately stated at the box level, as `sec179_deduction_usd`, because IRC §179(d)(8) requires partner-level aggregate-income testing) — a second per-asset computation against a K-1 recipient's own copy of the entity's asset list would double-count against Box 1, a genuinely different situation from farm's direct gross-receipts/expenses derivation (gap tracker US-18, still partial for this reason, not fully open). **Landed DAG-only** (`prototypes/graph-pilot/aggregateusincome-nodes.js` + `assets-nodes.js`) — the classic `engine/*.js` is permanently frozen (`docs/DAG_MIGRATION_TRACKER.md` §J) and never hand-edited again, so this fix is an intentional, verified (200-iteration differential fuzz, 0 new divergences) divergence from the frozen engine's still-buggy farm behavior, not a parity gap.

### 3.5 Narrower presumptive / specified regimes

**India** — three real, fully-data-complete, lower-priority gaps: **s.44BBB** (foreign companies, civil construction/turnkey power projects, 10% of gross receipts deemed profit, no expense computation); **s.35AD** (100% capital-expenditure deduction for specified businesses — cold chain, warehousing, hospitals, hotels — an alternative to normal depreciation for that asset, not a supplement); **s.115V tonnage tax** (shipping companies — presumptive income from net tonnage × per-day rate schedule, bypassing §3.1's net-profit computation entirely for that entry when opted in).

**US** — no equivalent narrow-regime gap has been identified in Layer 1 US's collected fields.

### 3.6 Explicitly out of scope (confirmed, not just omitted)

- **Transfer pricing (s.92 / IRC §482)** — a real conflict-detection finding now fires on the related-party ownership link (§4.3), but remains disclosure-only by design: no arm's-length-price computation, since that genuinely isn't rule-encodable at the depth an ALP study requires.
- **US S-corp reasonable-compensation testing, built-in-gains tax, accumulated E&P tracking** — checked directly: none of the underlying data (shareholder wage-vs-distribution split, prior C-corp E&P balance, asset built-in-gain basis) exists anywhere in Layer 1 US. A data-collection gap, not a computation gap — not a candidate for this spec's phases until new fields exist.

---

## 4. Conflict detection for business entities

**Was entirely undocumented in this spec.** The engine's `detectConflicts()` (`conflicts.js`) raises several findings specific to business-entity taxpayers, distinct from the individual-taxpayer findings the rest of the app is built around.

### 4.1 India-side

- **`entity_dual_residency_poem`** (`S.WARNING`) — fires when a company is on file as NOT incorporated in India (§2.1) yet still resolves to ROR via POEM: flags the entity-level dual-residency exposure (resident here under s.6(3), and likely still resident wherever it's actually incorporated, with no mechanical Article 4 tie-breaker for companies).
- **`india_itr_form_mismatch`** (`S.WARNING`) — WISING's own independent ITR-form solver (`computeIndiaItrForm`, cross-checking income thresholds, residency, capital gains, foreign assets/income, crypto, house-property count, brought-forward losses, speculative/F&O income) is run unconditionally and compared against Layer 1's own persisted `itr_recommendation.form`; a disagreement is surfaced rather than silently picking one, since it usually points to stale Layer 1 state.

### 4.2 US-side

- No dedicated US-only business-entity finding exists as its own tracked ID today. The equivalent rigor was applied as a direct **field-coverage audit** rather than a runtime finding: S-corp K-1 Box 1 ordinary income, the filer's-own-entity `business_income_usd`/Schedule M-1 bridge, and all three K-1 types' passive-income boxes were each verified against the real field names Layer 1 US actually writes (not the names the engine had been reading) and fixed at the computation layer (§3.1/§3.3) rather than surfaced as a runtime conflict — there was nothing to flag the *taxpayer* about, the bug was purely in which field name the engine happened to read.

### 4.3 Cross-border

- **`transfer_pricing`** (`S.WARNING`) — fires on the same US-owns-≥10%-of-a-foreign/Indian-corporation ownership fact the CFC/Form 5471 check already establishes ("associated enterprises" under s.92); not gated on the US owner's personal residency, since s.92 binds the Indian entity's own return regardless. `amountUsd: 0`, no ALP computation, by design (§3.6) — points to Form 3CEB/Rule 10D/§482 and a specialist engagement rather than asserting a number this app can't compute.

---

## 5. Return-form / filing determination per entity

**Was entirely undocumented in this spec**, though a real solver already exists and ships on both sides today.

### 5.1 India

`computeIndiaItrForm` (`computation.js`) independently determines ITR-1/2/3/4/5/6 eligibility from residency, income composition, capital gains, foreign assets/income, crypto, house-property count, brought-forward losses, and speculative/F&O income — company entity type routes to ITR-6, firm/LLP/local-authority to ITR-5, individual/HUF to ITR-2/3/4 depending on income composition. Cross-checked against Layer 1's own frontend recommendation (§4.1's `india_itr_form_mismatch` finding) rather than trusted alone — three concrete bugs were found and NOT inherited from Layer 1's own client-side calculator (a desynced "has business income" checkbox, a dead singular partner-remuneration field name, and an unreachable director-status control).

### 5.2 US

`model.entity.usReturnForm` routes directly off `profile.tax_entity_type`: `ccorp` → **1120**, `scorp` → **1120-S**, `partnership` → **1065**, `trust` → **1041**; an individual filer routes to **1040-NR** when Layer 1 US recorded `nra_specific.files_form_1040nr`, else the standard **1040**. This drives both the Compliance Calendar's entity-aware filing due dates (1120/1040 coincide at Apr 15/Oct 15; 1120-S/1065/1041 carry their own earlier statutory dates) and the FTC form selection (Form 1118 for a C-corp filer vs. Form 1116 otherwise).

### 5.3 What's not yet built

Both §5.1 and §5.2 determine **one return form per taxpayer** — correct for today's flat entity list, but not yet "one filing determination per entity within a consolidated multi-entity structure" (e.g. a founder's own 1040 *and* their >10%-owned foreign corporation's own separate filing obligations, tracked today only as a disclosure flag, not a distinct entity with its own return-form determination). That depends on §6's entity graph existing first — tracked as Phase 7, below, not a near-term gap.

---

## 6. Entity graph — the architectural layer Part F originally asked for

**Phase 5 shipped (25 Jul 2026)**: the schema below is real, built in `assets-nodes.js`'s `buildEntityGraph` (`model.assets.entityGraph`), DAG-only (`docs/DAG_MIGRATION_TRACKER.md` §M). Genuinely new discovery made while building it, not assumed from the schema: a single taxpayer bundle can legitimately contain TWO distinct root-level entities with different names (e.g. `us_ccorp_indian_sub` — a US C-corp parent and its differently-named Indian subsidiary, both real, both with their own return) — collapsing them into one root, as an early draft did, silently duplicated the subsidiary (once as the root, once again as a `foreign_corp` with an edge pointing at itself). Fixed by detecting a name mismatch between India's and US's own primary-entity names and creating two roots (`root_in`/`root_us`) connected by the real ownership edge, rather than one. Still Phase 5 scope only — the STRUCTURE (entities + edges) is real; edges do NOT yet carry a verified traceable dollar amount independent of what's already on the flow's own Layer 1 entry (that's Phase 6), and no frontend consumes this yet (Phase 8).

Per-entity computation (§3) must be correct **before** this layer means anything — an entity graph consolidating wrong numbers is worse than no graph. Sequenced after §3 for that reason. Applies equally to both jurisdictions — the schema below is not India- or US-shaped, it's a shared abstraction over both.

```
Entity {
  id, kind: "individual" | "in_huf" | "in_firm" | "in_llp" | "in_company"
          | "us_scorp" | "us_ccorp" | "us_partnership" | "us_llc" | "us_trust"
          | "foreign_corp",
  jurisdiction, returnForm,
  layer1Ref: { form, path },     // traceable back to the exact Layer 1 source
  income, deductions, tax        // per-entity computed block, §3's output
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
- K-1 pass-through → owner's income (already partially true via flat aggregation; make it an explicit edge so the UI can show *which* entity produced *which* slice).
- GILTI/Subpart F inclusion, US person owning ≥10% of a foreign (or Indian) corporation, with the §962 election option — currently disclosure-only (gap tracker XB-14); needs CFC financial statement fields (E&P, QBAI, tested income) Layer 1 doesn't collect yet — this is the one piece of §6 genuinely blocked on new fields, not just engine work.
- Partner remuneration/interest/exempt-share (§3.3) as an edge from firm → partner.

---

## 7. Frontend — per-entity views, not just the flat list

Once §6's graph exists:
- Entity switcher (Consolidated ▾ / each entity by name) scoping every view, not just `BusinessView`.
- Per-entity Filings/Documents (ITR-5 for the firm, ITR-6 for the company, 5471 for the CFC owner, 1120-S+K-1 for the S-corp) — the real, per-entity version of §5.3.
- `BusinessView` gains a real drill-down: click an entity row → see its own income/deduction/tax breakdown, not just the summary line it has today.

---

## 8. Phased build order

Tracked by **Track** (India / US / Both) rather than by letter-suffixing one country's work as subordinate to the other's — the previous version of this table numbered India's work "Phase 1" and the equivalent-scope US work "Phase 1b," which is exactly the structural asymmetry this restructure corrects.

| Phase | Track | Deliverable | Status | Blocked on new Layer 1 fields? |
|---|---|---|---|---|
| **0** | Both | Fix the phantom `net_profit_inr` bug (India, §3.1) + fold `guaranteed_payments_usd`/Box 14A into US income/SE/QBI correctly (§3.1) | ✅ Shipped | No |
| **1** | India | Depreciation (`asset_blocks[]`, §3.4); disallowances s.40A(3)/40(a)/43B(h) folded into net profit; F&O/speculative separation (§3.2); partner-firm pass-through (§3.3) | ✅ Shipped, all four | No |
| **1** | US | `trusts_estates_k1[]` added to `businessEntities()`; K-1 field-name audit across all three K-1 types (§3.1/§3.3/§4.2); depreciation/§179/bonus for Schedule C and farming_schedule_f (§3.4) | ✅ Shipped (Schedule C + farm, DAG-only — see §3.4); K-1/1120 asset rows remain correctly out of scope | No |
| **2** | Both | Residency & entity-type determination (§2) — India POEM/incorporation/control-and-management, US place-of-organization, dynamic single/dual-jurisdiction Monitor scoping | ✅ Shipped | No |
| **3** | Both | Domestic-vs-foreign India company rate schedule (115BAB/BAA/BA gated to domestic-incorporated only, real foreign-company 35% schedule, MAT exemption wiring) — the rate-schedule half of §2.1/§3.1 that residency status alone doesn't answer | ✅ Shipped | No |
| **4** | India | Presumptive lock-in disclosure, MSME-disallowance finding, s.44BBB/35AD/115V (§3.5) | ✅ Shipped (3 of 4 — DAG-only, see `docs/DAG_MIGRATION_TRACKER.md` §L) | No |
| **4b** | India | Non-corporate AMT (gap tracker IN-5) | Confirmed still blocked, not just deprioritized — see IN-5 | **Yes** — the phase table's original "No" was wrong for this one item specifically; re-investigated 25 Jul 2026 rather than assumed. The one candidate add-back Layer 1 captures (s.35AD) is scoped to company entities only, which are categorically outside s.115JC's (non-corporate AMT) scope — zero real data overlap, not a build candidate even partially |
| **5** | Both | Entity graph model + extractor (§6) | ✅ Shipped — DAG-only, `assets-nodes.js`'s `buildEntityGraph`, not `normalize()` (the classic engine is permanently frozen, `docs/DAG_MIGRATION_TRACKER.md` §J; the "extractor in `normalize()`" phrasing here predates that freeze) | No |
| **6** | Both | Inter-entity flow edges (K-1, dividends, partner remuneration) wired as traceable edges, not silent sums (§6) | Not started | Phase 5 |
| **7** | US | GILTI/Subpart-F NCTI quantification (gap tracker XB-14) | Not started | **Yes** — CFC financials (E&P, QBAI, tested income) |
| **8** | Both | Frontend entity switcher + per-entity Filings/Documents/drill-down (§7) | Not started | Phase 5-6 |

Phases 0-4 need zero Layer 1 changes — same "buildable now" pattern as the rest of the gap tracker. The one exception, found rather than assumed: Phase 4b (non-corporate AMT) genuinely is blocked on new fields, despite the original table saying otherwise — split out once that was confirmed (25 Jul 2026) rather than left misclassified. Otherwise only Phase 7 is genuinely blocked on new fields. §3.6's exclusions (transfer pricing, US S-corp reasonable-comp/BIG/E&P) are deliberately not in this table — TP is a recorded, disclosure-only decision (§4.3), and the S-corp items need new fields before they're even candidates.

---

## 9. Cross-references

- `docs/GAP_TRACKER.md` — IN-5 (non-corporate AMT, confirmed still needs-field), IN-6 (presumptive lock-in, shipped), IN-26 (s.44BB/BBB/35AD/115V, shipped), IN-42 (MSME-disallowance finding, shipped), IN-32 (ITR form solver, §5.1), IN-34 (domestic/foreign company rate split, §2.1/§3.1), XB-8 (transfer pricing, §4.3), XB-14 (GILTI/NCTI, §6), XB-18/XB-19 (residency display + jurisdiction scoping, §2), US-17/US-28 (K-1 audit, §3.3/§4.2), US-18/US-29 (US depreciation, §3.4) all fold into this spec's sections — update their status there as each phase ships, don't duplicate tracking.
- `docs/COVERAGE_AND_ARCHITECTURE.md` Part F/G/H — superseded by this document; Part H's "flattened into the individual" claim is also stale as of the `BusinessView` ship (entities already show separately, just not as a graph) — see the pointer added there.

# Coverage Gap Tracker

Living document tracking everything WISING does **not** yet model, viewed through three separate lenses — **India-only** (a taxpayer living solely in India with only Indian income), **US-only** (solely US), and **cross-border** — so domestic accuracy is tracked with the same rigor as treaty work.

**Last verified against live sources: 11 July 2026.** Items marked "verified" were checked by web research on that date, not recalled from memory. Re-verify time-sensitive rows (rates, thresholds, treaty status) every quarter and after every Union Budget / US tax act.

**Status legend:** ✅ modeled · 🟡 partial · ❌ missing · 🔍 needs code verification · 🚫 out of scope by design

**Build Now? legend** (added per request — divides every row by whether *I* can build it without waiting on anything):
- 🟢 **Now** — every input already exists somewhere in Layer 1 (India or US); this is engine/UI work only, no form changes needed. Where only *part* of a row is buildable now, the Detail column says so explicitly.
- 🟡 **Needs field** — genuinely blocked until a new Layer 1 field is added (via an Antigravity prompt or direct edit) and round-tripped back.
- ⚪ **N/A** — doesn't fit the Now/Needs-field frame: already in flight with a prompt issued, a recorded out-of-scope decision, or needs a Layer 1 coverage check before it can even be classified.

**In-product surfacing:** every 🚫/assurance row that is not rule-encodable (GAAR, STT, payer-side TDS, clubbing depth, FICA levy, FATCA Ch.4, mocked uploads, plus the MLI/DTAA assurances) is ALSO shown inside the Monitor itself — the "Deliberately out of scope" card at the bottom of the overview, built by `buildScopeNotes()` in conflicts.js and gated per profile (e.g. the payer-TDS note only appears for business profiles, FICA only when US wages/SE income exist). The tracker records the decision; the Monitor discloses it to the professional.

**Priority legend:** P1 = real money exposure computable or misstatement risk now · P2 = valuable, needs new Layer 1 fields or moderate build · P3 = completeness/edge audience

---

## A. India-only lens (domestic taxpayer, no US exposure)

| ID | Item | Status | Build Now? | Priority | Detail |
|---|---|---|---|---|---|
| IN-1 | **Advance-tax / late-filing interest — ss.423/424/425 (old 234A/B/C)** | ❌ | 🟢 Now | **P1** | 1%/month simple interest, carried unchanged into ITA 2025 as s.423 (late return), s.424 (advance-tax default), s.425 (installment deferment), s.426 (excess refund). **All inputs already exist**: quarterly advance tax (`tax_credits.advance_tax_q1..q4`), TDS aggregate, and the engine's own computed liability. Fully computable today — the single biggest domestic-India gap with zero new-field cost. |
| IN-2 | Late-filing fee + penalty regime (old 234F ₹5,000; 270A under-reporting 50%/200%) | ❌ | 🟡 Needs field | P2 | Natural companion to IN-1. The fee needs an actual-filing-date field Layer 1 doesn't collect; the 270A under-reporting exposure is disclosure-only and could ship without it. |
| IN-3 | **Agricultural income — partial integration** | ❌ | 🟡 Needs field | P2 | Exempt income that still raises the effective slab rate when agri income > ₹5,000 and total income exceeds the exemption limit. No Layer 1 field exists (only a tooltip mention under misc income). Needs one new field + rate-integration math. Very common for HUF/family profiles. |
| IN-4 | **Property sale capital gains — engine-side computation** | 🔍 | 🟢 Now | **P1** | Layer 1 collects the complete property-sale card (acquisition date/cost, improvements, pre-2001 FMV, transfer expenses, stamp-duty-value override, reinvestment-exemption elections, buyer TDS) but the engine appears to consume only pre-aggregated CG figures — the per-property computation (indexation where applicable, 50C deemed consideration, exemption caps: ₹50L bond limit, ₹10cr cap on residential reinvestment) is not verified engine-side. Verify, then close whichever half is missing. |
| IN-5 | AMT for non-corporates (old 115JC, 18.5% on adjusted total income) | ❌ | 🟡 Needs field | P3 | Relevant to firms/LLPs and old-regime individuals claiming specified deductions (10AA/35AD/Ch VI-A part C). Corporate MAT **is** modeled (book-profit proxy); the non-corporate twin needs the specified-deduction detail Layer 1 doesn't break out. |
| IN-6 | Presumptive taxation — s.58 (old 44AD/44ADA/44AE) | 🟡 | 🟢 Now | P2 | Verified current limits: business ₹2cr (₹3cr when cash receipts <5%), professional ₹50L (₹75L when cash <5%), rates 8%/6% and 50% carried into ITA 2025 s.58 unchanged. Layer 1 already has presumptive fields and `updateBizPresumptive`; engine-side depth (limit tests, 5-year lock-in, audit-if-opt-out interplay) is a build against existing data. |
| IN-7 | Tax-audit threshold flag (s.44AB — ₹1cr / ₹10cr when ≥95% digital) | ❌ | 🟢 Now | P3 | Pure disclosure flag from turnover already captured in business entries. Cheap. |
| IN-8 | House-property depth: ₹2L loss set-off cap, 30% standard deduction, 1/5 pre-construction amortization | 🔍 | 🟢 Now | P2 | HP income is aggregated and loss set-off exists, but whether the ₹2L inter-head cap and 1/5 amortization are enforced engine-side needs verification, then closing against data already captured. |
| IN-9 | Deduction breadth: 80G, 80E, 80DDB, 80U/80DD (old regime) | 🟡 | ⚪ N/A | P3 | Engine consumes only 80C / 80CCD(1B) / 80CCD(2) / 80D / 80TTA-TTB. Whether Layer 1 even captures the others is unverified — must check Layer 1 coverage before this can be classified 🟢 or 🟡. Mostly moot under the new regime. |
| IN-10 | s.89 salary-arrears relief (Form 10E) | ❌ | 🟡 Needs field | P3 | Needs new fields (arrears by year). Niche but real for job-switchers/PSU arrears. |
| IN-11 | Clubbing depth (s.64 old) | 🟡 | ⚪ N/A | P3 | Raw clubbed amounts are captured and taxed; no detection/validation logic (e.g. spouse-asset-transfer tracing). Accepted as data-entry-driven — recorded decision, not a build item. |
| IN-12 | s.194P (75+ senior, bank files for them — no return needed) | ❌ | 🟢 Now | P3 | Trivial disclosure from DOB + income mix. |
| IN-13 | STT (raised on F&O by Finance Act 2026) | 🚫 | ⚪ N/A | — | Transaction tax, not income tax. `stt_paid` flags already drive the CG regime correctly; the levy itself stays out of scope. |
| IN-14 | GST | 🚫 | ⚪ N/A | — | Indirect tax; out of scope by design. Note only so the decision is recorded. |
| IN-15 | **Winnings TDS — s.194B / s.194BA (flat 30%)** | ❌ | 🟢 Now | P2 | Layer 1 already captures `winnings_lottery_gaming_inr` and `online_gaming_winnings_inr`, and the engine already taxes them at the special rate — but no expected-TDS row exists on the Withholding page. Computable **today** as a statutory estimate, exactly like the s.194S crypto row (194BA gaming TDS has no threshold at all; 194B lottery has ₹10,000 per-transaction). |
| IN-16 | **s.197 Lower-TDS Certificate — engine never consumes it** | ❌ | 🟢 Now | P2 | Layer 1 collects the full certificate (approved rate, validity start/end dates, covered income types: property CG / NRO interest / dividend / royalty-FTS) but nothing engine-side reads it. Should cross-check the certificate rate against actual withholding on covered streams and flag expiry/coverage mismatches. Data fully exists. |
| IN-17 | Form 15G / 15H self-declarations (no-TDS on interest below taxable limit) | ❌ | 🟡 Needs field | P3 | No Layer 1 field. Companion to the in-flight 194A interest-TDS field — a declaration on file explains a legitimately-zero TDS figure. |
| IN-18 | s.206AB higher TDS for ITR non-filers (and s.206AA no-PAN quantification) | 🟡 | 🟡 Needs field | P3 | The PAN-Aadhaar-inoperative banner covers the s.397(2)/206AA-style override qualitatively; the non-filer double-rate rule needs a "filed ITR last year?" field, and neither is quantified per-row. |
| IN-19 | Remaining resident TDS streams: s.194K (MF income), s.194LBA (REIT/InvIT distributions — the `reit_invit` asset class already exists), s.194N (cash withdrawal), s.192 salary-TDS breakout | ❌ | 🟡 Needs field | P3 | Beyond the five streams in the in-flight Antigravity prompt (XB-13). Each needs a Layer 1 field; salary TDS is currently indistinguishable inside the 26AS aggregate. |
| IN-20 | Document-upload extraction is simulated | 🚫 product | ⚪ N/A | — | The "26AS upload" (hardcodes ₹2,84,350), Lower-TDS-cert upload, bank-statement and property-doc uploads are demo mocks, not real OCR/parsing. Recording so nobody mistakes them for live extraction; real parsing is a product build, not a tax-rule gap. |
| IN-21 | ~~CRITICAL — `net_profit_inr` read but never set by Layer 1 India~~ **FIXED** | ✅ shipped | — | — | Real computation added: s.58/44AD (6%/8% digital/cash), s.58/44ADA (50% flat), s.58/44AE (goods-vehicle presumptive from `goods_vehicles[]`, Rs1,000/ton/mo heavy or Rs7,500/mo flat), and regular-books (gross receipts less the unambiguous general-PGBP expense categories — depreciation/F&O/disallowances still Phase 1, see IN-22..25). Hand-injected `net_profit_inr` still honored first (demo profiles), falls through to real computation when absent. Verified: 4 synthetic cases hand-checked exact, 9-profile harness unchanged, Rohan Mehta's consulting entity converted off the phantom field entirely (₹18L x 50% = ₹9L, matching the old injected figure bit-for-bit) and confirmed live in the Business tab. |
| IN-22 | F&O vs speculative income — kept out of ordinary net profit, ring-fenced set-off | ❌ | 🟢 Now | P2 | Layer 1 already splits `fno_turnover_inr`/`non_speculative_income_inr` (ordinary PGBP) from `speculative_income_inr`/`speculative_turnover_inr` (settable only against speculative income/loss, same shape as the VDA-never-loss-set-off rule). Engine currently does neither. See spec §2.2. |
| IN-23 | Business disallowances not folded into net profit (s.40A(3) cash limits, s.40(a) non-TDS payments, s.43B(h) MSME timing) | ❌ | 🟢 Now | P2 | `payments_to_non_residents_no_tds_inr`/`payments_to_residents_no_tds_inr` are already read for the existing disallowance *finding* but never actually reduce computed business income; the cash-payment and MSME-timing (`msme_payables[]`) disallowances aren't touched at all despite full data. See spec §2.1. |
| IN-24 | Partner-firm pass-through (`partner_firms[]`) not read anywhere | ❌ | 🟢 Now | P2 | Remuneration + interest-on-capital (taxable PGBP to the partner) and exempt profit share (must NOT be taxed again) are fully captured per firm but never enter income aggregation. See spec §2.3. |
| IN-25 | Depreciation (`asset_blocks[]`) not computed | ❌ | 🟢 Now | P2 | WDV-method blocks (opening WDV, additions, rate) are captured per business entry; no current-year depreciation charge is computed, so it neither reduces net profit nor feeds the (already-modeled) unabsorbed-depreciation carryforward correctly. See spec §2.4. |
| IN-26 | s.44BBB (foreign co. civil construction, 10% presumptive) / s.35AD (100% capex deduction, specified businesses) / s.115V tonnage tax (shipping) — all uncomputed | ❌ | 🟢 Now | P3 | `s44bbb_receipts_inr`, `specified_business_s35AD_inr`, `tonnage_tax_115V_inr` are fully captured (found on re-audit — the first tracker pass truncated its field read and missed these) but never touched engine-side. Smaller affected population than IN-21/22 but genuinely data-complete. See spec §2.7. |

**Buildable-now count (India): 13 of 25 remaining** (IN-21 shipped) — IN-1, IN-4, IN-6, IN-7, IN-8, IN-12, IN-15, IN-16, IN-22, IN-23, IN-24, IN-25, IN-26.

**See also `docs/BUSINESS_ENTITY_ARCHITECTURE.md`** for the full multi-entity architecture spec (entity graph, inter-entity flows, phased build order) that IN-21 through IN-25 and US-16/17 all fold into — that document is the source of truth for sequencing this work; don't duplicate the phase plan here.

**Verified current (India, 11 Jul 2026):** Finance Act 2026 (assented 30 Mar 2026) made **no slab changes** for TY2026-27 — new-regime slabs and the ₹60,000 / ₹12L §87A-equivalent rebate stand as already built; buyback-as-capital-gains from 1 Apr 2026 is already modeled; ITA 2025 renumbering already applied throughout.

---

## B. US-only lens (domestic taxpayer, no India exposure)

| ID | Item | Status | Build Now? | Priority | Detail |
|---|---|---|---|---|---|
| US-1 | **Estimated-tax underpayment penalty (§6654 / Form 2210)** | ❌ | 🟢 Now | **P1** | Safe harbors: lesser of 90% current-year or 100% prior-year (110% if prior AGI > $150k); no penalty if balance < $1,000. Quarterly IRS underpayment rates (verified): 7% Q1-2026, 6% Q2-2026, 7% Q3-2026. **All inputs already exist**: quarterly estimates, W-2 withholding, `prior_year_total_tax_usd`, computed liability. The exact US mirror of IN-1 — computable today. |
| US-2 | **Social Security benefit taxability (0/50/85% provisional-income tiers)** | ❌ **active misstatement** | 🟢 Now | **P1** | `aggregateUsIncome` currently folds 100% of `social_security_benefits_usd` into taxable retirement income. Correct law caps inclusion at 85% (and can be 0%/50%) via the provisional-income test. This **overstates tax** for every SS-receiving profile — a correctness bug, not just a gap. (OBBBA did *not* exempt SS; it added the $6,000 senior deduction, which IS modeled.) All inputs (SS benefits, other AGI components, filing status) already exist. |
| US-3 | Capital-loss $3,000/yr limit + carryover; wash sales | 🔍/❌ | 🟢 Now/partial | P2 | The current-year $3,000 limit against ordinary income is computable now from existing gain/loss totals. Carryover to future years needs a new "prior-year capital loss carryover" field; wash-sale detection is unmodeled at disclosure level even with new fields. |
| US-4 | §121 home-sale exclusion ($250k/$500k MFJ) | ❌ | 🟡 Needs field | P2 | `real_estate.properties` captured, but no sale price / ownership-and-use-test dates. Common and high-dollar. |
| US-5 | Retirement mechanics: §72(t) 10% early-withdrawal penalty, RMDs (age 73; 75 from 2033), excess-contribution excise | ❌ | 🟢 Now/partial | P2 | The 10% early-withdrawal penalty is computable now from existing gross distribution amounts + DOB (age < 59½ test), absent an exception flag. RMDs need account *balances*, which aren't captured — that half is 🟡 Needs field. |
| US-6 | §3406 backup withholding, §3405 pension withholding, W-2G gambling withholding | ❌ | 🟡 Needs field | P2 | Carried from the withholding work: Layer 1 has gross-only fields for 1099/retirement/gambling income — no withholding sub-fields. Needs Layer 1 additions (previously offered as option 4). |
| US-7 | Form 1099-DA digital-asset broker reporting | ❌ | 🟢 Now | P3 | Verified: gross-proceeds reporting mandatory for 2025 transactions (filed early 2026); **basis reporting mandatory for covered assets from 1 Jan 2026**. `has_crypto` already exists; add an awareness/reconciliation finding. |
| US-8 | FEIE housing exclusion/deduction | ❌ | 🟡 Needs field | P3 | FEIE itself is modeled; the §911(c) housing component needs housing-expense amounts Layer 1 doesn't collect. |
| US-9 | Form 1116 FTC baskets (passive vs general), HTKO | 🟡 | 🟢 Now | P2 | Single-limitation FTC is modeled; the income streams needed to split into passive vs general baskets (interest/dividends vs wages) are already categorized in the data — this is a computation-depth build, not a missing-field one. |
| US-10 | Kiddie tax (§1(g)) | ❌ | 🟡 Needs field | P3 | Dependent count exists; unearned-income-by-child detail doesn't. Low priority for the audience. |
| US-11 | EITC / ACA premium tax credit / Saver's credit | ❌ | 🟡 Needs field | P3 | Low-income-skewed credits; audience skews high-income. Needs credit-specific inputs Layer 1 doesn't collect. Likely 🚫 by design — decide and record. |
| US-12 | State income tax **computation** | ❌ | 🟢 Now (large) | P2-decide | Residency conflicts (CA/NY rules) are modeled but computed state tax is $0 everywhere. Residency + income data already exists — this is a large engine build, not a blocked-on-fields one. Either build top-5 NRI states (CA/NY/NJ/TX/WA — two of which have no income tax) or explicitly banner "federal only." |
| US-13 | **FICA withholding invisible on the Withholding page** | ❌ | 🟢 Now | P2 | Layer 1 US already captures `ss_tax_withheld_usd` (box 4) and `medicare_tax_withheld_usd` (box 6) per W-2, but the Withholding page shows only federal + state. Pure display addition — data fully exists, no new fields. |
| US-14 | **Excess Social Security withholding credit (multiple employers)** | ❌ | 🟢 Now | P2 | When two employers each withhold 6.2% up to the wage base, the combined excess over one wage-base-worth is a refundable credit (Schedule 3). Computable from the same per-W2 box-4 fields Layer 1 already captures. Wage base: $176,100 for 2025; **2026 figure must be verified before building** (SSA COLA announcement). Directly relevant to job-switcher profiles like Aarav Sharma. |
| US-15 | FICA/FUTA as a levy (employer + employee employment tax) | 🚫 recorded | ⚪ N/A | — | Different tax base from income tax; only Additional Medicare 0.9% (modeled ✓) and the two withholding-visibility items above intersect this app. Recording the boundary so it isn't re-litigated. |
| US-16 | ~~`guaranteed_payments_usd` dropped from partnership K-1 income entirely~~ **FIXED** | ✅ shipped | — | — | Bigger than scoped: Box 14A (`self_employment_earnings_usd`, the K-1's own authoritative, partner-type-aware SE-tax figure) was never read at all — partnership SE tax was unconditionally $0 for every K-1. Guaranteed payments now flow into `businessUs`; Box 14A now drives SE tax (falls back to guaranteed + ordinary-if-general when absent); QBI correctly stays ordinary-income-only. A self-introduced double-count bug (QBI briefly inheriting Box 14A via `qbiIncome = seEarnings`) was caught by hand-verification before shipping and fixed by reordering. Verified: Rohan Mehta gained a general-partner K-1 ($18k ordinary + $12k guaranteed, Box 14A $30k) — businessUs +$30k (was +$18k pre-fix), SE tax reflects the full $30k, QBI deduction exactly $16,000 = 20% x $80,000. |
| US-17 | `trusts_estates_k1[]` entirely absent from `businessEntities()` | ❌ | 🟢 Now | P2 | Fully collected (with its own QBI-addition helper already in the form) but never read engine-side. See `docs/BUSINESS_ENTITY_ARCHITECTURE.md` §2.5. |
| US-18 | US depreciation / §179 / bonus depreciation — full MACRS asset system uncomputed | ❌ | 🟢 Now | P2 | Found on re-audit (missed in the first pass, which only checked India-side depreciation): the asset-row UI shared across Sch C/farm/rental/K-1/1120 already carries real MACRS class rates, §179 amount (with the form's own published caps), bonus-depreciation election, cost basis, and placed-in-service date — none of it computed. C-corp `schedule_m1`/`schedule_m2` book-to-tax reconciliation also collected and unread (currently bypassed via direct `taxable_income_usd`). See spec §2.6. |

**Buildable-now count (US): 11 of 17 remaining (2 partial)** (US-16 shipped) — US-1, US-2, US-3 (partial), US-5 (partial), US-7, US-9, US-12, US-13, US-14, US-17, US-18.

**Verified current / already modeled (US):** NIIT 3.8% ✓ · Additional Medicare 0.9% ✓ · SE tax ✓ · QBI §199A ✓ · AMT with ISO/PAB preferences ✓ · OBBBA SALT cap $40k with 30¢ phase-down ✓ · OBBBA senior deduction ✓ · OBBBA tips/overtime deductions ✓ · CTC $2,200 ✓ · Trump Account §530A cap ✓ · FBAR $10k and Form 8938 thresholds unchanged for 2025/2026 ✓.

---

## C. Cross-border lens (carried forward, verified 11 Jul 2026)

| ID | Item | Status | Build Now? | Priority | Detail |
|---|---|---|---|---|---|
| XB-1 | **US estate & gift tax exposure** | ❌ | 🟢 Now | **P1** | No India-US estate treaty (income-tax DTAA only). NRA US-situs assets get a frozen **$60,000** exemption vs the OBBBA-permanent **$15M/$30M** (2026+, inflation-indexed 2027+) for citizens/residents; 40% top rate, zero treaty relief. No Form 706-NA / 709 / lifetime-gift tracking anywhere. Layer 1 already knows US brokerage/property values — an exposure estimate is computable now. |
| XB-2 | **No US-India totalization agreement** (verified still unconcluded; India submitted EPF/NPS/ESIC data, raised at Jan TPF) | ❌ | 🟢 Now | **P1** | Double social-security cost on the same earnings (US FICA 15.3% SE + India EPF), no credit either way. Computable disclosure for profiles with SE/consulting income both sides. |
| XB-3 | Form 3520/3520-A penalty exposure (gifts > $100k individual / $20,573 corp 2026; 5%/mo to 25%) | 🟡 | 🟢 Now/partial | P2 | A qualitative flag (gift received above threshold, trust beneficiary) is buildable now from the existing boolean facts. Quantifying the actual 5%/month penalty needs the gift's dollar VALUE, which isn't captured as a field yet — that half is 🟡. |
| XB-4 | PFIC §1291/QEF/MTM computation (Form 8621, Dec-2025 revision) | 🟡 | 🟡 Needs field | P2 | Holdings tracked (name + value), but per-fund acquisition date, distributions received, and QEF/MTM election status aren't captured — all required for any of the three computation methods. Indian mutual funds ≈ PFICs — the most punitive common trap for US-person NRIs. |
| XB-5 | Forms 8865 / 8858 / 926 (foreign partnerships, DREs, transfers to foreign corps) | ❌ | 🟡 Needs field | P3 | Only 5471/PFIC entity data is captured today; foreign partnerships and DREs aren't modeled as entities at all. |
| XB-6 | Form 8854 exit tax (covered expatriate) | 🟡 | 🟢 Now/partial | P2 | The covered-expatriate flag itself (GC-years-held + I-407 date, both already captured) is buildable now. The actual mark-to-market exit tax computation needs asset-basis data Layer 1 doesn't collect — that half is 🟡. |
| XB-7 | Black Money Act 2015 exposure (30% + up to 300% penalty, prosecution) | 🟡 | 🟢 Now | P2 | Schedule FA facts already exist; this is a qualitative exposure-framing finding (distinct from ordinary under-reporting), not a new-data build. |
| XB-8 | Transfer pricing (s.92) related-party flag | ❌ | 🟢 Now | P3 | Disclosure-level flag when founder↔company cross-border dealings are detected (e.g. Vikram Rao's buyback) — detectable from entity/ownership data already captured. No ALP computation — by design. |
| XB-9 | GAAR | 🚫 | ⚪ N/A | — | Facts-and-circumstances doctrine; not safely rule-encodable. Recorded as deliberate exclusion. |
| XB-10 | MLI | 🚫 verified non-issue | ⚪ N/A | — | US never signed the MLI → India-US treaty untouched. Nothing to build. |
| XB-11 | India-US DTAA | ✅ current | ⚪ N/A | — | No amendment since the 2000 protocol; as modeled. |
| XB-12 | W-9 / FATCA self-certification pair | 🟡 in flight | ⚪ N/A | P2 | Both Antigravity prompts issued (India bank-level self-cert; US-side W-9-on-file). Engine wiring pending the updated Layer 1 files. |
| XB-13 | India resident per-source TDS fields (194A/193/194/194DA/194-I) | 🟡 in flight | ⚪ N/A | P2 | Antigravity prompt issued; engine wiring pending. |
| XB-14 | **GILTI / Subpart F quantification — and OBBBA "NCTI" parameters if built** | 🟡 | 🟡 Needs field | P2 | Currently disclosure-only (Form 5471 flag; no dollar figure). Actual CFC financials (E&P, QBAI, tested income) aren't captured — needed before any quantification, whichever era's rules are used. If/when built it must use the OBBBA rules effective TY2026: renamed **NCTI**, §250 deduction 50%→40%, QBAI exclusion eliminated, FTC haircut 20%→10% — recorded now so a future build doesn't use pre-2026 parameters. |
| XB-15 | Chapter XII-A Layer 1 round-trip (`nri_exit_type` dropdown + `investment_income_this_year` field) | 🟡 in flight | ⚪ N/A | P2 | Antigravity prompt issued earlier in the project; engine side is already built and safely gated (computes nothing while the fields are absent). Waiting on the updated `layer1_india.html`. |
| XB-16 | Payer-side withholding-agent compliance (taxpayer AS deductor) | 🚫 recorded | ⚪ N/A | — | The s.40(a)(i)/(ia) disallowance fields already feed the business computation (expense denial for failing to deduct TDS on payments made). Deliberately excluded from the Withholding Taxes page, which covers tax withheld FROM the taxpayer's income — recording the decision so it isn't re-litigated. |
| XB-17 | FATCA Chapter 4 (§§1471-1474) withholding on payments to FFIs | 🚫 | ⚪ N/A | — | Institution-side withholding regime; individuals interact with it only via the self-certification items already tracked (XB-12). Out of scope by design. |

**Buildable-now count (cross-border): 6 of 17 (3 partial)** — XB-1, XB-2, XB-3 (partial), XB-6 (partial), XB-7, XB-8.

---

## D. Buildability summary

Across all 61 rows:

| Bucket | India | US | Cross-border | Total |
|---|---|---|---|---|
| 🟢 Buildable now, not yet done | 13 | 11 (2 partial) | 6 (3 partial) | **30** |
| ✅ Shipped from the 🟢 bucket | 1 (IN-21) | 1 (US-16) | 0 | **2** |
| 🟡 Blocked on a new Layer 1 field | 7 | 5 | 3 | **15** |
| ⚪ N/A (in-flight, recorded, or verify-first) | 5 | 1 | 8 | **14** |
| **Total** | 26 | 18 | 17 | **61** |

Reading this: of the 32 items that needed zero form changes, **2 have shipped** (Phase 0 — see build order item 1, now done) and **30 remain**. **15 items are genuinely stuck** until a new field is added and round-tripped (several already have Antigravity prompts issued — see XB-12/13/15). The remaining **14** are either already handled, already decided, or need a quick Layer 1 audit before they can even be sorted into the other two buckets.

---

## E. Suggested build order (P1s first, drawing only from the 🟢 Now bucket)

1. ~~**IN-21 + US-16 together**~~ **✅ DONE** — the two CRITICAL business-income bugs (India business/firm/company computed ₹0 for real filers; US guaranteed payments + partnership SE tax dropped entirely). Phase 0 of `docs/BUSINESS_ENTITY_ARCHITECTURE.md`, shipped.
2. **US-2** — SS taxability tiers (fixes an active overstatement; small, self-contained).
3. **IN-1 + US-1 together** — advance-tax/estimated-tax interest & penalty engines (both sides' data already exists; symmetric feature, one "Payments & Penalties" surface).
4. **XB-1** — estate-exposure estimate (US-situs asset values already known; $60k vs $15M cliff is the single largest un-surfaced dollar figure in the app).
5. **XB-2** — totalization disclosure finding (cheap, high credibility).
6. **IN-22 + IN-23 + IN-24 + IN-25** (India, Phase 1) + **US-18** (US, Phase 1b, parallel) — F&O/speculative separation, disallowances, partner-firm pass-through, depreciation on both sides, immediately after Phase 0 lands.
7. **IN-4 verification** — property CG engine audit, then close whichever half is missing.
8. **IN-15 + IN-16** — winnings-TDS estimate row and Lower-TDS-certificate consumption (both computable from data Layer 1 already captures; no new fields).
9. **US-13 + US-14 + US-17** — FICA visibility, excess-SS credit, and trusts/estates K-1 inclusion (same W-2/entity data already driving the work above).
10. Remaining 🟢 items (US-3/5/7/9/12 partials, XB-3/6/7/8) as capacity allows.
11. **Business-entity Phases 2-6** (entity graph, inter-entity flow edges, entity-switcher frontend) per `docs/BUSINESS_ENTITY_ARCHITECTURE.md` §5, once Phase 0-1's per-entity numbers are solid.
9. 🟡 items as Layer 1 round-trips return (XB-12/13/15 already have prompts issued; US-6, IN-3/17-19 need prompts written).

## Maintenance

- Re-verify all "verified current" claims after: every Union Budget (Feb), every Finance Act notification (Mar), US filing-season changes (Jan), and any OBBBA technical corrections.
- When an item ships, move it to the relevant "verified current / already modeled" list with the commit hash rather than deleting the row.
- When a 🟡 row gets its Layer 1 field (prompt sent, file returned, engine wired), flip it to 🟢-done and note the commit, same as any other status change.

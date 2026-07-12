# Coverage Gap Tracker

Living document tracking everything WISING does **not** yet model, viewed through three separate lenses — **India-only** (a taxpayer living solely in India with only Indian income), **US-only** (solely US), and **cross-border** — so domestic accuracy is tracked with the same rigor as treaty work.

**Last verified against live sources: 11 July 2026.** Items marked "verified" were checked by web research on that date, not recalled from memory. Re-verify time-sensitive rows (rates, thresholds, treaty status) every quarter and after every Union Budget / US tax act.

**Status legend:** ✅ modeled · 🟡 partial · ❌ missing · 🔍 needs code verification · 🚫 out of scope by design

**In-product surfacing:** every 🚫/assurance row that is not rule-encodable (GAAR, STT, payer-side TDS, clubbing depth, FICA levy, FATCA Ch.4, mocked uploads, plus the MLI/DTAA assurances) is ALSO shown inside the Monitor itself — the "Deliberately out of scope" card at the bottom of the overview, built by `buildScopeNotes()` in conflicts.js and gated per profile (e.g. the payer-TDS note only appears for business profiles, FICA only when US wages/SE income exist). The tracker records the decision; the Monitor discloses it to the professional.

**Priority legend:** P1 = real money exposure computable or misstatement risk now · P2 = valuable, needs new Layer 1 fields or moderate build · P3 = completeness/edge audience

---

## A. India-only lens (domestic taxpayer, no US exposure)

| ID | Item | Status | Priority | Detail |
|---|---|---|---|---|
| IN-1 | **Advance-tax / late-filing interest — ss.423/424/425 (old 234A/B/C)** | ❌ | **P1** | 1%/month simple interest, carried unchanged into ITA 2025 as s.423 (late return), s.424 (advance-tax default), s.425 (installment deferment), s.426 (excess refund). **All inputs already exist**: quarterly advance tax (`tax_credits.advance_tax_q1..q4`), TDS aggregate, and the engine's own computed liability. Fully computable today — the single biggest domestic-India gap with zero new-field cost. |
| IN-2 | Late-filing fee + penalty regime (old 234F ₹5,000; 270A under-reporting 50%/200%) | ❌ | P2 | Natural companion to IN-1. Fee is deterministic from filing date; penalty is exposure-disclosure only. |
| IN-3 | **Agricultural income — partial integration** | ❌ | P2 | Exempt income that still raises the effective slab rate when agri income > ₹5,000 and total income exceeds the exemption limit. No Layer 1 field exists (only a tooltip mention under misc income). Needs one new field + rate-integration math. Very common for HUF/family profiles. |
| IN-4 | **Property sale capital gains — engine-side computation** | 🔍 | **P1** | Layer 1 collects the complete property-sale card (acquisition date/cost, improvements, pre-2001 FMV, transfer expenses, stamp-duty-value override, reinvestment-exemption elections, buyer TDS) but the engine appears to consume only pre-aggregated CG figures — the per-property computation (indexation where applicable, 50C deemed consideration, exemption caps: ₹50L bond limit, ₹10cr cap on residential reinvestment) is not verified engine-side. Verify, then close whichever half is missing. |
| IN-5 | AMT for non-corporates (old 115JC, 18.5% on adjusted total income) | ❌ | P3 | Relevant to firms/LLPs and old-regime individuals claiming specified deductions (10AA/35AD/Ch VI-A part C). Corporate MAT **is** modeled (book-profit proxy); the non-corporate twin is not. |
| IN-6 | Presumptive taxation — s.58 (old 44AD/44ADA/44AE) | 🟡 | P2 | Verified current limits: business ₹2cr (₹3cr when cash receipts <5%), professional ₹50L (₹75L when cash <5%), rates 8%/6% and 50% carried into ITA 2025 s.58 unchanged. Layer 1 has presumptive fields and the form has `updateBizPresumptive`; engine-side depth (limit tests, 5-year lock-in, audit-if-opt-out interplay) unverified. |
| IN-7 | Tax-audit threshold flag (s.44AB — ₹1cr / ₹10cr when ≥95% digital) | ❌ | P3 | Pure disclosure flag from turnover already captured in business entries. Cheap. |
| IN-8 | House-property depth: ₹2L loss set-off cap, 30% standard deduction, 1/5 pre-construction amortization | 🔍 | P2 | HP income is aggregated and loss set-off exists, but whether the ₹2L inter-head cap and 1/5 amortization are enforced engine-side needs verification. |
| IN-9 | Deduction breadth: 80G, 80E, 80DDB, 80U/80DD (old regime) | 🟡 | P3 | Engine consumes only 80C / 80CCD(1B) / 80CCD(2) / 80D / 80TTA-TTB. If Layer 1 captures others they're silently ignored — verify Layer 1 side, then either wire or explicitly disclose. Mostly moot under the new regime. |
| IN-10 | s.89 salary-arrears relief (Form 10E) | ❌ | P3 | Needs new fields (arrears by year). Niche but real for job-switchers/PSU arrears. |
| IN-11 | Clubbing depth (s.64 old) | 🟡 | P3 | Raw clubbed amounts are captured and taxed; no detection/validation logic (e.g. spouse-asset-transfer tracing). Acceptable as data-entry-driven; document as such. |
| IN-12 | s.194P (75+ senior, bank files for them — no return needed) | ❌ | P3 | Trivial disclosure from DOB + income mix. |
| IN-13 | STT (raised on F&O by Finance Act 2026) | 🚫 | — | Transaction tax, not income tax. `stt_paid` flags already drive the CG regime correctly; the levy itself stays out of scope. |
| IN-14 | GST | 🚫 | — | Indirect tax; out of scope by design. Note only so the decision is recorded. |
| IN-15 | **Winnings TDS — s.194B / s.194BA (flat 30%)** | ❌ | P2 | Layer 1 already captures `winnings_lottery_gaming_inr` and `online_gaming_winnings_inr`, and the engine already taxes them at the special rate — but no expected-TDS row exists on the Withholding page. Computable **today** as a statutory estimate, exactly like the s.194S crypto row (194BA gaming TDS has no threshold at all; 194B lottery has ₹10,000 per-transaction). |
| IN-16 | **s.197 Lower-TDS Certificate — engine never consumes it** | ❌ | P2 | Layer 1 collects the full certificate (approved rate, validity start/end dates, covered income types: property CG / NRO interest / dividend / royalty-FTS) but nothing engine-side reads it. Should cross-check the certificate rate against actual withholding on covered streams and flag expiry/coverage mismatches. Data fully exists. |
| IN-17 | Form 15G / 15H self-declarations (no-TDS on interest below taxable limit) | ❌ | P3 | No Layer 1 field. Companion to the in-flight 194A interest-TDS field — a declaration on file explains a legitimately-zero TDS figure. |
| IN-18 | s.206AB higher TDS for ITR non-filers (and s.206AA no-PAN quantification) | 🟡 | P3 | The PAN-Aadhaar-inoperative banner covers the s.397(2)/206AA-style override qualitatively; the non-filer double-rate rule needs a "filed ITR last year?" field, and neither is quantified per-row. |
| IN-19 | Remaining resident TDS streams: s.194K (MF income), s.194LBA (REIT/InvIT distributions — the `reit_invit` asset class already exists), s.194N (cash withdrawal), s.192 salary-TDS breakout | ❌ | P3 | Beyond the five streams in the in-flight Antigravity prompt (XB-13). Each needs a Layer 1 field; salary TDS is currently indistinguishable inside the 26AS aggregate. |
| IN-20 | Document-upload extraction is simulated | 🚫 product | — | The "26AS upload" (hardcodes ₹2,84,350), Lower-TDS-cert upload, bank-statement and property-doc uploads are demo mocks, not real OCR/parsing. Recording so nobody mistakes them for live extraction; real parsing is a product build, not a tax-rule gap. |

**Verified current (India, 11 Jul 2026):** Finance Act 2026 (assented 30 Mar 2026) made **no slab changes** for TY2026-27 — new-regime slabs and the ₹60,000 / ₹12L §87A-equivalent rebate stand as already built; buyback-as-capital-gains from 1 Apr 2026 is already modeled; ITA 2025 renumbering already applied throughout.

---

## B. US-only lens (domestic taxpayer, no India exposure)

| ID | Item | Status | Priority | Detail |
|---|---|---|---|---|
| US-1 | **Estimated-tax underpayment penalty (§6654 / Form 2210)** | ❌ | **P1** | Safe harbors: lesser of 90% current-year or 100% prior-year (110% if prior AGI > $150k); no penalty if balance < $1,000. Quarterly IRS underpayment rates (verified): 7% Q1-2026, 6% Q2-2026, 7% Q3-2026. **All inputs already exist**: quarterly estimates, W-2 withholding, `prior_year_total_tax_usd`, computed liability. The exact US mirror of IN-1 — computable today. |
| US-2 | **Social Security benefit taxability (0/50/85% provisional-income tiers)** | ❌ **active misstatement** | **P1** | `aggregateUsIncome` currently folds 100% of `social_security_benefits_usd` into taxable retirement income. Correct law caps inclusion at 85% (and can be 0%/50%) via the provisional-income test. This **overstates tax** for every SS-receiving profile — a correctness bug, not just a gap. (OBBBA did *not* exempt SS; it added the $6,000 senior deduction, which IS modeled.) |
| US-3 | Capital-loss $3,000/yr limit + carryover; wash sales | 🔍/❌ | P2 | Net-negative capital gain treatment unverified; no carryover fields; wash-sale rule unmodeled (disclosure-level at best). |
| US-4 | §121 home-sale exclusion ($250k/$500k MFJ) | ❌ | P2 | `real_estate.properties` captured; no sale/exclusion computation. Common and high-dollar. |
| US-5 | Retirement mechanics: §72(t) 10% early-withdrawal penalty, RMDs (age 73; 75 from 2033), excess-contribution excise | ❌ | P2 | Distributions captured gross-only; no age/penalty logic despite DOB being available. |
| US-6 | §3406 backup withholding, §3405 pension withholding, W-2G gambling withholding | ❌ | P2 | Carried from the withholding work: Layer 1 has gross-only fields for 1099/retirement/gambling income — no withholding sub-fields. Needs Layer 1 additions (previously offered as option 4). |
| US-7 | Form 1099-DA digital-asset broker reporting | ❌ | P3 | Verified: gross-proceeds reporting mandatory for 2025 transactions (filed early 2026); **basis reporting mandatory for covered assets from 1 Jan 2026**. `has_crypto` exists; add an awareness/reconciliation finding. |
| US-8 | FEIE housing exclusion/deduction | ❌ | P3 | FEIE itself is modeled; the §911(c) housing component is not. |
| US-9 | Form 1116 FTC baskets (passive vs general), HTKO | 🟡 | P2 | Single-limitation FTC is modeled; basket separation is a simplification that can overstate usable credit when income mixes wages + investment. At minimum disclose; ideally split limitation by basket. |
| US-10 | Kiddie tax (§1(g)) | ❌ | P3 | Dependent count exists; unearned-income detail doesn't. Low priority for the audience. |
| US-11 | EITC / ACA premium tax credit / Saver's credit | ❌ | P3 | Low-income-skewed credits; audience skews high-income. Track for completeness; likely 🚫 by design — decide and record. |
| US-12 | State income tax **computation** | ❌ | P2-decide | Residency conflicts (CA/NY rules) are modeled but computed state tax is $0 everywhere. Full 50-state engines are a product decision, not a patch — either build top-5 NRI states (CA/NY/NJ/TX/WA — two of which have no income tax) or explicitly banner "federal only." |
| US-13 | **FICA withholding invisible on the Withholding page** | ❌ | P2 | Layer 1 US already captures `ss_tax_withheld_usd` (box 4) and `medicare_tax_withheld_usd` (box 6) per W-2, but the Withholding page shows only federal + state. Pure display addition — data fully exists, no new fields. |
| US-14 | **Excess Social Security withholding credit (multiple employers)** | ❌ | P2 | When two employers each withhold 6.2% up to the wage base, the combined excess over one wage-base-worth is a refundable credit (Schedule 3). Computable from the same per-W2 box-4 fields Layer 1 already captures. Wage base: $176,100 for 2025; **2026 figure must be verified before building** (SSA COLA announcement — not verifiable at audit time, search quota exhausted). Directly relevant to job-switcher profiles like Aarav Sharma. |
| US-15 | FICA/FUTA as a levy (employer + employee employment tax) | 🚫 recorded | — | Different tax base from income tax; only Additional Medicare 0.9% (modeled ✓) and the two withholding-visibility items above intersect this app. Recording the boundary so it isn't re-litigated. |

**Verified current / already modeled (US):** NIIT 3.8% ✓ · Additional Medicare 0.9% ✓ · SE tax ✓ · QBI §199A ✓ · AMT with ISO/PAB preferences ✓ · OBBBA SALT cap $40k with 30¢ phase-down ✓ · OBBBA senior deduction ✓ · OBBBA tips/overtime deductions ✓ · CTC $2,200 ✓ · Trump Account §530A cap ✓ · FBAR $10k and Form 8938 thresholds unchanged for 2025/2026 ✓.

---

## C. Cross-border lens (carried forward, verified 11 Jul 2026)

| ID | Item | Status | Priority | Detail |
|---|---|---|---|---|
| XB-1 | **US estate & gift tax exposure** | ❌ | **P1** | No India-US estate treaty (income-tax DTAA only). NRA US-situs assets get a frozen **$60,000** exemption vs the OBBBA-permanent **$15M/$30M** (2026+, inflation-indexed 2027+) for citizens/residents; 40% top rate, zero treaty relief. No Form 706-NA / 709 / lifetime-gift tracking anywhere. Layer 1 already knows US brokerage/property values — an exposure estimate is computable now. |
| XB-2 | **No US-India totalization agreement** (verified still unconcluded; India submitted EPF/NPS/ESIC data, raised at Jan TPF) | ❌ | **P1** | Double social-security cost on the same earnings (US FICA 15.3% SE + India EPF), no credit either way. Computable disclosure for profiles with SE/consulting income both sides. |
| XB-3 | Form 3520/3520-A penalty exposure (gifts > $100k individual / $20,573 corp 2026; 5%/mo to 25%) | 🟡 | P2 | Raw flags captured; no penalty-exposure finding. |
| XB-4 | PFIC §1291/QEF/MTM computation (Form 8621, Dec-2025 revision) | 🟡 | P2 | Holdings tracked, no tax computed. Indian mutual funds ≈ PFICs — the most punitive common trap for US-person NRIs. |
| XB-5 | Forms 8865 / 8858 / 926 (foreign partnerships, DREs, transfers to foreign corps) | ❌ | P3 | Only 5471/PFIC covered today. |
| XB-6 | Form 8854 exit tax (covered expatriate) | 🟡 | P2 | GC-years and I-407 date already captured; only a downstream gift flag exists. Mark-to-market exit computation missing. |
| XB-7 | Black Money Act 2015 exposure (30% + up to 300% penalty, prosecution) | 🟡 | P2 | Schedule FA nudge exists; BMA-specific exposure framing does not. |
| XB-8 | Transfer pricing (s.92) related-party flag | ❌ | P3 | Disclosure-level flag when founder↔company cross-border dealings detected (e.g. Vikram Rao buyback). No ALP computation — by design. |
| XB-9 | GAAR | 🚫 | — | Facts-and-circumstances doctrine; not safely rule-encodable. Recorded as deliberate exclusion. |
| XB-10 | MLI | 🚫 verified non-issue | — | US never signed the MLI → India-US treaty untouched. Nothing to build. |
| XB-11 | India-US DTAA | ✅ current | — | No amendment since the 2000 protocol; as modeled. |
| XB-12 | W-9 / FATCA self-certification pair | 🟡 in flight | P2 | Both Antigravity prompts issued (India bank-level self-cert; US-side W-9-on-file). Engine wiring pending the updated Layer 1 files. |
| XB-13 | India resident per-source TDS fields (194A/193/194/194DA/194-I) | 🟡 in flight | P2 | Antigravity prompt issued; engine wiring pending. |
| XB-14 | **GILTI / Subpart F quantification — and OBBBA "NCTI" parameters if built** | 🟡 | P2 | Currently disclosure-only (Form 5471 flag; no dollar figure). If/when quantified, it must use the OBBBA rules effective TY2026: renamed **NCTI**, §250 deduction 50%→40% (effective corporate rate 12.6%), QBAI 10% deemed-return exclusion **eliminated**, FTC haircut 20%→10% (90% creditable) — and an individual only reaches those rules via a §962 election, otherwise full ordinary rates. Recording now so a future build doesn't use pre-2026 parameters. |
| XB-15 | Chapter XII-A Layer 1 round-trip (`nri_exit_type` dropdown + `investment_income_this_year` field) | 🟡 in flight | P2 | Antigravity prompt issued earlier in the project; engine side is already built and safely gated (computes nothing while the fields are absent). Waiting on the updated `layer1_india.html`. |
| XB-16 | Payer-side withholding-agent compliance (taxpayer AS deductor) | 🚫 recorded | — | The s.40(a)(i)/(ia) disallowance fields already feed the business computation (expense denial for failing to deduct TDS on payments made). Deliberately excluded from the Withholding Taxes page, which covers tax withheld FROM the taxpayer's income — recording the decision so it isn't re-litigated. |
| XB-17 | FATCA Chapter 4 (§§1471-1474) withholding on payments to FFIs | 🚫 | — | Institution-side withholding regime; individuals interact with it only via the self-certification items already tracked (XB-12). Out of scope by design. |

---

## D. Suggested build order (P1s first)

1. **US-2** — SS taxability tiers (fixes an active overstatement; small, self-contained).
2. **IN-1 + US-1 together** — advance-tax/estimated-tax interest & penalty engines (both sides' data already exists; symmetric feature, one "Payments & Penalties" surface).
3. **XB-1** — estate-exposure estimate (US-situs asset values already known; $60k vs $15M cliff is the single largest un-surfaced dollar figure in the app).
4. **XB-2** — totalization disclosure finding (cheap, high credibility).
5. **IN-4 verification** — property CG engine audit, then close whichever half is missing.
6. **IN-15 + IN-16** — winnings-TDS estimate row and Lower-TDS-certificate consumption (both computable from data Layer 1 already captures; no new fields).
7. Remaining P2s as Layer 1 round-trips return (XB-12/13/15, US-6).

## Maintenance

- Re-verify all "verified current" claims after: every Union Budget (Feb), every Finance Act notification (Mar), US filing-season changes (Jan), and any OBBBA technical corrections.
- When an item ships, move it to the relevant "verified current / already modeled" list with the commit hash rather than deleting the row.

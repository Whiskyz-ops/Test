# Married filing audit — US, India and cross-border

29 Sep 2026. Scope: every rule that depends on (a) the US filing status
(married filing jointly / separately, surviving spouse) or (b) which spouse an
item belongs to — in US law, Indian law, and where the two meet.

This is a requirements tracker for review by a US CPA and an Indian CA. It says
what the Monitor does today, not what it should do in code; the fixes come
after review.

## How this was built

| Source | Used for | Access |
|---|---|---|
| PolicyEngine-US (parameters and variables, statute-cited) | Every US parameter keyed by filing status (47 files), every separate-filer eligibility rule (14 variables), every head/spouse per-person rule (23 variables) | Local copy |
| India-US DTAA Technical Explanation (the PDF you supplied) | Treaty rules touching spouses or family | Local copy |
| The engine (prototypes/graph-pilot, dag_py) and both intake forms | What is actually collected and computed | Local |
| IRS: Rev. Proc. 2025-32 (2026 inflation amounts), Notice 2025-67 (2026 retirement limits) | Every 2026 dollar amount in B–E | Downloaded from irs.gov, 29 Sep 2026 |
| US Code title 26 and Treas. Regs (Cornell LII) | The rule behind every row in B–E | Fetched from law.cornell.edu, 29 Sep 2026 |
| Income-tax Act 2025 ss.10, 92, 99, 159 and Rule 76 (extracts you supplied, `docs/sources/INDIA_ACT_2025_EXTRACTS.md`) | F and G rows that cite them | Local copy |
| incometaxindia.gov.in, ecfr.gov | — | Blocked (anti-bot) |

US rows B–E were checked against the statute and the 2026 IRS tables on
29 Sep 2026: every row now cites its IRC section, and the check turned up
four wrong results the earlier code read had missed (B4, B10, B19, B20).
India rows are from knowledge unless they cite the Act extracts you
supplied, and are marked for CA confirmation. Section numbers cite the 1961 Act;
the CA should map them to the 2025 Act.

Confirmed gaps have a runnable probe: `node scripts/audit/married-filing-probes.js`
(the probe works the legal answer by hand and compares it with the engine).

**Status:** ✅ handled · 🟡 partial · ❌ missing · 🐞 wrong result today · ➖ not relevant to this client base.
**Evidence:** *probe* = run through the engine; *code* = read in the engine; *form* = read in the intake form; *source* = primary text (IRC, Treas. Reg., IRS revenue procedure/notice, Indian Act); *law* = rule from PolicyEngine / treaty text / knowledge.

## Summary

| Area | Rows | ✅ | 🟡 | ❌ | 🐞 | ➖ |
|---|---|---|---|---|---|---|
| A. What the forms collect about the spouse | 11 | 1 | 4 | 6 | – | – |
| B. US filing-status parameters | 30 | 19 | 2 | 5 | 3 | 1 |
| C. US separate-filer eligibility | 9 | 2 | 1 | 3 | 2 | 1 |
| D. US per-person rules | 16 | 3 | 4 | 5 | 4 | – |
| E. Other US joint-return mechanics | 7 | 1 | 2 | 3 | 1 | – |
| F. India | 15 | 5 | 6 | 4 | – | – |
| G. Cross-border | 15 | 4 | 4 | 7 | – | – |
| **Total** | **103** | **35** | **23** | **33** | **10** | **2** |

### Wrong results found by the source check (code-read, not yet probed)

B10, B19 and B20 were fixed on 29 Sep 2026 (IN-54); B4 waits on the CPA's reading of the separate-filer SALT rule.

| Row | What happens | Who is affected |
|---|---|---|
| B4 | Separate filers' SALT cap: $10,000 floor instead of $5,000 and a 30% phase-down instead of an effective 15% (§164(b)(6)–(7)) | Married filing separately, MAGI above $252,500 |

### Wrong results today (probe-confirmed)

US-P3 (capital losses without the $3,000 limit, all filers) was fixed on 29 Sep 2026.

| Probe | What happens | Who is affected |
|---|---|---|
| XB-P1 | A spouse's US wages on a joint US return are taxed in the client's **Indian** return: ₹8,34,600 → ₹54,26,850 when a $150,000 spouse W-2 is added; India's s.90 relief grows to cover US tax on the spouse's wages. Fixed for spouses with their own linked profiles (household calculation, IN-57; probe XB-P2). Still wrong for a single profile that holds both spouses' income, which keeps the alert until it is split (build step 5) | Every Indian-resident client with a joint US return and an earning spouse |
| US-P1 | Social Security wage base pooled across spouses: client's $100,000 Schedule C taxed $2,678 instead of ≈ $14,129 | Joint returns where one spouse is employed and the other self-employed |
| US-P4, US-P5 | Separate filers get education credits and the student-loan interest deduction, which the law denies them | Married filing separately |
| US-P6 | Two spouses each deferring the $24,500 maximum get a false "excess elective deferral" warning | Joint returns |
| US-P2 | Senior deduction $6,000 instead of $12,000 when both spouses are 65+ (no spouse date of birth) | Joint returns with two seniors |

## A. What the forms collect about the spouse

| # | Item | Status | Evidence |
|---|---|---|---|
| A1 | Spouse SSN / ITIN on every joint return | 🟡 | *form*: asked only on the non-resident screen (`nra_specific.spouse_ssn_or_itin_type`) |
| A2 | Spouse date of birth (senior deduction, 65+ standard deduction, catch-ups, RMD, 72(t)) | ❌ | *form*: absent |
| A3 | Spouse citizenship / green card / residency | 🟡 | *form*: one checkbox, "Spouse is a US person?" (`profile.spouse_is_us_person`) |
| A4 | Spouse (and taxpayer) blind | ❌ | *form*: absent |
| A5 | "Taxpayer / Spouse" on W-2s, self-employment, IRA/401(k)/HSA contributions, pensions, Social Security, foreign earned income | ❌ | *form*: no owner field; bank and holding rows do have a joint-owner flag (✅ for FBAR accounts) |
| A6 | Separate return: lived apart all year? (Social Security thresholds, IRA phase-out, dependent-care credit) | ❌ | *form*: absent |
| A7 | Separate return: does the spouse itemize? (forces itemizing) | ❌ | *form*: absent |
| A8 | Marriage / divorce / death dates, spouse died this year, surviving-spouse years | 🟡 | *form*: surviving-spouse status offered; no dates |
| A9 | §6013(g)/(h) election for a non-resident spouse | ✅ | *form*: asked; see G4 for the missing spouse income |
| A10 | Link to the spouse's own India profile | ❌ | *form*: linked profiles exist only for corporations (`linked_client_id`) |
| A11 | Spouse SSN valid for work (senior deduction; tips/overtime need both spouses' SSNs on a joint return) | 🟡 | *source* IRC §151(d)(5)(C)(iv), §224(e), §225(d); *form*: taxpayer's ID type only |

## B. US parameters that depend on filing status

PolicyEngine lists 47 such parameters; the engine keys 19 constants on filing
status. 2026 values were compared where both exist.

| # | Rule | Status | Evidence |
|---|---|---|---|
| B1 | Tax brackets | ✅ | *source* Rev. Proc. 2025-32 §3.01 Tables 1–4 — all four 2026 schedules match `TAX.US.BRACKETS` |
| B2 | Standard deduction | ✅ | *source* Rev. Proc. 2025-32 §3.14: $32,200 joint / $24,150 HOH / $16,100 single and separate — match |
| B3 | Capital-gains 0/15/20% thresholds | ✅ | *source* Rev. Proc. 2025-32 §3.03: 0% to $98,900 joint / $49,450 separate / $66,200 HOH / $49,450 single; 15% to $613,700 / $306,850 / $579,600 / $545,500 — match `LTCG_BRACKETS` |
| B4 | SALT cap and phase-out ($40,400 / $20,200 separate) | 🐞 | *source* IRC §164(b)(6)(B), (7): 2026 cap $40,400, reduced by 30% of MAGI over $505,000 (half the threshold for separate filers) but not below $10,000; a separate filer gets **half** of that amount — $20,200, floor $5,000, effective phase-down 15%. *code* `ustax-nodes.js:98` (and copies in `ustax-full-nodes.js`, `findings-batch6-nodes.js`): separate filer $20,200 cut at 30% with a $10,000 floor — too low for MAGI $252,500–$320,500 (by up to $5,100 of cap at $286,500), too high above $320,500 (by $5,000 from $353,834). Joint and single match. Reading of the half rule: [Likely] — confirm with the CPA |
| B5 | NIIT threshold | ✅ | *source* IRC §1411(b): $250,000 joint / $125,000 separate / $200,000 other, not indexed — match |
| B6 | Additional Medicare threshold | ✅ | *source* IRC §3101(b)(2): $250,000 joint / $125,000 separate / $200,000 other, not indexed — match; head of household falls back to single ($200,000), same value |
| B7 | AMT exemption and phase-out | ✅ | *source* Rev. Proc. 2025-32 §3.10: exemption $140,200 / $90,100 / $70,100 separate; phase-out from $1,000,000 / $500,000 / $500,000 at 50% — match |
| B8 | AMT 26%/28% break (half for separate) | ✅ | *source* Rev. Proc. 2025-32 §3.10: 28% above $244,500, $122,250 separate — match `AMT_RATE_BREAK` |
| B9 | Child tax credit phase-out | ✅ | *source* Rev. Proc. 2025-32 §3.05 ($2,200, refundable $1,700); IRC §24(h)(3) phase-out $400,000 joint / $200,000 other — match |
| B10 | QBI threshold and phase-in | ✅ | *source* Rev. Proc. 2025-32 §3.26: separate filers $201,775 (phase-in to $276,775), joint $403,500, other $201,750. Fixed 29 Sep 2026 (IN-54): `QBI_THRESHOLD.mfs` was $201,750 |
| B11 | Saver's credit AGI brackets | ✅ | *source* Notice 2025-67: joint $48,500 / $52,500 / $80,500; HOH $36,375 / $39,375 / $60,375; other $24,250 / $26,250 / $40,250 — match |
| B12 | Senior deduction phase-out | ✅ | *source* IRC §151(d)(5)(C): $6,000 per qualified individual, 6% above $75,000 / $150,000 joint; separate filers need a joint return — match |
| B13 | Tips / overtime caps and phase-outs; $0 for separate filers | ✅ | *code* `ustax-nodes.js:314` |
| B14 | Charitable deduction for non-itemizers ($2,000 joint) | ✅ | *code* |
| B15 | §68 itemized limitation (2/37) | ✅ | *code*; status-aware through the 37% bracket |
| B16 | Form 8938 thresholds (joint, abroad) | ✅ | *source* Treas. Reg. §1.6038D-2(a): $50,000/$75,000; $100,000/$150,000 joint; abroad $200,000/$300,000; $400,000/$600,000 joint — match |
| B17 | Estimated tax: 110% prior-year rule above $150,000 AGI | ✅ | *source* IRC §6654(d)(1)(C)(i): 110% above $150,000 prior-year AGI — correct for joint and single; separate filers see E1 |
| B18 | Social Security taxation thresholds, separate filers | 🟡 | *source* IRC §86(c)(1)(C) and (2)(C): $0 only if married, separate return, and lived with the spouse at any time; otherwise $25,000 / $34,000. *code*: always $0; A6 not asked |
| B19 | Dependent-care FSA exclusion ($7,500; $3,750 separate from 2026) | ✅ | *source* IRC §129(a)(2)(A) (OBBBA): $7,500, $3,750 on a separate return. Fixed 29 Sep 2026 (IN-54): the box 10 exclusion is halved for separate filers (`aggregateusincome-nodes.js` wagesComputation). Profile us_fsa_exclusion_mfs |
| B20 | Child and dependent care credit rate phase-out | ✅ | *source* IRC §21(a)(2) (OBBBA, 2026 on): 50%, down 1 point per $2,000 (or part) of AGI over $15,000 to 35%, then down 1 point per $2,000 ($4,000 joint) over $75,000 ($150,000 joint) to 20%; before 2026, 35% down to 20%. Fixed 29 Sep 2026 (IN-54): `cdccRate` in `ustax-nodes.js` (was a flat 20%). $3,000 / $6,000 expense cap (§21(c)) matches. Profiles us_cdcc_2026_rate_single, us_cdcc_2026_rate_mfj |
| B21 | Education credit phase-out | 🟡 | *source* IRC §25A(d): phase-out joint vs other only — matches; separate filers not blocked (see C3) |
| B22 | Capital loss limit $3,000 / $1,500 separate, with short/long-term carryovers | ✅ | fixed 29 Sep 2026 (IN-52): Schedule D netting incl. the form's carryovers; *probe* US-P3 passes; profiles us_capital_loss_limit, us_capital_loss_carryover_mfs |
| B23 | Student-loan interest: cap and MAGI phase-out | 🐞 | *source* Rev. Proc. 2025-32 §3.29: $2,500 cap phasing out $85,000–$100,000 MAGI ($175,000–$205,000 joint). *probe* US-P5 — cap only, no phase-out |
| B24 | Mortgage acquisition-debt cap ($750,000 / $375,000 separate) | ❌ | *source* IRC §163(h)(3)(F)(i)(II) (made permanent by OBBBA): $750,000 / $375,000 separate. *code*: absent |
| B25 | 65+ / blind additional standard deduction | 🐞 | *source* Rev. Proc. 2025-32 §3.14(3) and IRC §63(f): $1,650 per 65+ or blind person, $2,050 if unmarried. *code*: absent for every filer |
| B26 | Excess business loss limit (§461(l)) | ❌ | *source* Rev. Proc. 2025-32 §3.31: $256,000 / $512,000 joint for 2026 (IRC §461(l)(3)(A)(ii)(II), indexed from 2026). *code*: absent |
| B27 | Car-loan interest deduction (OBBBA) | ❌ | *code* and *form*: absent |
| B28 | Business-loss and misc. limits (`ald/loss/max`, `max_business_losses`) | ❌ | *code*: absent |
| B29 | Elderly/disabled credit, clean-vehicle credits, rebates, unemployment exclusion, personal exemption | ➖ | not relevant to this client base / expired |
| B30 | Filing requirement thresholds | ❌ | *code*: absent (the Monitor assumes a return is filed) |

## C. US rules that deny or change a benefit for separate filers

| # | Rule | Status | Evidence |
|---|---|---|---|
| C1 | Senior deduction not for separate filers | ✅ | *source* IRC §151(d)(5)(C)(v): married → only on a joint return; *code* `ustax-nodes.js:305` |
| C2 | Tips / overtime deductions not for separate filers | ✅ | *source* IRC §224(f) (tips) and §225(e) (overtime): married → joint return required; *code* `ustax-nodes.js:314` |
| C3 | Education credits not for separate filers (§25A(g)(6)) | 🐞 | *source* IRC §25A(g)(6): married → credit only on a joint return. *probe* US-P4 |
| C4 | Student-loan interest not for separate filers (§221(e)(2)) | 🐞 | *source* IRC §221(e)(2): married → deduction only on a joint return. *probe* US-P5 |
| C5 | Child and dependent care credit not for separate filers unless lived apart | ❌ | *source* IRC §21(e)(2)–(4): married → joint return required, unless lived apart the last 6 months and paid over half the home's cost for a qualifying child. *code*: no check |
| C6 | Social Security: separate + lived together → $0 thresholds | 🟡 | *source* IRC §86(c)(1)(C); see B18 |
| C7 | AMT: separate-filer AMTI add-back (§55(d)) | ❌ | *source* IRC §55(d)(2), last sentence: a separate filer's AMTI is increased by the lesser of the excess over the zero-exemption point ($640,200 for 2026, Rev. Proc. 2025-32 §3.10) or the exemption. *code*: absent |
| C8 | Spouse itemizes → separate filer must itemize | ❌ | *source* IRC §63(c)(6)(A): no standard deduction on a separate return if the spouse itemizes. A7 not asked |
| C9 | EITC / tuition deduction / elderly credit | ➖ | *source* IRC §32(d) (EITC joint return required); not modelled; low relevance |

## D. US rules applied per person

| # | Rule | Status | Evidence |
|---|---|---|---|
| D1 | Social Security wage base and self-employment tax per person | 🐞 | *source* IRC §1402(b)(1): self-employment income is reduced by that **individual's** wages; wage base $184,500 per person. *probe* US-P1 |
| D2 | Excess Social Security withholding credit (two employers, one person) | ❌ | *source* IRC §31(b) / §6413(c): excess Social Security withheld by two or more employers of one person is a credit. *code*: absent for every filer |
| D3 | Senior deduction per qualifying spouse | 🐞 | *source* IRC §151(d)(5)(C): $6,000 for each qualified individual (taxpayer and, on a joint return, spouse). *probe* US-P2 |
| D4 | SSN requirement per spouse (senior, tips, overtime) | ❌ | *source* IRC §151(d)(5)(C)(iv) (senior), §224(e) (tips), §225(d) (overtime): each qualifying person's SSN on the return. A11 |
| D5 | §402(g) elective-deferral limit per person | 🐞 | *source* IRC §402(g)(1)(A): limit is per individual; Notice 2025-67: $24,500 for 2026. *probe* US-P6 |
| D6 | IRA contribution limit per person; spousal IRA on joint compensation | 🐞 | *source* IRC §219(b)(1), (c): limit per individual, spousal IRA on the couple's combined compensation; Notice 2025-67: $7,500 (+$1,100 at 50+). *code* `us5-nodes.js` `iraContributionAggregateUsd` pools both spouses against one limit |
| D7 | IRA deduction phase-out by each spouse's workplace-plan coverage | ❌ | *source* IRC §219(g); Notice 2025-67: phase-out from $129,000 joint / $81,000 other for an active participant; $242,000 joint when only the spouse is covered; $0–$10,000 separate. *code*: absent for every filer |
| D8 | Catch-up contributions by each spouse's age | ❌ | *source* IRC §414(v): catch-up by each participant's age — $8,000 at 50+, $11,250 at 60–63 (Notice 2025-67). *code*: taxpayer's age only (`ageAtYearEndUs`) |
| D9 | HSA family limit shared between spouses | 🟡 | *source* IRC §223(b)(5): if either spouse has family coverage, both are treated as having it and share one family limit, split equally unless they agree otherwise. *code*: coverage type read; split not modelled |
| D10 | RMD and 72(t) by the recipient's age | 🟡 | *source* IRC §401(a)(9), §72(t)(2)(A)(i): age of the account owner. *code*: taxpayer's age only |
| D11 | Saver's credit $2,000 contribution cap per person | 🟡 | *source* IRC §25B(a): $2,000 cap per eligible individual — up to $4,000 on a joint return. *code* `ustax-nodes.js:469`: applied once per return |
| D12 | Dependent-care credit limited to the lower-earning spouse's earned income | ❌ | *source* IRC §21(d)(1)(B): married → expenses capped at the lesser of the two spouses' earned income. *code*: absent |
| D13 | Foreign earned income exclusion per spouse (cap and qualifying test) | 🟡 | *source* IRC §911(b)(2)(D) and Treas. Reg. §1.911-5: $132,900 per qualifying individual (Rev. Proc. 2025-32 §3.39), each spouse qualifying separately. *code*: one cap on combined foreign wages (`findings-batch6-nodes.js:93`) |
| D14 | Additional Medicare: joint threshold, employer withholds per person | ✅ | *source* IRC §3101(b)(2) (joint threshold) and §3102(f) (employer withholds above $200,000 per employee); *code* |
| D15 | Social Security benefits: combined for taxability | ✅ | *source* IRC §86(b)–(c): provisional income on the joint return; *code* |
| D16 | QBI per business | ✅ | *source* IRC §199A(b)(1)–(2): computed per trade or business; *code* |

## E. Other US joint-return mechanics

| # | Rule | Status | Evidence |
|---|---|---|---|
| E1 | Estimated tax: 110% threshold is $75,000 AGI for separate filers | 🐞 | *source* IRC §6654(d)(1)(C)(ii): $75,000 for separate filers. *code* `us1-nodes.js:65` uses $150,000 for all |
| E2 | Joint return with a non-resident spouse requires the §6013(g)/(h) election | ❌ | *source* IRC §6013(a)(1) (no joint return if either spouse is a non-resident alien) and §6013(g)/(h) (election). *code*: no eligibility check (form hides MFJ for an NRA client, not for a resident client with an NRA spouse) |
| E3 | Community-property states (CA, TX, WA …): separate filers split community income | 🟡 | *source* IRC §66, §879; Pub. 555. *form* warns; *code* ignores |
| E4 | State returns when one spouse is a non-resident of the state | ❌ | *code*: absent |
| E5 | State joint/separate/HOH tables (CA, NY, NJ) | ✅ | *code* (IN-45 follow-up) |
| E6 | Surviving spouse: 2-year status, joint return in year of death | 🟡 | *source* IRC §2(a) (surviving spouse, 2 years with a dependent child) and §6013(a)(2)–(3) (joint return in the year of death). A8 |
| E7 | Joint-and-several liability / innocent spouse (Form 8857) | ❌ | *source* IRC §6013(d)(3) (joint and several liability) and §6015 (relief, Form 8857); information only |

## F. India (no joint assessment)

India assesses each person separately, so the India form rightly stays
individual. The items are about one spouse's income being attributed to the
other. Rows F2–F5, F12–F15 and G2 are checked against the Income-tax Act 2025
(ss.10, 92, 99, 159) and Income-tax Rules rule 76, as amended by the Finance
Act 2026 — text supplied by the client, kept in
docs/sources/INDIA_ACT_2025_EXTRACTS.md. Other India rows: CA to confirm.

| # | Rule | Status | Evidence |
|---|---|---|---|
| F1 | Individual assessment; no joint return | ✅ | *form* |
| F2 | s.99(1)(a)(ii) (old s.64(1)(iv)): income from assets transferred to the spouse without adequate consideration (or other than under an agreement to live apart) is the transferor's; if the spouse puts the asset into a business or firm, only the proportion A = B × C / D is clubbed (s.99(2)) | 🟡 | *act*; *form*: one manual amount (`other_sources.spousal_clubbing_s64_inr`), read by the engine; no asset-transfer tracking, no s.99(2) proportion |
| F3 | s.99(1)(a)(i) (old s.64(1)(ii)): spouse's pay from a concern where the individual has a substantial interest (20%+ voting power or profits, s.99(5)(a)(iii)), unless due to the spouse's own professional qualification — taxed to **whichever spouse has the higher income before inclusion** (s.99(5)(a)(i)) | 🟡 | *act*; same manual amount; not asked separately, and the engine can't tell which spouse has the higher income without the household link |
| F4 | s.99(1)(c) (old s.64(1A)): minor child's income taxed to the parent with the higher income (or the parent who maintains the child if the marriage has ended), except income from the child's own work or skill, or a child with a disability (s.154); ₹1,500 per child exemption | 🟡 | *act* confirms the rule; the ₹1,500 exemption is not in the supplied extract — CA to confirm its 2025 Act location. *form*: exemption field only; the child's income and "which parent" not asked |
| F5 | Gifts over ₹50,000 taxable (s.92(2)(m)), but not from a relative — spouse, siblings, lineal ascendants/descendants and their spouses (s.92(3)(a), s.92(5)(g)) — or on marriage (s.92(3)(b)) | ✅ | *act*; *form* toggle, read by the engine |
| F6 | Co-owned property: income and loan interest by ownership share | ✅ | *form* `co_owner_share_percent` |
| F7 | 80C / 80D / 80E paid for the spouse | ✅ | *form* (80E text covers the spouse's loan; 80D self+spouse bucket) — confirm 80C spouse premiums |
| F8 | Joint bank / FD accounts: interest taxed to the person whose money it is | ❌ | *form*: no contributor split |
| F9 | Each spouse's residential status and advance tax independently | 🟡 | *form*: one profile per person, no link (A10) |
| F10 | Schedule FA for jointly held foreign assets (both spouses report) | 🟡 | *form*: holdings have a joint flag; the other spouse's return isn't linked |
| F11 | HRA when rent is paid to the spouse | ❌ | *form*: not asked — CA to confirm the position |
| F12 | Gifts on marriage | ✅ | *act* s.92(3)(b); covered by the F5 toggle |
| F13 | Goa, Dadra & Nagar Haveli, Daman & Diu: spouses under the Portuguese Civil Code community of property split every head except salary 50/50; salary stays with the earner (s.10). ITR asks for the spouse's PAN (ITR-2 validation rule 449) | ❌ | *act*; *form* and *code*: not asked or modelled |
| F14 | Other clubbing: income to a son's wife from assets the individual transferred (s.99(1)(b)); income via a person or AOP for the spouse's or son's wife's benefit (s.99(1)(d)); individual property converted into HUF property (s.99(3)–(4)) | ❌ | *act*; not asked |
| F15 | Clubbed "income" includes a loss (s.99(5)(d)) | 🟡 | *act*; the manual amount accepts only a positive figure — CA to confirm whether losses need a field |

## G. Cross-border

| # | Rule | Status | Evidence |
|---|---|---|---|
| G1 | The client's Indian return carries only the client's US income | ✅ | Fixed for linked spouses (29 Sep 2026, IN-57): the household calculation runs each spouse's Indian return from their own profile only; *probe* XB-P2 (client ₹8,34,600, was ₹54,26,850 pooled). *probe* XB-P1 still fails for a single profile holding both spouses' income — until it is split into two linked profiles (build step 5) the joint_return_spouse_income_india alert stays on; a linked profile gets joint_return_household_linked instead |
| G2 | India's foreign tax credit uses the US tax **paid by the client on the client's own income**: credit is computed per source of income, as the lower of the Indian tax on that income and the foreign tax paid on it (rule 76(1), (7)(a)), so the joint US tax must be attributed to each spouse's income | ✅ | Household (IN-57): the joint regular US income tax is split by method A (each spouse's share of the two separate-return taxes; CA to confirm), and each spouse's relief is min(share × their US-source fraction, Indian tax on that income). *probe* XB-P2. Earlier evidence: *act* rule 76; *probe* XB-P1 — relief rises from $1,780 to $26,340 with the spouse's wages. Rule 76 attributes tax to income, which supports split method A (docs/HOUSEHOLD_DESIGN.md) over an income-share split — CA to confirm |
| G3 | US FTC (Form 1116) on a joint return includes both spouses' Indian income and Indian tax | 🟡 | Household (IN-57): the joint Form 1116 takes both spouses' Indian tax against the limit of the merged joint return. The merged return adds the two spouses' Indian data together, so the limit's Indian-income side is right but any India-computed figure on the merged run is not a real return — confirm with the CPA |
| G4 | A US-person spouse's, or a §6013(g)/(h)-electing spouse's, worldwide (Indian) income on the joint US return | ❌ | *form*: not asked — US tax understated by that income |
| G5 | Electing spouse's Indian assets: FBAR, Form 8938, PFIC (Indian mutual funds, Form 8621), PPF/EPF (3520 questions), 5471 | ❌ | not collected |
| G6 | FBAR per person (each spouse; Form 114a for joint-only accounts) | 🟡 | joint-owner flag on accounts; spouse's own accounts absent |
| G7 | Treaty residence and tie-break per spouse (spouses can differ) | ❌ | one person modelled |
| G8 | Saving clause per spouse (a citizen spouse and a non-resident spouse on one return) | 🟡 | client only (US-P7 passes for the client) |
| G9 | Art. 20(2) Social Security per recipient spouse | 🟡 | only what is on the client's form |
| G10 | Transfers to a non-resident-alien spouse are taxable (§1041(d)) | ❌ | not asked |
| G11 | Gifts to a non-citizen spouse: limited annual exclusion, Form 709 (§2523(i)); exempt in India as a relative's gift | ❌ | not asked |
| G12 | Clubbing mismatch: India taxes the transferor on income the US taxes to the owner-spouse — credit falls in the wrong return | ❌ | not modelled |
| G13 | Community property with a non-resident spouse (§879) | ❌ | not modelled |
| G14 | Treaty text: no spouse-specific rule except Art. 26 (no duty to give non-residents family allowances) | ✅ | Technical Explanation, Art. 26 |
| G15 | No India-US totalization agreement — per person | ✅ | *code* `no_totalization_agreement` |

## Recommended order (after review)

1. **G1–G2** — stop the spouse's US income and US tax entering the client's Indian computation. Needs the "whose item" tag (A5); until then, an alert on every joint return with an India-resident client.
2. **Spouse section (A1–A4, A6–A8, A11) and "whose item" tags (A5)** — the data every other fix needs.
3. **Per-person US rules (D1–D13)** and the filing-status fixes (B18–B28, C3–C8, E1, E2).
4. **B22, B25, D2, D7** — wrong for single filers too; can ship before the spouse work.
5. **Spouse household link (A10) → G3–G9**, then G10–G13.

## Questions for the reviewers

- CPA: 2026 child and dependent care credit rate schedule (B20); QBI separate-filer threshold (B10); whether an H-4 / non-resident spouse without an SSN blocks tips/overtime on a joint return (A11); §6013(g) election and treaty benefits for the electing spouse (G4).
- CA: 2025 Act numbering for F2–F5; attribution of joint FD interest (F8); HRA on rent paid to a spouse (F11); whether Form 44 relief must be computed on each spouse's share of a joint foreign return, and how that share is proven (G2).
- Both: G12 — where the credit belongs when India clubs income to the transferor and the US taxes the owner-spouse.

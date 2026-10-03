# Cross-Border Moves — Returning NRIs (US → India) and Arrivals (India → US)

**2 October 2026.** A plan, not a shipped feature. Rebased onto branch
`claude/upbeat-pascal-vziufp` the same day. That branch already ships US
retirement distributions (one row per 1099-R, with a date paid), §72(t),
and DTAA Art. 20, 21(1) and 22, so those rows below now say what to
**reuse** instead of what to build. It answers one question:
*can a cross-border tax firm run a returning NRI, or a family moving from India
to the US, through this product and trust the numbers?* Today the answer is
**not yet**. The engine knows each person's residency **status** but gets the
**move-year money** wrong, and it has none of the account-level rules that move
cases depend on.

Companion to `docs/GAP_TRACKER.md`. This plan absorbs **XB-20** (foreign
retirement accounts, s.158 / Form 40), **XB-25** (dual-status year), **XB-26**
(Roth), **XB-27** (NRE/NRO), and **US-31** (election comparators). It
supersedes their "how" sections. Their tracker rows stay the source of truth
for status.

**Confidence tags used on every rule below**

| Tag | Meaning |
|---|---|
| **Certain** | Settled law, routinely applied. Still needs a citation in the fixture. |
| **Likely** | Strong reading, widely applied by practitioners, but has edge cases or depends on facts. |
| **Verify** | Must be checked against the statute or treaty text, or the ITA 2025 renumbering, before any code is written. Listed again in §12. |

Section numbers for Indian law are given in **ITA 1961 numbering** (s.6,
s.10(4)(ii), s.89A, s.115H) because that is how the engine's existing findings
cite them, except where the repo already uses ITA 2025 numbers (s.158 /
Form 40, s.159 / Form 41, Form 44, Rule 76). Phase 0 maps every one to ITA 2025.

---

## 0. Summary

1. **Most of the facts are already collected.** Both forms already capture
   move dates, elections, account types and equity-award workdays (see §1).
   The engine just doesn't read most of them.
2. **The biggest error needs no new fields to fix.** The dual-status
   computation (`usDualStatusResult`) pro-rates *every* income line by the
   share of days the person was a resident. Attributing income by **direction
   and source** (Indian salary after a return → nonresident period, so not US
   income; US wages before departure → resident period) fixes most of the
   dollars from existing data.
3. **Nothing existing changes.** Every new node hangs off one derived
   `moveContext` node. That node is `null` for every current profile, fixture,
   fuzz case and the example household. That claim is checked by the existing
   gates (§2).
4. **Intake changes are small and optional.**
   - **Router (Layer 0):** no changes.
   - **US form:** one collapsed block of 7 optional fields, shown only in a
     move year, plus an optional `retirement_balances[]` list (§8.5).
   - **India form:** 2 optional fields per bank account, 1 new account type,
     an optional 10-row residency-history table, and one 3-field
     retirement-relief block.
   - **Both forms:** an optional `loans[]` list (balance, currency, lender
     country). **US form:** optional acquisition date and cost per holding.
5. **Law first, code second.** Phase 0 builds 8 hand-worked personas, 4 per
   direction, and has a CA and a CPA review them before any engine change.
6. **A client has no tax-year dimension today, and that blocks everything
   else.** Each client is one router + India + US record, with the year as a
   field inside it. A specialist whose existing client moves would have to
   overwrite last year's data. Phase 0.5 (§7) adds per-year client records,
   a "Record a move" action and roll-forward before any move logic ships.
7. **Moves in January to March span two Indian tax years.** The engine models
   one. §3.1 now covers both years: from the client's prior-year record when
   it exists, otherwise from two optional India-form inputs.
8. **A move changes the client's whole balance sheet, not just one year's
   income.** §8 adds a *move balance sheet*: every asset and every loan, how
   each country treats it before and after the move, and what to do about
   it. **Loans are the biggest gap.** The forms collect interest paid, not
   balances, currency or lender country.
9. **Every move finding tells the specialist what to do and how.** §6.8 sets
   a standard: steps with who and when, forms, a real deadline, the cost of
   not acting, and when it doesn't apply. Today 3 of the product's 174
   findings have step-by-step guidance.
10. **Decisions, not just consequences.** For each asset the client has to
    decide what to do and *when*. §8.4–§8.8 add decision windows,
    guides for every retirement, health and education account type on
    both sides, how to leave a US state, and keep/sell/move guides for the
    house, car, bank accounts, stocks, options, S-corp, gifts and
    insurance. Logistics (customs, shipping, immigration) are stated out of
    scope.
11. **"Every case" is defined, tested and bounded.** About 35 distinct cases
    are hand-worked in Phase 0 (§10). Anything outside them raises a
    `move_not_covered` finding instead of being skipped (§6.9).

---

## 1. What already exists (reuse inventory)

Verified against the current branch. "Read" means some engine node consumes
the field today.

### Router (Layer 0) — `wising_router_state`

| Field | Read? | Use in this plan |
|---|---|---|
| `jurisdiction`, `base_tax_year` | yes | `base_tax_year` = US calendar year N and India FY N–(N+1). Unchanged. |
| `is_us_citizen`, `has_green_card`, `us_days` | yes | Sub-case routing (citizen / green card / visa holder). No change. |

### US form (Layer 1) — `us_residency_detail` and related

| Field | Read? | Use in this plan |
|---|---|---|
| `final_us_residency_status` = `DUAL_STATUS` | yes | Primary move-year trigger. |
| `residency_start_date`, `residency_end_date` | yes (day-count only) | Move date for each direction. |
| `dual_status_arrival_date` / departure (`#res-dual-arrival`, `#res-dual-departure`) | via status | Cross-check against start/end. |
| `first_year_choice_election`, `first_year_choice_entry_date` | via status | Arrival election comparator (B). |
| `s6013g_joint_election`, `nra_specific.s6013h_joint_election` | partly | Arrival election comparator (B). |
| `closer_connection_claim` | **no** | Departure residency end date (A); Form 8840 (B). |
| `exempt_individual_status`, `exempt_*` | partly | Students and scholars (persona B3). |
| `green_card_grant_date`, `i407_surrendered_date`, `green_card_years_held`, `expatriation_*`, `form_8854_5yr_compliance_certified` | yes (§877A) | Green-card returnee (A2). |
| `state_residency.moved_states_this_year`, `move_date`, `ca_planning_departure`, `ca_retains_property_or_voter_reg` | partly | State exit and entry disclosures. |
| `equity_compensation.rsu_vestings[]` with `grant_date`, `vest_date`, `workdays_in_us`, `workdays_outside_us` | partly | Workday sourcing of vests that straddle the move. |
| `retirement_accounts.*` contributions, `hsa_msa_distributions_usd`, `indian_epf/ppf/nps_balance_usd` | partly | Retirement treatment on both sides. |
| `income_us_source.retirement_distributions[]` with `plan_type`, `taxable_usd`, `payment_type` (periodic / lump sum), `early_exception`, SEPP fields, **`date_paid`**, `federal_withheld_usd` (`retirement-dist.js` / `retirement_dist.py`) | yes | **Dated** — each withdrawal falls on one side of the move date. The treaty and §72(t) rules for a 1040-NR filer already exist. |
| `us_residency_detail.article_22_claim`, `article_22_arrival_date`, `article_22_exempt_wages_usd`; Art. 21(1) student fields (`treaty-art22.js`, `treaty-art21.js`) | yes | Arriving teachers, researchers and students (B3). |
| `bank_accounts[].account_type` (`nre_savings`, `nro_savings`, `fcnr_deposit`), `opened_during_year`, `closed_during_year` | partly | NRE/NRO tagging, FBAR/8938 timing. |
| `financial_holdings[]` (`country`, `peak_balance_usd`) | yes | US-situs assets for the estate-tax flag (A). |
| `real_estate.properties[]` (dates, basis, §121) | yes | US home or rental kept or sold (A); Indian home (B). |
| `nra_specific.*` (ECI/FDAP, `treaty_rate_claims`, FIRPTA) | yes | Nonresident-period income after departure (A). |

### India form (Layer 1) — `residency_detail` and related

| Field | Read? | Use in this plan |
|---|---|---|
| `trips[]` with `arrival_date` / `departure_date` | **no** (only the day total) | Move date (return or departure) when the US side is blank. |
| `days_in_india_current_year`, `days_in_india_preceding_4_years_gte_365`, `nr_years_last_10_gte_9`, `days_in_india_last_7_years_lte_729`, `employment_or_crew_status`, `came_on_visit_to_india_pio_citizen`, `india_source_income_above_15l` | yes | Status for the move FY (ROR / RNOR / NR). |
| `is_departure_year` | **no** | Departure-FY 182-day rule (B). |
| `india_work_days_current_year` | yes | Art. 16 workday split. |
| `bank_accounts[].account_type` (`nre`, `nro`, …) | **no** for tax | NRE interest exemption and US taxability (XB-27). |
| `quarters.Q1..Q4` income | yes (FY↔CY split) | Splits Indian income at the move date at quarter granularity. |
| `financial_holdings.transactions[]` with `acquisition_date`, `sale_date`, `is_specified_foreign_exchange_asset`, `nri_exit_type` | partly | Pre-arrival sale planning (B), the s.115H option (A), US basis. |
| `foreign_assets`, `foreign_income` | partly | Schedule FA in the first ROR year (A). |

**Result:** the move date, the direction, the election facts, account types
and equity-award workdays are all already collected. Missing are income
amounts split at the move date (US form), interest per bank account,
retirement-account balances, the s.158 election, and a residency history.

---

## 2. Ground rules — how to add this without breaking anything

1. **One gate.** A new node, `moveContext`, returns `null` unless at least one
   move signal is present (§6.1). Every new node returns early on `null`.
   Every existing output key keeps its current value for every current
   profile.
2. **Additive outputs only.**
   - `analyze()` gains a `moveYear` key.
   - New findings use ids prefixed `move_`.
   - New document and calendar rows carry `trigger: "move"`.
   - No existing finding id, document id or output field is renamed.
3. **One exception, made on purpose.** `usDualStatusResult` changes for
   `DUAL_STATUS` profiles (§6.2). There are **no** `DUAL_STATUS` fixtures and
   the fuzzer never generates that status, so no golden or fuzz baseline
   moves. The change is recorded as a DAG-only divergence, the way XB-25 was.
4. **Both engines, same commit.** Every node is written in the JS DAG
   (`prototypes/graph-pilot/move-nodes.js`) and the Python DAG
   (`dag_py/src/wising_dag/crossborder/move.py`). Parity is shown by
   `npm run compare:js-vs-py-dag` and `monitor-next/test-map-parity.mjs`.
5. **The frozen engine stays frozen.** Everything here is DAG-only. New
   numeric literals (thresholds, dates) go on the `KNOWN_DAG_ONLY` allowlist
   in `scripts/audit/dag-coverage.js`, in the same commit that adds them.
6. **Intake rules.**
   - Every new field is optional, defaults to `null`, and lives in a
     collapsed block shown only when the form's own state already implies a
     move.
   - Hydration of old saved state is unaffected; `check:form-roundtrip`
     proves it.
   - No existing field is renamed, moved or re-typed.
7. **The gates that must stay green on every commit:**
   - `npm test`
   - `npm run audit:dag`
   - `npm run fuzz:dag -- --n=3000`
   - `npm run test:dag-py`
   - `npm run compare:js-vs-py-dag`
   - `npm run check:form-roundtrip`
   - `npm run check:section-profiles`
   - `npm run check:example-household`
   - `npm run audit:form-engine`
   - The `monitor-next` build, `test-adapter.mjs` and `test-map-parity.mjs`.

---

## 3. How the two systems meet in a move year

### 3.1 Two tax years over one move

US tax year = calendar year. India tax year = 1 April – 31 March. A move in
**August 2026** touches **one US year** and **two India FYs**:

```
            Jan 2026        Apr 2026          Aug 2026                 Dec 2026        Mar 2027
US TY2026   |========== resident ===========|xx nonresident xxxxxxxxxxx|        (US → India, departs mid-Aug)
India       |FY 2025-26 (NR)|================ FY 2026-27: one status for the whole FY ================|
                            |<-- overlap: resident in both -->|
```

- **India has no split year** (Certain). The FY status (ROR / RNOR / NR)
  applies to all 12 months.
- **The US splits the year at the residency start or end date** (Certain).
  The overlap window is where the treaty tie-breaker (Art. 4) and relief
  (Art. 25) do their work.
- **Engine today:** one base year, India FY N–(N+1) against US CY N.
  January–March of US year N belongs to India FY (N−1)–N, which the engine
  never models.
- **Why that matters:** for a move between 1 January and 31 March (e.g. a
  return in February 2026), the India status changes in FY 2025–26. That is
  exactly the year the engine doesn't look at. A warning alone would leave
  roughly a quarter of all moves without a number.
- **Fix (Phase 2).** When the move date falls in January–March, the engine
  also reads the previous FY's status and its January–March income:
  1. **From the client's previous-year record** (§7) when it exists. This is
     the normal case for an existing client and needs no new input.
  2. **Otherwise from two optional India-form inputs**, shown only in this
     case:
     - `residency_detail.previous_fy_status` (ROR / RNOR / NR, one dropdown);
     - `previous_fy_q4`, the January–March income of the previous FY. It
       uses the same structure as the existing `quarters.Q4`, so it adds no
       new screen design.
- The overlap and treaty logic (§3.3) and the US move-year split (§6.2) then
  use the correct India status for January–March. FY↔CY apportionment uses
  the real previous-FY Q4 instead of the 75/25 assumption for that part.

### 3.2 Residency rules on each side

**US — residency start date**
- Substantial presence test: the first day present in the US, ignoring up to
  10 days of earlier presence where the person had a closer connection to
  India. (Certain)
- Green card: the first day present as a permanent resident. (Certain)
- First-year choice (§7701(b)(4)): applies when the SPT isn't met in the
  arrival year but is met the next year. It needs 31 consecutive days of
  presence plus presence on 75% of the days from then to year-end. The
  return waits until the next year's SPT is met (Form 4868). (Certain)

**US — residency end date**
- The last day present, if for the rest of the year the person has a tax
  home in India and a closer connection to India, and is not a resident the
  next year. (Certain)
- The person must attach a statement to the return. If they can't make that
  showing, they are resident to 31 December. (Likely — confirm the statement
  requirement in Reg. 301.7701(b)-4)
- Green card: residency ends on surrender (I-407) or on a finding of
  abandonment. (Certain)

**US citizens** never stop being residents for US tax. Moves change FEIE and
foreign-tax-credit planning, not scope. (Certain)

**India**
- **Resident** if in India 182 days or more in the FY, or 60 days plus 365
  days over the previous 4 FYs.
- The 60-day limb becomes 182 days for an Indian citizen *leaving India for
  employment abroad* (Explanation 1(a)), and for a citizen or person of
  Indian origin *on a visit*. For a visitor with Indian income over ₹15L it
  becomes 120 days. (Certain)
- **RNOR** if non-resident in 9 of the previous 10 FYs, or in India 729 days
  or fewer over the previous 7 FYs. Also RNOR: deemed residents under
  s.6(1A), and visitors who qualify under the 120-day rule. (Certain)
- **Someone returning for good is not "on a visit"**, so the plain 60-day
  limb applies. (Likely — practitioner consensus; confirm against the
  engine's `came_on_visit_to_india_pio_citizen` handling)

### 3.3 Treaty mechanics used throughout (India–US DTAA, 1989)

| Article | Role in a move | Confidence |
|---|---|---|
| Art. 1(3) saving clause | The US taxes its citizens and residents as if the treaty didn't exist, except for the articles listed (including 19, 21, 22, 25). Green-card holders are US residents for this purpose. | Certain |
| Art. 4 residence tie-breaker | Applied to the **overlap window**, not the whole year: permanent home, then centre of vital interests, then habitual abode, then nationality. | Likely (period-wise application is practice, not text — Verify) |
| Art. 6 immovable property | Rent from a home kept in the other country. The country where the property sits may tax; the residence country credits. | Certain |
| Art. 10 / 11 dividends, interest | Source country rate caps. Dividends: 15% (10%+ holding) / 25% other. Interest: 10% (bank or financial institution) / 15% other. | Likely (Verify rates) |
| Art. 13 capital gains | Each country taxes under its **own domestic law**. No treaty exemption, so relief comes only through Art. 25 credit. | Certain |
| Art. 16 employment | Pay is taxed where the work is done. The 183-day / foreign-employer / no-recharge exemption rarely helps in a move year. | Certain |
| Art. 20 private pensions | Pensions and annuities are taxable only in the country of residence. **Engine (already built):** for an India-resident 1040-NR filer, periodic payments, including SEPP payments while the schedule holds, are exempt under Art. 20(1); lump sums are taxed as FDAP at 30% plus §72(t); a broken SEPP is treated as a lump sum. | Built, with the CPA's reading |
| Art. 21 students and apprentices | Art. 21(2): standard deduction on Form 1040-NR. Art. 21(1): payments from outside the US for maintenance and study are exempt; Art. 1(4)(b) keeps this for a resident alien but not for a citizen or green-card holder. **Art. 21(1) already built** (`treaty_article_21_student`). | Certain |
| Art. 22 professors and researchers | Teaching and research pay is exempt for two years from arrival when the person was resident in India just before. Art. 1(4)(b) keeps it for a resident alien, not for a citizen or green-card holder. **Already built** (`treaty_article_22_teacher`); its window starts at `article_22_arrival_date`, which should match the move date. | Built |
| Art. 23 other income | Catch-all. The source country may also tax. | Likely |
| Art. 25 relief | India: credit for US tax on US-source income (s.90 / s.159, Form 44). US: Form 1116, with Art. 25(3) re-sourcing so India-taxed income counts as foreign-source for a US resident. | Likely (Verify Art. 25(3) scope for capital gains) |

### 3.4 The attribution principle the engine must adopt

**Today:** in a dual-status year, each item is taxed under the rules for the
period it was *received or accrued*, but the engine allocates by day-count.

**Change:** attribute each item by **period + source**, using this order of
evidence:

1. A dated record already on file:
   - RSU `vest_date`
   - retirement withdrawal `date_paid`
   - India transaction `sale_date`
   - US property `sale_date`
   - India quarter (Q1–Q4)
2. An override amount entered in the new "move-year split" block (§4.8, §5.8).
3. A **direction-aware default** keyed on source (tables in §4.3 and §5.3).
4. Last resort, for passive US income only: day-count, with a disclosure
   finding (today's behaviour).

---

## 4. Scenario A — US → India (returning NRI)

### 4.1 Personas (become Phase 0 fixtures)

| Id | Who | Why it's distinct |
|---|---|---|
| **A1** | H-1B holder, 9 years in the US, returns mid-Aug 2026. Unvested RSUs, a 401(k) and Roth IRA, keeps a US rental condo, NRE/NRO accounts. | The core case. RNOR-eligible. RSUs vest after departure. |
| **A2** | Green-card holder for 10 years (a long-term resident under §7701(b)(6)), returns and files I-407. | §877A covered-expatriate tests. Form 8854. A treaty-resident claim can itself count as expatriation. |
| **A3** | US citizen of Indian origin (OCI) relocating permanently to India. | US scope never changes. FEIE vs foreign tax credit. Can still be RNOR in India. |
| **A4** | Indian citizen back after only 3 years in the US. | **No RNOR**, so ROR at once. Overlap window = real double tax, so Art. 4 and Art. 25 matter. |

### 4.2 Timeline for A1

| Period | US status | India status | What matters |
|---|---|---|---|
| Pre-move (TY2025 / FY 2025-26) | Resident | NR | Planning: Roth conversions while still a US resident; harvest losses; decide on the condo; check RNOR eligibility. |
| Move year: US TY2026, India FY 2026-27 | **Dual-status:** resident to 15 Aug, nonresident after | RNOR (returned Aug; non-resident 9 of 10 prior FYs) | Residency end date, closer connection, dual-status return, RSU sourcing, NRE redesignation, 1040-C. |
| RNOR years (FY 2027-28, maybe FY 2028-29) | Nonresident (Form 1040-NR only if there's US-source income such as rent, RSUs or distributions) | RNOR | **Window where neither country taxes certain income**, e.g. US stock gains realised now. Plan 401(k) withdrawals. |
| ROR (from about FY 2028-29) | Nonresident | ROR | Schedule FA. Indian tax on 401(k)/Roth growth unless s.158 is elected. Worldwide income. |

### 4.3 US-side rules

| # | Item | Rule | Conf. | Engine today | Plan |
|---|---|---|---|---|---|
| A-US-1 | Residency end date | Last day present if tax home and closer connection are in India for the rest of the year and not a US resident next year; otherwise 31 Dec. Needs a statement with the return. | Likely | Uses `residency_end_date` as given; `closer_connection_claim` unread | Read `closer_connection_claim`. Finding `move_us_end_date_unsupported` when the end date < 31 Dec but no closer-connection claim is made. |
| A-US-2 | Return form | Nonresident at year end → **1040-NR is the return, 1040 is the attached statement.** | Certain | Finding says "1040 + 1040-NR, or vice versa" | Name the right form from the direction. |
| A-US-3 | Filing status / deduction | No standard deduction. MFJ only with a §6013(g)/(h) election, generally not open to a couple who are both departing. | Certain | Itemised forced; MFJ not gated | Gate MFJ on direction and spouse facts. Finding `move_us_mfj_not_available`. |
| A-US-4 | **Income attribution defaults** | US W-2 wages → resident. Indian salary after return → **nonresident, not US-taxable.** Final paycheck, PTO payout or severance after departure → nonresident, US-source, effectively connected. RSU vest after departure → nonresident, US-source share = US workdays ÷ total workdays from grant to vest. | Certain (sourcing) / Likely (severance) | **Everything × day fraction** — Indian post-return salary partly taxed by the US | §6.2 attribution node. Uses `vest_date` and the workday fields. Uses India Q1–Q4 for Indian income. |
| A-US-5 | Nonresident-period passive income | US bank interest and portfolio interest: exempt. Dividends: 30%, or the treaty rate (Art. 10) with a W-8BEN. Stock gains: not taxed unless 183+ days present (§871(a)(2)). | Likely | Disclosed, not computed | Compute when a dated split exists. Keep the disclosure otherwise. |
| A-US-6 | US rental kept | Nonresident: 30% of gross rent unless the §871(d) net-basis election is made → 1040-NR. Sale: FIRPTA withholding (15%), §121 if lived in 2 of the last 5 years, depreciation recapture. | Certain | FIRPTA fields read; §871(d) not modelled | Finding `move_us_rental_871d`. FIRPTA reminder on planned sale. |
| A-US-7 | Departure clearance | Departing aliens must get a certificate (Form 1040-C, or Form 2063 if no taxable income) before leaving. Exceptions exist; rarely enforced. | Certain (requirement) / Likely (enforcement) | **Nothing** | Calendar item "before departure" plus document row. Severity info. |
| A-US-8 | Green-card exit | Residency lasts until I-407. Long-term resident (8 of 15 years) → §877A tests and Form 8854. Claiming India residence under the treaty as a long-term resident is itself expatriation (§7701(b)(6)). | Certain | §877A computed; treaty-claim trap missing | Finding `move_us_ltr_treaty_claim_expatriates` when GC + long-term resident + `dtaa_treaty_residence = india`. |
| A-US-9 | US citizen (A3) | Worldwide scope continues (saving clause). FEIE needs a tax home in India plus bona fide residence or 330 days in 12 months — often not met by the move-year due date (Form 2350 extension). Foreign tax credit usually beats FEIE at Indian rates. | Certain | FEIE and foreign tax credit exist | Finding `move_us_citizen_feie_window` with the date the 330-day test would be met. |
| A-US-10 | 401(k) / IRA after departure | Built for a **full-year** 1040-NR filer resident in India: periodic exempt (Art. 20(1)); lump sum taxed as FDAP at 30% plus §72(t); broken SEPP treated as a lump sum. | Built (CPA-reviewed) | **Move year not covered:** the treaty rule (`treatyPeriodicExempt`) is gated on `files_form_1040nr`, and the dual-status nonresident period drops all retirement income | Phase 2: split rows by `date_paid` against the residency end date. Rows before → resident period (Form 1040, §72(t)). Rows after → the existing 1040-NR treaty rule, reused. No new field. |
| A-US-11 | HSA / 529 | India gives neither any tax status. US penalties on non-qualified withdrawals continue. | Likely / Verify | Contributions only | Disclosure in the retirement finding. |
| A-US-12 | **US estate tax** | A nonresident non-citizen holding US-situs assets (US shares, US real estate) above **$60,000** is exposed to US estate tax. There is no India–US estate treaty. | Certain | **Nothing** | Finding `move_us_nra_estate_tax_exposure` from `financial_holdings` / `real_estate` where country = US. Disclosure only. |
| A-US-13 | FBAR / 8938 / PFIC after departure | Not required once a nonresident alien (citizens and green-card holders continue). The departure year covers the resident period. | Likely (Verify the FBAR rule for a part-year) | Full-year gates | Scope the gauges to the resident period. Note the "final year" in Documents. |
| A-US-14 | Remote work for a US employer from India | Pay for work done in India by a nonresident is foreign-source: no US income tax and no FICA. India taxes it. Employer withholding and permanent-establishment risk. | Likely | Art. 16 workday logic exists | Finding `move_remote_us_employer_from_india` — ask the employer to stop US withholding; advance tax in India. |
| A-US-15 | State exit | CA and others: domicile rules; the state's share of RSUs still taxable after leaving. | Likely | `ca_planning_departure` alert exists | Reuse. Add RSU state-sourcing note when vests follow departure. |

### 4.4 India-side rules

| # | Item | Rule | Conf. | Engine today | Plan |
|---|---|---|---|---|---|
| A-IN-1 | Move-FY status | Status for the whole FY. A returnee is usually RNOR via the 9-of-10 or 729-day tests. A4-type returnees (short stint abroad) are ROR at once. | Certain | Derived correctly | Reuse. Finding `move_in_rnor_not_available` for A4 (overlap double-tax warning). |
| A-IN-2 | **How long RNOR lasts** | RNOR lasts while either lookback test holds; typically 2–3 FYs after return. | Certain (rule) | **Single-year only** | Optional residency-history table (§4.8) → node `rnorWindow` → "RNOR expected through FY X; ROR from FY Y". Fallback without history: derive from the US years on file and say so. |
| A-IN-3 | RNOR scope | Taxed on income received or accruing in India; foreign income only if from a business controlled in, or a profession set up in, India. | Certain | Implemented (US income excluded unless ROR) | Add the "business controlled from India" exception as a question in the finding, not a field. |
| A-IN-4 | **NRE / FCNR / RFC on return** | Under FEMA the person becomes resident on return. NRE accounts must be redesignated (to resident or RFC). NRE interest exemption (s.10(4)(ii)) ends with FEMA non-residence. FCNR (and RFC for RNOR) interest stays exempt while NR/RNOR (s.10(15)(iv)(fa)). The US always taxes NRE interest for a US person. | Likely / Verify | **None** (XB-27) | Use `bank_accounts[].account_type`. Add `interest_inr` and `redesignation_date` per account, and an `rfc` type. Node `nriAccountInterest` splits exempt and taxable on each side. |
| A-IN-5 | **401(k) / IRA once ROR** | India may tax yearly growth; s.89A → **s.158 / Form 40** lets a "specified person" defer to withdrawal for a "specified account" in a notified country (US notified). Form 40 is due by the return due date. | Likely / Verify | None (XB-20) | Retirement-balance fields (US form) plus the India s.158 block (§4.8). Finding `move_in_s158_election` from the first ROR year. |
| A-IN-6 | Roth once ROR | India does not recognise the Roth's tax-free status, and the s.158 deferral fits poorly (no US tax at withdrawal to align with). | Likely | None (XB-26) | Finding `move_in_roth_exposure`. Quantify only with a balance on file. |
| A-IN-7 | **Schedule FA** | Required from the first **ROR** year (not RNOR). Reports a calendar year: US accounts, brokerage, 401(k)/IRA, RSUs, property. Black Money Act penalty risk. | Certain | Schedule FA logic exists | Make sure the RNOR → ROR transition fires it, with the first calendar year to report. Calendar entry. |
| A-IN-8 | US income once ROR | Worldwide. Credit for US tax under s.90 / s.159 (Form 44, Rule 76). Calendar-year vs FY timing. | Certain | Exists | Reuse. |
| A-IN-9 | RSUs and US shares in India | Perquisite on vest (RNOR: the share for work outside India is not taxed). Later sale: foreign unlisted shares → long-term after 24 months (12.5%); short-term at slab rates. Cost = value taxed at vest. Convert at the SBI TT buying rate. | Likely | Partial (`equity_comp_sourcing`) | Per-vest attribution using workdays already collected. |
| A-IN-10 | **RNOR window opportunity** | US stock gains realised while US nonresident (no US tax, §871(a)(2)) **and** India RNOR (accrues outside India) can be taxed by neither country. | Likely | None | Finding `move_rnor_window_gains` (planning, info). Must say "if received outside India". |
| A-IN-11 | s.115H continuation | A returning NRI may elect to keep the non-resident rate on investment income from specified foreign-exchange assets (not shares in an Indian company) until they are sold. Made by declaration in the return. | Likely / Verify (ITA 2025 survival) | Field `is_specified_foreign_exchange_asset` exists, unread | Finding `move_in_115h_option` when such assets exist. Compute after Verify. |
| A-IN-12 | US Social Security / pensions in India | Taxation depends on the treaty article (Art. 19 / 20). Verify which applies to US Social Security. | Verify | `socialSecurityUs` exists | Disclosure until verified. |
| A-IN-13 | Advance tax in the first year with US income | Interest under s.234B/C for a returnee's first ROR year. | Certain | 234B/C exist | Reuse. Calendar highlight. |

### 4.5 DTAA application (A)

| Situation | Article | Outcome |
|---|---|---|
| Apr–Aug overlap, RNOR | 4, 16 | No real conflict: RNOR India doesn't tax US-earned pay. |
| Apr–Aug overlap, ROR (A4) | 4, 16, 25 | US wins the tie-breaker for the window (permanent home), or India credits US tax on US-earned pay. Finding gives both routes. |
| RSU vest after return | 15/16, 25 | US taxes the US-workday share. India taxes the whole vest (ROR) or the India-workday share (RNOR); credit for US tax. |
| US rental | 6, 25 | The US taxes (net basis if elected). India credits once ROR. |
| US dividends | 10, 25 | 25% / 15% US withholding. India credits (ROR). |
| 401(k) withdrawals | 20 / 23 | Periodic payments → India only (verify). Lump sum → both may tax, so credit. |

### 4.6 New findings (A)

`move_us_end_date_unsupported`, `move_us_mfj_not_available`,
`move_us_rental_871d`, `move_us_departure_clearance`,
`move_us_ltr_treaty_claim_expatriates`, `move_us_citizen_feie_window`,
`move_us_retirement_distribution_nra`, `move_us_nra_estate_tax_exposure`,
`move_remote_us_employer_from_india`, `move_in_rnor_not_available`,
`move_in_rnor_window`, `move_in_nre_redesignation`, `move_in_s158_election`,
`move_in_roth_exposure`, `move_in_schedule_fa_first_year`,
`move_rnor_window_gains`, `move_in_115h_option`, `move_overlap_tiebreak`.

### 4.7 Documents and calendar (A)

| Row | Trigger |
|---|---|
| Form 1040-C / Form 2063 (before departure) | Direction = to India, not a US citizen |
| Closer-connection statement (with the return) | End date < 31 Dec |
| Form 8854 | Green-card holder + long-term resident + I-407 |
| W-8BEN to brokers and banks | After departure |
| Form 40 (s.158) | First ROR year + US retirement balance |
| Schedule FA (first year) | First ROR year |
| Form 44 + TRC | Any US tax credited in India |
| NRE/NRO redesignation (FEMA, not a tax form) | Return to India |

### 4.8 Intake changes (A) — all optional, `null` by default

**Router:** none.

**US form → new collapsed block "Move-year split"**, shown only when
`final_us_residency_status === "DUAL_STATUS"`. Path:
`us_residency_detail.move_year_split`. The same block serves both
directions; labels flip with direction.

| Field | Meaning |
|---|---|
| `us_wages_paid_in_nonresident_period_usd` | Final paycheck, PTO payout or severance after departure (A), or US pay before arrival (B). |
| `foreign_wages_received_in_resident_period_usd` | Indian salary, bonus, gratuity or leave encashment received while a US resident. |
| `us_interest_resident_period_usd` | Override for the day-count fallback. |
| `us_dividends_resident_period_usd` | Override. |
| `us_capital_gains_resident_period_usd` | Override (trade-date basis). |
| `foreign_investment_income_resident_period_usd` | Override when India quarters aren't filled. |
| `other_income_resident_period_usd` | Catch-all. |

**US form → `retirement_accounts`:** add `401k_balance_usd`,
`traditional_ira_balance_usd`, `roth_balance_usd`, `hsa_balance_usd`. These
are the year-end balances needed for s.158, Schedule FA and the Roth finding,
and they overlap US-24.

**India form → `bank_accounts[]`:** add `interest_inr` and
`redesignation_date`, plus account type option `rfc`.

**India form → new optional residency-history table:**
`residency_detail.history[]`, 10 rows of `{fy, days_in_india, status}`. When
filled, it computes the two lookback booleans the form already asks for (the
existing answers stay authoritative; a mismatch raises a finding) and powers
the RNOR-window projection.

**India form → new block "Foreign retirement account relief":**
`foreign_retirement.s158_election`, `specified_account_opened_while_nr`,
`form_40_filed_date`.

---

## 5. Scenario B — India → US (arrival)

### 5.1 Personas (become Phase 0 fixtures)

| Id | Who | Why it's distinct |
|---|---|---|
| **B1** | Single, arrives mid-Aug 2026 on H-1B. Indian salary Apr–Aug, Indian mutual funds, NRO FD. | SPT not met in 2026 → full-year nonresident vs first-year choice. Mutual funds become PFICs. |
| **B2** | Married. Primary arrives Feb 2026 (H-1B); spouse arrives Apr (H-4) with Indian rental income. | Dual-status vs a §6013(h) joint full-year election. The spouse's Indian rent enters US tax if elected. |
| **B3** | F-1 student arrives Aug 2026. | Exempt individual (Form 8843), 1040-NR, Art. 21(2) standard deduction, no FICA. |
| **B4** | Green-card immigrant, leaves India in **November** 2026. Owns a flat, EPF/PPF, ULIP. | India **ROR** in the departure FY (≥182 days) → real overlap with US residency. Gratuity and leave encashment timing. |

### 5.2 Timeline for B1

| Period | US status | India status | What matters |
|---|---|---|---|
| Pre-move (FY 2025-26) | — | ROR | **Planning window:** sell appreciated Indian mutual funds and shares before US residency starts (no US step-up; PFIC from day 1). Take gratuity and leave encashment before arrival. Decide what to do with ULIPs. |
| Move year: US TY2026, India FY 2026-27 | Nonresident all year (139 days) **or** dual-status via first-year choice | NR (left for employment, under 182 days) | **Election comparator.** Indian salary Apr–Aug is India-only. FBAR/8938 from the residency start date. |
| First full US year (TY2027 / FY 2027-28) | Resident | NR | Worldwide US tax. PFIC (Form 8621), FBAR, 8938, Form 3520 for gifts, NRO interest withholding as a foreign tax credit, India rent on Schedule E. |

### 5.3 US-side rules

| # | Item | Rule | Conf. | Engine today | Plan |
|---|---|---|---|---|---|
| B-US-1 | Residency start date | SPT → first day present (≤10 days excluded); green card → first day as a permanent resident; first-year choice → first day of the 31-day run. | Certain | Uses `residency_start_date` as given | Cross-check against arrival date and first-year-choice entry date. Finding `move_us_start_date_mismatch`. |
| B-US-2 | **Election comparator** | Options: (a) full-year nonresident (1040-NR); (b) first-year choice (dual-status, file after next year's SPT, Form 4868); (c) first-year choice + §6013(h) → joint, full-year resident, standard deduction, **worldwide income incl. pre-arrival Indian salary** with a credit for Indian tax; (d) §6013(g) when the spouse is already a resident. | Certain (rules) | Not compared (US-31) | Node `arrivalElectionComparator`: runs the existing US core up to 4 times and shows tax for each. Finding `move_us_election_comparison` names the cheapest option and the cost of each. |
| B-US-3 | **Income attribution defaults** | Indian salary earned and paid before the start date → nonresident period, foreign-source, **not US-taxed**. US wages → resident period. Indian bonus, gratuity or leave encashment **received after** the start date → resident period, US-taxable, with a credit only if India taxed it. | Certain (pre-arrival salary) / Likely / Verify (post-arrival receipt of pay for Indian work, Reg. 1.871-13) | **Pre-arrival Indian salary partly taxed by the US** via day-count | §6.2 attribution node. Override field `foreign_wages_received_in_resident_period_usd`. |
| B-US-4 | Return form | Resident at year end → **1040 is the return, 1040-NR is the statement.** | Certain | Generic text | Direction-aware. |
| B-US-5 | Students, teachers and researchers (B3) | F/J students exempt from SPT for 5 calendar years (Form 8843); 1040-NR; Art. 21(2) standard deduction; Art. 21(1) payments from India; Art. 22 two-year teacher and researcher exemption; no FICA on F-1/J-1 pay. | Certain | `article212Eligible`, Art. 21(1) and Art. 22 findings exist | Reuse. Add Form 8843 to Documents. `move_us_start_date_mismatch` also compares `article_22_arrival_date` with the move date. |
| B-US-6 | **PFIC from day 1** | Indian mutual funds, ETFs and some ULIPs are PFICs. The holding period starts on becoming a US person. Excess-distribution rules unless a mark-to-market election (Form 8621). | Certain (PFIC) / Likely (holding-period start) / Verify (ULIP) | PFIC detection exists | Finding `move_us_pfic_first_year`: first-year mark-to-market election window. Pre-arrival sale is in B-PLAN-1. |
| B-US-7 | **No basis step-up** | The US taxes the full gain since purchase (in USD at historical FX), including gains built up before arrival. | Certain | None | Finding `move_us_no_step_up` with the gain figure from `financial_holdings.transactions` (purchase value vs current value). |
| B-US-8 | Reporting from the start date | FBAR (US person for part of the year — Verify whether the max-value period is the whole year), 8938 (resident period), Form 3520 (gifts > $100k from Indian relatives), 5471 (≥10% officer or shareholder in an Indian company), 8865 (Indian LLP or partnership), 720 (foreign insurance premiums excise tax). | Likely / Verify | Most of these forms exist | Scope the gauges to the resident period. Add 720. |
| B-US-9 | Indian rental property | Schedule E. Depreciation for foreign residential rental (ADS 30 years — Verify). Basis = historical cost in USD, not value at arrival. Credit for Indian tax (Art. 6). | Likely | Foreign rental read | Reuse. Add basis-at-arrival note. |
| B-US-10 | Indian home sale after arrival | §121 can apply to a foreign home (2 of 5 years). FX gain on repaying an INR mortgage (§988). India taxes the gain under Art. 13 → US credit via Art. 25(3) re-sourcing. | Certain (121, 988) / Likely (re-sourcing) | Real estate and 988 read | Finding when an Indian property sale is planned or done. |
| B-US-11 | EPF / PPF / NPS | US: PPF interest taxable (India-exempt, so no credit). EPF employer contributions and growth possibly taxable; trust and Form 3520 classification is disputed. | Likely / Verify | EPF interest and NPS read | Reuse. Scope to the resident period. |
| B-US-12 | FICA | No India–US totalization agreement. H-1B/L-1 pay FICA from the first paycheck; F-1/J-1 exempt. | Certain | Exists | Reuse. |
| B-US-13 | Dependents and spouse IDs | Child Tax Credit needs an SSN. A §6013 election needs the spouse's SSN or ITIN (Form W-7). | Certain | `spouse_ssn_or_itin_type` read | Gate the comparator on ID availability. |
| B-US-14 | Estimated-tax penalty in the first year | The §6654 "no tax last year" exception needs a full-year US resident prior year — new arrivals usually don't qualify. | Likely | Penalty engine exists | Arrival-year guard + finding. |
| B-US-15 | State entry | Part-year resident. Most states (e.g. CA) give no credit for Indian tax. | Likely | State module partial | Disclosure. |

### 5.4 India-side rules

| # | Item | Rule | Conf. | Engine today | Plan |
|---|---|---|---|---|---|
| B-IN-1 | **Departure-FY status** | Leaving for employment → 182-day test only. Leaving before roughly late September → NR for that FY. Leaving later → resident (ROR) for the whole FY → India taxes US pay for Oct–Mar. | Certain | `is_departure_year` **unread** | Read it. Finding `move_in_departure_timing` with the day count and the latest NR-safe departure date. |
| B-IN-2 | ROR in the departure FY (B4) | Overlap window → Art. 4 tie-breaker for the window, or credit for US tax on US-earned pay (Art. 16 / 25). Schedule FA for that FY covers the new US accounts. | Likely | Generic dual-resident logic | `move_overlap_tiebreak` (shared with A4). |
| B-IN-3 | NR scope and withholding | Indian income only. TDS at NR rates (s.195): NRO interest about 30%+, rent 30%+ (tenant deducts), dividends 20%. Treaty rates via TRC + Form 41 (s.159(8)). No s.87A rebate for NR. | Certain | Mostly exists | Reuse. Finding when TDS > the treaty cap → refund claim. |
| B-IN-4 | FEMA redesignation | Resident accounts → NRO. New foreign earnings → NRE. NRO repatriation up to $1M per FY with Form 15CA/15CB. | Certain | `nro_repatriation` partly read | Finding `move_in_nro_redesignation`. |
| B-IN-5 | Gratuity / leave encashment | India: gratuity exempt to ₹20L (s.10(10)), leave encashment to ₹25L (s.10(10AA)). **The US taxes them if received while a resident, and there is no Indian tax to credit.** | Likely | Salary exemptions read | Planning finding `move_receive_terminal_benefits_before_arrival`. |
| B-IN-6 | Indian ESOPs vesting or exercised after the move | India taxes the perquisite on the India-workday share even as an NR. The US taxes the whole spread as a resident, with a credit for the India share. | Likely | Partial | Per-vest attribution, same node as A-IN-9. |
| B-IN-7 | Filing obligation as NR | Only if Indian income is above the threshold or a refund is due. | Certain | `indiaFilingObligation` exists | Reuse. |
| B-IN-8 | Tax clearance on leaving | Required only in specified cases (serious fraud, or tax arrears above a threshold) per the 2024 CBDT clarification. | Likely | None | Info line in the departure finding. |

### 5.5 Pre-arrival planning (the advice these firms bill for)

| # | Item | Why | Conf. |
|---|---|---|---|
| B-PLAN-1 | Sell appreciated Indian mutual funds and shares **before** the US start date | Pays Indian capital gains tax (12.5% long-term above ₹1.25L for listed equity). Avoids PFIC treatment and US tax on gains built up in India. Rebuy to reset cost if wanted. | Certain (mechanics) / Likely (rate) |
| B-PLAN-2 | Decide on ULIPs and endowment policies | Possible PFIC; foreign-insurance excise tax; awkward reporting. | Verify |
| B-PLAN-3 | Take gratuity and leave encashment before arrival | See B-IN-5. | Likely |
| B-PLAN-4 | Time the departure date | See B-IN-1. | Certain |
| B-PLAN-5 | Close or keep EPF/PPF | US annual taxation of growth vs India exemption. | Likely / Verify |

Implemented as findings with `category: "planning"`, shown only when the
start date is in the future or within the base year.

### 5.6 DTAA application (B)

| Situation | Article | Outcome |
|---|---|---|
| Indian salary Apr–Aug | 16 | India only (US nonresident period). |
| Indian rent after arrival | 6, 25 | India taxes; the US taxes worldwide and credits. |
| NRO interest / Indian dividends | 11 / 10, 25 | Indian withholding capped at treaty rates (TRC + Form 41). The US credits. |
| Indian share or mutual-fund sale after arrival | 13, 25(3) | Both tax. The US credits via re-sourcing (verify the scope for listed securities). |
| Student | 21 | 1040-NR standard deduction. |
| B4 overlap Nov–Mar | 4, 16, 25 | Tie-breaker for the window, or an India credit for US tax on US-earned pay. |

### 5.7 New findings (B)

`move_us_start_date_mismatch`, `move_us_election_comparison`,
`move_us_pfic_first_year`, `move_us_no_step_up`, `move_us_first_year_reporting`,
`move_us_2210_arrival_year`, `move_in_departure_timing`,
`move_in_nro_redesignation`, `move_receive_terminal_benefits_before_arrival`,
`move_plan_sell_before_arrival`, `move_plan_ulip`, `move_plan_epf_ppf`,
`move_overlap_tiebreak` (shared).

### 5.8 Intake changes (B)

**Router:** none.

**US form:** the same "Move-year split" block as §4.8, with labels flipped
by direction. Nothing B-specific beyond that.

**India form:** none beyond §4.8. B uses fields that already exist:
`is_departure_year`, `trips[]`, `financial_holdings.transactions[]`,
`bank_accounts[]`.

---

## 6. Engine design (shared by both scenarios)

New files: `prototypes/graph-pilot/move-nodes.js` and
`dag_py/src/wising_dag/crossborder/move.py`. They are composed after
`ustax-full-nodes.js` / `ustax_full.py` and before the findings aggregation,
in the same composition style XB-25 used.

### 6.1 `moveContext` (gate)

```
inputs : usStatusRaw, usResidencyStartDateRaw, usResidencyEndDateRaw,
         first_year_choice_entry_date, green_card_grant_date, i407_surrendered_date,
         closer_connection_claim, india trips[], is_departure_year,
         india status, baseYearUs, is_us_citizen
output : null                                   — no signal (every current profile)
       | { direction: "to_india" | "to_us",
           moveDate, moveDateSource,            — "us_end_date" | "us_start_date" | "india_trips" | ...
           usSubCase: "visa" | "green_card" | "citizen" | "student",
           indiaMoveFyStatus, overlapWindow: {from, to} | null,
           conflicts: [ ... ] }                 — e.g. US end date ≠ last India arrival ± 3 days
```

- **Direction rule:** an end date before 31 Dec → `to_india`; a start date
  after 1 Jan → `to_us`; both present → the later date wins and a conflict
  finding is raised.
- A citizen with a move signal gets `direction` set, but the US-side
  computation is unaffected (scope never changes).

### 6.2 `moveYearAttribution` (replaces day-count scaling)

- Builds `{ residentPeriod: inc, nonresidentPeriod: inc, basis: {item: "dated" | "override" | "direction_default" | "day_count"} }`
  using the §3.4 evidence order and the defaults in §4.3 / §5.3.
- `usDualStatusResult` keeps its shape. It calls `computeUsTaxCore` with the
  attributed income instead of `scaleResidentInc` / `scaleNonresidentInc`.
  Those two helpers stay, used only for items whose basis is `day_count`.
- The existing `us_dual_status_split_year` finding gains a per-item basis
  table, so the preparer sees exactly which numbers are estimated.

### 6.3 `arrivalElectionComparator` (B only)

- Runs up to 4 scenarios through the existing US core:
  - full-year nonresident → the existing `nraTaxResult` path;
  - first-year choice dual-status → §6.2;
  - first-year choice + §6013(h) → existing resident path with spouse income
    and the full year of Indian income, plus a foreign tax credit;
  - §6013(g) → same as the previous option.
- Returns `[{option, eligible, whyNot, usTaxUsd, indiaCreditUsd, netUsd}]`.
  Ineligible options are shown, never silently dropped.

### 6.4 `rnorWindow` (A only)

- Uses `history[]` (optional) or, failing that, the existing lookback
  booleans plus US-year evidence.
- Output: `{ rnorThroughFy, rorFromFy, basis: "history" | "estimated" }`.
- Drives `move_in_rnor_window` and the first-ROR-year items: Schedule FA,
  s.158, Roth.

### 6.5 `nriAccountInterest` (both)

- Per account: India-exempt / India-taxable / US-taxable amounts, from
  `account_type` + `interest_inr` + `redesignation_date` + India status.
- Feeds the existing India other-sources total and US foreign interest
  **only when `interest_inr` is filled**. Otherwise the current aggregate
  interest fields are used unchanged, so existing profiles are untouched.

### 6.6 Monitor (Layer 2)

**Phases 1–3: no new screens.** New findings (with their steps), documents
and calendar rows appear in the existing panels. The Monitor already renders
`## ` sections in a finding's advice as headed steps (`ActionText`,
`monitor-next/components/Views.jsx` ~line 265).

**Phase 4: a Move tab**, in the sidebar next to Residency. It is shown only
when `moveContext` is set. Top to bottom:

1. **Timeline:** the §3.1 bar. US periods, India FY statuses, the
   resident-in-both window, and the RNOR → ROR projection.
2. **Four summary tiles:**
   - items that change tax treatment;
   - actions due before the move date;
   - US-situs assets exposed to US estate tax (A-US-12);
   - loans with currency exposure.
3. **Move balance sheet (§6.7):** grouped by accounts, investments,
   retirement, property, business, insurance, loans and tax attributes.
   Each row shows: before → after for each country, what the move changes,
   the action, and a status chip (action needed / needs data / no change).
4. **Action plan (§6.8):** every step from every move finding, grouped by
   **when** (before the move · on the move date · after the move · next
   year) and by **who** (specialist · client · employer · bank). Steps are
   ticked off through the existing resolve-with-a-reason log
   (`conflict-log.js`, per client-year after §7).

**Changes to existing tabs:**
- **Holdings / Accounts:** a "changes on move" tag per row, linking to its
  balance-sheet row.
- **Filings:** move deadlines, and a start/stop list of reports by year
  (FBAR, Form 8938, Form 8621, Schedule FA, Form 3520, Form 5471).
- **Residency:** hosts the same timeline.
- **Clients:** a firm-wide **"Moves in progress"** list showing each client
  with a planned or recent move, the move date, and the next move deadline
  across the book (G-27).

### 6.7 `moveBalanceSheet` (both)

- **Inputs:** holdings the forms already collect:
  - India: bank accounts, financial holdings, property, unlisted equity,
    commodities, foreign assets;
  - US: bank accounts, financial holdings, real estate, retirement, foreign
    entities, PFIC holdings, equity compensation;
  - the new loan fields (§8.2);
  - tax attributes (carryovers, G-12).
- **Output:** one row per item:
  `{ group, label, valueUsd, valueInr, before: {us, india}, after: {us, india}, event, ruleIds[], findingIds[], status: "action" | "needs_data" | "no_change" }`.
- **Rules come from the A/B/L/G ids in this document**, so every row traces
  to a rule and a finding. A row with no rule says **"No change from the
  move"** explicitly, so the specialist can see it was considered.
- Items the engine can't classify go to `move_not_covered` (§6.9) and are
  never dropped.

### 6.8 The guidance standard — what every move finding carries

Every `move_*` finding ships with all eight parts. A finding missing any part
fails `run-move.js` / `test_move.py`.

| Part | Content |
|---|---|
| What changes | One plain-language line. |
| Why | The rule, with section or article. |
| What to do | Numbered steps, each with **who** (specialist / client / employer / bank) and **when** (before / on / after the move / next year). |
| Forms and documents | Exact forms, plus evidence to collect (G-21). |
| Deadline | A real date computed from the move date, not "promptly". |
| Cost of not acting | $ or ₹ where computable; otherwise the named penalty. |
| Doesn't apply if | The exceptions that send it back to the specialist. |
| Confidence | Certain / Likely / Verify, carried into the finding. |

- **Format:** the `recommendation` text uses the existing `## ` sections
  (`## What to do`, `## Forms and documents`, `## Deadline`,
  `## Doesn't apply if`), so the Monitor shows it with no UI change.
- **Steps field:** one additive field,
  `steps: [{ who, when, text, deadline }]`, feeds the Action plan grouping.
- **Review:** every guide is signed off by a CA (India steps) and a CPA (US
  steps) in Phase 0 before its finding ships.
- **Client-facing checklist:** an export of the client's own steps is a
  natural Phase 4+ add-on. It stays out of scope until the guides have been
  reviewed.

**Worked example (draft, not reviewed advice): `move_in_nre_redesignation`**

> **What changes:** The client becomes resident in India under FEMA on
> 15 Aug 2026. The Axis NRE account (₹19L) has to be converted.
> **Why:** FEMA. The NRE interest exemption (s.10(4)(ii)) applies only to a
> person resident outside India under FEMA. *[Likely; ITA 2025 section to
> map]*
>
> **What to do:**
> 1. *Client, on return:* tell the bank in writing; redesignate the NRE
>    savings account as a resident account, or move the foreign-currency
>    part to an RFC account.
> 2. *Client:* NRE deposits may run to maturity; interest from the return
>    date is taxable. *[Likely; check the bank's terms]*
> 3. *Specialist:* include interest from the return date in Indian income.
>    While RNOR, check FCNR/RFC money, whose interest stays exempt.
> 4. *Specialist:* if the client was a US resident for part of the year,
>    report that period's interest on the US return.
>
> **Forms and documents:** the bank's redesignation form, a passport copy
> with the arrival stamp, the bank's interest certificate split at the
> return date.
> **Deadline:** 15 Aug 2026 (the return date).
> **Cost of not acting:** Indian tax plus interest on interest wrongly
> treated as exempt. The FEMA penalty needs legal confirmation (§12).
> **Doesn't apply if:** the client is back only on a visit and keeps FEMA
> non-resident status — specialist judgement.
> **Confidence:** Likely.

### 6.9 `move_not_covered` — the boundary, stated out loud

- **When it fires:** `moveContext` is set **and** the facts fall outside the
  tested case list (§10), or a fact matches a rule still marked **Verify**.
- **Severity:** warning. The finding names each triggering fact and says
  "specialist judgement needed — not computed".
- **Known triggers in v1:**
  - Indian HUF interests (G-5); a US LLC owned by an India resident (G-6);
    a US revocable or living trust (G-7); crypto held on foreign exchanges
    (G-8).
  - A move via a third country (time spent resident elsewhere between the
    two).
  - Move dates in the two forms more than 3 days apart (§6.1 conflicts).
  - Both spouses moving on different dates **and** a §6013(g) election.
  - Any item whose guide is still unreviewed.
- **Tracking:** each trigger is listed in the published case list, so firms
  see the boundary before they rely on the tool. Each one that gets built
  later moves from this list into a tested case.

---

## 7. Specialist workflow — when an existing client moves

A visual version of this section is published for the team as a separate
page (see the commit that added this section).

### 7.1 What happens today (verified against the current branch)

- **[Certain] A client is one record with no tax year.**
  - The registry (`ClientRegistry` in `constants.js`) stores three keys per
    client: `wising_client_<id>_router`, `_india` and `_us`.
  - The year is `router.base_tax_year`, a field inside the record.
- **[Certain] Recording a move overwrites history.** The specialist has to
  edit the residency fields in the same record. That replaces the year the
  record held before. The alternative is creating a second client and
  re-typing everything.
- **[Certain] The move-year numbers are wrong.** The dual-status calculation
  splits income by days (§6.2 fixes it).
- **[Likely] Resolutions go stale.** The conflict log (`conflict-log.js`) is
  keyed per client, not per client-year. When the year's numbers change,
  resolutions reopen and mix with the new year's items.
- **[Certain] Nothing detects a move.** The Monitor's residency day-counter
  projects when a status flips at the current pace of days. That is a
  useful prompt for the specialist, not a move detector.

### 7.2 Proposed flow

```
 SPECIALIST                    WISING (Monitor + forms)                     ENGINE
 ① Learns of the move ──────▶ Clients tab ▸ [Record a move]
   (client tells them; or      asks only: direction · date · planned/done
    day-counter projects a             │
    status flip ✔ — a prompt,          ▼
    not detection)            ② Creates the MOVE-YEAR record
                                 carried over: identity, bank accounts, holdings,
                                 property, retirement, carry-forward losses
                                 pre-fills move fields the forms already have ✔
                                 previous year's record stays untouched
                                       │
               ┌───────────────────────┴──────────────────────┐
               ▼ PLANNED                                       ▼ DONE
 ③a Advises before the move   what-if bar ✔ + move-date ──▶ projected move year,
                               control (new)                 planning findings
               └───────────────────────┬──────────────────────┘
                                       ▼
 ④ Completes the move year    India + US forms — same screens ✔ ──▶ moveContext,
                              move-year split block shown only now   attribution, dual-status
                                                                     tax, comparator, India
                                       ┌─────────────────────────── status, DTAA overlap
                                       ▼
 ⑤ Reviews and signs off      Monitor: Move timeline (new) · Conflicts · Documents ·
                              Calendar · Reconciliation ✔ · each decision logged ✔
                                       │
                                       ▼
 ⑥ Next year                  [Roll forward] ▸ next-year record, statuses preset;
                              reminders: next-year SPT check (first-year choice) ·
                              RNOR end · first Schedule FA / Form 40
```

✔ = exists today. Everything else is new.

| Step | Returning to India | Moving to the US |
|---|---|---|
| ③a Before the move | Plan for the RNOR window; Form 1040-C; decide on the US rental and the 401(k) | Sell Indian mutual funds before arrival; take gratuity and leave encashment before arrival; time the departure from India for NR status |
| ④ Move year | US: 1040-NR is the return, with a 1040 statement. India: RNOR status; NRE accounts converted | US: four-way filing-option comparator. India: NR under the 182-day rule |
| ⑥ Next years | RNOR → ROR: Schedule FA, Form 40 (s.158), Roth exposure | Full US resident: Form 8621, FBAR, Form 8938, Form 3520 |

### 7.3 What has to be built (Phase 0.5)

1. **Per-year client records.**
   - New key form: `wising_client_<id>_<year>_router|india|us`.
   - The registry entry gains `years: [..]` and `activeYear`. Pages take the
     year from `?client=<id>&year=<year>`.
   - **Migration:** an existing client's unsuffixed keys are read as the
     year in their own `router.base_tax_year`. Nothing is rewritten until
     the specialist creates a second year. Old links keep working.
   - **Forms stay unchanged.**
     - The router and both forms already resolve their storage through
       `ClientRegistry.storageKeyFor`, so only that function becomes
       year-aware.
     - **Exception:** `layer1_us.html` lines ~6850–6851 and ~7021 build
       spouse keys directly (`spouseLinkUsKey`, `spouseLinkRouterKey`).
       They must read the spouse's record for the **same year** — a
       three-line change to a helper, not a screen change.
   - **Household:** `household-link.js` already requires both spouses to be
     on the same `base_tax_year`. With per-year records, the link is checked
     per year. A couple who move on different dates still link because they
     share the tax year.
   - **Conflict log:** keyed per client-year, so last year's resolutions
     stay attached to last year.
2. **Roll forward.** Creates year N+1 from year N:
   - **Carried over:** identity, accounts, holdings, property, retirement
     balances, carry-forward losses, elections that persist.
   - **Cleared:** income, days and payments.
   - **Status preset** from `moveContext` (e.g. US non-resident / India RNOR
     after a return).
   - Shared by moves and ordinary annual use.
3. **"Record a move" action** on the Clients tab.
   - Asks three things: direction, date, planned or done.
   - Writes them into fields that already exist: US
     `residency_start_date` / `residency_end_date` and
     `final_us_residency_status = DUAL_STATUS`; India `trips[]` and
     `is_departure_year`.
   - Creates the move-year record via roll-forward when it doesn't exist
     yet.
   - No new form fields.
4. **Move-date control in the what-if bar.** Re-runs the projected move year
   for a different date: before/after the 182-day departure point, or a
   January–March vs April move. Uses the same engine as the filed year.

**Exit criteria:**
- every existing client opens with identical data and identical `analyze()`
  output;
- old `?client=` links work;
- `check:form-roundtrip` and `check:example-household` are green;
- spouse linking is verified per year;
- a Playwright run of Record-a-move → roll forward → edit the move year →
  reopen the previous year shows the previous year unchanged.

---

## 8. Assets, liabilities and everything else a move touches

A move changes the treatment of nearly everything the client owns or owes.
This section is the scope of the move balance sheet (§6.7), plus the results
of a gap sweep across tax, FEMA, procedure and practice. Every item says
where it lands in the plan, or that it is out of scope.

### 8.1 Assets — what the move changes

| Group | Data on file | What the move changes | Rules |
|---|---|---|---|
| **Bank accounts** | India `bank_accounts[]` (type, peak balance); US `bank_accounts[]` | NRE/NRO/FCNR/RFC conversion and interest; FBAR, Form 8938 and Schedule FA start and stop; residential status at the bank (G-15) | A-IN-4, B-IN-4, A-US-13, A-IN-7, G-15 |
| **Investments** | India `financial_holdings.transactions[]` (dates, cost); US `financial_holdings[]` (peak balance only); `pfic_holdings[]` | PFIC starts (arrival) or stops (departure); no US cost reset; US estate tax for a nonresident; India gains on US shares once ROR need lot data (G-20); US brokers may restrict India residents (G-19) | B-US-6, B-US-7, A-US-12, A-IN-9, A-IN-10, G-19, G-20 |
| **Equity compensation** | US `rsu_vestings[]` (dates, workdays), `iso_exercises[]`, `espp_purchases[]` (collected but unread) | Workday sourcing across the move; India perquisite vs US income timing; ESPP unmodelled (G-9) | A-IN-9, B-IN-6, G-9 |
| **Retirement** | US contributions, `retirement_distributions[]` (dated); Indian EPF/PPF/NPS balances | 401(k)/IRA/Roth in India once ROR; EPF/PPF in the US; 401(k) loan on leaving the employer (L-5); Social Security credits (G-25) | A-US-10, A-IN-5, A-IN-6, B-US-11, L-5, G-24, G-25 |
| **Property** | India `property.properties[]`; US `real_estate.properties[]` | Rental taxation in the other country; §121 2-of-5-years test (the exclusion survives about 3 years after moving out); converting a home to a rental (depreciation basis = lower of cost and value at conversion); FIRPTA; Indian TDS on rent paid to a non-resident | A-US-6, B-US-9, B-US-10, B-IN-3 |
| **Business interests** | US `foreign_entities`; India company/LLP data | Forms 5471/8865 and CFC rules start on arrival; a US LLC owned by an India resident is a hybrid (G-6); place-of-effective-management risk for an Indian company run from the US | Existing entity engine, G-6 |
| **Insurance** | India premiums (`life_insurance_premium_inr`, ULIP flags) | ULIP/endowment PFIC question; Form 720 excise tax; US life policies held from India | B-PLAN-2, §12 item 8 |
| **Crypto** | India crypto/VDA module; US crypto flags | No US cost reset on arrival; India 30% VDA tax and 1% TDS; reporting of foreign-exchange-held crypto unclear | G-8 |
| **Trusts and HUFs** | India HUF entity type | US classification of an HUF interest; a US living trust owned by an India resident | G-5, G-7 |
| **Tax attributes** | US loss carryovers, India `carry_forward_losses` | US carryovers usable only against US-connected income once nonresident; India losses carry on | G-12 |

### 8.2 Liabilities — the biggest gap

**[Certain] What is collected today:**
- **India:** home-loan interest and principal *paid* (`principal_home_loan_inr`,
  `affordable_home_loan_interest_inr`), `loan_sanction_date`,
  `is_self_occupied_with_loan`, `interest_on_borrowed_capital_inr`.
- **US:** `mortgage_interest_paid_usd`, `mortgage_acquisition_date`,
  `student_loan_interest_usd`, `cancellation_of_debt_usd`.
- **Not collected anywhere:** the amount still owed, the loan currency, the
  lender's country, or which property secures the loan.

**New optional fields (Phase 3), one small `loans[]` list on each form:**
`{ kind: home | education | vehicle | personal | securities | retirement_plan,
lender_country, currency, outstanding_balance, original_amount, start_date,
secured_property_ref, interest_rate }`. The existing interest-paid fields stay
as they are. The list adds balances and currency only.

| # | Liability | What the move changes | Conf. | Plan |
|---|---|---|---|---|
| L-1 | Indian home loan after moving to the US | India: s.24(b) interest stays deductible for a let-out property (the self-occupied ₹2L cap is old-regime only). US: interest on a foreign main or second home is deductible on Schedule A (acquisition debt up to $750k), or on Schedule E if rented. **§988:** an FX gain on repaying an INR loan is taxable; a loss on a personal-use loan is not deductible. | Likely | Balance sheet row; FX gain computed when balance and currency are on file. |
| L-2 | US mortgage after returning to India | US: Schedule E interest under the §871(d) net-basis election if rented. India (ROR): foreign house-property income with s.24 interest. Paying it from India goes through LRS, with TCS (G-17). | Likely | Balance sheet row; G-17 cost. |
| L-3 | Student loans | US: the §221 interest deduction is lost for a nonresident or MFS filer. India: s.80E applies only to loans from Indian institutions. Repaying from India goes through LRS. | Likely / Verify | Disclosure. |
| L-4 | Debt settled or forgiven around the move | US cancellation-of-debt income (`cancellation_of_debt_usd` exists). Sourcing for a nonresident needs legal confirmation. | Verify | Disclosure; `move_not_covered` when nonresident. |
| L-5 | **401(k) loan when leaving the employer** | An unpaid balance usually becomes a loan offset, i.e. a taxable distribution, plus §72(t) if under 59½. A common returnee trap. The rollover deadline is extended to the return due date. | Likely | Phase 2: a `retirement_distributions[]` row of type "loan offset" dated at departure; reuses the built §72(t) rule. |
| L-6 | Loans against securities, margin | Selling to repay can trigger gains in the wrong country or period. | Likely | Disclosure. |
| L-7 | Tax owed at the move | US final balance due and nonresident-period estimates; India advance tax; India tax clearance (B-IN-8). | Certain | Balance sheet "tax payable" group; calendar. |

Out of scope: personal guarantees, co-signed loans, lease terminations.

### 8.3 Gap sweep — other things a move touches

Found in a structured sweep of tax, FEMA, procedure, family and practice
issues. Each item is new to this plan unless it says otherwise.

| # | Area | What the move changes | Conf. | Plan |
|---|---|---|---|---|
| G-1 | US state domicile | CA, NY, VA and others can keep taxing until domicile is broken. Most states ignore the treaty and give no credit for Indian tax. | Likely | Phase 1: generalise the existing CA departure alert. |
| G-2 | **Visit days after the move** | A returnee visiting the US for about 140 days a year meets the US 183-day test again under the 3-year weighting (140 + 46.7 + 23.3 = 210). With under 183 days in the current year they can still claim a closer connection to India (Form 8840, by the return due date), but the claim must be filed. An Indian citizen who moved to the US, visits India 120+ days, has Indian income over ₹15L, **and** was in India 365+ days over the previous 4 years becomes resident (RNOR) again. | Certain | Phase 1: the existing day-counter with post-move thresholds and a "safe days left" figure. |
| G-3 | Green card kept with a re-entry permit | The holder stays a US tax resident on worldwide income while living in India. Claiming treaty residence instead triggers §877A for a long-term resident (A-US-8). | Certain | Phase 1: part of the A2 guide. |
| G-4 | **US-citizen children** | A US-born child is a US citizen for life: their own US filing threshold, FBAR on their Indian accounts, PFIC on Indian funds in their name, SSN for the Child Tax Credit. India clubs a minor's income with the parent's (s.64(1A)). | Certain / Likely | Phase 1 disclosure. Per-child computation is out of scope until the household model covers children. |
| G-5 | Indian HUF | US classification of an HUF interest is unsettled. | Verify | `move_not_covered`. |
| G-6 | US LLC owned by an India resident | Transparent for US tax, possibly a company for India: tax-credit mismatch, Schedule FA reporting. | Verify | `move_not_covered`. |
| G-7 | US revocable / living trust | India may not recognise the grantor-trust treatment; Schedule FA trust reporting. | Verify | `move_not_covered`. |
| G-8 | Crypto | No US cost reset on arrival. India 30% VDA tax and 1% TDS. Reporting of crypto held on foreign exchanges is unclear. | Likely / Verify | Balance sheet row; `move_not_covered` for foreign-exchange holdings. |
| G-9 | **ESPP** | The US form collects `espp_purchases[]`; **[Certain]** the engine reads none of it. India taxes the discount at purchase; the US at sale (qualifying or disqualifying). Workday sourcing applies across the move. | Certain (gap) / Likely (rules) | Phase 2, alongside RSU attribution. |
| G-10 | Relocation benefits | Employer-paid moving costs, relocation bonus, tax gross-ups: taxable in the US (the moving-expense exclusion is military-only). Indian treatment of relocation reimbursements needs legal confirmation. | Likely / Verify | Phase 2: attribution item placed by payment date. |
| G-11 | Consultants keeping US clients from India | India business income. US: no tax on services done outside the US for a nonresident, no SE tax. Clients need a W-8BEN instead of a W-9. India GST on exported services is out of scope; disclosed only. | Likely | Phase 1 guide. |
| G-12 | **US carryovers after becoming nonresident** | Capital-loss carryover, NOL, foreign-tax-credit carryover, suspended passive losses, AMT credit: usable only against US-connected income. The FTC carryover is usually lost in practice. | Likely | Phase 1: balance sheet "tax attributes" group plus a planning finding (use them before departure). |
| G-13 | **Due dates change with status** | 1040-NR without wages subject to withholding: due 15 June. US citizens and residents living abroad: automatic extension to 15 June. First-year choice needs an extension. India: due date depends on the ITR form and audit status. | Certain | Phase 1 calendar. |
| G-14 | PAN–Aadhaar linking | A returning resident's PAN must be linked to Aadhaar or it becomes inoperative (higher TDS, refunds blocked). NRIs are exempt. The India form has an Aadhaar-link toggle. | Likely | Phase 1 guide, return direction. |
| G-15 | **Residential status at banks, brokers, funds and the employer** | Until the status is updated, NR TDS (30%+) continues after the return, or resident TDS continues after leaving. | Certain | Phase 1 guide steps plus the existing Withholding tab. |
| G-16 | RNOR and "received in India" | Foreign income *first received* in an Indian account is taxable even for an RNOR. Keep it outside India until it has been received abroad. | Likely | Phase 1: part of the RNOR guide. |
| G-17 | **LRS and TCS after return** | Money sent to the US (investments, US mortgage payments, gifts) is LRS: capped at $250k per FY, with TCS (20% above ₹10L for most purposes, credited against tax). | Likely (verify current rates) | Phase 3: cost on L-2 and on US investments. |
| G-18 | FEMA holding rules | A returning resident may keep foreign assets acquired while non-resident (FEMA s.6(4)); new foreign investments go through LRS. | Likely | Balance sheet "can keep" note. |
| G-19 | US brokers restricting India residents | Many US brokers and fund houses close or restrict accounts once the address is in India. | Likely | Balance sheet note on US holdings. |
| G-20 | **No lot-level data for US holdings** | `financial_holdings[]` has peak balance only. Once ROR, India can't compute gains on US shares without acquisition date and cost (INR at the acquisition-date rate). | Certain | Phase 3: optional `acquisition_date` and `cost_basis_usd` per holding. |
| G-21 | Residency evidence | I-94 travel history, passport stamps, lease, employment letter, I-407; boarding passes for India day counts. | Certain | Phase 1: "Forms and documents" in each guide. |
| G-22 | Catch-up programmes | US citizens or green-card holders in India who missed returns or FBARs: Streamlined Foreign Offshore Procedures. India: FAST-DS 2026 for missed Schedule FA (XB-21). | Likely | Phase 1 disclosure. |
| G-23 | Exchange rates | The engine uses a flat FX rate. Statute: India Rule 115 (SBI TT buying rate); US yearly average or spot. The move year makes this worse, because the two periods have different rates. | Certain | Phase 2 disclosure; per-period FX later. |
| G-24 | EPF withdrawal on leaving India | Taxable in India if under 5 years of continuous service (TDS). Taxable in the US if withdrawn while resident. | Likely | Phase 1: extend B-PLAN-5. |
| G-25 | Social Security | No India–US social-security agreement. US benefits need 40 credits, so a returnee short of 40 gets nothing. Tax on benefits paid to India residents is §12 item 5. | Certain / Verify | Phase 1 disclosure. |
| G-26 | Health cover | The ACA premium tax credit is unavailable in the nonresident period; HSA as in A-US-11. | Likely | Disclosure. |
| G-27 | Firm-wide view | Specialists need all clients with planned or recent moves and their next deadlines in one place. | — | Phase 4 (§6.6). |
| G-28 | Licensing | Per-year records must keep **one client id per person**, so a professional's book counts clients, not client-years (`docs/ACCOUNT_LICENSING_MODEL.md`). | Certain | Phase 0.5 rule. |
| G-29 | Spouse and dependants' IDs, H-4 work permits | Covered by B-US-13. | — | — |
| G-30 | Death or incapacity during the transition | — | — | Out of scope beyond the estate-tax flag. |

### 8.4 Decision windows — when the client acts decides the tax

For most assets the question is not only *what changes* but **what to do,
and when**. Each window is taxed differently, so every decision guide
(§8.5, §8.7) compares the options window by window.

| Direction | Window | US status | India status | Typical effect |
|---|---|---|---|---|
| Returning to India | **W1** before leaving | Resident | NR | US taxes; India doesn't. |
| | **W2** RNOR years (move FY and up to about 2 more) | Non-resident | RNOR | **Often neither country taxes foreign-source gains.** Exceptions: US real estate, and US-source income (US withholding still applies). India taxes it if it is first received in India (G-16). |
| | **W3** after becoming ROR | Non-resident | ROR | India taxes worldwide income, with credit for US tax. |
| Moving to the US | **W1** before arriving | Non-resident | Resident | India only. Best time to sell appreciated Indian assets. |
| | **W2** after arriving | Resident | NR (or ROR in the departure FY) | Both may tax. No US cost reset. |

`moveContext` gives each window real dates. The balance sheet (§6.7) gains an
**Options** column: for each asset, the options and their tax in each country
in each window. Amounts are computed where the data exists and shown as
qualitative where it doesn't.

### 8.5 Retirement, health and education accounts — every type

**[Certain] What the product collects today:**
- **US form:** *contributions* to Traditional IRA, Roth IRA, Roth 401(k),
  SEP IRA, Solo 401(k), HSA (and coverage type), 529 and Trump accounts;
  `rmd_required`; dated `retirement_distributions[]`.
- **India form:** PPF, NSC, Sukanya Samriddhi and NPS contributions, EPF
  interest, NPS withdrawals. Indian EPF/PPF/NPS balances sit on the US form.
- **Not collected:** **no balances for any US account**, no record of
  after-tax money in a Traditional IRA (the Form 8606 basis), no Roth start
  year, no SIMPLE start date, no inherited-IRA flag.

**New optional intake (Phase 3):** the four balance fields proposed in §4.8
become one `retirement_balances[]` list on the US form:
`{ type, custodian, balance_usd, after_tax_basis_usd, roth_first_year,
simple_start_date, inherited, beneficiary_named,
custodian_accepts_foreign_address }`.

**US accounts**

| Account | Contributions after moving | Withdrawals: US | Withdrawals / growth: India | What to do (by window) | Conf. |
|---|---|---|---|---|---|
| **401(k) / 403(b)** (pre-tax) | Stop when US employment ends. | Resident: graduated tax + §72(t) under 59½. Non-resident: periodic payments exempt under Art. 20(1); lump sum 30% + §72(t) (built for full-year 1040-NR). | RNOR: not taxed if received outside India. ROR: taxed; the s.89A/158 deferral (Form 40) is available for "specified accounts". | **W1:** keep in the plan, roll to an IRA (tax-free), or cash out. Check the plan and IRA provider accept an Indian address. Employer stock in the plan: the NUA option (gain taxed as capital gain). Loan outstanding: L-5. **W2:** lump sums cost 30% US with no India tax; periodic (SEPP) payments may be untaxed in both — flagged for specialist judgement. **W3:** file Form 40 by the return due date. | Certain (US) / Likely (India) |
| **457(b)** | As above. | Governmental 457(b): **no §72(t)**. Non-governmental: unfunded, paid out on leaving per plan terms. | As above. | Check the payout election before leaving; a non-governmental 457(b) can force a lump sum. | Certain |
| **Traditional IRA** | Needs US taxable compensation; FEIE-excluded pay doesn't count. Usually stops after return. | As 401(k). **After-tax basis (Form 8606) comes out tax-free** — needs the basis on file. | As 401(k); Form 40 deferral covers it. | **W1:** decide on Roth conversion (see Roth). Record the 8606 basis. **W2:** as 401(k). | Certain / Likely |
| **SEP / SIMPLE IRA** | Stop with the business or employer. | As IRA, except **SIMPLE: 25% penalty within 2 years** of first participation. | As IRA. | Check the SIMPLE start date before any withdrawal or rollover. | Certain |
| **Roth IRA / Roth 401(k)** | Roth IRA needs compensation and income under the limit. | Qualified withdrawals tax-free (5-year rule and 59½). | **India doesn't recognise Roth.** ROR: growth or withdrawals may be taxed. The Form 40 deferral likely doesn't fit, because the US never taxes the withdrawal. | **W1:** Roth conversion while a US resident (graduated rates). **W2:** a conversion is probably 30% US tax and untaxed in India — compare. **W3:** consider withdrawing contributions before ROR. Roll a Roth 401(k) into a Roth IRA before leaving. | Certain (US) / Verify (India) |
| **Inherited IRA** | — | 10-year rule (SECURE Act); non-resident beneficiary 30% withholding. | As above. | Plan the 10-year schedule across the windows. | Certain |
| **Defined-benefit pension** | — | Annuity = periodic (Art. 20); lump sum taxed 30% as non-resident. | Periodic: India taxes as resident (RNOR: only if received in India). | **Choose annuity or lump sum before leaving**; the choice fixes the treaty treatment. | Likely |
| **Non-qualified deferred comp (409A)** | — | Paid on separation; US-source by US workdays; stays US-taxed. Former state can't tax if paid over 10+ years (4 U.S.C. §114). | Taxed by India as salary when received, with credit. | Check the payment schedule; 409A elections can't be changed late. | Likely |
| **HSA** | **Stops once US high-deductible cover ends.** Indian insurance doesn't qualify. | Medical spending tax-free, **including medical care abroad**; other spending taxed + 20% before 65. California and New Jersey tax HSAs as ordinary accounts. | Not recognised. ROR: growth likely taxable; no Form 40 relief. | **W1:** spend down on qualified US medical costs or keep for later medical bills. **W3:** report on Schedule FA. | Certain (US) / Verify (India) |
| **Health FSA / dependent-care FSA** | Ends with US employment. | **Use it or lose it at separation.** | — | Spend the balance before the last working day. | Certain |
| **529 plan** | Gift-tax rules apply. | Qualified education costs tax-free, **including eligible foreign universities** (some Indian institutions qualify). Non-qualified: tax + 10%. Up to $35k can roll into the beneficiary's Roth IRA after 15 years. | Not recognised; growth likely taxable for ROR. | Keep if a child may study in the US or at an eligible institution; otherwise plan withdrawals. | Certain (US) / Verify (India) |
| **Trump account (§530A)** | For US-citizen children. | As per §530A. | Not recognised. | Disclosure for US-citizen children (G-4). | Verify |
| **Annuities (non-qualified)** | — | Gain taxed on withdrawal; non-resident withholding. | ROR: taxed. | Disclosure. | Likely |
| **US Social Security** | No India–US social-security agreement. | Taxed as in §12 item 5. | As in §12 item 5. | Check 40 credits are earned before leaving (G-25). Medicare Part B late-enrolment penalty for those near 65. | Certain / Verify |

**For every US account (all windows):**
- [Likely] retirement accounts are US-situs assets for US estate tax on a
  non-resident (A-US-12);
- name or update beneficiaries;
- update the address and residency (W-8BEN);
- once the client is ROR, list each account on Schedule FA.

**Indian accounts (mainly for arrivals; the reverse for returnees)**

| Account | Becoming NR in India | US treatment once US resident | What to do | Conf. |
|---|---|---|---|---|
| **EPF / VPF** | Can stay; interest keeps accruing. It becomes taxable in India after 3 years without contributions. Withdrawal under 5 years of service: taxable, with TDS. | Growth and employer contributions possibly taxed yearly; classification disputed. Form 8938 / FBAR. | Decide: withdraw before arriving (India tax only) or keep. | Likely / Verify |
| **PPF** | NRI can't open; existing account continues to maturity, **no extension**. Recent rule changes on interest for NRIs. | Interest taxable in US yearly (exempt in India, so no credit). Reportable. | Decide whether to close at maturity; check the current NRI interest rule. | Verify |
| **NPS** | NRI can continue; OCI eligibility to confirm. | Growth possibly taxable; reportable. | Keep or exit per NPS rules. | Verify |
| **SCSS / Sukanya Samriddhi / NSC** | SCSS and Sukanya have NRI restrictions (closure or no extension). NSC: hold to maturity. | Interest taxable in US. | Check each scheme's NRI rule before leaving. | Verify |
| **Superannuation / gratuity** | Gratuity as B-IN-5. | Taxable if received while US resident. | Take before arriving where possible. | Likely |
| **Atal Pension Yojana** | Not open to NRIs. | — | Close or note. | Likely |

**Returning US citizens working in India (A3):** [Likely] a US citizen
without an Indian passport is an *international worker* under Indian EPF
rules. EPF is mandatory on full salary and, with no India–US
social-security agreement, generally can't be withdrawn until 58. This needs
a guide.

### 8.6 Leaving a US state — the "how"

G-1 says states can keep taxing; this is what to do about it. Tier 1 = tax
decisions; Tier 2 = evidence and admin (see §8.8).

1. **Decide the domicile-break date** = the move date unless a reason
   differs. Keep the evidence trail consistent with it.
2. **Evidence (Tier 2, client, before or on the move date):**
   - surrender the driver's licence;
   - cancel the car registration or sell the car;
   - cancel voter registration;
   - remove any homestead exemption;
   - give up or rent out any home kept in the state;
   - change the address with the employer, banks, brokers and the IRS
     (Form 8822);
   - move or close safe-deposit boxes;
   - end club and gym memberships where they matter for domicile tests.
3. **State-specific rules (specialist):**
   - **California:** closest-connection test and the employment-abroad safe
     harbour. RSUs and options stay CA-taxable by CA workdays. 3⅓%
     withholding on a non-resident's CA property sale.
   - **New York:** statutory resident at 183 days + a permanent place of
     abode. Residency audits are common; keep day logs.
   - **Virginia, New Jersey, Massachusetts and others:** domicile plus
     183-day rules.
   - **No-income-tax states (TX, FL, WA):** little to do. **Washington
     taxes capital gains.**
4. **Returns:** a final **part-year** return for the move year, then
   **non-resident** state returns for any state-source income (rent from
   the old home, its sale, RSUs, deferred comp not protected by §114).
5. **Protected:** most retirement income after leaving (4 U.S.C. §114).
   [Certain]
6. **Arrivals:** part-year resident return for the first year. Most states
   give no credit for Indian tax.

Engine: Phase 1 generalises the existing CA departure alert into
`move_us_state_exit` with this guide. The existing
`state_residency.*` fields supply the state and move date.

### 8.7 Decision guides for other assets

Each guide lists options × windows (§8.4) with the tax in each country.
Tier 1 unless marked.

| Asset | Options compared | Key points | Conf. |
|---|---|---|---|
| **US home** | Sell in W1 · sell in W2 · keep and rent | **Sell in W1:** §121 (up to $250k/$500k), India NR so no India tax. **Sell in W2:** §121 still available within 3 years of moving out; FIRPTA 15% withholding (refund via 1040-NR); state tax and withholding; India RNOR not taxed if proceeds stay abroad. **Keep and rent:** §871(d) net-basis election each year, depreciation, recapture on sale, §121 shrinks, India taxes rent and gain once ROR. Mortgage: L-2. | Certain / Likely |
| **Indian home (arrivals)** | Sell in W1 · keep or rent · sell later | **Sell in W1:** India tax only. **Later:** both tax; §121 if 2 of 5 years; buyer deducts NR TDS (s.197 lower-TDS certificate); INR loan FX gain (L-1); proceeds repatriated within $1M per FY. | Certain / Likely |
| **Car** | Sell · ship · keep in the US | Tax: no deductible loss on a personal car; pay off or settle the loan (L-6). Registration is domicile evidence (§8.6). Shipping to India and customs duty: Tier 3, out of scope. | Certain |
| **US bank accounts** | Keep one · close the rest | Keep one US account for US income, IRS refunds, retirement payouts and Social Security. W-8BEN. [Likely] some banks close accounts with foreign addresses. Interest is exempt for a non-resident (bank deposit interest). | Certain / Likely |
| **US credit cards** | Keep one | Not tax: credit history for a future return (Tier 2). | — |
| **US brokerage / stocks** | Sell in W1 · sell in W2 · keep · move to an international broker | **W1:** US resident rates. **W2:** generally no US tax (§871(a)(2) aside) and no India tax if kept abroad. **Keep:** 25% withholding on dividends; US estate tax over $60k (A-US-12); broker restrictions (G-19). Employer shares at the plan broker: check they can stay. | Likely |
| **Indian demat / mutual funds (arrivals)** | Sell in W1 · convert to NRI and keep | Convert to NRI demat (PIS for buying listed shares). [Likely] some fund houses refuse US residents. PFIC from the arrival date (B-US-6). No US cost reset (B-US-7). | Likely |
| **Indian demat / funds (returnees)** | Convert back to resident | Update KYC and FATCA status; NR TDS stops (G-15). | Likely |
| **Stock options and unvested awards on leaving the employer** | Exercise before the window closes · let lapse | Exercise windows after leaving are often 90 days. ISOs lose ISO status 3 months after leaving. Unvested awards may be forfeited or accelerated. Exercise is US-taxed by US workdays; India taxes when allotted. | Certain |
| **S-corp (owner returning to India)** | Revoke · restructure · transfer shares before departure | **[Certain] The S election ends automatically when a shareholder becomes a non-resident alien.** The company becomes a C-corp mid-year. Plan before the move. | Certain |
| **US LLC / sole proprietorship** | Wind down · keep | Keeping: G-6 hybrid issue; ongoing US filings. Partnership: §1446 withholding on a non-resident partner. | Likely |
| **Gifts and estate** | Gift before vs after · wills in both countries | **A non-citizen spouse gets no unlimited marital deduction (QDOT needed)**, and the annual gift exclusion to them is capped (about $190k). Gifts by a non-resident: only US real estate and tangible property are subject to US gift tax. Inheritance of Indian assets: §1014 basis = value at death; Form 3520 over $100k. | Certain / Likely |
| **Insurance** | Keep · replace | US term life: continuation terms differ by insurer. Health: COBRA vs Indian cover. Umbrella and landlord cover for a kept US home. | Likely |
| **Agricultural land in India (arrivals)** | Keep · sell | An NRI/OCI can't buy agricultural land, a farmhouse or a plantation, but can keep land acquired while resident or inherited. | Certain |
| **Indian company directorships, firms** | Resign · keep | Company: one director must be India-resident (182 days). Firms and proprietorships: FEMA limits for NRIs. | Likely / Verify |

### 8.8 The three tiers — what the product covers and how

| Tier | What | How the product handles it | Review |
|---|---|---|---|
| **1 — Tax decisions** | §8.4–§8.7 decision guides; all A-, B-, L- and G- rules | Findings with full 8-part guides (§6.8) and the Options column | CA + CPA, before shipping |
| **2 — Admin that affects tax** | Driver's licence, car registration, voter registration, Form 8822, W-8BEN/W-9 changes, KYC/FATCA updates, PAN–Aadhaar, power of attorney for Indian property (the agent must deduct TDS correctly), keeping a US bank account and card, cash over $10k crossing the border (FinCEN Form 105), record keeping for cost basis | Checklist steps (who, when) inside the relevant guide; ticked off in the Action plan | Specialist |
| **3 — Logistics** | Customs and transfer-of-residence rules, shipping the car and household goods, pets, immigration and visas, moving companies, school admissions | **Out of scope**, listed so firms know | — |

### 8.9 Second gap sweep — items added after the first

| # | Area | What the move changes | Conf. | Plan |
|---|---|---|---|---|
| G-31 | Repeat movers | A second return within a few years usually gets no RNOR (fails both lookback tests); §121's 3-year window and PFIC history carry over. | Certain | Case-list dimension (§10). |
| G-32 | Timing income and deductions around the move | Bunching charitable gifts, harvesting US losses or gains, prepaying deductible items while still a US resident at graduated rates. | Likely | Phase 1 planning finding (W1). |
| G-33 | Charitable giving | US deduction only while a US taxpayer and only for US charities. India 80G only for a resident. | Likely | Disclosure. |
| G-34 | Alimony and child support | DTAA Art. 20 also covers alimony and child support; US treatment depends on the divorce date (post-2018: not deductible or taxable). | Likely | Disclosure. |
| G-35 | Inheritance received across the move | Indian inheritance to a US resident: no US tax, Form 3520 over $100k, basis = value at death (§1014). | Certain | Balance sheet note. |
| G-36 | Residency audits after leaving | NY and CA audit former residents; day logs and evidence (§8.6) are the defence. | Likely | Part of the state guide. |
| G-37 | Treaty forms | W-8BEN (individual), Form 8233 (treaty exemption for pay), Form 8833 (treaty position), Form 6166 (US residency certificate), TRC + Form 41 (India). | Certain | Documents panel. |
| G-38 | Remote work for an Indian employer after moving to the US | US taxes as resident; India TDS on pay for India-performed work only. | Likely | Phase 1 guide, B direction. |

---

## 9. Intake change summary

| Layer | Change | Count | Visibility |
|---|---|---|---|
| L0 Router | None | 0 | — |
| L1 US | "Move-year split" block | 7 numeric fields | Only when status is `DUAL_STATUS` |
| L1 US | `retirement_balances[]` (§8.5): type, custodian, balance, after-tax basis (Form 8606), Roth first year, SIMPLE start, inherited, beneficiary named, custodian accepts foreign address | 9 fields per account | Retirement step; optional |
| L1 India | Bank account `interest_inr`, `redesignation_date`, type `rfc` | 2 fields + 1 option per row | Always (bank step) |
| L1 India | Residency history table | 10 rows × 3 fields | Collapsed, "optional — improves RNOR projection" |
| L1 India | Foreign retirement relief (s.158) | 3 fields | Only when status is RNOR/ROR and US retirement balances exist |
| L1 India | `previous_fy_status` + `previous_fy_q4` income (§3.1) | 1 dropdown + the existing Q4 layout | Only for a January–March move **and** no previous-year record |
| L1 India + L1 US | `loans[]` list (§8.2): kind, lender country, currency, outstanding balance, original amount, start date, secured property, rate | 8 fields per loan | Next to each form's existing loan section; optional |
| L1 US | `financial_holdings[]`: `acquisition_date`, `cost_basis_usd` (G-20) | 2 fields per holding | Optional; asked when India status is RNOR/ROR |
| Registry (not a form) | Per-year records, roll forward, Record-a-move (§7) | 0 form fields | Clients tab |

Each addition needs:
- an entry in `docs/LAYER1_INDIA_FIELD_CHANGES.md` / `docs/LAYER1_US_FIELD_CHANGES.md`;
- a passing `check:form-roundtrip` (old saved state hydrates with the new
  fields `null`);
- a passing `audit:fields` / `audit:form-engine` (every new field is read by
  the engine).

The **router stays unchanged**. If testing shows that deriving the move from
Layer 1 is unreliable, the fallback is one optional router question
(`cross_border_move: none | to_us | to_india`). That is deferred to Phase 4
and needs evidence first.

---

## 10. Test plan

1. **A defined case list, hand-worked** under
   `dag_py/tests/fixtures/move-profiles/`.
   - **Five things vary between cases:** direction (2); US status: visa,
     green card, citizen, student (4); resulting India status: ROR / RNOR /
     NR (3); move timing: Jan–Mar / Apr–Sep / Oct–Dec (3); household:
     single / couple moving together / couple moving on different dates (3);
     first move / repeat move (2, G-31). That is 432 combinations.
   - **Pruning:** Phase 0 merges combinations that follow identical rules,
     with a written reason for each merge. Examples: after moving to the US,
     India status is only NR or ROR; RNOR arises only on return; a student
     is an arrival case. **[Likely]** About 35 distinct cases remain.
   - **Personas A1–A4 and B1–B4 are the first 8.** Each further case adds
     assets and loans from §8, so the balance sheet and guides are tested
     too.
   - **The published case list is the product's boundary:** anything outside
     it raises `move_not_covered` (§6.9).
   - Each case has:
   - full Layer 0/1 state;
   - the expected US and India tax, finding ids and documents;
   - a short worksheet citing the section or article for every number.
   They are run by a new `run-move.js` / `test_move.py` and added to
   `compare:js-vs-py-dag`.
2. **No-change proof.** Before and after each phase, record `analyze()`
   output for every existing profile, section profile, golden fixture and the
   example household, and diff them. The diff must be empty except for keys
   the phase declares (`moveYear`), which must be `null`.
3. **Fuzz.** The 3,000-case `fuzz:dag` stays at zero unknown divergences.
   Add a fuzz mode that generates move-year profiles for JS-vs-Python parity
   only — the frozen engine has no move logic to compare against.
4. **Boundary cases.** Move on 1 Jan, 31 Dec, 31 Mar and 1 Apr; a leap
   year; 182 vs 183 days; first-year choice with exactly 31 days; US end date
   with no closer-connection claim; citizen with a move signal; entity
   profiles (must stay `null`).
5. **Form round-trip** for every new field, including old saved state
   without it.
6. **Professional review.** One India CA and one US CPA sign off each case
   worksheet **and each finding's guide** (§6.8) before its phase ships.
7. **Guide completeness.** `run-move.js` / `test_move.py` fail when any
   `move_*` finding lacks one of the eight guide parts, or a balance-sheet
   row has no rule and no explicit "No change from the move".

---

## 11. Phasing

| Phase | Scope | Intake change | Exit criteria |
|---|---|---|---|
| **0 — Law, cases and guides** | Resolve every **Verify** in §12. Map ITA 1961 → ITA 2025 section numbers. Prune the case list (§10) and write each case's worksheet. Draft and review the guide (§6.8) for every planned finding. | None | Case worksheets and guides signed off by a CA and a CPA. No code. **Professional review time, not engineering, sets the pace here.** |
| **0.5 — Client tax years (§7)** | Per-year client records and migration; roll forward; Record-a-move action; spouse-link and conflict-log keys per year. Can run in parallel with Phase 0. | None (the year-aware key function is shared code; plus the 3-line US-form spouse-key helper) | §7.3 exit criteria. |
| **1 — Detect, disclose, guide** | `moveContext`; decision guides §8.4–§8.7 with qualitative options per window; Tier 2 checklist steps (§8.8); `move_us_state_exit` (§8.6); G-31–G-38; all disclosure and planning findings that need only existing fields (A-US-1/2/3/7/8/9/12/13/14/15, A-IN-1/3/7, B-US-1/4/5/6/7/8/12/13/14/15, B-IN-1/3/4/5/8, B-PLAN-*, G-1–G-4, G-11–G-16, G-21, G-22, G-24–G-26), each with its full guide and `steps`; `moveBalanceSheet` from existing data; `move_not_covered`; documents and calendar rows (incl. G-13 due dates); the post-move day-counter (G-2). | None | All §2 gates green. No-change diff empty. Personas: correct finding ids. |
| **2 — Correct the move-year US computation** | `moveYearAttribution` (direction defaults + dated records + India quarters); `arrivalElectionComparator`; direction-aware return form; January–March moves read the previous FY (§3.1); retirement withdrawals split by `date_paid`, reusing the built 1040-NR treaty rule (A-US-10); 401(k) loan offset at departure (L-5); ESPP (G-9); relocation benefits (G-10); move-date control in the what-if bar. | `previous_fy_status` / `previous_fy_q4`, only when no previous-year record exists | A1/A3/B1/B2 US tax matches the worksheets within $1. Gates green. |
| **3 — Accounts, loans, lots** | Options column quantified per window from `retirement_balances[]`, loans and lots; `nriAccountInterest`; s.158 / Roth / 401(k) once ROR; `rnorWindow`; s.115H (if Verify clears); loan rules L-1–L-4, L-6 with FX on repayment; LRS/TCS cost (G-17); India gains on US shares from lot data (G-20). | India bank fields, history table, s.158 block; US retirement balances; `loans[]` on both forms; US holding lot fields | A1/A2/A4 India tax matches worksheets. Round-trip and field audits green. |
| **4 — Move tab and overrides** | Monitor Move tab: timeline, tiles, balance sheet, Action plan (§6.6); "changes on move" tags on Holdings/Accounts; start/stop reports on Filings; firm-wide "Moves in progress" on Clients (G-27); US "Move-year split" block; optional router question only if Phase 1–3 data shows derivation gaps. | US split block | Playwright check of the tab, the Action plan tick-off and the split block. Gates green. |

Phases 1 and 2 need almost no intake change — only the January–March
inputs, and only for clients without a previous-year record. Together they
fix most of the dollar error and most of the "the tool didn't mention X"
gaps. Phase 0.5 comes first because without it none of this can be applied
to an **existing** client without overwriting their previous year.

---

## 12. Law items to verify before coding (Phase 0)

1. ITA 2025 section numbers for: s.6 residence (including 6(1A) and
   Explanation 1), s.10(4)(ii) NRE interest, s.10(15)(iv)(fa) FCNR/RFC
   interest, s.89A → s.158 and Form 40 (and the notified-country list),
   s.115H, s.10(10) / s.10(10AA), s.195, s.230.
2. Reg. 301.7701(b)-4: the residency termination statement, and the
   last-year rules when the person returns in the following year.
3. Whether FBAR in a dual-status year covers the whole calendar year or the
   resident period only.
4. ~~DTAA Art. 20 vs Art. 23 for lump-sum withdrawals, §72(t) under the
   treaty~~ **Settled** for full-year 1040-NR filers by the CPA reading
   built in `retirement-dist.js`. Still open: India's side of a lump sum
   (Art. 23(3) lets the source country tax, so India credits the US tax).
5. Which article governs US Social Security paid to an Indian resident, and
   the US withholding on it.
6. Art. 10/11 rate caps as amended; Art. 25(3)
   re-sourcing scope for capital gains on listed securities.
7. Reg. 1.871-13: pay for Indian work received after the US start date.
8. PFIC holding-period start for funds bought before becoming a US person;
   ULIP classification; Form 720 for Indian life-insurance premiums.
9. ADS recovery period for foreign residential rental property.
10. EPF classification for US purposes (employer contributions and growth).
11. Whether the returning-resident "not on a visit" reading matches the
    engine's `came_on_visit_to_india_pio_citizen` logic.
12. NRE deposits held to maturity after return (interest taxability from
    the return date); the FEMA penalty for not redesignating.
13. PAN–Aadhaar linking for a returning resident: deadline and the
    consequences of an inoperative PAN.
14. RNOR "received in India": whether transfers of income already received
    abroad count as receipt.
15. Current LRS limit and TCS rates and thresholds by purpose (G-17).
16. US classification of an HUF interest (G-5); India's view of a US LLC
    (G-6) and of a US grantor trust (G-7); reporting of crypto held on
    foreign exchanges (G-8).
17. Sourcing of US cancellation-of-debt income for a nonresident (L-4);
    §221 and s.80E across the move (L-3).
18. Indian tax treatment of employer relocation reimbursements (G-10).
19. 401(k) loan offset: the rollover deadline and whether the treaty
    changes the offset's treatment after departure (L-5).
20. India's treatment of a Roth IRA, an HSA, a 529 and a Trump account for
    an ROR (yearly growth vs withdrawal), and whether any of them is a
    "specified account" for Form 40.
21. Whether India taxes a 401(k)-to-IRA rollover or a Roth conversion made
    while ROR.
22. US tax on a Roth conversion by a non-resident (30% flat vs graduated)
    and on SEPP payments in W2 (possible non-taxation in both countries —
    specialist judgement).
23. Current NRI rules for PPF (interest, extension), SCSS, Sukanya
    Samriddhi, NPS (including OCI eligibility) and EPF for international
    workers.
24. US classification of EPF/PPF/NPS (trust, Form 3520, yearly taxation)
    and their Form 8938/FBAR reporting.
25. FEMA limits on NRI holdings in Indian partnership firms and
    proprietorships.

---

## 13. Out of scope

- Customs or transfer-of-residence rules, immigration status and visa
  advice.
- Multi-year **computation**. The engine stays single-year; future years
  (RNOR window, first ROR year, next-year SPT for first-year choice) are
  projections inside findings, not computed returns.
- State-by-state exit and entry rules beyond the existing CA departure logic
  and a generic part-year disclosure.
- Estate planning beyond the nonresident US estate-tax exposure flag.
- Countries other than India and the US, including a move through a third
  country (raised as `move_not_covered`).
- India GST on services exported by returning consultants (disclosed only,
  G-11).
- Employer tax equalisation and hypothetical-tax calculations.
- A client-facing checklist export, until the guides have been reviewed
  (§6.8).
- Per-child computation for US-citizen children (disclosed only, G-4).
- Personal guarantees, co-signed loans and lease terminations.
- Tier 3 logistics (§8.8): customs and transfer-of-residence rules,
  shipping cars and household goods, pets, immigration and visas, moving
  companies, school admissions.

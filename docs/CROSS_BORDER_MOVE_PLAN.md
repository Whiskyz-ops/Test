# Cross-Border Moves — Returning NRIs (US → India) and Arrivals (India → US)

**2 October 2026.** A plan, not a shipped feature. It answers one question:
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
| **Verify** | Must be checked against the statute or treaty text, or the ITA 2025 renumbering, before any code is written. Listed again in §11. |

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
   - **US form:** one collapsed block of 8 optional fields, shown only in a
     move year, plus 4 retirement-balance fields.
   - **India form:** 2 optional fields per bank account, 1 new account type,
     an optional 10-row residency-history table, and one 3-field
     retirement-relief block.
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
| `retirement_accounts.*` contributions, `ira_distributions_usd`, `401k_distributions_usd`, `hsa_msa_distributions_usd`, `indian_epf/ppf/nps_balance_usd` | partly | Retirement treatment on both sides. |
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
| Art. 20 private pensions | Pensions and annuities are taxable only in the country of residence. Whether lump-sum 401(k)/IRA withdrawals count as "pensions" (Art. 20) or "other income" (Art. 23) is disputed. | Likely / Verify |
| Art. 21 students and apprentices | Indian students on F-1/J-1 can claim the standard deduction on Form 1040-NR (Art. 21(2)). | Certain |
| Art. 22 professors and researchers | Two-year exemption for teaching and research pay. | Likely (Verify conditions) |
| Art. 23 other income | Catch-all. The source country may also tax. | Likely |
| Art. 25 relief | India: credit for US tax on US-source income (s.90 / s.159, Form 44). US: Form 1116, with Art. 25(3) re-sourcing so India-taxed income counts as foreign-source for a US resident. | Likely (Verify Art. 25(3) scope for capital gains) |

### 3.4 The attribution principle the engine must adopt

**Today:** in a dual-status year, each item is taxed under the rules for the
period it was *received or accrued*, but the engine allocates by day-count.

**Change:** attribute each item by **period + source**, using this order of
evidence:

1. A dated record already on file:
   - RSU `vest_date`
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
| A-US-10 | 401(k) / IRA after departure | Distributions to a nonresident: 30% withholding or the treaty rate. Art. 20 vs Art. 23 split as in §3.3. The 10% §72(t) early-withdrawal penalty may still apply. | Likely / Verify | Distributions read; nonresident treatment not modelled | Finding `move_us_retirement_distribution_nra` (disclosure, Phase 1); computation in Phase 3. |
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
| `retirement_distributions_resident_period_usd` | Split of the existing 401(k)/IRA distribution fields. |
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
| B-US-5 | Students and scholars (B3) | F/J students exempt from SPT for 5 calendar years (Form 8843); 1040-NR; Art. 21(2) standard deduction; no FICA on F-1/J-1 pay. | Certain | `article212Eligible` exists | Reuse. Add Form 8843 to Documents. |
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

- Phase 1–3: no UI work. New findings, documents and calendar rows show up
  in the existing panels.
- Phase 4: a "Move timeline" card that draws the §3.1 bar (US periods, India
  FY statuses, overlap window, RNOR window) from `moveYear`.

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
     - **Exception:** `layer1_us.html` lines ~6801–6802 and ~6972 build
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

## 8. Intake change summary

| Layer | Change | Count | Visibility |
|---|---|---|---|
| L0 Router | None | 0 | — |
| L1 US | "Move-year split" block | 8 numeric fields | Only when status is `DUAL_STATUS` |
| L1 US | Retirement balances | 4 numeric fields | Always (retirement step) |
| L1 India | Bank account `interest_inr`, `redesignation_date`, type `rfc` | 2 fields + 1 option per row | Always (bank step) |
| L1 India | Residency history table | 10 rows × 3 fields | Collapsed, "optional — improves RNOR projection" |
| L1 India | Foreign retirement relief (s.158) | 3 fields | Only when status is RNOR/ROR and US retirement balances exist |
| L1 India | `previous_fy_status` + `previous_fy_q4` income (§3.1) | 1 dropdown + the existing Q4 layout | Only for a January–March move **and** no previous-year record |
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

## 9. Test plan

1. **Eight hand-worked personas** (A1–A4, B1–B4) under
   `dag_py/tests/fixtures/move-profiles/`, each with:
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
6. **Professional review.** One India CA and one US CPA sign off each
   persona worksheet before its phase ships.

---

## 10. Phasing

| Phase | Scope | Intake change | Exit criteria |
|---|---|---|---|
| **0 — Law and fixtures** | Resolve every **Verify** in §11. Map ITA 1961 → ITA 2025 section numbers. Write the 8 persona worksheets. | None | Worksheets signed off. No code. |
| **0.5 — Client tax years (§7)** | Per-year client records and migration; roll forward; Record-a-move action; spouse-link and conflict-log keys per year. Can run in parallel with Phase 0. | None (the year-aware key function is shared code; plus the 3-line US-form spouse-key helper) | §7.3 exit criteria. |
| **1 — Detect and disclose** | `moveContext`; all disclosure and planning findings that need only existing fields (A-US-1/2/3/7/8/9/12/13/14/15, A-IN-1/3/7, B-US-1/4/5/6/7/8/12/13/14/15, B-IN-1/3/4/5/8, B-PLAN-*); documents and calendar rows. | None | All §2 gates green. No-change diff empty. Personas: correct finding ids. |
| **2 — Correct the move-year US computation** | `moveYearAttribution` (direction defaults + dated records + India quarters); `arrivalElectionComparator`; direction-aware return form; January–March moves read the previous FY (§3.1); move-date control in the what-if bar. | `previous_fy_status` / `previous_fy_q4`, only when no previous-year record exists | A1/A3/B1/B2 US tax matches the worksheets within $1. Gates green. |
| **3 — India return-side accounts** | `nriAccountInterest`; s.158 / Roth / 401(k) once ROR; `rnorWindow`; s.115H (if Verify clears); nonresident 401(k) distributions. | India bank fields, history table, s.158 block; US retirement balances | A1/A2/A4 India tax matches worksheets. Round-trip and field audits green. |
| **4 — Overrides and timeline** | US "Move-year split" block; Monitor "Move timeline" card; optional router question only if Phase 1–3 data shows derivation gaps. | US split block | Playwright check of the block and card. Gates green. |

Phases 1 and 2 need almost no intake change — only the January–March
inputs, and only for clients without a previous-year record. Together they
fix most of the dollar error and most of the "the tool didn't mention X"
gaps. Phase 0.5 comes first because without it none of this can be applied
to an **existing** client without overwriting their previous year.

---

## 11. Law items to verify before coding (Phase 0)

1. ITA 2025 section numbers for: s.6 residence (including 6(1A) and
   Explanation 1), s.10(4)(ii) NRE interest, s.10(15)(iv)(fa) FCNR/RFC
   interest, s.89A → s.158 and Form 40 (and the notified-country list),
   s.115H, s.10(10) / s.10(10AA), s.195, s.230.
2. Reg. 301.7701(b)-4: the residency termination statement, and the
   last-year rules when the person returns in the following year.
3. Whether FBAR in a dual-status year covers the whole calendar year or the
   resident period only.
4. DTAA Art. 20 vs Art. 23 for lump-sum 401(k)/IRA withdrawals, and whether
   §72(t) survives treaty relief for a nonresident.
5. Which article governs US Social Security paid to an Indian resident, and
   the US withholding on it.
6. Art. 10/11 rate caps as amended; Art. 22 conditions; Art. 25(3)
   re-sourcing scope for capital gains on listed securities.
7. Reg. 1.871-13: pay for Indian work received after the US start date.
8. PFIC holding-period start for funds bought before becoming a US person;
   ULIP classification; Form 720 for Indian life-insurance premiums.
9. ADS recovery period for foreign residential rental property.
10. EPF classification for US purposes (employer contributions and growth).
11. Whether the returning-resident "not on a visit" reading matches the
    engine's `came_on_visit_to_india_pio_citizen` logic.

---

## 12. Out of scope

- Customs or transfer-of-residence rules, immigration status and visa
  advice.
- Multi-year **computation**. The engine stays single-year; future years
  (RNOR window, first ROR year, next-year SPT for first-year choice) are
  projections inside findings, not computed returns.
- State-by-state exit and entry rules beyond the existing CA departure logic
  and a generic part-year disclosure.
- Estate planning beyond the nonresident US estate-tax exposure flag.
- Countries other than India and the US.

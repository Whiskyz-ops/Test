# FEIE (§911 / Form 2555) legal-correctness review — `layer1_us.html` + both DAG engines

**[FIXED]** All 4 defects below plus the dead-code cleanup are fixed —
`dag_py/src/wising_dag/us/ustax.py` + `prototypes/graph-pilot/ustax-nodes.js`
(mirrored, verified byte-identical via `run-js-dag-vs-py-dag.js`, 329/329
profiles matching) + `layer1_us.html`'s dead `calculateFeieExclusion()`
removed. Full suite green: `dag_py` pytest 591/591, all three JS reference
harnesses show zero new divergences beyond the one already-FEIE-claiming
fixture (whose numbers correctly updated and cross-check exactly against
Python). One disclosed, intentionally out-of-scope follow-up:
`crossborder/findings.py` has a second, narrower clone of the pre-fix FEIE
logic (used only for a PFIC/FTC marginal-rate estimate, not the headline
tax number) — not touched, to keep this change's blast radius contained.

Scope: not a port-parity check (HTML vs React) — this asks whether the FEIE
*mechanics themselves* are correct against current law, in the source HTML,
the Python DAG (`dag_py`), and the JS DAG (`monitor-next/lib/dag/`), since
FEIE is computed the same (flawed) way in all three.

**Bottom line: the dollar figures baked into the app are correct for tax
year 2026. The bugs are entirely in the mechanics — how those correct
numbers get applied.** Four real, confirmed defects, two of which
materially understate US tax liability for real taxpayers and one of
which materially overstates a refund. All four are shared by both
compute engines (`dag_py` and the JS DAG), so they aren't a React-port
regression — they're in the underlying reference model
(`prototypes/graph-pilot/ustax-nodes.js`) both engines are a port of.

## What's actually correct (verified against IRS/Rev. Proc. 2025-32)

- **`FEIE_MAX_USD = 132900`** (`dag_py/src/wising_dag/us/constants.py:12`,
  mirrored in the JS DAG and the HTML) is the real 2026 figure per Rev.
  Proc. 2025-32 ($130,000 for 2025 → $132,900 for 2026). Confirmed via
  KPMG's and Greenback's Rev. Proc. 2025-32 coverage.
- **`housing_exclusion_cap_usd: 39870`** matches the published 2026 housing
  amount limitation exactly.
- **`housing_exclusion_base_usd: 21264`** = 16% of $132,900 exactly,
  matching the statutory floor formula (16% of the FEIE max).
- **SE tax is correctly NOT reduced by FEIE.** Traced
  `aggregate_us_income.py`: `se_earnings` (the SE-tax base, lines 261-267)
  sums every self-employment/farm row unconditionally, completely separate
  from `foreign_self_employment` (the FEIE-reduced figure, lines 240-247,
  same rows but filtered/split by `llc_type`). Self-employment tax always
  computes on the full, un-excluded net profit — matching the source HTML's
  own "SE Tax Trap" warning and actual law (§1401 isn't affected by §911).

## Confirmed defects, most severe first

### 1. No "stacking rule" — the single biggest issue

**The law**: per the IRS's own Foreign Earned Income Tax Worksheet (Form
1040 instructions, line 16) and IRC §911(d)(6), once you exclude foreign
earned income, you must still compute tax on your *remaining* (non-excluded)
income at the rate that would have applied had you never excluded anything
— i.e., stack the excluded income back on top for rate-determination
purposes, compute tax on the total, compute tax on just the excluded
portion alone, and subtract. This exists specifically to stop FEIE from
*also* silently lowering the bracket rate on income the exclusion doesn't
even apply to.

**What the code does** (`ustax.py:141-147`, identical in the JS DAG's
`ustax-nodes.js:135-142`): the excluded amount is subtracted directly from
`f_w`/`f_se` *before* those numbers go into ordinary income, and the
remainder is run straight through `bracket_tax()` with no second worksheet,
no rate preservation, nothing.

**Effect**: any FEIE claimant who *also* has other taxable ordinary income
(US-source wages, self-employment above the excluded amount, US interest/
dividends, etc.) gets that other income taxed at a lower bracket than the
law allows, because the excluded income no longer "fills up" the lower
brackets first. This under-states US tax liability — the direction that
matters most for a compliance tool, since it produces a real return that
would be wrong if filed as computed here.

### 2. No categorical Form 2555 → ACTC bar (UI claims one thing, engine does another)

**The law** (Schedule 8812 instructions, confirmed live): filing Form 2555
disqualifies the refundable Additional Child Tax Credit *entirely* — a
hard, categorical bar, not a phase-out. This is true even if the taxpayer
has substantial non-excluded earned income left over.

**What the code does**: the source HTML's own FEIE screen shows a warning
saying exactly this ("Claiming FEIE legally disqualifies you from claiming
the refundable portion of the Child Tax Credit"). But the actual computation
(`ustax.py:372-374`, same in the JS DAG) only *proportionally* shrinks the
ACTC by computing `earned_income_usd` from the *already-FEIE-reduced* wage/
SE figures — it never checks `feie["claimed"]` before computing
`actc_cap_usd`/`ctc_refundable_usd` at all. A taxpayer with, say, $200,000
in foreign wages who excludes $132,900 still has $67,100 of "earned income"
in this model, and the engine will still compute a nonzero refundable
ACTC off that — a result the law flatly prohibits once Form 2555 is filed.

**This is the clearest "mix-up"**: the on-screen warning and the actual
number the tool computes directly contradict each other. This overstates
a refund the taxpayer isn't entitled to.

### 3. No proration for partial-year qualification

**The law** (irs.gov, confirmed live): if you only qualify under the
physical-presence or bona-fide-residence test for *part* of the tax year
— common for anyone who moves abroad mid-year — the maximum exclusion must
be prorated: `$132,900 × (qualifying days in the year ÷ 365)`. It's not an
all-or-nothing $132,900.

**What the code does**: `feie_applied_usd = min(feie_earned_base_usd,
feie_base, FEIE_MAX_USD)` (`ustax.py:144`) — a flat cap, no reference
anywhere to qualifying-day count, test-period start/end dates, or the
tax year's total days. Every FEIE claimant gets the full annual maximum
regardless of how much of the year they actually qualified for.

**Effect**: over-excludes for any partial-year qualifier — again,
understates tax liability. (Note: this proration is distinct from the
Physical Presence Test's own 330-full-days threshold, which is
all-or-nothing on its own terms — you either meet 330 days in *some*
qualifying 12-month window or get zero exclusion; proration only kicks in
once a test is met, to reflect how much of the *tax year* that qualifying
window actually overlaps.)

### 4. The foreign housing exclusion never reaches either real tax engine

Grepped both `dag_py/src/` and `monitor-next/lib/dag/*.js` end to end for
`housing`/`foreign_housing_exclusion_usd`: **zero hits in either engine.**
The intake form collects housing expenses, computes a housing exclusion
for on-screen display, and writes it to `usState.foreign_earned_income
.foreign_housing_exclusion_usd` — but neither `dag_py`'s
`compute_us_tax_core` nor the JS DAG's equivalent ever reads that field.
It's collected, shown, and then silently dropped before it can reduce AGI
in the computation that actually matters. This *understates* the
exclusion the taxpayer is entitled to (the opposite direction from #1-#3),
but it's still a real, confirmed bug — anyone with home-country housing
costs above the $21,264 floor is being denied that exclusion in the actual
tax number.

## A separate, lower-severity issue: dead/duplicate code in the source HTML itself

Independent of the DAG-level issues above, `layer1_us.html` has **two
different functions computing the FEIE exclusion, live at the same time**:

- `calculateFeieExclusion()` (line 9084) — wired directly to the FEIE
  income/housing input fields' `oninput`/`onchange` handlers. Uses the
  correct `$132,900` cap for the FEIE side, but for housing just echoes
  back the *raw* housing-expense input with **no base/cap subtraction at
  all** (shows the full entered amount as if 100% excludable). Its own
  comment says "2024/2025 FEIE max limit is roughly $126,500" — a stale
  figure left over from a prior year, inconsistent with the `132900` the
  same function actually uses two lines later.
- `recalculateDerivedFields()`'s FEIE block (line ~11397-11412) — the real,
  authoritative calculation. Correctly applies the housing base/cap
  formula, and is what actually persists to `usState` and feeds AGI.

Both functions write to the *same* two on-screen labels
(`lbl-feie-excl`/`lbl-feie-house`). Whichever ran more recently wins, so a
user typing into the housing field sees an inflated, uncapped number
flash on screen from function #1, which then gets silently overwritten by
function #2's correct, capped number the next time anything else on the
page triggers a global recompute. This is exactly the kind of "something's
mixed up" symptom you'd notice by eye without knowing the cause — it's
dead code that should be deleted, not a second, competing source of truth.

## What this is *not*

- Not a wrong statutory dollar figure — $132,900 / $39,870 / $21,264 are
  all correct for 2026.
- Not specific to the React port — confirmed identical in the JS DAG, and
  the HTML's own local preview never implements the stacking rule or
  proration either (it doesn't even do real bracket math at all — its
  on-screen "Estimated Regular Tax" is a flat 22% placeholder, explicitly
  commented as such).
- Not something the earlier HTML↔React parity audit would have caught —
  that audit checked whether React reproduces the HTML/DAG faithfully,
  which it does here. This is a check of whether the shared underlying
  model is correct against the law, which is a different question.

## Sources
- [KPMG — Rev. Proc. 2025-32: Inflation adjustments for 2026](https://kpmg.com/us/en/taxnewsflash/news/2025/10/tnf-rev-proc-2025-32-inflation-adjustments-for-2026-individual-taxpayers.html)
- [Greenback Tax Services — IRS 2026 Tax Inflation Adjustments (FEIE $132,900)](https://www.greenbacktaxservices.com/blog/irs-tax-inflation-adjustments-2026/)
- [IRS — Figuring the foreign earned income exclusion](https://www.irs.gov/individuals/international-taxpayers/figuring-the-foreign-earned-income-exclusion)
- [Greenback Tax Services — What Is the FEIE Stacking Rule](https://www.greenbacktaxservices.com/tax-qa/feie-stacking-rule-tax-bracket/)
- [Greenback Tax Services — Why is my tax rate higher after FEIE](https://www.greenbacktaxservices.com/tax-qa/feie-stacking-rule-higher-tax-rate/)
- [IRS Schedule 8812 (Form 1040) 2025](https://www.irs.gov/pub/irs-pdf/f1040s8.pdf)
- [MyExpatTaxes — Form 8812 for US expats / Form 2555 ACTC bar](https://www.myexpattaxes.com/expat-tax-tips/tax-forms/do-i-need-to-file-form-8812-how-to-claim-the-child-tax-credit-for-us-expats/)

## Suggested fix order (not yet implemented — awaiting direction)
1. ACTC categorical bar when `feie.claimed` (#2) — smallest, most isolated
   code change, directly contradicts the UI's own stated behavior.
2. Proration by qualifying days (#3) — needs a real qualifying-day-count
   input (start/end of the qualifying 12-month window vs. the tax year),
   which the form partially collects already (`physical_presence_start/
   end_date`, `bona_fide_residence_start_date`) but doesn't wire into the
   exclusion cap calc.
3. Stacking rule (#1) — the biggest legal-correctness gap, but also the
   most involved: needs a second bracket-tax pass on excluded income alone
   and a subtraction, shared logic between both DAG engines.
4. Housing exclusion wired into `compute_us_tax_core`/its JS equivalent (#4).
5. Delete `calculateFeieExclusion()` from `layer1_us.html` (dead/misleading
   duplicate), leaving `recalculateDerivedFields()` as the sole source of
   the on-screen FEIE/housing labels.

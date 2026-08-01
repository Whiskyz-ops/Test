# US Layer 1 → React + XState port — status & known gaps

**Status: structurally complete, field-logic-verified, NOT output-parity-tested.**
Built to a 3-day, full-scope timeline, then put through a real verification
pass (2026-08-01) after real problems were reported. That pass found and
fixed **21 concrete bugs** across every one of the 22 steps — several of
which were silently discarding or corrupting user-entered tax data, not just
cosmetic gaps. What's still missing before this could replace
`layer1_us.html` as the real thing is described in the last section — do not
point `monitor-next/lib/dag-adapter.js` or any DAG compute path at this
until that's done.

## The verification pass

7 agents independently re-read every step against `layer1_us.html`'s actual
source (not against each other's prior summaries), the DAG's real field
consumers (`dag_py/src/wising_dag/**`, `monitor-next/lib/dag/**`), and
`schema.js`, fixing clear-cut bugs directly rather than just cataloging them.
Every touched file was re-verified with `esbuild --jsx=automatic
--bundle=false` after each fix, and the whole app was re-smoke-tested end to
end in a real headless-Chromium session afterward (all 22 steps reachable
with correct gating, zero new console errors, and three of the worst bugs —
the W-2 field name, the entity-routing tab visibility, and the
`state_of_domicile` path — individually re-verified live in the browser
against `localStorage`).

### Bugs found that were actively wrong, not just incomplete (fixed)

These silently produced incorrect behavior or lost data — the class of thing
that prompted this pass:

- **W-2 wages and royalty income were invisible to both DAG engines.**
  `IncomeUsStep.jsx` wrote `income_us_source.w2_wages` and
  `royalty_income_us_source_usd`; both DAG engines (`dag_py` and the JS DAG)
  only ever read `wages_w2` and `royalties_direct_us_source_usd`. Every W-2 a
  user entered — wages, withholding, everything — was silently discarded by
  tax computation. Renamed to match the DAG's real field names; verified
  live (adding a W-2 row now produces `wages_w2` in `localStorage`, the old
  name is gone).
- **`BusinessStep`'s entity-type routing hid entire income sections.** A
  partnership/S-corp/C-corp/trust filer had *no UI path at all* to enter
  Schedule C, farm, or other K-1 income, and S-corp/partnership filers had no
  way to enter their own EIN or Schedule L/M-1/M-2. The original keeps all
  six business sections always visible (entity type only decides which one
  is "primary"); the port had branch-gated them into near-total invisibility.
  Fixed — all sections are now always reachable as tabs, verified live.
- **`EquityStep`'s ISO/NSO/RSU/ESPP tax fields (AMT preference spread,
  ordinary income, §423 disposition split) were computed correctly for
  on-screen display but never persisted to state.** `AmtNiitStep`'s
  recalc read the never-saved field and silently used $0 ISO AMT preference
  for every filer regardless of actual exercise spread. Fixed.
- **AMT/NIIT computed fields (AMTI, exemption, TMT, AMT due, NIIT due, etc.)
  were rendered as freely-editable inputs** instead of read-only derived
  displays, letting a preparer type over a live tax-derived number and have
  the wrong value silently persist with no recompute. Fixed — now read-only,
  live-recalculated; `niit_threshold_usd` now correctly derives 200k/250k/
  125k from filing status instead of a static default.
- **The "US Bank Interest" field was editable from three different screens**
  (Passive/IncomeUs/BankSync) but only one of them recomputed
  `interest_us_source_usd`, which feeds AGI/AMTI/NIIT — entering it from
  either of the other two left that total stale. Fixed in all three.
- **Residency-status derivation had three real defects**: a `useMemo`
  missing `closer_connection_claim` from its dependency array (toggling
  Form 8840 never re-ran the NRA/resident-alien recompute), an incomplete
  §6013(g)/(h) OR-check blocking a legitimately-unlocked MFJ election, and a
  missing auto-revert of filing status back to `single` when the computed
  lock flips to NRA. All three fixed — this mattered beyond `ProfileStep`
  itself since `final_us_residency_status` gates every other step's
  reachability via the XState machine.
- **A second instance of the cross-step field-collision bug class**:
  `BusinessStep` and `EntitiesStep` both wrote to
  `corporate_international.form_5472_related_parties` with **incompatible
  row shapes** (one had no `id`, used as the other's React list key — new
  rows rendered with blank fields). The content doesn't even belong on
  `panel-step-business` in the original. Fixed by deleting `BusinessStep`'s
  copy; `EntitiesStep` is sole owner.
- **`profile.state_of_domicile` vs `corporate_profile.state_of_domicile`**:
  both DAG engines read the field only from `profile.*`; three components
  wrote it to `corporate_profile.*` instead, so it never reached state-tax
  computation for any corporate filer. Consolidated to the one path both DAG
  engines actually read; removed the dead duplicate from `schema.js`.
  Verified live.
- **A missing field with a real downstream consumer**: `profile.visa_type`
  didn't exist in `schema.js` or `ProfileStep.jsx` at all, even though
  `lib/dag/ustax-nodes.js`'s `usVisaTypeRaw` node reads it to drive Article
  21(2) F-1/J-1 treaty-benefit eligibility. Added.
- **FEIE's days-in-US field wasn't synced from the residency step** (should
  be a read-only mirror of `us_residency_detail.us_days_current_year`, was a
  freely-editable duplicate) and **the bona-fide-residence branch wrongly
  duplicated the physical-presence-test-only fields**, erasing the actual
  distinction between the two qualification tests. Both fixed.
- **Itemized deduction fields stayed visible even in standard-deduction
  mode.** Fixed — now gated on `use_standard_or_itemized`.
- **`StateStep`**: Trust entity types were routed to the individual-filer
  state-nexus UI instead of the corporate-nexus UI (a Fiduciary Trust/Estate
  filer got the wrong questions); individual-residency and corporate-nexus
  cards rendered simultaneously instead of mutually exclusively; the
  "Remote Worker Trap" / Convenience-of-the-Employer fields and UI
  (NY/PA/DE/NE/NJ/CT wage-taxation warnings) were entirely missing from both
  `schema.js` and the component. All fixed.
- **A leaked internal developer note was rendering directly in the live UI**
  on `GiftsStep` (implementation commentary shown to the taxpayer). Removed.
- **New bank-holding rows showed the wrong PFIC/FBAR badge until first
  edit** (derived-field computation ran on edit but not on row creation).
  Fixed.
- **A per-row capital-gains transaction's computed gain/loss was displayed
  but never persisted** to the row via `updateRow` — stayed `undefined`
  forever, including after reload, even though the aggregate STCG/LTCG
  totals (which the DAG reads) were still correct via independent
  computation. Fixed.

### What was checked and found already correct
`EntitiesStep`'s CFC/GILTI row shape (ownership %, tested income/loss, E&P,
Subpart F, foreign tax paid, §962 election) already matched `dag_py`'s
`_compute_cfc_inclusion` exactly — the highest-stakes, least-audited file in
the app turned out to be fine. `FtcStep`, `NraStep`, `WithholdingStep`,
`IncomeForeignStep`, and `RealEstateStep`'s core CRUD/formulas were also
verified correct with no changes needed. Store immutability
(`addRow`/`removeRow`/`updateRow`/`setField`) was checked across every step
for index-shift and shared-reference mutation bugs — none found; all row
CRUD is genuinely immutable.

## Remaining known gaps (large, deliberate, still deferred)

- **`step-business`**: `calculateBusinessIncomes()`'s full basis/at-risk/
  §8582 passive-loss/QBI wage-and-UBIA limitation logic is not ported (the
  replacement total is incomplete but not wrong — confirmed no gross/net
  confusion or double-counting). `addUsBranchRow` (foreign-parented US
  branches) is not ported. The NAICS/SSTB dropdown is a short list, not the
  original's ~25 options. The master "has business income" empty-state
  toggle has no equivalent (lower severity — nothing to hide/lose since
  sections are always visible now).
- **`RetirementStep`**: the RMD card is a freely-editable dollar field
  rather than the original's age-only-derived, no-fabricated-amount display
  — the DAG's own RMD node ignores the stored value and re-derives from age
  independently, so this doesn't corrupt output today, but it lets a
  preparer enter a number that looks authoritative and is silently unused.
- **Cross-jurisdiction hydration** (reading `wising_layer1_india_state` and
  translating India-side fields for dual-jurisdiction taxpayers) is not
  ported at all — a real feature gap, not a simplification.
- **`SUPERSET_SCHEMA_TEMPLATE` reconciliation** (the original's second,
  ~1,450-line duplicate schema definition) — not attempted.
- **A newly-found, unfixed duplicate-ownership pattern**: `IncomeUsStep` and
  `PassiveStep` both independently render the same interest/dividend/
  rental/social-security fields. Not data-corrupting today (both write
  straight to the same store path, no derived-value race, last-write-wins)
  but redundant and worth a product decision on sole ownership, same as the
  fixed CapGains/IncomeUs and BusinessStep/EntitiesStep collisions.
- A few small dead/decorative fields carried over unchanged from the
  original (`k1_passthrough_income_usd` was never wired to anything in
  `layer1_us.html` either — not a port regression).
- No required-field / step-completion validation exists (matches the
  original, which also has none).

## What "done" still requires

The field-logic verification described above is real, but it is still
**code-level correctness against the DAG's field contracts**, not
**output-level correctness**. Before this replaces anything:

1. For every persona/fixture already used in this repo's parity harnesses
   (`prototypes/graph-pilot/run-js-dag-vs-py-dag.js`, `dag_py/tests/`), fill
   out this React form to match, export via `OutputStep`'s JSON dump, diff
   against the same persona's known-good `layer1_us.html`-produced state,
   and diff the resulting DAG tax output end to end.
2. Resolve the `IncomeUsStep`/`PassiveStep` duplicate-ownership item above.
3. Decide on `SUPERSET_SCHEMA_TEMPLATE` reconciliation and cross-jurisdiction
   hydration.

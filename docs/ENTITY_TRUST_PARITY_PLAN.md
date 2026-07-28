# Entity Computation — Feature & Trust Parity Plan

**28 July 2026.** Prompted by a direct question this project keeps having to
answer honestly: *"Can we say the corporations/business-entity side of the
India-US corridor is at par with the individual side?"* The honest answer
today is no, on two separate axes that this document tracks together —
**feature parity** (does entity computation cover what individual
computation covers) and **trust parity** (has it been verified with the same
rigor). A feature can exist and still not be "at par" if nobody has checked
it the way the individual side's numbers have been checked — and conversely,
there's no verification work to do on a feature that hasn't been built yet.
Both axes have to close before the parity claim is honest.

Companion to three existing documents, each covering one piece of this:
`docs/BUSINESS_ENTITY_ARCHITECTURE.md` (the feature spec and phased build
order this document's §2 restates as its input), `docs/DAG_MIGRATION_TRACKER.md`
(the verification methodology this document's §3 maps onto the entity side,
item by item), and `docs/FIELD_COVERAGE_AUDIT.md` / the "Filings audit"
commit series (the two audit methodologies §3.5/§3.6 extend to entity-specific
fields and forms). This document adds nothing new to the tax logic itself —
it is a checklist for knowing when the parity claim becomes true.

---

## 1. Where things actually stand today (not aspirational)

Verified directly against `docs/BUSINESS_ENTITY_ARCHITECTURE.md` §8 and
`scripts/audit/dag-coverage.js`'s own mapping table, not recalled from memory:

| | Individual (India-US) | Entity (India-US) |
|---|---|---|
| **Feature depth** | Full computation: residency, slab/regime tax, surcharge/marginal relief, cess, LTCG/QDI, NIIT, addl Medicare, FEIE, FTC §904 both directions, PFIC/CFC detection, FBAR/8938/LRS gauges, DTAA tie-breaker | Core entity residency (POEM/incorporation) + core tax computation (India company rates, US C-corp/pass-through) shipped (Phases 0-3). Depreciation complete only for Schedule C. No GILTI/Subpart-F quantification. No multi-entity graph. Transfer pricing disclosure-only by design. |
| **Verification depth** | 40/40 DAG rows ported, mechanically audited (`npm run audit:dag`), differential-fuzzed at scale (`run-fuzz.js`), 6 rounds of external filings audit, full field-coverage audit (~220 field paths) | `computeIndiaEntityTax` (TAX-2) and `computeUsEntityTax` (TAX-7) are both **already** ported and mechanically audited — this is real, not a gap. But their dedicated harness (`run-entitytax.js`) checks only 3 company profiles against 8 individual profiles as negative control — thin compared to the hundreds of checks per individual boundary. The differential fuzzer's seed pool is 12 fixtures, of which only 3 are entity/company-flavored — entity code paths get roughly a quarter of the fuzzing exposure individual paths get, purely because of seed mix. No dedicated entity filings audit round has been run. |

**The one-line honest summary:** the entity side's *foundation* has real,
already-mechanically-verified computation behind it — this is further along
than a plain feature checklist would suggest. But feature coverage stops at
Phase 3, and even where features exist, the verification depth is
proportionally thinner than the individual side's. Neither axis is at par
yet.

---

## 2. Feature parity — the build list (input from `BUSINESS_ENTITY_ARCHITECTURE.md` §8)

Restated here only so this document's §3 can map trust work onto it 1:1.
Authoritative status lives in the source doc — check there before relying on
this table if time has passed.

| Item | Deliverable | Status | Blocked on new fields? |
|---|---|---|---|
| Phase 1 (US remainder) | MACRS/§179/bonus for K-1 pass-through, 1120 C-corp, farm Schedule F asset rows | Not started | No |
| Phase 4 (India) | Presumptive lock-in disclosure, non-corporate AMT (`IN-5`), MSME-disallowance finding, s.44BBB/35AD/115V | Not started | No |
| Phase 5 | Entity graph model + extractor in `normalize()` | Not started | No (needs Phases 0-4 first) |
| Phase 6 | Inter-entity flow edges (K-1, dividends, partner remuneration) as traceable edges | Not started | No (needs Phase 5) |
| Phase 7 (US) | GILTI/Subpart-F NCTI quantification (`XB-14`) | Not started | **Yes** — CFC financials (E&P, QBAI, tested income) not in Layer 1 US today |
| Phase 8 | Frontend entity switcher + per-entity drill-down | Not started | No (needs Phases 5-6) |
| — | Transfer pricing arm's-length computation | **Deliberately out of scope** (§3.6 of the architecture doc) | Product decision, not a build item — see §4 below |

---

## 3. Trust parity — mapping each individual-side verification technique onto entity computation

For every technique that earned the individual side its current trust level,
here is the entity-side equivalent, what already exists, and what's missing.

### 3.1 Function-by-function code comparison (engine vs. DAG)

**Individual precedent:** every `engine/*.js` function was read side-by-side
against its `prototypes/graph-pilot/*.js` node(s) — `docs/DAG_MIGRATION_TRACKER.md`,
first pass 18 July 2026, explicitly not grep-based.

**Entity status:** done for `computeIndiaEntityTax`/`computeUsEntityTax`
(the Phase 0-3 core). **Not done** for anything in Phase 1/4/5/6/7/8 — because
none of it is written yet. As each phase lands, its node(s) need the same
side-by-side read against the engine implementation it's meant to port,
before it's marked "ported" in `dag-coverage.js`'s mapping table.

### 3.2 Per-boundary harness against real profiles

**Individual precedent:** `run-aggregateindiaincome.js` (165/165),
`run-aggregateusincome.js` (385/385), `run-in1.js`/`-v2`/`-v3` (22/22, 66/66,
8/8), `run-ustax.js` (81/81) — each boundary gets its own harness with a real
pass count, re-executed and re-verified on a cadence, not just cited once.

**Entity status:** `run-entitytax.js` exists but checks only the 3 company
profiles (`india_pvt_ltd`, `us_ccorp_indian_sub`, `foreign_holdco_poem_india`)
plus 8 individual profiles as negative control (confirming the entity path
correctly does *not* fire for them). That's a real harness, but a thin
profile set next to the hundreds of checks per individual boundary.

**Action:** before claiming trust parity on the entity side, add profiles
that don't exist among the current 11 — an LLP, a standalone HUF business, a
trust, an S-corp, a partnership with guaranteed payments, and (once Phase 5/6
land) a genuine multi-entity ownership case. Each new phase's harness should
target real coverage of its own boundary the way `run-aggregateusincome.js`
did for income aggregation, not a token handful of checks.

### 3.3 Mechanical audit (`npm run audit:dag` / `scripts/audit/dag-coverage.js`)

**Individual precedent:** extracts every `safe()` path, every `add("id")`
finding, every numeric literal from the engine, and diffs it against the
DAG's mapped node(s) — fails the run on any missing read or numeric drift.

**Entity status:** `computeIndiaEntityTax` → TAX-2 and `computeUsEntityTax`
→ TAX-7 are already in the script's mapping table (`m("TAX-2", "ported", ...)`,
`m("TAX-7", "ported", ...)`) — this part of the mechanical safety net already
exists for entities, same as individuals.

**Action:** as each new phase's node file is written, add its mapping entry
to `dag-coverage.js` the same way TAX-2/TAX-7 were added — this is a
mechanical extension of existing infrastructure, not new tooling.

### 3.4 Differential fuzzer (`run-fuzz.js`)

**Individual precedent:** mutation-based fuzzing from the 12 real fixtures
(SAMPLE + 11 PROFILES), splicing sections across donor fixtures to produce
combinations no hand-authored profile specifies, comparing the full
`WISING.analyze()` shape between engine and DAG at scale.

**Entity status:** the fuzzer already runs against the whole fixture set,
so entity code paths get *some* exposure whenever a company profile is
picked as a base or donor — but only 3 of 12 fixtures are entity-flavored,
so entity logic is fuzzed roughly a quarter as often as individual logic,
purely as a side effect of seed mix, not a deliberate exclusion.

**Action:** once the new entity profiles from §3.2 exist, they become
additional fuzzer seeds automatically (the fuzzer draws from whatever's in
`profiles.js`) — raising entity representation in the seed pool is a direct,
mechanical consequence of adding those profiles, not a separate fuzzer
change. Worth confirming after the fact that entity-tagged runs are no
longer a minority of fuzz iterations.

### 3.5 Field-coverage audit

**Individual precedent:** `docs/FIELD_COVERAGE_AUDIT.md` — every `safe()`
path in `normalize.js` extracted mechanically, cross-referenced by hand
against every field the two Layer 1 forms actually collect, catching fields
collected but never read (the exact bug class that made `net_profit_inr`
non-functional before Phase 0 fixed it).

**Entity status:** Phase 0 of the architecture doc *was* this audit, scoped
to entity fields, applied retroactively after the bug was found rather than
proactively. No comprehensive re-sweep has been run since.

**Action:** once Phase 7 adds new CFC-financials fields to Layer 1 US (E&P,
QBAI, tested income), run the same mechanical-extraction-plus-hand-cross-
reference method against those new fields specifically — new fields are
exactly where this audit's method catches the most, since they're the least
battle-tested.

### 3.6 Filings/external-research audit

**Individual precedent:** six rounds (Batches A-E plus a round 2 completeness
pass) verifying document/filing triggers against external authoritative
sources — caught real bugs (Form 8833's over-broad trigger, Form 44/India-FTC
and Schedule FSI/TR false positives, a missing Form 8858, a wrong s.92E
calendar date).

**Entity status:** entity-specific forms (Form 1120 itself, Schedule M-1/M-2,
K-1 issuance/receipt obligations, Form 5471/8865 ownership filings, Form
3CEB) have not had a dedicated audit round the way the individual-side
information returns (Batch A) or treaty-position forms (Batch B) did.

**Action:** run one dedicated batch, same method as Batches A-E, scoped to
entity/business filing triggers — this is a known, repeatable process in
this codebase, not new methodology to invent.

---

## 4. Transfer pricing — a decision, not a build item

Restating this plainly because it's the one item on this list that isn't an
engineering gap: `docs/BUSINESS_ENTITY_ARCHITECTURE.md` §3.6 records TP as
deliberately disclosure-only, on the reasoning that arm's-length-price
computation "genuinely isn't rule-encodable at the depth an ALP study
requires." Closing this "gap" isn't a phase to schedule — it's a choice
between affirming that decision permanently (defensible on its own terms) or
deliberately scoping in some bounded version of TP. Either way, it shouldn't
sit silently as an implied gap in a parity claim; it should be a named,
answered question.

---

## 5. Sequencing

Trust work on **already-built** entity computation (Phases 0-3: residency,
core rate schedules, TAX-2/TAX-7) can start now — §3.2's new profiles and
§3.6's filings-audit round don't depend on anything else landing first.
Trust work on **not-yet-built** phases (1 remainder, 4-8) is necessarily
gated behind their own feature work — there is nothing to fuzz, audit, or
harness-test in code that doesn't exist. Practically: run §3.2 (profile
expansion) and §3.6 (entity filings audit) against the Phase 0-3 core
immediately; treat every subsequent phase's "done" definition as including
its own §3.1-3.4 verification pass before moving to the next phase, rather
than batching all verification to the end.

## 6. Definition of done for the parity claim

Both boxes checked, per item, before saying "at par" about that item
specifically — not a single global toggle:

- [ ] Phase 1 (US depreciation remainder) — built, code-compared, harness-
      extended, `audit:dag`-mapped
- [ ] Phase 4 (India remaining depth) — built, code-compared, harness-
      extended, `audit:dag`-mapped
- [ ] Phase 5 (entity graph) — built, code-compared, harness written,
      `audit:dag`-mapped
- [ ] Phase 6 (inter-entity edges) — built, code-compared, harness written,
      `audit:dag`-mapped
- [ ] Phase 7 (GILTI/NCTI) — Layer 1 fields added, built, code-compared,
      harness written, `audit:dag`-mapped, field-coverage audit run on the
      new fields specifically
- [ ] Phase 8 (frontend switcher) — built, click-tested the way Holdings/
      Business tabs were per `dag-adapter.js`'s own precedent
- [ ] Entity-specific filings audit round (§3.6) — run, findings fixed
- [ ] Entity profile set expanded (§3.2) — LLP, HUF business, trust, S-corp,
      partnership-with-guaranteed-payments, multi-entity case added to
      `profiles.js`
- [ ] Fuzzer entity-seed representation confirmed no longer a minority
      (§3.4) — mechanical consequence of the profile expansion above
- [ ] Transfer pricing — an explicit, recorded decision either way (§4), not
      a silent gap

Until every box above is checked, the honest claim is: *"the entity
foundation is real and independently verified where it exists, but neither
feature-complete nor verification-complete relative to the individual
side."* That sentence is safe to say to anyone today.

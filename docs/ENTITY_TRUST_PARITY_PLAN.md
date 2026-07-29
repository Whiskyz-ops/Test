# Entity Computation — Feature & Trust Parity Plan

**28 July 2026, rewritten same day.** The first version of this document was
written against a stale read of the branch — it claimed Phases 5, 6, and 8
were "Not started." They had already shipped (25 Jul 2026) by the time this
document was first committed; the read just hadn't caught up. This version
is rewritten against a fresh, verified pass over the current branch tip, and
the gap is now much smaller than originally stated. Still prompted by the
same honest question this project keeps having to answer: *"Can we say the
corporations/business-entity side of the India-US corridor is at par with
the individual side?"* — tracked on the same two axes as before, **feature
parity** and **trust parity**, both of which have to close before that claim
is true.

Companion to `docs/BUSINESS_ENTITY_ARCHITECTURE.md` (§8's phase table, this
document's §2 input), `docs/DAG_MIGRATION_TRACKER.md` (sections N/O/P — the
actual verification record for the entity phases, not just their existence),
and `docs/FIELD_COVERAGE_AUDIT.md` / the filings-audit commit series (§3.5/3.6
below). One scoping note this rewrite adds: this document tracks the
**engine-vs-JS-DAG** trust axis only, because that's the axis the individual
side's trust claim was built on and the axis currently live in production.
A separate, already-tracked effort (`docs/PYTHON_DAG_MIGRATION_TRACKER.md`)
is porting the whole DAG — individual and entity computation alike — to
Python, explicitly to *replace* the JS DAG once a time-based promotion gate
(≥500 profiles, ≥14 days of live shadow running) clears. That's a real,
in-progress axis, but it applies identically to individual and entity code,
so it doesn't change the individual-vs-entity gap this document tracks — it
isn't restated here to avoid conflating two different questions.

---

## 1. Where things actually stand today

Verified against `docs/BUSINESS_ENTITY_ARCHITECTURE.md` §8 and
`docs/DAG_MIGRATION_TRACKER.md` sections N-P at current HEAD:

| | Individual (India-US) | Entity (India-US) |
|---|---|---|
| **Feature depth** | Full computation: residency, slab/regime tax, surcharge/marginal relief, cess, LTCG/QDI, NIIT, addl Medicare, FEIE, FTC §904 both directions, PFIC/CFC detection, FBAR/8938/LRS gauges, DTAA tie-breaker | Residency (POEM/incorporation), core rate schedules, depreciation (Schedule C + farm), presumptive/MSME/s.44BBB findings, **entity graph with ownership edges, inter-entity flow tracing (K-1/dividends/partner remuneration with full `calc`/`source` attribution), and a frontend entity switcher with per-entity drill-down — all shipped.** Two items genuinely still open: non-corporate AMT (confirmed blocked, not just deprioritized) and GILTI/Subpart-F dollar quantification (blocked on new Layer 1 fields). Transfer pricing disclosure-only by design. |
| **Verification depth** | 40/40 DAG rows ported, mechanically audited (`npm run audit:dag`), differential-fuzzed at scale (CI runs 3,000 iterations/push), 6 rounds of external filings audit, full field-coverage audit (~220 field paths) | Entity tax core (TAX-2/TAX-7) ported + mechanically audited. **Entity graph (Phase 5): `run-assets.js` 867/867, structural checks (no duplicate ids, every edge real, correct dual-root handling), a real bug caught via fixture testing (not synthetic) before ship. Inter-entity edges (Phase 6): harness extended to 890/890, every edge trace-asserted. Frontend switcher (Phase 8): Playwright-verified live against the dev server plus a clean production build.** All three fuzzer-clean (0 new divergences) with correctly scoped exclusions for the genuinely-new `entityGraph` key. No dedicated entity filings-audit round has been run as its own batch (though Batch D/E touched adjacent ground — Form 44/India-FTC, s.92E calendar). |

**The one-line honest summary, updated:** the entity side is much closer to
parity than this document's first version claimed. Feature-wise, only two
items remain open (non-corporate AMT, GILTI quantification) plus the
standing transfer-pricing scope decision. Trust-wise, the shipped phases
(5, 6, 8) already went through harness verification, structural checks,
differential fuzzing, and — for the frontend — live browser verification,
at a rigor level comparable to individual-side phases, not thinner. The
remaining gap is narrower and specific, not a general depth deficit.

---

## 2. Feature parity — current build list (input from `BUSINESS_ENTITY_ARCHITECTURE.md` §8)

Restated here so §3 can map trust work onto it 1:1. Authoritative status
lives in the source doc.

| Item | Deliverable | Status | Blocked on new fields? |
|---|---|---|---|
| Phase 0 | Fix phantom `net_profit_inr` bug + fold `guaranteed_payments_usd`/Box 14A into US income correctly | ✅ Shipped | No |
| Phase 1 (India) | Depreciation, disallowances, F&O/speculative separation, partner-firm pass-through | ✅ Shipped, all four | No |
| Phase 1 (US) | K-1 field audit, depreciation for Schedule C **and farm** (`farming_schedule_f[]`) | ✅ Shipped (DAG-only); K-1/1120 asset rows confirmed **correctly out of scope**, not merely deferred | No |
| Phase 2 | Residency & entity-type determination (India POEM/incorporation, US place-of-organization) | ✅ Shipped | No |
| Phase 3 | Domestic-vs-foreign India company rate schedule (115BAB/BAA/BA, 35% foreign schedule, MAT exemption) | ✅ Shipped | No |
| Phase 4 (India) | Presumptive lock-in disclosure, MSME-disallowance finding, s.44BBB/35AD/115V | ✅ Shipped, 3 of 4 (DAG-only) | No |
| Phase 4b (India) | Non-corporate AMT (`IN-5`) | **Confirmed still blocked** — re-investigated, not just assumed; the one candidate add-back (s.35AD) is scoped to company entities, categorically outside s.115JC's non-corporate scope | Yes — no real data overlap exists, not a build candidate |
| Phase 5 | Entity graph model + extractor (`buildEntityGraph`, `assets-nodes.js`) | ✅ Shipped, verified 867/867 | No |
| Phase 6 | Inter-entity flow edges with full `calc`/`source` traceability | ✅ Shipped, verified 890/890 | No |
| Phase 7 (US) | GILTI/Subpart-F NCTI quantification (`XB-14`) | **Not started** | **Yes** — CFC financials (E&P, QBAI, tested income) not in Layer 1 US today |
| Phase 8 | Frontend entity switcher + per-entity Filings/Documents/drill-down | ✅ Shipped, all four items, Playwright-verified live | No |
| — | Transfer pricing arm's-length computation | **Deliberately out of scope** (§3.6 of the architecture doc) | Product decision, not a build item — see §4 |

---

## 3. Trust parity — what's actually been verified, item by item

### 3.1 Function-by-function code comparison (engine vs. DAG)

**Status:** done for the entity tax core (Phase 0-3) and for Phases 5/6/8 as
they were built — each was read against its intended behavior in
`docs/BUSINESS_ENTITY_ARCHITECTURE.md` §6/§7 directly, since (unlike earlier
phases) there is no classic-engine equivalent to compare against — Phase 5's
own entry notes this plainly: *"no engine equivalent exists at all."*

**Remaining:** Phase 7, once built, needs the same discipline — but since
it's also a wholly new capability with no engine precedent, "code
comparison" there means comparing against the GILTI/§951A statute directly,
not against a prior implementation.

### 3.2 Per-boundary harness against real profiles

**Status, corrected:** `run-assets.js` — the harness covering both Phase 5
(entity graph) and Phase 6 (traceable edges) — is at **890/890**, not the
thin 3-profile count this document originally reported for `run-entitytax.js`
alone. It includes a structural check (`checkEntityGraph`) asserting, across
all 12 real fixtures, that every graph has a root, no duplicate ids, every
edge references a real entity, and (as of Phase 6) every edge carries a real
`calc`/`source` trace. A genuine bug — two entity graphs colliding on one
real subsidiary (`us_ccorp_indian_sub`) — was caught by this harness against
real fixture data before ship, not after.

**Still a real gap:** the underlying fixture set is still the same 12/13
profiles (only 3 entity-flavored) — deeper coverage would come from adding
profiles the current set doesn't have (an LLP, a standalone HUF business, a
trust, an S-corp, a partnership with guaranteed payments). This matters less
than originally stated, though, since the fuzzer (below) now runs at much
higher volume than when this document was first drafted.

### 3.3 Mechanical audit (`npm run audit:dag`)

**Status:** unaffected and clean through every entity phase — each commit's
own verification note confirms *"`npm run audit` byte-identical before/after"*
for Phases 5 and 6. Same mechanical safety net individual computation gets.

### 3.4 Differential fuzzer (`run-fuzz.js`)

**Status, corrected:** CI now runs this at **3,000 iterations per push**
(`.github/workflows/ci.yml`), not the smaller scale this document originally
cited. Phase 5 required adding `entityGraph` to `DAG_ONLY_KEYS` (it's
deliberately new, present on every profile including individual ones, with
no frozen-engine equivalent) — without that exclusion the fuzzer surfaced
289/300 false "divergences" that were really this one expected, documented
difference. Both Phase 5 and Phase 6 re-ran the fuzzer clean (0 new
divergences) after their respective changes.

**Still true:** only 3 of the 12 base fixtures are entity-flavored, so
entity-specific code still gets proportionally less exposure per run than
individual code — but at 3,000 iterations that's still on the order of
hundreds of entity-involving runs per CI push, not a thin sample.

### 3.5 Field-coverage audit

**Status:** unchanged from the original version of this document — Phase 0
functioned as a retroactive sweep after the `net_profit_inr` bug was found,
not a proactive one. No comprehensive re-sweep has run since.

**Action, unchanged:** when Phase 7 adds new CFC-financials fields to Layer 1
US, run the mechanical-extraction-plus-hand-cross-reference method from
`docs/FIELD_COVERAGE_AUDIT.md` against those fields specifically.

### 3.6 Filings/external-research audit

**Status, slightly better than originally stated:** no dedicated
entity-scoped batch has run the way Batch A (information returns) or Batch B
(treaty-position forms) did, but Batches D and E already touched adjacent
ground — Batch D fixed Form 44/India-FTC and Schedule FSI/TR false
positives, Batch E fixed a wrong s.92E (transfer-pricing reporting) calendar
date. Entity-specific forms proper (Form 1120 itself, Schedule M-1/M-2, K-1
issuance obligations, Form 5471/8865) still haven't had their own round.

**Action, unchanged:** run one dedicated batch, same method as Batches A-E,
scoped to entity/business filing triggers specifically.

---

## 4. Transfer pricing — still a decision, not a build item

Unchanged from the original version: `docs/BUSINESS_ENTITY_ARCHITECTURE.md`
§3.6 records TP as deliberately disclosure-only, since arm's-length-price
computation "genuinely isn't rule-encodable at the depth an ALP study
requires." This is a choice to affirm or deliberately revisit, not an
engineering gap — and it should stay a named, answered question rather than
an implied one inside a parity claim.

---

## 5. What's actually left

Much shorter than the original version of this list:

1. **Phase 7 — GILTI/Subpart-F quantification.** The one feature gap that's
   also a real trust gap, since it doesn't exist yet. Blocked on new Layer 1
   fields (CFC financials: E&P, QBAI, tested income) — a data-collection
   project before it's an engine project.
2. ~~**Entity-specific filings audit round** (§3.6)~~ **Run 29 Jul 2026**
   (`docs/GAP_TRACKER.md` §H.15) — Form 1120/Form 5471/Form 8865 confirmed
   already correct; Schedule L/M-1/M-2 and K-1 issuance were genuinely
   missing and are now added (13 new synthetic checks, 114 cumulative in
   `run-documents-audit.js`).
3. **Entity profile diversity** (§3.2) — real but lower-priority now that
   the fuzzer runs at 3,000 iterations; would still sharpen the hand-authored
   harness checks specifically.
4. **Transfer pricing** (§4) — a decision to make explicit, not a build item.
5. **Non-corporate AMT (Phase 4b)** — confirmed genuinely blocked on missing
   data overlap, not a queue item.
6. ~~**Fuzz/shadow safety net partially compromised by real, uncharacterized
   numeric divergences**~~ **Closed 29 Jul 2026** (`docs/GAP_TRACKER.md`
   §H.16) — all ~501/82/5 residual divergences characterized; none were new
   tax-computation bugs. `run-fuzz.js` now runs clean at 0 new divergences
   across 30,000 fuzzed profiles (10 seeds × 3,000). One genuinely new,
   real bug WAS found and fixed along the way (unrelated to the fuzz
   cleanup itself): FEIE's bona-fide-residence test granted the exclusion
   on mere dropdown selection with zero validation — fixed in both
   languages, all duplicate implementations, confirmed via `pytest`
   (589/589) and `run-js-dag-vs-py-dag.js` (0 FEIE-related mismatches
   across 323 cases).
7. **NEW, from §H.16's own closing item** — `test-adapter.mjs`,
   `test-shadow.mjs`, `run-report1.js`, `run-report2.js` still show
   residual failures, but all are now fully characterized as the exact
   same already-known divergences `run-fuzz.js` already excuses (extra
   DAG-only findings, apportionment's documented non-entity-awareness,
   the FEIE-wages class) — those 4 scripts just never got the same
   predicate/allowlist system `run-fuzz.js` has. Bounded, mechanical
   porting work, not a bug fix.
8. **NEW, from §H.16** — `run-js-dag-vs-py-dag.js`'s `computed.usTax.nra.*`
   field gap (JS DAG missing several NRA fields Python has) predates this
   session entirely and hasn't been characterized at all.

## 6. Definition of done for the parity claim

- [x] Phase 0-6, 8 — built, verified (harness + fuzzer + audit, Phase 8 also
      Playwright-verified live)
- [ ] Phase 7 (GILTI/NCTI) — Layer 1 fields added, built, harness written,
      `audit:dag`-mapped, field-coverage audit run on the new fields
- [ ] Phase 4b (non-corporate AMT) — stays blocked barring a real data change;
      not actionable today
- [x] Entity-specific filings audit round — run 29 Jul 2026, findings fixed
      (`docs/GAP_TRACKER.md` §H.15)
- [ ] Entity profile set expanded — LLP, HUF business, trust, S-corp,
      partnership-with-guaranteed-payments added to `profiles.js`
- [ ] Transfer pricing — an explicit, recorded decision either way, not a
      silent gap
- [x] Residual fuzz/`test-adapter.mjs` divergences from §H.15's
      verification pass — characterized 29 Jul 2026 (`docs/GAP_TRACKER.md`
      §H.16); none were bugs, `run-fuzz.js` itself is now fully clean
- [ ] **NEW**: port `run-fuzz.js`'s predicate/allowlist system into
      `test-adapter.mjs`/`test-shadow.mjs`/`run-report1.js`/`run-report2.js`
      so the full regression suite is clean everywhere, not just the fuzzer
- [ ] **NEW**: `run-js-dag-vs-py-dag.js`'s pre-existing `computed.usTax.nra.*`
      gap — uncharacterized

Current honest claim, updated: *"the entity side's core computation,
ownership graph, inter-entity traceability, and frontend are shipped and
verified at a rigor comparable to the individual side, and the
filings-audit round is now closed. The verification-tooling gap found
while closing it is also now closed — every residual divergence was
characterized, none were bugs, and the fuzzer runs clean at 30,000
profiles — though one real, unrelated tax bug (FEIE bona-fide-residence
validation) was found and fixed along the way. What's left is one named
feature gap (GILTI quantification, itself data-blocked), one standing
product decision (transfer pricing), and bringing the older/narrower
verification scripts up to the same standard the fuzzer now has."* Say it
because it's verified true, not because it sounds better.

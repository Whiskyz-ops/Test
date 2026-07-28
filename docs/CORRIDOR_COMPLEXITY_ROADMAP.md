# India-US Corridor — Any-Complexity Roadmap

**28 July 2026.** Records a scoping decision reached through direct product
discussion: the ambition is not "serve every jurisdiction" and not "serve
every product shape" — it is **"model any entity or individual's own tax
position, at any complexity, as long as it is connected across exactly
India and the US."** That reframing matters because it turns three
previously-separate, largely-speculative bets (serving VC/PE funds, serving
F500/unicorn-scale corporates, serving platform/FI-shaped businesses) into
one coherent, mostly-buildable roadmap plus two explicit exclusions — rather
than three parallel efforts with almost no shared infrastructure.

Companion to `docs/BUSINESS_ENTITY_ARCHITECTURE.md` (the existing entity
build this roadmap extends) and `docs/ENTITY_TRUST_PARITY_PLAN.md` (the
verification discipline every tier below inherits). This document does not
implement anything — it is the scope record, the same role
`BUSINESS_ENTITY_ARCHITECTURE.md` §3.6 already plays for the transfer-pricing
decision, extended to the new decisions below.

---

## 1. What's in, what's out, and why

**In scope:** any entity or individual whose *own* tax position can be
computed from facts connected to India and the US — an individual, a
company, a fund's GP/LP structure, or a large corporate's India-US slice —
regardless of how complex that specific relationship gets.

**Out of scope, and why corridor-locking doesn't change that:**
- **Platform/API-shaped businesses** (e.g., a global payroll platform
  classifying and withholding for workers across 150+ countries). The
  mismatch was never country count — it's that the product computes
  per-payroll-cycle withholding for millions of records via API, a
  different computation frequency and a different architecture
  (stateless, multi-tenant) from the advisor-facing dashboard this product
  is built as. Locking to one corridor doesn't change the product shape.
- **FI-regulatory-reporting-on-third-parties businesses** (e.g., a bank's
  own FATCA/CRS obligations to report on its *customers*, not its own tax
  position). This is a different question from "this institution's own
  India-US tax position" — the latter fits this roadmap the same as any
  large corporate; the former doesn't, regardless of geography, because the
  subject being modeled isn't the entity's own liability.

Both exclusions are recorded here, not left implicit, following this
project's own established pattern (`docs/BUSINESS_ENTITY_ARCHITECTURE.md`
§3.6's transfer-pricing exclusion) of naming a scope decision rather than
letting a gap go undocumented.

---

## 2. The roadmap

### Tier 1 — close what's already almost done

1. **Phase 7: GILTI/Subpart-F dollar quantification.** Blocks every
   ownership case above a certain size — individual, fund, or corporate —
   identically. Blocked on new Layer 1 CFC-financials fields (E&P, QBAI,
   tested income); see `docs/BUSINESS_ENTITY_ARCHITECTURE.md` §8.
2. **Phase 4b: non-corporate AMT.** Confirmed genuinely blocked on missing
   data overlap, not a queue item — revisit only if that changes.

### Tier 2 — scale the entity graph already built, rather than replace it

3. **Extend the entity graph from pairwise to many-to-one/one-to-many.**
   Today's graph (`assets-nodes.js`'s `buildEntityGraph`) models one owner
   → one owned entity, or two roots linked by one record. Both a fund's cap
   table (many LPs → one vehicle) and a large corporate's subsidiary tree
   (one parent → many subs) need this same generalization — build it once.
4. **Build bulk/multi-individual computation** — an expat/secondee
   population, an LP roster. Reuses the existing per-person computation;
   needs a portfolio-level view, which the Client Registry work already
   gives a head start on.

### Tier 3 — new entity types and India-US-specific logic, additive to the existing enum

5. **Fund-specific entity types**: blocker corporations, India's AIF
   Category I/II/III (s.115UB pass-through).
6. **Carried-interest characterization** (IRC §1061) for GP carry.
7. **India-US-specific transfer pricing for management fees/cost
   allocation** — the narrower, bounded question, not general ALP (which
   stays out of scope per the existing §3.6 decision).
8. **Expat tax equalization computation** (hypothetical tax, split payroll)
   for large-corporate secondees.
9. **Fund-vehicle-level FATCA/CRS classification — scoped IN, decided
   28 July 2026.** Distinct from the individual GP/LP's own FATCA exposure
   (already covered by existing individual-side modeling): whether the
   *fund entity itself* needs Financial-Institution classification and
   reporting. Explicitly added rather than left to silently drop out of
   scope the way it nearly did during this roadmap's own drafting —
   the same discipline this document exists to enforce.
10. **Third-country feeder/blocker routing (Mauritius, Singapore) —
    disclosure-only, decided 28 July 2026.** A large share of real US-LP-
    into-India fund structures route through a third-country feeder
    specifically for treaty benefits (US → Mauritius/Singapore → India),
    which is in tension with a strictly two-country model. Resolved as a
    deliberate middle ground, not a binary in/out:
    - The feeder **is** a real node in the entity graph — ownership and
      flow-tracing work end-to-end from the US LP through the feeder to
      the India portfolio company. Excluding any structure with a third
      country would fail on the *most common* real fund structure, not a
      rare one.
    - The feeder's **own domestic tax position** under Mauritius/Singapore
      law stays out of scope — disclosed, not computed. Fully modeling a
      third country's own tax code reopens the N-country generalization
      problem this whole roadmap exists to avoid.
    - A **bounded treaty-eligibility/LOB check** — is the DTAA benefit
      actually available through this specific route, given substance/
      beneficial-ownership facts already being collected — **is** in
      scope. This is a qualitative, fact-based gate structurally identical
      to the POEM/PE tests already built (§2 of
      `docs/BUSINESS_ENTITY_ARCHITECTURE.md`), not a new tax-computation
      engine.
    - Same shape of decision as the transfer-pricing exclusion: disclose
      what isn't computed, rather than faking a number or pretending the
      structure doesn't exist.

### Tier 4 — intake and trust infrastructure supporting all of the above

11. **Extend Layer 1 intake** for fund/cap-table and large-entity facts —
    additive fields inside the existing India/US schema, not a new form
    architecture.
12. **New fixture profiles** — a fund with LPs and a feeder/blocker, a
    large corporate with multiple subsidiaries and secondees — added to
    the same `profiles.js` the rest of the product already uses.
13. **Run the existing trust discipline** against each new capability as it
    lands: harness with a real pass count, differential fuzzer inclusion,
    `audit:dag` mapping, filings audit — the same sequence Phases 5/6/8
    already went through, not a lighter-weight pass because the client is
    unusual.

---

## 3. Validation before building

Nothing above should be built on spec. Per this project's own discovery
discipline (ask before building, money questions after pain is confirmed
real), each tier should be validated against real prospects — VC/PE fund
GPs/CFOs for Tier 3's fund items, large-corporate tax/mobility teams for
Tier 2/3's scale and secondment items — before committing engineering time.
This document records what "any complexity, one corridor" requires
technically; it does not assert that every tier is confirmed wanted yet.

/* ============================================================================
 * Multi-entity / entity-graph model, Tier 1 (docs/GAP_TRACKER.md section
 * H.8, 21 Jul 2026): connects two ALREADY-SEPARATE client profiles by
 * ownership — the gap the engine's own profiles.js flagged in a comment on
 * founder_indian_company ("Full entity separation arrives with multi-entity
 * Phase 1"). Before this, an individual who owns a company and the company
 * itself were two unrelated rows in the Client Portfolio with no
 * representation that one owns the other; any GILTI/Subpart-F/K-1 flow
 * between them was a bare hand-typed number on the owner's own Layer 1 form,
 * with no link to the owned entity's own (separately, already-correctly)
 * computed return.
 *
 * Tier 1 scope, deliberately: NO new tax computation. Each side keeps
 * whatever figure its own Layer 1 + engine/DAG already produces — this only
 * adds the RELATIONSHIP and renders both sides' numbers side by side so a
 * hand-entered estimate becomes visibly "linked to entity X, whose own
 * return says Y" instead of a floating, unverifiable figure. Deriving the
 * flow amount FROM the linked entity's own results (so the K-1/GILTI figure
 * stops being manual entry at all) is Tier 2 — not done here.
 *
 * This is pure client-portfolio-level data, not a tax computation the frozen
 * engine (engine/*.js) has any equivalent for — the DAG-parity/fuzzer/
 * shadow-mode discipline that governs prototypes/graph-pilot doesn't apply;
 * there is nothing to diff against. Lives in lib/ alongside
 * allClientSummaries()/allClientSummariesDag(), the same "aggregate over
 * many independent analyze() calls" shape this reuses (both already return
 * the exact same summary shape per client, so this file works unchanged
 * whichever compute source — engine or DAG — is currently active).
 *
 * engine/profiles.js is frozen, so the one seed link below can't rename
 * founder_indian_company's own hand-entered CFC label ("Nova Systems Pvt
 * Ltd", us.foreign_entities.foreign_corporations[0].corporation_name) to
 * match india_pvt_ltd's actual entity name ("Nimbus Analytics Pvt Ltd").
 * Rather than silently pretending they match, the mismatch is surfaced in
 * the link's own `note` — a realistic case in its own right: an advisor's
 * ownership-graph link (what they actually know about the client
 * relationship) and a taxpayer's own hand-typed Layer 1 entry don't always
 * agree word-for-word, and WISING does not auto-match entities by name.
 * ==========================================================================*/

export const ENTITY_LINKS = [
  {
    ownerId: "founder_indian_company",
    ownedId: "india_pvt_ltd",
    ownershipPct: 100,
    relationship: "CFC shareholder (>10% — Form 5471 / GILTI)",
    note: "founder_indian_company's own Layer 1 US lists this CFC as “Nova Systems Pvt Ltd” (foreign_entities.foreign_corporations[0], a hand-entered GILTI estimate) — linked here to the india_pvt_ltd client profile (“Nimbus Analytics Pvt Ltd”) as the entity actually on file for this ownership relationship. Confirm this is the same company before relying on the link — WISING does not auto-match entities by name, and the GILTI figure below is still the owner's own manual estimate, not derived from Nimbus Analytics' own computed India return (that derivation is Tier 2, not done yet)."
  }
];

function findSummary(id, allSummaries) {
  return (allSummaries || []).find((s) => s.id === id) || null;
}

/* Returns null when this client has no ownership links at all (the common,
 * unconnected-taxpayer case). Otherwise: { owns: [...], ownedBy: [...] },
 * each entry = the link's own fields plus `summary` (the OTHER side's
 * already-computed clientSummary row — same shape allClientSummaries[Dag]()
 * produces — or null if that id isn't a real profile). */
export function entityLinksFor(clientId, allSummaries) {
  if (!clientId) return null;
  const owns = ENTITY_LINKS.filter((l) => l.ownerId === clientId).map((l) => ({
    ...l, summary: findSummary(l.ownedId, allSummaries)
  }));
  const ownedBy = ENTITY_LINKS.filter((l) => l.ownedId === clientId).map((l) => ({
    ...l, summary: findSummary(l.ownerId, allSummaries)
  }));
  if (!owns.length && !ownedBy.length) return null;
  return { owns, ownedBy };
}

// Every id (owner or owned) that appears in the graph at all — lets the
// Client Portfolio badge which rows have a structure worth looking at,
// without resolving the full link (still cheap either way at this size, but
// keeps the intent explicit at the call site).
export function hasEntityLinks(clientId) {
  return ENTITY_LINKS.some((l) => l.ownerId === clientId || l.ownedId === clientId);
}

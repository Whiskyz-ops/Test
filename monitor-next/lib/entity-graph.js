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
 * india_pvt_ltd's own entity name (engine/profiles.js) was renamed from
 * "Nimbus Analytics Pvt Ltd" to "Nova Systems Pvt Ltd" specifically so this
 * one seed link reads as one real, name-consistent company end to end —
 * founder_indian_company's own Layer 1 US already named its GILTI-triggering
 * CFC, its unlisted-equity holding, and its promoter-buyback transactions
 * all "Nova Systems Pvt Ltd" independently of this link; india_pvt_ltd was
 * the only unrelated other profile with its own real Indian-company return,
 * so the two were reconciled to the SAME name (an explicit, one-off,
 * user-approved exception to the "engine/*.js frozen" policy that governs
 * everything else in this codebase — text-only, no computed figure changed).
 * This is still a Tier 1 link, not a verified data match: WISING doesn't
 * auto-match entities across client profiles by name or anything else — an
 * advisor asserted this relationship because she knows both clients.
 * ==========================================================================*/

export const ENTITY_LINKS = [
  {
    ownerId: "founder_indian_company",
    ownedId: "india_pvt_ltd",
    ownershipPct: 100,
    relationship: "CFC shareholder (>10% — Form 5471 / GILTI)",
    note: "Linked by the advisor from her own knowledge of the client relationship — Vikram's Layer 1 US independently names this CFC \"Nova Systems Pvt Ltd\" (foreign_entities.foreign_corporations[0]), matching india_pvt_ltd's own entity name. The GILTI figure shown on his side is still his own manual Layer 1 estimate, not derived from Nova Systems' own computed India return below (that derivation is Tier 2, not done yet)."
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

// Every client id that's owned by another client on file — used to keep an
// owned entity from also showing at the top level of a flat list (docs/
// GAP_TRACKER.md section H.10: showing it both nested AND at the top level
// read as a confusing duplicate, fixed in the Clients tab, same rule
// applies anywhere else a flat client list renders).
export function ownedEntityIds(items) {
  return new Set(items.flatMap((c) => { const l = entityLinksFor(c.id, items); return l ? l.owns.map((x) => x.ownedId) : []; }));
}

// Flattens the ownership graph into DISPLAY order for anything that needs a
// plain (non-interactive) list rather than the Clients tab's own click-to-
// expand rows — e.g. the header's client switcher. `orderedRoots` is the
// already-sorted/filtered top-level items (typically `items` with
// ownedEntityIds() results removed); each root is immediately followed by
// its owned entities, recursively, one level deeper each time, so a chain
// more than one link deep nests correctly with no caller changes. `items`
// only needs `.id` (and whatever the caller's own row rendering reads —
// `.label` at minimum); it does NOT need the full clientSummary shape, so
// this works equally well against `listProfiles()`'s lightweight
// `{id, label, story, tags}` rows (the header switcher's data) or the full
// `allClientSummaries[Dag]()` rows (the Clients tab's data). Cycle-safe
// (a `visited` id can't be re-entered), though not reachable with today's
// single seed link.
export function flattenOwnershipTree(orderedRoots, items) {
  const out = [];
  function visit(c, depth, link, visited) {
    if (visited.has(c.id)) return;
    const nextVisited = new Set(visited); nextVisited.add(c.id);
    const links = entityLinksFor(c.id, items);
    const owned = (links ? links.owns : []).filter((l) => l.summary);
    out.push({ item: c, depth, link, hasChildren: owned.length > 0 });
    owned.forEach((l) => visit(l.summary, depth + 1, l, nextVisited));
  }
  orderedRoots.forEach((c) => visit(c, 0, null, new Set()));
  return out;
}

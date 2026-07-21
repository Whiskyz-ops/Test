/* ============================================================================
 * Multi-entity / entity-graph model. Connects two ALREADY-SEPARATE client
 * profiles by ownership — the gap the engine's own profiles.js flagged in a
 * comment on founder_indian_company ("Full entity separation arrives with
 * multi-entity Phase 1"). Before Tier 1 (docs/GAP_TRACKER.md section H.8),
 * an individual who owns a company and the company itself were two
 * unrelated rows in the Client Portfolio with no representation that one
 * owns the other; any GILTI/Subpart-F/K-1 flow between them was a bare
 * hand-typed number on the owner's own Layer 1 form, with no link to the
 * owned entity's own (separately, already-correctly) computed return.
 *
 * Tier 1 scope, still true here: NO new tax computation. Each side keeps
 * whatever figure its own Layer 1 + engine/DAG already produces — this only
 * adds the RELATIONSHIP and renders both sides' numbers side by side so a
 * hand-entered estimate becomes visibly "linked to entity X, whose own
 * return says Y" instead of a floating, unverifiable figure. Deriving the
 * flow amount FROM the linked entity's own results (so the K-1/GILTI figure
 * stops being manual entry at all) is Tier 2 — not done here.
 *
 * H.12 (21 Jul 2026): links are now DISCOVERED, not hardcoded. A hand-typed
 * `ENTITY_LINKS` seed array — one hardcoded { ownerId, ownedId, ... } record
 * — used to be the only source. That meant the ONE relationship in the demo
 * data (founder_indian_company owns india_pvt_ltd) only existed because I'd
 * written it down separately from the actual Layer 1 data describing it,
 * which is exactly the "floating, unverifiable" problem this whole feature
 * exists to fix for GILTI/K-1 figures — the LINK ITSELF was floating too.
 *
 * Fixed by scanning for a real `linked_client_id` field an advisor sets
 * directly on the Layer 1 entry that already names the other entity —
 * Layer 1 US's Foreign Corporation card (`foreign_entities.
 * foreign_corporations[].linked_client_id`) and Layer 1 India's Unlisted
 * Equity card (`unlisted_equity.transactions[].linked_client_id`). This is
 * pure client-portfolio-level data, not a tax computation the frozen engine
 * (engine/*.js) has any equivalent for — the DAG-parity/fuzzer/shadow-mode
 * discipline that governs prototypes/graph-pilot doesn't apply here.
 *
 * Two data sources per profile id, same pattern lib/wising.js's
 * analyzeProfileById already established: the 12 static WISING.PROFILES
 * entries carry their own fixed india/us data, EXCEPT for whichever profile
 * id is currently `WISING.activeProfileId()` — that one's Layer 1 data may
 * have been live-edited since it was loaded, so its CURRENT localStorage
 * state (not the static profiles.js snapshot) is authoritative. Getting
 * this wrong would mean a relationship an advisor just tagged via the new
 * Layer 1 dropdown never actually shows up anywhere until a full page
 * reload re-seeds the static array — silently broken, not just untested.
 *
 * india_pvt_ltd's own entity name (engine/profiles.js) was renamed from
 * "Nimbus Analytics Pvt Ltd" to "Nova Systems Pvt Ltd" (docs/GAP_TRACKER.md
 * section H.8's follow-up) specifically so the seed link reads as one real,
 * name-consistent company end to end — an explicit, one-off, user-approved
 * exception to the "engine/*.js frozen" policy (text-only, no computed
 * figure changed). PAN/EIN were deliberately ruled out as a matching
 * signal, in either direction: a taxpayer's own PAN/EIN and the SEPARATE
 * legal entity they own always have DIFFERENT numbers by definition (a
 * company is its own registered person) — a match there would actually
 * mean a duplicate-profile data error, not an ownership relationship, a
 * genuinely different (and not built) feature.
 * ==========================================================================*/

function getWISING() {
  return typeof window !== "undefined" ? window.WISING : null;
}

function readLocalStorageJson(key) {
  try {
    const raw = typeof window !== "undefined" && window.localStorage && window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// The india/us raw data for one profile id — the static profiles.js
// snapshot, UNLESS this id is the currently-active/live-edited client, in
// which case current localStorage wins (see file header). Every consumer
// of a discovered link goes through this, so a link an advisor tags via
// the Layer 1 dropdown right now is visible immediately, not just after
// loadProfile() re-seeds the static array on next load.
function rawSideFor(profileId, W) {
  const p = (W.PROFILES || []).find((x) => x.id === profileId);
  const KEYS = (W.CONST && W.CONST.STORAGE_KEYS) || { INDIA: "wising_layer1_india_state", US: "wising_us_state" };
  const isActive = !!(W.activeProfileId && W.activeProfileId() === profileId);
  const liveIndia = isActive ? readLocalStorageJson(KEYS.INDIA) : null;
  const liveUs = isActive ? readLocalStorageJson(KEYS.US) : null;
  return {
    india: liveIndia || (p && p.india) || null,
    us: liveUs || (p && p.us) || null
  };
}

function safeGet(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

// Scans every profile's raw Layer 1 data for an explicit `linked_client_id`
// tag. Two source fields today (docs/GAP_TRACKER.md section H.12) — US
// foreign-corporation entries and India unlisted-equity transactions — each
// producing a link with a relationship label and a note explaining exactly
// which Layer 1 entry it came from, so the link is traceable back to real
// data rather than asserted out of nowhere. The SAME real-world
// relationship is often tagged on BOTH sides (an advisor fills out both
// forms for the same client) — `seen` dedupes by (ownerId, ownedId) pair,
// keeping the first source found rather than showing the same relationship
// twice. A pair can never link to itself (linked_client_id === the
// declaring profile's own id is ignored, not treated as self-ownership).
const LINK_SOURCES = [
  {
    path: "us.foreign_entities.foreign_corporations",
    relationship: "CFC shareholder (>10% — Form 5471 / GILTI)",
    ownershipPct: (entry) => Number(entry.ownership_percentage) || 0,
    entityName: (entry) => entry.corporation_name || entry.corp_name || "unnamed entity",
    noteVerb: "US foreign-corporation"
  },
  {
    path: "india.unlisted_equity.transactions",
    relationship: "Unlisted equity holding (India)",
    ownershipPct: (entry) => (entry.holding_pct != null ? Number(entry.holding_pct) : null),
    entityName: (entry) => entry.company_name || entry.company || "unnamed entity",
    noteVerb: "India unlisted-equity"
  }
];

function discoverLinks() {
  const W = getWISING();
  if (!W || !W.PROFILES) return [];
  const links = [];
  const seen = new Set();
  W.PROFILES.forEach((p) => {
    const raw = rawSideFor(p.id, W);
    LINK_SOURCES.forEach((src) => {
      const entries = safeGet(raw, src.path) || [];
      entries.forEach((entry) => {
        const ownedId = entry.linked_client_id;
        if (!ownedId || ownedId === p.id) return;
        const key = p.id + "->" + ownedId;
        if (seen.has(key)) return;
        seen.add(key);
        links.push({
          ownerId: p.id,
          ownedId: ownedId,
          ownershipPct: src.ownershipPct(entry),
          relationship: src.relationship,
          note: "Tagged directly on this client's own Layer 1 " + src.noteVerb + " entry (“" + src.entityName(entry) + "”) — not inferred, an advisor set this explicitly."
        });
      });
    });
  });
  return links;
}

function findSummary(id, allSummaries) {
  return (allSummaries || []).find((s) => s.id === id) || null;
}

/* Returns null when this client has no ownership links at all (the common,
 * unconnected-taxpayer case). Otherwise: { owns: [...], ownedBy: [...] },
 * each entry = the link's own fields plus `summary` (the OTHER side's
 * already-computed clientSummary row — same shape allClientSummaries[Dag]()
 * produces — or null if that id isn't a real profile). Re-discovers links
 * fresh on every call (cheap at this scale) rather than caching, so a link
 * tagged moments ago is never stale within the same session. */
export function entityLinksFor(clientId, allSummaries) {
  if (!clientId) return null;
  const allLinks = discoverLinks();
  const owns = allLinks.filter((l) => l.ownerId === clientId).map((l) => ({
    ...l, summary: findSummary(l.ownedId, allSummaries)
  }));
  const ownedBy = allLinks.filter((l) => l.ownedId === clientId).map((l) => ({
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
  return discoverLinks().some((l) => l.ownerId === clientId || l.ownedId === clientId);
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

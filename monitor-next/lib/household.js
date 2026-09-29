/* Spouse links on the Clients tab (docs/HOUSEHOLD_DESIGN.md step 1).
 * Each linked registry client gets c.household = {status, spouseId,
 * spouseName, errors, tier}; tier is this client's own billing tier
 * ("light" spouse profile or "full" client — decision 2, option B). */
"use client";
import "./dag/household-link.js";
import { analyzeHousehold } from "./dag/household.js";
import { analyzeDag } from "./dag-adapter";

export function attachHouseholds(summaries) {
  const W = typeof window !== "undefined" ? window.WISING : null;
  if (!W || !W.householdLink || !W.ClientRegistry || !Array.isArray(summaries)) return summaries;
  const reg = W.ClientRegistry;
  const ids = new Set(reg.list().map((c) => c.id));
  const byId = new Map(summaries.map((s) => [s.id, s]));
  const raw = (id) => Object.assign({ id }, reg.getRawState(id));
  return summaries.map((s) => {
    if (!s || !s.isRegistryClient) return s;
    const a = raw(s.id);
    const res = W.householdLink.checkHouseholdLink(a, null);
    if (!res.linked) return s;
    const b = res.spouseId && ids.has(res.spouseId) ? raw(res.spouseId) : null;
    const full = W.householdLink.checkHouseholdLink(a, b);
    const spouse = byId.get(res.spouseId);
    const spouseName = spouse ? (spouse.name && spouse.name !== "Unnamed Taxpayer" ? spouse.name : spouse.label) : "missing profile";
    return Object.assign({}, s, {
      household: { status: full.status, spouseId: full.spouseId, spouseName, errors: full.errors.map((e) => e.message), tier: W.householdLink.spouseTier(a) }
    });
  });
}

// The household calculation for one registry client (step 3): null when the
// client isn't linked to a spouse. Always runs the JS DAG (analyzeDag),
// whichever engine the Monitor is set to — the household layer exists only
// on the DAG side.
export function householdFor(clientId) {
  const W = typeof window !== "undefined" ? window.WISING : null;
  if (!W || !W.ClientRegistry || !clientId) return null;
  const reg = W.ClientRegistry;
  if (!reg.list().some((c) => c.id === clientId)) return null;
  const a = Object.assign({ id: clientId }, reg.getRawState(clientId));
  const spouseId = a.us && a.us.profile && a.us.profile.spouse_client_id;
  if (!spouseId) return null;
  const b = reg.list().some((c) => c.id === spouseId) ? Object.assign({ id: spouseId }, reg.getRawState(spouseId)) : null;
  try { return analyzeHousehold(a, b, analyzeDag); } catch (e) { return { linked: true, blocked: true, errors: [{ code: "error", message: "Household calculation failed: " + e.message }] }; }
}

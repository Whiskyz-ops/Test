/* Spouse links on the Clients tab (docs/HOUSEHOLD_DESIGN.md step 1).
 * Each linked registry client gets c.household = {status, spouseId,
 * spouseName, errors, tier}; tier is this client's own billing tier
 * ("light" spouse profile or "full" client — decision 2, option B). */
"use client";
import "./dag/household-link.js";

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

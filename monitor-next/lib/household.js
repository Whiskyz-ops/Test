/* Spouse links on the Clients tab (docs/HOUSEHOLD_DESIGN.md step 1).
 * Each linked registry client gets c.household = {status, spouseId,
 * spouseName, errors, tier}; tier is this client's own billing tier
 * ("light" spouse profile or "full" client — decision 2, option B). */
"use client";
import "./dag/household-link.js";
import "./dag/household-seed.js";
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

// Example married household (dag/household-seed.js): Rohan Mehta (the demo's
// data) and his spouse Priya as two linked registry clients in this browser.
export function addExampleHousehold() {
  const W = typeof window !== "undefined" ? window.WISING : null;
  if (!W || !W.householdSeed || !W.PROFILES) return null;
  return W.householdSeed.seedMehtaHousehold(W, window.localStorage);
}

// Reconciliation tab for a client on a linked joint return: the US side is
// the joint return (identical on both spouses' pages), the India side stays
// this client's own. Returns null when the client isn't on a clean, linked
// married-filing-jointly household.
export function householdReconFor(clientId) {
  const W = typeof window !== "undefined" ? window.WISING : null;
  if (!W || !W.ClientRegistry || !clientId) return null;
  const reg = W.ClientRegistry;
  if (!reg.list().some((c) => c.id === clientId)) return null;
  const a = Object.assign({ id: clientId }, reg.getRawState(clientId));
  const spouseId = a.us && a.us.profile && a.us.profile.spouse_client_id;
  if (!spouseId || !reg.list().some((c) => c.id === spouseId)) return null;
  const b = Object.assign({ id: spouseId }, reg.getRawState(spouseId));
  let h;
  try { h = analyzeHousehold(a, b, analyzeDag, { keepResults: true }); } catch (e) { return null; }
  return buildHouseholdRecon(h, clientId);
}

// Pure: household result (with keepResults) -> what the Reconciliation tab
// swaps in. Exported for tests.
export function buildHouseholdRecon(h, clientId) {
  if (!h || h.blocked || h.status !== "mfj" || !h._joint || !h._own) return null;
  const idx = h.spouses[0].id === clientId ? 0 : 1;
  const me = h.spouses[idx], other = h.spouses[1 - idx];
  const own = h._own[idx], joint = h._joint;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const setRow = (block, label, usd, trace) => {
    const r = block.rows.find((x) => x.label === label);
    if (r) { r.usd = usd; if (trace) r.trace = trace; }
  };
  const calc = (formula, parts) => ({ kind: "calc", formula, parts, citation: null });

  // US Form 1116 on the joint return: both spouses' Indian tax against the joint limit.
  const us = clone(joint.ftcReport.direction_us_claims_india);
  us.title = "US Form 1116 (joint return) — credit for both spouses' Indian taxes";
  const paidParts = h._own.map((r, i) => ({ label: h.spouses[i].name + " — Indian income tax (creditable)", amount: (r.computed.ftc.us.indiaTaxPaidUsd || 0) }));
  const paid = h.jointUs.indiaTaxPaidUsd, allowed = h.jointUs.ftcAllowedUsd, excess = Math.max(0, paid - allowed);
  setRow(us, "Indian income tax (creditable)", paid, calc("Each spouse's own Indian tax, from their own profile (India assesses each spouse separately)", paidParts));
  setRow(us, "FTC allowed this year", allowed, calc("Lesser of both spouses' Indian tax and the joint §904 limitation", [{ label: "Indian income tax (both spouses)", amount: paid }, { label: "FTC limitation (joint return)", amount: h.jointUs.ftcLimitUsd }]));
  setRow(us, "Excess credit carried over (§904(c))", excess);
  setRow(us, "Residual double tax (unrelieved)", excess);

  // India relief (Form 44) from this client's share of the joint US tax.
  const india = clone(own.ftcReport.direction_india_relief);
  const usTaxOnSource = me.usTaxShareUsd * me.usSourceFraction;
  setRow(india, "US tax on that US-source income", usTaxOnSource, calc(
    "This client's share of the joint US income tax (split " + h.split.methodLabel + ", method A — CA to confirm) × the US-source part of their own income",
    [{ label: "Joint US income tax", amount: h.jointUs.incomeTaxUsd }, { label: me.name + "'s share", display: Math.round(me.share * 1000) / 10 + "%" },
     { label: "Share of joint tax", amount: me.usTaxShareUsd }, { label: "US-source fraction", display: Math.round(me.usSourceFraction * 1000) / 10 + "%" }]));
  setRow(india, "§159 relief allowed (formerly s.90)", me.indiaReliefHouseholdUsd, calc("Lesser of this client's share of US tax on the income and the Indian tax on it (rule 76)",
    [{ label: "US tax on the income (share)", amount: usTaxOnSource }, { label: "Indian tax on it (cap)", amount: me.indiaReliefCapUsd }]));
  const indiaShortfall = own.computed.residency && own.computed.residency.india && own.computed.residency.india.worldwide ? Math.max(0, usTaxOnSource - me.indiaReliefHouseholdUsd) : 0;

  const usBlock = clone(joint.taxComputation.us);
  usBlock.title = "US federal income tax — joint return (" + h.spouses.map((s) => s.name).sort().join(" & ") + ")";
  const usState = joint.taxComputation.usState ? Object.assign(clone(joint.taxComputation.usState), { title: joint.taxComputation.usState.title + " — joint" }) : null;
  return {
    spouseName: other.name,
    me,
    household: h,
    incomeUs: joint.model.income.us,
    worldwideUs: !!(joint.computed.residency && joint.computed.residency.us && joint.computed.residency.us.worldwide),
    taxComputationUs: usBlock,
    taxComputationUsState: usState,
    ftcReport: { direction_us_claims_india: us, direction_india_relief: india, headlineNetDoubleTaxUsd: excess + indiaShortfall }
  };
}

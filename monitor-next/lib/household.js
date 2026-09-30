/* Spouse links on the Clients tab (docs/HOUSEHOLD_DESIGN.md step 1).
 * Each linked registry client gets c.household = {status, spouseId,
 * spouseName, errors, tier}; tier is this client's own billing tier
 * ("light" spouse profile or "full" client — decision 2, option B). */
"use client";
import "./dag/household-link.js";
import "./dag/household-seed.js";
import { analyzeHousehold } from "./dag/household.js";
import { analyzeDag } from "./dag-adapter";
import { usPaidUsd, statePaidUsd } from "./payments.js";

// Build step 4: what a linked, married-filing-jointly client's row shows —
// their own Indian tax plus their method A share of the joint US tax, and
// the share of the joint unrelieved double tax that is theirs (plus any
// Indian relief shortfall of their own). Pure; exported for tests.
export function householdSummaryFigures(h, clientId) {
  if (!h || h.blocked || h.status !== "mfj" || !h.jointUs || !h.split) return null;
  const idx = h.spouses[0].id === clientId ? 0 : 1;
  const me = h.spouses[idx];
  const jointTotal = h.jointUs.totalTaxBeforeFtcUsd || 0;
  const usShareUsd = jointTotal * (me.share || 0);
  const usResidual = Math.max(0, (h.jointUs.indiaTaxPaidUsd || 0) - (h.jointUs.ftcAllowedUsd || 0));
  const own = h._own && h._own[idx];
  const worldwideIndia = !!(own && own.computed && own.computed.residency && own.computed.residency.india && own.computed.residency.india.worldwide);
  const indiaShortfall = worldwideIndia ? Math.max(0, (me.usTaxShareUsd || 0) * (me.usSourceFraction || 0) - (me.indiaReliefHouseholdUsd || 0)) : 0;
  return {
    share: me.share || 0, usShareUsd, jointUsTotalUsd: jointTotal, indiaTaxUsd: me.indiaTaxUsd || 0,
    combinedTaxUsd: (me.indiaTaxUsd || 0) + usShareUsd,
    netDoubleTaxUsd: usResidual * (me.share || 0) + indiaShortfall
  };
}

export function attachHouseholds(summaries) {
  const W = typeof window !== "undefined" ? window.WISING : null;
  if (!W || !W.householdLink || !W.ClientRegistry || !Array.isArray(summaries)) return summaries;
  const reg = W.ClientRegistry;
  const ids = new Set(reg.list().map((c) => c.id));
  const byId = new Map(summaries.map((s) => [s.id, s]));
  const raw = (id) => Object.assign({ id }, reg.getRawState(id));
  const cache = new Map();
  return summaries.map((s) => {
    if (!s || !s.isRegistryClient) return s;
    const a = raw(s.id);
    const res = W.householdLink.checkHouseholdLink(a, null);
    if (!res.linked) {
      // Joint return without a linked spouse: inline (answered No), or a
      // missing link / unanswered question (docs/HOUSEHOLD_DESIGN.md).
      const p = (a.us && a.us.profile) || {};
      if (p.filing_status !== "mfj" || (p.tax_entity_type || "individual") !== "individual") return s;
      const answer = p.spouse_has_income_or_filings || null;
      return Object.assign({}, s, { household: {
        status: "mfj", inline: answer === "no", spouseId: null,
        spouseName: p.spouse_full_name || "spouse",
        errors: answer === "yes" ? ["The spouse has income but no spouse profile is linked."] : answer === "no" ? [] : ["The spouse question isn't answered."],
        tier: null
      } });
    }
    const b = res.spouseId && ids.has(res.spouseId) ? raw(res.spouseId) : null;
    const full = W.householdLink.checkHouseholdLink(a, b);
    const spouse = byId.get(res.spouseId);
    const spouseName = spouse ? (spouse.name && spouse.name !== "Unnamed Taxpayer" ? spouse.name : spouse.label) : "missing profile";
    // Clean joint household: the row's tax figures use the household split
    // (one calculation per couple, shared by both spouses' rows).
    let fig = null;
    if (b && !full.errors.length && full.status === "mfj") {
      const key = [a.id, b.id].sort().join("|");
      if (!cache.has(key)) {
        let h = null;
        try { h = analyzeHousehold(a, b, analyzeDag, { keepResults: true }); } catch (e) { h = null; }
        cache.set(key, h);
      }
      fig = householdSummaryFigures(cache.get(key), s.id);
    }
    let extra = {};
    if (fig) {
      const hh = cache.get([a.id, b.id].sort().join("|"));
      const own = hh._own[hh.spouses[0].id === s.id ? 0 : 1];
      const health = healthFromFindings(householdMerge(hh, own.findings, s.id), own.monitoring && own.monitoring.health);
      extra = { combinedTaxUsd: fig.combinedTaxUsd, netDoubleTaxUsd: fig.netDoubleTaxUsd, critical: health.counts.critical, warning: health.counts.warning, healthScore: health.score };
    }
    return Object.assign({}, s, extra, {
      household: { status: full.status, spouseId: full.spouseId, spouseName, errors: full.errors.map((e) => e.message), tier: W.householdLink.spouseTier(a),
        split: fig, singleProfile: fig ? { combinedTaxUsd: s.combinedTaxUsd, netDoubleTaxUsd: s.netDoubleTaxUsd } : null }
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

// Build step 4: alerts on a linked joint return. These are computed on the
// joint US return itself, so they come from the household calculation and
// show on both spouses' pages; every other alert is the person's own and
// comes from their own profile (a joint run would pool per-person items —
// e.g. a false §402(g) excess from two spouses' 401(k)s).
export const HOUSEHOLD_FINDING_IDS = new Set([
  "state_income_tax", "state_treaty_not_binding", "underpayment_2210", "niit_medicare_not_creditable",
  "ftc_gap", "ftc_available", "amt_applies"
]);

// counted: whether this spouse's health score counts the household alerts
// (only one spouse's does — see householdScorerId); countedOnName names the
// spouse whose score does, for the tag on the other page.
export function mergeHouseholdFindings(ownFindings, jointFindings, counted = true, countedOnName = null) {
  const person = (ownFindings || []).filter((f) => !HOUSEHOLD_FINDING_IDS.has(f.id)).map((f) => Object.assign({}, f, { scope: "person" }));
  const household = (jointFindings || []).filter((f) => HOUSEHOLD_FINDING_IDS.has(f.id)).map((f) => Object.assign({}, f, { scope: "household", counted, countedOnName }));
  const sev = { critical: 0, warning: 1, info: 2 };
  return person.concat(household).sort((a, b) => (sev[a.severity] - sev[b.severity]));
}

// Same formula as report-batch6-nodes.js healthAlertsMonitorResult, on the
// merged alerts; breached / about-to-breach limits (FBAR, LRS) are per person.
// Household alerts marked counted: false are shown but not counted.
export function healthFromFindings(findings, ownHealth) {
  const c = { critical: 0, warning: 0, info: 0 };
  (findings || []).forEach((f) => { if (f.counted !== false) c[f.severity] = (c[f.severity] || 0) + 1; });
  const h = ownHealth || {};
  let score = 100 - 16 * c.critical - 3 * c.warning - 8 * (h.breachedLimits || 0) - 4 * (h.willBreach || 0);
  score = Math.round(Math.min(100, Math.max(8, score)));
  const band = score >= 80 ? { label: "Healthy", color: "#10B981" } : score >= 50 ? { label: "Needs attention", color: "#D4AF37" } : { label: "At risk", color: "#ef4444" };
  return { counts: c, score, band };
}

// Which spouse's health score (and Clients-tab alert counts) carries the
// household alerts, so a couple's one joint-return problem is not counted
// twice: the spouse who holds the household items (household_items_owner
// "self" on their US profile, or "spouse" on the other's), else the lower
// client id. The alerts still show on both pages.
export function householdScorerId(h) {
  const sp = (h && h.spouses) || [];
  if (sp.length !== 2) return null;
  const owner = (i) => {
    const raw = h._own && h._own[i] && h._own[i]._raw;
    return raw && raw.us && raw.us.profile && raw.us.profile.household_items_owner;
  };
  if (owner(0) === "self" || owner(1) === "spouse") return sp[0].id;
  if (owner(1) === "self" || owner(0) === "spouse") return sp[1].id;
  return String(sp[0].id) <= String(sp[1].id) ? sp[0].id : sp[1].id;
}

function householdMerge(h, ownFindings, clientId) {
  const scorer = householdScorerId(h);
  const s = h.spouses.find((x) => x.id === scorer);
  return mergeHouseholdFindings(ownFindings, h._joint.findings, scorer === clientId, s ? s.name : null);
}

function cleanHousehold(clientId) {
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
  return h && !h.blocked && h.status === "mfj" && h._joint ? h : null;
}

// The Monitor overview for a linked joint-return client: merged, tagged
// alerts; health score and counts from them; US headline = this client's
// method A share of the joint US tax. Returns the snapshot unchanged for
// anyone else.
export function applyHouseholdToSnapshot(snap, clientId) {
  if (!snap || !snap.result) return snap;
  const h = cleanHousehold(clientId);
  if (!h) return snap;
  return householdSnapshot(snap, h, clientId);
}

// Pure part of applyHouseholdToSnapshot (exported for tests).
export function householdSnapshot(snap, h, clientId) {
  const fig = householdSummaryFigures(h, clientId);
  if (!fig) return snap;
  const r = snap.result;
  const findings = householdMerge(h, r.findings, clientId);
  const health = healthFromFindings(findings, r.monitoring && r.monitoring.health);
  const me = h.spouses[h.spouses[0].id === clientId ? 0 : 1];
  const other = h.spouses[h.spouses[0].id === clientId ? 1 : 0];
  const result = Object.assign({}, r, {
    findings,
    summary: Object.assign({}, r.summary, {
      counts: health.counts, healthScore: health.score, usTaxUsd: fig.usShareUsd, netDoubleTaxUsd: fig.netDoubleTaxUsd,
      household: { spouseName: other.name, share: fig.share, jointUsTotalUsd: fig.jointUsTotalUsd, singleProfileUsTaxUsd: r.summary && r.summary.usTaxUsd }
    }),
    monitoring: Object.assign({}, r.monitoring, { health: Object.assign({}, (r.monitoring && r.monitoring.health) || {}, { score: health.score, band: health.band }) })
  });
  // Payments on a joint return are pooled: the joint balance (joint tax
  // after the Form 1116 credit, less both spouses' withholding and estimated
  // payments), shown at this client's share like the tax itself.
  const raws = (h._own || []).map((o) => o && o._raw);
  const jointNet = Math.max(0, (h.jointUs.totalTaxBeforeFtcUsd || 0) - (h.jointUs.ftcAllowedUsd || 0));
  const pay = raws.length === 2 && raws[0] && raws[1] ? (() => {
    const paid = usPaidUsd(raws[0].us) + usPaidUsd(raws[1].us);
    return { paidUsd: paid * fig.share, balanceUsd: Math.max(0, jointNet - paid) * fig.share, jointBalanceUsd: Math.max(0, jointNet - paid) };
  })() : null;
  const countries = (snap.countries || []).map((c) => c.id !== "US" ? c : Object.assign({}, c, {
    estimatedTaxUsd: Math.round(fig.usShareUsd),
    reason: Math.round(fig.share * 100) + "% share of the joint US return with " + other.name + " (" + me.name + "'s part, method A)" +
      (pay ? "; unpaid on the joint return $" + Math.round(pay.jointBalanceUsd).toLocaleString("en-US") : "")
  }, pay ? { paidUsd: pay.paidUsd, balanceUsd: pay.balanceUsd } : {}));
  // The resident state's return is joint too (same filing status): the
  // joint state tax and both spouses' state withholding, at this client's share.
  const jointState = h._joint.taxComputation && h._joint.taxComputation.usState;
  const states = (snap.states || []).map((st) => {
    if (!jointState || st.resident === false) return st;
    const stTax = Number(jointState.totalUsd) || 0;
    const stPaid = raws.length === 2 && raws[0] && raws[1] ? statePaidUsd(raws[0].us, st.id, true) + statePaidUsd(raws[1].us, st.id, true) : null;
    return Object.assign({}, st, {
      estimatedTaxUsd: Math.round(stTax * fig.share), taxAfterCreditsUsd: stTax * fig.share,
      reason: Math.round(fig.share * 100) + "% share of the joint " + st.name + " return with " + other.name
    }, stPaid === null ? {} : { paidUsd: stPaid * fig.share, balanceUsd: Math.max(0, stTax - stPaid) * fig.share });
  });
  return Object.assign({}, snap, { result, countries, states });
}

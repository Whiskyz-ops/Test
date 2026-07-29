/* ============================================================================
 * SHADOW MODE — pure comparison core (no window / no DAG-CJS imports, so it
 * runs unchanged in the browser and under Node for test-shadow.mjs).
 *
 * The fuzzer (prototypes/graph-pilot/run-fuzz-differential.js) proved
 * engine==DAG across ~70k generated profiles, but only over a fixed MAP of
 * fields and only within the *shape* the 12 fixtures established. Shadow mode
 * closes the remaining gap: on every REAL profile the Monitor actually loads,
 * it runs both the engine (primary, shown to the user) and the DAG (silent),
 * and deep-compares the ENTIRE product surface the UI renders — recursively,
 * every field, not a hand-listed subset. Any field a real user populates that
 * the fuzzer's vocabulary never reached still gets caught here, in situ.
 *
 * compareSurface() is symmetric (union of keys on both sides) over the
 * top-level outputs both analyze() and the DAG adapter produce in identical
 * shape. `model` is compared only on the sub-objects the adapter actually
 * assembles (income/entity/meta/treaty) — the engine's model carries many
 * more internal fields no Monitor component reads, and the adapter never
 * claimed to mirror them (see lib/dag-adapter.js).
 *
 * THREE-WAY (docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 8, plan §7):
 * compareSurface()/diff() themselves needed no change to serve a second
 * pair — they already take any two analyze()-shaped results, agnostic to
 * which implementation produced them. Only `signature()` gained an explicit
 * `sourcePair` parameter (see SOURCE_PAIRS below), so an engine-vs-JS-DAG
 * divergence and an engine-vs-Python-DAG one never collapse into the same
 * deduped log entry even if they happen to look identical. lib/shadow.js is
 * where the two runners (`runShadow`/`runShadowPy`) and the persisted log
 * actually live.
 * ==========================================================================*/

// The surface shadow mode compares — every path the DAG-backed adapter
// promises to reproduce from the engine (the same contract test-adapter.mjs
// enumerates, widened to the FULL product-output objects the DAG builds
// complete via its analyzeResult node). Two groups:
//
//  SYMMETRIC — objects the DAG produces byte-for-byte the same shape as the
//  engine. Compared as a union of keys, so an extra/missing key on either side
//  is itself a divergence.
//
//  DIRECTIONAL — objects the adapter assembles from a subset of DAG nodes; the
//  engine's version carries extra internal fields no Monitor component reads.
//  Compared over only the keys the DAG produced (engine-only fields skipped —
//  they're outside the adapter's contract, not bugs).
//
// computed.indiaTax is neither: the adapter builds a small bespoke object
// (totalTaxInr/totalTaxUsd/regime/s115a + a synthetic isEntity the engine has
// no equivalent for), so it's covered by explicit engine-mirrored scalar paths
// below rather than a whole-object compare.
export const SYMMETRIC_SURFACE = [
  "findings", "documents", "ftcReport", "taxComputation", "withholding",
  "scopeNotes", "returnForms", "monitoring", "summary",
  "model.income.india", "model.income.us", "model.entity", "model.meta", "model.treaty", "model.assets",
  "computed.usTax", "computed.residency", "computed.ftc", "computed.limits",
  "computed.reconciliation", "computed.headline", "computed.apportionment",
  "computed.indiaTax.totalTaxInr", "computed.indiaTax.totalTaxUsd",
  "computed.indiaTax.regime", "computed.indiaTax.s115a"
];

export const DIRECTIONAL_SURFACE = [];

// Leaf keys the DAG adds on top of an otherwise-symmetric object, with no
// engine equivalent by design — informational annotations, not divergences
// in the underlying computation. Same category as checksRegistry (which
// stays out of SYMMETRIC_SURFACE entirely at the top level); these live
// nested inside `taxComputation` rows, so the exclusion has to be a key
// name skipped during traversal instead. "caveat": the Chapter VI-A
// deductions row's what-if warning (report-batch3-nodes.js) — fires only
// when OLD regime is in effect and every underlying deduction section is
// empty (Layer 1 India hides that whole step under NEW regime), a
// what-if-tool-only concern the engine has no override plumbing to need.
// indiaIsAop/indiaIsTrust (docs/GAP_TRACKER.md section H.6, 21 Jul 2026):
// model.entity.* additions with no engine equivalent — entitytax-nodes.js's
// file header has the full writeup.
// trustDistributedUsd/trustRetainedUsd/trustBracketBreakdown (same H.6
// family, ustax-full-nodes.js's trust branch): the engine has no concept of
// "retained vs. distributed" trust income at all (every trust taxed at
// $0 entity-level before this field existed) — new keys on computed.usTax
// that only ever appear for a trust-kind US taxpayer, so unconditionally
// skipping the key names is safe for every other profile shape too (they
// simply never appear on either side).
// entityGraph (Phase 5, docs/BUSINESS_ENTITY_ARCHITECTURE.md §6, 25 Jul
// 2026): model.assets.entityGraph is a genuinely new Entity[]/Edge[] graph
// model with no engine equivalent at all — fires on every profile (even a
// lone individual produces a one-entity graph), so it needs the same
// blanket per-key exclusion as the trust-only keys above (kept in sync with
// prototypes/graph-pilot/run-fuzz.js's own DAG_ONLY_KEYS).
// qbiWagesUsd/qbiUbiaUsd (docs/GAP_TRACKER.md item S, §199A QBI wage/UBIA
// limitation): new model.income.us structural fields with no engine
// equivalent — that item's own verification pass missed this file, so
// real users on any profile would have seen a live "shadow mismatch"
// badge for these two keys alone (discovered incidentally during the
// entity-filings-audit round). foreignSection988GainLoss/
// otherOrdinaryIncomeUs: same "structural, engine has no concept of it,
// never cascades into a dollar difference" reasoning as run-fuzz.js's own
// KNOWN_ALWAYS_DIVERGENT_PATHS entry for these two fields, applied here via
// the key-name mechanism this file already uses instead of a path list.
const DAG_ONLY_KEYS = new Set([
  "caveat", "indiaIsAop", "indiaIsTrust", "trustDistributedUsd", "trustRetainedUsd",
  "trustBracketBreakdown", "entityGraph", "qbiWagesUsd", "qbiUbiaUsd",
  "foreignSection988GainLoss", "otherOrdinaryIncomeUs",
  // §25B Saver's Credit (task #44 follow-up) — added proactively (kept in
  // sync with prototypes/graph-pilot/run-fuzz.js's own DAG_ONLY_KEYS).
  "saversCreditUsd", "saversCreditDetail"
]);

// Back-compat alias (the full path list).
export const SHADOW_SURFACE = SYMMETRIC_SURFACE.concat(DIRECTIONAL_SURFACE);

// Section D (docs/GAP_TRACKER.md, "entity-agnostic audit", 21 Jul 2026):
// DELIBERATE DAG/engine divergences for a US-entity, India-entity, or NRA
// taxpayer — the DAG is now the more-correct implementation on these
// specific paths, engine/*.js stays frozen and wrong there by explicit
// product direction. Same allowlist convention (and same root cause) as
// prototypes/graph-pilot/run-fuzz.js's KNOWN_US_ENTITY_DIVERGENT_PATHS —
// see that file's header for the full writeup. Gated strictly on the
// profile's actual taxpayer shape, checked against model.entity/computed.
// usTax.isNra on the engine side (the ground-truth classification both
// sides are separately asserted to agree on elsewhere).
const KNOWN_US_ENTITY_PATHS = [
  "computed.headline.totalIncomeUsd", "computed.ftc.india", "taxComputation.us", "summary.totalIncomeUsd",
  "summary.healthScore", "summary.counts", "monitoring.health.score",
  "computed.usTax.foreignSourceIncomeUsd", "computed.usTax.usSourceIncomeUsd", "computed.apportionment",
  "ftcReport.direction_india_relief"
];
const KNOWN_INDIA_ENTITY_PATHS = ["taxComputation.india"];
const KNOWN_NRA_PATHS = ["computed.ftc.india", "ftcReport.direction_india_relief"];
// India AOP/BOI and Trust/NGO/Political Party (docs/GAP_TRACKER.md section
// H.6, 21 Jul 2026) — a WIDER divergence than the company/firm case above:
// company/firm were already correctly entity-routed in the engine (only
// their trace had a display bug), but AOP/Trust were previously taxed as a
// plain INDIVIDUAL by the engine — a real amount bug whose fix cascades
// into nearly everything India-tax-derived. Same allowlist as
// prototypes/graph-pilot/run-fuzz.js's KNOWN_INDIA_AOP_TRUST_DIVERGENT_PATHS
// — keep both lists in sync. Verified empirically (a synthetic India-Trust
// and India-AOP profile each produced ~55-60 divergences across exactly
// these paths before this fix, with no engine equivalent to reconcile them
// against — this is the DAG being newly correct, not a bug to close).
const KNOWN_INDIA_AOP_TRUST_PATHS = [
  "model.entity.isBusiness", "model.entity.indiaReturnForm", "model.assets",
  "computed.indiaTax", "computed.ftc", "computed.headline", "computed.reconciliation",
  "taxComputation.india", "ftcReport", "withholding", "monitoring",
  "summary.indiaTaxUsd", "summary.netDoubleTaxUsd", "summary.healthScore", "summary.counts",
  "documents", "scopeNotes", "returnForms", "findings"
];
// US Trust (same H.6 family): computed.usTax.taxableIncomeUsd now correctly
// narrows to JUST the retained (undistributed) portion — the engine's
// version reflects the full distributed+retained total, since it has no
// concept of "retained" at all (see ustax-full-nodes.js's usEntityResult
// trust branch, and the DAG_ONLY_KEYS entries above for its 3 new detail
// fields). Cascades into computed.ftc.us.taxableIncomeUsd and the "US
// claims India" FTC direction; filingStatus also carries a new
// retained-vs-distributed qualifier the engine's static string never had.
// ADDITIVE to KNOWN_US_ENTITY_PATHS above, not a replacement — a US trust
// is also a usEntity and gets both sets excused. Same allowlist as
// run-fuzz.js's KNOWN_US_TRUST_DIVERGENT_PATHS — keep both lists in sync.
const KNOWN_US_TRUST_PATHS = [
  "computed.usTax.filingStatus", "computed.usTax.taxableIncomeUsd",
  "computed.ftc.us.taxableIncomeUsd", "ftcReport.direction_us_claims_india"
];
function pathMatchesKnown(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(prefix + ".") || path.startsWith(prefix + "["));
}

// Relative+absolute float tolerance — the engine and DAG do the same
// arithmetic but occasionally in a different associative order (e.g. summing
// a quarter-merged slice), so bit-exact equality would flag noise, not bugs.
const ABS_EPS = 1e-6;
const REL_EPS = 1e-9;

export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

function describe(v) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (Array.isArray(v)) return "array[" + v.length + "]";
  if (v instanceof Date) return "Date(" + (isNaN(+v) ? "invalid" : v.toISOString()) + ")";
  if (typeof v === "object") return "object{" + Object.keys(v).length + "}";
  if (typeof v === "string") return JSON.stringify(v.length > 60 ? v.slice(0, 57) + "…" : v);
  return String(v);
}

/* Recursively collect every point where engine and DAG disagree. Each entry:
 * { path, engine, dag } with values already reduced to a compact printable.
 * directional=true compares only keys the DAG (dag) side actually carries —
 * engine-only object keys are skipped (used for the assembled model/computed;
 * see DIRECTIONAL_SURFACE). It does NOT relax array-length or value checks. */
export function diff(path, eng, dag, out, directional) {
  // Dates — compare by epoch; two both-invalid Dates agree (a degenerate
  // base year can make BOTH sides Invalid Date, which is agreement, not a bug —
  // the fuzzer hit exactly this).
  if (eng instanceof Date || dag instanceof Date) {
    const et = +new Date(eng), dt = +new Date(dag);
    if (!(isNaN(et) && isNaN(dt)) && et !== dt) out.push({ path, engine: describe(eng), dag: describe(dag) });
    return;
  }
  if (typeof eng === "number" && typeof dag === "number") {
    if (isNaN(eng) && isNaN(dag)) return;
    const tol = ABS_EPS + REL_EPS * Math.max(Math.abs(eng), Math.abs(dag));
    if (!(Math.abs(eng - dag) <= tol)) out.push({ path, engine: eng, dag: dag });
    return;
  }
  if (eng === dag) return;
  // undefined ≡ null: both mean "no value". The engine and the adapter
  // legitimately differ on which they use for an absent field (e.g. the
  // adapter coerces computed.indiaTax.s115a to null where the engine leaves it
  // undefined). This relaxes ONLY nullish-vs-nullish; null-vs-0, null-vs-object
  // and every other pairing still diverges.
  if (eng == null && dag == null) return;
  if (eng == null || dag == null || typeof eng !== "object" || typeof dag !== "object") {
    out.push({ path, engine: describe(eng), dag: describe(dag) });
    return;
  }
  const ea = Array.isArray(eng), da = Array.isArray(dag);
  if (ea || da) {
    if (!ea || !da) { out.push({ path, engine: describe(eng), dag: describe(dag) }); return; }
    if (eng.length !== dag.length) out.push({ path: path + ".length", engine: eng.length, dag: dag.length });
    const n = Math.min(eng.length, dag.length);
    for (let i = 0; i < n; i++) diff(path + "[" + i + "]", eng[i], dag[i], out, directional);
    return;
  }
  // directional: walk only keys the DAG produced; symmetric: the union.
  const keys = directional ? Object.keys(dag) : new Set([...Object.keys(eng), ...Object.keys(dag)]);
  for (const k of keys) {
    if (DAG_ONLY_KEYS.has(k)) continue;
    diff(path ? path + "." + k : k, eng[k], dag[k], out, directional);
  }
}

/* Compare the two analyze()-shaped results: symmetric over the product-surface
 * outputs, directional over the assembled model/computed. Returns [] when they
 * agree (within float tolerance). */
export function compareSurface(engineResult, dagResult) {
  const entity = engineResult && engineResult.model && engineResult.model.entity;
  const usEntity = !!(entity && ["ccorp", "scorp", "partnership", "trust"].includes(entity.usKind));
  const usTrust = !!(entity && entity.usKind === "trust");
  // India company/firm: narrow divergence (only the trace's "₹NaN" display
  // bug). AOP/Trust: a WIDER divergence (a real amount bug the engine never
  // had a fix for) — kept as separate flags/allowlists, not merged, so the
  // narrow company/firm case never accidentally inherits the AOP/Trust
  // cascade's much larger excuse list.
  const indiaEntity = !!(entity && (entity.indiaIsCompany || entity.indiaIsFirm));
  // indiaIsAop/indiaIsTrust exist ONLY on the DAG's model.entity (that's
  // exactly why they're in DAG_ONLY_KEYS above) — the engine has no such
  // fields at all, so reading them off engineResult would always read
  // undefined and this gate would never fire. Read the DAG's own entity
  // classification instead; it's the one side that actually carries it.
  const dagEntity = dagResult && dagResult.model && dagResult.model.entity;
  const indiaAopOrTrust = !!(dagEntity && (dagEntity.indiaIsAop || dagEntity.indiaIsTrust));
  const nra = !!(engineResult && engineResult.computed && engineResult.computed.usTax && engineResult.computed.usTax.isNra === true);

  // findings: a US entity drops underpayment_2210 (agg10-nodes.js's
  // us1ShouldFire override, section D) — array-index-diff every OTHER
  // finding after that position if left in place, so it's filtered out of
  // both sides before diffing rather than caught by the path-prefix
  // allowlist below (which can't repair an index shift).
  let eng = engineResult, dag = dagResult;
  if (usEntity && Array.isArray(engineResult && engineResult.findings) && Array.isArray(dagResult && dagResult.findings)) {
    // us_entity_state_tax(_not_modeled) (docs/GAP_TRACKER.md section H.7,
    // Phase 2, 21 Jul 2026): new DAG-only finding, no engine equivalent —
    // same filter-before-diff treatment as underpayment_2210 above.
    const dropEntityOnlyIds = (f) => f.id !== "underpayment_2210" && f.id !== "us_entity_state_tax" && f.id !== "us_entity_state_tax_not_modeled";
    eng = { ...engineResult, findings: engineResult.findings.filter(dropEntityOnlyIds) };
    dag = { ...dagResult, findings: dagResult.findings.filter(dropEntityOnlyIds) };
  }

  // form_nj1040 (docs/GAP_TRACKER.md section H.7, 21 Jul 2026) and form_8858
  // (section H.13, 22 Jul 2026): new DAG-only documents, no engine
  // equivalent for either — stripped from both the documents list and the
  // calendar's bundled docIds, same convention as run-fuzz.js's assembleDag().
  const DAG_ONLY_DOC_IDS = ["form_nj1040", "form_8858", "form_3520a", "form_29b", "form_10iea", "form_10ic", "form_10id", "schedule_m1_m2", "k1_issuance", "form_8880"];
  if (Array.isArray(dag && dag.documents)) {
    const droppedRequiredCount = dag.documents.filter((x) => DAG_ONLY_DOC_IDS.includes(x.id) && x.required).length;
    dag = { ...dag, documents: dag.documents.filter((x) => !DAG_ONLY_DOC_IDS.includes(x.id)) };
    // summary.requiredDocs is a DAG-computed count baked in report-batch5-
    // nodes.js from the UN-stripped buildDocumentsResult — adjust it the
    // same amount the documents-array strip above just removed, so this
    // known, deliberate divergence doesn't also show up as a fake mismatch
    // in the derived count.
    if (droppedRequiredCount > 0 && dag.summary && typeof dag.summary.requiredDocs === "number") {
      dag = { ...dag, summary: { ...dag.summary, requiredDocs: dag.summary.requiredDocs - droppedRequiredCount } };
    }
  }
  if (dag && dag.monitoring && dag.monitoring.calendar) {
    const stripNj1040 = (row) => Array.isArray(row.docIds) ? { ...row, docIds: row.docIds.filter((id) => !DAG_ONLY_DOC_IDS.includes(id)) } : row;
    dag = {
      ...dag,
      monitoring: {
        ...dag.monitoring,
        calendar: {
          ...dag.monitoring.calendar,
          all: dag.monitoring.calendar.all.map(stripNj1040),
          upcoming: dag.monitoring.calendar.upcoming.map(stripNj1040),
          next: dag.monitoring.calendar.next ? stripNj1040(dag.monitoring.calendar.next) : dag.monitoring.calendar.next
        }
      }
    };
  }

  const raw = [];
  for (const p of SYMMETRIC_SURFACE) diff(p, getPath(eng, p), getPath(dag, p), raw, false);
  for (const p of DIRECTIONAL_SURFACE) diff(p, getPath(eng, p), getPath(dag, p), raw, true);

  const allowedPaths = []
    .concat(usEntity ? KNOWN_US_ENTITY_PATHS : [])
    .concat(usTrust ? KNOWN_US_TRUST_PATHS : [])
    .concat(indiaEntity ? KNOWN_INDIA_ENTITY_PATHS : [])
    .concat(indiaAopOrTrust ? KNOWN_INDIA_AOP_TRUST_PATHS : [])
    .concat(nra ? KNOWN_NRA_PATHS : []);
  if (!allowedPaths.length) return raw;
  return raw.filter((d) => !pathMatchesKnown(d.path, allowedPaths));
}

// Distinguishes which two implementations a comparison ran between — plan
// §7's own "tagged source_pair: engine_vs_py_dag" language. compareSurface()
// itself needs no change to serve a second pair: it already takes any two
// analyze()-shaped results, whichever produced them (the JS DAG and the
// Python DAG are independent ports of the exact same source and share the
// exact same catalogued divergences from the engine — confirmed directly,
// prototypes/graph-pilot/run-js-dag-vs-py-dag.js — so every allowlist above
// applies unchanged to either pair).
export const SOURCE_PAIRS = {
  ENGINE_VS_JS_DAG: "engine_vs_js_dag",
  ENGINE_VS_PY_DAG: "engine_vs_py_dag"
};

// A stable signature for a set of divergences, so repeated loads of the same
// profile collapse to one logged event instead of growing the log unbounded.
// sourcePair is part of the key: an engine-vs-JS-DAG divergence and an
// otherwise-identical-looking engine-vs-Python-DAG one on the same profile
// are two distinct findings (different implementations), never collapsed
// into a single logged entry.
export function signature(sourcePair, source, divergences) {
  return sourcePair + "|" + source + "|" + divergences
    .map((d) => d.path + "=" + JSON.stringify(d.engine) + "/" + JSON.stringify(d.dag))
    .sort()
    .join(";");
}

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
  "model.income.india", "model.income.us", "model.entity", "model.meta", "model.treaty",
  "computed.usTax", "computed.residency", "computed.ftc", "computed.limits",
  "computed.reconciliation", "computed.headline", "computed.apportionment",
  "computed.indiaTax.totalTaxInr", "computed.indiaTax.totalTaxUsd",
  "computed.indiaTax.regime", "computed.indiaTax.s115a"
];

export const DIRECTIONAL_SURFACE = [];

// Back-compat alias (the full path list).
export const SHADOW_SURFACE = SYMMETRIC_SURFACE.concat(DIRECTIONAL_SURFACE);

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
  for (const k of keys) diff(path ? path + "." + k : k, eng[k], dag[k], out, directional);
}

/* Compare the two analyze()-shaped results: symmetric over the product-surface
 * outputs, directional over the assembled model/computed. Returns [] when they
 * agree (within float tolerance). */
export function compareSurface(engineResult, dagResult) {
  const out = [];
  for (const p of SYMMETRIC_SURFACE) diff(p, getPath(engineResult, p), getPath(dagResult, p), out, false);
  for (const p of DIRECTIONAL_SURFACE) diff(p, getPath(engineResult, p), getPath(dagResult, p), out, true);
  return out;
}

// A stable signature for a set of divergences, so repeated loads of the same
// profile collapse to one logged event instead of growing the log unbounded.
export function signature(source, divergences) {
  return source + "|" + divergences
    .map((d) => d.path + "=" + JSON.stringify(d.engine) + "/" + JSON.stringify(d.dag))
    .sort()
    .join(";");
}

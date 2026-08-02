/* ============================================================================
 * Node validation for shadow mode's comparison core (lib/shadow-core.js).
 *
 *  1. POSITIVE: over SAMPLE + all 11 profiles, run the engine and the DAG with
 *     a single pinned asOf and assert compareSurface() reports ZERO divergences
 *     — the same parity the fuzzer proves, but here via the FULL recursive
 *     surface compare shadow mode ships (not a hand-listed MAP), so it also
 *     validates the deep-diff (Dates, floats, arrays) against real results.
 *
 *  2. NEGATIVE (self-test): plant a divergence in a cloned DAG result and
 *     assert compareSurface() catches it — proving the comparator can actually
 *     detect a mismatch, so a green run means agreement, not a broken diff.
 * ==========================================================================*/
globalThis.window = globalThis;
await import("./lib/engine/constants.js");
await import("./lib/engine/normalize.js");
await import("./lib/engine/computation.js");
await import("./lib/engine/monitoring.js");
await import("./lib/engine/conflicts.js");
await import("./lib/engine/sample-data.js");
await import("./lib/engine/profiles.js");
const WISING = globalThis.WISING;
const { analyzeDag } = await import("./lib/dag-adapter.js");
const { compareSurface, diff } = await import("./lib/shadow-core.js");

let fails = 0;
const ASOF = Date.UTC(2026, 6, 15, 12, 0, 0); // pinned "now" for both sides

function runPair(opts) {
  const eng = WISING.analyze(Object.assign({}, opts, { asOf: new Date(ASOF) }));
  const dag = analyzeDag(Object.assign({}, opts, { monitorAsOf: ASOF }));
  return { eng, dag };
}

console.log("=== POSITIVE: engine ⇔ DAG full-surface parity (pinned asOf) ===");
const cases = [{ id: "SAMPLE", ...WISING.SAMPLE }].concat(
  WISING.PROFILES.map((p) => ({ id: p.id, router: p.router, india: p.india, us: p.us }))
);
for (const c of cases) {
  const { eng, dag } = runPair({ router: c.router, india: c.india, us: c.us });
  const divs = compareSurface(eng, dag, { router: c.router, india: c.india, us: c.us });
  if (divs.length) {
    fails++;
    console.log("FAIL " + c.id + " — " + divs.length + " divergence(s):");
    divs.slice(0, 8).forEach((d) => console.log("    " + d.path + ": engine=" + JSON.stringify(d.engine) + " dag=" + JSON.stringify(d.dag)));
  } else {
    console.log("  ok - " + c.id + "  (surface identical)");
  }
}

console.log("\n=== NEGATIVE: planted divergence must be detected ===");
{
  const { eng, dag } = runPair({ router: WISING.SAMPLE.router, india: WISING.SAMPLE.india, us: WISING.SAMPLE.us });
  // deep clone the DAG result and corrupt one nested numeric field.
  // summary.totalIncomeUsd, not summary.healthScore: SAMPLE's own DAG
  // findings legitimately carry one catalogued extra ID (lrs_investment_tcs,
  // KNOWN_EXTRA_FINDING_IDS), so CASCADE_ONLY_PATHS (summary.healthScore/
  // counts, monitoring.health/alerts) is genuinely excused for SAMPLE
  // regardless of this plant — the same "over-excuse rather than
  // under-excuse" tradeoff run-fuzz.js's own CASCADE_ONLY_PATHS accepts, not
  // a hole in the comparator. totalIncomeUsd isn't cascade-gated at all, so
  // it stays a clean self-test of "can this comparator catch ANY divergence."
  const broken = JSON.parse(JSON.stringify(dag));
  broken.summary.totalIncomeUsd = (dag.summary.totalIncomeUsd || 0) + 777;
  const divs = compareSurface(eng, broken);
  const caught = divs.some((d) => d.path.indexOf("summary.totalIncomeUsd") >= 0);
  if (caught) console.log("  ok - planted summary.totalIncomeUsd divergence detected (" + divs.length + " total)");
  else { fails++; console.log("FAIL - planted divergence NOT detected"); }

  // and a planted array-length divergence
  const broken2 = JSON.parse(JSON.stringify(dag));
  broken2.findings.push({ id: "planted_fake_finding", severity: "info" });
  const divs2 = compareSurface(eng, broken2);
  const caught2 = divs2.some((d) => d.path.indexOf("findings") >= 0);
  if (caught2) console.log("  ok - planted extra finding detected");
  else { fails++; console.log("FAIL - planted array divergence NOT detected"); }
}

console.log("\n=== unit: float tolerance & Date handling ===");
{
  const t = [];
  diff("x", 100.0000001, 100.0000002, t); // within tol
  if (t.length === 0) console.log("  ok - near-equal floats treated as agreement");
  else { fails++; console.log("FAIL - float tolerance too tight", t); }

  const t2 = [];
  diff("x", 100, 101, t2); // real gap
  if (t2.length === 1) console.log("  ok - genuine float gap flagged");
  else { fails++; console.log("FAIL - genuine float gap missed"); }

  const t3 = [];
  diff("d", new Date(NaN), new Date(NaN), t3); // both invalid = agreement
  if (t3.length === 0) console.log("  ok - both-invalid Dates treated as agreement");
  else { fails++; console.log("FAIL - both-invalid Dates flagged", t3); }

  const t4 = [];
  diff("d", new Date(ASOF), new Date(ASOF + 1000), t4); // 1s apart
  if (t4.length === 1) console.log("  ok - differing Dates flagged");
  else { fails++; console.log("FAIL - differing Dates missed"); }
}

console.log("\n" + (fails === 0 ? "ALL SHADOW TESTS PASSED" : fails + " SHADOW TEST(S) FAILED"));
process.exit(fails > 0 ? 1 : 0);

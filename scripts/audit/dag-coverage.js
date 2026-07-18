"use strict";
/* ============================================================================
 * DAG coverage diff — engine/*.js  vs  prototypes/graph-pilot/*-nodes.js
 *
 * The mechanical companion to docs/DAG_MIGRATION_TRACKER.md (closes its own
 * SYS-2 row). Three independent comparisons, all derived from source, none
 * from the tracker's prose:
 *
 *   1. FIELD-PATH DIFF — every quoted safe(...) path and every snake_case
 *      property read in each engine function, checked against the token set
 *      of the DAG file(s) the tracker maps that function to. A function the
 *      tracker marks ✅ ported must have ZERO missing tokens — any hit there
 *      is an UNEXPECTED gap (either a real porting hole or a stale tracker
 *      row) and fails the run. Functions marked ❌/🔶/📝 are expected to
 *      miss; their full missing-path lists are printed as the definitive
 *      "everything in the engine but not in the DAG" inventory.
 *
 *   2. FINDING-ID DIFF — every add("id", ...) in conflicts.js vs the finding
 *      IDs the DAG actually implements.
 *
 *   3. NUMERIC-DRIFT CHECK — every significant numeric literal in the DAG's
 *      hand-copied constant tables, checked for membership in the engine's
 *      own numeric universe. The DAG does not import engine/constants.js
 *      (tracker SYS-1), so after any engine-side rate/threshold edit the
 *      DAG's stale copy stops matching and shows up here.
 *
 *   4. FUNCTION INVENTORY — any top-level engine function not present in
 *      this script's tracker mapping fails the run: new engine code cannot
 *      silently appear without the migration tracker hearing about it.
 *
 * Exit code 1 on: unexpected gaps in ✅ functions, untracked engine
 * functions, or numeric drift. Tracked gaps alone exit 0 (they're known).
 * Run: npm run audit:dag
 * ==========================================================================*/
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..", "..");

/* ---- tracker mapping: engine function -> { row, status, dagFiles } -------
 * status: "ported" (✅ — zero missing tokens expected), "boundary" (🔶),
 * "scoped-out" (📝), "missing" (❌), "util" (helpers with no tax logic).
 * dagFiles: which node files the port lives in ("*" = check against all —
 * used for non-ported rows so partial touches anywhere still count). */
var NODE_FILES = [
  "aggregateindiaincome-nodes.js", "aggregateusincome-nodes.js",
  "entitytax-nodes.js", "in1-nodes.js", "in1-nodes-v2.js", "in1-nodes-v3.js",
  "india-tax-combined-nodes.js", "scope-nodes.js", "us1-nodes.js",
  "us5-nodes.js", "ustax-nodes.js", "xb7-nodes.js"
];
function m(row, status, dagFiles, knownMissing) { return { row: row, status: status, dagFiles: dagFiles || ["*"], knownMissing: knownMissing || [] }; }
var MAP = {
  "normalize.js": {
    num: m("util", "util"), inrToUsd: m("util", "util"), usdToInr: m("util", "util"),
    moneyFromInr: m("util", "util"), moneyFromUsd: m("util", "util"), addMoney: m("util", "util"),
    zeroMoney: m("util", "util"), calc: m("util", "util"), source: m("util", "util"),
    safe: m("util", "util"), normalizeFilingStatus: m("util", "util"),
    loadRawStates: m("AGG-10", "boundary"),
    indiaAnnualSlice: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js", "aggregateusincome-nodes.js"]),
    presumptiveCeilingInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    presumptiveResidencyEligible: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    isUnder180DaysAdditionInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    computeAssetBlockNormalDepreciationInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    additionalDepreciationEligibleInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    computeAssetBlockAdditionalDepreciationInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    aggregateEntryDepreciationInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    computeMsmeDisallowanceInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    aggregateEntryDisallowancesInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    usesRegularBooksInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    computeBusinessEntryNetProfitInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    computeGoodsVehiclePresumptiveInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    businessEntryIncomeTrace: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    /* AGG-1 knownMissing (found by this script's first run, 19 Jul 2026 —
     * see tracker AGG-1 Detail): three side-channel outputs the income-total
     * port skipped because run-aggregateindiaincome.js's 165 checks cover
     * income figures, not metadata fields. Each feeds a downstream consumer
     * that is itself unported, which is how they stayed invisible:
     *   agricultural_income_inr  -> inc.agriculturalIncomeInr -> computeIndiaItrForm (XBR-6) ITR-1 disqualifier
     *   unexplained_income_115BBE_inr -> inc.unexplained115bbeInr -> s115bbe_unexplained_income finding (CFL-6)
     *   original_acquisition_date/buyback_date/company_name/asset_name_or_ticker
     *     -> inc.holdingPeriodMismatches[] -> holding_period_mismatch_ finding (CFL-6)
     * Remove an entry here ONLY when the DAG actually ports it. */
    aggregateIndiaIncome: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"],
      ["agricultural_income_inr", "unexplained_income_115BBE_inr",
       "original_acquisition_date", "buyback_date", "company_name", "asset_name_or_ticker"]),
    s80eeaEeCapInr: m("AGG-2", "ported", ["in1-nodes-v3.js"]),
    aggregateIndiaDeductions: m("AGG-2", "ported", ["in1-nodes-v3.js"]),
    computeSelfEmploymentNetProfitUsd: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    selfEmploymentNetProfitUsd: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    selfEmploymentIncomeTrace: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    computeSelfEmploymentDepreciationPlan: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    assetRecoveryYearN: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    straightLineYear1FractionInr: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    computeAssetDepreciationUsd: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    aggregateAssetDepreciationUsd: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    k1PassiveIncomeUsd: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    aggregateUsIncome: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    aggregateUsDeductions: m("AGG-4", "ported", ["ustax-nodes.js"]),
    aggregateEquityComp: m("AGG-9", "missing"),
    aggregateAccounts: m("AGG-5", "boundary"),
    aggregateTaxesPaid: m("AGG-6", "missing"),
    computeLrsTcs: m("AGG-8", "missing"),
    aggregateWithholdingDetail: m("AGG-7", "missing"),
    normalize: m("AGG-10", "boundary")
  },
  "computation.js": {
    bracketTax: m("TAX-6", "ported", ["ustax-nodes.js", "in1-nodes-v3.js"]),
    computeSaltCap: m("TAX-6", "ported", ["ustax-nodes.js"]),
    computeSsTaxableUsd: m("TAX-6", "ported", ["ustax-nodes.js"]),
    bracketBreakdown: m("TAX-6", "ported", ["ustax-nodes.js", "in1-nodes-v3.js"]),
    computeLossSetOff: m("TAX-3", "ported", ["in1-nodes-v3.js"]),
    computeIndiaTax: m("TAX-1", "ported", ["in1-nodes-v3.js"]),
    /* TAX-1 knownMissing: the DAG's local computeS115aStream returns only
     * {totalInr, taxInr} — the engine's also builds a per-election detail
     * array (article/rates/docs facts, incl. e.treaty_article) consumed by
     * display/withholding layers (CFL-7, unported). Tax figures match;
     * the elections[] metadata does not exist DAG-side. */
    computeS115aStream: m("TAX-1", "ported", ["in1-nodes-v3.js"], ["treaty_article"]),
    computeNrInterestTreatment: m("TAX-1", "ported", ["in1-nodes-v3.js"], ["treaty_article"]),
    computeIndiaEntityTax: m("TAX-2", "ported", ["entitytax-nodes.js"]),
    computeIndiaSurcharge: m("TAX-3", "ported", ["in1-nodes-v3.js"]),
    feieEligibility: m("TAX-6", "ported", ["ustax-nodes.js"]),
    computeUsTax: m("TAX-5", "ported", ["ustax-nodes.js"]),
    computeUsStateTax: m("TAX-9", "missing"),
    computeNraTax: m("TAX-8", "scoped-out"),
    computeUsEntityTax: m("TAX-7", "scoped-out"),
    resolveResidency: m("XBR-1", "boundary"),
    computeFtc: m("XBR-2", "missing"),
    mapDoubleTaxedIncome: m("XBR-3", "missing"),
    computeLimits: m("LIM-1..6", "boundary"),
    crossBasis: m("XBR-4", "missing"),
    computeApportionment: m("XBR-5", "missing"),
    computeIndiaItrForm: m("XBR-6", "missing"),
    compute: m("TAX-10", "missing")
  },
  "monitoring.js": {
    addDays: m("util", "util"), fmtDate: m("util", "util"),
    daysBetween: m("util", "util"), clamp: m("util", "util"),
    monitor: m("LIM-7", "missing")
  },
  "conflicts.js": {
    usd: m("util", "util"), inr: m("util", "util"),
    usFtcForm: m("CFL-7", "missing"), describeTieBreak: m("CFL-7", "missing"),
    detectConflicts: m("CFL-1..6", "boundary"),
    indiaBusinessTurnoverInr: m("CFL-7", "missing"),
    buildDocuments: m("CFL-7", "missing"),
    calc: m("util", "util"), source: m("util", "util"), holdings: m("util", "util"),
    bracketParts: m("CFL-7", "missing"), s115aParts: m("CFL-7", "missing"),
    nrInterestParts: m("CFL-7", "missing"),
    buildFtcReport: m("CFL-7", "missing"),
    buildTaxComputation: m("CFL-7", "missing"),
    buildWithholdingSummary: m("CFL-7", "missing"),
    buildScopeNotes: m("CFL-7", "missing"),
    buildReturnFormDetermination: m("CFL-7", "missing"),
    analyze: m("CFL-7", "missing")
  }
};

/* Finding IDs the DAG implements today (tracker CFL-1..5). */
var DAG_FINDING_IDS = {
  india_advance_tax_interest: "in1-nodes*.js",
  underpayment_2210: "us1-nodes.js",
  early_withdrawal_penalty_72t: "us5-nodes.js",
  black_money_act_exposure: "xb7-nodes.js",
  schedule_fa_inconsistent: "xb7-nodes.js (shared node)"
};

/* ---- comment-aware line reader ------------------------------------------ */
function codeLines(file) {
  var raw = fs.readFileSync(file, "utf8").split("\n");
  var out = [], inBlock = false;
  for (var i = 0; i < raw.length; i++) {
    var line = raw[i];
    if (inBlock) {
      var end = line.indexOf("*/");
      if (end === -1) { out.push(""); continue; }
      line = line.slice(end + 2); inBlock = false;
    }
    var start;
    while ((start = line.indexOf("/*")) !== -1) {
      var close = line.indexOf("*/", start + 2);
      if (close === -1) { line = line.slice(0, start); inBlock = true; break; }
      line = line.slice(0, start) + line.slice(close + 2);
    }
    var slash = line.indexOf("//");
    if (slash !== -1) line = line.slice(0, slash);
    out.push(line);
  }
  return out;
}

/* ---- DAG token sets ------------------------------------------------------ */
var dagTokens = {};       // file -> Set of word tokens
var dagAll = new Set();
NODE_FILES.forEach(function (f) {
  var set = new Set();
  codeLines(path.join(ROOT, "prototypes", "graph-pilot", f)).forEach(function (line) {
    (line.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []).forEach(function (t) { set.add(t); dagAll.add(t); });
    // Quoted safe() paths too: identifier tokenizing alone can't represent a
    // segment that starts with a digit (the real "401k_distributions_usd"
    // false-positive this fixed) — add every dot-segment of every string.
    (line.match(/"([^"]+)"/g) || []).forEach(function (q) {
      q.slice(1, -1).split(".").forEach(function (s) { if (s) { set.add(s); dagAll.add(s); } });
    });
  });
  dagTokens[f] = set;
});
function tokenSetFor(dagFiles) {
  if (dagFiles.length === 1 && dagFiles[0] === "*") return dagAll;
  var set = new Set();
  dagFiles.forEach(function (f) { dagTokens[f].forEach(function (t) { set.add(t); }); });
  return set;
}

/* ---- engine scan: per-function path + field-token extraction ------------- */
var unexpected = [];   // gaps in "ported" functions
var untracked = [];    // engine functions absent from MAP
var inventory = [];    // { file, fn, row, status, missing: [...] }

["normalize.js", "computation.js", "monitoring.js", "conflicts.js"].forEach(function (engFile) {
  var lines = codeLines(path.join(ROOT, "engine", engFile));
  var fnMap = MAP[engFile];
  var current = null;                 // { name, paths: Map(display -> line) }
  var perFn = {};                     // name -> { paths: Map }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var top = line.match(/^ {2}function ([A-Za-z_$][\w$]*)\s*\(/);
    if (top) {
      current = top[1];
      if (!perFn[current]) perFn[current] = { paths: new Map() };
      if (!fnMap[current] && untracked.indexOf(engFile + ":" + current) === -1) {
        untracked.push(engFile + ":" + current);
      }
    }
    if (!current) continue;
    var bucket = perFn[current].paths;
    // quoted safe(obj, "a.b.c") paths
    var re = /safe\(\s*[^,()]+,\s*"([^"]+)"/g, hit;
    while ((hit = re.exec(line)) !== null) {
      if (!bucket.has(hit[1])) bucket.set(hit[1], i + 1);
    }
    // bare snake_case property reads (form-field shaped: contains "_")
    var pre = /\.([a-z][a-z0-9]*_[a-z0-9_]*)\b/g;
    while ((hit = pre.exec(line)) !== null) {
      var tok = hit[1];
      if (!bucket.has(tok)) bucket.set(tok, i + 1);
    }
  }

  Object.keys(perFn).forEach(function (fn) {
    var meta = fnMap[fn] || { row: "UNTRACKED", status: "untracked", dagFiles: ["*"], knownMissing: [] };
    var tokens = tokenSetFor(meta.dagFiles);
    var missing = [], known = [];
    perFn[fn].paths.forEach(function (lineNo, p) {
      var segs = p.split(".");
      var allPresent = segs.every(function (s) { return tokens.has(s); });
      if (!allPresent) {
        var leaf = segs[segs.length - 1];
        if (meta.knownMissing.indexOf(p) !== -1 || meta.knownMissing.indexOf(leaf) !== -1) known.push(p + "  (L" + lineNo + ")");
        else missing.push(p + "  (L" + lineNo + ")");
      }
    });
    var rec = { file: engFile, fn: fn, row: meta.row, status: meta.status, total: perFn[fn].paths.size, missing: missing, known: known };
    inventory.push(rec);
    if (meta.status === "ported" && missing.length > 0) unexpected.push(rec);
  });
});

/* ---- finding-ID diff ----------------------------------------------------- */
var conflictLines = codeLines(path.join(ROOT, "engine", "conflicts.js"));
var findingIds = [];
conflictLines.forEach(function (line, i) {
  var re = /add\("([A-Za-z0-9_]+)"/g, hit;
  while ((hit = re.exec(line)) !== null) {
    if (findingIds.map(function (f) { return f.id; }).indexOf(hit[1]) === -1) {
      findingIds.push({ id: hit[1], line: i + 1 });
    }
  }
});
var findingsMissing = findingIds.filter(function (f) { return !DAG_FINDING_IDS[f.id]; });

/* ---- numeric drift ------------------------------------------------------- */
var engineNums = new Set();
["constants.js", "normalize.js", "computation.js", "monitoring.js", "conflicts.js"].forEach(function (f) {
  codeLines(path.join(ROOT, "engine", f)).forEach(function (line) {
    (line.match(/\b\d+(?:\.\d+)?\b/g) || []).forEach(function (n) { engineNums.add(Number(n)); });
  });
});
var drifted = [];
NODE_FILES.forEach(function (f) {
  codeLines(path.join(ROOT, "prototypes", "graph-pilot", f)).forEach(function (line, i) {
    (line.match(/\b\d+(?:\.\d+)?\b/g) || []).forEach(function (n) {
      var v = Number(n);
      var significant = Math.abs(v) >= 100 || (v > 0 && v < 1 && n.indexOf(".") !== -1);
      if (significant && !engineNums.has(v) && !drifted.some(function (d) { return d.v === v && d.f === f; })) {
        drifted.push({ f: f, v: v, line: i + 1 });
      }
    });
  });
});

/* ---- report -------------------------------------------------------------- */
var BAR = "==============================================================================";
console.log(BAR + "\nDAG coverage diff — engine/*.js vs prototypes/graph-pilot/ (see docs/DAG_MIGRATION_TRACKER.md)\n" + BAR);

console.log("\n--- 1. UNEXPECTED GAPS: functions the tracker marks PORTED with engine reads absent from their DAG file(s) ---");
if (unexpected.length === 0) console.log("  none — every ✅/🟡 row's engine field reads are either present in its mapped DAG file(s) or on its recorded knownMissing list.");
unexpected.forEach(function (r) {
  console.log("  " + r.file + " :: " + r.fn + "()  [" + r.row + "]  " + r.missing.length + "/" + r.total + " reads missing:");
  r.missing.forEach(function (p) { console.log("      " + p); });
});

console.log("\n--- 1b. KNOWN-PARTIAL: recorded gaps in otherwise-ported functions (tracked in the mapping's knownMissing lists) ---");
var partial = inventory.filter(function (r) { return r.known && r.known.length > 0; });
if (partial.length === 0) console.log("  none.");
partial.forEach(function (r) {
  console.log("  " + r.file + " :: " + r.fn + "()  [" + r.row + "]  " + r.known.length + " recorded:");
  r.known.forEach(function (p) { console.log("      " + p); });
});

console.log("\n--- 2. TRACKED GAPS: the definitive engine-not-in-DAG inventory (rows already ❌/🔶/📝 in the tracker) ---");
var tracked = inventory.filter(function (r) {
  return (r.status === "missing" || r.status === "boundary" || r.status === "scoped-out") && r.missing.length > 0;
});
tracked.sort(function (a, b) { return b.missing.length - a.missing.length; });
tracked.forEach(function (r) {
  console.log("\n  " + r.file + " :: " + r.fn + "()  [" + r.row + ", " + r.status + "]  " + r.missing.length + "/" + r.total + " engine reads with no DAG counterpart anywhere:");
  r.missing.forEach(function (p) { console.log("      " + p); });
});

console.log("\n--- 3. FINDING-ID DIFF: conflicts.js add() IDs vs DAG-implemented findings ---");
console.log("  engine finding IDs: " + findingIds.length + "   implemented in DAG: " + (findingIds.length - findingsMissing.length));
findingsMissing.forEach(function (f) { console.log("      MISSING  " + f.id + "  (conflicts.js L" + f.line + ")"); });

console.log("\n--- 4. NUMERIC DRIFT: DAG constant values with no matching literal anywhere in engine/*.js ---");
if (drifted.length === 0) console.log("  none — every significant DAG numeric literal also exists engine-side (no drift yet; see tracker SYS-1).");
drifted.forEach(function (d) { console.log("      " + d.f + " L" + d.line + "  " + d.v); });

console.log("\n--- 5. ENGINE FUNCTIONS NOT IN THE TRACKER MAPPING (new code the tracker hasn't heard of) ---");
if (untracked.length === 0) console.log("  none — every top-level engine function is accounted for in the tracker mapping.");
untracked.forEach(function (u) { console.log("      " + u); });

var fail = unexpected.length > 0 || untracked.length > 0 || drifted.length > 0;
console.log("\n" + BAR);
console.log("Result: " + (fail
  ? "ATTENTION REQUIRED — unexpected gaps / untracked functions / numeric drift above."
  : "no unexpected gaps: every ✅ tracker row verifies mechanically; sections 2-3 are the complete known engine-not-in-DAG inventory."));
process.exit(fail ? 1 : 0);

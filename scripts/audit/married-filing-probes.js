#!/usr/bin/env node
/* Married-filing audit probes (docs/MARRIED_FILING_AUDIT.md).
 *
 * Each probe runs the JS DAG (analyze.js) on a small profile and checks one
 * rule that depends on filing status or on which spouse an item belongs to.
 * "expected" is the legal answer, worked by hand; a FAIL is a known gap
 * listed in the audit, not a regression. Exit code is always 0 — this is a
 * status report; flip a probe to a hard test once its gap is fixed.
 *
 *   node scripts/audit/married-filing-probes.js [--json]
 */
"use strict";
var path = require("path");
var fs = require("fs");
var ROOT = path.join(__dirname, "..", "..");
global.WISING = {};
process.chdir(path.join(ROOT, "prototypes", "graph-pilot"));
var analyze = require(path.join(ROOT, "prototypes", "graph-pilot", "analyze.js")).analyze;

function load(id) { return JSON.parse(fs.readFileSync(path.join(ROOT, "dag_py", "tests", "fixtures", "section-profiles", id + ".json"), "utf8")); }
function w2(name, wages, deferral) {
  return { employer_name: name, wages_box1_usd: wages,
    box_12_benefits: deferral ? [{ code: "D", amount_usd: deferral }] : [],
    tax_details_collapsed_by_default: { federal_tax_withheld_usd: 0, medicare_wages_box5_usd: wages + (deferral || 0) } };
}
function usCitizen(fs0) { var p = load("us_wages_single"); p.us.profile.filing_status = fs0; return p; }
function run(p) { return analyze({ router: p.router, india: p.india, us: p.us }); }
function ids(r) { return r.findings.map(function (f) { return f.id; }); }

var PROBES = [
  { id: "US-P1", rule: "Social Security wage base is per person (IRC §1402(b), §3121(a)(1))",
    story: "MFJ: spouse W-2 $184,500; client Schedule C $100,000 net, no W-2",
    expected: "SE tax ≈ $14,129 (15.3% × $92,350)",
    probe: function () {
      var p = usCitizen("mfj");
      p.us.income_us_source.wages_w2 = [w2("Spouse Co", 184500)];
      p.us.income_us_source.self_employment = [{ business_name: "Client", has_se_income: true, gross_receipts_usd: 100000, expenses_usd: 0 }];
      var se = run(p).computed.usTax.seTaxUsd;
      return { got: "SE tax $" + Math.round(se), pass: Math.abs(se - 14129) < 50 };
    } },
  { id: "US-P2", rule: "Senior deduction is $6,000 per qualifying spouse (OBBBA §70103)",
    story: "MFJ, both spouses 65+ (only the taxpayer's DOB can be entered), wages $60,000",
    expected: "$12,000",
    probe: function () {
      var p = usCitizen("mfj");
      p.us.profile.date_of_birth = "1958-01-01";
      p.us.income_us_source.wages_w2 = [w2("A", 60000)];
      var v = run(p).computed.usTax.seniorDeductionUsd;
      return { got: "$" + v, pass: v === 12000, note: "no spouse date of birth on the US form" };
    } },
  { id: "US-P3", rule: "Capital loss deduction limited to $3,000 ($1,500 MFS) (IRC §1211(b))",
    story: "Single, wages $60,000, short-term capital loss $20,000",
    expected: "AGI $57,000",
    probe: function () {
      var p = usCitizen("single");
      p.us.income_us_source.wages_w2 = [w2("A", 60000)];
      p.us.income_us_source.stcg_us_source_usd = -20000;
      var agi = run(p).computed.usTax.agiUsd;
      return { got: "AGI $" + Math.round(agi), pass: Math.abs(agi - 57000) < 1 };
    } },
  { id: "US-P4", rule: "No education credits for married filing separately (IRC §25A(g)(6))",
    story: "MFS, wages $60,000, AOTC expenses claimed $2,500",
    expected: "credits $0",
    probe: function () {
      var p = usCitizen("mfs");
      p.us.income_us_source.wages_w2 = [w2("A", 60000)];
      p.us.itemized_deductions_and_credits = { education_credits_aotc_usd: 2500 };
      var c = run(p).computed.usTax.creditsUsd || 0;
      return { got: "credits $" + Math.round(c), pass: c === 0 };
    } },
  { id: "US-P5", rule: "No student-loan interest deduction for married filing separately (IRC §221(e)(2))",
    story: "MFS, wages $60,000, student-loan interest $2,500",
    expected: "AGI $60,000",
    probe: function () {
      var p = usCitizen("mfs");
      p.us.income_us_source.wages_w2 = [w2("A", 60000)];
      p.us.itemized_deductions_and_credits = { student_loan_interest_usd: 2500 };
      var agi = run(p).computed.usTax.agiUsd;
      return { got: "AGI $" + Math.round(agi), pass: Math.abs(agi - 60000) < 1 };
    } },
  { id: "US-P6", rule: "§402(g) deferral limit is per person",
    story: "MFJ, two W-2s (one per spouse), each deferring the $24,500 maximum",
    expected: "no retirement_excess_elective_deferral finding",
    probe: function () {
      var p = usCitizen("mfj");
      p.us.income_us_source.wages_w2 = [w2("A", 100000, 24500), w2("B", 100000, 24500)];
      var fired = ids(run(p)).indexOf("retirement_excess_elective_deferral") !== -1;
      return { got: fired ? "excess-deferral finding fired" : "no finding", pass: !fired };
    } },
  { id: "US-P7", rule: "A US citizen is never a 1040-NR filer (DTAA Art. 1(3) saving clause)",
    story: "US citizen, $120,000 wages, 'files 1040-NR' box ticked",
    expected: "Form 1040 tax $17,570",
    probe: function () {
      var r = run(load("us_citizen_treaty_saving_clause"));
      var t = r.computed.usTax.totalTaxBeforeFtcUsd;
      return { got: "$" + Math.round(t), pass: Math.abs(t - 17570) < 1 };
    } },
  { id: "XB-P1", rule: "India taxes individuals: a spouse's US wages on a joint US return are not the client's Indian income",
    story: "India ROR US citizen, MFJ; client W-2 $50,000, spouse W-2 $150,000",
    expected: "India tax unchanged by the spouse's W-2",
    probe: function () {
      function mk(w2s) {
        var p = load("us_greencard_treaty_nonresident");
        p.router.is_us_citizen = true;
        p.us.us_residency_detail = { is_us_citizen: true, final_us_residency_status: "US_CITIZEN" };
        p.us.nra_specific = {};
        p.us.profile.filing_status = "mfj";
        p.us.income_us_source = { has_employment_income: true, wages_w2: w2s };
        return run(p).computed.indiaTax.totalTaxInr;
      }
      var alone = mk([w2("Client", 50000)]), joint = mk([w2("Client", 50000), w2("Spouse", 150000)]);
      return { got: "India tax ₹" + Math.round(alone) + " → ₹" + Math.round(joint), pass: Math.abs(joint - alone) < 1 };
    } }
];

var results = PROBES.map(function (pr) {
  var out;
  try { out = pr.probe(); } catch (e) { out = { got: "threw: " + e.message, pass: false }; }
  return { id: pr.id, rule: pr.rule, story: pr.story, expected: pr.expected, got: out.got, pass: out.pass, note: out.note || null };
});
if (process.argv.indexOf("--json") !== -1) { console.log(JSON.stringify(results, null, 2)); process.exit(0); }
results.forEach(function (r) {
  console.log((r.pass ? "PASS " : "FAIL ") + r.id + "  " + r.rule);
  console.log("       " + r.story + "\n       expected " + r.expected + " — got " + r.got + (r.note ? " (" + r.note + ")" : ""));
});
var fails = results.filter(function (r) { return !r.pass; }).length;
console.log("\n" + (results.length - fails) + " pass, " + fails + " known gap(s) — see docs/MARRIED_FILING_AUDIT.md");

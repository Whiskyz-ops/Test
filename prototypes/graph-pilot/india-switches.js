"use strict";
/* ============================================================================
 * Layer 1 India's per-head "does this income apply?" switches, enforced
 * before the graph runs (26 Sep 2026).
 *
 * Switching an income head OFF in layer1_india.html only hides its section:
 * the amounts already typed (or, before the hydration fix, copied in from
 * Layer 1 US) stay in state. No engine node checked the switches, so a
 * switched-off salary was still taxed and still drove findings — the
 * visible symptom was a salary conflict on a client whose Layer 1 India
 * showed no salary at all.
 *
 * applyIndiaIncomeSwitches(india) returns a copy where every head whose
 * switch is explicitly false carries no amounts, at the top level and in
 * every quarter. Only an explicit false counts — a missing switch is left
 * alone, so hand-authored data without switches is unchanged. Called from
 * every entry point that builds the graph ctx (analyze.js, monitor-next's
 * dag-adapter.js); mirrored in dag_py's core/india_switches.py.
 * ==========================================================================*/
function cleanSlice(slice) {
  if (!slice || typeof slice !== "object") return slice;
  var out = Object.assign({}, slice);
  var di = out.domestic_income;
  if (di && typeof di === "object") {
    di = out.domestic_income = Object.assign({}, di);
    if (di.salary && di.salary.has_salary_income === false) di.salary = { has_salary_income: false };
    if (di.house_property && di.house_property.has_house_property_income === false) di.house_property = { has_house_property_income: false, properties: [] };
    if (di.business_income && di.business_income.has_business_or_fo_income === false) {
      di.business_income = { has_business_or_fo_income: false, entity_type: di.business_income.entity_type };
    }
    if (di.has_agricultural_income === false) di.agricultural_income_inr = 0;
  }
  if (out.other_sources && out.other_sources.has_other_sources_income === false) out.other_sources = { has_other_sources_income: false };
  return out;
}

function applyIndiaIncomeSwitches(india) {
  if (!india || typeof india !== "object") return india;
  var out = cleanSlice(india);
  if (india.quarters && typeof india.quarters === "object") {
    out.quarters = {};
    Object.keys(india.quarters).forEach(function (q) { out.quarters[q] = cleanSlice(india.quarters[q]); });
  }
  return out;
}

module.exports = { applyIndiaIncomeSwitches: applyIndiaIncomeSwitches };

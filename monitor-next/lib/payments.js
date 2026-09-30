/* Map / KPI status inputs: what each jurisdiction's tax is after credits,
 * what has been paid, and what is still due — plus the client's real US
 * state (replacing the fixed demo state list).
 *
 * Paid amounts use the same input fields as the engine's own
 * taxesPaidUsResult (findings-batch5-nodes.js) and taxesPaidIndiaResult
 * (report-batch1-nodes.js); the state is the one the engine's
 * usStateTaxResult taxes (domicile on 31 Dec, else primary state, else
 * domicile on 1 Jan). Pure functions; `raw` is the client's {router, india, us}. */

import { jointAccountTdsCreditInr } from "./dag/joint-account.js";
import { stateTaxAsResident } from "./dag/findings-batch5-nodes.js";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const get = (o, path, dflt) => {
  let cur = o;
  for (const k of path.split(".")) { if (cur == null || typeof cur !== "object") return dflt; cur = cur[k]; }
  return cur === undefined || cur === null ? dflt : cur;
};

export function usPaidUsd(us) {
  const we = get(us, "withholding_and_estimated", {});
  return num(we.federal_withholding_total_usd) + num(we.estimated_tax_q1_apr15_usd) + num(we.estimated_tax_q2_jun15_usd) +
    num(we.estimated_tax_q3_sep15_usd) + num(we.estimated_tax_q4_jan15_usd);
}

export function indiaPaidInr(india) {
  const tc = get(india, "tax_credits", {});
  return num(tc.advance_tax_q1_15jun_inr) + num(tc.advance_tax_q2_15sep_inr) + num(tc.advance_tax_q3_15dec_inr) + num(tc.advance_tax_q4_15mar_inr) +
    num(tc.tds_already_deducted_inr) + num(tc.tds_inr) + num(tc.tcs_inr) + jointAccountTdsCreditInr(india);
}

const w2StateRows = (us) => (get(us, "income_us_source.wages_w2", []) || []).reduce((out, w) => out.concat(get(w, "state_and_local_taxes", []) || []), []);
const box15 = (st) => (st && st.state_code_box15 ? String(st.state_code_box15).toUpperCase() : null);

// W-2 box 17 state withholding. With a state code: only rows for that state
// (a row with no box 15 code counts toward the resident state).
export function statePaidUsd(us, code, isResident = true) {
  return w2StateRows(us).reduce((t, st) => {
    const c = box15(st);
    if (code && !(c === code || (!c && isResident))) return t;
    return t + num(st && st.state_tax_withheld_box17_usd);
  }, 0);
}

export function residentStateCode(us) {
  const code = get(us, "state_residency.dec_31_domicile_state", null) || get(us, "state_residency.primary_state_of_residence", null) ||
    get(us, "state_residency.jan_1_domicile_state", null);
  return code ? String(code).toUpperCase() : null;
}

// Filing deadlines already passed for a jurisdiction ("IN" / "US").
export function overdueFilings(result, jur) {
  const all = (result && result.monitoring && result.monitoring.calendar && result.monitoring.calendar.all) || [];
  return all.filter((x) => x.jur === jur && x.status === "passed" && x.cat === "Filing").length;
}

const QUARTERS = ["q1", "q2", "q3", "q4"];
const US_AMOUNT = { q1: "estimated_tax_q1_apr15_usd", q2: "estimated_tax_q2_jun15_usd", q3: "estimated_tax_q3_sep15_usd", q4: "estimated_tax_q4_jan15_usd" };
const IN_AMOUNT = { q1: "advance_tax_q1_15jun_inr", q2: "advance_tax_q2_15sep_inr", q3: "advance_tax_q3_15dec_inr", q4: "advance_tax_q4_15mar_inr" };
const toDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const fmt = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// A joint return's withholding and estimated payments: both spouses' amounts
// added per quarter; a quarter's paid date is the later of the two spouses'
// dates (paid in full only once the later payment is made), and undated if
// either spouse paid that quarter without a date.
export function jointEstimatesBlock(usA, usB) {
  const a = get(usA, "withholding_and_estimated", {}) || {}, b = get(usB, "withholding_and_estimated", {}) || {};
  const out = { federal_withholding_total_usd: num(a.federal_withholding_total_usd) + num(b.federal_withholding_total_usd) };
  QUARTERS.forEach((q) => {
    const k = US_AMOUNT[q], dk = "estimated_tax_" + q + "_paid_date";
    out[k] = num(a[k]) + num(b[k]);
    const dates = [[a, num(a[k])], [b, num(b[k])]].filter((t) => t[1] > 0).map((t) => t[0][dk] || null);
    out[dk] = dates.length && dates.every(Boolean) ? dates.sort().pop() : null;
  });
  return out;
}

// Resident individual aged 60+ with no business income: no advance tax
// (Income-tax Act 2025 — the old s.207(2) exemption).
function indiaSeniorExempt(india, year) {
  const dob = toDate(get(india, "profile.date_of_birth", null));
  const res = get(india, "residency_detail.final_india_residency_status", null);
  const biz = get(india, "domestic_income.business_income.has_business_or_fo_income", false) === true;
  if (!dob || biz || !(res === "ROR" || res === "RNOR")) return false;
  return (year + 1) - dob.getFullYear() - ((dob.getMonth() > 2) ? 1 : 0) >= 60; // age on 31 March
}

// Each instalment against its due date (from the engine's own calendar):
// late = paid after the due date; missed = due date passed, nothing paid
// that quarter, and instalments were required (US: tax after credits less
// withholding of $1,000 or more, IRC s.6654(e)(1); India: tax less TDS/TCS
// of ₹10,000 or more, and not a resident senior without business income);
// undated = paid, date not entered (treated as on time).
export function installmentStatus(result, raw, jur, requiredAmount) {
  const all = (result && result.monitoring && result.monitoring.calendar && result.monitoring.calendar.all) || [];
  const cat = jur === "US" ? "Estimated tax" : "Advance tax";
  const due = all.filter((x) => x.jur === jur && x.cat === cat).map((x) => Object.assign({}, x, { d: toDate(x.date) })).filter((x) => x.d).sort((a, b) => a.d - b.d);
  const block = jur === "US" ? get(raw.us, "withholding_and_estimated", {}) : get(raw.india, "tax_credits", {});
  const amountKey = jur === "US" ? US_AMOUNT : IN_AMOUNT;
  const dateKey = (q) => (jur === "US" ? "estimated_tax_" : "advance_tax_") + q + "_paid_date";
  // India presumptive (s.44AD/ADA): one instalment by 15 March for the lot.
  const slots = due.length === 1
    ? [{ due: due[0], amount: QUARTERS.reduce((t, q) => t + num(block[amountKey[q]]), 0),
        paid: QUARTERS.map((q) => toDate(block[dateKey(q)])).filter(Boolean).sort((a, b) => b - a)[0] || null, q: "q4" }]
    : due.slice(0, 4).map((x, i) => ({ due: x, amount: num(block[amountKey[QUARTERS[i]]]), paid: toDate(block[dateKey(QUARTERS[i])]), q: QUARTERS[i] }));
  const out = { late: 0, missed: 0, undated: 0, required: requiredAmount, notes: [] };
  slots.forEach((sl) => {
    const label = sl.q.toUpperCase() + " (due " + fmt(sl.due.d) + ")";
    if (sl.amount > 0) {
      if (!sl.paid) out.undated++;
      else if (sl.paid > sl.due.d) { out.late++; out.notes.push(label + " paid late on " + fmt(sl.paid)); }
    } else if (sl.due.status === "passed" && requiredAmount) {
      out.missed++; out.notes.push(label + " not paid");
    }
  });
  return out;
}

export function countryPayments(result, raw) {
  if (!result || !raw) return null;
  const c = result.computed || {}, fx = (result.model && result.model.meta && result.model.meta.fxRate) || 83;
  const usTax = Math.max(0, num(c.usTax && c.usTax.totalTaxBeforeFtcUsd) - num(c.ftc && c.ftc.us && c.ftc.us.ftcAllowedUsd));
  const inTax = Math.max(0, num(c.indiaTax && c.indiaTax.totalTaxUsd) - num(c.ftc && c.ftc.india && c.ftc.india.reliefAllowedUsd));
  const usPaid = usPaidUsd(raw.us), inPaid = indiaPaidInr(raw.india) / fx;
  const usWithheld = num(get(raw.us, "withholding_and_estimated.federal_withholding_total_usd", 0));
  const tc = get(raw.india, "tax_credits", {});
  const inTdsInr = num(tc.tds_already_deducted_inr) + num(tc.tds_inr) + num(tc.tcs_inr) + jointAccountTdsCreditInr(raw.india);
  const year = (result.model && result.model.meta && result.model.meta.baseYear) || num(get(raw.router, "base_tax_year", 0)) || new Date().getFullYear();
  const usInst = installmentStatus(result, raw, "US", usTax - usWithheld >= 1000);
  const inInst = installmentStatus(result, raw, "IN", inTax * fx - inTdsInr >= 10000 && !indiaSeniorExempt(raw.india, year));
  const pack = (tax, paid, jur, inst) => ({
    taxAfterCreditsUsd: tax, paidUsd: paid, balanceUsd: Math.max(0, tax - paid), overdueFilings: overdueFilings(result, jur),
    lateInstallments: inst.late + inst.missed, undatedInstallments: inst.undated, installmentNotes: inst.notes
  });
  return { US: pack(usTax, usPaid, "US", usInst), IN: pack(inTax, inPaid, "IN", inInst) };
}

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
};

// States with no individual income tax on wages (no return to file).
export const NO_WAGE_TAX_STATES = new Set(["AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"]);

// Other states the client's data says they owe a return to, beyond the
// resident state: the state they moved from this year (part-year resident)
// and any state on a W-2 (box 15) with state wages or withholding
// (non-resident source income). The engine only computes the resident
// state's tax, so these rows carry no tax figure: they show "Filing
// required" with the reason, never a made-up amount.
export function otherStates(us, residentCode) {
  const out = new Map();
  const sr = get(us, "state_residency", {}) || {};
  const add = (code, why) => {
    code = code ? String(code).toUpperCase() : null;
    if (!code || code === residentCode || NO_WAGE_TAX_STATES.has(code) || !STATE_NAMES[code]) return;
    const cur = out.get(code) || { code, why: [], wagesUsd: 0, partYear: false };
    cur.why.push(why); out.set(code, cur);
    return cur;
  };
  const jan1 = sr.jan_1_domicile_state ? String(sr.jan_1_domicile_state).toUpperCase() : null;
  const py = (r) => { if (r) r.partYear = true; };
  if (jan1 && jan1 !== residentCode) py(add(jan1, "Part-year resident — domiciled here on 1 January"));
  if (sr.moved_states_this_year === true || sr.moved_states_this_year === "yes") py(add(sr.previous_state, "Part-year resident — moved from here" + (sr.move_date ? " on " + sr.move_date : " this year")));
  w2StateRows(us).forEach((st) => {
    if (num(st && st.state_wages_box16_usd) > 0 || num(st && st.state_tax_withheld_box17_usd) > 0)
    { const r = add(box15(st), "W-2 wages sourced here ($" + Math.round(num(st.state_wages_box16_usd)).toLocaleString("en-US") + ")"); if (r) r.wagesUsd += num(st.state_wages_box16_usd); }
  });
  return [...out.values()].map((r) => ({ code: r.code, why: r.why.join("; "), wagesUsd: r.wagesUsd, partYear: r.partYear }));
}

// Non-resident / part-year return for each state with a tax model.
const NR_FORMS = { NY: "Form IT-203", CA: "Form 540NR", NJ: "Form NJ-1040NR" };

// Share of the year before the move date (part-year resident of the state
// moved from); null without a date.
export function partYearFraction(moveDate, year) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(moveDate || ""));
  if (!m) return null;
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1), d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Math.min(1, Math.max(0, (d - start) / (end - start)));
}

// The client's US states for the drill-down map: the resident state the
// engine taxes (with its tax, withholding and balance), plus the other
// states the data says they file in. For the states the engine has tables
// for (NY, CA, NJ) the other states' tax uses those states' own method for
// non-residents and part-year residents (NY IT-203, CA 540NR,
// NJ-1040NR): the tax as if a full-year resident, times the state's share
// of federal AGI. The state's share is its W-2 box 16 wages for a
// non-resident; for a part-year resident, AGI times the part of the year
// before the move (income assumed earned evenly — an estimate). The
// resident state then:
//   - taxes only its own part of the year when the client moved in, and
//   - credits tax paid to a non-resident state on the same wages, limited
//     to the resident tax on those wages (resident tax x wages / AGI).
// Other states' rows stay "Not computed".
export function statesFromEngine(result, raw) {
  if (!result || !raw) return [];
  const code = residentStateCode(raw.us);
  const usTax = (result.computed && result.computed.usTax) || {};
  const agi = num(usTax.agiUsd);
  const status = usTax.filingStatus || "single";
  const deps = num(get(raw.us, "profile.dependents_count", 0));
  const year = (result.model && result.model.meta && result.model.meta.baseYear) || num(get(raw.router, "base_tax_year", 0)) || new Date().getFullYear();
  const sr = get(raw.us, "state_residency", {}) || {};
  const others = otherStates(raw.us, code).map((o) => {
    const name = STATE_NAMES[o.code];
    const paid = statePaidUsd(raw.us, o.code, false);
    let taxUsd = null, basis = null, sourcedUsd = null;
    const full = NO_WAGE_TAX_STATES.has(o.code) ? null : stateTaxAsResident(o.code, status, agi, deps, 0);
    if (o.partYear) {
      const frac = partYearFraction(sr.move_date, year);
      if (frac != null) { sourcedUsd = Math.max(agi * frac, o.wagesUsd); basis = "part-year: " + Math.round(frac * 100) + "% of the year before the move (income assumed earned evenly)"; }
    } else if (o.wagesUsd > 0) {
      sourcedUsd = o.wagesUsd; basis = "non-resident: W-2 wages here";
    }
    if (full && sourcedUsd != null && agi > 0) taxUsd = full.totalTaxUsd * Math.min(1, sourcedUsd / agi);
    return Object.assign({}, o, { name, paid, taxUsd, sourcedUsd, basis, formName: full ? NR_FORMS[o.code] || null : null });
  });
  const rows = [];
  if (code) {
    const block = result.taxComputation && result.taxComputation.usState;
    const fullTaxUsd = block ? num(block.totalUsd) : 0;
    // Moved in this year: only the part of the year after the move.
    const moved = others.find((o) => o.partYear && o.sourcedUsd != null);
    const residentFactor = moved && agi > 0 ? Math.max(0, 1 - moved.sourcedUsd / agi) : 1;
    // Credit for tax paid to non-resident states on the same wages.
    const creditUsd = others.filter((o) => !o.partYear && o.taxUsd != null && agi > 0)
      .reduce((t, o) => t + Math.min(o.taxUsd, fullTaxUsd * residentFactor * Math.min(1, o.sourcedUsd / agi)), 0);
    const taxUsd = Math.max(0, fullTaxUsd * residentFactor - creditUsd);
    const paid = statePaidUsd(raw.us, code, true);
    const name = STATE_NAMES[code] || code;
    const notes = [];
    if (residentFactor < 1) notes.push("part-year resident here — " + Math.round(residentFactor * 100) + "% of the full-year tax");
    if (creditUsd > 0) notes.push("less $" + Math.round(creditUsd).toLocaleString("en-US") + " credit for tax paid to other states");
    rows.push({
      id: code, name, mapName: name, abbr: code, flag: "🇺🇸", type: "state", taxesWorldwide: true, resident: true,
      residency: { days: null, threshold: null, test: "Resident state (domicile / primary residence)", isResident: true },
      reporting: null, physicalPresence: true, triggerDate: null,
      estimatedTaxUsd: Math.round(taxUsd), incomeExposedUsd: Math.round(agi),
      taxAfterCreditsUsd: taxUsd, paidUsd: paid, balanceUsd: Math.max(0, taxUsd - paid), overdueFilings: 0,
      residentFactor, otherStateCreditUsd: creditUsd,
      reason: block ? (notes.length ? name + " " + notes.join("; ") : null) : name + " — no state tax model for this state yet"
    });
  }
  others.forEach((o) => {
    const computed = o.taxUsd != null;
    // Wages sourced to the state with no withholding for it: the state taxes
    // them first (the resident state gives the credit), so tax is due and
    // unpaid — red even where the amount can't be computed.
    const likelyUnpaid = !computed && o.wagesUsd > 0 && o.paid <= 0;
    const why = o.why;
    rows.push({
      id: o.code, name: o.name, mapName: o.name, abbr: o.code, flag: "🇺🇸", type: "state", taxesWorldwide: false, resident: false, filingRequired: true, taxModelled: computed,
      residency: { days: null, threshold: null, test: why, isResident: false },
      reporting: null, physicalPresence: o.partYear, triggerDate: null,
      estimatedTaxUsd: computed ? Math.round(o.taxUsd) : null, incomeExposedUsd: o.sourcedUsd != null ? Math.round(o.sourcedUsd) : (o.wagesUsd || null),
      paidUsd: o.paid, overdueFilings: 0, likelyUnpaid,
      ...(computed ? { taxAfterCreditsUsd: o.taxUsd, balanceUsd: Math.max(0, o.taxUsd - o.paid) } : {}),
      reason: why + " — " + o.name + " return required" + (o.formName ? " (" + o.formName + ")" : "") +
        (computed ? "; tax $" + Math.round(o.taxUsd).toLocaleString("en-US") + " (" + o.basis + ")"
          : "; tax not computed (" + (o.partYear && o.sourcedUsd == null ? "move date not entered" : "no " + o.name + " tax model yet") + ")") +
        (likelyUnpaid ? "; no " + o.name + " withholding on file, so tax is likely unpaid" : o.paid > 0 ? "; withholding on file $" + Math.round(o.paid).toLocaleString("en-US") : "")
    });
  });
  return rows;
}

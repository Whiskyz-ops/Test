/* Map / KPI status inputs: what each jurisdiction's tax is after credits,
 * what has been paid, and what is still due — plus the client's real US
 * state (replacing the fixed demo state list).
 *
 * Paid amounts use the same input fields as the engine's own
 * taxesPaidUsResult (findings-batch5-nodes.js) and taxesPaidIndiaResult
 * (report-batch1-nodes.js); the state is the one the engine's
 * usStateTaxResult taxes (domicile on 31 Dec, else primary state, else
 * domicile on 1 Jan). Pure functions; `raw` is the client's {router, india, us}. */

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
    num(tc.tds_already_deducted_inr) + num(tc.tds_inr) + num(tc.tcs_inr);
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
  const inTdsInr = num(tc.tds_already_deducted_inr) + num(tc.tds_inr) + num(tc.tcs_inr);
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
    const cur = out.get(code) || { code, why: [], wagesUsd: 0 };
    cur.why.push(why); out.set(code, cur);
    return cur;
  };
  const jan1 = sr.jan_1_domicile_state ? String(sr.jan_1_domicile_state).toUpperCase() : null;
  if (jan1 && jan1 !== residentCode) add(jan1, "Part-year resident — domiciled here on 1 January");
  if (sr.moved_states_this_year === true || sr.moved_states_this_year === "yes") add(sr.previous_state, "Part-year resident — moved from here" + (sr.move_date ? " on " + sr.move_date : " this year"));
  w2StateRows(us).forEach((st) => {
    if (num(st && st.state_wages_box16_usd) > 0 || num(st && st.state_tax_withheld_box17_usd) > 0)
    { const r = add(box15(st), "W-2 wages sourced here ($" + Math.round(num(st.state_wages_box16_usd)).toLocaleString("en-US") + ")"); if (r) r.wagesUsd += num(st.state_wages_box16_usd); }
  });
  return [...out.values()].map((r) => ({ code: r.code, why: r.why.join("; "), wagesUsd: r.wagesUsd }));
}

// The client's US states for the drill-down map: the resident state the
// engine taxes (with its tax, withholding and balance), plus the other
// states above (filing required; tax not computed).
export function statesFromEngine(result, raw) {
  if (!result || !raw) return [];
  const code = residentStateCode(raw.us);
  const rows = [];
  if (code) {
    const block = result.taxComputation && result.taxComputation.usState;
    const taxUsd = block ? num(block.totalUsd) : 0;
    const paid = statePaidUsd(raw.us, code, true);
    const name = STATE_NAMES[code] || code;
    rows.push({
      id: code, name, mapName: name, abbr: code, flag: "🇺🇸", type: "state", taxesWorldwide: true, resident: true,
      residency: { days: null, threshold: null, test: "Resident state (domicile / primary residence)", isResident: true },
      reporting: null, physicalPresence: true, triggerDate: null,
      estimatedTaxUsd: Math.round(taxUsd), incomeExposedUsd: Math.round(num(result.computed && result.computed.usTax && result.computed.usTax.agiUsd)),
      taxAfterCreditsUsd: taxUsd, paidUsd: paid, balanceUsd: Math.max(0, taxUsd - paid), overdueFilings: 0,
      reason: block ? null : name + " — no state tax model for this state yet"
    });
  }
  otherStates(raw.us, code).forEach(({ code: c, why, wagesUsd }) => {
    const name = STATE_NAMES[c];
    const paid = statePaidUsd(raw.us, c, false);
    // Wages sourced to the state with no withholding for it: the state taxes
    // them first (the resident state gives the credit), so tax is almost
    // certainly due and unpaid — red, though the amount isn't computed.
    const likelyUnpaid = wagesUsd > 0 && paid <= 0;
    rows.push({
      id: c, name, mapName: name, abbr: c, flag: "🇺🇸", type: "state", taxesWorldwide: false, resident: false, filingRequired: true, taxModelled: false,
      residency: { days: null, threshold: null, test: why, isResident: false },
      reporting: null, physicalPresence: /Part-year/.test(why), triggerDate: null,
      estimatedTaxUsd: null, incomeExposedUsd: wagesUsd || null, paidUsd: paid, overdueFilings: 0, likelyUnpaid,
      reason: why + " — " + name + " return required; tax not computed (no part-year / non-resident model yet)" +
        (likelyUnpaid ? "; no " + name + " withholding on file, so tax is likely unpaid" : paid > 0 ? "; withholding on file $" + Math.round(paid).toLocaleString("en-US") + " (not checked against the tax)" : "") +
        (code ? "; " + (STATE_NAMES[code] || code) + " may credit tax paid here" : "")
    });
  });
  return rows;
}

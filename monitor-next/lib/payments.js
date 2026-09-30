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

export function statePaidUsd(us) {
  return (get(us, "income_us_source.wages_w2", []) || []).reduce((t, w) =>
    t + (get(w, "state_and_local_taxes", []) || []).reduce((s, st) => s + num(st && st.state_tax_withheld_box17_usd), 0), 0);
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

export function countryPayments(result, raw) {
  if (!result || !raw) return null;
  const c = result.computed || {}, fx = (result.model && result.model.meta && result.model.meta.fxRate) || 83;
  const usTax = Math.max(0, num(c.usTax && c.usTax.totalTaxBeforeFtcUsd) - num(c.ftc && c.ftc.us && c.ftc.us.ftcAllowedUsd));
  const inTax = Math.max(0, num(c.indiaTax && c.indiaTax.totalTaxUsd) - num(c.ftc && c.ftc.india && c.ftc.india.reliefAllowedUsd));
  const usPaid = usPaidUsd(raw.us), inPaid = indiaPaidInr(raw.india) / fx;
  return {
    US: { taxAfterCreditsUsd: usTax, paidUsd: usPaid, balanceUsd: Math.max(0, usTax - usPaid), overdueFilings: overdueFilings(result, "US") },
    IN: { taxAfterCreditsUsd: inTax, paidUsd: inPaid, balanceUsd: Math.max(0, inTax - inPaid), overdueFilings: overdueFilings(result, "IN") }
  };
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

// The client's own US state(s) for the drill-down map: today one row, the
// resident state the engine taxes. Other states are not tracked.
export function statesFromEngine(result, raw) {
  if (!result || !raw) return [];
  const code = residentStateCode(raw.us);
  if (!code) return [];
  const block = result.taxComputation && result.taxComputation.usState;
  const taxUsd = block ? num(block.totalUsd) : 0;
  const paid = statePaidUsd(raw.us);
  const name = STATE_NAMES[code] || code;
  return [{
    id: code, name, mapName: name, abbr: code, flag: "🇺🇸", type: "state", taxesWorldwide: true,
    residency: { days: null, threshold: null, test: "Resident state (domicile / primary residence)", isResident: true },
    reporting: null, physicalPresence: true, triggerDate: null,
    estimatedTaxUsd: Math.round(taxUsd), incomeExposedUsd: Math.round(num(result.computed && result.computed.usTax && result.computed.usTax.agiUsd)),
    taxAfterCreditsUsd: taxUsd, paidUsd: paid, balanceUsd: Math.max(0, taxUsd - paid), overdueFilings: 0,
    reason: block ? null : name + " — no state tax model for this state yet"
  }];
}

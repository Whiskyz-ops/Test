import { describe, it, expect } from "vitest";
import { countryPayments, statesFromEngine, residentStateCode, usPaidUsd, indiaPaidInr, partYearFraction } from "./payments.js";
import { stateTaxAsResident } from "./dag/findings-batch5-nodes.js";
import { classify, STATUS } from "./logic.js";

const result = {
  model: { meta: { fxRate: 83 } },
  computed: { usTax: { totalTaxBeforeFtcUsd: 74531, agiUsd: 386340 }, ftc: { us: { ftcAllowedUsd: 13661 }, india: { reliefAllowedUsd: 0 } }, indiaTax: { totalTaxUsd: 19212 } },
  taxComputation: { usState: { totalUsd: 25365 } },
  monitoring: { calendar: { all: [{ jur: "IN", cat: "Filing", status: "passed" }, { jur: "US", cat: "Estimated tax", status: "passed" }] } }
};
const raw = {
  us: { withholding_and_estimated: { federal_withholding_total_usd: 30000, estimated_tax_q1_apr15_usd: 5000 }, state_residency: { primary_state_of_residence: "ny" },
    income_us_source: { wages_w2: [{ state_and_local_taxes: [{ state_tax_withheld_box17_usd: 9000 }] }] } },
  india: { tax_credits: { tds_already_deducted_inr: 430000, advance_tax_q1_15jun_inr: 100000 } }
};

describe("payments and map status", () => {
  it("adds up payments from the same fields as the engine", () => {
    expect(usPaidUsd(raw.us)).toBe(35000);
    expect(indiaPaidInr(raw.india)).toBe(530000);
  });
  it("computes tax after credits, paid and unpaid per country", () => {
    const p = countryPayments(result, raw);
    expect(p.US.taxAfterCreditsUsd).toBe(60870);
    expect(p.US.balanceUsd).toBe(25870);
    expect(p.IN.balanceUsd).toBeCloseTo(19212 - 530000 / 83, 6);
    expect(p.IN.overdueFilings).toBe(1);
    expect(p.US.overdueFilings).toBe(0); // a passed estimated-tax date isn't a filing
  });
  it("draws the client's own resident state, not a demo list", () => {
    expect(residentStateCode(raw.us)).toBe("NY");
    const s = statesFromEngine(result, raw);
    expect(s.map((x) => x.mapName)).toEqual(["New York"]);
    expect(s[0].balanceUsd).toBe(25365 - 9000);
    expect(statesFromEngine(result, { us: {}, india: {} })).toEqual([]);
  });
  it("adds part-year and W-2 work states, with their tax where the engine has the state's tables", () => {
    const us = { state_residency: { primary_state_of_residence: "NY", jan_1_domicile_state: "CA", moved_states_this_year: true, previous_state: "CA", move_date: "2026-03-01" },
      income_us_source: { wages_w2: [
        { state_and_local_taxes: [{ state_code_box15: "NY", state_wages_box16_usd: 100000, state_tax_withheld_box17_usd: 6000 }] },
        { state_and_local_taxes: [{ state_code_box15: "NJ", state_wages_box16_usd: 40000, state_tax_withheld_box17_usd: 0 }] },
        { state_and_local_taxes: [{ state_code_box15: "CA", state_wages_box16_usd: 20000, state_tax_withheld_box17_usd: 1500 }] },
        { state_and_local_taxes: [{ state_code_box15: "TX", state_wages_box16_usd: 5000 }] },
        { state_and_local_taxes: [{ state_code_box15: "PA", state_wages_box16_usd: 10000 }] }] } };
    const s = statesFromEngine(result, { us, india: {}, router: { base_tax_year: 2026 } });
    expect(s.map((x) => x.id)).toEqual(["NY", "CA", "NJ", "PA"]); // TX has no wage tax
    const agi = 386340, frac = 59 / 365; // 1 Jan -> 1 Mar 2026
    const ca = s.find((x) => x.id === "CA"), nj = s.find((x) => x.id === "NJ"), pa = s.find((x) => x.id === "PA"), ny = s[0];
    // Part-year CA: full-year CA tax x the part of the year before the move.
    expect(partYearFraction("2026-03-01", 2026)).toBeCloseTo(frac, 10);
    expect(ca.estimatedTaxUsd).toBe(Math.round(stateTaxAsResident("CA", "single", agi, 0, 0).totalTaxUsd * frac));
    expect(ca.balanceUsd).toBeCloseTo(ca.taxAfterCreditsUsd - 1500, 6);
    // Non-resident NJ: full-year NJ tax x NJ wages / AGI; nothing withheld -> red.
    const njTax = stateTaxAsResident("NJ", "single", agi, 0, 0).totalTaxUsd * 40000 / agi;
    expect(nj.taxAfterCreditsUsd).toBeCloseTo(njTax, 6);
    expect(classify(nj)).toBe(STATUS.EXPOSED);
    // PA: no model -> not computed, wages with nothing withheld -> likely unpaid.
    expect(pa.estimatedTaxUsd).toBeNull();
    expect(pa.likelyUnpaid).toBe(true);
    // Resident NY: 25,365 full-year x (1 - frac), less the NJ credit, limited
    // to the NY tax on the NJ wages.
    const nyPart = 25365 * (1 - frac);
    const credit = Math.min(njTax, nyPart * 40000 / agi);
    expect(ny.taxAfterCreditsUsd).toBeCloseTo(nyPart - credit, 6);
    expect(ny.paidUsd).toBe(6000); // only NY's box 17
  });
  it("red means unpaid or overdue; paid-up obligations are Filing required", () => {
    const base = { taxesWorldwide: true, residency: { days: 345, threshold: 183 }, reporting: null };
    expect(classify(Object.assign({}, base, { estimatedTaxUsd: 60870, balanceUsd: 25870, overdueFilings: 0 }))).toBe(STATUS.EXPOSED);
    expect(classify(Object.assign({}, base, { estimatedTaxUsd: 60870, balanceUsd: 0, overdueFilings: 0 }))).toBe(STATUS.NEXUS);
    expect(classify(Object.assign({}, base, { estimatedTaxUsd: 0, balanceUsd: 0, overdueFilings: 1 }))).toBe(STATUS.EXPOSED);
    // Citizen abroad, 0 US days, $0 US tax: must still file — not "Approaching".
    expect(classify({ taxesWorldwide: true, residency: { days: 0, threshold: 183 }, estimatedTaxUsd: 0, balanceUsd: 0, overdueFilings: 0 })).toBe(STATUS.NEXUS);
    // Non-resident, no tax, 120 of 183 days: approaching.
    expect(classify({ taxesWorldwide: false, residency: { days: 120, threshold: 183 }, estimatedTaxUsd: 0, balanceUsd: 0, overdueFilings: 0 })).toBe(STATUS.APPROACHING);
    expect(classify({ taxesWorldwide: false, residency: { days: 20, threshold: 183 }, estimatedTaxUsd: 0, balanceUsd: 0, overdueFilings: 0 })).toBe(STATUS.NONE);
  });
});

describe("instalment dates", () => {
  const cal = (jur, cat, dates, today) => dates.map((d) => ({ jur, cat, date: d, status: d < today ? "passed" : "upcoming" }));
  const today = "2026-09-30";
  const res = (inTaxUsd) => ({
    model: { meta: { fxRate: 83, baseYear: 2026 } },
    computed: { usTax: { totalTaxBeforeFtcUsd: 20000 }, ftc: { us: { ftcAllowedUsd: 0 }, india: { reliefAllowedUsd: 0 } }, indiaTax: { totalTaxUsd: inTaxUsd } },
    monitoring: { calendar: { all: cal("US", "Estimated tax", ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"], today)
      .concat(cal("IN", "Advance tax", ["2026-06-15", "2026-09-15", "2026-12-15", "2027-03-15"], today)) } }
  });
  it("flags a late payment and a missed quarter, and trusts undated ones", () => {
    const raw = { router: {}, india: {}, us: { withholding_and_estimated: { federal_withholding_total_usd: 5000,
      estimated_tax_q1_apr15_usd: 3000, estimated_tax_q1_paid_date: "2026-04-10",
      estimated_tax_q2_jun15_usd: 3000, estimated_tax_q2_paid_date: "2026-07-01",
      estimated_tax_q3_sep15_usd: 0 } } };
    const p = countryPayments(res(0), raw);
    expect(p.US.lateInstallments).toBe(2); // Q2 late, Q3 missed; Q4 not yet due
    expect(p.US.installmentNotes.join(" | ")).toMatch(/Q2 .*paid late.*\| Q3 .*not paid/);
    const undated = { router: {}, india: {}, us: { withholding_and_estimated: { federal_withholding_total_usd: 5000, estimated_tax_q1_apr15_usd: 3000, estimated_tax_q2_jun15_usd: 3000, estimated_tax_q3_sep15_usd: 3000 } } };
    const u = countryPayments(res(0), undated);
    expect(u.US.lateInstallments).toBe(0);
    expect(u.US.undatedInstallments).toBe(3);
  });
  it("doesn't require instalments under the thresholds or for an Indian resident senior", () => {
    const noUs = { router: {}, india: {}, us: { withholding_and_estimated: { federal_withholding_total_usd: 19500 } } };
    expect(countryPayments(res(0), noUs).US.lateInstallments).toBe(0); // $500 after withholding < $1,000
    const india = (dob) => ({ router: {}, us: {}, india: { profile: { date_of_birth: dob }, residency_detail: { final_india_residency_status: "ROR" }, tax_credits: {} } });
    expect(countryPayments(res(2000), india("1990-01-01")).IN.lateInstallments).toBe(2); // Q1, Q2 missed
    expect(countryPayments(res(2000), india("1960-01-01")).IN.lateInstallments).toBe(0); // 60+, no business
    expect(countryPayments(res(100), india("1990-01-01")).IN.lateInstallments).toBe(0); // ₹8,300 < ₹10,000
    expect(classify({ taxesWorldwide: true, estimatedTaxUsd: 100, balanceUsd: 0, overdueFilings: 0, lateInstallments: 1 })).toBe(STATUS.EXPOSED);
  });
});

describe("joint-return estimated payments", () => {
  it("adds both spouses' quarters and uses the later date", async () => {
    const { jointEstimatesBlock } = await import("./payments.js");
    const b = jointEstimatesBlock(
      { withholding_and_estimated: { federal_withholding_total_usd: 30000, estimated_tax_q1_apr15_usd: 8000, estimated_tax_q1_paid_date: "2026-04-10", estimated_tax_q2_jun15_usd: 8000 } },
      { withholding_and_estimated: { federal_withholding_total_usd: 11000, estimated_tax_q1_apr15_usd: 2000, estimated_tax_q1_paid_date: "2026-04-20" } });
    expect(b.federal_withholding_total_usd).toBe(41000);
    expect(b.estimated_tax_q1_apr15_usd).toBe(10000);
    expect(b.estimated_tax_q1_paid_date).toBe("2026-04-20"); // later of the two -> late
    expect(b.estimated_tax_q2_paid_date).toBeNull(); // paid, undated
    expect(b.estimated_tax_q3_sep15_usd).toBe(0);
  });
});

describe("refunds and money at risk on country rows (from the engine's alerts)", () => {
  const base = (findings, usTax, inTax) => ({
    model: { meta: { fxRate: 83, baseYear: 2026 } },
    computed: { usTax: { totalTaxBeforeFtcUsd: usTax }, ftc: { us: { ftcAllowedUsd: 0 }, india: { reliefAllowedUsd: 0 } }, indiaTax: { totalTaxUsd: inTax } },
    monitoring: { calendar: { all: [] } }, findings
  });
  const raw = { router: {}, us: { withholding_and_estimated: { federal_withholding_total_usd: 12000 } }, india: { tax_credits: { tds_already_deducted_inr: 37440 } } };
  it("shows the India refund and the salary TDS at risk separately", () => {
    const p = countryPayments(base([{ id: "india_tds_refund_due", amountUsd: 420 }, { id: "salary_not_taxable_india_tds", amountUsd: 32861 }], 10000, 31), raw);
    expect(p.IN.refundUsd).toBe(420);
    expect(p.IN.atRiskUsd).toBe(32861);
    expect(p.US.refundUsd).toBe(2000); // 12,000 withheld vs 10,000 tax
    expect(classify(Object.assign({ taxesWorldwide: false, estimatedTaxUsd: 31 }, p.IN))).toBe(STATUS.NEXUS); // nothing unpaid
  });
  it("doesn't count salary TDS twice once it's been deducted (inside the refund)", () => {
    // Refund $33,284 vs the engine's $34,070 estimate: the salary TDS was
    // deducted (refund well over half the estimate) — shown once.
    const p = countryPayments(base([{ id: "india_tds_refund_due", amountUsd: 33284 }, { id: "salary_not_taxable_india_tds", amountUsd: 34070 }], 10000, 31), raw);
    expect(p.IN.atRiskUsd).toBe(0);
    expect(p.IN.atRiskNote).toMatch(/likely includes TDS on salary/);
  });
  it("shows nothing when the engine raises neither alert", () => {
    const p = countryPayments(base([], 10000, 31), raw);
    expect(p.IN.refundUsd).toBe(0);
    expect(p.IN.atRiskUsd).toBeUndefined();
  });
});

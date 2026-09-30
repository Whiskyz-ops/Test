import { describe, it, expect } from "vitest";
import { countryPayments, statesFromEngine, residentStateCode, usPaidUsd, indiaPaidInr } from "./payments.js";
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

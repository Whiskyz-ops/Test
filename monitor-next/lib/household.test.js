import { describe, it, expect } from "vitest";
import { householdSummaryFigures } from "./household.js";

// Round numbers: joint US total $100,000, method A 80% / 20%.
const h = {
  blocked: false, status: "mfj", split: { method: "A" },
  jointUs: { totalTaxBeforeFtcUsd: 100000, indiaTaxPaidUsd: 20000, ftcAllowedUsd: 15000 },
  spouses: [
    { id: "r", share: 0.8, indiaTaxUsd: 19000, usTaxShareUsd: 70000, usSourceFraction: 1, indiaReliefHouseholdUsd: 0 },
    { id: "p", share: 0.2, indiaTaxUsd: 0, usTaxShareUsd: 17500, usSourceFraction: 1, indiaReliefHouseholdUsd: 0 }
  ],
  _own: [{ computed: { residency: { india: { worldwide: false } } } }, { computed: { residency: { india: { worldwide: false } } } }]
};

describe("householdSummaryFigures", () => {
  it("gives each spouse their own Indian tax plus their share of the joint US tax", () => {
    const r = householdSummaryFigures(h, "r"), p = householdSummaryFigures(h, "p");
    expect(r.combinedTaxUsd).toBe(19000 + 80000);
    expect(p.combinedTaxUsd).toBe(0 + 20000);
    // The two rows add up to the joint US tax once, not twice.
    expect(r.usShareUsd + p.usShareUsd).toBe(100000);
  });
  it("splits the joint unrelieved double tax by the same share", () => {
    expect(householdSummaryFigures(h, "r").netDoubleTaxUsd).toBeCloseTo(4000);
    expect(householdSummaryFigures(h, "p").netDoubleTaxUsd).toBeCloseTo(1000);
  });
  it("adds an Indian-resident spouse's own relief shortfall", () => {
    const h2 = JSON.parse(JSON.stringify(h));
    h2._own[0].computed.residency.india.worldwide = true;
    h2.spouses[0].indiaReliefHouseholdUsd = 65000; // shortfall 70,000 - 65,000
    expect(householdSummaryFigures(h2, "r").netDoubleTaxUsd).toBeCloseTo(4000 + 5000);
  });
  it("returns null when the household is blocked or files separately", () => {
    expect(householdSummaryFigures(Object.assign({}, h, { blocked: true }), "r")).toBeNull();
    expect(householdSummaryFigures(Object.assign({}, h, { status: "mfs" }), "r")).toBeNull();
  });
});

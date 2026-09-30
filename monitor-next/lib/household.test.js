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

import { mergeHouseholdFindings, healthFromFindings, householdSnapshot, householdScorerId } from "./household.js";

describe("household alerts, health and headline (step 4)", () => {
  const own = [
    { id: "fbar_limit", severity: "critical" }, { id: "state_income_tax", severity: "warning", amountUsd: 3739 },
    { id: "fx_basis", severity: "info" }
  ];
  const joint = [
    { id: "state_income_tax", severity: "warning", amountUsd: 31629 }, { id: "retirement_excess_elective_deferral", severity: "warning" },
    { id: "ftc_gap", severity: "critical", amountUsd: 4702 }
  ];
  it("takes joint-return alerts from the joint run and the rest from the person's own run", () => {
    const m = mergeHouseholdFindings(own, joint);
    expect(m.map((f) => f.id + ":" + f.scope).sort()).toEqual(["fbar_limit:person", "ftc_gap:household", "fx_basis:person", "state_income_tax:household"]);
    // The joint state tax replaces the person-only figure; the pooled 401(k) alert is dropped.
    expect(m.find((f) => f.id === "state_income_tax").amountUsd).toBe(31629);
  });
  it("scores health with the engine's formula on the merged alerts", () => {
    const hh = healthFromFindings(mergeHouseholdFindings(own, joint), { breachedLimits: 1, willBreach: 0 });
    // 100 - 16 x 2 critical - 3 x 1 warning - 8 x 1 breached = 57
    expect(hh.score).toBe(57);
    expect(hh.band.label).toBe("Needs attention");
    expect(healthFromFindings([{ severity: "critical" }, { severity: "critical" }, { severity: "critical" }, { severity: "critical" }, { severity: "critical" }, { severity: "critical" }], {}).score).toBe(8);
  });
  it("counts household alerts on one spouse's health score only", () => {
    const shown = mergeHouseholdFindings(own, joint, false, "Rohan");
    expect(shown.filter((f) => f.scope === "household").length).toBe(2);
    expect(shown.find((f) => f.id === "ftc_gap").countedOnName).toBe("Rohan");
    // Only the person's own alerts count: 100 - 16 x 1 critical - 8 x 1 breached = 76
    expect(healthFromFindings(shown, { breachedLimits: 1, willBreach: 0 }).score).toBe(76);
    const raw = (owner) => ({ _raw: { us: { profile: { household_items_owner: owner } } } });
    const h = (o0, o1) => ({ spouses: [{ id: "r" }, { id: "p" }], _own: [raw(o0), raw(o1)] });
    expect(householdScorerId(h("self", "spouse"))).toBe("r");
    expect(householdScorerId(h("spouse", "self"))).toBe("p");
    expect(householdScorerId(h(undefined, "spouse"))).toBe("r");
    expect(householdScorerId(h(undefined, undefined))).toBe("p"); // lower client id
  });
  it("puts the client's share of the joint US tax in the headline and the US country row", () => {
    const h = {
      blocked: false, status: "mfj", split: { method: "A" },
      jointUs: { totalTaxBeforeFtcUsd: 100000, indiaTaxPaidUsd: 0, ftcAllowedUsd: 0 },
      spouses: [{ id: "r", name: "Rohan", share: 0.8, indiaTaxUsd: 1000, usTaxShareUsd: 70000, usSourceFraction: 1, indiaReliefHouseholdUsd: 0 },
                { id: "p", name: "Priya", share: 0.2, indiaTaxUsd: 0, usTaxShareUsd: 17500, usSourceFraction: 1, indiaReliefHouseholdUsd: 0 }],
      _own: [{ computed: { residency: { india: { worldwide: false } } } }, { computed: { residency: { india: { worldwide: false } } } }],
      _joint: { findings: joint }
    };
    const snap = { result: { findings: own, summary: { usTaxUsd: 60000, counts: {} }, monitoring: { health: { score: 50, breachedLimits: 0, willBreach: 0 } } },
      countries: [{ id: "IN", estimatedTaxUsd: 1000 }, { id: "US", estimatedTaxUsd: 60000 }] };
    const out = householdSnapshot(snap, h, "r");
    expect(out.result.summary.usTaxUsd).toBe(80000);
    expect(out.countries.find((c) => c.id === "US").estimatedTaxUsd).toBe(80000);
    expect(out.countries.find((c) => c.id === "IN").estimatedTaxUsd).toBe(1000);
    expect(out.result.monitoring.health.score).toBe(out.result.summary.healthScore);
  });
});

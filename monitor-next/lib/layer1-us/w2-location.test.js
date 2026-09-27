import { describe, it, expect } from "vitest";
import { w2UsShare, effectiveUsDays } from "./w2-location.js";

// Same rule as aggregateusincome-nodes.js's w2WorkLocation.
const nra = (days) => ({ us_residency_detail: { final_us_residency_status: "NON_RESIDENT_ALIEN", us_days_current_year: days }, nra_specific: {} });

describe("W-2 work location (form mirror of the engine rule)", () => {
  it("leaves residents alone", () => {
    const resident = { us_residency_detail: { final_us_residency_status: "RESIDENT_ALIEN", us_days_current_year: 0 } };
    expect(w2UsShare({}, resident, { us_days: 0 }).usShare).toBe(1);
  });
  it("0 US days counts only when the Router agrees", () => {
    expect(w2UsShare({}, nra(0), { us_days: 0 })).toEqual({ usShare: 0, basis: "auto_outside_us" });
    expect(w2UsShare({}, nra(0), { was_in_us_this_year: false }).usShare).toBe(0);
    expect(w2UsShare({}, nra(0), {}).basis).toBe("unanswered");
    expect(effectiveUsDays(nra(0), {})).toBe(null);
  });
  it("estimates from US days, and entered workdays win", () => {
    expect(w2UsShare({}, nra(73), {}).usShare).toBeCloseTo(0.2);
    expect(w2UsShare({ workdays_in_us: 10, workdays_outside_us: 230 }, nra(73), {}).usShare).toBeCloseTo(10 / 240);
    expect(w2UsShare({}, nra(365), {}).usShare).toBe(1);
  });
});

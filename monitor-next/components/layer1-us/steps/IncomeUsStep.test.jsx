import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import IncomeUsStep from "./IncomeUsStep";
import NraStep from "./NraStep";
import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { createDefaultUsState } from "@/lib/layer1-us/schema";

// W-2 work location: shown only for a US non-resident alien, settled by US
// days (0 confirmed by the Router, or an estimate), workdays optional; the
// NRA screen's ECI counts only the US-work share.
function setup({ status = "NON_RESIDENT_ALIEN", usDays = 0, routerUsDays = 0 } = {}) {
  const s = createDefaultUsState();
  s.us_residency_detail.final_us_residency_status = status;
  s.us_residency_detail.us_days_current_year = usDays;
  s.income_us_source.has_employment_income = true;
  s.income_us_source.wages_w2 = [{ employer_name: "Acme Inc", wages_box1_usd: 60000, tax_details_collapsed_by_default: { federal_tax_withheld_usd: 12000 }, state_and_local_taxes: [], box_12_benefits: [], box_14_other: [] }];
  localStorage.setItem("wising_router_state", JSON.stringify({ us_days: routerUsDays }));
  useUsLayer1Store.setState({ usState: s });
}

describe("W-2 work location for a non-resident alien", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("0 US days: treated as work outside the US, no fields required", () => {
    setup();
    render(<IncomeUsStep />);
    expect(screen.getByText(/Treated as work done outside the US/)).toBeInTheDocument();
    expect(screen.queryByText("Workdays in the US")).toBeNull();
    expect(screen.getByText("Enter workdays instead")).toBeInTheDocument();
  });

  it("partial US days: labelled estimate", () => {
    setup({ usDays: 73, routerUsDays: 73 });
    render(<IncomeUsStep />);
    expect(screen.getByText(/Estimated from days present — 20% of these wages treated as US work/)).toBeInTheDocument();
  });

  it("not shown for a US resident", () => {
    setup({ status: "RESIDENT_ALIEN", usDays: 300, routerUsDays: 300 });
    render(<IncomeUsStep />);
    expect(screen.queryByText("Where was this work done?")).toBeNull();
  });

  it("NRA screen: India-work wages are not ECI", () => {
    setup();
    render(<NraStep />);
    expect(useUsLayer1Store.getState().usState.nra_specific.us_eci_income_usd).toBe(0);
  });
});

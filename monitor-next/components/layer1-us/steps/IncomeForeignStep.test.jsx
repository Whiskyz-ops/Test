import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import IncomeForeignStep from "./IncomeForeignStep";
import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { createDefaultUsState } from "@/lib/layer1-us/schema";

// Foreign-wage work location: the workday split is asked only when the
// US day count doesn't already settle where the work was done.
function withUsDays(days) {
  const s = createDefaultUsState();
  s.us_residency_detail.us_days_current_year = days;
  s.income_foreign_source.foreign_wages = [{ country: "IN", employer_name: "X", gross_wages_usd: 1000, foreign_tax_paid_usd: null }];
  useUsLayer1Store.setState({ usState: s });
}

describe("IncomeForeignStep foreign-wage work location", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("asks for the workday split when US days are partial", () => {
    withUsDays(200);
    render(<IncomeForeignStep />);
    expect(screen.getByText("Workdays in the US while earning this")).toBeInTheDocument();
    expect(screen.queryByText(/Treated as work performed/)).toBeNull();
  });

  it("skips the question with 365 US days (all work in the US)", () => {
    withUsDays(365);
    render(<IncomeForeignStep />);
    expect(screen.queryByText("Workdays in the US while earning this")).toBeNull();
    expect(screen.getByText(/entirely in the US/)).toBeInTheDocument();
  });

  it("skips the question with 0 US days (all work abroad)", () => {
    withUsDays(0);
    render(<IncomeForeignStep />);
    expect(screen.queryByText("Workdays in the US while earning this")).toBeNull();
    expect(screen.getByText(/entirely outside the US/)).toBeInTheDocument();
  });
});

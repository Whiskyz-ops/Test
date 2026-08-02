"use client";

import { useState } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { Card, fmtUsd } from "./_ui";
import { STEP_LABELS } from "@/lib/layer1-us/schema";

// Source: layer1_us.html panel-step-output (~line 3936), copySchema() /
// downloadSchema(). Kept intentionally simple per the porting brief — a
// read-only summary of a handful of key totals plus the full JSON export,
// not a full-fidelity re-render of every derived label in the original
// right-hand certificate sidebar.
export default function OutputStep() {
  const { usState } = useUsLayer1Store();
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(usState, null, 2);

  async function copySchema() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API can be unavailable (non-secure context, permissions) —
      // silently no-op, matching the original's best-effort copy button.
    }
  }

  function downloadSchema() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wising-us-tax-intake-${usState.metadata?.us_calendar_year ?? "export"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const summary = [
    { label: "Filing Status", value: (usState.profile.filing_status || "-").toUpperCase() },
    { label: "Residency Status", value: usState.us_residency_detail.final_us_residency_status },
    { label: "Deduction Mode", value: usState.itemized_deductions_and_credits.use_standard_or_itemized },
    { label: "SALT Paid", value: fmtUsd(usState.itemized_deductions_and_credits.state_and_local_taxes_paid_usd) },
    { label: "FEIE Claimed", value: usState.foreign_earned_income.claims_feie ? fmtUsd(usState.foreign_earned_income.feie_amount_claimed_usd) : "Not claimed" },
    { label: "FTC Baskets", value: `${(usState.ftc_inputs.ftc_baskets || []).length} basket(s)` },
    { label: "AMT Due", value: fmtUsd(usState.amt_inputs.amt_due_usd) },
    { label: "NIIT Due", value: fmtUsd(usState.niit_inputs.niit_due_usd) },
    { label: "Federal Withholding", value: fmtUsd(usState.withholding_and_estimated.federal_withholding_total_usd) },
    { label: "State Withholding", value: fmtUsd(usState.withholding_and_estimated.state_withholding_total_usd) },
    { label: "Files 1040-NR", value: usState.nra_specific.files_form_1040nr ? "Yes" : "No" },
    { label: "Treaty Claims", value: `${(usState.nra_specific.treaty_rate_claims || []).length} claim(s)` },
    { label: "State Footprint", value: `${(usState.state_residency.total_states_footprint || []).length} state(s)` },
    { label: "Primary State", value: usState.state_residency.primary_state_of_residence || "-" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display font-bold text-lg text-head">{STEP_LABELS["step-output"]}</h2>
        <p className="text-[11px] text-muted mt-1">
          Review the compiled tax data model and export it for compliance storage.
        </p>
      </div>

      <Card title="Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {summary.map((s) => (
            <div key={s.label} className="p-3 bg-white/[0.02] border border-line rounded-xl flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted font-semibold">{s.label}</span>
              <span className="text-sm font-mono font-bold text-head break-words">{String(s.value)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="tax_compliance_schema.json"
        right={
          <div className="flex gap-2">
            <button
              onClick={copySchema}
              className="px-3 py-1.5 bg-white/[0.05] hover:bg-brandGreen/20 hover:text-brandGreen border border-line rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
            >
              {copied ? "Copied!" : "Copy Schema"}
            </button>
            <button
              onClick={downloadSchema}
              className="px-3 py-1.5 bg-brandGreen text-black hover:brightness-110 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
            >
              Download JSON
            </button>
          </div>
        }
      >
        <pre className="bg-black/40 border border-line rounded-2xl p-4 text-[11px] text-brandGreen font-mono h-96 overflow-auto whitespace-pre-wrap select-all">
          {json}
        </pre>
      </Card>
    </div>
  );
}

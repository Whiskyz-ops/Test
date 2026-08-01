"use client";
import { useState } from "react";
import { useUsLayer1Store } from "@/lib/layer1-us/store";
import { Card, SectionLabel, Field, TextInput, NumberInput, Select } from "./_ui";

// Ported from layer1_us.html:1711-1788 (panel-step-bank-sync, "Screen 4 —
// Bank Sync & Statements"). In the original this is mostly UI theater: a
// Plaid-connect button (openPlaidSimulator, a modal mock with no real
// integration) and a statement-upload dropzone (a plain alert()) — neither
// writes any real state. Ported faithfully as non-functional affordances
// here for the same reason: there is no real bank-linking backend to wire
// up. The one piece of the panel that DOES write real tax data is the "US
// Bank Interest" field, whose oninput handler in the source explicitly
// mirrors it into the Passive/Income-US screen's interest field — ported
// here as a genuine write to income_us_source.interest_us_bank_usd via the
// shared store, so it stays in sync with whatever IncomeUsStep shows.
//
// Routing/account numbers are refund-routing logistics only — no dag_py
// node reads them anywhere — so they're kept as local, non-persisted
// component state rather than added to the shared schema.
export default function BankSyncStep() {
  const usState = useUsLayer1Store((s) => s.usState);
  const setField = useUsLayer1Store((s) => s.setField);
  const [linked, setLinked] = useState(false);
  const [bankName, setBankName] = useState("");
  const [acctType, setAcctType] = useState("checking");
  const [routing, setRouting] = useState("");
  const [acctNumber, setAcctNumber] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-head tracking-wide font-display uppercase">
          Screen 4 — Bank Sync &amp; Statements
        </h2>
        <p className="text-xs text-muted mt-1">
          Connect your domestic accounts or upload statements for automated 1099 generation, expense
          categorization, and refund routing.
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-gradient-to-r from-accent2/10 to-transparent border border-accent2/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-head font-bold text-lg">Automate Intake with Plaid</h3>
          <p className="text-xs text-muted mt-1 max-w-md">
            Securely link your primary bank account. We&apos;ll instantly scan for freelance income,
            interest, and foreign transfers to auto-configure your compliance matrix.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLinked(true)}
          className="whitespace-nowrap px-6 py-3 bg-accent2 hover:bg-accent2/80 text-black font-black uppercase tracking-widest text-xs rounded-xl transition-all shrink-0"
        >
          {linked ? "✓ Linked (simulated)" : "Link Bank Account"}
        </button>
      </div>

      <Divider label="OR UPLOAD STATEMENTS" />

      <div
        className="border-2 border-dashed border-accent2/30 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-accent2 transition-colors cursor-pointer bg-accent2/5"
        onClick={() => window.alert("File picker for Bank Statements would open here (not wired — no backend).")}
      >
        <span className="text-4xl mb-3">📄</span>
        <span className="text-sm font-bold text-head mb-2">Upload Bank Statements (PDF/CSV)</span>
        <span className="text-[10px] text-muted max-w-md">
          Drag and drop your monthly statements. Our AI will extract interest income and categorize
          deductible expenses automatically.
        </span>
      </div>

      <Divider label="OR MANUAL ENTRY" />

      <Card title="Primary Domestic Account" sub="Used for refund direct-deposit / balance-due direct-debit routing only — not read by the tax engine.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Bank Name">
            <TextInput value={bankName} onChange={setBankName} placeholder="Chase, Bank of America, etc." />
          </Field>
          <Field label="Account Type">
            <Select
              value={acctType}
              onChange={setAcctType}
              options={[
                { value: "checking", label: "Personal Checking" },
                { value: "savings", label: "Personal Savings" },
                { value: "business_checking", label: "Business Checking" },
                { value: "business_savings", label: "Business Savings" },
                { value: "trust", label: "Trust / Escrow" },
              ]}
            />
          </Field>
          <Field label="Routing Number">
            <TextInput value={routing} onChange={setRouting} placeholder="9-digit ABA Routing" />
          </Field>
          <Field label="Account Number">
            <input
              type="password"
              value={acctNumber}
              onChange={(e) => setAcctNumber(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head font-mono focus:outline-none focus:border-brandGreen/50"
            />
          </Field>
          <Field
            label="US Bank Interest (USD)"
            hint="Box 1 of Form 1099-INT — mirrors income_us_source.interest_us_bank_usd"
          >
            <NumberInput
              value={usState.income_us_source.interest_us_bank_usd}
              onChange={(v) => setField("income_us_source.interest_us_bank_usd", v)}
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}

function Divider({ label }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-px bg-line flex-1" />
      <span className="text-[9px] font-black uppercase tracking-widest text-muted">{label}</span>
      <div className="h-px bg-line flex-1" />
    </div>
  );
}

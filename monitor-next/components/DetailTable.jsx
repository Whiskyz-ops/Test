"use client";
import { STATUS, STATUS_META, approachPct, fmtUsd } from "@/lib/logic";

function StatusBadge({ status }) {
  const m = STATUS_META[status];
  return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
      style={{ background: m.soft, color: m.text }}>
      {m.label}
    </span>
  );
}

function RegionCell({ r }) {
  return (
    <div className="flex items-center gap-2">
      {r.type === "country"
        ? <span className="text-base">{r.flag}</span>
        : <span className="text-[10px] font-black bg-white/10 rounded px-1.5 py-0.5">{r.abbr}</span>}
      <span className="font-semibold">{r.name}</span>
    </div>
  );
}

function Tracker({ r }) {
  const pct = Math.min(100, Math.round(approachPct(r) * 100));
  const over60 = pct >= 60;
  const color = over60 ? "#f59e0b" : "#22c55e";
  return (
    <div className="w-44">
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-white/50">{pct}% of threshold</span>
        {over60 && <span className="text-approaching font-bold">⚠ alert</span>}
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: pct + "%", background: color }} />
      </div>
    </div>
  );
}

const YesNo = ({ v }) => (
  <span className={v ? "text-brandCyan font-semibold" : "text-white/40"}>{v ? "Yes" : "No"}</span>
);

const TH = ({ children, right }) => (
  <th className={"px-4 py-2.5 text-[10px] uppercase tracking-widest text-white/40 font-bold " + (right ? "text-right" : "text-left")}>{children}</th>
);
const TD = ({ children, right, mono }) => (
  <td className={"px-4 py-3 text-[13px] " + (right ? "text-right " : "") + (mono ? "font-mono " : "")}>{children}</td>
);

export default function DetailTable({ category, regions }) {
  if (!regions.length) {
    return <div className="text-center text-white/40 text-sm py-10">No regions in this category.</div>;
  }

  // Column set by category (per spec).
  let head, row;
  if (category === STATUS.EXPOSED) {
    head = (<tr>
      <TH>Region</TH><TH>Status</TH><TH right>Estimated Liability</TH><TH>Trigger Date</TH><TH right>Total Volume</TH>
    </tr>);
    row = (r) => (<tr key={r.id} className="border-t border-line hover:bg-white/[0.03]">
      <TD><RegionCell r={r} /></TD>
      <TD><StatusBadge status={r.status} /></TD>
      <TD right mono><span className="text-exposed">{fmtUsd(r.estimatedLiabilityUsd)}</span></TD>
      <TD>{r.triggerDate || "—"}</TD>
      <TD right mono>{fmtUsd(r.economic.volumeUsd)}</TD>
    </tr>);
  } else if (category === STATUS.APPROACHING) {
    head = (<tr>
      <TH>Region</TH><TH>Tracker</TH><TH>Volume ($)</TH><TH>Volume (#)</TH><TH>Physical Presence</TH>
    </tr>);
    row = (r) => (<tr key={r.id} className="border-t border-line hover:bg-white/[0.03]">
      <TD><RegionCell r={r} /></TD>
      <TD><Tracker r={r} /></TD>
      <TD mono><span className="text-white/85">{fmtUsd(r.economic.volumeUsd)}</span> <span className="text-white/35">/ {fmtUsd(r.economic.volumeLimitUsd)}</span></TD>
      <TD mono><span className="text-white/85">{r.economic.txnCount}</span> <span className="text-white/35">/ {r.economic.txnLimit}</span></TD>
      <TD><YesNo v={r.physicalPresence} /></TD>
    </tr>);
  } else if (category === STATUS.NEXUS) {
    head = (<tr>
      <TH>Region</TH><TH>Trigger Date</TH><TH right>Total Volume</TH><TH>Physical Presence</TH>
    </tr>);
    row = (r) => (<tr key={r.id} className="border-t border-line hover:bg-white/[0.03]">
      <TD><RegionCell r={r} /></TD>
      <TD>{r.triggerDate || "—"}</TD>
      <TD right mono>{fmtUsd(r.economic.volumeUsd)}</TD>
      <TD><YesNo v={r.physicalPresence} /></TD>
    </tr>);
  } else {
    // All regions — general overview
    head = (<tr>
      <TH>Region</TH><TH>Status</TH><TH right>Est. Liability</TH><TH right>Total Volume</TH><TH>Physical Presence</TH>
    </tr>);
    row = (r) => (<tr key={r.id} className="border-t border-line hover:bg-white/[0.03]">
      <TD><RegionCell r={r} /></TD>
      <TD><StatusBadge status={r.status} /></TD>
      <TD right mono>{r.estimatedLiabilityUsd ? fmtUsd(r.estimatedLiabilityUsd) : "—"}</TD>
      <TD right mono>{fmtUsd(r.economic.volumeUsd)}</TD>
      <TD><YesNo v={r.physicalPresence} /></TD>
    </tr>);
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
      <table className="w-full">
        <thead className="bg-white/[0.02]">{head}</thead>
        <tbody>{regions.map(row)}</tbody>
      </table>
    </div>
  );
}

"use client";
import { STATUS, STATUS_META, approachPct, fmtUsd } from "@/lib/logic";

function StatusBadge({ status }) {
  const m = STATUS_META[status];
  return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
      style={{ background: m.soft, color: m.text }}>{m.label}</span>
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
        <span className="text-white/50">{pct}% to residency</span>
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
const Reporting = ({ r }) =>
  r.reporting
    ? <span><span className="text-white/85">{fmtUsd(r.reporting.value)}</span> <span className="text-white/35">/ {fmtUsd(r.reporting.limit)}</span> <span className="text-white/40 text-[10px]">{r.reporting.label}</span></span>
    : <span className="text-white/35">—</span>;
const Days = ({ r }) => (
  <span><span className="text-white/85">{r.residency.days}</span> <span className="text-white/35">/ {r.residency.threshold}d</span></span>
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

  let head, row;
  if (category === STATUS.EXPOSED) {
    head = (<tr><TH>Region</TH><TH>Status</TH><TH right>Estimated Tax</TH><TH>Resident Since</TH><TH right>Income Exposed</TH></tr>);
    row = (r) => (<tr key={r.id} className="border-t border-line hover:bg-white/[0.03]">
      <TD><RegionCell r={r} /></TD>
      <TD><StatusBadge status={r.status} /></TD>
      <TD right mono><span className="text-exposed">{fmtUsd(r.estimatedTaxUsd)}</span></TD>
      <TD>{r.triggerDate || "—"}</TD>
      <TD right mono>{fmtUsd(r.incomeExposedUsd)}</TD>
    </tr>);
  } else if (category === STATUS.APPROACHING) {
    head = (<tr><TH>Region</TH><TH>Tracker</TH><TH>Days Present</TH><TH>Reporting Exposure</TH><TH>Physical Presence</TH></tr>);
    row = (r) => (<tr key={r.id} className="border-t border-line hover:bg-white/[0.03]">
      <TD><RegionCell r={r} /></TD>
      <TD><Tracker r={r} /></TD>
      <TD mono><Days r={r} /></TD>
      <TD mono><Reporting r={r} /></TD>
      <TD><YesNo v={r.physicalPresence} /></TD>
    </tr>);
  } else if (category === STATUS.NEXUS) {
    head = (<tr><TH>Region</TH><TH>Triggered</TH><TH>Reason ($0 tax)</TH><TH>Days Present</TH><TH>Physical Presence</TH></tr>);
    row = (r) => (<tr key={r.id} className="border-t border-line hover:bg-white/[0.03]">
      <TD><RegionCell r={r} /></TD>
      <TD>{r.triggerDate || "—"}</TD>
      <TD><span className="text-white/60">{r.reason || "Filing / disclosure only"}</span></TD>
      <TD mono><Days r={r} /></TD>
      <TD><YesNo v={r.physicalPresence} /></TD>
    </tr>);
  } else {
    head = (<tr><TH>Region</TH><TH>Status</TH><TH right>Est. Tax</TH><TH>Days Present</TH><TH>Physical Presence</TH></tr>);
    row = (r) => (<tr key={r.id} className="border-t border-line hover:bg-white/[0.03]">
      <TD><RegionCell r={r} /></TD>
      <TD><StatusBadge status={r.status} /></TD>
      <TD right mono>{r.estimatedTaxUsd ? fmtUsd(r.estimatedTaxUsd) : "—"}</TD>
      <TD mono><Days r={r} /></TD>
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

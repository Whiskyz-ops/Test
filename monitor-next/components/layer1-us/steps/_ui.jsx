"use client";

// Shared presentational primitives for the layer1-us step components.
// Not one of the 8 assigned step files itself — a small internal helper
// module the 8 steps import to stay visually consistent (per the dark-theme
// Tailwind cheat sheet in the porting brief) without duplicating ~40 lines
// of boilerplate per file.

export const US_STATES = [
  { code: "", name: "-- Select --" }, { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" }, { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "Washington DC" }, { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" }, { code: "OTHER", name: "Other / Non-US" },
];

export const inputCls =
  "w-full rounded-lg bg-white/[0.03] border border-line px-3 py-2 text-sm text-head focus:outline-none focus:border-brandGreen/50";

export const Card = ({ title, sub, children, right }) => (
  <section className="rounded-2xl bg-surface border border-line shadow-card p-4 flex flex-col gap-4">
    {(title || right) && (
      <div className="flex items-start justify-between gap-3">
        <div>
          {title && <h3 className="font-display font-bold text-head">{title}</h3>}
          {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
        </div>
        {right}
      </div>
    )}
    {children}
  </section>
);

export const SectionLabel = ({ children, right }) => (
  <div className="flex items-center justify-between">
    <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{children}</div>
    {right}
  </div>
);

export const Field = ({ label, hint, children }) => (
  <div className="flex flex-col gap-1">
    {label && (
      <label className="text-[11px] uppercase tracking-wide text-muted font-semibold flex items-center justify-between">
        <span>{label}</span>
        {hint && <span className="text-[9px] normal-case tracking-normal font-normal text-muted/70">{hint}</span>}
      </label>
    )}
    {children}
  </div>
);

export function TextInput({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}

export function NumberInput({ value, onChange, placeholder = "0" }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value === null || value === undefined ? "" : value}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.-]/g, "");
        onChange(raw === "" ? null : parseFloat(raw) || 0);
      }}
      className={inputCls + " font-mono"}
    />
  );
}

export function DateInput({ value, onChange }) {
  return (
    <input
      type="date"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={inputCls}
    />
  );
}

export function Select({ value, onChange, options, placeholder }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function StateSelect({ value, onChange }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {US_STATES.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      onClick={() => onChange(!checked)}
      className={
        "relative shrink-0 w-9 h-5 rounded-full transition-colors " +
        (checked ? "bg-brandGreen" : "bg-white/20")
      }
    >
      <span
        className={
          "absolute top-[2px] left-[2px] h-4 w-4 rounded-full bg-white transition-transform " +
          (checked ? "translate-x-full" : "")
        }
      />
    </button>
  );
}

export function ToggleRow({ label, sub, checked, onChange }) {
  return (
    <div className="flex items-center justify-between p-3 bg-white/[0.02] border border-line rounded-xl gap-3">
      <div className="flex flex-col">
        <span className="text-sm font-bold text-head">{label}</span>
        {sub && <span className="text-[11px] text-muted mt-0.5">{sub}</span>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded bg-white/[0.03] border-line text-brandGreen focus:ring-brandGreen"
      />
      {label && <span className="text-xs text-body">{label}</span>}
    </label>
  );
}

export function RemoveButton({ onClick, label = "Remove" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[9px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
    >
      {label}
    </button>
  );
}

export function AddButton({ onClick, label = "+ Add" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 bg-white/[0.05] hover:bg-brandGreen/20 hover:text-brandGreen border border-line rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0"
    >
      {label}
    </button>
  );
}

export const fmtUsd = (n) =>
  "$" + Math.round(Number(n) || 0).toLocaleString("en-US");

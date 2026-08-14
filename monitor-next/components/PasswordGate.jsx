"use client";

import { useEffect, useState } from "react";

// Client-side access gate for the whole app. This is a static export
// (next.config.mjs: output: "export", deployed as plain static files per
// vercel.json — no server, no middleware, no API routes at runtime), so
// there is no way to enforce this at the network/server level; this is a
// deterrent for casual visitors and search engines, not real security — the
// password below ships in the client JS bundle like any static-site secret
// would, and a technically determined visitor can bypass it. Requested and
// accepted with that tradeoff explicit (Vercel's own Deployment Password
// Protection was the actually-secure alternative, declined in favor of this).
//
// How it actually blocks content (not just visually hides it): every route
// component in this app (app/page.jsx, app/layer1-us/page.jsx, and every
// step under components/layer1-us/steps/) is itself a "use client" component,
// not a Server Component — so this gate's conditional `return` genuinely
// controls whether that subtree is ever rendered at all (during the
// build-time static-export pass AND at runtime), not just whether it's
// visible in the DOM. Unauthenticated, the exported HTML for every route
// contains only this gate's markup.
const SITE_PASSWORD = "20003011";
const STORAGE_KEY = "wising_site_unlocked";

export default function PasswordGate({ children }) {
  // Starts false on both the server/build pass and the client's first
  // render (no window at build time; matching initial value client-side
  // avoids a hydration mismatch) — only flips true after the effect below
  // confirms a stored unlock, or after a correct submit.
  const [authed, setAuthed] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "true") {
        setAuthed(true);
      }
    } catch {
      // localStorage can throw (private mode, disabled storage) — fall
      // through to the password form, same as never having unlocked it.
    }
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    if (value === SITE_PASSWORD) {
      try {
        window.localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // Non-fatal — worst case the visitor re-enters it next visit.
      }
      setAuthed(true);
      setError(false);
    } else {
      setError(true);
      setValue("");
    }
  }

  if (authed) return children;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-canvas px-4">
      <form
        onSubmit={handleSubmit}
        autoComplete="off"
        className="w-full max-w-sm rounded-2xl bg-surface border border-line shadow-card p-6 flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted">Restricted Access</span>
          <h1 className="text-lg font-display font-bold text-head">Enter Access Code</h1>
        </div>
        {/* Masked on purpose (type="password"), per explicit request — note
            this reintroduces the tradeoff the earlier BUG FIX comment on
            this file used to warn about: Chrome's Safe Browsing treats any
            type="password" input on an unbranded/no-trust-history domain
            (a vercel.app preview URL) as a potential credential-phishing
            pattern and may show a "you just entered your password on a
            deceptive site" warning, regardless of whether the value is a
            real account credential. autoComplete="off" and a non-password
            `name` are kept to reduce (not eliminate) that risk. */}
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          name="site-access-code"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(false);
          }}
          placeholder="Access code"
          className={
            "w-full rounded-lg bg-white/[0.03] border px-3 py-2.5 text-sm text-head font-mono focus:outline-none " +
            (error ? "border-red-500/60 focus:border-red-500" : "border-line focus:border-brandGreen/50")
          }
        />
        {error && <p className="text-xs text-red-400">Incorrect access code. Try again.</p>}
        <button
          type="submit"
          className="w-full rounded-lg bg-brandGreen text-black font-black uppercase text-xs tracking-widest py-2.5 hover:brightness-110 transition-all"
        >
          Continue
        </button>
      </form>
    </div>
  );
}

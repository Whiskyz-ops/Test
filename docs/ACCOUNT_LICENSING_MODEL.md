# Account Model — Corporate vs. Professional Licensing

**28 July 2026.** Records a licensing/access-model decision reached through
direct product discussion, distinct from `docs/CORRIDOR_COMPLEXITY_ROADMAP.md`
(which scopes *what entities can be modeled*) — this document scopes *who
gets to see how many clients*, a different axis entirely.

## 1. The rule

- **A corporation that buys this software uses it for itself only.** One
  entity, its own India-US tax position — however complex, per
  `docs/CORRIDOR_COMPLEXITY_ROADMAP.md` — and nothing else. It does not get
  to onboard other entities or use the product to serve third parties.
- **A tax professional that buys this software gets their whole client
  book.** Multiple clients, added and managed the way the existing Client
  Registry already supports.

## 2. Current state — verified, not enforced today

Checked directly against `WISING.ClientRegistry`
(`prototypes/graph-pilot/constants.js`): it is pure storage isolation —
add/list/remove client records in `localStorage` — with **no concept of
account type, license tier, or seat limits anywhere in it.** Right now,
any user of the product, corporate or professional, can click "+ Add
Client" and build out an unlimited book. Nothing in the code distinguishes
them. This rule is a stated intention today, not a guarantee.

## 3. Two levels of "making sure," and why only one is real

- **Level 1 — contractual/policy only.** Sell a corporate license
  contractually restricted to one entity, and a professional license that
  isn't. Zero engineering, immediate — but not actually enforced. Nothing
  stops a corporate buyer from adding a second client if they choose to, or
  if an employee doesn't know the restriction exists.
- **Level 2 — an actual technical gate.** An account-type flag (corporate
  vs. professional) set at provisioning. A corporate account hard-caps at
  exactly one client record — the "+ Add Client" action disabled or
  rejected outright for that account type. A professional account keeps
  today's unlimited multi-client behavior unchanged. This is the only level
  that actually guarantees the rule rather than trusting it.

## 4. The blocking dependency

Level 2 cannot be built today. It requires an account/auth/multi-tenancy
layer that does not exist at all yet — `docs/DEVELOPER_HANDOFF.md` records
this plainly: *"Auth / multi-tenant / persistence — none exists yet."* The
entire product currently runs on anonymous browser `localStorage`; there is
no login, no account, and no license record anywhere to attach a
corporate-vs-professional flag to in the first place.

## 5. What this means going forward

This rule is **not actionable in the current prototype** — but it must not
be forgotten when auth/multi-tenancy eventually gets built, since that is
exactly when it becomes real:

- The account-type field (corporate vs. professional) needs to be part of
  the *initial* auth/account schema design, not retrofitted after the fact.
- `ClientRegistry`'s `addClient()` path, and wherever "+ Add Client" is
  exposed in the UI, needs a gate check against that account-type field
  once it exists.
- Until then, this document is the record of the requirement — carried
  forward the same way `docs/BUSINESS_ENTITY_ARCHITECTURE.md` §3.6 and
  `docs/CORRIDOR_COMPLEXITY_ROADMAP.md` §2 (item 10) carry forward their own
  explicit scope decisions, so it isn't silently dropped between now and
  whenever auth work actually starts.

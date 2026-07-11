# UAT analytics — event catalog

The in-app tracker (`monitor-next/lib/analytics.js`) emits these events. It is
**off** unless the build sets `NEXT_PUBLIC_UAT_ENABLED=1` (see `monitor-next/.env.example`).

## How a tester is identified
Hand each participant a link with their id: `https://<uat-url>/?uat=priya-01`. The id
is stored and attached to every event as `pid`, so behavior ties back to the person
in the results tracker. A random `sid` groups one browser session.

## Events

| Event | Fires when | Props |
|---|---|---|
| `app_open` | The Monitor page mounts | — |
| `view_change` | User switches sidebar view | `view` (monitor, clients, residency, filings, documents, holdings, business, accounts, integrations) |
| `kpi_filter` | User clicks a KPI category card | `category` (exposed, approaching, nexus, all) |
| `region_scope` | User changes the region dropdown / drills into the US | `region` |
| `data_mode` | Engine data mode resolves | `mode` (demo, live) |
| `profile_load` | A test profile is loaded | `profile` (the profile id) |

Every record also carries: `t` (ISO time), `sid`, `pid`, `path`.

## Collecting the data
- **No endpoint set** → events buffer in the browser (`localStorage` key `uat_events`, last 1000).
  At the end of a session run `window.__uat.export()` in the console to copy them out.
- **Endpoint set** (`NEXT_PUBLIC_UAT_ANALYTICS_URL`) → each event is also POSTed
  (via `navigator.sendBeacon`) to your collector. Easiest free option: a Google Apps
  Script web app that appends the JSON body to a Sheet. Point PostHog/your own API here too.

## What to read from it
- **Coverage** — did each participant actually reach every view? (`view_change` per `pid`)
- **Drop-off** — which views nobody opens, or where sessions end.
- **Profile mix** — were the hard profiles (Founder, dual-resident) exercised?
- Pair this with the results tracker: low usage on a view whose cases also failed = a real problem area, not just a missed test.

## Privacy
No third-party scripts, no cookies, no PII beyond the participant id you assign.
Only interaction events are captured — never form field values or taxpayer data.

# Central analytics collector — setup (optional)

Wire the in-app UAT analytics to a Google Sheet so events land centrally, with no
manual `window.__uat.export()`. Free, ~5 minutes, no backend to run.

> **Only worth it** for a cohort bigger than a handful, or testing across many
> sessions. For a small first pilot, the built-in local buffer is enough — skip this.

## Deploy the collector (your Google account)

1. Create a new **Google Sheet** (this is where events land).
2. In it: **Extensions → Apps Script**.
3. Delete the placeholder, paste the contents of [`collector.gs`](./collector.gs), **Save**.
4. **Deploy → New deployment → ⚙️ → Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
5. **Authorize** when prompted, then **copy the Web app URL** (ends in `/exec`).
6. Sanity check: open that URL in a browser — you should see `{"ok":true,...}`.

## Point the app at it

In the UAT build's `monitor-next/.env.local` (see `.env.example`):

```
NEXT_PUBLIC_UAT_ENABLED=1
NEXT_PUBLIC_UAT_ANALYTICS_URL=https://script.google.com/macros/s/…/exec
```

Rebuild / redeploy the UAT build (`npm run build`).

## Verify end-to-end

1. Open the deployed app with a test tag: `https://<uat-url>/?uat=test-01`.
2. Click around — switch views, load a profile, click a KPI card.
3. In the Sheet, the **`events`** tab fills with rows: `received_at, event_time,
   participant, session, event, props, path`. You should see `participant = test-01`.

## Notes

- The app sends via `navigator.sendBeacon` — fire-and-forget, no CORS preflight, so
  Apps Script "Anyone" access is all that's needed. Events are also still buffered
  locally, so a transient network blip loses nothing you can't re-export.
- Only interaction events are sent (see `analytics-events.md`) — never form values
  or taxpayer data.
- To analyze: pivot the Sheet by `participant` (coverage per tester) or by `event`
  (which views get used), and read it alongside `results-tracker.csv`.
- Prefer PostHog/your own API instead? Point `NEXT_PUBLIC_UAT_ANALYTICS_URL` there;
  the payload is the flat JSON shown above.

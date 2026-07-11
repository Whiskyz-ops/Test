# UAT Toolkit — Cross-Border Monitor

Everything needed to run **User Assessment Testing** once the product is in real
users' hands: hand it to a group of users, have them work through it, and **track
each user and capture their assessment**.

The test scenarios live in [`../UAT_PLAN_cross-border-monitor.md`](../UAT_PLAN_cross-border-monitor.md).
This folder is the **capture + tracking layer** on top of them.

## The four capture channels

| Channel | File | What it captures | Where it goes |
|---|---|---|---|
| **Per-user results** | `uat-cases.csv` + `results-tracker.csv` | Each user's pass/fail + notes per scenario | A spreadsheet (Google Sheets / Excel) |
| **Feedback & ratings** | `feedback-survey.md` + `feedback-questions.csv` | Usability (SUS), per-view confidence, trust, NPS, open feedback | A Google Form / Typeform |
| **Usage analytics** | `../monitor-next/lib/analytics.js` + `analytics-events.md` | What users actually do (views, profiles, KPI, drill) | Local buffer, or a webhook you set |
| **Bug / issue intake** | `../.github/ISSUE_TEMPLATE/uat_bug.yml`, `uat_feedback.yml` | Structured, de-dupable problem reports | GitHub Issues (labeled `uat`) |

## How to run a round

1. **Deploy a UAT build.** Static export (`cd monitor-next && npm run build` → `out/`,
   per root `vercel.json`) with `NEXT_PUBLIC_UAT_ENABLED=1` set so analytics is on.
2. **Assign participant IDs.** Give each user a tagged link: `https://<uat-url>/?uat=<id>`
   (e.g. `?uat=priya-01`). That id threads through analytics, the tracker, the survey,
   and their bug reports — one identity everywhere.
3. **Give each user their scenarios** from the UAT plan (or a subset by role). They
   record pass/fail as they go (or a facilitator does) into `results-tracker.csv`.
4. **They file problems** as GitHub issues via the "UAT — Bug report" template.
5. **They finish with the survey** (`feedback-survey.md`).
6. **You roll it up** (see below) and decide ship / ship-with-fixes / not-ready.

## Reading the results

- **Pass rate** — pivot `results-tracker.csv` by `Result`; break down by `CaseID`
  (weakest scenarios) and by `ParticipantID` (who struggled).
- **Usability** — median SUS from the survey (≥68 is above average); any view whose
  task-confidence averages < 3 is a red flag.
- **NPS** — % promoters (9–10) − % detractors (0–6).
- **Bugs** — count open `uat` issues by severity; Critical/High must be zero to accept.
- **Coverage** — from analytics, confirm every participant actually reached every view;
  low usage on a view whose cases also failed is a real problem, not a missed test.

Record the four numbers (pass rate, SUS, NPS, open Critical/High bugs) on the
UAT plan's sign-off sheet.

## Notes

- **Analytics is off by default** and captures only interaction events (never field
  values or taxpayer data). See `analytics-events.md`.
- The GitHub issue forms take effect once this branch is the repo's default (or after
  merge); until then, testers can still open issues and pick the templates.
- Everything here is spreadsheet/Form/GitHub-based — no extra backend to stand up.

# WISING Cross-Border Monitor — UAT Feedback Survey

Each participant completes this **after** working through their assigned scenarios.
It captures the subjective assessment that pass/fail can't. Deliver it as a Google
Form / Typeform (import `feedback-questions.csv`), or on paper. Tag every response
with the participant's ID so it ties back to the results tracker.

---

## Part 1 — About you
1. **Participant ID** (from your test link, e.g. `priya-01`): ________
2. **Your role** (tax preparer / reviewer / partner / ops / other): ________
3. **Cross-border tax experience** (◯ <1 yr ◯ 1–3 ◯ 3–7 ◯ 7+ years)

## Part 2 — System Usability Scale (SUS)
Rate each 1 (Strongly disagree) → 5 (Strongly agree). *(Standard 10-item SUS;
score 0–100 with the formula in "Scoring" below — a benchmark of ≥68 is "above average".)*

1. I think I would like to use this Monitor frequently. `1 2 3 4 5`
2. I found the Monitor unnecessarily complex. `1 2 3 4 5`
3. I thought the Monitor was easy to use. `1 2 3 4 5`
4. I would need support from a technical person to use this. `1 2 3 4 5`
5. The views (Monitor, Residency, Filings…) were well integrated. `1 2 3 4 5`
6. There was too much inconsistency in the Monitor. `1 2 3 4 5`
7. Most people would learn this very quickly. `1 2 3 4 5`
8. The Monitor was very awkward to use. `1 2 3 4 5`
9. I felt confident using the Monitor. `1 2 3 4 5`
10. I needed to learn a lot before I could get going. `1 2 3 4 5`

## Part 3 — Task confidence (per view)
For each area you used, rate how well it did its job — 1 (poor) → 5 (excellent), or N/A:
- Monitor overview (map, KPIs, exposure table) `1 2 3 4 5 · N/A`
- Residency & DTAA `1 2 3 4 5 · N/A`
- Filings (FTC, Tax Computation, apportionment) `1 2 3 4 5 · N/A`
- Documents to file `1 2 3 4 5 · N/A`
- Holdings (income & assets) `1 2 3 4 5 · N/A`
- Business & entities `1 2 3 4 5 · N/A`
- Accounts (reporting limits) `1 2 3 4 5 · N/A`
- Clients portfolio `1 2 3 4 5 · N/A`

## Part 4 — Trust & correctness (this is a tax product)
1. Did any number look **wrong** or that you couldn't reconcile? (Yes/No — if yes, which view & value): ________
2. Were the **conflicts / recommendations** ones you'd actually act on? (◯ Yes, all ◯ Mostly ◯ Some ◯ No)
3. Would you trust this to **triage a real client's** cross-border exposure? (◯ Yes ◯ With checks ◯ Not yet) — why: ________

## Part 5 — Open feedback
1. What was the **single most useful** thing?
2. What was the **most confusing or frustrating**?
3. One thing you'd **add or change** first?
4. Anything that **stopped you** completing a task? (also file it as a bug — see the repo's "UAT — Bug report" issue)

## Part 6 — Overall
1. **NPS** — How likely are you to recommend this to a colleague? `0 1 2 3 4 5 6 7 8 9 10`
2. Overall readiness (◯ Ship ◯ Ship with fixes ◯ Not ready)

---

### Scoring
- **SUS**: odd items → (score − 1); even items → (5 − score); sum the 10 adjusted values × 2.5 = SUS 0–100. Report the **median** across participants; flag anyone < 50.
- **Task confidence**: mean per view; any view averaging < 3 is a red flag.
- **NPS**: % promoters (9–10) − % detractors (0–6).
- Roll these three numbers up beside the results-tracker pass rate in the sign-off.

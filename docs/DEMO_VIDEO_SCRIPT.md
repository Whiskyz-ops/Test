# WISING demo video: Rohan & Priya Mehta (2:30)

**Target:** 2:30 (YC limit 3:00). About 250 spoken words; the clicks and pauses fill the rest.

**Kept simple:** two browser tabs, four screens (Clients, Monitor, Filings, Priya's India form), one live change.

**Story:** Rohan and Priya file one joint US return, and India taxes each of them separately. The Monitor's household card shows both of them side by side, so both get equal weight on the same screen. The filing calendar shows what's due in both countries. Then one change on Priya's India form, a salary, updates both spouses at once.

Every figure and on-screen text below was measured by running this exact flow on the current build in a fresh browser. Countdowns ("in 73d") depend on the day you record, so read them off the screen.

---

## How WISING fits together

Every client has their own set of input forms. The engine reads them and recalculates whenever anything on them changes. The Monitor is where the results show up.

**Input layers** (what the CPA enters):
- **Layer 0 · Router** (`router.html`): a short questionnaire that decides which countries apply (India only, US only, or cross-border). It records citizenship, green card and US days, and opens the right Layer 1 forms.
- **Layer 1 · India** (`layer1_india.html`): India intake under Indian rules, by quarter (Apr–Mar year). It covers residency (days in India, days worked there), income by head, treaty claims, bank accounts, and TDS already deducted.
- **Layer 1 · US** (`layer1_us.html`): US intake under US rules (Jan–Dec year). It covers filing status and the link to a spouse, W-2 wages, foreign income, retirement contributions, foreign bank accounts, withholding and estimated payments, and state of residence.

**Engine:** works out residency in both countries, both countries' tax, the US foreign tax credit and India's relief. For a married couple it builds the joint US return from both spouses' files. Then it checks everything against the rules and raises conflicts.

**The Monitor** (what the CPA reviews):
- **Overview:** *Clients* is the firm's whole book. *Monitor* is one client's dashboard: the household's joint return, a map of each country's status, tax paid and unpaid, and conflicts grouped by root cause.
- **Prepare:** *Residency*, *Reconciliation* (income and tax in both countries side by side, and how the double tax is relieved), *Withholding*, *Filings*.
- **Source data:** *Holdings*, *Business*, *Accounts*.

The "Layer 1: Router · India · US" links at the top right of the Monitor open the selected client's input forms.

---

## Set up (off camera, about 2 minutes)

1. Open a **new incognito window**. Go to demo.wising.app and enter the password. You land on **Clients**.
2. The button next to ↻ Refresh should read **"↺ Reset example"**. If it reads **"↺ Edited – Reset"**, click it.
3. In the client switcher (green pill, top left) pick **Priya Mehta**, then Cmd/Ctrl-click **Layer 1: India** (top right). That's **tab 2**. In it, click **1. Financial Life Snapshot** and leave it there.
4. Back in tab 1, click **Clients** in the left menu. Recording starts here.
5. Browser zoom 90%. Hide the bookmarks bar and notifications.

---

## The script

### 0:00–0:15 · The problem · tab 1, Clients

**Screen:** Client Portfolio with Rohan and Priya Mehta, both tagged "Joint with …".

> "Rohan and Priya Mehta both earn in India and the US. The US taxes them together on one joint return. India taxes each of them separately. Today their CPA juggles two countries, two tax years and two people by hand."

### 0:15–0:50 · The household · tab 1, Monitor

On **Rohan's row**, click **Open →**.

**Point at the household card** (both spouses in one table): joint US income tax **$87,212**; Rohan **89% · $77,479**, Indian tax **$19,212**; Priya **11% · $9,732**, Indian tax **$0**.

> "WISING reads each spouse's own forms, builds the joint US return and splits it fairly. Rohan carries eighty-nine percent and pays nineteen thousand dollars of Indian tax. Priya carries eleven percent."

**Scroll to the country table and Conflicts:** India and US both **Exposed**; India Q1 and Q2 advance tax **not paid**; **"Foreign Tax Credit shortfall" $4,408**.

> "Both countries are red. Rohan has missed two Indian advance-tax payments, and forty-four hundred dollars of his Indian tax can't be credited in the US this year."

### 0:50–1:10 · The filing calendar · tab 1, Filings

Click **Filings** in the left menu.

**Point at:** Return Form **ITR-3** (India) and **1040** (US). Scroll to the **Compliance Calendar**: passed instalments greyed out; next **India advance tax Q3, Dec 15**; **US estimate Q4, Jan 15**; **Form 1040 + Form 1116 + FBAR, Apr 15**; **ITR, Jul 31**.

> "Every deadline in both countries on one calendar: the Indian return and advance tax on India's April-to-March year, the joint 1040, the foreign tax credit and the FBAR on the US calendar year."

### 1:10–1:35 · One change · tab 2, Priya's India form

**Switch to tab 2.**

> "Now Priya's Indian employer keeps paying her while she works remotely from New York."

Clicks:
1. Click the **💼 Employment** card.
2. **3. Salary** → turn on **Salary Income & Exemptions**.
3. **Gross salary:** type **24,00,000**.
4. Scroll to **"Where was this work performed?"** and pause. It reads: *"From the residency screen (0 days worked in India): none of this salary treated as earned for work in India."*

> "She worked zero days in India, so WISING already knows India can't tax this salary. The US can."

### 1:35–2:15 · Both spouses update · tab 1, Priya's Monitor

**Switch to tab 1.** In the client switcher, pick **Priya Mehta**, click **Monitor** in the left menu, then click **↻ Refresh**.

**Point at:**
- Household card: joint US tax **$87,212 → $96,465**; Priya **11% → 16%**, Indian tax still **$0**; Rohan **89% → 84%** (**$77,479 → $80,629**).
- Conflicts: **10 findings, 3 critical**. New, at the top: **"Indian TDS on salary India can't tax: about $3,928 to stop or recover."** Below it, the household **FTC shortfall $4,408 → $3,873**.

> "One edit, and both spouses moved. The joint tax went up, and Rohan's share too, though nobody touched his file. Priya's Indian tax stays zero. And a new critical conflict: her employer will likely withhold about four thousand dollars of Indian tax it shouldn't. WISING tells the CPA how to stop it, or claim it back in time."

### 2:15–2:30 · Close

Hold on the Monitor.

> "Two countries, two people, one household, always in sync. That's WISING."

**Stop recording.**

---

## Numbers on screen (measured)

| Where | Before | After the salary |
|---|---|---|
| Joint US income tax | $87,212 | $96,465 |
| Rohan: share · Indian tax | 89% · $77,479 · $19,212 | 84% · $80,629 · $19,212 |
| Priya: share · Indian tax | 11% · $9,732 · $0 | 16% · $15,836 · $0 |
| Rohan: India advance tax | Q1, Q2 not paid ($14,032 unpaid) | unchanged |
| FTC shortfall (household) | $4,408 | $3,873 |
| Priya: findings / critical | 9 / 2 | 10 / 3 |
| New conflict (Priya) | — | Indian TDS on salary India can't tax, $3,928 |
| Filings: return forms | ITR-3 (India) · 1040 (US) | unchanged |
| Calendar: next deadlines | India advance tax Q3 Dec 15 · US estimate Q4 Jan 15 · 1040 + 1116 + FBAR Apr 15 · ITR Jul 31 | unchanged |

## If something goes wrong

- **Numbers don't change after the edit:** you skipped ↻ Refresh, or the **Salary Income & Exemptions** switch is off. Turning on the Employment card alone isn't enough.
- **Starting numbers differ:** this browser has old edits. Click **↺ Edited – Reset** and start again.
- **Tab 2 shows the wrong person:** open Layer 1: India **while Priya is selected** in tab 1.

## Between takes

Click **↺ Edited – Reset** in tab 1, close tab 2, and redo set-up steps 3–4.

## Cutting to time

If you run long, cut the second sentence pair in "The household" (the red countries) first. The filing calendar and the update scene are the two you shouldn't cut.

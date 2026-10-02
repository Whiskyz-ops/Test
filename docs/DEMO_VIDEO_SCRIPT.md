# WISING demo video: Rohan & Priya Mehta (2:30)

**Target:** 2:30 (YC limit 3:00). About 290 spoken words (under two minutes of talking); the clicks and pauses fill the rest.

**Flow:** for each spouse, inputs → output; then change one input → both spouses' output updates.

**Story:** Rohan and Priya file one joint US return, and India taxes each of them separately, so both get equal time. Rohan is the complex one: two Indian businesses, an LLP share, F&O trading, a Bengaluru rental, plus a US job. Priya's only on-camera change is a salary. WISING finds a new conflict, keeps India's tax at ₹0 on that salary, re-prices the joint US return, and moves Rohan's numbers though nobody touched his file.

Every figure and on-screen text below was measured by running this exact flow on the current build in a fresh browser.

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

## Set up (off camera, about 3 minutes)

1. Open a **new incognito window**. Go to demo.wising.app and enter the password. You land on **Clients**.
2. The button next to ↻ Refresh should read **"↺ Reset example"**. If it reads **"↺ Edited – Reset"**, click it.
3. In the client switcher (green pill, top left) pick **Rohan Mehta**, then Cmd/Ctrl-click **Layer 1: India** (top right). That's **tab 2**. In it, click **5. Business & Trading**.
4. Back in tab 1, switch to **Priya Mehta** and Cmd/Ctrl-click **Layer 1: India** again. That's **tab 3**. In it, click **2. Residency Detection Lock**.
5. Back in tab 1, click **Clients** in the left menu. Recording starts here.
6. Browser zoom 90%. Hide the bookmarks bar and notifications.

---

## The script

### 0:00–0:12 · The problem · tab 1, Clients (Monitor)

**Screen:** Client Portfolio with Rohan and Priya Mehta, both tagged "Joint with …".

> "Rohan and Priya Mehta both earn in India and the US. The US taxes them together on one joint return. India taxes each of them separately. Today their CPA reconciles this by hand."

### 0:12–0:27 · Rohan's inputs · tab 2, Rohan's India form (input layer)

**Switch to tab 2.** The Business & Trading screen shows **Mehta Advisory Services**, **Mehta Equipment Rentals**, a share in **Kapoor & Mehta Consulting LLP**, and F&O trading.

> "Each spouse has their own intake: a short router, then one form per country. Rohan runs two businesses in India, holds an LLP share, trades F&O and rents out a villa in Bengaluru, alongside his US job."

### 0:27–0:50 · Rohan's output · tab 1, Rohan's Monitor

**Switch to tab 1.** On **Rohan's row**, click **Open →**.

**Point at:**
- Household card: joint US income tax **$87,212**; Rohan **89% · $77,479**; his Indian tax **$19,212**.
- Country table: both **Exposed**. India: Q1 and Q2 advance tax **not paid**, **$14,032** unpaid.
- Conflicts: **Foreign Tax Credit shortfall: $4,408**.

> "From both spouses' files WISING builds the joint US return and splits it fairly: Rohan carries eighty-nine percent. It computes his Indian tax too. Both countries are red: he's missed two Indian advance-tax payments, and forty-four hundred dollars of his Indian tax can't be credited in the US this year."

### 0:50–1:02 · Priya's inputs · tab 3, Priya's India form (input layer)

**Switch to tab 3.** The Residency screen is open. Point at **Total Days in India: 12** and **days worked in India: 0**.

> "Priya holds a green card and works in New York. She spent twelve days in India, none of them working. In India she only has fixed-deposit interest."

### 1:02–1:15 · Priya's output · tab 1, Priya's Monitor

**Switch to tab 1.** In the client switcher, pick **Priya Mehta** (you stay on the Monitor).

**Point at:** Priya **11% · $9,732**; Conflicts **9 findings, 2 critical**; **"Indian tax withheld exceeds the tax due: ₹37,440 refund to claim in India."**

> "She carries eleven percent of the joint tax. And WISING found money she's owed: her bank withheld Indian tax she doesn't owe."

### 1:15–1:40 · Change one input · tab 3, Priya's India form

**Switch to tab 3.**

> "Now her Indian employer keeps paying her while she works remotely from New York."

Clicks:
1. **1. Financial Life Snapshot** → click the **💼 Employment** card.
2. **3. Salary** → turn on **Salary Income & Exemptions**.
3. **Gross salary:** type **24,00,000**.
4. Scroll to **"Where was this work performed?"** and pause. It reads: *"From the residency screen (0 days worked in India): none of this salary treated as earned for work in India."*

> "No new question. She worked zero days in India, so WISING knows India can't tax this salary. The US can."

### 1:40–2:12 · Priya's output updates · tab 1, Monitor → Reconciliation

**Switch to tab 1. Click ↻ Refresh.**

**Point at:**
- Household card: joint US tax **$87,212 → $96,465**; Priya **11% → 16%**.
- Conflicts: **10 findings, 3 critical**. New, at the top: **"Indian TDS on salary India can't tax: about $3,928 to stop or recover."**

> "A new critical conflict: her employer will likely withhold about four thousand dollars of Indian tax on salary India can't tax. WISING tells the CPA how to stop it, or claim it back in time."

**Click Reconciliation.** India card: the salary row is greyed **"not taxable in India"**, the total stays **₹1,20,000**, and India tax is **₹0**.

> "India's computation leaves the salary out, and shows why."

### 2:12–2:30 · Rohan moved too · tab 1, Rohan's Reconciliation

**Switch client → Rohan Mehta** (you stay on Reconciliation). Point at Rohan's share **$77,479 → $80,629**, then the FTC Reconciliation: unrelieved double tax **$4,408 → $3,873**.

> "We never touched Rohan's file. His share went up, but the extra US income raised the joint credit limit, so his double tax went down. One input, both countries, both people in sync. That's WISING."

**End on the screen. Stop recording.**

---

## Numbers on screen (measured)

| Where | Before | After the salary |
|---|---|---|
| Joint US income tax | $87,212 | $96,465 |
| Rohan's share | 89% · $77,479 | 84% · $80,629 |
| Priya's share | 11% · $9,732 | 16% · $15,836 |
| Rohan: Indian tax | $19,212 (₹15,94,622) | unchanged |
| Rohan: India paid / unpaid | $5,181 / $14,032 (Q1, Q2 advance tax not paid) | unchanged |
| Rohan: US unpaid | $37,014 | $41,503 |
| Unrelieved double tax (FTC shortfall), on both pages | $4,408 | $3,873 |
| Priya: findings / critical | 9 / 2 | 10 / 3 |
| New conflict (Priya) | — | Indian TDS on salary India can't tax, $3,928 |
| Priya: India tax | ₹0 (₹1,20,000 interest) | ₹0 (salary ₹23,25,000 left out) |
| Joint US wages | $248,000 | $276,916 |
| Clients tab, combined tax after credits: Rohan / Priya | $91,841 / $10,983 | $93,867 / $17,675 |

## If something goes wrong

- **Numbers don't change after the edit:** you skipped ↻ Refresh, or the **Salary Income & Exemptions** switch is off. Turning on the Employment card alone isn't enough.
- **Starting numbers differ:** this browser has old edits. Click **↺ Edited – Reset** and start again.
- **A form tab shows the wrong person:** open Layer 1: India **while that spouse is selected** in tab 1.

## Between takes

Click **↺ Edited – Reset** in tab 1, close tabs 2 and 3, and redo set-up steps 3–5.

## Cutting to time

Each scene ends on a full stop, so you can trim at any scene boundary. If you run long, cut the last sentence of Rohan's output scene first ("Both countries are red…"), then the Reconciliation line in Priya's update.

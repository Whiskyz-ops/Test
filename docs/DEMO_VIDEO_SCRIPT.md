# WISING demo video: Rohan & Priya Mehta (2:30)

**Target:** 2:30 (YC limit 3:00). About 280 spoken words (under two minutes of talking); the clicks and pauses fill the rest. The times below include clicks and pauses.

**Flow:** inputs → output → change an input → output updates.

**Story:** a married couple files one joint US return, while India taxes each spouse separately. We add a salary to Priya's Indian file on camera. WISING finds a new conflict, recomputes India's tax (₹0 on that salary), re-prices the joint US return, and updates Rohan's numbers, though nobody touched his file.

Every figure and on-screen text below was measured by running this exact flow on the current build in a fresh browser.

---

## Set up (off camera, about 2 minutes)

1. Open a **new incognito window**. Go to demo.wising.app and enter the password. You land on **Clients**.
2. The button next to ↻ Refresh should read **"↺ Reset example"**. If it reads **"↺ Edited – Reset"**, click it.
3. Open the client switcher (green pill, top left) and pick **Priya Mehta**. Cmd/Ctrl-click **Layer 1: India** (top right) to open her India form in a **second tab**. In that tab, click **2. Residency Detection Lock** and leave it there.
4. Back in tab 1, click **Clients** in the left menu. Recording starts here.
5. Browser zoom 90%. Hide the bookmarks bar and notifications.

---

## The script

### 0:00–0:15 · The problem · tab 1, Clients

**Screen:** Client Portfolio with Rohan and Priya Mehta, both tagged "Joint with …".

> "Rohan and Priya Mehta have income in India and the US. The US taxes them together on one joint return. India taxes each of them separately. Today their CPA reconciles all of this by hand, across two tax years."

### 0:15–0:40 · The inputs · tab 2, Priya's India form

**Switch to tab 2.** The Residency screen is open. Point at **Total Days in India: 12** and **days worked in India: 0**.

> "Everything starts from the client's own data. A short router sets which countries apply. Then each country has its own intake. Priya holds a green card and works in New York. She spent twelve days in India this year, none of them working."

**Click 7. Other Sources** for one beat. It shows FD interest **₹1,20,000**.

> "In India she only has fixed-deposit interest."

### 0:40–1:05 · The output · tab 1, Priya's Monitor

**Switch to tab 1.** On **Priya's row**, click **Open →**. Her Monitor opens.

**Point at the household card:** joint US income tax **$87,212**; Priya **11% · $9,732**.

> "WISING builds the joint US return from both spouses' files and splits it fairly. Priya carries eleven percent."

**Scroll to Conflicts:** **9 findings, 2 critical**. Point at **"Indian tax withheld exceeds the tax due: ₹37,440 refund to claim in India."**

> "It already found money she's owed. Her bank withheld Indian tax she doesn't owe, and she only gets it back by filing an Indian return."

### 1:05–1:35 · Change an input · tab 2

**Switch to tab 2.**

> "Now her Indian employer keeps paying her while she works remotely from New York."

Clicks:
1. **1. Financial Life Snapshot** → click the **💼 Employment** card.
2. **3. Salary** → turn on **Salary Income & Exemptions**.
3. **Gross salary:** type **24,00,000**.
4. Scroll to **"Where was this work performed?"** and pause. It reads: *"From the residency screen (0 days worked in India): none of this salary treated as earned for work in India."*

> "No new question. She worked zero days in India, so WISING already knows: India can't tax this salary. The US can."

### 1:35–2:15 · The output updates · tab 1

**Switch to tab 1. Click ↻ Refresh.**

**Point, top to bottom:**
- Household card: joint US tax **$87,212 → $96,465**; Priya **11% → 16%**.
- Conflicts: **10 findings, 3 critical**. The new one is at the top: **"Indian TDS on salary India can't tax: about $3,928 to stop or recover."**

> "A new critical conflict. Her employer's payroll will withhold Indian tax, about four thousand dollars, on salary India can't tax. WISING tells the CPA how to stop it, and if it's already withheld, how to claim it back before the refund window closes."

**Click Reconciliation.** Point at the India card: the salary row is greyed **"not taxable in India"**, the total stays **₹1,20,000**, and India tax is **₹0**. Then scroll to the FTC Reconciliation: unrelieved double tax **$4,408 → $3,873**.

> "India's computation leaves the salary out, and shows why. On the US side, the extra US-taxed income raises the joint credit limit, so the household's double tax actually goes down."

### 2:15–2:30 · The household moves together · close

**Switch client → Rohan Mehta** (you stay on Reconciliation). Point at the household card: Rohan's share **$77,479 → $80,629**.

> "We never touched Rohan's file, but his share moved too. One input on one spouse, and both countries and both people stay in sync. That's WISING."

**End on the screen. Stop recording.**

---

## Numbers on screen (measured)

| Where | Before | After the salary |
|---|---|---|
| Joint US income tax | $87,212 | $96,465 |
| Priya's share | 11% · $9,732 | 16% · $15,836 |
| Rohan's share | 89% · $77,479 | 84% · $80,629 |
| Priya: findings / critical | 9 / 2 | 10 / 3 |
| New conflict | — | Indian TDS on salary India can't tax, $3,928 |
| Priya: India tax | ₹0 (₹1,20,000 interest) | ₹0 (salary ₹23,25,000 left out) |
| Joint US wages | $248,000 | $276,916 |
| Unrelieved double tax (household) | $4,408 | $3,873 |
| Clients tab, combined tax after credits: Rohan / Priya | $91,841 / $10,983 | $93,867 / $17,675 |
| Clients tab, Priya's health | 73 | 57 |

## If something goes wrong

- **Numbers don't change after the edit:** you skipped ↻ Refresh, or the **Salary Income & Exemptions** switch is off. Turning on the Employment card alone isn't enough.
- **Starting numbers differ:** this browser has old edits. Click **↺ Edited – Reset** and start again.
- **Tab 2 shows the wrong person:** open Layer 1: India **while Priya is selected** in tab 1.

## Between takes

Click **↺ Edited – Reset** in tab 1, close tab 2, and redo set-up steps 3–4.

## Cutting to time

Each scene ends on a full stop, so you can trim at any scene boundary. If you run long, drop the **Other Sources** beat first, then the last sentence of the Reconciliation scene.

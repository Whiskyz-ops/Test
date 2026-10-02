# Demo video script: Rohan & Priya Mehta (investor link)

**Length:** about 6 minutes. **Link:** demo.wising.app (investor mode by default, so only Rohan and Priya show).

**Story:** a married couple files one joint US return, but India taxes each of them separately. We give Priya an Indian salary on camera. WISING then:
- raises a new conflict;
- recomputes India's tax correctly (₹0 on that salary);
- moves the joint US return, which also changes Rohan's numbers even though nobody touched his file.

Every figure below was measured by running this exact flow in a fresh browser on the current build. If a number on screen differs, the data in that browser has been edited. See "Reset" at the end.

---

## Before you hit record (off camera)

1. Open a **new incognito / private window**. Rohan and Priya are created fresh in every new browser, so this gives you clean data.
2. Go to demo.wising.app and enter the password. You land on **Clients**. The button next to ↻ Refresh should read **↺ Reset example**. If it says "Edited — reset example", click it.
3. Hover the **Layer 1: India** link (top right) with Priya selected and **open it in a second tab** (Cmd/Ctrl-click). Don't edit anything yet. Go back to tab 1.
4. Browser zoom 90% if the Monitor feels cramped. Close every other tab and notification.

---

## Scene 1: The hook (0:00–0:20) · Clients tab

**On screen:** Client Portfolio, two rows: Rohan Mehta and Priya Mehta, both tagged "Joint with …".

> "This is a couple: Rohan and Priya Mehta. Both have income in India and the US. They file one joint return in the US, but India taxes each of them as an individual. Two countries, two tax years, one household. Their CPA has to keep all of this consistent by hand today."

**Optional, 5 seconds, point at the left menu:**

> "The menu follows how a firm actually works a client: **Overview** to see who needs attention, **Prepare**, which is residency, then the reconciled returns, what's been paid and the filings due, and **Source data** behind every number."

**Point at the numbers:**

| | Rohan | Priya |
|---|---|---|
| Combined tax | $106,646 (89% of joint US) | $10,983 (11% of joint US) |
| FTC residual | $3,916 | $492 |
| Health | 8 | **73** ← remember this |

Top tiles: Open critical **8**, Combined tax **$117,629**, FTC residual **$4,408**.

---

## Scene 2: Rohan's Monitor (0:20–1:20)

**Click:** Rohan's row → **Monitor**.

> "Everything starts from one place. On top is the household: the joint US income tax is **$87,212**. We split it between them in proportion to what each would owe filing alone, so Rohan carries **89%, $77,479**, and Priya **11%, $9,732**. Rohan also owes **$19,212** in Indian tax on his own Indian income."

**Scroll to the map and status cards.**

> "Both countries are red for Rohan. Each row shows tax still unpaid after credits and payments, and which estimated or advance-tax instalments were missed, with their due dates. In India he's paid **$5,181** of **$19,212**, and the June and September advance-tax instalments were missed."

**Scroll to Conflicts & Mismatches.** Open the top root cause, "Same income taxed by both countries".

> "These aren't generic warnings. Each is a specific rule firing on this family's data, grouped by root cause, with dollars at risk. Some are tagged 'Household': they come from the joint return, so they're scored once, on Rohan, not double-counted."

---

## Scene 3: Priya before the change (1:20–2:20)

**Click:** the client switcher (green pill, top left) → **Priya Mehta**.

> "Priya is a green-card holder working in New York. In India she only has a fixed deposit, about ₹1.2 lakh of interest."

**Read out the baseline:**
- Household card: same joint tax, **$87,212**; Priya **11%, $9,732**.
- United States row: estimated **$10,983**, unpaid **$4,755**.
- Conflicts: **9 findings, 2 critical**.
- Map: India is **blue, "Filing required"**. She owes India nothing, but she has money to get back.
- Conflict: "Indian tax withheld exceeds the tax due: **₹37,440 refund** to claim in India." (Her bank withheld TDS on interest that's below the exemption. She only gets it back by filing an Indian return.)

**Click:** **Reconciliation.**

> "Reconciliation shows how we got here. India income by head: just **₹1,20,000 interest**. On the US side, Form 1116 for the joint return: foreign tax credit allowed **$14,805**, and **$4,408** of double tax still unrelieved."

(Optional: open "By person". Every joint figure traces back to Rohan or Priya.)

---

## Scene 4: The live change (2:20–3:30) · Layer 1 India, tab 2

**Switch to tab 2** (Priya's India form).

> "Now something happens in Priya's life. Her old Indian employer keeps paying her while she works for them remotely, from New York. Her CPA enters that like any other salary."

**Clicks, in order:**
1. **Phase 0: Setup** → click the **Salary** card so it's active.
2. Left menu → **3. Salary**.
3. Turn on the **Salary Income & Exemptions** switch.
4. **Gross salary:** type **24,00,000**. (You're on Q1, Apr–Jun; that's fine.)
5. Scroll to **"Where was this work performed?"** and pause on it:

   > "From the residency screen (0 days worked in India): none of this salary treated as earned for work in India."

> "Notice we didn't ask the CPA anything new. On her residency screen, Priya worked zero days in India. So the engine already knows this salary was earned in the US. India can't tax it, and the US can."

The form saves on its own. **Close tab 2.**

---

## Scene 5: The conflict appears (3:30–4:30) · tab 1

**In tab 1, click ↻ Refresh** (next to "Live"), then **Monitor**.

> "Same screen, ten seconds later."

**Point at what changed:**

| | Before | After |
|---|---|---|
| Joint US income tax | $87,212 | **$96,465** |
| Priya's share | 11% · $9,732 | **16% · $15,836** |
| Priya, US estimated tax | $10,983 | **$17,675** |
| Priya, US unpaid | $4,755 | **$8,426** |
| Findings / critical | 9 / 2 | **10 / 3** |

**The new critical conflict** sits at the top of "Same income taxed by both countries":

> **Indian TDS on salary India can't tax: about $3,928 to stop or recover**

**Expand it** (▸) and read the advice in short:

> "Her Indian employer will very likely deduct TDS on the whole salary, roughly **$3,928**, because their payroll sees an Indian salary. But India can't tax pay for work done outside India. WISING tells her CPA what to do: stop it now with a declaration to the employer; otherwise file ITR-2 to claim it back, on time, because an updated return can't claim a refund. It even warns that Form 16 will show the full salary, so expect a mismatch notice and keep the travel records."

> "This is the kind of thing a CPA finds out about a year later, when the refund is stuck."

---

## Scene 6: The tax computation moved too (4:30–5:30) · Reconciliation

**Click:** **Reconciliation.**

**India income by head:**
- New greyed row: "Salary for work done outside India, not taxable in India (the US taxes it)": **₹23,25,000** (₹24L less the ₹75,000 standard deduction).
- Total stays **₹1,20,000**.

**Scroll to Tax Computation → India:** gross total income **₹1,20,000**, with the line "not included: salary for work done outside India **₹23,25,000**". Total India tax **₹0**.

> "India's computation leaves the salary out, and says why."

**US income (joint):** Wages go from **$248,000 to $276,916**. The extra **$28,916** is labelled "incl. foreign-employer pay for US-performed work".

**FTC Reconciliation:**
- US taxable income **$428,186 → $457,102**.
- Credit allowed **$14,805 → $15,339**.
- Unrelieved double tax **$4,408 → $3,873**.

> "Here's the subtle part. Adding US-taxed income raised the joint return's foreign tax credit limit, so more of Rohan's Indian tax is now credited. The double tax on the household went **down** by about $535, even though the total tax went up. A spreadsheet doesn't catch that interaction."

---

## Scene 7: Rohan felt it too (5:30–6:00)

**Switch client → Rohan Mehta** (you stay on Reconciliation; it doesn't jump away).

> "We never touched Rohan's file."

- His share of the joint tax: **$77,479 → $80,629** (89% → 84%).
- **Clients** tab: Rohan's combined tax **$106,646 → $109,206**; Priya's health **73 → 57**; Open critical **8 → 9**; household FTC residual **$4,408 → $3,873**.

**Close:**

> "One salary entered on one spouse's Indian form. A new conflict, a correct Indian computation, a re-priced joint US return, and the other spouse's numbers updated automatically. That's WISING: the household's tax position across two countries, always in sync."

---

## If something goes wrong on camera

- **Numbers don't move after the edit:** you forgot ↻ Refresh, or the "Salary Income & Exemptions" switch is off. The setup card alone isn't enough.
- **Starting numbers differ from the "before" column:** this browser already has edits. Click ↺ Reset example and start the take again.
- **The second tab shows a different client:** open Layer 1 India *while Priya is selected* in tab 1. The link carries the selected client.

## Reset for another take

Click **↺ Reset example** (next to ↻ Refresh). After an edit it reads "↺ Edited — reset example". It puts Rohan and Priya back to the checked starting data, so every "before" figure above is true again. Alternatively, close the incognito window and open a new one.

Tip: don't show the reset button on camera. If it says "Edited — reset example" when you start recording, reset first.

# Household design — married clients

Signed off 29 Sep 2026 (decisions in section 8). Fixes the joint-return rows
of docs/MARRIED_FILING_AUDIT.md. Build steps 1 (link, validation, spouse
tier), 2 (shared items) and 3 (household calculation, method A pending CA
confirmation) shipped 29 Sep 2026; steps 4-5 not started.

**Scope.** Married filing jointly (MFJ) first. Married filing separately (MFS)
and qualifying surviving spouse use the same link with less computation.
Single and head of household don't use it.

## 1. Model: two clients, one link

- Each spouse is a full client: their own router, Layer 1 India and Layer 1 US,
  and their own entry in the client registry (`wising_client_registry`).
- The link is `us.profile.spouse_client_id` on both profiles, pointing at each
  other. The filing status is chosen once and saved on both.
- **Spouse-only profile (decision 2, option B).** A spouse with no income and
  no India link fills only identity, date of birth, citizenship / residency
  and SSN / ITIN, and is a *light* profile (lower price or free). Any income,
  account or Indian return makes it a *full* client at full price. The tier
  is computed, not chosen: `spouseTier` in household-link.js.

## 2. Link rules (blocking errors)

| Rule | Why |
|---|---|
| Both profiles point at each other, one spouse each | no half-links or three-way links |
| Same filing status and tax year on both | one joint return |
| MFJ with a non-resident spouse needs the §6013(g)/(h) election; the spouse's profile then covers worldwide income | IRC §6013 |
| A US citizen can't be in a non-resident-alien position | saving clause, DTAA Art. 1(3) |

## 3. Shared items: entered once, with shares

Joint bank / brokerage accounts, co-owned property and its rent, mortgage
interest and property tax are entered **once**, in one spouse's profile, with
`co_owner_client_id` and `owner_share_percent`. The joint US return takes the
full amount; each Indian return takes its owner's share (India already records
co-owner shares for house property). Household-level items — dependents,
childcare, charity, joint estimated payments, last year's joint tax — are
entered in one profile and marked `household`. This is what stops double
counting.

## 4. Calculation: `analyzeHousehold(a, b)`

| Step | Does | Uses today's |
|---|---|---|
| 1. Per person | Each spouse's per-person US rules: Social Security wage base and self-employment tax, senior and 65+ deductions, 401(k) / IRA / HSA limits, foreign earned income exclusion | analyze() per profile |
| 2. Joint US | One Form 1040: both incomes, shared items once, joint brackets, thresholds and credits; joint Form 1116 with both spouses' Indian income and tax | US engine, joint tables |
| 3. Split | Allocate the joint US tax to each spouse (method below) | new |
| 4. India per person | Each spouse's Indian return from their own profile only, with their share of the US tax for Form 44 relief | India engine, unchanged |

**MFS:** step 2 runs once per spouse on the separate tables. The link supplies
"spouse itemizes", "lived apart all year" and community-property splits.

**Split method (CA / CPA to confirm).** Proposed: each spouse's share of the
joint US tax equals their share of the total of the two taxes computed as if
each filed separately. Alternative: share of joint taxable income. The choice
drives India's s.90 relief, so it is a professional decision, not a coding one.

## 5. What each client sees

- Their own Indian position, and the shared US return labelled "Joint with
  [spouse]".
- Findings tagged *person* (FBAR, Schedule FA, Indian items) or *household*
  (US return items). Household findings show on both dashboards; the conflict
  log records them once.
- Billing stays per client, including the spouse.

## 6. Edits and access

- Editing either profile recomputes the household. Each dashboard shows when
  the joint return was last computed.
- A household link is only possible between two clients of the same firm.
- A spouse with a different preparer: open decision.

## 7. Migration

Existing MFJ clients hold both spouses' income in one profile. They get a
"joint data pooled" alert, and a guided step creates the spouse's profile and
moves their items. Until then the pooled income can't be separated, so the
alert stays on and warns that the client's Indian computation includes the
spouse's US income (audit row G1).

## 8. Decisions (29 Sep 2026)

1. Split method: **A**, share of the two as-if-separate taxes (the proposal
   in section 4). Still to be confirmed by the CA / CPA before step 3 ships;
   the method is one function, so switching costs little.
2. Spouse-only profile: **option B**, light profile at a lower price or free,
   full profile at full price once the spouse has income or an Indian return.
3. Shared items: **in the owner's profile** with an ownership %, plus a check
   that blocks the same account or property in both profiles (step 2).
4. Access: **linking only within one firm** for now; cross-firm linking with
   consent later if firms ask.

## 9. Build order

1. Link, validation and spouse-only profile (forms and registry). **Done
   29 Sep 2026:** `prototypes/graph-pilot/household-link.js` (Python mirror
   `dag_py/src/wising_dag/household/link.py`, 16 shared cases in
   `dag_py/tests/test_household_link.py`); the US form's "Spouse's client
   profile" picker writes the link and filing status onto both profiles and
   can create a new spouse client; the Monitor's Clients tab shows "Joint /
   Separate with …", "Light profile" and "Link issue". Not yet enforced for
   the "within one firm" rule: the Monitor has one firm today.
2. Shared-item fields. **Done 29 Sep 2026:** foreign bank accounts,
   financial holdings and real-estate rows carry `is_joint_owner_spouse` (new
   on property rows) and `owner_share_percent` (this client's share, 50 when
   left blank); `profile.household_items_owner` ("self" / "spouse", written
   to both profiles) says which profile holds the household items on a
   joint return. The link check now also blocks: the same bank account
   (bank + last 4), holding (institution + name) or property (description)
   in both profiles; a co-owner share outside 0–100; household items in both
   profiles, or in the profile set not to hold them; both profiles claiming
   the household items. SALT is not a household field: the form's single
   SALT amount mixes each person's state income tax with shared property
   tax. The shares are recorded but not yet used in any computation (step 3).
3. `analyzeHousehold` in the JS and Python engines, with per-person rules.
   **Done 29 Sep 2026, except the per-person rules:**
   `prototypes/graph-pilot/household.js` / `dag_py/src/wising_dag/household/calc.py`
   run the unchanged single-client engine on each spouse's own profile
   (Indian tax and relief cap), on each spouse as a separate filer (method A
   weights) and on the two US profiles merged into one joint return; the
   joint regular income tax is split by `splitJointUsTax` (method A — the one
   function to change if the CA decides otherwise), and each spouse's Form 44
   relief is min(share × their US-source fraction, Indian tax on that
   income). The joint Form 1116 takes both spouses' Indian tax against the
   joint limit. Tests: `dag_py/tests/test_household_calc.py` (JS and Python
   agree on 4 cases; the probe couple matches hand-worked numbers); probe
   XB-P2. Monitor: a Household card on a linked client's overview.
   A linked client's own profile now raises joint_return_household_linked
   (info) instead of the pooled-income alert.
   **Step 3b, done 29 Sep 2026:** the joint run receives each spouse's own
   self-employment earnings and Medicare wages (`us.household_persons`) and
   the spouse's date of birth (`us.profile.spouse_date_of_birth`), so the
   Social Security cap and the senior deduction apply per person; 401(k) and
   IRA limits are checked on each spouse's own profile. The joint return is
   the same from either spouse's page (the US-resident spouse leads, then the
   lower client id). The Reconciliation tab of each linked MFJ spouse shows
   the joint US return (income, federal and state tax, Form 1116 with both
   spouses' Indian tax) and this client's own India side and Form 44 relief.
   Still open: MFS does not yet read "spouse itemizes" or "lived apart"; the
   spousal IRA on combined compensation; +$1,650 additional standard
   deduction for 65+/blind (B25).
4. Dashboards and findings tags.
5. Migration.

Each step ships behind the "joint data pooled" alert until step 5.

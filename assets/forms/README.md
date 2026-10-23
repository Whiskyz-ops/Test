# Blank tax forms (tax year 2025)

Blank PDFs of the US federal and state forms the engine can tell a client to
file, taken from `US_Individual_Tax_Forms.xlsx`. Only forms the engine names
are included. That means the Filings-tab catalogue, the return-form
determination and the US / cross-border findings. State forms cover CA, NY
and NJ, the three states the engine computes tax for.

| Folder | Forms |
|---|---|
| `us-federal/` | 44 IRS forms: 1040 / 1040-NR and their schedules, 1116, 2555, 8833, 8938, 8621, 5471, 8865, 8858, 3520 / 3520-A, 8802, 8854, FIRPTA 8288 set, 8960, 8959, 6251, 8801, 2210, 5329, 8880, 8889, 4868, 1040-ES, 1040-X, W-8BEN, W-7 |
| `us-state-ca/` | 540, 540NR, Schedule CA (540 / 540NR), Schedule S, FTB 3519, 540-ES |
| `us-state-ny/` | IT-201, IT-203, IT-203-B, IT-196, IT-225, IT-201-ATT, IT-112-R, IT-370, IT-2105 |
| `us-state-nj/` | NJ-1040, NJ-1040NR, NJ-COJ, NJ-BUS-1, NJ-630, NJ-1040-ES |
| `fieldmaps/` | Draft line number → PDF field name maps, one per form. **Not reviewed.** |
| `manifest.json` | Each form's source URL, why the engine needs it, page count, field counts and how many fields the draft map covers. `not_pdf` lists forms the engine names that have no PDF, such as the FBAR and every Indian form. |

Scripts:

```bash
python3 scripts/fetch-tax-forms.py         # re-download + re-count fields (run each tax year)
python3 scripts/map-form-fields.py         # rebuild the draft field maps
python3 scripts/fill-form-1040-demo.py     # proof of concept: Form 1040 filled from the engine
```

Field names change between revisions, so the maps must be rebuilt and
checked again every tax year.

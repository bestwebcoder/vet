# TV Care — Phased Build Spec

The original `TV_CARE.docx` brief, split into files sized for one Claude Code
session each.

```
tvcare-spec/
├── CLAUDE.md                 ← always-on context (auto-loaded by Claude Code)
├── README.md
└── phases/
    ├── phase-01-foundation.md
    ├── phase-02-patients.md
    ├── phase-03-appointments.md
    ├── phase-04-clinical-soap.md
    ├── phase-05-prescriptions.md
    ├── phase-06-vaccination-deworming.md
    ├── phase-07-billing.md
    ├── phase-08-reporting.md
    ├── phase-09-notifications.md
    └── phase-10-polish.md
```

## How to use it

1. Copy `CLAUDE.md` to the **root of your project repo**. Claude Code reads it
   automatically at the start of every session, so the rules, schema, roles and
   design direction never fall out of context.
2. Copy the `phases/` folder into the repo too (e.g. `docs/phases/`).
3. Start each session with one phase only:

   ```
   Read docs/phases/phase-01-foundation.md and CLAUDE.md.
   Plan the implementation before writing code, then build only Phase 1.
   ```

4. Work through the phase's **Definition of done** checklist before moving on.
   The brief is explicit: do not move to the next phase until the current one
   is functional.

## Where each section of the original brief went

| Original section | Lands in |
| --- | --- |
| 1 Product vision, 2 Primary users, 3–5 Roles | `CLAUDE.md` |
| 24 Security, 25 Audit log, 26 Database | `CLAUDE.md` (+ per-phase tables) |
| 27 UI/UX, 28 Navigation, 29 Dashboard, 30 Empty states, 31 Errors, 32 Validation | `CLAUDE.md` |
| 34 Dev rules, 35 AI behaviour, 36 Medical safety, 38 Success criteria | `CLAUDE.md` |
| 37 First implementation task | Phase 1 |
| 6 Client portal, 7 Client dashboard, 8 Pet profile | Phase 2 |
| 9 Appointments, 10 Doctor calendar, 22 Search | Phase 3 |
| 11 SOAP, 23 Document management | Phase 4 |
| 12 Prescriptions, 13 Prescription PDF | Phase 5 |
| 14 Vaccination, 15 Deworming, 16 Reminder engine | Phase 6 |
| 17 Billing, 18 Invoice, 19 Payments, 20 Service management | Phase 7 |
| 21 Reporting | Phase 8 |
| 16 (delivery channels) | Phase 9 |
| 33 Phase 10 polish | Phase 10 |

## Judgement calls made during the split

Three things the original brief left unplaced — flagged so you can move them:

- **Global search (§22)** was put in Phase 3, once clients, pets and
  appointments exist. Invoice-ID search is added in Phase 7.
- **Document management (§23)** was split: basic client uploads in Phase 2,
  clinical uploads and diagnostics in Phase 4.
- **Reminder engine (§16)** was split: scheduling and in-app notifications in
  Phase 6, external delivery channels in Phase 9 — matching the brief's own
  Phase 9 definition.

## Open decision

The brief mandates **PostgreSQL** but never names a frontend/backend framework.
Decide that before Phase 1 and record it in `CLAUDE.md` §2.

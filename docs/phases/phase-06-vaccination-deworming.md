# Phase 6 — Vaccination, Deworming & Reminder Engine

> Read `CLAUDE.md` first. Phase 5 must be stable.

**Depends on:** Phases 1–5
**Unlocks:** Phase 7

---

## Goal

Complete vaccination and deworming management with configurable schedules and
an internal reminder engine.

---

## Scope

### 6.1 Database

```
vaccinations   vaccination_schedules   deworming_records
notifications  notification_logs
```

### 6.2 Vaccination record fields

Vaccine name · manufacturer · batch number · lot number · expiry date ·
date administered · dose · route · site · doctor · next due date · notes.

### 6.3 Vaccination schedules

Create vaccination schedules **configurable by the administrator**.

> **Do NOT hard-code medical schedules permanently.** Schedules must be editable
> by authorized veterinary administrators.

Display example (data-driven, never hard-coded):

```
DHPP        Next due: 15 August 2026
Rabies      Next due: 20 September 2026
Bordetella  Next due: 15 November 2026
```

### 6.4 Deworming records

Record: product · active ingredient · dose · route · date administered ·
weight · next due date · doctor · notes.

Scheduling options: monthly · every 3 months · every 6 months · custom interval.

Automatically calculate the next due date. **Allow doctor/admin override.**

### 6.5 Reminder engine

Notification types:

- Appointment reminder
- Vaccination reminder
- Deworming reminder
- Follow-up reminder
- Invoice reminder *(activates in Phase 7)*
- Payment confirmation *(activates in Phase 7)*

Notification states: Scheduled · Sent · Delivered · Failed.

Create **notification logs**.

Vaccination reminder states: 30 days before · 7 days before · due today · overdue.

Architecture must be ready for Email, SMS, WhatsApp and Push — but
**do not require all integrations in the first MVP.** In-app notifications only
this phase; external channels land in Phase 9.

### 6.6 Surfaces to populate

- Pet card: next vaccination, next deworming
- Client dashboard reminders ("Vaccination due in 7 days")
- Pet profile tabs: **Vaccinations**, **Deworming**
- Doctor dashboard: "Vaccinations due"
- Admin dashboard: "Vaccinations due today", "Deworming due this week"

---

## Out of scope

Sending email/SMS/WhatsApp/push (Phase 9). Charging for vaccination (Phase 7).

---

## Definition of done

- [ ] Doctor can record a vaccination and schedule the next one
- [ ] Doctor can record deworming with auto-calculated next due date and override
- [ ] Admin can create and edit vaccination schedules without a code change
- [ ] Due/overdue states compute correctly across all four reminder windows
- [ ] Client sees vaccination and deworming history and due dates
- [ ] Notification records are created with correct state and logged
- [ ] Vaccination recorded appears in `audit_logs`

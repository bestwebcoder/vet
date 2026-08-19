# Phase 2 — Client & Patient Management

> Read `CLAUDE.md` first. Phase 1 must be stable before starting.

**Depends on:** Phase 1
**Unlocks:** Phase 3

---

## Goal

Clients, pets and pet profiles as real database-backed records, plus the
client portal home and dashboard.

---

## Scope

### 2.1 Database
Add migrations for:

```
clients (extend)   pets   species   breeds   documents
```

### 2.2 Client records
Admin and doctor can create, view, edit and search clients.
A client account links to one client record.

### 2.3 Pets
- A client can add multiple pets
- Doctor/admin can create a new patient
- Doctor can edit allowed patient information

### 2.4 Pet profile fields

- Pet photo
- Name
- Species
- Breed
- Sex
- Date of birth
- Age (derived)
- Weight
- Colour
- Microchip number
- Neutered/spayed status
- Allergies
- Chronic conditions
- Important notes

### 2.5 Pet profile tabs

Build the tab shell with all nine tabs. Populate **Overview** and **Documents**
now; the rest show proper empty states until their phase lands.

1. Overview — Phase 2
2. Medical History — Phase 4
3. SOAP / Visit History — Phase 4
4. Prescriptions — Phase 5
5. Vaccinations — Phase 6
6. Deworming — Phase 6
7. Diagnostics — Phase 4
8. Documents — Phase 2
9. Billing — Phase 7

### 2.6 Client portal home

Clean, friendly. Shows **My Pets** as cards. Each pet card displays:

- Photo · Name · Species · Breed · Sex · Age · Weight
- Next vaccination (empty until Phase 6)
- Next deworming (empty until Phase 6)

Reference example:

```
Milo    Golden Retriever   Male • 4 years    28 kg
Luna    Domestic Shorthair Female • 3 years  3.8 kg
```

*(Example only — never hard-code these.)*

### 2.7 Client dashboard

Cards for: upcoming appointment, reminders, recent activity.
Sections belonging to later phases render empty states now.

### 2.8 Document upload (basic)

Clients can upload medical documents/images against a pet.
Store: file name, type, upload date, uploaded by, patient, description.
Clients see only documents marked **client-visible**.

---

## Out of scope

Appointments, SOAP, prescriptions, vaccination scheduling, invoices.

---

## Definition of done

- [ ] A client can add multiple pets and see them on their home screen
- [ ] Doctor/admin can create and edit clients and patients
- [ ] Client A can never see client B's pets — verified by testing
- [ ] Pet profile shows all nine tabs with correct empty states
- [ ] Document upload works and respects client-visibility
- [ ] Patient created/updated events are written to `audit_logs`
- [ ] All screens mobile-responsive

# Phase 5 — Prescriptions

> Read `CLAUDE.md` first — especially §11 Medical Safety. Phase 4 must be stable.

**Depends on:** Phases 1–4
**Unlocks:** Phase 6

---

## Goal

A professional veterinary prescription generator with a weight-based dose
calculator, PDF output and digital signature.

---

## Scope

### 5.1 Database

```
medications   prescriptions   prescription_items
```

Medications come from the database — never hard-coded.

### 5.2 Prescription header

```
THE TRAVELING VET
Veterinary Care
Prescription

Doctor:   Dr. [Doctor Name]
Patient:  [Pet Name]
Species:  [Species]
Breed:    [Breed]
Weight:   [Weight]
Date:     [Date]
```

### 5.3 Medication fields

Drug name · strength · formulation · dose · dose unit · route · frequency ·
duration · quantity · instructions.

Example entry:

```
Maropitant
Dose: 1 mg/kg
Frequency: SID
Duration: 5 days
Route: PO
```

### 5.4 Dose calculator

Automatically calculate the required dose from **body weight × dose per kg**.

```
28 kg × 1 mg/kg = 28 mg
```

> **IMPORTANT**
> Do not automatically recommend medications or invent veterinary treatment
> protocols. The dose calculator is a calculation tool only. The doctor must
> select and approve the medication, dose, route, frequency and duration.

Display this warning on the prescription builder:

> "Clinical dosing must be reviewed and approved by the attending veterinarian."

Handle the **missing patient weight** error state — the calculator must refuse
to guess.

### 5.5 Prescription PDF

Generate a professional PDF containing:

- The Traveling Vet logo
- Clinic / contact information
- Doctor name
- Registration information if provided
- Patient information
- Owner information
- Prescription
- Instructions
- Follow-up date
- Digital signature
- Date
- Prescription ID

Allow **Download PDF** and **Print PDF**.

### 5.6 Digital signature

Doctor digitally signs the prescription. Once finalized, the prescription is
immutable — corrections create a new version with an audit trail.

### 5.7 Client access

Clients can view prescriptions and download them as PDF from the pet profile
**Prescriptions** tab. Clients cannot create or edit prescriptions.

---

## Out of scope

Billing the medication (Phase 7). Emailing the PDF (Phase 9).

---

## Definition of done

- [ ] Doctor can build a multi-item prescription from a SOAP record
- [ ] Dose auto-calculates from the patient's recorded weight and is doctor-editable
- [ ] The system never proposes a drug or protocol on its own
- [ ] Missing weight blocks calculation with a clear message
- [ ] PDF renders correctly with logo, signature and prescription ID
- [ ] Finalized prescriptions cannot be silently edited
- [ ] Prescription created / finalized appear in `audit_logs`
- [ ] Client can download their pet's prescription PDF

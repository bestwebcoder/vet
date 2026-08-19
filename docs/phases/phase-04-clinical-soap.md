# Phase 4 — Clinical / SOAP

> Read `CLAUDE.md` first — especially §11 Medical Safety. Phase 3 must be stable.

**Depends on:** Phases 1–3
**Unlocks:** Phase 5

---

## Goal

**This is one of the most important modules.** A structured veterinary SOAP
record system with vitals, physical examination, assessment, plan, versioning
and a full audit trail.

---

## Scope

### 4.1 Database

```
soap_records   diagnoses   diagnostics   documents (extend)
```

### 4.2 SUBJECTIVE

Fields: chief complaint · history · duration · appetite · water intake ·
urination · defecation · vomiting · diarrhea · coughing · sneezing ·
other observations.

Allow free-text notes.

### 4.3 OBJECTIVE

**Vitals:** temperature · pulse · respiratory rate · weight ·
body condition score · mucous membrane · CRT · hydration status.

**Physical examination:** general appearance · eyes · ears · nose · oral cavity ·
cardiovascular · respiratory · gastrointestinal · urinary · reproductive ·
musculoskeletal · neurological · skin · lymph nodes.

Allow custom notes.

### 4.4 ASSESSMENT

Fields: clinical assessment · differential diagnosis · final diagnosis ·
problem list.

### 4.5 PLAN

Fields: treatment · medication · diagnostics · diet · hospitalization ·
follow-up · client instructions.

### 4.6 Record integrity

Save each SOAP record with: doctor · date/time · patient · appointment ·
version/history · created timestamp · updated timestamp.

> **Do not overwrite previous finalized clinical records without maintaining an
> audit trail.**

### 4.7 Diagnostics & documents

- Doctor can add diagnostic tests
- Upload laboratory reports, X-rays, ultrasound reports, blood test reports,
  referral letters, other documents
- Each document belongs to a specific patient
- Store: file name · type · upload date · uploaded by · patient · description
- Clients see only documents marked **client-visible**

### 4.8 Medical history

Populate the pet profile tabs: **Medical History**, **SOAP / Visit History**,
**Diagnostics**. Doctor can review previous history before consulting.

### 4.9 Follow-ups

Doctor can create a follow-up appointment from a SOAP record.
Doctor dashboard "Uncompleted SOAP records" card now shows real data.

---

## Medical safety guardrails

- The system must not independently diagnose.
- Templates and structured fields only — never auto-generated clinical conclusions.
- Clients must **not** be able to edit SOAP records.

---

## Out of scope

Prescription generation and PDF (Phase 5). The SOAP "Plan → Medication" field
is free text this phase and gets wired to the prescription builder in Phase 5.

---

## Definition of done

- [ ] A doctor can create and finalize a complete SOAP record against an appointment
- [ ] Editing a finalized record creates a new version and an audit entry
- [ ] Previous versions are retrievable
- [ ] A client can view their pet's visit history but cannot edit it
- [ ] Uploads work; client-visibility is enforced
- [ ] SOAP created / SOAP modified appear in `audit_logs`
- [ ] The SOAP form is genuinely usable on a phone

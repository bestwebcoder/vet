# Phase 8 — Reporting

> Read `CLAUDE.md` first. Phase 7 must be stable.

**Depends on:** Phases 1–7
**Unlocks:** Phase 9

---

## Goal

Financial, clinical, client and patient reporting with charts, tables and export.

---

## Scope

### 8.1 Financial reports

- Daily revenue
- Weekly revenue
- Monthly revenue
- Outstanding invoices
- Paid invoices
- Revenue by service
- Revenue by doctor

### 8.2 Clinical reports

- Number of consultations
- Most common diagnoses
- Vaccination count
- Deworming count
- Follow-up cases
- Emergency cases

### 8.3 Client reports

- New clients
- Returning clients
- Active clients

### 8.4 Patient reports

- Dogs
- Cats
- Other species
- Most frequently visited patients

### 8.5 Presentation

- Use charts **and** tables
- Allow CSV/PDF export where appropriate
- Date-range filtering on every report
- Reports must query the database directly — no cached or hard-coded figures

### 8.6 Permissions

Reports are admin-only unless an admin explicitly grants a doctor access.
Doctors must not see practice-wide financial data by default.

### 8.7 Dashboard completion

Admin dashboard is now fully live: today's appointments · pending invoices ·
today's revenue · monthly revenue · vaccinations due today · deworming due this
week · new clients · new patients · outstanding payments · upcoming surgeries ·
doctor availability.

All cards must be **actionable** — e.g. "3 unpaid invoices → View".

---

## Definition of done

- [ ] Every report listed above returns correct figures against seeded test data
- [ ] Revenue figures reconcile with the invoices and payments tables
- [ ] Date-range filters work on all reports
- [ ] CSV and PDF export produce usable files
- [ ] Charts render correctly on mobile
- [ ] A doctor without reporting permission cannot access financial reports
- [ ] Admin dashboard cards all link through to the underlying list

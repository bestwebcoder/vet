# TV Care — Project Instructions

Veterinary practice management system for **The Traveling Vet**, Bangladesh.
Product name: **TV Care**. Brand: **The Traveling Vet**.

This is a production clinical records system, not a prototype. Reliability, data
integrity, and access control come before speed of delivery.

---

## Before implementing anything

1. Read `docs/ALWAYS.md`.
2. Read the relevant `docs/phases/phase-NN-*.md`.
3. Inspect what already exists in the codebase before proposing changes.
4. Identify affected tables, roles, and dependencies.
5. Present a plan with testable checkpoints. Wait for approval.
6. Implement one checkpoint at a time. Stop for review.

Never implement more than one phase in a session. Never implement a phase that
hasn't been asked for.

---

## Stack

- Next.js 15 (App Router), TypeScript, React Server Components by default
- Tailwind CSS + shadcn/ui
- Supabase: Postgres, Auth, Storage, Row Level Security
- Zod for validation (one schema per entity, shared client and server)
- React Hook Form
- @react-pdf/renderer for prescriptions and invoices
- Recharts for reports
- Vitest for tests

Do not add dependencies without asking.

---

## Hard rules

**Data**
- Never hard-code patient records, prices, vaccination schedules, doctor names,
  species, or breeds. Everything comes from the database.
- Never create mock or placeholder functionality where real database
  functionality is required.
- All schema changes go through `supabase/migrations/`. Never edit the database
  directly, never reset it, never drop data.
- UUIDs for primary keys. Proper foreign keys and indexes.
- Money is stored as integers in poisha (1/100 BDT). Never floats.
- All timestamps are `timestamptz`. Display in Asia/Dhaka.

**Access control**
- Every table gets RLS policies. A table without policies is a bug.
- A client can only ever reach their own account, their own pets, and their own
  records. Enforce this in the database, not only in the app layer.
- Doctors have no financial/admin controls unless explicitly granted.
- Clients see only records flagged client-visible.
- When adding a table, write its RLS policies in the same migration.

**Clinical integrity**
- Finalized SOAP records and prescriptions are immutable. Edits create a new
  version and write to `audit_logs`.
- Soft delete only (`deleted_at`). Clinical history is never destroyed.
- Audit logging via Postgres triggers, not application code.

**Medical safety — non-negotiable**
- TV Care records clinical decisions. It does not make them.
- The system must never suggest, recommend, rank, or default a diagnosis,
  medication, dose, route, frequency, or duration.
- The dose calculator performs one operation: `weight × dose-per-kg` where the
  doctor supplied the dose-per-kg. Nothing else.
- Block prescription creation when patient weight is missing.
- Every prescription screen and PDF shows: "Clinical dosing must be reviewed and
  approved by the attending veterinarian."

**Code**
- Reusable components, forms, tables, and dialogs. No copy-paste variants.
- Consistent loading states, error states, and empty states everywhere.
- Never expose technical errors to users. Log the detail, show a human message.
- Don't refactor or replace working code that wasn't part of the task.

---

## Design direction

Professional, calm, warm, trustworthy, minimal, premium. A clean medical
dashboard with warmth — not a pet shop, never childish.

- Soft sage/green, warm off-white, charcoal text, subtle neutral backgrounds
- Generous whitespace; rounded cards but not pill-shaped everything
- Modern, highly readable typography
- **Mobile-first.** Must work on iPhone, Android, tablet, desktop. Vets use this
  on phones during home visits. Test at 375px width.

Dashboards answer one question: *what needs my attention today?* Use actionable
cards ("5 vaccinations due today → View"), never blank screens.

---

## Roles

| Role | Scope |
|---|---|
| Client | Own account, own pets, own records. Read-only on clinical data. |
| Doctor | Assigned/authorized patients. Full clinical write access. No financial admin. |
| Admin | All operational data for the organization. |
| Super Admin | Multi-organization. **Architecture only — not in the UI yet.** |

Structure: Organization → Branch → Doctor / Staff / Client → Patient.
Initial organization: The Traveling Vet.

---

## Definition of done, per checkpoint

- [ ] Migration written, applied to staging, and reversible
- [ ] RLS policies written and tested with a cross-account access test
- [ ] Validation on both client and server via the shared Zod schema
- [ ] Loading, empty, and error states present
- [ ] Works at 375px
- [ ] Audit log entry written where §25 requires one
- [ ] No hard-coded clinical or financial data

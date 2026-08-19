# TV Care — Project Context (always applies)

This file holds the rules and standards that apply to **every** phase.
Phase-specific scope lives in `phases/phase-01…phase-10`.

---

## 1. Product

**Product name:** TV Care
**Brand / first organization:** The Traveling Vet (Bangladesh)

A modern, secure, mobile-first **veterinary practice management system** —
a complete clinic + home-visit platform connecting:

1. Pet owners / clients
2. Veterinarians
3. Clinic administrators
4. Veterinary practice operations

Designed as **scalable SaaS architecture** so additional clinics, veterinarians,
branches and organizations can be added later.

**This is NOT a static website.** It is a functional web application with
authentication, role-based access, a database, patient records, appointment
management, SOAP records, prescription generation, vaccination and deworming
scheduling, billing, invoices, notifications, reports, and audit trails.

---

## 2. Stack

- **Database: PostgreSQL** (mandated by spec)
- Primary keys: **UUIDs or secure IDs** — never sequential integers exposed in URLs
- Schema changes go through **migrations**. Never drop or destroy existing data.

### Framework — decided in Phase 1, do not change mid-project

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 16 (App Router) + TypeScript**, React Server Components by default |
| Database / auth / storage | **Supabase** (PostgreSQL, Auth, Storage, Row Level Security) |
| Styling | **Tailwind CSS v4 + shadcn/ui** |
| Validation | **Zod** — one schema per entity, shared by client and server |
| Forms | **React Hook Form** |
| PDF | **@react-pdf/renderer**, rendered server-side |
| Charts | **Recharts** |
| Tests | **Vitest** |

Notes that differ from most tutorials and are easy to get wrong:

- Next.js 16 renamed `middleware.ts` to **`proxy.ts`**. Session refresh lives in
  `src/proxy.ts` → `src/lib/supabase/proxy.ts`.
- Proxy checks are **optimistic only**. Real authorization is enforced in server
  layouts and, definitively, by row level security in Postgres.
- `@supabase/ssr`'s `setAll(cookies, headers)` takes a second `headers`
  argument carrying no-cache headers. It must be applied to the response, or a
  CDN can serve one user's session cookie to another user.
- The service role key bypasses row level security. It is server-only and must
  never be imported into a client component.

Migrations are developed against the **local Supabase stack** (`npm run db:start`,
`npm run db:reset`) and only pushed to a remote project once a checkpoint passes.

---

## 3. Roles

Four role types.

| Role | Access |
| --- | --- |
| **Client / Pet Owner** | Own account and own pets only |
| **Doctor** | Assigned/authorized patient records; clinical modules |
| **Admin** | Full practice-management and operational data |
| **Super Admin** | Future multi-organization management (architecture only for now) |

Hard rules:
- Clients **must not** edit clinical SOAP records written by doctors.
- Clients may only view information explicitly marked **client-visible**.
- Doctors **must not** have administrative financial controls unless an admin
  explicitly grants permission.
- Never expose one client's patient data to another client.

Future hierarchy to design for now, not expose yet:

```
Organization → Branch → Doctor / Staff / Client → Patient
```

Initially: `Organization = The Traveling Vet`. Do not surface
multi-organization UI unless necessary.

---

## 4. Database tables (full target schema)

Phases build subsets of this. Keep names consistent from day one.

```
organizations          branches               users
roles                  doctors                staff
clients                pets                   species
breeds                 appointments           appointment_statuses
services               service_categories     soap_records
diagnoses              prescriptions          prescription_items
medications            vaccinations           vaccination_schedules
deworming_records      diagnostics            documents
invoices               invoice_items          payments
notifications          notification_logs      audit_logs
```

Use proper foreign keys and indexes. Do not duplicate data unnecessarily.

---

## 5. Security & permissions (applies from Phase 1)

Implement: authentication, authorization, protected routes, secure database
policies, audit logs, session management, password reset, and email
verification where appropriate.

---

## 6. Audit log (applies from Phase 1 onward)

Record important actions: login, patient created, patient updated, SOAP created,
SOAP modified, prescription created, prescription finalized, invoice created,
payment recorded, vaccination recorded, appointment changed.

Store: user, action, record, timestamp, relevant metadata.

Clinical records must **not** be silently deleted — use soft deletion where
appropriate, and preserve history and auditability.

---

## 7. UI / UX direction

The visual identity should feel: professional, calm, warm, trustworthy, minimal,
premium, veterinary-focused.

- Avoid the generic "pet shop" aesthetic. Do **not** make it look childish.
- Clean medical dashboard + warm animal-care feeling.
- Colour system: soft sage/green, warm off-white, charcoal/dark text, subtle
  neutral backgrounds.
- Generous whitespace. Rounded cards, but avoid excessive rounded/pill UI.
- Modern, highly readable typography.
- **Mobile-first is essential.** Must work beautifully on iPhone, Android,
  tablet and desktop.

### Dashboard principle

Every dashboard must immediately answer: *"What needs my attention today?"*
Use **actionable** cards — e.g. "5 vaccinations due today → View",
"3 unpaid invoices → View", "2 follow-ups today → View".

### Empty states

Never leave a blank screen. Example: *"No upcoming appointments — Book an
appointment for your pet."* + `Book Appointment` button.

### Error handling

Professional error states for: appointment slot unavailable, failed payment,
failed upload, invalid prescription, missing patient weight, unauthorized access.
**Never expose raw technical errors to users.**

### Validation

Validate required fields, phone number, email, date, weight, medication dose,
invoice totals, appointment conflicts. Prevent accidental duplicate records.

---

## 8. Navigation

**Client:** Home · My Pets · Appointments · Medical Records · Prescriptions ·
Vaccinations · Deworming · Invoices · Notifications · Profile

**Doctor:** Dashboard · Appointments · Patients · Calendar · SOAP ·
Prescriptions · Vaccinations · Deworming · Diagnostics · Follow-ups

**Admin:** Dashboard · Appointments · Clients · Patients · Doctors · Services ·
Billing · Payments · Vaccinations · Deworming · Reports · Notifications · Settings

Nav items for unbuilt phases should exist but route to a proper empty/"coming
soon" state rather than a broken link.

---

## 9. Development rules (non-negotiable)

1. Do not replace working functionality unnecessarily.
2. Do not create mock functionality when real database functionality is required.
3. Do not hard-code patient records.
4. Do not hard-code prices.
5. Do not hard-code vaccination schedules.
6. Do not hard-code doctor names.
7. All important clinical and administrative information must come from the database.
8. Use reusable components.
9. Use reusable forms.
10. Use reusable tables.
11. Use reusable modal/dialog components.
12. Maintain consistent validation.
13. Maintain consistent loading states.
14. Maintain consistent error handling.
15. Never expose protected patient information to unauthorized users.
16. Preserve clinical history and auditability.
17. Use database migrations for schema changes.
18. Do not destroy existing database data when changing the schema.
19. Before making major architectural changes, inspect the existing implementation.
20. Keep the application production-ready — not a visual prototype.

---

## 10. AI development behaviour

You are acting as a senior full-stack engineer, product designer, database
architect, and QA engineer.

Before implementing each major module:

1. Inspect the existing project.
2. Identify dependencies.
3. Identify affected database tables.
4. Identify affected user roles.
5. Plan the implementation.
6. Implement the feature.
7. Test the feature.
8. Check permissions.
9. Check mobile responsiveness.
10. Fix errors before moving to the next module.

Do not generate unnecessary features that are not specified. When a requirement
is ambiguous, choose the safest scalable architecture rather than a temporary
workaround.

**Do not move to the next phase until the current phase is functional.**

---

## 11. Medical safety

TV Care is a veterinary **record-management** system, not an autonomous
veterinary decision-making system.

- The system must **NOT** independently diagnose patients.
- The system must **NOT** independently prescribe medication.

The system may provide: calculations, templates, scheduling, record
organization, reminders, structured documentation.

All diagnosis, treatment, medication selection and final dosing decisions
remain the responsibility of the attending veterinarian.

---

## 12. Success criteria

The finished system must support these end-to-end workflows:

**Client:** create account → add pet → book appointment → select doctor →
select clinic/home visit → receive confirmation → attend appointment → doctor
creates SOAP → doctor creates prescription → invoice generated → payment
recorded → prescription available to client → vaccination recorded → next
vaccination auto-scheduled → reminder sent → client returns for follow-up.

**Doctor:** login → view today's appointments → open patient → review previous
history → create SOAP → record vitals → enter assessment → create prescription
→ generate PDF → schedule follow-up → record vaccination/deworming → complete
appointment.

**Admin:** login → view operational dashboard → manage doctors → manage
services → manage prices → manage appointments → manage invoices → record
payments → monitor revenue → generate reports → monitor vaccination/deworming
reminders.

Build TV Care as a serious production-grade veterinary practice management
system, not a marketing website. First priority: reliability, data integrity,
clinical usability, security, and a clean user experience.

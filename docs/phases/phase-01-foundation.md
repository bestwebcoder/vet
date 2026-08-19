# Phase 1 — Foundation

> Read `CLAUDE.md` first. Build **only** what is in this file.
> Do not build every module immediately.

**Depends on:** nothing
**Unlocks:** Phase 2

---

## Goal

A working, secure application shell with real authentication, real database,
real role-based access, and the design system — on top of which every later
phase is built.

---

## Scope

### 1.1 Project structure
Set up the repository, environment configuration, and folder structure.
Record the chosen framework in `CLAUDE.md` §2 once decided.

### 1.2 Database foundation (PostgreSQL)
Create migrations for the core tables only:

```
organizations   branches   users   roles
doctors         staff      clients
audit_logs
```

- UUIDs / secure IDs as primary keys
- Proper foreign keys and indexes
- Seed one organization: **The Traveling Vet**

Design the schema so the remaining tables in `CLAUDE.md` §4 can be added later
without restructuring.

### 1.3 Authentication
- Account creation
- Secure login / logout
- Session management
- Password reset
- Email verification where appropriate

### 1.4 Role-based access
Four roles: Client, Doctor, Admin, Super Admin (Super Admin = architecture only,
not exposed in UI).

- Protected routes per role
- Secure database policies / row-level access
- Unauthorized access produces a proper error state, never a leak

### 1.5 Organization structure
Implement `Organization → Branch → Doctor / Staff / Client → Patient` in the
schema. Do **not** expose multi-organization functionality in the UI.

### 1.6 Design system
Build reusable primitives that every later phase consumes:

- Colour tokens: soft sage/green, warm off-white, charcoal text, neutral backgrounds
- Typography scale
- Buttons, inputs, selects, date pickers
- Cards, tables, modals/dialogs
- Loading states, empty states, error states
- Form validation pattern

### 1.7 Responsive navigation
Implement the three role navigations from `CLAUDE.md` §8. Items belonging to
unbuilt phases render a proper empty state, not a broken route.

### 1.8 Dashboard shells
Three dashboards, correctly routed and role-guarded, with real layout and
empty/placeholder cards:

- **Client dashboard shell**
- **Doctor dashboard shell**
- **Admin dashboard shell**

### 1.9 Audit logging
Start recording from day one. Minimum for this phase: login events, user
created, user updated. Store user, action, record, timestamp, metadata.

---

## Out of scope

Pets, appointments, SOAP, prescriptions, vaccinations, billing, reports,
notifications. Do not stub these with fake data.

---

## Definition of done

- [ ] A user can register, verify, log in, log out, and reset a password
- [ ] Each of the three roles lands on its own dashboard and cannot reach another role's routes
- [ ] All data comes from PostgreSQL — no hard-coded users, doctors, or records
- [ ] Migrations run cleanly from an empty database
- [ ] Design system components are reused, not copy-pasted
- [ ] Layout works on iPhone, Android, tablet and desktop
- [ ] Login and user changes appear in `audit_logs`
- [ ] Every unbuilt nav item shows a proper empty state

**Verify the foundation works correctly before starting Phase 2.**

# Phase 10 — Polish & Production Readiness

> Read `CLAUDE.md` first. Phase 9 must be stable.

**Depends on:** Phases 1–9
**Unlocks:** launch

---

## Goal

Make TV Care genuinely production-grade: secure, permission-correct, fast,
accessible, and consistent.

---

## Scope

### 10.1 Security review

- Re-audit authentication, session management and password reset
- Verify protected routes and secure database policies on every endpoint
- Confirm no protected patient information is reachable by an unauthorized user
- Check file upload handling (type validation, size limits, access control)

### 10.2 Permission review

Walk every role against every module:

| | Client | Doctor | Admin |
| --- | --- | --- | --- |
| Own data only | ✔ | — | — |
| Clinical records | view (client-visible only) | create/edit | view |
| Financial controls | own invoices | only if granted | full |

Explicitly verify:
- A client cannot edit SOAP records
- A client cannot see another client's data
- A doctor without the finance permission cannot reach billing or reports

### 10.3 Mobile testing

Test every screen on iPhone, Android, tablet and desktop.
The SOAP form, calendar and prescription builder are the hardest — check them first.

### 10.4 Form validation sweep

Confirm consistent validation everywhere: required fields · phone number ·
email · date · weight · medication dose · invoice totals · appointment conflicts.
Prevent accidental duplicate records.

### 10.5 Performance optimization

- Index review on all foreign keys and common query paths
- Eliminate N+1 queries in list views and dashboards
- Paginate long lists
- Optimize PDF generation and image/document loading

### 10.6 Accessibility review

Keyboard navigation, focus states, colour contrast against the sage/off-white
palette, form labels, and screen-reader landmarks.

### 10.7 Error handling sweep

Confirm professional error states for: appointment slot unavailable · failed
payment · failed upload · invalid prescription · missing patient weight ·
unauthorized access.
**No raw technical errors reach the user anywhere.**

### 10.8 UI consistency review

- One design system — no one-off components
- Consistent loading states, empty states and modals
- Consistent typography and spacing
- No screen left blank

### 10.9 End-to-end success criteria

Run the three full workflows in `CLAUDE.md` §12 (client, doctor, admin) from
start to finish against a clean database. All three must pass.

---

## Definition of done

- [ ] Security and permission matrices verified by explicit tests, not by inspection
- [ ] All three end-to-end workflows pass on a clean database
- [ ] Every screen verified on mobile
- [ ] No unhandled error path exposes technical detail
- [ ] Audit trail is complete and clinical history is intact after all operations
- [ ] Migrations run cleanly from empty and are non-destructive on an existing database

# Phase 9 — Notification Delivery Channels

> Read `CLAUDE.md` first. Phase 8 must be stable.

**Depends on:** Phases 1–8 (especially the Phase 6 reminder engine)
**Unlocks:** Phase 10

---

## Goal

Deliver the notifications the Phase 6 reminder engine already schedules, over
real external channels.

---

## Scope

### 9.1 Channels

Prepare and implement delivery for:

- Email
- SMS
- WhatsApp
- Push notifications

Each channel is a pluggable provider behind a common interface, so a provider
can be swapped without touching the reminder engine.

### 9.2 Notification types already defined (Phase 6)

Appointment reminder · vaccination reminder · deworming reminder ·
follow-up reminder · invoice reminder · payment confirmation.

Plus transactional sends unlocked here:

- Appointment confirmation
- Prescription available
- Invoice issued

### 9.3 State handling

Notification states: Scheduled · Sent · Delivered · Failed.

- Persist provider message IDs and delivery callbacks in `notification_logs`
- Retry failed sends with backoff
- A failed send must never crash the scheduling job

### 9.4 Preferences

- Clients can manage which notifications they receive and on which channel
- Respect quiet hours where configured
- Admin can configure practice-level defaults under Settings

### 9.5 Regional considerations

The first organization operates in Bangladesh — pick SMS and WhatsApp providers
with reliable BD delivery, and store phone numbers in a normalized international
format.

### 9.6 Content

Notification templates are database-driven and editable by admins.
Never include protected clinical detail in an SMS or push payload beyond what
the recipient is authorized to see.

---

## Definition of done

- [ ] Each channel sends successfully in a test environment
- [ ] Delivery state transitions are recorded in `notification_logs`
- [ ] Failed sends retry and surface in an admin view
- [ ] Clients can opt out per channel and per notification type
- [ ] Templates are editable without a code change
- [ ] No notification leaks data the recipient is not authorized to see

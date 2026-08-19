# Phase 3 — Appointments & Calendar

> Read `CLAUDE.md` first. Phase 2 must be stable before starting.

**Depends on:** Phases 1–2
**Unlocks:** Phase 4

---

## Goal

A real appointment scheduling system with doctor availability, double-booking
prevention, and a professional doctor calendar.

---

## Scope

### 3.1 Database

```
appointments   appointment_statuses   services (minimal)
doctor_availability
```

`services` here is minimal — full service/pricing management lands in Phase 7.

### 3.2 Booking flow

Client selects, in order:

1. Pet
2. Service
3. Doctor
4. Visit type
5. Date
6. Available time
7. Reason for visit
8. Location

### 3.3 Visit types

- Clinic visit
- Home visit
- Follow-up
- Emergency
- Surgery
- Vaccination
- Grooming / other services if enabled later

### 3.4 Appointment status

- Requested
- Confirmed
- Checked-in
- In consultation
- Completed
- Cancelled
- No-show

### 3.5 Availability rules

- **Prevent double booking.**
- Doctor availability determines which slots are offered.

Admin must be able to configure:

- Working days
- Working hours
- Breaks
- Appointment duration
- Doctor-specific availability
- Home visit availability

### 3.6 Client-side appointment management

- View upcoming appointments
- Reschedule / cancel according to clinic policy
- Client dashboard "Upcoming appointment" card now shows real data
  (doctor, date, time, type)

### 3.7 Doctor calendar

Professional calendar with **Day / Week / Month** views.
Colour-code by appointment status.

Each entry shows: client · pet · species · appointment type · service · time ·
location · emergency indicator.

### 3.8 Doctor dashboard (real data)

Populate: today's appointments, upcoming appointments, emergency appointments,
follow-up cases, surgery schedule, recently seen patients.
(Vaccinations due and uncompleted SOAP cards stay empty until Phases 4 and 6.)

### 3.9 Global search (first pass)

Authorized users can search: client name, phone number, pet name, microchip
number, patient ID, appointment ID.
Results must clearly distinguish clients from patients.
*(Invoice ID search is added in Phase 7.)*

---

## Out of scope

SOAP notes, prescriptions, billing an appointment.

---

## Definition of done

- [ ] A client can book an appointment end to end and receive confirmation state
- [ ] Two clients cannot book the same doctor slot
- [ ] Slots respect working hours, breaks, and doctor-specific availability
- [ ] Status transitions work and are colour-coded on the calendar
- [ ] Appointment changes are written to `audit_logs`
- [ ] "Appointment slot unavailable" error state is handled gracefully
- [ ] Calendar is usable on mobile

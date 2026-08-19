# Phase 7 — Services, Billing, Invoices & Payments

> Read `CLAUDE.md` first. Phase 6 must be stable.

**Depends on:** Phases 1–6
**Unlocks:** Phase 8

---

## Goal

Service catalogue with admin-managed pricing, professional invoices with PDF
output, and manual payment recording.

---

## Scope

### 7.1 Database

```
services   service_categories   invoices   invoice_items   payments
```

### 7.2 Service catalogue

Service types: consultation · follow-up · home visit · vaccination · deworming ·
surgery · diagnostic test · procedure · medicine · other services.

Each service must have: service name · category · price · tax/VAT ·
active/inactive status.

**Prices come from the database. Never hard-code prices.**

### 7.3 Admin service management page

Admin can: add service · edit service · disable service · set price ·
set duration · set category · set whether the service is available for home
visit · set whether the service requires a doctor · set tax/VAT.

Also configurable here: home visit fees.

### 7.4 Invoice

Fields: invoice number · client · patient · date · services · quantity ·
unit price · discount · VAT/tax · total · amount paid · balance · payment status.

Statuses: Draft · Issued · Partially paid · Paid · Cancelled · Refunded.

Validate invoice totals. An invoice must reconcile: items − discount + tax =
total, and amount paid + balance = total.

### 7.5 Invoice PDF

Generate a professional PDF including: The Traveling Vet logo · invoice number ·
QR code · payment information · contact information.

### 7.6 Payment system

Initially support **manual payment recording**.

Payment methods: Cash · Bank transfer · bKash · Nagad · Card · Other.

Record: amount · payment method · transaction/reference number · date ·
recorded by.

Prepare the architecture for a future online payment gateway integration, but
do not integrate one now.

### 7.7 Surfaces to populate

- Client: **Invoices** nav — view invoices, download invoices, view payment history
- Pet profile: **Billing** tab
- Admin dashboard: pending invoices, today's revenue, monthly revenue,
  outstanding payments
- Global search: **Invoice ID**
- Reminder engine: invoice reminder, payment confirmation

### 7.8 Permissions

Doctors must **not** have access to administrative financial controls unless an
admin explicitly grants permission. Implement that permission flag here.

---

## Out of scope

Revenue analytics and charts (Phase 8). Online payment gateway.

---

## Definition of done

- [ ] Admin can add/edit/disable services and change prices with no code change
- [ ] An invoice can be generated from a completed appointment
- [ ] Totals, discount, VAT and balance all reconcile — verified with test cases
- [ ] Partial payments move the invoice to "Partially paid" correctly
- [ ] Invoice PDF renders with logo, invoice number and QR code
- [ ] Client can view and download their own invoices only
- [ ] A doctor without the finance permission cannot reach billing controls
- [ ] Invoice created / payment recorded appear in `audit_logs`
- [ ] "Failed payment" error state handled gracefully

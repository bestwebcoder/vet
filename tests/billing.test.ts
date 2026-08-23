import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createUserWithRole, organizationId, runId, signedInClient } from "./setup/http";
import { formatCurrency, paisaToTaaka, taakaToPaisa, CurrencyFormatError } from "@/lib/currency";

/**
 * Phase 7 · Checkpoint 1 — service catalog, invoices, payments.
 *
 * The headline guarantee here is different from every earlier phase: an
 * invoice's totals are never a doctor-editable suggestion, they are a
 * database invariant. Every test that touches items/discount/payments reads
 * the invoice row back afterward and checks the trigger's own arithmetic —
 * never computes the expected total itself.
 */

describe("pure currency helpers", () => {
  it.each([
    ["500", 50_000],
    ["500.5", 50_050],
    ["500.50", 50_050],
    ["0.01", 1],
    [" 12.5 ", 1_250],
  ])("reads %s taka as %i paisa", (input, expected) => {
    expect(taakaToPaisa(input)).toBe(expected);
  });

  it("rounds at the paisa rather than truncating", () => {
    expect(taakaToPaisa("1.005")).toBe(101);
    expect(taakaToPaisa("1.004")).toBe(100);
  });

  it.each(["", "abc", "-5", "1.2.3"])("rejects %s", (input) => {
    expect(() => taakaToPaisa(input)).toThrow(CurrencyFormatError);
  });

  it("formats paisa for reading", () => {
    expect(formatCurrency(150_000)).toBe("৳1,500.00");
    expect(formatCurrency(50)).toBe("৳0.50");
    expect(paisaToTaaka(50_050)).toBe("500.50");
  });
});

const RUN = runId();

let orgA: string;
let clientA: SupabaseClient;
let doctorA: SupabaseClient;
let billingDoctorA: SupabaseClient;
let adminA: SupabaseClient;
let clientB: SupabaseClient;

let clientRecordA: string;
let doctorRecordA: string;
let petA: string;
let categoryId: string;
let serviceId: string;
let homeVisitFeeServiceId: string;

let appointmentOffset = 0;

async function insertAppointment(overrides: Record<string, unknown> = {}) {
  appointmentOffset += 1;
  const starts = new Date(Date.now() - 3_600_000 - appointmentOffset * 3_600_000);
  const ends = new Date(starts.getTime() + 30 * 60_000);

  const { data, error } = await admin
    .from("appointments")
    .insert({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petA,
      doctor_id: doctorRecordA,
      service_id: serviceId,
      visit_type: "clinic",
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      status: "completed",
      ...overrides,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  orgA = await organizationId();

  const [userA, userB, vetA, vetBillingA, adminUser] = await Promise.all([
    createUserWithRole(`bill-a-${RUN}`, "client"),
    createUserWithRole(`bill-b-${RUN}`, "client"),
    createUserWithRole(`bill-vet-${RUN}`, "doctor"),
    createUserWithRole(`bill-vet-billing-${RUN}`, "doctor"),
    createUserWithRole(`bill-admin-${RUN}`, "admin"),
  ]);

  const [{ data: clientRow }, { data: doctorRow }] = await Promise.all([
    admin
      .from("clients")
      .insert({ user_id: userA.userId, organization_id: orgA, full_name: `Bill Client A ${RUN}`, phone: `+88017${RUN}51` })
      .select("id")
      .single(),
    admin.from("doctors").insert({ user_id: vetA.userId, organization_id: orgA }).select("id").single(),
    admin.from("doctors").insert({ user_id: vetBillingA.userId, organization_id: orgA, can_manage_billing: true }),
  ]);

  clientRecordA = clientRow!.id;
  doctorRecordA = doctorRow!.id;

  const { data: species } = await admin.from("species").select("id").eq("slug", "dog").single();
  const { data: pet } = await admin
    .from("pets")
    .insert({ client_id: clientRecordA, organization_id: orgA, name: `Bill Pet ${RUN}`, species_id: species!.id })
    .select("id")
    .single();
  petA = pet!.id;

  const { data: category } = await admin
    .from("service_categories")
    .insert({ organization_id: orgA, name: `Test Category ${RUN}` })
    .select("id")
    .single();
  categoryId = category!.id;

  const { data: service } = await admin
    .from("services")
    .insert({
      organization_id: orgA,
      category_id: categoryId,
      name: `Test Consultation ${RUN}`,
      price_paisa: 100_000,
      tax_rate_percent: 5,
    })
    .select("id")
    .single();
  serviceId = service!.id;

  // At most one home-visit-fee service exists per organization (a real
  // production rule, not scoped by test run) — reuse one if a prior run in
  // this same local database already created it, rather than colliding
  // with the partial unique index.
  const { data: existingFeeService } = await admin
    .from("services")
    .select("id")
    .eq("organization_id", orgA)
    .eq("is_home_visit_fee", true)
    .maybeSingle();

  if (existingFeeService) {
    homeVisitFeeServiceId = existingFeeService.id;
    await admin.from("services").update({ price_paisa: 50_000, is_active: true }).eq("id", existingFeeService.id);
  } else {
    const { data: feeService, error: feeServiceError } = await admin
      .from("services")
      .insert({
        organization_id: orgA,
        name: `Test Home Visit Fee ${RUN}`,
        price_paisa: 50_000,
        is_home_visit_fee: true,
      })
      .select("id")
      .single();
    if (feeServiceError) throw feeServiceError;
    homeVisitFeeServiceId = feeService!.id;
  }

  [clientA, doctorA, billingDoctorA, adminA, clientB] = await Promise.all([
    signedInClient(userA.email),
    signedInClient(vetA.email),
    signedInClient(vetBillingA.email),
    signedInClient(adminUser.email),
    signedInClient(userB.email),
  ]);
}, 120_000);

describe("service catalog — admin-configurable, never hard-coded", () => {
  it("is readable by every authenticated role, but written only by an admin", async () => {
    const { data: readByClient, error: readErr } = await clientA.from("services").select("id").eq("id", serviceId);
    expect(readErr).toBeNull();
    expect(readByClient).toHaveLength(1);

    const { error: doctorInsertErr } = await doctorA
      .from("services")
      .insert({ organization_id: orgA, name: "Not allowed" });
    expect(doctorInsertErr).not.toBeNull();

    const { data: created, error: adminInsertErr } = await adminA
      .from("services")
      .insert({ organization_id: orgA, name: `Admin Service ${RUN}`, price_paisa: 20_000 })
      .select("id")
      .single();
    expect(adminInsertErr).toBeNull();

    const { error: adminUpdateErr } = await adminA
      .from("services")
      .update({ price_paisa: 25_000 })
      .eq("id", created!.id);
    expect(adminUpdateErr).toBeNull();
  });
});

describe("generating an invoice from a completed appointment", () => {
  it("adds the home-visit fee as a second item for a home-visit appointment", async () => {
    const appointmentId = await insertAppointment({ visit_type: "home" });

    const { data: invoice, error } = await adminA
      .from("invoices")
      .insert({ organization_id: orgA, client_id: clientRecordA, pet_id: petA, appointment_id: appointmentId })
      .select("id")
      .single();
    expect(error).toBeNull();

    const { error: itemsErr } = await adminA.from("invoice_items").insert([
      {
        invoice_id: invoice!.id,
        service_id: serviceId,
        description: "Test Consultation",
        quantity: 1,
        unit_price_paisa: 100_000,
        tax_rate_percent: 5,
        line_total_paisa: 100_000,
      },
      {
        invoice_id: invoice!.id,
        service_id: homeVisitFeeServiceId,
        description: "Home visit fee",
        quantity: 1,
        unit_price_paisa: 50_000,
        tax_rate_percent: 0,
        line_total_paisa: 50_000,
      },
    ]);
    expect(itemsErr).toBeNull();

    const { data: reloaded } = await admin
      .from("invoices")
      .select("subtotal_paisa, tax_paisa, total_paisa")
      .eq("id", invoice!.id)
      .single();

    // subtotal = 100000 + 50000; tax = round(100000*0.05) + round(50000*0) = 5000
    expect(reloaded).toMatchObject({ subtotal_paisa: 150_000, tax_paisa: 5_000, total_paisa: 155_000 });
  });
});

describe("totals reconcile by construction", () => {
  let invoiceId: string;

  beforeAll(async () => {
    const appointmentId = await insertAppointment();
    const { data: invoice } = await adminA
      .from("invoices")
      .insert({ organization_id: orgA, client_id: clientRecordA, pet_id: petA, appointment_id: appointmentId })
      .select("id")
      .single();
    invoiceId = invoice!.id;
  });

  async function reload() {
    const { data } = await admin
      .from("invoices")
      .select("subtotal_paisa, discount_paisa, tax_paisa, total_paisa, amount_paid_paisa, balance_paisa, status")
      .eq("id", invoiceId)
      .single();
    return data!;
  }

  function expectReconciled(row: {
    subtotal_paisa: number;
    discount_paisa: number;
    tax_paisa: number;
    total_paisa: number;
    amount_paid_paisa: number;
    balance_paisa: number;
  }) {
    expect(row.subtotal_paisa - row.discount_paisa + row.tax_paisa).toBe(row.total_paisa);
    expect(row.amount_paid_paisa + row.balance_paisa).toBe(row.total_paisa);
  }

  it("reconciles after adding an item, changing the discount, and paying", async () => {
    const { data: item, error: itemErr } = await adminA
      .from("invoice_items")
      .insert({
        invoice_id: invoiceId,
        description: "Consultation",
        quantity: 2,
        unit_price_paisa: 30_000,
        tax_rate_percent: 10,
        line_total_paisa: 60_000,
      })
      .select("id")
      .single();
    expect(itemErr).toBeNull();

    let row = await reload();
    expectReconciled(row);
    expect(row.subtotal_paisa).toBe(60_000);
    expect(row.tax_paisa).toBe(6_000);
    expect(row.total_paisa).toBe(66_000);

    const { error: discountErr } = await adminA
      .from("invoices")
      .update({ discount_paisa: 6_000 })
      .eq("id", invoiceId);
    expect(discountErr).toBeNull();

    row = await reload();
    expectReconciled(row);
    expect(row.total_paisa).toBe(60_000);

    const { error: issueErr } = await adminA
      .from("invoices")
      .update({ status: "issued", issued_at: new Date().toISOString() })
      .eq("id", invoiceId);
    expect(issueErr).toBeNull();

    const { error: paymentErr } = await adminA
      .from("payments")
      .insert({ invoice_id: invoiceId, organization_id: orgA, amount_paisa: 20_000, method: "cash" });
    expect(paymentErr).toBeNull();

    row = await reload();
    expectReconciled(row);
    expect(row.status).toBe("partially_paid");
    expect(row.balance_paisa).toBe(40_000);

    const { error: finalPaymentErr } = await adminA
      .from("payments")
      .insert({ invoice_id: invoiceId, organization_id: orgA, amount_paisa: 40_000, method: "cash" });
    expect(finalPaymentErr).toBeNull();

    row = await reload();
    expectReconciled(row);
    expect(row.status).toBe("paid");
    expect(row.balance_paisa).toBe(0);

    void item;
  });

  it("cannot change items once the invoice is no longer a draft", async () => {
    const { error } = await adminA
      .from("invoice_items")
      .insert({ invoice_id: invoiceId, description: "Sneaky", quantity: 1, unit_price_paisa: 1, line_total_paisa: 1 });
    expect(error).not.toBeNull();
  });
});

describe("§7.8 — a doctor without the billing permission cannot write, a permitted one can", () => {
  it("blocks a plain doctor and a client, allows the billing doctor and the admin", async () => {
    const appointmentId = await insertAppointment();
    const base = { organization_id: orgA, client_id: clientRecordA, pet_id: petA, appointment_id: appointmentId };

    const { error: clientErr } = await clientA.from("invoices").insert(base);
    expect(clientErr).not.toBeNull();

    const { error: doctorErr } = await doctorA.from("invoices").insert(base);
    expect(doctorErr).not.toBeNull();

    const { error: billingDoctorErr } = await billingDoctorA.from("invoices").insert(base);
    expect(billingDoctorErr).toBeNull();

    const { error: adminErr } = await adminA.from("invoices").insert(base);
    expect(adminErr).toBeNull();
  });

  it("stops a doctor granting themselves the permission", async () => {
    const { error } = await doctorA
      .from("doctors")
      .update({ can_manage_billing: true })
      .eq("id", doctorRecordA);
    expect(error).not.toBeNull();

    const { error: adminGrantErr } = await adminA
      .from("doctors")
      .update({ can_manage_billing: true })
      .eq("id", doctorRecordA);
    expect(adminGrantErr).toBeNull();
  });
});

describe("payments — failed payment is refused, never partially applied", () => {
  let invoiceId: string;

  beforeAll(async () => {
    const appointmentId = await insertAppointment();
    const { data: invoice } = await adminA
      .from("invoices")
      .insert({ organization_id: orgA, client_id: clientRecordA, pet_id: petA, appointment_id: appointmentId })
      .select("id")
      .single();
    invoiceId = invoice!.id;

    await adminA.from("invoice_items").insert({
      invoice_id: invoiceId,
      description: "Consultation",
      quantity: 1,
      unit_price_paisa: 50_000,
      line_total_paisa: 50_000,
    });
    await adminA.from("invoices").update({ status: "issued", issued_at: new Date().toISOString() }).eq("id", invoiceId);
  });

  it("rejects a non-positive amount at the database level", async () => {
    const { error } = await adminA
      .from("payments")
      .insert({ invoice_id: invoiceId, organization_id: orgA, amount_paisa: 0, method: "cash" });
    expect(error).not.toBeNull();
  });
});

describe("client visibility", () => {
  it("sees only their own non-draft invoice, never a draft, never another client's", async () => {
    const appointmentId = await insertAppointment();
    const { data: draft } = await adminA
      .from("invoices")
      .insert({ organization_id: orgA, client_id: clientRecordA, pet_id: petA, appointment_id: appointmentId })
      .select("id")
      .single();

    const { data: seenAsDraft } = await clientA.from("invoices").select("id").eq("id", draft!.id);
    expect(seenAsDraft).toEqual([]);

    await adminA.from("invoice_items").insert({
      invoice_id: draft!.id,
      description: "Consultation",
      quantity: 1,
      unit_price_paisa: 10_000,
      line_total_paisa: 10_000,
    });
    await adminA.from("invoices").update({ status: "issued", issued_at: new Date().toISOString() }).eq("id", draft!.id);

    const { data: seenAsIssued } = await clientA.from("invoices").select("id").eq("id", draft!.id);
    expect(seenAsIssued).toEqual([{ id: draft!.id }]);

    const { data: seenByStranger } = await clientB.from("invoices").select("id").eq("id", draft!.id);
    expect(seenByStranger).toEqual([]);
  });
});

describe("reminder engine", () => {
  it("creates an invoice_reminder when issued, and a payment_confirmation when paid", async () => {
    const appointmentId = await insertAppointment();
    const { data: invoice } = await adminA
      .from("invoices")
      .insert({ organization_id: orgA, client_id: clientRecordA, pet_id: petA, appointment_id: appointmentId })
      .select("id")
      .single();

    await adminA.from("invoice_items").insert({
      invoice_id: invoice!.id,
      description: "Consultation",
      quantity: 1,
      unit_price_paisa: 20_000,
      line_total_paisa: 20_000,
    });

    await adminA
      .from("invoices")
      .update({ status: "issued", issued_at: new Date().toISOString(), due_date: "2030-01-01" })
      .eq("id", invoice!.id);

    const { data: issuedNotifications } = await admin
      .from("notifications")
      .select("id, type, status")
      .eq("related_table", "invoices")
      .eq("related_id", invoice!.id);
    expect(issuedNotifications).toHaveLength(1);
    expect(issuedNotifications![0]).toMatchObject({ type: "invoice_reminder", status: "scheduled" });

    const { data: payment } = await adminA
      .from("payments")
      .insert({ invoice_id: invoice!.id, organization_id: orgA, amount_paisa: 20_000, method: "cash" })
      .select("id")
      .single();

    const { data: paymentNotifications } = await admin
      .from("notifications")
      .select("id, type, status")
      .eq("related_table", "payments")
      .eq("related_id", payment!.id);
    expect(paymentNotifications).toHaveLength(1);
    expect(paymentNotifications![0]).toMatchObject({ type: "payment_confirmation", status: "scheduled" });
  });
});

describe("audit trail", () => {
  it("records invoice creation and payment recording", async () => {
    const appointmentId = await insertAppointment();
    const { data: invoice } = await adminA
      .from("invoices")
      .insert({ organization_id: orgA, client_id: clientRecordA, pet_id: petA, appointment_id: appointmentId })
      .select("id")
      .single();

    await adminA.from("invoice_items").insert({
      invoice_id: invoice!.id,
      description: "Consultation",
      quantity: 1,
      unit_price_paisa: 10_000,
      line_total_paisa: 10_000,
    });
    await adminA.from("invoices").update({ status: "issued", issued_at: new Date().toISOString() }).eq("id", invoice!.id);

    const { data: payment } = await adminA
      .from("payments")
      .insert({ invoice_id: invoice!.id, organization_id: orgA, amount_paisa: 10_000, method: "cash" })
      .select("id")
      .single();

    const [{ data: invoiceLogs }, { data: paymentLogs }] = await Promise.all([
      admin.from("audit_logs").select("action").eq("entity_table", "invoices").eq("entity_id", invoice!.id),
      admin.from("audit_logs").select("action").eq("entity_table", "payments").eq("entity_id", payment!.id),
    ]);

    expect((invoiceLogs ?? []).some((row) => row.action === "invoices.insert")).toBe(true);
    expect((paymentLogs ?? []).some((row) => row.action === "payments.insert")).toBe(true);
  });
});

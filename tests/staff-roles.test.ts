import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createUserWithRole, organizationId, runId, signedInClient } from "./setup/http";

/**
 * The three narrower clinic-side roles — finance manager, lab, receptionist —
 * added in 20260917000100_staff_roles.sql.
 *
 * These assertions are the actual boundary. The navigation filter and the
 * per-page requireRole guards decide what someone is *shown*; only row level
 * security decides what they can *reach*, so every case here runs as a really
 * signed-in user through PostgREST, the same path a browser takes.
 *
 * Each role is tested twice over: that it can do its own job, and that it
 * cannot do the other two's. A role that quietly gains access to clinical
 * records or to money is the failure that matters.
 */

const RUN = runId();

let orgA: string;
let financeA: SupabaseClient;
let labA: SupabaseClient;
let receptionA: SupabaseClient;
let adminA: SupabaseClient;

let clientRecordA: string;
let petA: string;
let appointmentId: string;
let invoiceId: string;
let diagnosticId: string;
let soapRecordId: string;
let doctorRecordA: string;
let serviceId: string;

beforeAll(async () => {
  orgA = await organizationId();

  const [finance, lab, reception, adminUser, owner, vet] = await Promise.all([
    createUserWithRole(`staff-fin-${RUN}`, "finance_manager"),
    createUserWithRole(`staff-lab-${RUN}`, "lab"),
    createUserWithRole(`staff-rec-${RUN}`, "receptionist"),
    createUserWithRole(`staff-admin-${RUN}`, "admin"),
    createUserWithRole(`staff-owner-${RUN}`, "client"),
    createUserWithRole(`staff-vet-${RUN}`, "doctor"),
  ]);

  const { data: clientRow } = await admin
    .from("clients")
    .insert({ user_id: owner.userId, organization_id: orgA, full_name: `Owner ${RUN}`, phone: `+8801711${RUN}` })
    .select("id")
    .single();
  clientRecordA = clientRow!.id;

  const { data: speciesRow } = await admin.from("species").select("id").limit(1).single();

  const { data: petRow } = await admin
    .from("pets")
    .insert({ client_id: clientRecordA, organization_id: orgA, name: `Pet ${RUN}`, species_id: speciesRow!.id })
    .select("id")
    .single();
  petA = petRow!.id;

  const { data: doctorRow } = await admin
    .from("doctors")
    .insert({ user_id: vet.userId, organization_id: orgA })
    .select("id")
    .single();
  doctorRecordA = doctorRow!.id;

  const { data: serviceRow } = await admin
    .from("services")
    .insert({ organization_id: orgA, name: `Service ${RUN}`, price_paisa: 50_000 })
    .select("id")
    .single();
  serviceId = serviceRow!.id;

  const starts = new Date(Date.now() - 3_600_000);
  const { data: appointmentRow } = await admin
    .from("appointments")
    .insert({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petA,
      doctor_id: doctorRow!.id,
      service_id: serviceRow!.id,
      visit_type: "clinic",
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 30 * 60_000).toISOString(),
      status: "completed",
    })
    .select("id")
    .single();
  appointmentId = appointmentRow!.id;

  const { data: invoiceRow } = await admin
    .from("invoices")
    .insert({ organization_id: orgA, client_id: clientRecordA, pet_id: petA, appointment_id: appointmentId })
    .select("id")
    .single();
  invoiceId = invoiceRow!.id;

  const { data: diagnosticRow } = await admin
    .from("diagnostics")
    .insert({ organization_id: orgA, appointment_id: appointmentId, pet_id: petA, test_name: `Blood panel ${RUN}` })
    .select("id")
    .single();
  diagnosticId = diagnosticRow!.id;

  const { data: soapRow } = await admin
    .from("soap_records")
    .insert({ organization_id: orgA, appointment_id: appointmentId, pet_id: petA, doctor_id: doctorRow!.id })
    .select("id")
    .single();
  soapRecordId = soapRow!.id;

  [financeA, labA, receptionA, adminA] = await Promise.all([
    signedInClient(finance.email),
    signedInClient(lab.email),
    signedInClient(reception.email),
    signedInClient(adminUser.email),
  ]);
}, 180_000);

describe("finance manager", () => {
  it("reads and writes invoices and payments", async () => {
    const { data: invoices, error } = await financeA.from("invoices").select("id").eq("id", invoiceId);
    expect(error).toBeNull();
    expect(invoices).toHaveLength(1);

    const { error: itemErr } = await financeA
      .from("invoice_items")
      .insert({ invoice_id: invoiceId, description: `Consult ${RUN}`, quantity: 1, unit_price_paisa: 50_000, line_total_paisa: 50_000 });
    expect(itemErr).toBeNull();
  });

  it("sees the payer and the patient behind an invoice", async () => {
    const { data: clients } = await financeA.from("clients").select("id").eq("id", clientRecordA);
    expect(clients).toHaveLength(1);

    const { data: pets } = await financeA.from("pets").select("id").eq("id", petA);
    expect(pets).toHaveLength(1);
  });

  it("cannot reach clinical records", async () => {
    const { data: soap } = await financeA.from("soap_records").select("id").eq("id", soapRecordId);
    expect(soap ?? []).toHaveLength(0);

    const { data: diagnostics } = await financeA.from("diagnostics").select("id").eq("id", diagnosticId);
    expect(diagnostics ?? []).toHaveLength(0);
  });

  it("reaches financial reports but not clinical ones", async () => {
    const today = new Date().toISOString().slice(0, 10);

    const { error: financialErr } = await financeA.rpc("report_revenue_totals", {
      p_organization_id: orgA,
      p_from: today,
      p_to: today,
    });
    expect(financialErr).toBeNull();

    const { error: clinicalErr } = await financeA.rpc("report_clinical_summary", {
      p_organization_id: orgA,
      p_from: today,
      p_to: today,
    });
    expect(clinicalErr).not.toBeNull();
  });

  it("cannot book an appointment", async () => {
    const starts = new Date(Date.now() + 172_800_000);
    const { error } = await financeA.from("appointments").insert({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petA,
      doctor_id: doctorRecordA,
      service_id: serviceId,
      visit_type: "clinic",
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 30 * 60_000).toISOString(),
    });
    expect(error).not.toBeNull();
  });
});

describe("lab", () => {
  it("reads a test and records its result", async () => {
    const { data: tests, error } = await labA.from("diagnostics").select("id").eq("id", diagnosticId);
    expect(error).toBeNull();
    expect(tests).toHaveLength(1);

    const { error: updateErr } = await labA
      .from("diagnostics")
      .update({ status: "completed", result_notes: "Within normal limits." })
      .eq("id", diagnosticId);
    expect(updateErr).toBeNull();
  });

  it("cannot order a test — that stays a clinical decision", async () => {
    const { error } = await labA.from("diagnostics").insert({
      organization_id: orgA,
      appointment_id: appointmentId,
      pet_id: petA,
      test_name: `Unordered ${RUN}`,
    });
    expect(error).not.toBeNull();
  });

  it("cannot reach money or SOAP notes", async () => {
    const { data: invoices } = await labA.from("invoices").select("id").eq("id", invoiceId);
    expect(invoices ?? []).toHaveLength(0);

    const { data: soap } = await labA.from("soap_records").select("id").eq("id", soapRecordId);
    expect(soap ?? []).toHaveLength(0);
  });
});

describe("receptionist", () => {
  it("books an appointment", async () => {
    const starts = new Date(Date.now() + 259_200_000);
    const { error } = await receptionA.from("appointments").insert({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petA,
      doctor_id: doctorRecordA,
      service_id: serviceId,
      visit_type: "clinic",
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 30 * 60_000).toISOString(),
    });
    expect(error).toBeNull();
  });

  it("reads services, doctors and vaccination schedules", async () => {
    const { error: servicesErr } = await receptionA.from("services").select("id").limit(1);
    expect(servicesErr).toBeNull();

    const { error: doctorsErr } = await receptionA.from("doctors").select("id").limit(1);
    expect(doctorsErr).toBeNull();

    const { error: schedulesErr } = await receptionA.from("vaccination_schedules").select("id").limit(1);
    expect(schedulesErr).toBeNull();
  });

  it("reads a lab report to print it, but cannot change the result", async () => {
    const { data: tests } = await receptionA.from("diagnostics").select("id").eq("id", diagnosticId);
    expect(tests).toHaveLength(1);

    await receptionA.from("diagnostics").update({ result_notes: "Front desk edit" }).eq("id", diagnosticId);

    const { data: after } = await adminA.from("diagnostics").select("result_notes").eq("id", diagnosticId).single();
    expect(after!.result_notes).not.toBe("Front desk edit");
  });

  it("cannot reach money or record a vaccination", async () => {
    const { data: invoices } = await receptionA.from("invoices").select("id").eq("id", invoiceId);
    expect(invoices ?? []).toHaveLength(0);

    const { error } = await receptionA.from("vaccinations").insert({
      organization_id: orgA,
      pet_id: petA,
      vaccine_name: `Rabies ${RUN}`,
      administered_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("cannot write to the public website", async () => {
    const { error } = await receptionA
      .from("site_content")
      .insert({ organization_id: orgA, key: `rogue.${RUN}`, value: "x" });
    expect(error).not.toBeNull();
  });
});

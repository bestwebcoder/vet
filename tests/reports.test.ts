import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createOrganization, createUserWithRole, runId, signedInClient } from "./setup/http";
import { toCsv } from "@/lib/csv";

/**
 * Phase 8 · Checkpoint 1 — reporting functions and the reports permission.
 *
 * Every fixture here uses a fixed historical date range (March 2021), never
 * dates relative to "now" — every other test file in this suite creates
 * appointments/invoices dated close to the moment it runs, and a report
 * function sums *the whole organization*, not one fixture's own rows. A
 * historical window is the only way to keep these figures exact regardless
 * of what else is running in the same `npm run test` pass.
 */

describe("toCsv", () => {
  it("escapes commas, quotes and newlines", () => {
    const csv = toCsv([
      { title: "Section", columns: ["A", "B"], rows: [["plain", "has,comma"], ['has "quote"', "line\nbreak"]] },
    ]);

    expect(csv).toContain("Section");
    expect(csv).toContain("A,B");
    expect(csv).toContain("plain,\"has,comma\"");
    expect(csv).toContain('"has ""quote""",');
    expect(csv).toContain('"line\nbreak"');
  });
});

const RUN = runId();
const RANGE = { from: "2021-03-01", to: "2021-03-10" };
const BEFORE_RANGE = "2021-01-01";

let orgA: string;
let adminA: SupabaseClient;
let doctorA: SupabaseClient;
let reportsDoctorA: SupabaseClient;

let doctorRecordA: string;
let clientRecordA: string;
let clientRecordB: string;
let clientRecordC: string;
let petDog: string;
let petCat: string;

function at(dateIso: string, hour: number) {
  const starts = new Date(`${dateIso}T${String(hour).padStart(2, "0")}:00:00Z`);
  const ends = new Date(starts.getTime() + 30 * 60_000);
  return { starts_at: starts.toISOString(), ends_at: ends.toISOString() };
}

beforeAll(async () => {
  orgA = await createOrganization(`reports-${RUN}`);

  const [userA, userB, userC, vetA, vetReportsA, adminUser] = await Promise.all([
    createUserWithRole(`rep-a-${RUN}`, "client", orgA),
    createUserWithRole(`rep-b-${RUN}`, "client", orgA),
    createUserWithRole(`rep-c-${RUN}`, "client", orgA),
    createUserWithRole(`rep-vet-${RUN}`, "doctor", orgA),
    createUserWithRole(`rep-vet-reports-${RUN}`, "doctor", orgA),
    createUserWithRole(`rep-admin-${RUN}`, "admin", orgA),
  ]);

  const [{ data: clientA }, { data: clientB }, { data: clientC }, { data: doctorRow }] = await Promise.all([
    admin.from("clients").insert({ user_id: userA.userId, organization_id: orgA, full_name: `Rep Client A ${RUN}`, phone: `+88016${RUN}61` }).select("id").single(),
    admin.from("clients").insert({ user_id: userB.userId, organization_id: orgA, full_name: `Rep Client B ${RUN}`, phone: `+88016${RUN}62` }).select("id").single(),
    admin.from("clients").insert({ user_id: userC.userId, organization_id: orgA, full_name: `Rep Client C ${RUN}`, phone: `+88016${RUN}63` }).select("id").single(),
    admin.from("doctors").insert({ user_id: vetA.userId, organization_id: orgA }).select("id").single(),
    admin.from("doctors").insert({ user_id: vetReportsA.userId, organization_id: orgA, can_view_reports: true }),
  ]);

  clientRecordA = clientA!.id;
  clientRecordB = clientB!.id;
  clientRecordC = clientC!.id;
  doctorRecordA = doctorRow!.id;

  // A practice of our own starts with no services, and insertAppointment needs
  // one to point at.
  await admin.from("services").insert({ organization_id: orgA, name: `Report Base ${RUN}`, price_paisa: 1_000 });

  const { data: dogSpecies } = await admin.from("species").select("id").eq("slug", "dog").single();
  const { data: catSpecies } = await admin.from("species").select("id").eq("slug", "cat").single();

  const [{ data: dogPet }, { data: catPet }, { data: otherPet }] = await Promise.all([
    admin
      .from("pets")
      .insert({ client_id: clientRecordA, organization_id: orgA, name: `Rep Dog ${RUN}`, species_id: dogSpecies!.id, created_at: "2021-03-02T00:00:00Z" })
      .select("id")
      .single(),
    admin
      .from("pets")
      .insert({ client_id: clientRecordB, organization_id: orgA, name: `Rep Cat ${RUN}`, species_id: catSpecies!.id, created_at: "2021-03-02T00:00:00Z" })
      .select("id")
      .single(),
    admin
      .from("pets")
      .insert({ client_id: clientRecordC, organization_id: orgA, name: `Rep Other ${RUN}`, species_id: dogSpecies!.id, created_at: `${BEFORE_RANGE}T00:00:00Z` })
      .select("id")
      .single(),
  ]);
  petDog = dogPet!.id;
  petCat = catPet!.id;
  const petOther = otherPet!.id;

  async function insertAppointment(clientId: string, petId: string, dateIso: string, hour: number, overrides: Record<string, unknown> = {}) {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        organization_id: orgA,
        client_id: clientId,
        pet_id: petId,
        doctor_id: doctorRecordA,
        service_id: (await admin.from("services").select("id").eq("organization_id", orgA).limit(1).single()).data!.id,
        visit_type: "clinic",
        status: "completed",
        ...at(dateIso, hour),
        ...overrides,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  // clientA: an appointment before the range (their real first visit) plus
  // three inside it — makes them "returning," not "new."
  const apptA0 = await insertAppointment(clientRecordA, petDog, BEFORE_RANGE, 9);
  const apptA1 = await insertAppointment(clientRecordA, petDog, "2021-03-03", 9, { visit_type: "clinic" });
  const apptA2 = await insertAppointment(clientRecordA, petDog, "2021-03-04", 9, { visit_type: "follow_up" });
  const apptA4 = await insertAppointment(clientRecordA, petDog, "2021-03-05", 9, { visit_type: "emergency" });

  // clientB: only ever visits inside the range — "new."
  const apptB1 = await insertAppointment(clientRecordB, petCat, "2021-03-03", 10, { visit_type: "clinic" });

  // clientC: only ever visits before the range — not active in this range at all.
  await insertAppointment(clientRecordC, petOther, BEFORE_RANGE, 10);

  // Diagnoses — two identical, one different, one deliberately out of range.
  await admin.from("diagnoses").insert([
    { appointment_id: apptA1, pet_id: petDog, organization_id: orgA, kind: "final", description: "Otitis externa", created_at: "2021-03-03T09:30:00Z" },
    { appointment_id: apptA2, pet_id: petDog, organization_id: orgA, kind: "final", description: "Otitis externa", created_at: "2021-03-04T09:30:00Z" },
    { appointment_id: apptA4, pet_id: petDog, organization_id: orgA, kind: "final", description: "Skin allergy", created_at: "2021-03-05T09:30:00Z" },
    { appointment_id: apptA0, pet_id: petDog, organization_id: orgA, kind: "final", description: "Old issue", created_at: `${BEFORE_RANGE}T09:30:00Z` },
  ]);

  // One vaccination and one deworming in range, one vaccination out of range.
  await admin.from("vaccinations").insert([
    { appointment_id: apptA1, pet_id: petDog, organization_id: orgA, doctor_id: doctorRecordA, vaccine_name: "Rabies", date_administered: "2021-03-03" },
    { appointment_id: apptA0, pet_id: petDog, organization_id: orgA, doctor_id: doctorRecordA, vaccine_name: "Old shot", date_administered: BEFORE_RANGE },
  ]);
  await admin.from("deworming_records").insert({
    appointment_id: apptB1, pet_id: petCat, organization_id: orgA, doctor_id: doctorRecordA,
    product: "Praziquantel", date_administered: "2021-03-03", interval: "quarterly", next_due_date: "2021-06-03",
  });

  // Two fully-paid invoices, both attributed to the same doctor (via their
  // appointment), for a clean revenue-by-doctor reconciliation check.
  const { data: serviceOne } = await admin.from("services").insert({ organization_id: orgA, name: `Report Service A ${RUN}`, price_paisa: 100_000, tax_rate_percent: 5 }).select("id, name").single();
  const { data: serviceTwo } = await admin.from("services").insert({ organization_id: orgA, name: `Report Service B ${RUN}`, price_paisa: 50_000 }).select("id, name").single();

  async function issueAndPay(appointmentId: string, clientId: string, petId: string, service: { id: string; name: string }, unitPricePaisa: number, taxRatePercent: number, issuedAt: string) {
    const { data: invoice } = await admin
      .from("invoices")
      .insert({ organization_id: orgA, client_id: clientId, pet_id: petId, appointment_id: appointmentId })
      .select("id")
      .single();
    await admin.from("invoice_items").insert({
      invoice_id: invoice!.id, service_id: service.id, description: service.name,
      quantity: 1, unit_price_paisa: unitPricePaisa, tax_rate_percent: taxRatePercent, line_total_paisa: unitPricePaisa,
    });
    await admin.from("invoices").update({ status: "issued", issued_at: issuedAt }).eq("id", invoice!.id);
    const { data: totals } = await admin.from("invoices").select("total_paisa").eq("id", invoice!.id).single();
    await admin.from("payments").insert({ invoice_id: invoice!.id, organization_id: orgA, amount_paisa: totals!.total_paisa, method: "cash", paid_at: `${issuedAt}T12:00:00Z` });
    return invoice!.id;
  }

  await issueAndPay(apptA1, clientRecordA, petDog, serviceOne!, 100_000, 5, "2021-03-03");
  await issueAndPay(apptB1, clientRecordB, petCat, serviceTwo!, 50_000, 0, "2021-03-04");

  [adminA, doctorA, reportsDoctorA] = await Promise.all([
    signedInClient(adminUser.email),
    signedInClient(vetA.email),
    signedInClient(vetReportsA.email),
  ]);
}, 120_000);

describe("§8.6 — reports are gated by permission, not by table RLS", () => {
  it("blocks a plain doctor, allows a doctor granted access, always allows admin", async () => {
    const { error: plainErr } = await doctorA.rpc("report_clinical_summary", { p_organization_id: orgA, p_from: RANGE.from, p_to: RANGE.to });
    expect(plainErr).not.toBeNull();

    const { error: grantedErr } = await reportsDoctorA.rpc("report_clinical_summary", { p_organization_id: orgA, p_from: RANGE.from, p_to: RANGE.to });
    expect(grantedErr).toBeNull();

    const { error: adminErr } = await adminA.rpc("report_clinical_summary", { p_organization_id: orgA, p_from: RANGE.from, p_to: RANGE.to });
    expect(adminErr).toBeNull();
  });

  it("stops a doctor granting themselves report access", async () => {
    const { error } = await doctorA.from("doctors").update({ can_view_reports: true }).eq("id", doctorRecordA);
    expect(error).not.toBeNull();
  });
});

describe("§8.2 — clinical reports", () => {
  it("counts consultations, follow-ups and emergencies correctly for the range", async () => {
    const { data, error } = await adminA.rpc("report_clinical_summary", { p_organization_id: orgA, p_from: RANGE.from, p_to: RANGE.to }).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ consultations: 4, follow_ups: 1, emergencies: 1, vaccinations: 1, dewormings: 1 });
  });

  it("groups most common diagnoses by exact text, excluding rows outside the range", async () => {
    const { data, error } = await adminA.rpc("report_common_diagnoses", { p_organization_id: orgA, p_from: RANGE.from, p_to: RANGE.to, p_limit: 10 });
    expect(error).toBeNull();
    expect(data).toEqual([
      { description: "Otitis externa", occurrences: 2 },
      { description: "Skin allergy", occurrences: 1 },
    ]);
  });
});

describe("§8.3 — client reports", () => {
  it("distinguishes new, returning and active clients", async () => {
    const { data, error } = await adminA.rpc("report_client_summary", { p_organization_id: orgA, p_from: RANGE.from, p_to: RANGE.to }).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ new_clients: 1, returning_clients: 1, active_clients: 2 });
  });
});

describe("§8.4 — patient reports", () => {
  it("breaks patients down by species, excluding one created outside the range", async () => {
    const { data, error } = await adminA.rpc("report_patient_species_breakdown", { p_organization_id: orgA, p_from: RANGE.from, p_to: RANGE.to });
    expect(error).toBeNull();
    const bySpecies = Object.fromEntries((data ?? []).map((row: { species_name: string; count: number }) => [row.species_name, row.count]));
    expect(bySpecies.Dog).toBe(1);
    expect(bySpecies.Cat).toBe(1);
  });

  it("ranks the most frequently visited patient first", async () => {
    const { data, error } = await adminA.rpc("report_frequent_patients", { p_organization_id: orgA, p_from: RANGE.from, p_to: RANGE.to, p_limit: 10 });
    expect(error).toBeNull();
    expect(data[0]).toMatchObject({ pet_id: petDog, visit_count: 3 });
    expect(data.find((row: { pet_id: string }) => row.pet_id === petCat)).toMatchObject({ visit_count: 1 });
  });
});

describe("§8.1 — financial reports", () => {
  it("computes paid/outstanding totals for the range", async () => {
    const { data, error } = await adminA.rpc("report_revenue_totals", { p_organization_id: orgA, p_from: RANGE.from, p_to: RANGE.to }).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ paid_paisa: 155_000, paid_count: 2, outstanding_paisa: 0, outstanding_count: 0 });
  });

  it("breaks billed revenue down by service", async () => {
    const { data, error } = await adminA.rpc("report_revenue_by_service", { p_organization_id: orgA, p_from: RANGE.from, p_to: RANGE.to });
    expect(error).toBeNull();
    const total = (data ?? []).reduce((sum: number, row: { revenue_paisa: number }) => sum + row.revenue_paisa, 0);
    expect(total).toBe(150_000); // pre-tax line totals: 100,000 + 50,000
  });

  it("reconciles revenue-by-doctor against the collected total for the same paid invoices", async () => {
    const { data, error } = await adminA.rpc("report_revenue_by_doctor", { p_organization_id: orgA, p_from: RANGE.from, p_to: RANGE.to });
    expect(error).toBeNull();
    const total = (data ?? []).reduce((sum: number, row: { revenue_paisa: number }) => sum + row.revenue_paisa, 0);
    expect(total).toBe(155_000); // invoice totals, tax included — matches report_revenue_totals.paid_paisa
  });

  it("buckets a daily revenue series correctly", async () => {
    const { data, error } = await adminA.rpc("report_revenue_series", { p_organization_id: orgA, p_from: RANGE.from, p_to: RANGE.to, p_granularity: "day" });
    expect(error).toBeNull();
    const byDay = Object.fromEntries((data ?? []).map((row: { period_start: string; revenue_paisa: number }) => [row.period_start, row.revenue_paisa]));
    expect(byDay["2021-03-03"]).toBe(105_000);
    expect(byDay["2021-03-04"]).toBe(50_000);
  });
});

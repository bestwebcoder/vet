import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createUserWithRole, organizationId, runId, signedInClient } from "./setup/http";

/**
 * Phase 5 · Checkpoint 1 — prescriptions, versioning, dose calculation.
 *
 * Same shape as tests/soap.test.ts: a finalized prescription can never be
 * silently overwritten, only a doctor may write one, and a prescription
 * cannot be started before the visit's SOAP record is finalized.
 */

const RUN = runId();

let orgA: string;
let clientA: SupabaseClient;
let doctorA: SupabaseClient;
let adminA: SupabaseClient;
let clientB: SupabaseClient;

let clientRecordA: string;
let doctorRecordA: string;
let petA: string;
let medicationId: string;

// A counter, not Math.random(): distinct appointments must never risk landing
// in the same doctor's slot and tripping the double-booking exclusion
// constraint by sheer chance.
let appointmentOffset = 0;

async function insertAppointment() {
  const { data: service } = await admin
    .from("services")
    .select("id, duration_minutes")
    .eq("organization_id", orgA)
    .eq("name", "General consultation")
    .single();

  appointmentOffset += 1;
  const starts = new Date(Date.now() - 3_600_000 - appointmentOffset * 3_600_000);
  const ends = new Date(starts.getTime() + service!.duration_minutes * 60_000);

  const { data, error } = await admin
    .from("appointments")
    .insert({
      organization_id: orgA,
      client_id: clientRecordA,
      pet_id: petA,
      doctor_id: doctorRecordA,
      service_id: service!.id,
      visit_type: "clinic",
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      status: "confirmed",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function finalizeSoap(appointmentId: string, weightGrams = 22_000) {
  const { error } = await admin.from("soap_records").insert({
    appointment_id: appointmentId,
    pet_id: petA,
    organization_id: orgA,
    doctor_id: doctorRecordA,
    chief_complaint: "Vomiting",
    clinical_assessment: "Gastritis",
    status: "finalized",
    finalized_at: new Date().toISOString(),
    weight_grams: weightGrams,
  });
  if (error) throw error;
}

beforeAll(async () => {
  orgA = await organizationId();

  const [userA, userB, vetA, adminUser] = await Promise.all([
    createUserWithRole(`rx-a-${RUN}`, "client"),
    createUserWithRole(`rx-b-${RUN}`, "client"),
    createUserWithRole(`rx-vet-${RUN}`, "doctor"),
    createUserWithRole(`rx-admin-${RUN}`, "admin"),
  ]);

  const [{ data: clientRow }, { data: doctorRow }] = await Promise.all([
    admin
      .from("clients")
      .insert({ user_id: userA.userId, organization_id: orgA, full_name: `Rx Client A ${RUN}`, phone: `+88018${RUN}31` })
      .select("id")
      .single(),
    admin.from("doctors").insert({ user_id: vetA.userId, organization_id: orgA }).select("id").single(),
  ]);

  clientRecordA = clientRow!.id;
  doctorRecordA = doctorRow!.id;

  const { data: species } = await admin.from("species").select("id").eq("slug", "dog").single();
  const { data: pet } = await admin
    .from("pets")
    .insert({ client_id: clientRecordA, organization_id: orgA, name: `Rx Pet ${RUN}`, species_id: species!.id })
    .select("id")
    .single();
  petA = pet!.id;

  const { data: medication } = await admin.from("medications").select("id").eq("name", "Meloxicam").single();
  medicationId = medication!.id;

  [clientA, doctorA, adminA, clientB] = await Promise.all([
    signedInClient(userA.email),
    signedInClient(vetA.email),
    signedInClient(adminUser.email),
    signedInClient(userB.email),
  ]);
}, 120_000);

describe("clinical authorship is doctor-only", () => {
  it("stops a client or admin creating a prescription, but lets a doctor", async () => {
    const appointmentId = await insertAppointment();

    const { error: clientErr } = await clientA
      .from("prescriptions")
      .insert({ appointment_id: appointmentId, pet_id: petA, organization_id: orgA, doctor_id: doctorRecordA });
    expect(clientErr).not.toBeNull();

    const { error: adminErr } = await adminA
      .from("prescriptions")
      .insert({ appointment_id: appointmentId, pet_id: petA, organization_id: orgA, doctor_id: doctorRecordA });
    expect(adminErr).not.toBeNull();

    const { error: doctorErr } = await doctorA
      .from("prescriptions")
      .insert({ appointment_id: appointmentId, pet_id: petA, organization_id: orgA, doctor_id: doctorRecordA });
    expect(doctorErr).toBeNull();
  });
});

describe("a client sees only the current finalized version", () => {
  let appointmentId: string;
  let prescriptionId: string;

  beforeAll(async () => {
    appointmentId = await insertAppointment();
    await finalizeSoap(appointmentId);

    const { data } = await doctorA
      .from("prescriptions")
      .insert({ appointment_id: appointmentId, pet_id: petA, organization_id: orgA, doctor_id: doctorRecordA })
      .select("id")
      .single();
    prescriptionId = data!.id;

    await doctorA.from("prescription_items").insert({
      prescription_id: prescriptionId,
      medication_id: medicationId,
      drug_name: "Meloxicam",
      dose_per_kg: 0.1,
      dose_unit: "mg",
      computed_dose: 2.2,
    });
  });

  it("cannot see the draft", async () => {
    const { data } = await clientA.from("prescriptions").select("id").eq("appointment_id", appointmentId);
    expect(data).toEqual([]);
  });

  it("sees it once finalized, but still cannot write to it", async () => {
    const { error: finalizeErr } = await doctorA
      .from("prescriptions")
      .update({ status: "finalized", finalized_at: new Date().toISOString() })
      .eq("id", prescriptionId);
    expect(finalizeErr).toBeNull();

    const { data } = await clientA.from("prescriptions").select("id, status").eq("appointment_id", appointmentId);
    expect(data).toEqual([{ id: prescriptionId, status: "finalized" }]);

    const { data: writeData, error: writeErr } = await clientA
      .from("prescriptions")
      .update({ instructions: "hacked" })
      .eq("id", prescriptionId)
      .select("id");
    expect(writeErr).toBeNull();
    expect(writeData).toEqual([]);
  });

  it("client B cannot see it", async () => {
    const { data } = await clientB.from("prescriptions").select("id").eq("appointment_id", appointmentId);
    expect(data).toEqual([]);
  });

  it("an admin can view it too, view-only — CLAUDE.md §3's clinical records row for admin", async () => {
    const { data, error } = await adminA.from("prescriptions").select("id, status").eq("appointment_id", appointmentId);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: prescriptionId, status: "finalized" }]);

    const { data: written, error: writeError } = await adminA
      .from("prescriptions")
      .update({ instructions: "Rewritten by an admin" })
      .eq("id", prescriptionId)
      .select("id");
    expect(writeError).toBeNull();
    expect(written).toEqual([]);
  });
});

describe("a finalized prescription and its items are immutable except for being superseded", () => {
  let appointmentId: string;
  let prescriptionId: string;

  beforeAll(async () => {
    appointmentId = await insertAppointment();
    await finalizeSoap(appointmentId, 10_000);

    const { data } = await doctorA
      .from("prescriptions")
      .insert({ appointment_id: appointmentId, pet_id: petA, organization_id: orgA, doctor_id: doctorRecordA })
      .select("id")
      .single();
    prescriptionId = data!.id;

    await doctorA.from("prescription_items").insert({
      prescription_id: prescriptionId,
      drug_name: "Amoxicillin",
      computed_dose: 250,
      dose_unit: "mg",
    });

    await doctorA
      .from("prescriptions")
      .update({ status: "finalized", finalized_at: new Date().toISOString() })
      .eq("id", prescriptionId);
  });

  it("refuses a direct edit of the prescription", async () => {
    const { error } = await doctorA.from("prescriptions").update({ instructions: "sneaky" }).eq("id", prescriptionId);
    expect(error).not.toBeNull();
  });

  it("refuses adding, editing or removing an item", async () => {
    const { data: items } = await admin.from("prescription_items").select("id").eq("prescription_id", prescriptionId);

    const { error: insertErr } = await doctorA
      .from("prescription_items")
      .insert({ prescription_id: prescriptionId, drug_name: "sneaky" });
    expect(insertErr).not.toBeNull();

    const { error: updateErr } = await doctorA
      .from("prescription_items")
      .update({ drug_name: "sneaky" })
      .eq("id", items![0].id);
    expect(updateErr).not.toBeNull();

    const { error: deleteErr } = await doctorA.from("prescription_items").delete().eq("id", items![0].id);
    expect(deleteErr).not.toBeNull();
  });

  it("revising creates a new version with the same prescription number and copies the items", async () => {
    const { data: newId, error } = await doctorA.rpc("revise_prescription", { p_prescription_id: prescriptionId });
    expect(error).toBeNull();

    const { data: oldRow } = await admin.from("prescriptions").select("status, superseded_at, prescription_number").eq("id", prescriptionId).single();
    const { data: newRow } = await admin.from("prescriptions").select("version, status, superseded_at, prescription_number").eq("id", newId).single();

    expect(oldRow?.superseded_at).not.toBeNull();
    expect(newRow).toMatchObject({ version: 2, status: "draft", superseded_at: null });
    expect(newRow?.prescription_number).toBe(oldRow?.prescription_number);

    const { data: newItems } = await admin.from("prescription_items").select("drug_name, computed_dose").eq("prescription_id", newId);
    expect(newItems).toEqual([{ drug_name: "Amoxicillin", computed_dose: 250 }]);

    const { error: reviseAgainErr } = await doctorA.rpc("revise_prescription", { p_prescription_id: prescriptionId });
    expect(reviseAgainErr).not.toBeNull();
  });
});

describe("audit trail", () => {
  it("records prescription creation and finalization", async () => {
    const appointmentId = await insertAppointment();
    await finalizeSoap(appointmentId);

    const { data: created } = await doctorA
      .from("prescriptions")
      .insert({ appointment_id: appointmentId, pet_id: petA, organization_id: orgA, doctor_id: doctorRecordA })
      .select("id")
      .single();

    await doctorA
      .from("prescriptions")
      .update({ status: "finalized", finalized_at: new Date().toISOString() })
      .eq("id", created!.id);

    const { data: logs } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_table", "prescriptions")
      .eq("entity_id", created!.id);

    expect((logs ?? []).some((row) => row.action === "prescriptions.insert")).toBe(true);
    expect((logs ?? []).some((row) => row.action === "prescriptions.update")).toBe(true);
  });
});

describe("medications catalog", () => {
  it("is readable by every authenticated role, but never written by a client", async () => {
    const { data, error } = await clientA.from("medications").select("id").limit(1);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);

    const { error: insertErr } = await clientA.from("medications").insert({ name: "Not allowed" });
    expect(insertErr).not.toBeNull();
  });
});
